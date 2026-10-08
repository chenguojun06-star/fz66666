import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Descriptions, Drawer, Empty, Input, Modal, Segmented, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd';
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
import type { ShopConfig, ShopOrder, ShopOrderDetail, ShopOrderItem, ShopOrderStats } from '@/services/shop/shopApi';
import api, { unwrapApiData } from '@/utils/api';
import './index.css';

const { Text, Paragraph } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING_SHIP: { label: '待发货', color: 'orange' },
  SHIPPED: { label: '已发货', color: 'green' },
  CANCELLED: { label: '已取消', color: 'default' },
};

/** D-513 售后状态 */
const AFTER_SALE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  NONE: { label: '无售后', color: 'default' },
  APPLIED: { label: '售后待处理', color: 'orange' },
  APPROVED: { label: '售后已同意', color: 'red' },
  REJECTED: { label: '售后已拒绝', color: 'default' },
};

/** D-513 售后类型 */
const AFTER_SALE_TYPE_MAP: Record<string, string> = {
  REFUND_ONLY: '仅退款',
  RETURN_REFUND: '退货退款',
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

  // D-513 订单全生命周期：统计 / 详情 / 取消 / 备注 / 批量发货
  const [stats, setStats] = useState<ShopOrderStats | null>(null);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailData, setDetailData] = useState<ShopOrderDetail | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ShopOrder | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [remarkTarget, setRemarkTarget] = useState<ShopOrder | null>(null);
  const [remarkValue, setRemarkValue] = useState('');
  const [remarkSubmitting, setRemarkSubmitting] = useState(false);
  const [batchShipOpen, setBatchShipOpen] = useState(false);
  const [batchCompany, setBatchCompany] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);

  // D-513 售后（仅已发货订单）
  const [afterSaleTarget, setAfterSaleTarget] = useState<ShopOrder | null>(null);
  const [asType, setAsType] = useState<'REFUND_ONLY' | 'RETURN_REFUND'>('REFUND_ONLY');
  const [asReason, setAsReason] = useState('');
  const [asSubmitting, setAsSubmitting] = useState(false);
  const [processTarget, setProcessTarget] = useState<ShopOrder | null>(null);
  const [processRemark, setProcessRemark] = useState('');
  const [processSubmitting, setProcessSubmitting] = useState(false);

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

  /** D-513：订单概览统计（待发货 / 今日 / 累计） */
  const fetchStats = useCallback(async () => {
    try {
      const res = await shopAdminApi.orderStats();
      setStats(unwrapApiData<ShopOrderStats>(res, '加载订单统计失败'));
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleTabChange = useCallback((v: string) => {
    setTab(v);
    // 页签数据在切入时拉取（事件驱动，避免 effect 依赖棘轮豁免）
    if (v === 'listing') void fetchStyles(styleKw);
    if (v === 'orders') {
      void fetchOrders(1);
      void fetchStats();
    }
  }, [fetchStyles, styleKw, fetchOrders, fetchStats]);

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
      // 注意：api 客户端对「HTTP 200 + 业务 code!=200」不抛错，只返回信封体；
      // 必须用 unwrapApiData 判 code，否则失败也会提示成功（后端 setListing 失败走 Result.fail）。
      unwrapApiData(await shopAdminApi.setListing(row.id, listed), '操作失败');
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
      unwrapApiData(
        await shopAdminApi.shipOrder(shipTarget.id, {
          expressCompany: shipCompany.trim() || undefined,
          expressNo: shipNo.trim() || undefined,
        }),
        '发货失败',
      );
      message.success(`订单 ${shipTarget.orderNo} 已发货`);
      setShipTarget(null);
      setShipCompany('');
      setShipNo('');
      void fetchOrders(orderPage);
      void fetchStats();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '发货失败');
    } finally {
      setShipSubmitting(false);
    }
  };

  /** 订单详情（抽屉） */
  const handleOpenDetail = async (order: ShopOrder) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailData(null);
    try {
      const res = await shopAdminApi.orderDetail(order.id);
      setDetailData(unwrapApiData<ShopOrderDetail>(res, '加载订单详情失败'));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '加载订单详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  /** 取消订单（回补库存 + 撤销应收，后端保证） */
  const handleCancelOrder = async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      unwrapApiData(
        await shopAdminApi.cancelOrder(cancelTarget.id, cancelReason.trim() || undefined),
        '取消订单失败',
      );
      message.success('订单已取消，库存已退回、应收已撤销');
      setCancelTarget(null);
      setCancelReason('');
      void fetchOrders(orderPage);
      void fetchStats();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '取消订单失败');
    } finally {
      setCancelSubmitting(false);
    }
  };

  /** 商家备注 */
  const handleSaveRemark = async () => {
    if (!remarkTarget) return;
    setRemarkSubmitting(true);
    try {
      unwrapApiData(await shopAdminApi.updateOrderRemark(remarkTarget.id, remarkValue.trim()), '备注保存失败');
      message.success('备注已保存');
      setRemarkTarget(null);
      void fetchOrders(orderPage);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '备注保存失败');
    } finally {
      setRemarkSubmitting(false);
    }
  };

  /** 批量发货（后端逐条独立事务，返回成功数与跳过原因） */
  const handleBatchShip = async () => {
    const pending = orders.filter((o) => selectedOrderIds.includes(o.id) && o.status === 'PENDING_SHIP');
    if (pending.length === 0) {
      message.warning('勾选中没有「待发货」的订单');
      return;
    }
    setBatchSubmitting(true);
    try {
      const res = await shopAdminApi.batchShipOrders(
        pending.map((o) => o.id),
        { expressCompany: batchCompany.trim() || undefined, expressNo: batchNo.trim() || undefined },
      );
      const data = unwrapApiData<{ shipped: number; failed: string[] }>(res, '批量发货失败');
      if (data.failed && data.failed.length > 0) {
        message.warning(`成功 ${data.shipped} 笔，跳过 ${data.failed.length} 笔：${data.failed[0]}`);
      } else {
        message.success(`已批量发货 ${data.shipped} 笔`);
      }
      setBatchShipOpen(false);
      setBatchCompany('');
      setBatchNo('');
      setSelectedOrderIds([]);
      void fetchOrders(orderPage);
      void fetchStats();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '批量发货失败');
    } finally {
      setBatchSubmitting(false);
    }
  };

  /** 登记售后（仅已发货订单） */
  const handleApplyAfterSale = async () => {
    if (!afterSaleTarget) return;
    setAsSubmitting(true);
    try {
      unwrapApiData(
        await shopAdminApi.applyAfterSale(afterSaleTarget.id, asType, asReason.trim() || undefined),
        '售后登记失败',
      );
      message.success('售后已登记，请及时处理');
      setAfterSaleTarget(null);
      setAsReason('');
      void fetchOrders(orderPage);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '售后登记失败');
    } finally {
      setAsSubmitting(false);
    }
  };

  /** 处理售后：同意（退货退款回补库存 + 撤销未收款应收）/ 拒绝 */
  const handleProcessAfterSale = async (action: 'approve' | 'reject') => {
    if (!processTarget) return;
    setProcessSubmitting(true);
    try {
      if (action === 'approve') {
        const res = await shopAdminApi.approveAfterSale(processTarget.id, processRemark.trim() || undefined);
        const data = unwrapApiData<{ restoredItems: number; message: string }>(res, '处理售后失败');
        message.success(data?.message || '已同意售后');
      } else {
        unwrapApiData(
          await shopAdminApi.rejectAfterSale(processTarget.id, processRemark.trim() || undefined),
          '拒绝售后失败',
        );
        message.success('已拒绝售后');
      }
      setProcessTarget(null);
      setProcessRemark('');
      void fetchOrders(orderPage);
      void fetchStats();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '处理售后失败');
    } finally {
      setProcessSubmitting(false);
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
      width: 140,
      render: (v: string, r: ShopOrder) => (
        <Space size={4} wrap>
          <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? v}</Tag>
          {r.afterSaleStatus && r.afterSaleStatus !== 'NONE' ? (
            <Tag color={AFTER_SALE_STATUS_MAP[r.afterSaleStatus]?.color}>
              {AFTER_SALE_STATUS_MAP[r.afterSaleStatus]?.label ?? r.afterSaleStatus}
            </Tag>
          ) : null}
        </Space>
      ),
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
      width: 220,
      fixed: 'right' as const,
      render: (_, r) => (
        <Space size={4} wrap>
          <Button size="small" type="link" onClick={() => void handleOpenDetail(r)}>详情</Button>
          {r.status === 'PENDING_SHIP' && (
            <>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setShipTarget(r);
                  setShipCompany('');
                  setShipNo('');
                }}
              >
                发货
              </Button>
              <Button
                size="small"
                type="link"
                danger
                onClick={() => { setCancelTarget(r); setCancelReason(''); }}
              >
                取消
              </Button>
            </>
          )}
          {/* D-513：已发货才能走售后（未发货直接「取消」即可，两者语义不重叠） */}
          {r.status === 'SHIPPED' && r.afterSaleStatus === 'APPLIED' && (
            <Button
              size="small"
              type="link"
              danger
              onClick={() => { setProcessTarget(r); setProcessRemark(''); }}
            >
              处理售后
            </Button>
          )}
          {r.status === 'SHIPPED'
            && (!r.afterSaleStatus || r.afterSaleStatus === 'NONE' || r.afterSaleStatus === 'REJECTED') && (
            <Button
              size="small"
              type="link"
              onClick={() => { setAfterSaleTarget(r); setAsType('REFUND_ONLY'); setAsReason(''); }}
            >
              售后
            </Button>
          )}
          <Button
            size="small"
            type="link"
            onClick={() => { setRemarkTarget(r); setRemarkValue(r.remark || ''); }}
          >
            备注
          </Button>
        </Space>
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
          {/* D-513：订单概览（待发货 / 今日 / 累计），商家一眼看经营情况 */}
          <div className="shop-order-stats">
            {[
              { key: 'pendingShip', label: '待发货', value: stats ? `${stats.pendingShip}` : '-', accent: 'var(--color-warning)' },
              { key: 'todayOrders', label: '今日订单', value: stats ? `${stats.todayOrders}` : '-' },
              { key: 'todayAmount', label: '今日销售额', value: stats ? `¥ ${Number(stats.todayAmount).toFixed(2)}` : '-' },
              { key: 'totalOrders', label: '累计订单', value: stats ? `${stats.totalOrders}` : '-' },
              { key: 'totalAmount', label: '累计销售额', value: stats ? `¥ ${Number(stats.totalAmount).toFixed(2)}` : '-' },
            ].map((c) => (
              <div key={c.key} className="shop-order-stat">
                <div className="shop-order-stat__label">{c.label}</div>
                <div className="shop-order-stat__value" style={c.accent ? { color: c.accent } : undefined}>{c.value}</div>
              </div>
            ))}
          </div>

          <div className="shop-toolbar">
            <Segmented
              value={orderStatus}
              onChange={(v) => {
                const s = String(v);
                setOrderStatus(s);
                setSelectedOrderIds([]);
                void fetchOrders(1, s, orderKw);
              }}
              options={[
                { value: '', label: '全部' },
                { value: 'PENDING_SHIP', label: '待发货' },
                { value: 'SHIPPED', label: '已发货' },
                { value: 'CANCELLED', label: '已取消' },
              ]}
            />
            <Space>
              <Input.Search
                allowClear
                style={{ width: 240 }}
                placeholder="订单号 / 收货人 / 电话"
                value={orderKw}
                onChange={(e) => setOrderKw(e.target.value)}
                onSearch={(v) => void fetchOrders(1, orderStatus, v)}
              />
              <Button
                type="primary"
                disabled={selectedOrderIds.length === 0}
                onClick={() => { setBatchShipOpen(true); setBatchCompany(''); setBatchNo(''); }}
              >
                批量发货{selectedOrderIds.length > 0 ? `（${selectedOrderIds.length}）` : ''}
              </Button>
            </Space>
          </div>
          <ResizableTable
            rowKey="id"
            size="small"
            columns={orderColumns}
            dataSource={orders}
            loading={orderLoading}
            rowSelection={{
              selectedRowKeys: selectedOrderIds,
              onChange: (keys) => setSelectedOrderIds(keys.map(String)),
              getCheckboxProps: (r: ShopOrder) => ({ disabled: r.status !== 'PENDING_SHIP' }),
            }}
            pagination={{
              current: orderPage,
              total: orderTotal,
              pageSize: 20,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p) => { setSelectedOrderIds([]); void fetchOrders(p); },
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

      {/* D-513：批量发货 */}
      <Modal
        title="批量发货"
        open={batchShipOpen}
        onOk={() => void handleBatchShip()}
        confirmLoading={batchSubmitting}
        onCancel={() => setBatchShipOpen(false)}
        okText="确认发货"
        destroyOnHidden
      >
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Text type="secondary">
            将给勾选的 {orders.filter((o) => selectedOrderIds.includes(o.id) && o.status === 'PENDING_SHIP').length} 笔「待发货」订单统一登记同一组快递信息。
          </Text>
          <div>
            <div style={{ marginBottom: 4 }}>快递公司</div>
            <Input value={batchCompany} onChange={(e) => setBatchCompany(e.target.value)} placeholder="如：顺丰 / 中通（可留空）" maxLength={32} />
          </div>
          <div>
            <div style={{ marginBottom: 4 }}>快递单号</div>
            <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="快递单号（可留空，后续可单独补）" maxLength={32} />
          </div>
          <Text type="secondary" className="u-fs-12">
            逐笔独立处理：个别订单不可发货（如已取消）会自动跳过，其余照常成功。
          </Text>
        </Space>
      </Modal>

      {/* D-513：取消订单（回补库存 + 撤销应收） */}
      <Modal
        title="取消订单"
        open={!!cancelTarget}
        onOk={() => void handleCancelOrder()}
        confirmLoading={cancelSubmitting}
        onCancel={() => setCancelTarget(null)}
        okText="确认取消订单"
        okButtonProps={{ danger: true }}
        destroyOnHidden
      >
        {cancelTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Text>订单 {cancelTarget.orderNo} · {cancelTarget.customerName} · ¥{Number(cancelTarget.totalAmount).toFixed(2)}</Text>
            <Alert
              type="warning"
              showIcon
              message="取消会同时做三件事"
              description={<span style={{ fontSize: 13 }}>① 退回已扣库存（生成退回入库单）<br />② 撤销挂账应收<br />③ 订单置为「已取消」，不可恢复</span>}
            />
            <div>
              <div style={{ marginBottom: 4 }}>取消原因</div>
              <Input.TextArea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="如：买家改主意 / 缺货 / 地址填错"
                maxLength={200}
                showCount
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
          </Space>
        )}
      </Modal>

      {/* D-513：商家备注 */}
      <Modal
        title="商家备注"
        open={!!remarkTarget}
        onOk={() => void handleSaveRemark()}
        confirmLoading={remarkSubmitting}
        onCancel={() => setRemarkTarget(null)}
        okText="保存"
        destroyOnHidden
      >
        {remarkTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Text type="secondary">订单 {remarkTarget.orderNo} · 仅内部可见，买家看不到</Text>
            <Input.TextArea
              value={remarkValue}
              onChange={(e) => setRemarkValue(e.target.value)}
              placeholder="如：老客户，优先发货 / 已电话确认尺码"
              maxLength={500}
              showCount
              autoSize={{ minRows: 3, maxRows: 6 }}
            />
          </Space>
        )}
      </Modal>

      {/* D-513：登记售后 */}
      <Modal
        title="登记售后"
        open={!!afterSaleTarget}
        onOk={() => void handleApplyAfterSale()}
        confirmLoading={asSubmitting}
        onCancel={() => setAfterSaleTarget(null)}
        okText="登记"
        destroyOnHidden
      >
        {afterSaleTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Text type="secondary">
              订单 {afterSaleTarget.orderNo} · {afterSaleTarget.customerName} · ¥{Number(afterSaleTarget.totalAmount).toFixed(2)}
            </Text>
            <div>
              <div style={{ marginBottom: 6 }}>售后类型</div>
              <Segmented
                value={asType}
                onChange={(v) => setAsType(String(v) as 'REFUND_ONLY' | 'RETURN_REFUND')}
                options={[
                  { value: 'REFUND_ONLY', label: '仅退款' },
                  { value: 'RETURN_REFUND', label: '退货退款' },
                ]}
              />
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                {asType === 'RETURN_REFUND'
                  ? '顾客退回货物：同意后会按明细回补库存。'
                  : '顾客不退货：同意后不回补库存，仅处理款项。'}
              </div>
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>售后原因</div>
              <Input.TextArea
                value={asReason}
                onChange={(e) => setAsReason(e.target.value)}
                placeholder="如：尺码不合适 / 有色差 / 顾客拍错"
                maxLength={200}
                showCount
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
            <Alert
              type="info"
              showIcon
              message="关于退款"
              description={<span style={{ fontSize: 12 }}>系统不做资金出账：同意后会自动撤销未收款的挂账应收；已收款的需你线下退款后，到「收付款中心」核销。</span>}
            />
          </Space>
        )}
      </Modal>

      {/* D-513：处理售后（同意 / 拒绝） */}
      <Modal
        title="处理售后"
        open={!!processTarget}
        onCancel={() => setProcessTarget(null)}
        destroyOnHidden
        footer={[
          <Button key="reject" danger loading={processSubmitting} onClick={() => void handleProcessAfterSale('reject')}>
            拒绝
          </Button>,
          <Button key="approve" type="primary" loading={processSubmitting} onClick={() => void handleProcessAfterSale('approve')}>
            同意售后
          </Button>,
        ]}
      >
        {processTarget && (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Text type="secondary">
              订单 {processTarget.orderNo} · {processTarget.customerName} · ¥{Number(processTarget.totalAmount).toFixed(2)}
            </Text>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="售后类型">
                {AFTER_SALE_TYPE_MAP[processTarget.afterSaleType || ''] || processTarget.afterSaleType || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="售后原因">{processTarget.afterSaleReason || '-'}</Descriptions.Item>
            </Descriptions>
            <div>
              <div style={{ marginBottom: 4 }}>处理备注</div>
              <Input.TextArea
                value={processRemark}
                onChange={(e) => setProcessRemark(e.target.value)}
                placeholder="同意时可留空；拒绝时建议写明原因"
                maxLength={200}
                showCount
                autoSize={{ minRows: 2, maxRows: 4 }}
              />
            </div>
            <Alert
              type="warning"
              showIcon
              message="同意的后果"
              description={<span style={{ fontSize: 12 }}>
                {processTarget.afterSaleType === 'RETURN_REFUND'
                  ? '① 按订单明细回补库存 ② 撤销未收款的挂账应收（已收款需线下退款后核销）'
                  : '① 不回补库存（货不退） ② 撤销未收款的挂账应收（已收款需线下退款后核销）'}
              </span>}
            />
          </Space>
        )}
      </Modal>

      {/* D-513：订单详情 */}
      <Drawer
        title="订单详情"
        width="min(760px, 94vw)"
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        destroyOnHidden
      >
        {detailLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : detailData ? (
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Descriptions title="订单信息" column={2} bordered size="small">
              <Descriptions.Item label="订单号" span={2}>{detailData.order.orderNo}</Descriptions.Item>
              <Descriptions.Item label="状态" span={2}>
                <Tag color={STATUS_MAP[detailData.order.status]?.color}>
                  {STATUS_MAP[detailData.order.status]?.label ?? detailData.order.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="下单时间" span={2}>
                {(detailData.order.createTime || '').replace('T', ' ').slice(0, 19)}
              </Descriptions.Item>
              <Descriptions.Item label="订单金额" span={2}>
                <Text strong className="shop-amount">¥ {Number(detailData.order.totalAmount).toFixed(2)}</Text>
                <Text type="secondary">（{detailData.order.itemCount} 件）</Text>
              </Descriptions.Item>
              {detailData.order.outstockNo ? (
                <Descriptions.Item label="出库单号" span={2}>{detailData.order.outstockNo}</Descriptions.Item>
              ) : null}
            </Descriptions>

            <Descriptions title="收货信息" column={1} bordered size="small">
              <Descriptions.Item label="收货人">{detailData.order.customerName}</Descriptions.Item>
              <Descriptions.Item label="电话">{detailData.order.phone}</Descriptions.Item>
              <Descriptions.Item label="地址">{detailData.order.address}</Descriptions.Item>
            </Descriptions>

            <div>
              <div style={{ marginBottom: 8, fontWeight: 600 }}>商品明细</div>
              <Table<ShopOrderItem>
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={detailData.items}
                columns={[
                  { title: '款号', dataIndex: 'styleNo', width: 110 },
                  { title: '款名', dataIndex: 'styleName', ellipsis: true },
                  { title: '颜色', dataIndex: 'color', width: 80 },
                  { title: '尺码', dataIndex: 'size', width: 70 },
                  {
                    title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right',
                    render: (v: number) => `¥${Number(v ?? 0).toFixed(2)}`,
                  },
                  { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' },
                  {
                    title: '小计', dataIndex: 'amount', width: 100, align: 'right',
                    render: (v: number) => <Text strong>¥{Number(v ?? 0).toFixed(2)}</Text>,
                  },
                ]}
                summary={() => (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6} align="right"><Text strong>合计</Text></Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <Text strong className="shop-amount">¥ {Number(detailData.order.totalAmount).toFixed(2)}</Text>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                )}
              />

            </div>

            <Descriptions title="物流与备注" column={1} bordered size="small">
              <Descriptions.Item label="快递公司">{detailData.order.expressCompany || '-'}</Descriptions.Item>
              <Descriptions.Item label="快递单号">{detailData.order.expressNo || '-'}</Descriptions.Item>
              <Descriptions.Item label="发货时间">
                {(detailData.order.shipTime || '').replace('T', ' ').slice(0, 19) || '-'}
              </Descriptions.Item>
              {detailData.order.cancelTime ? (
                <>
                  <Descriptions.Item label="取消时间">
                    {(detailData.order.cancelTime || '').replace('T', ' ').slice(0, 19)}
                  </Descriptions.Item>
                  <Descriptions.Item label="取消原因">{detailData.order.cancelReason || '-'}</Descriptions.Item>
                </>
              ) : null}
              {detailData.order.afterSaleStatus && detailData.order.afterSaleStatus !== 'NONE' ? (
                <>
                  <Descriptions.Item label="售后状态">
                    <Tag color={AFTER_SALE_STATUS_MAP[detailData.order.afterSaleStatus]?.color}>
                      {AFTER_SALE_STATUS_MAP[detailData.order.afterSaleStatus]?.label ?? detailData.order.afterSaleStatus}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="售后类型">
                    {AFTER_SALE_TYPE_MAP[detailData.order.afterSaleType || ''] || detailData.order.afterSaleType || '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label="售后原因">{detailData.order.afterSaleReason || '-'}</Descriptions.Item>
                  <Descriptions.Item label="处理备注">{detailData.order.afterSaleRemark || '-'}</Descriptions.Item>
                </>
              ) : null}
              <Descriptions.Item label="商家备注">{detailData.order.remark || '-'}</Descriptions.Item>
            </Descriptions>
          </Space>
        ) : (
          <Empty description="未取到订单详情" />
        )}
      </Drawer>
    </div>
  );
};

export default ShopManage;