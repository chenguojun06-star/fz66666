import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Segmented, Space, Switch, Tag, Tooltip, Typography } from 'antd';
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
  const [listingFilter, setListingFilter] = useState<string>('all');

  // 订单
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderStatus, setOrderStatus] = useState<string>('');
  const [orderKw, setOrderKw] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);

  // 发货弹窗（D-513：此前订单无任何发货入口，待发货订单永远发不出去）
  const [shipTarget, setShipTarget] = useState<ShopOrder | null>(null);
  const [shipCompany, setShipCompany] = useState('');
  const [shipNo, setShipNo] = useState('');
  const [shipSubmitting, setShipSubmitting] = useState(false);

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
      // 注意：后端 keyword 才对 款号/款名/品类 做 OR 模糊匹配；
      // 同时传 styleName+styleNo 会被 AND 起来，等于搜不到。
      const res: any = await api.get('/style/info/list', {
        params: { keyword: kw || undefined, page: 1, pageSize: 50 },
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

  /**
   * D-513：订单发货。C 端下单时已扣库存/挂应收，商家只需登记发货信息把订单推进到「已发货」。
   * 快递公司与单号选填（自提/同城配送可不填）。
   */
  const handleShip = async () => {
    if (!shipTarget) return;
    setShipSubmitting(true);
    try {
      await shopAdminApi.shipOrder(shipTarget.id, {
        expressCompany: shipCompany.trim() || undefined,
        expressNo: shipNo.trim() || undefined,
      });
      message.success(`订单 ${shipTarget.orderNo} 已发货`);
      setShipTarget(null);
      setShipCompany('');
      setShipNo('');
      void fetchOrders(orderPage);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发货失败');
    } finally {
      setShipSubmitting(false);
    }
  };

  const shopUrl = config ? `${window.location.origin}/shop/index.html?s=${config.slug}` : '';
  const listedCount = useMemo(() => styles.filter((s) => s.shopListed === 1).length, [styles]);
  const shownStyles = useMemo(() => {
    if (listingFilter === 'listed') return styles.filter((s) => s.shopListed === 1);
    if (listingFilter === 'unlisted') return styles.filter((s) => s.shopListed !== 1);
    return styles;
  }, [styles, listingFilter]);

  /** 电脑上打开店铺：固定开一个手机尺寸窗口，避免被拉成全屏巨幅 */
  const openShop = () => {
    if (!shopUrl) return;
    window.open(shopUrl, 'shopPreview', 'width=430,height=900,left=200,top=60');
  };

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
      width: 110,
      render: (_, r) =>
        r.shopListed === 1 ? (
          <Tag color="orange">已上架</Tag>
        ) : (
          <Tag>未上架</Tag>
        ),
    },
    {
      title: '操作',
      width: 130,
      align: 'right',
      render: (_, r) =>
        r.shopListed === 1 ? (
          <Button size="small" danger onClick={() => void handleToggleListing(r, false)}>下架</Button>
        ) : (
          <Button size="small" type="primary" onClick={() => void handleToggleListing(r, true)}>上架到店铺</Button>
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
    {
      title: '快递',
      width: 170,
      render: (_, r) =>
        r.status === 'SHIPPED' && (r.expressNo || r.expressCompany) ? (
          <Text className="u-fs-12">
            {r.expressCompany ? `${r.expressCompany} ` : ''}
            {r.expressNo || ''}
          </Text>
        ) : (
          <Text type="secondary" className="u-fs-12">-</Text>
        ),
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right' as const,
      render: (_, r) =>
        r.status === 'PENDING_SHIP' ? (
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setShipTarget(r);
              setShipCompany('');
              setShipNo('');
            }}
          >
            发货
          </Button>
        ) : (
          <Text type="secondary" className="u-fs-12">
            {r.status === 'SHIPPED' ? '已发货' : '已取消'}
          </Text>
        ),
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
          <Button type="primary" icon={<ExportOutlined />} disabled={!shopUrl} onClick={openShop}>
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
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="怎么上架：在下面找到款式，点右侧「上架到店铺」——顾客马上就能在店铺里看到并下单"
            description={
              <span style={{ fontSize: 12.5 }}>
                商品在店铺里显示的价格 = 该款 SKU 的「售价」，可售数量 = SKU 库存；
                如果显示 ¥— 或「已售罄」，说明款式还没维护 SKU 售价 / 库存。
                列表里「封面」是灰块也说明该款没传封面图，去「款式资料」补封面、售价、库存后再上架。
              </span>
            }
          />
          <div className="shop-toolbar">
            <Input.Search
              allowClear
              style={{ width: 280 }}
              placeholder="输入款号 / 款名 / 品类后回车"
              defaultValue={styleKw}
              onSearch={(v) => {
                setStyleKw(v);
                void fetchStyles(v);
              }}
              enterButton
            />
            <Segmented
              value={listingFilter}
              onChange={(v) => setListingFilter(String(v))}
              options={[
                { value: 'all', label: '全部' },
                { value: 'listed', label: '已上架' },
                { value: 'unlisted', label: '未上架' },
              ]}
            />
            <div className="shop-toolbar__spacer" />
            <Text type="secondary">
              共 {styles.length} 款，已上架 <Text strong style={{ color: 'var(--color-warning)' }}>{listedCount}</Text> 款
            </Text>
            <Tooltip title="重新拉取款式列表">
              <Button icon={<ReloadOutlined />} onClick={() => void fetchStyles(styleKw)}>刷新</Button>
            </Tooltip>
          </div>
          <ResizableTable
            rowKey="id"
            size="small"
            columns={styleColumns}
            dataSource={shownStyles}
            loading={styleLoading}
            pagination={{ pageSize: 10, showTotal: (t) => `共 ${t} 条` }}
            emptyDescription={
              styles.length === 0
                ? '没有查到款式，换个款号或款名试试'
                : listingFilter === 'listed'
                  ? '还没有上架的款式，去「全部」里点上架'
                  : '该筛选下没有款式'
            }
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

      <Modal
        title="订单发货"
        open={!!shipTarget}
        onOk={() => void handleShip()}
        confirmLoading={shipSubmitting}
        onCancel={() => setShipTarget(null)}
        okText="确认发货"
        destroyOnHidden
      >
        {shipTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Text type="secondary">
              订单 {shipTarget.orderNo} · {shipTarget.customerName} · {shipTarget.phone}
            </Text>
            <Text type="secondary" className="u-fs-12">
              收货地址：{shipTarget.address}
            </Text>
            <div>
              <div style={{ marginBottom: 4 }}>快递公司</div>
              <Input
                value={shipCompany}
                onChange={(e) => setShipCompany(e.target.value)}
                placeholder="如：顺丰 / 中通 / 圆通（自提可留空）"
                maxLength={32}
              />
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>快递单号</div>
              <Input
                value={shipNo}
                onChange={(e) => setShipNo(e.target.value)}
                placeholder="快递单号（自提/同城配送可留空）"
                maxLength={32}
              />
            </div>
            <Text type="secondary" className="u-fs-12">
              库存与应收在下单时已自动处理，此处只登记发货信息，确认后订单转为「已发货」。
            </Text>
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default ShopManage;