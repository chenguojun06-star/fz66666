import React, { useEffect, useMemo, useState } from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useLocation } from 'react-router-dom';
import api, { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { formatDateTime } from '@/utils/datetime';
import type { CuttingBundle, ProductionOrder, ProductWarehousing } from '@/types/production';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { message } from '@/utils/antdStatic';

export type FlowStage = {
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

export type OrderFlowResponse = {
  order: ProductionOrder;
  stages: FlowStage[];
  warehousings?: ProductWarehousing[];
  cuttingBundles?: CuttingBundle[];
  materialPurchases?: any[];
};

export type OrderLine = {
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
  totalPrice?: number;
  qualityQuantity?: number;
  defectiveQuantity?: number;
  warehousingQuantity?: number;
};

export const orderStatusTag = (status: any) => {
  const s = String(status || '').trim();
  const map: Record<string, { color: string; label: string }> = {
    pending: { color: 'default', label: '待生产' },
    production: { color: 'success', label: '生产中' },
    completed: { color: 'default', label: '已完成' },
    delayed: { color: 'warning', label: '已逾期' },
    scrapped: { color: 'default', label: '已报废' },
    cancelled: { color: 'error', label: '已取消' },
    canceled: { color: 'error', label: '已取消' },
    closed: { color: 'default', label: '已关单' },
    archived: { color: 'default', label: '已归档' },
    paused: { color: 'default', label: '已暂停' },
    returned: { color: 'error', label: '已退回' },
  };
  const t = map[s] || { color: 'default', label: '未知' };
  return React.createElement(Tag, { color: t.color }, t.label);
};

const statusTag = (status: FlowStage['status']) => {
  if (status === 'completed') return React.createElement(Tag, { color: 'default' }, '已完成');
  if (status === 'in_progress') return React.createElement(Tag, { color: 'success' }, '进行中');
  return React.createElement(Tag, null, '未开始');
};

export function useOrderFlowData() {
  const location = useLocation();
  const { user } = useAuth();
  const isFactoryUser = !!(user as any)?.factoryId;

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
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [styleProcessDescriptionMap, setStyleProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const [secondaryProcessDescriptionMap, setSecondaryProcessDescriptionMap] = useState<Map<string, string>>(new Map());
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  const fetchFlow = async () => {
    if (!query.orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: any }>(`/production/order/flow/${query.orderId}`);
      if (res.code === 200) {
        const flowData = res.data as OrderFlowResponse;
        setData(flowData || null);
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('订单全流程加载失败', res.message || '服务返回异常，请稍后重试', 'ORDER_FLOW_LOAD_FAILED');
        message.error(res.message || '获取订单全流程失败');
        setData(null);
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('订单全流程加载失败', errMsg, 'ORDER_FLOW_LOAD_EXCEPTION');
      message.error(e instanceof Error ? e.message : '获取订单全流程失败');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFlow();
  }, [query.orderId]);

  useEffect(() => {
    const styleId = String(data?.order?.styleId || '').trim();
    if (!styleId) {
      setStyleProcessDescriptionMap(new Map());
      setSecondaryProcessDescriptionMap(new Map());
      return;
    }
    (async () => {
      try {
        const [processRes, secondaryRes] = await Promise.all([
          api.get(`/style/process/list?styleId=${styleId}`),
          api.get(`/style/secondary-process/list?styleId=${styleId}`),
        ]);
        const processRows = Array.isArray((processRes as any)?.data) ? (processRes as any).data : [];
        const secondaryRows = Array.isArray((secondaryRes as any)?.data) ? (secondaryRes as any).data : [];
        const nextProcessMap = new Map<string, string>();
        const nextSecondaryMap = new Map<string, string>();
        processRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextProcessMap.set(name, description);
        });
        secondaryRows.forEach((item: any) => {
          const name = String(item?.processName || item?.name || '').trim();
          const description = String(item?.description || '').trim();
          if (name && description) nextSecondaryMap.set(name, description);
        });
        setStyleProcessDescriptionMap(nextProcessMap);
        setSecondaryProcessDescriptionMap(nextSecondaryMap);
      } catch {
        setStyleProcessDescriptionMap(new Map());
        setSecondaryProcessDescriptionMap(new Map());
      }
    })();
  }, [data?.order?.styleId]);

  const enrichedStages = useMemo(() => {
    const stages = data?.stages || [];
    const materialPurchases = data?.materialPurchases || [];
    const order = data?.order;

    if (materialPurchases.length > 0 || (order?.materialArrivalRate !== undefined && order?.materialArrivalRate !== null)) {
      const purchaseStage: FlowStage = {
        processName: '采购',
        status: 'not_started',
        totalQuantity: 0,
      };

      const materialArrivalRate = order?.materialArrivalRate || 0;
      if (materialArrivalRate >= 100) {
        purchaseStage.status = 'completed';
      } else if (materialArrivalRate > 0) {
        purchaseStage.status = 'in_progress';
      }

      if (materialPurchases.length > 0) {
        const sortedPurchases = [...materialPurchases].sort((a: any, b: any) => {
          const timeA = a.createTime ? new Date(a.createTime).getTime() : 0;
          const timeB = b.createTime ? new Date(b.createTime).getTime() : 0;
          return timeA - timeB;
        });

        const firstPurchase = sortedPurchases[0] as any;
        const lastPurchase = sortedPurchases[sortedPurchases.length - 1] as any;

        purchaseStage.startTime = firstPurchase?.createTime;
        purchaseStage.startOperatorName = firstPurchase?.creatorName || firstPurchase?.receiverName || '未记录';

        if (purchaseStage.status === 'completed') {
          purchaseStage.completeTime = lastPurchase?.updateTime || lastPurchase?.createTime;
          purchaseStage.completeOperatorName = lastPurchase?.updaterName || lastPurchase?.receiverName || '未记录';
        }

        purchaseStage.totalQuantity = materialPurchases.length;
      }

      const existingPurchaseIndex = stages.findIndex((s: FlowStage) => s.processName === '采购');
      if (existingPurchaseIndex >= 0) {
        return [...stages.slice(0, existingPurchaseIndex), purchaseStage, ...stages.slice(existingPurchaseIndex + 1)];
      } else {
        return [stages[0], purchaseStage, ...stages.slice(1)].filter(Boolean);
      }
    }

    return stages;
  }, [data]);

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
      render: (v: unknown) => statusTag(String(v || 'not_started') as any),
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
    {
      title: '耗时',
      key: 'duration',
      width: 120,
      render: (_: unknown, record: FlowStage) => {
        const start = record.startTime ? new Date(record.startTime).getTime() : 0;
        if (!start) return React.createElement('span', { style: { color: '#bfbfbf' } }, '-');
        const end = record.completeTime
          ? new Date(record.completeTime).getTime()
          : record.status === 'in_progress' ? Date.now() : 0;
        if (!end) return React.createElement('span', { style: { color: '#bfbfbf' } }, '-');
        const hours = Math.round((end - start) / 3600000);
        if (hours <= 0) return React.createElement('span', { style: { color: '#bfbfbf' } }, '-');
        const days = Math.floor(hours / 24);
        const remainHours = hours % 24;
        const label = days > 0 ? `${days}天${remainHours}小时` : `${hours}小时`;
        const color = hours > 336 ? '#cf1322' : hours > 168 ? '#fa8c16' : '#595959';
        return React.createElement(
          'span',
          { style: { color, fontSize: 12, fontWeight: hours > 168 ? 600 : 400 } },
          record.status === 'in_progress' ? `⏳${label}` : label,
        );
      },
    },
  ];

  const order = data?.order;

  const orderLines = useMemo(() => {
    const lines = parseProductionOrderLines(order || null) as OrderLine[];
    const warehousings = (data?.warehousings || []) as ProductWarehousing[];
    const cuttingBundles = (data?.cuttingBundles || []) as CuttingBundle[];
    const unitPrice =
      Number(order?.factoryUnitPrice) ||
      Number((data as any)?.styleQuotation?.totalPrice) ||
      0;

    return lines.map(line => {
      const matchedBundles = cuttingBundles.filter(b =>
        b.color === line.color && b.size === line.size
      );
      const bundleIds = matchedBundles.map(b => b.id);

      const matchedWarehousings = warehousings.filter(w =>
        bundleIds.includes(w.cuttingBundleId || '')
      );

      const qualityQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.qualifiedQuantity || 0) + (w.unqualifiedQuantity || 0), 0);
      const defectiveQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.unqualifiedQuantity || 0), 0);
      const warehousingQuantity = matchedWarehousings.reduce((sum, w) =>
        sum + (w.warehousingQuantity || 0), 0);

      const totalPrice = unitPrice > 0 ? unitPrice : 0;

      return {
        ...line,
        totalPrice,
        qualityQuantity,
        defectiveQuantity,
        warehousingQuantity,
      };
    });
  }, [order, data?.warehousings, data?.cuttingBundles, (data as any)?.styleQuotation]);

  const orderLineColumns: ColumnsType<OrderLine> = [
    { title: 'SKU号', dataIndex: 'skuNo', key: 'skuNo', width: 240, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 100, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '单价', dataIndex: 'totalPrice', key: 'totalPrice', width: 110, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? `¥${val.toFixed(2)}` : '-';
    }},
    { title: '质检数', dataIndex: 'qualityQuantity', key: 'qualityQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? React.createElement('span', { style: { color: 'var(--primary-color)' } }, val) : '-';
    }},
    { title: '次品数', dataIndex: 'defectiveQuantity', key: 'defectiveQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? React.createElement('span', { style: { color: 'var(--color-danger)' } }, val) : '-';
    }},
    { title: '入库数', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 90, align: 'right', render: (v: unknown) => {
      const val = toNumberSafe(v);
      return val > 0 ? React.createElement('span', { style: { color: 'var(--color-success)' } }, val) : '-';
    }},
  ];

  const warehousingTotal = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.warehousingQuantity), 0),
    [data?.warehousings],
  );
  const warehousingQualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.qualifiedQuantity), 0),
    [data?.warehousings],
  );
  const warehousingUnqualified = useMemo(
    () => (data?.warehousings || []).reduce((sum, w) => sum + toNumberSafe((w as any)?.unqualifiedQuantity), 0),
    [data?.warehousings],
  );

  const cuttingSizeItems = useMemo(() => {
    const bundles = (data?.cuttingBundles || []) as CuttingBundle[];
    if (bundles.length === 0) return undefined;
    const map = new Map<string, { color?: string; size: string; quantity: number }>();
    bundles.forEach(bundle => {
      const color = String(bundle.color || '').trim();
      const size = String(bundle.size || '').trim();
      const qty = toNumberSafe(bundle.quantity);
      if (size && qty > 0) {
        const key = `${color}__${size}`;
        const cur = map.get(key);
        if (cur) { cur.quantity += qty; }
        else { map.set(key, { color: color || undefined, size, quantity: qty }); }
      }
    });
    return Array.from(map.values());
  }, [data?.cuttingBundles]);

  return {
    query,
    loading,
    data,
    order,
    isFactoryUser,
    smartError,
    showSmartErrorNotice,
    fetchFlow,
    enrichedStages,
    stageColumns,
    orderLines,
    orderLineColumns,
    warehousingTotal,
    warehousingQualified,
    warehousingUnqualified,
    cuttingSizeItems,
    styleProcessDescriptionMap,
    secondaryProcessDescriptionMap,
  };
}
