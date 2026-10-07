import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Input, Segmented, Space, Switch, Table, Tag, Typography } from 'antd';
import { CopyOutlined, ShopOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import { message } from '@/utils/antdStatic';
import shopAdminApi from '@/services/shop/shopApi';
import type { ShopConfig, ShopOrder } from '@/services/shop/shopApi';
import api from '@/utils/api';

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
 * 店铺门面：/shop/index.html?s={slug}（游客免登录）。
 */
const ShopManage: React.FC = () => {
  const { message: appMessage } = App.useApp();
  const [tab, setTab] = useState<string>('config');

  // 配置
  const [config, setConfig] = useState<ShopConfig | null>(null);
  const [shopName, setShopName] = useState('');
  const [notice, setNotice] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  // 款式上架
  const [styleKw, setStyleKw] = useState('');
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [styleLoading, setStyleLoading] = useState(false);

  // 订单
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
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

  const fetchOrders = useCallback(async (p: number) => {
    setOrderLoading(true);
    try {
      const res: any = await shopAdminApi.orders({ page: p, pageSize: 20 });
      const data = res?.data ?? res;
      setOrders(data?.records ?? []);
      setOrderTotal(data?.total ?? 0);
      setOrderPage(p);
    } catch {
      setOrders([]);
    } finally {
      setOrderLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleTabChange = useCallback((v: string) => {
    setTab(v);
    // D-763：页签数据在切入时拉取（事件驱动，避免 effect 依赖棘轮豁免）
    if (v === 'listing') void fetchStyles(styleKw);
    if (v === 'orders') void fetchOrders(1);
  }, [fetchStyles, styleKw, fetchOrders]);

  const handleSaveConfig = async () => {
    if (!shopName.trim()) return appMessage.warning('店铺名称不能为空');
    setSaving(true);
    try {
      await shopAdminApi.saveConfig({ shopName: shopName.trim(), notice: notice.trim(), enabled });
      appMessage.success('店铺配置已保存');
      await fetchConfig();
    } catch (e: unknown) {
      appMessage.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleListing = async (row: StyleRow, listed: boolean) => {
    try {
      await shopAdminApi.setListing(row.id, listed);
      appMessage.success(`「${row.styleName || row.styleNo}」已${listed ? '上架' : '下架'}`);
      setStyles((prev) => prev.map((s) => (s.id === row.id ? { ...s, shopListed: listed ? 1 : 0 } : s)));
    } catch (e: unknown) {
      appMessage.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const shopUrl = config ? `${window.location.origin}/shop/index.html?s=${config.slug}` : '';

  const styleColumns: ColumnsType<StyleRow> = [
    { title: '封面', width: 70, render: (_, r) => (r.cover ? <img src={r.cover} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6 }} alt="" /> : '-'), },
    { title: '款号', dataIndex: 'styleNo', width: 120 },
    { title: '款名', dataIndex: 'styleName', width: 180 },
    {
      title: '店铺上架',
      width: 110,
      render: (_, r) => (
        <Switch
          checked={r.shopListed === 1}
          onChange={(v) => void handleToggleListing(r, v)}
        />
      ),
    },
  ];

  const orderColumns: ColumnsType<ShopOrder> = [
    { title: '订单号', dataIndex: 'orderNo', width: 170 },
    { title: '收货人', dataIndex: 'customerName', width: 110 },
    { title: '电话', dataIndex: 'phone', width: 130 },
    { title: '地址', dataIndex: 'address', ellipsis: true },
    { title: '金额', dataIndex: 'totalAmount', width: 100, align: 'right', render: (v: number) => <Text strong>¥ {Number(v).toFixed(2)}</Text> },
    { title: '件数', dataIndex: 'itemCount', width: 70, align: 'center' },
    { title: '状态', dataIndex: 'status', width: 90, render: (v: string) => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? v}</Tag> },
    { title: '下单时间', dataIndex: 'createTime', width: 160, render: (v: string) => (v || '').replace('T', ' ').slice(0, 19) },
  ];

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShopOutlined />
          店铺管理
        </h3>
        <Text type="secondary" style={{ fontSize: 13 }}>
          C端零售店铺：顾客打开链接即可浏览下单（免登录），订单自动扣库存、挂应收、进收付款中心
        </Text>
      </div>

      <Segmented
        style={{ marginBottom: 12 }}
        value={tab}
        onChange={handleTabChange}
        options={[
          { value: 'config', label: '店铺配置' },
          { value: 'listing', label: '商品上架' },
          { value: 'orders', label: '店铺订单' },
        ]}
      />

      {tab === 'config' && (
        <Card>
          <Paragraph>
            <Text type="secondary">店铺链接（发给顾客即可开店营业）：</Text>
            <Text copyable={{ text: shopUrl, icon: <CopyOutlined /> }}>{shopUrl || '加载中…'}</Text>
          </Paragraph>
          <div style={{ maxWidth: 520 }}>
            <div className="form-item" style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>店铺名称 *</label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="顾客看到的店名" maxLength={64} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>店铺公告</label>
              <Input value={notice} onChange={(e) => setNotice(e.target.value)} placeholder="如：满 10 件包邮 / 下单后 48 小时内发货" maxLength={200} />
            </div>
            <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Switch checked={enabled} onChange={setEnabled} />
              <span style={{ fontSize: 14 }}>{enabled ? '营业中（顾客可下单）' : '已打烊（顾客只能浏览）'}</span>
            </div>
            <Button type="primary" loading={saving} onClick={handleSaveConfig}>保存配置</Button>
          </div>
        </Card>
      )}

      {tab === 'listing' && (
        <Card>
          <Space style={{ marginBottom: 12 }}>
            <Input
              allowClear
              style={{ width: 260 }}
              placeholder="按款名 / 款号搜索"
              value={styleKw}
              onChange={(e) => setStyleKw(e.target.value)}
              onPressEnter={() => void fetchStyles(styleKw)}
            />
            <Button type="primary" onClick={() => void fetchStyles(styleKw)}>搜索</Button>
          </Space>
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
