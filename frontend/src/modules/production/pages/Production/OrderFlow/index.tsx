import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Card, Space, Table, Tabs, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import api, { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import type { CuttingBundle, CuttingTask, MaterialPurchase, ProductionOrder, ProductWarehousing, ScanRecord } from '@/types/production';
import type { MaterialReconciliation, ShipmentReconciliation } from '@/types/finance';
import './styles.css';

type FlowStage = {
  processName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  totalQuantity?: number;
  startTime?: string;
  startOperatorId?: string;
  startOperatorName?: string;
  completeTime?: string;
  completeOperatorId?: string;
  completeOperatorName?: string;
  lastTime?: string;
  lastOperatorId?: string;
  lastOperatorName?: string;
};

type OrderFlowResponse = {
  order: ProductionOrder;
  stages: FlowStage[];
  records: ScanRecord[];
  materialPurchases?: MaterialPurchase[];
  cuttingTasks?: CuttingTask[];
  cuttingBundles?: CuttingBundle[];
  warehousings?: ProductWarehousing[];
  materialReconciliations?: MaterialReconciliation[];
  shipmentReconciliations?: ShipmentReconciliation[];
};

type OrderLine = {
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
};

const isSystemStageRecord = (r: Record<string, unknown>) => {
  const requestId = String(r?.requestId || '').trim();
  if (!requestId) return false;
  return requestId.startsWith('ORDER_CREATED:') || requestId.startsWith('ORDER_PROCUREMENT:');
};

const orderStatusTag = (status: any) => {
  const s = String(status || '').trim();
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: 'default', label: '待开始' },
    production: { color: 'blue', label: '生产中' },
    completed: { color: 'green', label: '已完成' },
    delayed: { color: 'red', label: '已逾期' },
  };
  const t = map[s] || { color: 'default', label: '未知' };
  return <Tag color={t.color}>{t.label}</Tag>;
};


const statusTag = (status: FlowStage['status']) => {
  if (status === 'completed') return <Tag color="green">已完成</Tag>;
  if (status === 'in_progress') return <Tag color="blue">进行中</Tag>;
  return <Tag>未开始</Tag>;
};

const stageStatusText = (status: any) => {
  const map: Record<string, string> = {
    pending: '待处理',
    not_started: '未开始',
    in_progress: '进行中',
    received: '已领取',
    partial: '部分完成',
    completed: '已完成',
    cancelled: '已取消',
    bundled: '已完成',
    qualified: '合格',
    unqualified: '不合格',
    repaired: '返修完成',
    repairing: '返修中',
    active: '启用',
    inactive: '停用',
  };
  const key = String(status || '').trim().toLowerCase();
  if (!key) return '未开始';
  return map[key] || '未知';
};

const OrderFlow: React.FC = () => {
  const location = useLocation();

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return {
      orderId: String(params.get('orderId') || '').trim(),
      orderNo: String(params.get('orderNo') || '').trim(),
      styleNo: String(params.get('styleNo') || '').trim(),
    };
  }, [location.search]);

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OrderFlowResponse | null>(null);

  const fetchFlow = async () => {
    if (!query.orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        setData(res.data || null);
      } else {
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: unknown) {
      message.error(e?.message || '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  }, [query.orderId]);

  const stageColumns: ColumnsType<FlowStage> = [
    {
      title: '环节',
      dataIndex: 'processName',
      key: 'processName',
      width: 160,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (v: unknown) => statusTag(String(v || 'not_started') as Record<string, unknown>),
    },
    {
      title: '累计数量',
      dataIndex: 'totalQuantity',
      key: 'totalQuantity',
      width: 110,
      align: 'right',
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '开始时间',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 170,
      render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-'),
    },
    {
      title: '开始操作人',
      dataIndex: 'startOperatorName',
      key: 'startOperatorName',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completeTime',
      key: 'completeTime',
      width: 170,
      render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-'),
    },
    {
      title: '完成操作人',
      dataIndex: 'completeOperatorName',
      key: 'completeOperatorName',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
  ];

  const recordColumns: ColumnsType<ScanRecord> = [
    {
      title: '时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 170,
      render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-'),
    },
    {
      title: '环节',
      dataIndex: 'processName',
      key: 'processName',
      width: 140,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '类型',
      dataIndex: 'scanType',
      key: 'scanType',
      width: 110,
      render: (v: unknown) => {
        const map: Record<string, { color: string; label: string }> = {
          material: { color: 'gold', label: '物料' },
          procurement: { color: 'gold', label: '采购' },
          production: { color: 'blue', label: '生产' },
          sewing: { color: 'blue', label: '车缝' },
          ironing: { color: 'blue', label: '整烫' },
          packaging: { color: 'blue', label: '包装' },
          quality: { color: 'purple', label: '质检' },
          warehouse: { color: 'green', label: '入库' },
          shipment: { color: 'orange', label: '出货' },
          cutting: { color: 'geekblue', label: '裁剪' },
        };
        const t = map[String(v || '')] || { color: 'default', label: '未知' };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
      render: (v: unknown) => String(v || '').trim() || '-',
    },
  ];

  const order = data?.order;

  const orderLines = useMemo(() => parseProductionOrderLines(order || null) as OrderLine[], [order]);
  const materialPurchases = (data?.materialPurchases || []) as MaterialPurchase[];
  const cuttingTasks = (data?.cuttingTasks || []) as CuttingTask[];
  const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
  const warehousings = (data?.warehousings || []) as ProductWarehousing[];
  const materialReconciliations = (data?.materialReconciliations || []) as Record<string, unknown>[];
  const shipmentReconciliations = (data?.shipmentReconciliations || []) as Record<string, unknown>[];

  const scanRecords = (data?.records || []) as ScanRecord[];
  const userScanRecords = useMemo(() => {
    return scanRecords.filter((r) => !isSystemStageRecord(r as Record<string, unknown>));
  }, [scanRecords]);
  const materialScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'material'),
    [userScanRecords],
  );
  const cuttingScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'cutting'),
    [userScanRecords],
  );
  const productionScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'production'),
    [userScanRecords],
  );
  const qualityScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'quality'),
    [userScanRecords],
  );
  const warehousingScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'warehouse'),
    [userScanRecords],
  );
  const shipmentScans = useMemo(
    () => userScanRecords.filter((r) => String((r as Record<string, unknown>)?.scanType || '').trim() === 'shipment'),
    [userScanRecords],
  );

  const orderLineColumns: ColumnsType<OrderLine> = [
    { title: 'SKU号', dataIndex: 'skuNo', key: 'skuNo', width: 260, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 160, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 110, align: 'right', render: (v: unknown) => toNumberSafe(v) },
  ];

  const purchaseColumns: ColumnsType<MaterialPurchase> = [
    { title: '采购单号', dataIndex: 'purchaseNo', key: 'purchaseNo', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '物料', dataIndex: 'materialName', key: 'materialName', width: 200, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 160, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '采购', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '到货', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: unknown) => {
        const s = String(v || '').trim();
        const map: Record<string, { color: string; label: string }> = {
          pending: { color: 'default', label: '待采购' },
          received: { color: 'green', label: '已到货' },
          partial: { color: 'gold', label: '部分到货' },
          completed: { color: 'green', label: '已到货' },
          cancelled: { color: 'red', label: '已取消' },
        };
        const t = map[s] || { color: 'default', label: '未知' };
        return <Tag color={t.color}>{t.label}</Tag>;
      }
    },
    { title: '到货时间', dataIndex: 'receivedTime', key: 'receivedTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
  ];

  const cuttingTaskColumns: ColumnsType<CuttingTask> = [
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (v: unknown) => {
        const s = String(v || '').trim();
        const map: Record<string, { color: string; label: string }> = {
          pending: { color: 'default', label: '待领取' },
          received: { color: 'blue', label: '已领取' },
          bundled: { color: 'green', label: '已完成' },
        };
        const t = map[s] || { color: 'default', label: '未知' };
        return <Tag color={t.color}>{t.label}</Tag>;
      }
    },
    { title: '领取人', dataIndex: 'receiverName', key: 'receiverName', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '领取时间', dataIndex: 'receivedTime', key: 'receivedTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '完成时间', dataIndex: 'bundledTime', key: 'bundledTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '裁剪数', dataIndex: 'cuttingQuantity', key: 'cuttingQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '扎数', dataIndex: 'cuttingBundleCount', key: 'cuttingBundleCount', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
  ];

  const cuttingBundleColumns: ColumnsType<CuttingBundle> = [
    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', width: 240, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: (v: unknown) => stageStatusText(v) },
    { title: '生成时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
  ];

  const warehousingColumns: ColumnsType<ProductWarehousing> = [
    { title: '入库单号', dataIndex: 'warehousingNo', key: 'warehousingNo', width: 150, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '仓库', dataIndex: 'warehouse', key: 'warehouse', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '入库数量', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 100, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '合格', dataIndex: 'qualifiedQuantity', key: 'qualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '不合格', dataIndex: 'unqualifiedQuantity', key: 'unqualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '质检', dataIndex: 'qualityStatus', key: 'qualityStatus', width: 110, render: (v: unknown) => stageStatusText(v) },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
  ];

  const materialReconColumns: ColumnsType<unknown> = [
    { title: '对账单号', dataIndex: 'reconciliationNo', key: 'reconciliationNo', width: 160, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '物料', dataIndex: 'materialName', key: 'materialName', ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '采购单号', dataIndex: 'purchaseNo', key: 'purchaseNo', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: unknown) => {
        const s = String(v || '').trim();
        const map: Record<string, { color: string; label: string }> = {
          pending: { color: 'default', label: '待审核' },
          verified: { color: 'blue', label: '已验证' },
          approved: { color: 'gold', label: '已批准' },
          paid: { color: 'green', label: '已付款' },
          rejected: { color: 'red', label: '已拒绝' },
        };
        const t = map[s] || { color: 'default', label: '未知' };
        return <Tag color={t.color}>{t.label}</Tag>;
      }
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '扣款', dataIndex: 'deductionAmount', key: 'deductionAmount', width: 100, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '最终', dataIndex: 'finalAmount', key: 'finalAmount', width: 100, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '对账日期', dataIndex: 'reconciliationDate', key: 'reconciliationDate', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
  ];

  const shipmentReconColumns: ColumnsType<unknown> = [
    { title: '对账单号', dataIndex: 'reconciliationNo', key: 'reconciliationNo', width: 160, render: (_: any, r: any) => String(r?.reconciliationNo || r?.settlementNo || '').trim() || '-' },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 140, render: (_: any, r: any) => String(r?.customerName || r?.customer || r?.customerId || '-').trim() || '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100, render: (v: unknown) => {
        const s = String(v || '').trim();
        const map: Record<string, { color: string; label: string }> = {
          pending: { color: 'default', label: '待审核' },
          verified: { color: 'blue', label: '已验证' },
          approved: { color: 'gold', label: '已批准' },
          paid: { color: 'green', label: '已收款' },
          rejected: { color: 'red', label: '已拒绝' },
        };
        const t = map[s] || { color: 'default', label: '未知' };
        return <Tag color={t.color}>{t.label}</Tag>;
      }
    },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 110, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '扣款', dataIndex: 'deductionAmount', key: 'deductionAmount', width: 100, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    { title: '最终', dataIndex: 'finalAmount', key: 'finalAmount', width: 100, align: 'right', render: (v: unknown) => toNumberSafe(v).toFixed(2) },
    {
      title: '对账日期', dataIndex: 'reconciliationDate', key: 'reconciliationDate', width: 170, render: (_: any, r: any) => {
        const v = r?.reconciliationDate || r?.settlementDate;
        return String(v || '').trim() ? formatDateTime(v) : '-';
      }
    },
  ];

  const warehousingTotal = useMemo(
    () => warehousings.reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.warehousingQuantity), 0),
    [warehousings],
  );
  const warehousingQualified = useMemo(
    () => warehousings.reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.qualifiedQuantity), 0),
    [warehousings],
  );
  const warehousingUnqualified = useMemo(
    () => warehousings.reduce((sum, w) => sum + toNumberSafe((w as Record<string, unknown>)?.unqualifiedQuantity), 0),
    [warehousings],
  );

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">订单全流程记录</h2>
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
            </Space>
          </div>

          {!query.orderId ? (
            <Alert
              type="warning"
              showIcon
              title="缺少订单ID，无法打开全流程记录"
              description="请从我的订单列表点击订单号进入。"
            />
          ) : null}

          <Card size="small" className="order-flow-detail" style={{ marginTop: 12 }} loading={loading}>
            <ProductionOrderHeader
              order={order}
              orderLines={orderLines}
              orderNo={String((order as Record<string, unknown>)?.orderNo || query.orderNo || '').trim()}
              styleNo={String((order as Record<string, unknown>)?.styleNo || query.styleNo || '').trim()}
              styleName={String((order as Record<string, unknown>)?.styleName || '').trim()}
              styleId={(order as Record<string, unknown>)?.styleId}
              styleCover={(order as Record<string, unknown>)?.styleCover || null}
              color={String((order as Record<string, unknown>)?.color || '').trim()}
              totalQuantity={toNumberSafe((order as Record<string, unknown>)?.orderQuantity)}
              coverSize={160}
              qrSize={120}
              extraFields={[
                { label: '加工厂', value: (order as Record<string, unknown>)?.factoryName || '-' },
                { label: '订单状态', value: orderStatusTag((order as Record<string, unknown>)?.status) },
                { label: '下单数', value: toNumberSafe((order as Record<string, unknown>)?.orderQuantity) },
                { label: '已完成', value: toNumberSafe((order as Record<string, unknown>)?.completedQuantity) },
                { label: '生产进度', value: `${toNumberSafe((order as Record<string, unknown>)?.productionProgress)}%` },
                { label: '当前环节', value: String((order as Record<string, unknown>)?.currentProcessName || '').trim() || '-' },
                { label: '扎数', value: toNumberSafe((order as Record<string, unknown>)?.cuttingBundleCount) },
                { label: '入库数', value: warehousingTotal },
                { label: '计划开始', value: (order as Record<string, unknown>)?.plannedStartDate ? formatDateTime((order as Record<string, unknown>)?.plannedStartDate) : '-' },
                { label: '计划交期', value: (order as Record<string, unknown>)?.plannedEndDate ? formatDateTime((order as Record<string, unknown>)?.plannedEndDate) : '-' },
                { label: '入库合格/不合格', value: `${warehousingQualified}/${warehousingUnqualified}` },
                { label: '下单时间', value: (order as Record<string, unknown>)?.createTime ? formatDateTime((order as Record<string, unknown>)?.createTime) : '-' },
                { label: '实际完成', value: (order as Record<string, unknown>)?.actualEndDate ? formatDateTime((order as Record<string, unknown>)?.actualEndDate) : '-' },
                { label: '更新时间', value: (order as Record<string, unknown>)?.updateTime ? formatDateTime((order as Record<string, unknown>)?.updateTime) : '-' },
              ]}
            />
          </Card>

          <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 12 }} loading={loading}>
            <Tabs
              items={[
                {
                  key: 'overview',
                  label: '概览',
                  children: (
                    <div className="order-flow-module">
                      <div className="order-flow-module-title">环节汇总</div>
                      <Table
                        size="small"
                        columns={stageColumns}
                        dataSource={data?.stages || []}
                        rowKey={(r) => r.processName}
                        pagination={false}
                        scroll={{ x: 980 }}
                      />
                    </div>
                  ),
                },
                {
                  key: 'order',
                  label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
                  children: (
                    <div className="order-flow-module">
                      <div className="order-flow-module-title">订单明细-SKU</div>
                      <Table
                        size="small"
                        columns={orderLineColumns}
                        dataSource={orderLines}
                        rowKey={(r) => String((r as Record<string, unknown>)?.skuNo || `${r.color}-${r.size}`)}
                        pagination={false}
                        scroll={{ x: 780 }}
                      />
                    </div>
                  ),
                },
                {
                  key: 'material',
                  label: `物料采购${materialPurchases.length ? ` (${materialPurchases.length})` : ''}`,
                  children: (
                    <div className="order-flow-module-stack">
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">采购明细</div>
                        <Table
                          size="small"
                          columns={purchaseColumns}
                          dataSource={materialPurchases}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.purchaseNo || `purchase-${index}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 1150 }}
                        />
                      </div>
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`物料扫码${materialScans.length ? ` (${materialScans.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={recordColumns}
                          dataSource={materialScans}
                          rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'cutting',
                  label: `裁剪${(cuttingTasks.length || cuttingBundles.length) ? ` (${cuttingTasks.length}/${cuttingBundles.length})` : ''}`,
                  children: (
                    <div className="order-flow-module-stack">
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`裁剪任务${cuttingTasks.length ? ` (${cuttingTasks.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={cuttingTaskColumns}
                          dataSource={cuttingTasks}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.taskNo || `cutting-task-${index}`)}
                          pagination={false}
                          scroll={{ x: 820 }}
                        />
                      </div>

                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`扎包明细${cuttingBundles.length ? ` (${cuttingBundles.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={cuttingBundleColumns}
                          dataSource={cuttingBundles}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.qrCode || `cutting-bundle-${index}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 1050 }}
                        />
                      </div>

                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`裁剪扫码${cuttingScans.length ? ` (${cuttingScans.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={recordColumns}
                          dataSource={cuttingScans}
                          rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'production',
                  label: `生产扫码${productionScans.length ? ` (${productionScans.length})` : ''}`,
                  children: (
                    <Table
                      size="small"
                      columns={recordColumns}
                      dataSource={productionScans}
                      rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true, className: 'app-pagination-float' }}
                      scroll={{ x: 980 }}
                    />
                  ),
                },
                {
                  key: 'quality',
                  label: `质检扫码${qualityScans.length ? ` (${qualityScans.length})` : ''}`,
                  children: (
                    <Table
                      size="small"
                      columns={recordColumns}
                      dataSource={qualityScans}
                      rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true, className: 'app-pagination-float' }}
                      scroll={{ x: 980 }}
                    />
                  ),
                },
                {
                  key: 'warehouse',
                  label: `入库${warehousings.length ? ` (${warehousings.length})` : ''}`,
                  children: (
                    <div className="order-flow-module-stack">
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">入库记录</div>
                        <Table
                          size="small"
                          columns={warehousingColumns}
                          dataSource={warehousings}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.warehousingNo || `warehousing-${index}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 900 }}
                        />
                      </div>
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`入库扫码${warehousingScans.length ? ` (${warehousingScans.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={recordColumns}
                          dataSource={warehousingScans}
                          rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`出货扫码${shipmentScans.length ? ` (${shipmentScans.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={recordColumns}
                          dataSource={shipmentScans}
                          rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'finance',
                  label: `财务${(materialReconciliations.length || shipmentReconciliations.length) ? ` (${materialReconciliations.length}/${shipmentReconciliations.length})` : ''}`,
                  children: (
                    <div className="order-flow-module-stack">
                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`物料对账${materialReconciliations.length ? ` (${materialReconciliations.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={materialReconColumns}
                          dataSource={materialReconciliations}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.reconciliationNo || `material-recon-${index}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>

                      <div className="order-flow-module">
                        <div className="order-flow-module-title">{`出货对账${shipmentReconciliations.length ? ` (${shipmentReconciliations.length})` : ''}`}</div>
                        <Table
                          size="small"
                          columns={shipmentReconColumns}
                          dataSource={shipmentReconciliations}
                          rowKey={(r, index) => String((r as Record<string, unknown>)?.id || (r as Record<string, unknown>)?.reconciliationNo || (r as Record<string, unknown>)?.settlementNo || `shipment-recon-${index}`)}
                          pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: ['10', '20', '50'], simple: true, className: 'app-pagination-float' }}
                          scroll={{ x: 980 }}
                        />
                      </div>
                    </div>
                  ),
                },
                {
                  key: 'all',
                  label: `全部记录${userScanRecords.length ? ` (${userScanRecords.length})` : ''}`,
                  children: (
                    <Table
                      size="small"
                      columns={recordColumns}
                      dataSource={userScanRecords}
                      rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.scanTime || ''}-${(r as Record<string, unknown>)?.processName || ''}`)}
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true, className: 'app-pagination-float' }}
                      scroll={{ x: 980 }}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Card>
      </div>
    </Layout>
  );
};

export default OrderFlow;
