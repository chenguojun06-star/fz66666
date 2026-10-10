import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Descriptions, Drawer, Empty, Input, InputNumber, Modal, Row, Segmented, Space, Spin, Statistic, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CopyOutlined,
  ExportOutlined,
  FileExcelOutlined,
  PrinterOutlined,
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
import { exportShopOrders, printDeliveryNotes } from './deliveryTools';
import type {
  ShopConfig,
  ShopOrder,
  ShopOrderDetail,
  ShopOrderItem,
  ShopOrderStats,
  ShopReviewRow,
  ShopReviewSummary,
  ShopDashboardData,
  ShopDashboardDailyRow,
} from '@/services/shop/shopApi';
import api, { unwrapApiData } from '@/utils/api';
import { formatMoney } from '@/utils/format';
import { readPageSize } from '@/utils/pageSizeStore';
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

  // D-513 配送设置（运费规则：全场包邮 / 满额包邮 / 收固定运费）
  const [shipEnabled, setShipEnabled] = useState(false);
  const [shipFee, setShipFee] = useState<number | null>(null);
  const [freeThreshold, setFreeThreshold] = useState<number | null>(null);
  const [shipNote, setShipNote] = useState('');
  // D-769：服务承诺（商家显式开关，默认全不承诺）
  const [returnDays, setReturnDays] = useState<number>(0);
  const [promiseInStock, setPromiseInStock] = useState(false);
  const [promiseAuthentic, setPromiseAuthentic] = useState(false);
  const [promiseExtra, setPromiseExtra] = useState('');

  // 款式上架
  const [styleKw, setStyleKw] = useState('');
  const [styles, setStyles] = useState<StyleRow[]>([]);
  const [styleLoading, setStyleLoading] = useState(false);
  const [listingFilter, setListingFilter] = useState<string>('all');
  const [stylePage, setStylePage] = useState(1);
  // 每页条数交给 state + localStorage：分页器不再被 ResizableTable 写死成 20
  const [stylePageSize, setStylePageSize] = useState(readPageSize(20));

  // 订单
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(readPageSize(20));
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

  // P2：商品评价（商家侧查看）——评价此前只有 C 端写入，商家看不到任何一条
  const [reviewRows, setReviewRows] = useState<ShopReviewRow[]>([]);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reviewPage, setReviewPage] = useState(1);
  const [reviewPageSize, setReviewPageSize] = useState(readPageSize(20));
  const [reviewStyleNo, setReviewStyleNo] = useState('');
  const [reviewRating, setReviewRating] = useState<number | undefined>(undefined);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewSummary, setReviewSummary] = useState<ShopReviewSummary | null>(null);

  // 数据看板（日报）：浏览 → 加购 → 下单 → 下单金额
  const [dashDays, setDashDays] = useState(30);
  const [dashData, setDashData] = useState<ShopDashboardData | null>(null);
  const [dashLoading, setDashLoading] = useState(false);

  // 详情页图片轮播：自动播放开关 + 间隔（店铺级统一，顾客端详情页生效）
  const [carouselAuto, setCarouselAuto] = useState(true);
  const [carouselGap, setCarouselGap] = useState(4);

  const fetchConfig = useCallback(async () => {
    try {
      const res: any = await shopAdminApi.getConfig();
      const cfg = res?.data ?? res;
      setConfig(cfg);
      setShopName(cfg?.shopName || '');
      setNotice(cfg?.notice || '');
      setEnabled(cfg?.enabled === 1);
      setShipEnabled(cfg?.shippingEnabled === 1);
      setShipFee(cfg?.shippingFee == null ? null : Number(cfg.shippingFee));
      setFreeThreshold(cfg?.freeShippingThreshold == null ? null : Number(cfg.freeShippingThreshold));
      setShipNote(cfg?.shippingNote || '');
      setReturnDays(cfg?.returnDays ?? 0);
      setPromiseInStock(cfg?.promiseInStock === 1);
      setPromiseAuthentic(cfg?.promiseAuthentic === 1);
      setPromiseExtra(cfg?.promiseExtra || '');
      // 轮播：默认开、4 秒（后端默认值一致）
      setCarouselAuto(cfg?.carouselAutoplay !== 0);
      setCarouselGap(Math.round((Number(cfg?.carouselIntervalMs) || 4000) / 1000));
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '店铺配置加载失败');
    }
  }, []);

  const fetchStyles = useCallback(async (kw: string) => {
    setStyleLoading(true);
    try {
      // 注意：后端 keyword 才对 款号/款名/品类 做 OR 模糊匹配；
      // 同时传 styleName+styleNo 会被 AND 起来，等于搜不到。
      // pageSize 取接口上限 500：此前写 50，款式超过 50 条时翻页器再往下也翻不到。
      const res: any = await api.get('/style/info/list', {
        params: { keyword: kw || undefined, page: 1, pageSize: 500 },
      });
      const data = res?.data?.records ?? res?.data ?? [];
      setStyles(Array.isArray(data) ? data : []);
    } catch {
      setStyles([]);
    } finally {
      setStyleLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async (p: number, status?: string, keyword?: string, ps?: number) => {
    setOrderLoading(true);
    try {
      const pageSize = ps ?? orderPageSize;
      const res: any = await shopAdminApi.orders({
        page: p,
        pageSize,
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
  }, [orderStatus, orderKw, orderPageSize]);

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

  /**
   * 数据看板（日报）。
   *
   * 失败时清空数据并提示：看板数字与钱有关，宁可不显示也不能显示错。
   */
  const fetchDashboard = useCallback(async (days: number) => {
    setDashLoading(true);
    try {
      const res = await shopAdminApi.dashboardDaily(days);
      setDashData(unwrapApiData<ShopDashboardData>(res, '加载看板失败'));
    } catch (e) {
      setDashData(null);
      message.error(e instanceof Error ? e.message : '加载看板失败');
    } finally {
      setDashLoading(false);
    }
  }, []);

  /** P2：本店铺评价分页 */
  const fetchReviews = useCallback(async (p: number, styleNo?: string, rating?: number, ps?: number) => {
    setReviewLoading(true);
    try {
      const res = await shopAdminApi.reviews({
        page: p,
        pageSize: ps ?? reviewPageSize,
        styleNo: (styleNo ?? reviewStyleNo) || undefined,
        rating: rating ?? reviewRating,
      });
      const data = unwrapApiData<{ records: ShopReviewRow[]; total: number }>(res, '加载评价失败');
      setReviewRows(data?.records ?? []);
      setReviewTotal(data?.total ?? 0);
      setReviewPage(p);
    } catch {
      setReviewRows([]);
      setReviewTotal(0);
    } finally {
      setReviewLoading(false);
    }
  }, [reviewStyleNo, reviewRating, reviewPageSize]);

  /** P2：本店铺评价概览 */
  const fetchReviewSummary = useCallback(async () => {
    try {
      const res = await shopAdminApi.reviewSummary();
      setReviewSummary(unwrapApiData<ShopReviewSummary>(res, '加载评价概览失败'));
    } catch {
      setReviewSummary(null);
    }
  }, []);

  const handleTabChange = useCallback((v: string) => {
    setTab(v);
    // 页签数据在切入时拉取（事件驱动，避免 effect 依赖棘轮豁免）
    if (v === 'listing') void fetchStyles(styleKw);
    if (v === 'orders') {
      void fetchOrders(1);
      void fetchStats();
    }
    if (v === 'reviews') {
      void fetchReviews(1);
      void fetchReviewSummary();
    }
    if (v === 'dashboard') void fetchDashboard(dashDays);
  }, [fetchStyles, styleKw, fetchOrders, fetchStats, fetchReviews, fetchReviewSummary,
      fetchDashboard, dashDays]);

  const handleSaveConfig = async () => {
    if (!shopName.trim()) return message.warning('店铺名称不能为空');
    // 规则自洽性前置校验（后端也会拦，但这里先给即时反馈）：
    // 只拦"逻辑上说不通"的配置；包邮门槛与运费的高低属于商家定价策略，不做限制。
    if (shipEnabled && !(Number(shipFee) > 0)) {
      return message.warning('已开启收取运费，请填写大于 0 的运费金额');
    }
    setSaving(true);
    try {
      const res = await shopAdminApi.saveConfig({
        shopName: shopName.trim(),
        notice: notice.trim(),
        enabled,
        shippingEnabled: shipEnabled,
        shippingFee: Number(shipFee) || 0,
        freeShippingThreshold: Number(freeThreshold) || 0,
        shippingNote: shipNote.trim(),
        returnDays: returnDays ?? 0,
        promiseInStock,
        promiseAuthentic,
        promiseExtra: promiseExtra.trim(),
        carouselAutoplay: carouselAuto,
        carouselIntervalMs: Math.round(Number(carouselGap) || 4) * 1000,
      });
      unwrapApiData(res, '保存失败');
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

  /** D-770：导出订单 Excel（勾选优先，未勾选导出当前列表） */
  const handleExportOrders = async () => {
    try {
      const n = await exportShopOrders(orders, selectedOrderIds, shopName);
      message.success(`已导出 ${n} 笔订单`);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导出失败');
    }
  };

  /** D-770：打印发货单（一个订单一块，需逐单拉明细） */
  const handlePrintNotes = async () => {
    const picked = selectedOrderIds.length
      ? orders.filter((o) => selectedOrderIds.includes(o.id))
      : orders.filter((o) => o.status !== 'CANCELLED');
    if (!picked.length) {
      message.warning('没有可打印的订单');
      return;
    }
    const modal = message.loading('正在准备发货单…', 0);
    try {
      const itemsByOrderId: Record<string, Array<Record<string, unknown>>> = {};
      // 明细要逐单拉；并发上限 5，避免订单多时把浏览器打满
      for (let i = 0; i < picked.length; i += 5) {
        const batch = picked.slice(i, i + 5);
        const results = await Promise.all(
          batch.map(async (o) => {
            try {
              const d = unwrapApiData<{ items?: Array<Record<string, unknown>> }>(
                await shopAdminApi.orderDetail(o.id),
                '读取订单明细失败',
              );
              return [o.id, d?.items ?? []] as const;
            } catch {
              // 单单拉取失败不阻断整批：发货单会显示「无明细」，仓库可自行核对
              return [o.id, []] as const;
            }
          }),
        );
        for (const [id, items] of results) {
          itemsByOrderId[id] = items as never;
        }
      }
      const n = printDeliveryNotes(picked, itemsByOrderId, shopName);
      modal();
      message.success(`已生成 ${n} 张发货单`);
    } catch (e: unknown) {
      modal();
      message.error(e instanceof Error ? e.message : '打印失败');
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

  /** P2：评价列表列定义（商家只看得到自己店铺的评价） */
  const reviewColumns: ColumnsType<ShopReviewRow> = [
    {
      title: '评分',
      dataIndex: 'rating',
      width: 110,
      render: (v: number) => (
        <span style={{ color: 'var(--color-warning)' }}>
          {'★'.repeat(Math.max(0, Math.min(5, Number(v) || 0)))}
          <span style={{ color: 'var(--color-text-tertiary)' }}>
            {'☆'.repeat(5 - Math.max(0, Math.min(5, Number(v) || 0)))}
          </span>
        </span>
      ),
    },
    { title: '款号', dataIndex: 'styleNo', width: 130, render: (v?: string | null) => v || '-' },
    { title: '订单号', dataIndex: 'orderNo', width: 175, render: (v: string) => <Text copyable={{ text: v }}>{v}</Text> },
    {
      title: '评价内容',
      dataIndex: 'content',
      ellipsis: true,
      render: (v?: string | null, r?: ShopReviewRow) => (
        <Space size={6}>
          {r?.anonymous ? <Tag>匿名</Tag> : null}
          <span>{v || <Text type="secondary">（未填写内容）</Text>}</span>
        </Space>
      ),
    },
    {
      title: '评价时间',
      dataIndex: 'createTime',
      width: 165,
      render: (v: string) => (v || '').replace('T', ' ').slice(0, 19),
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
          { value: 'reviews', label: '商品评价' },
          { value: 'dashboard', label: '数据看板' },
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
            {/* D-513 配送设置：此前系统无运费概念，而 C 端页面硬编码「包邮」，
                属于自相矛盾的展示。这里给出可配的运费规则，下单金额按规则服务端计算。 */}
            <div className="shop-field">
              <label>配送设置</label>
              <div className="shop-field shop-field--inline" style={{ marginBottom: 10 }}>
                <Switch checked={shipEnabled} onChange={setShipEnabled} />
                <div>
                  <div className="shop-field__label">{shipEnabled ? '按规则收运费' : '全场包邮'}</div>
                  <Text type="secondary" className="shop-field__hint">
                    {shipEnabled
                      ? '未达包邮门槛的订单会加收运费'
                      : '所有订单不收运费（顾客端显示「包邮」）'}
                  </Text>
                </div>
              </div>
              {shipEnabled && (
                <div className="shop-ship-grid">
                  <div>
                    <div className="shop-field__label" style={{ marginBottom: 4 }}>默认运费（元）</div>
                    <InputNumber
                      value={shipFee}
                      onChange={(v) => setShipFee(v)}
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                      placeholder="如 12"
                      addonBefore="¥"
                    />
                  </div>
                  <div>
                    <div className="shop-field__label" style={{ marginBottom: 4 }}>满多少包邮（元）</div>
                    <InputNumber
                      value={freeThreshold}
                      onChange={(v) => setFreeThreshold(v)}
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                      placeholder="0 = 不包邮"
                      addonBefore="¥"
                    />
                  </div>
                </div>
              )}
              {shipEnabled && (
                <Text type="secondary" className="shop-field__hint" style={{ display: 'block', marginTop: 8 }}>
                  当前规则：
                  {Number(freeThreshold) > 0
                    ? `商品满 ¥${Number(freeThreshold)} 包邮，否则收 ¥${Number(shipFee) || 0} 运费`
                    : `所有订单收 ¥${Number(shipFee) || 0} 运费（不设包邮门槛）`}
                </Text>
              )}
            </div>

            {/* D-769：服务承诺 —— 商家显式开关。
                此前顾客端把「7 天无理由」「现货速发」写死在页面上，
                商家既不能配置、系统也没有退货政策数据支撑，属空头承诺：
                写了就要兑现。现改为默认全不承诺，按需开启。 */}
            <div className="shop-field">
              <div className="shop-field__label" style={{ marginBottom: 4 }}>服务承诺</div>
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 10 }}
                message="承诺写了就要能兑现"
                description="未开启的承诺不会在顾客端显示。只勾选你确实能做到的；无理由退货需填写真实天数。"
              />
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space>
                  <Switch checked={returnDays > 0} onChange={(v) => setReturnDays(v ? 7 : 0)} />
                  <span>无理由退货</span>
                  {returnDays > 0 ? (
                    <InputNumber
                      value={returnDays}
                      onChange={(v) => setReturnDays(Number(v) || 0)}
                      min={1}
                      max={90}
                      style={{ width: 96 }}
                      addonAfter="天"
                    />
                  ) : null}
                </Space>
                <Space>
                  <Switch checked={promiseInStock} onChange={setPromiseInStock} />
                  <span>现货速发（有库存即发）</span>
                </Space>
                <Space>
                  <Switch checked={promiseAuthentic} onChange={setPromiseAuthentic} />
                  <span>正品保障</span>
                </Space>
                <Input
                  value={promiseExtra}
                  onChange={(e) => setPromiseExtra(e.target.value)}
                  placeholder="其它承诺，逗号分隔，如：支持一件代发、当天打样"
                  maxLength={255}
                />
              </Space>
            </div>
            <div className="shop-field">
              <label>配送说明（顾客可见，选填）</label>
              <Input
                value={shipNote}
                onChange={(e) => setShipNote(e.target.value)}
                placeholder="如：偏远地区（新疆/西藏）需补运费，客服会联系您"
                maxLength={120}
                showCount
              />
            </div>
            {/* 详情页图片轮播：此前顾客端既不自动播放、也没有任何设置入口 */}
            <div className="shop-field">
              <label>详情页图片轮播</label>
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space>
                  <Switch checked={carouselAuto} onChange={setCarouselAuto} />
                  <span>{carouselAuto ? '自动播放' : '不自动播放（顾客手动切换）'}</span>
                </Space>
                {carouselAuto ? (
                  <Space>
                    <span>切换间隔</span>
                    <InputNumber
                      value={carouselGap}
                      onChange={(v) => setCarouselGap(Number(v) || 4)}
                      min={2}
                      max={10}
                      style={{ width: 96 }}
                      addonAfter="秒"
                    />
                    <Text type="secondary" className="u-fs-12">2~10 秒；顾客左右滑动时自动暂停</Text>
                  </Space>
                ) : null}
                <Text type="secondary" className="u-fs-12">
                  顾客端商品详情页的图片轮播，全店统一；只有一张图的商品不轮播。
                </Text>
              </Space>
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
                setStylePage(1);
                void fetchStyles(v);
              }}
              enterButton
            />
            <Segmented
              value={listingFilter}
              onChange={(v) => { setListingFilter(String(v)); setStylePage(1); }}
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
            pagination={{
              current: stylePage,
              pageSize: stylePageSize,
              total: shownStyles.length,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => { setStylePage(p); setStylePageSize(ps); },
            }}
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
                icon={<FileExcelOutlined />}
                disabled={orders.length === 0}
                onClick={() => void handleExportOrders()}
              >
                导出 Excel
              </Button>
              <Button
                icon={<PrinterOutlined />}
                disabled={orders.length === 0}
                onClick={() => void handlePrintNotes()}
              >
                打印发货单
              </Button>
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
              pageSize: orderPageSize,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setSelectedOrderIds([]);
                setOrderPageSize(ps);
                void fetchOrders(p, undefined, undefined, ps);
              },
            }}
            emptyDescription="还没有店铺订单"
          />
        </Card>
      )}

      {/* 数据看板（日报）：浏览 → 加购 → 下单 → 下单金额 */}
      {tab === 'dashboard' && (
        <Card>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="只看四个数：浏览 → 加购 → 下单 → 下单金额"
            description={
              <span style={{ fontSize: 12.5 }}>
                浏览与加购来自按天计数（购物车结算成功后会清空、浏览明细按「顾客+款式」合并，
                这两项事后都还原不出按天的数）；下单与下单金额实时取自订单表，已剔除取消订单。
                没数据的日期显示 0，而不是消失——否则趋势图会把「那天没人看」画成「那天不存在」。
              </span>
            }
          />
          <div className="shop-toolbar">
            <Segmented
              value={String(dashDays)}
              onChange={(v) => {
                const d = Number(v);
                setDashDays(d);
                void fetchDashboard(d);
              }}
              options={[
                { value: '7', label: '近 7 天' },
                { value: '30', label: '近 30 天' },
                { value: '90', label: '近 90 天' },
              ]}
            />
            <div className="shop-toolbar__spacer" />
            <Tooltip title="重新拉取">
              <Button
                icon={<ReloadOutlined />}
                loading={dashLoading}
                onClick={() => void fetchDashboard(dashDays)}
              >
                刷新
              </Button>
            </Tooltip>
          </div>

          <Row gutter={12} style={{ marginBottom: 12 }}>
            {(dashData?.summary ?? []).map((sm) => (
              <Col xs={24} md={8} key={sm.label} style={{ marginBottom: 12 }}>
                <Card size="small" title={sm.label}>
                  <Row gutter={8}>
                    <Col span={12}>
                      <Statistic title="浏览" value={Number(sm.browseCount ?? 0)} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="加购" value={Number(sm.cartAddCount ?? 0)} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="下单" value={Number(sm.orderCount ?? 0)} />
                    </Col>
                    <Col span={12}>
                      <Statistic
                        title="下单金额"
                        value={Number(sm.orderAmount ?? 0)}
                        precision={2}
                        prefix="¥"
                      />
                    </Col>
                  </Row>
                </Card>
              </Col>
            ))}
          </Row>

          <Table<ShopDashboardDailyRow>
            rowKey="date"
            size="small"
            loading={dashLoading}
            dataSource={dashData?.records ?? []}
            pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t) => `共 ${t} 天` }}
            locale={{ emptyText: '暂无数据' }}
            columns={[
              { title: '日期', dataIndex: 'date', width: 120 },
              {
                title: '浏览',
                dataIndex: 'browseCount',
                width: 90,
                align: 'right',
                render: (v: number) => Number(v ?? 0),
              },
              {
                title: '加购',
                dataIndex: 'cartAddCount',
                width: 90,
                align: 'right',
                render: (v: number) => Number(v ?? 0),
              },
              {
                title: '下单',
                dataIndex: 'orderCount',
                width: 90,
                align: 'right',
                render: (v: number) => Number(v ?? 0),
              },
              {
                title: '下单金额',
                dataIndex: 'orderAmount',
                align: 'right',
                render: (v: number) => formatMoney(v),
              },
            ]}
          />
        </Card>
      )}

      {/* P2：商品评价——评价此前只有 C 端写入，商家侧没有任何读入口 */}
      {tab === 'reviews' && (
        <Card>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="顾客对已发货订单的评价会出现在这里"
            description={
              <span style={{ fontSize: 12.5 }}>
                评价按「一单一款」记录：一个订单里的每款商品各有一条。顾客提交后不可修改，
                商家也不能删除——这是为了口碑数据可信。评分会展示在平台商城的商品卡上。
              </span>
            }
          />
          <div className="shop-order-stats">
            {[
              { key: 'avg', label: '平均评分', value: reviewSummary ? `★ ${reviewSummary.avgRating}` : '-', accent: 'var(--color-warning)' },
              { key: 'total', label: '评价总数', value: reviewSummary ? `${reviewSummary.total}` : '-' },
              { key: '5', label: '5 星', value: reviewSummary ? `${reviewSummary.distribution?.['5星'] ?? 0}` : '-' },
              { key: '1', label: '1 星', value: reviewSummary ? `${reviewSummary.distribution?.['1星'] ?? 0}` : '-' },
            ].map((s) => (
              <div className="shop-order-stat" key={s.key}>
                <div className="shop-order-stat__label">{s.label}</div>
                <div className="shop-order-stat__value" style={s.accent ? { color: s.accent } : undefined}>
                  {s.value}
                </div>
              </div>
            ))}
          </div>
          <div className="shop-toolbar">
            <Input.Search
              allowClear
              style={{ width: 240 }}
              placeholder="输入款号后回车"
              defaultValue={reviewStyleNo}
              onSearch={(v) => {
                setReviewStyleNo(v);
                void fetchReviews(1, v, reviewRating);
              }}
              enterButton
            />
            <Segmented
              value={reviewRating === undefined ? 'all' : String(reviewRating)}
              onChange={(v) => {
                const next = v === 'all' ? undefined : Number(v);
                setReviewRating(next);
                void fetchReviews(1, reviewStyleNo, next);
              }}
              options={[
                { value: 'all', label: '全部星级' },
                { value: '5', label: '5 星' },
                { value: '4', label: '4 星' },
                { value: '3', label: '3 星' },
                { value: '2', label: '2 星' },
                { value: '1', label: '1 星' },
              ]}
            />
            <div className="shop-toolbar__spacer" />
            <Text type="secondary">
              共 <Text strong>{reviewTotal}</Text> 条评价
            </Text>
            <Tooltip title="重新拉取评价">
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void fetchReviews(reviewPage);
                  void fetchReviewSummary();
                }}
              >
                刷新
              </Button>
            </Tooltip>
          </div>
          <ResizableTable
            rowKey="id"
            size="small"
            columns={reviewColumns}
            dataSource={reviewRows}
            loading={reviewLoading}
            pagination={{
              current: reviewPage,
              total: reviewTotal,
              pageSize: reviewPageSize,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (p, ps) => {
                setReviewPageSize(ps);
                void fetchReviews(p, undefined, undefined, ps);
              },
            }}
            emptyDescription="还没有顾客评价"
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
              <Descriptions.Item label="商品金额">
                ¥ {Number(detailData.order.goodsAmount ?? detailData.order.totalAmount).toFixed(2)}
              </Descriptions.Item>
              <Descriptions.Item label="运费">
                {Number(detailData.order.shippingFee || 0) > 0
                  ? <Text className="shop-amount">¥ {Number(detailData.order.shippingFee).toFixed(2)}</Text>
                  : <Text type="secondary">包邮</Text>}
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