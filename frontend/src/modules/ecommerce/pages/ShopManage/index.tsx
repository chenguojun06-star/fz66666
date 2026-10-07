import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Segmented, Space, Switch, Tag, Tooltip, Typography } from 'antd';
import {
  CopyOutlined,
  ExportOutlined,
  LinkOutlined,
  ReloadOutlined,
  ShopOutlined,
  ShoppingOutlined,
  MobileOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import shopAdminApi from '@/services/shop/shopApi';
import type { ShopConfig, ShopOrder } from '@/services/shop/shopApi';
import api from '@/utils/api';
import './index.css';

const { Text, Paragraph } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING_SHIP: { label: '待发货', color: 'orange' },
  SHIPPED: { label: '已发货', color: 'green' },
  CANCELLED: { label: '已取消', color: 'default' },
};

interface StyleRow {
  id: number;
  styleNo: string;
  styleName: string;
  cover?: string;
  shopListed?: number;
}

/**
 * D-763：店铺管理——配置（名称/公告/打烊）/ 款式上架开关 / 店铺订单。
 * 店铺门面：/shop/index.html?s={slug}（游客免登录，淘宝风格手机端页面）。
 */
const ShopManage: React.FC = () => {
  const [tab, setTab] = useState<string>('config');

  // 配置
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [shopName, setShopName] = useState('');
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // 款式上架
  const [styleKw, setStyleKw] = useState('');
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [styleLoading, setStyleLoading] = useState(false);

  // 订单
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [orderKw, setOrderKw] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const res: any = await shopAdminApi.getConfig();
      const cfg = res?.data ?? res;
      setConfig(cfg);
      setShopName(cfg?.shopName || '');
      setNotice(cfg?.notice || '');
      setEnabled(cfg?.enabled === 1);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '店铺配置加载失败');
    }
  }, []);

  const fetchStyles = useCallback(async (kw: string) => {
    setStyleLoading(true);
    try {
      const res: any = await api.get('/style/info/list', {
        params: { styleName: kw || undefined, styleNo: kw || undefined, page: 1, pageSize: 20 },
      });
      const data = res?.data?.records ?? res?.data ?? [];
      setStyles(Array.isArray(data) ? data : []);
    } catch {
      setStyles([]);
    } finally {
      setStyleLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async (p: number, status?: string, keyword?: string) => {
    setOrderLoading(true);
    try {
      const res: any = await shopAdminApi.orders({
        page: p,
        pageSize: 20,
        status: (status ?? orderStatus) || undefined,
        keyword: (keyword ?? orderKw) || undefined,
      });
      const data = res?.data ?? res;
      setOrders(data?.records ?? []);
      setOrderTotal(data?.total ?? 0);
      setOrderPage(p);
    } catch {
      setOrders([]);
    } finally {
      setOrderLoading(false);
    }
  }, [orderStatus, orderKw]);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleTabChange = useCallback((v: string) => {
    setTab(v);
    // 页签数据在切入时拉取（事件驱动，避免 effect 依赖棘轮豁免）
    if (v === 'listing') void fetchStyles(styleKw);
    if (v === 'orders') void fetchOrders(1);
  }, [fetchStyles, styleKw, fetchOrders]);

  const handleSaveConfig = async () => {
    if (!shopName.trim()) return message.warning('店铺名称不能为空');
    setSaving(true);
    try {
      await shopAdminApi.saveConfig({ shopName: shopName.trim(), notice: notice.trim(), enabled });
      message.success('店铺配置已保存，顾客端即时生效');
      await fetchConfig();
      setPreviewKey((k) => k + 1);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleListing = async (row: StyleRow, listed: boolean) => {
    try {
      await shopAdminApi.setListing(row.id, listed);
      message.success(`「${row.styleName || row.styleNo}」已${listed ? '上架' : '下架'}`);
      setStyles((prev) => prev.map((s) => (s.id === row.id ? { ...s, shopListed: listed ? 1 : 0 } : s)));
      setPreviewKey((k) => k + 1);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const shopUrl = config ? `${window.location.origin}/shop/index.html?s=${config.slug}` : '';
  const listedCount = useMemo(() => styles.filter((s) => s.shopListed === 1).length, [styles]);

  const copyLink = async () => {
    if (!shopUrl) return;
    try {
      await navigator.clipboard.writeText(shopUrl);
      message.success('店铺链接已复制，发给顾客即可开店营业');
    } catch {
      message.warning('复制失败，请手动复制：' + shopUrl);
    }
  };

  const styleColumns: ColumnsType<StyleRow> = [
    {
      title: '封面',
      width: 78,
      render: (_, r) =>
        r.cover ? (
          <img src={r.cover} alt="" className="shop-cell-cover" />
        ) : (
          <div className="shop-cell-cover shop-cell-cover--empty"><ShoppingOutlined /></div>
        ),
    },
    { title: '款号', dataIndex: 'styleNo', width: 130 },
    { title: '款名', dataIndex: 'styleName', ellipsis: true },
    {
      title: '店铺状态',
      width: 130,
      render: (_, r) =>
        r.shopListed === 1 ? <Tag color="orange">已上架</Tag> : <Tag>未上架</Tag>,
    },
    {
      title: '操作',
      width: 120,
      align: 'right',
      render: (_, r) => (
        <Switch
          checked={r.shopListed === 1}
          checkedChildren="上架"
          unCheckedChildren="下架"
          onChange={(v) => void handleToggleListing(r, v)}
        />
      ),
    },
  ];

  const orderColumns: ColumnsType<ShopOrder> = [
    { title: '订单号', dataIndex: 'orderNo', width: 175, render: (v: string) => <Text copyable={{ text: v }}>{v}</Text> },
    { title: '收货人', dataIndex: 'customerName', width: 110 },
    { title: '电话', dataIndex: 'phone', width: 125 },
    { title: '地址', dataIndex: 'address', ellipsis: true },
    {
      title: '金额',
      dataIndex: 'totalAmount',
      width: 110,
      align: 'right',
      render: (v: number) => <Text className="shop-amount">¥ {Number(v).toFixed(2)}</Text>,
    },
    { title: '件数', dataIndex: 'itemCount', width: 70, align: 'center' },
    {
      title: '状态',
      dataIndex: 'status',
      width: 95,
      render: (v: string) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? v}</Tag>,
    },
    {
      title: '下单时间',
      dataIndex: 'createTime',
      width: 165,
      render: (v: string) => (v || '').replace('T', ' ').slice(0, 19),
    },
  ];

  return (
    <div className="shop-manage">
      <div className="shop-manage__hero">
        <div className="shop-manage__hero-main">
          <div className="shop-manage__title">
            <ShopOutlined />
            <span>{shopName || '店铺管理'}</span>
            {config && (enabled ? <Tag color="orange">营业中</Tag> : <Tag>已打烊</Tag>)}
          </div>
          <Text type="secondary" className="shop-manage__desc">
            C 端零售店铺：顾客打开链接即可浏览下单（免登录），订单自动扣库存、挂应收、进收付款中心
          </Text>
        </div>
        <Space>
          <Button icon={<CopyOutlined />} onClick={() => void copyLink()} disabled={!shopUrl}>复制店铺链接</Button>
          <Button type="primary" icon={<ExportOutlined />} disabled={!shopUrl} onClick={() => shopUrl && window.open(shopUrl, '_blank')}>
            打开店铺
          </Button>
        </Space>
      </div>

      <Segmented
        className="shop-manage__tabs"
        value={tab}
        onChange={handleTabChange}
        options={[
          { value: 'config', label: '店铺配置' },
          { value: 'listing', label: '商品上架' },
          { value: 'orders', label: '店铺订单' },
        ]}
      />

      {tab === 'config' && (
        <div className="shop-config">
          <Card title="店铺设置" className="shop-config__form">
            <div className="shop-field">
              <label>店铺名称 <span className="req">*</span></label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="顾客看到的店名" maxLength={64} showCount />
            </div>
            <div className="shop-field">
              <label>店铺公告</label>
              <Input.TextArea
                value={notice}
                onChange={(e) => setNotice(e.target.value)}
                placeholder="如：满 10 件包邮 / 下单后 48 小时内发货"
                maxLength={200}
                showCount
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
            <div className="shop-field shop-field--inline">
              <Switch checked={enabled} onChange={setEnabled} />
              <div>
                <div className="shop-field__label">{enabled ? '营业中' : '已打烊'}</div>
                <Text type="secondary" className="shop-field__hint">
                  {enabled ? '顾客可以正常下单' : '顾客只能浏览，无法下单'}
                </Text>
              </div>
            </div>
            <div className="shop-field">
              <label>店铺链接</label>
              <Paragraph className="shop-url" copyable={{ text: shopUrl }}>
                <LinkOutlined /> {shopUrl || '加载中…'}
              </Paragraph>
            </div>
            <Button type="primary" loading={saving} onClick={() => void handleSaveConfig()}>保存配置</Button>
          </Card>

          <Card
            title={<span><MobileOutlined /> 顾客端实时预览</span>}
            className="shop-config__preview"
            extra={
              <Tooltip title="刷新预览">
                <Button type="text" size="small" icon={<ReloadOutlined />} onClick={() => setPreviewKey((k) => k + 1)} />
              </Tooltip>
            }
          >
            {shopUrl ? (
              <div className="shop-phone">
                <iframe key={previewKey} src={shopUrl} title="店铺预览" className="shop-phone__frame" />
              </div>
            ) : (
              <Empty description="加载中…" />
            )}
            <Text type="secondary" className="shop-config__tip">
              预览为真实顾客页面，保存配置或上下架后自动刷新
            </Text>
          </Card>
        </div>
      )}

      {tab === 'listing' && (
        <Card>
          <div className="shop-toolbar">
            <Input
              allowClear
              style={{ width: 280 }}
              prefix={<ShoppingOutlined />}
              placeholder="按款名 / 款号搜索"
              value={styleKw}
              onChange={(e) => setStyleKw(e.target.value)}
              onPressEnter={() => void fetchStyles(styleKw)}
            />
            <Button type="primary" onClick={() => void fetchStyles(styleKw)}>搜索</Button>
            <div className="shop-toolbar__spacer" />
            <Text type="secondary">本页已上架 {listedCount} / {styles.length} 款</Text>
          </div>
          <ResizableTable
            rowKey="id"
            size="small"
            columns={styleColumns}
            dataSource={styles}
            loading={styleLoading}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
            emptyDescription="没有找到款式"
          />
        </Card>
      )}

      {tab === 'orders' && (
        <Card>
          <div className="shop-toolbar">
            <Segmented
              value={orderStatus}
              onChange={(v) => {
                const s = String(v);
                setOrderStatus(s);
                void fetchOrders(1, s, orderKw);
              }}
              options={[
                { value: '', label: '全部' },
                { value: 'PENDING_SHIP', label: '待发货' },
                { value: 'SHIPPED', label: '已发货' },
                { value: 'CANCELLED', label: '已取消' },
              ]}
            />
            <Input.Search
              allowClear
              style={{ width: 260 }}
              placeholder="订单号 / 收货人 / 电话"
              value={orderKw}
              onChange={(e) => setOrderKw(e.target.value)}
              onSearch={(v) => void fetchOrders(1, orderStatus, v)}
            />
          </div>
          <ResizableTable
            rowKey="id"
            size="small"
            columns={orderColumns}
            dataSource={orders}
            loading={orderLoading}
            pagination={{
              current: orderPage,
              total: orderTotal,
              pageSize: 20,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p) => void fetchOrders(p),
            }}
            emptyDescription="还没有店铺订单"
          />
        </Card>
      )}
    </div>
  );
};

export default ShopManage;