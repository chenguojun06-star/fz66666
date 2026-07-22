import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { parseProductionOrderLines, toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import type { CuttingBundle, ProductionOrder } from '@/types/production';
import type { OrderLine } from '@/types/production';
import OrderStatusTag from '@/components/common/OrderStatusTag';
import type { FlowStage, OrderFlowResponse } from './useOrderFlowData';

export const orderStatusTag = (status: any) => <OrderStatusTag status={status} />;

export const statusTag = (status: FlowStage['status']) => {
  if (status === 'completed') return React.createElement(Tag, { color: 'success' }, '已完成');
  if (status === 'in_progress') return React.createElement(Tag, { color: 'processing' }, '进行中');
  return React.createElement(Tag, null, '未开始');
};

const getDisplayOperator = (...names: (string | undefined | null)[]): string => {
  for (const n of names) {
    if (n && n !== '系统管理员') return n;
  }
  return '未记录';
};

const calculateDurationLabel = (record: FlowStage): React.ReactNode => {
  const start = record.startTime ? new Date(record.startTime).getTime() : 0;
  if (!start) return React.createElement('span', { style: { color: 'var(--color-text-quaternary)' } }, '-');
  const end = record.completeTime
    ? new Date(record.completeTime).getTime()
    : record.status === 'in_progress' ? Date.now() : 0;
  if (!end) return React.createElement('span', { style: { color: 'var(--color-text-quaternary)' } }, '-');
  const hours = Math.round((end - start) / 3600000);
  if (hours <= 0) return React.createElement('span', { style: { color: 'var(--color-text-quaternary)' } }, '-');
  const days = Math.floor(hours / 24);
  const remainHours = hours % 24;
  const label = days > 0 ? `${days}天${remainHours}小时` : `${hours}小时`;
  const color = hours > 336 ? 'var(--color-error)' : hours > 168 ? 'var(--color-warning)' : '#595959';
  return React.createElement(
    'span',
    { style: { color, fontSize: 14, fontWeight: hours > 168 ? 600 : 400 } },
    record.status === 'in_progress' ? `⏳${label}` : label,
  );
};

export const buildStageColumns = (): ColumnsType<FlowStage> => [
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
    render: (_: unknown, record: FlowStage) => calculateDurationLabel(record),
  },
];

export const enrichStagesWithPurchase = (data: OrderFlowResponse | null): FlowStage[] => {
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
    const isProcurementManuallyCompleted = order?.procurementManuallyCompleted === 1;
    if (isProcurementManuallyCompleted || materialArrivalRate >= 100) {
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
      purchaseStage.startOperatorName = getDisplayOperator(
        firstPurchase?.receiverName,
        firstPurchase?.creatorName,
      );

      if (purchaseStage.status === 'completed') {
        purchaseStage.completeTime = lastPurchase?.updateTime || lastPurchase?.createTime;
        purchaseStage.completeOperatorName = getDisplayOperator(
          lastPurchase?.receiverName,
          lastPurchase?.auditOperatorName,
          lastPurchase?.updaterName,
        );
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
};

export const computeOrderLines = (
  order: ProductionOrder | undefined,
  warehousings: any[],
  cuttingBundles: CuttingBundle[],
  styleQuotationTotalPrice: number,
): OrderLine[] => {
  const lines = parseProductionOrderLines(order || null) as OrderLine[];
  const unitPrice =
    Number(order?.factoryUnitPrice) ||
    styleQuotationTotalPrice ||
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
};

export const buildOrderLineColumns = (): ColumnsType<OrderLine> => [
  { title: 'SKU号', dataIndex: 'skuNo', key: 'skuNo', width: 240, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 140, render: (v: unknown) => String(v || '').trim() || '-' },
  { title: '尺码', dataIndex: 'size', key: 'size', width: 100, render: (v: unknown) => String(v || '').trim() || '-' },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
  { title: '单价', dataIndex: 'totalPrice', key: 'totalPrice', width: 110, align: 'right', render: (v: unknown) => {
    const val = toNumberSafe(v);
    return val > 0 ? formatMoney(val) : '-';
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

export const computeWarehousingTotal = (warehousings: any[]): number =>
  warehousings.reduce((sum, w) => sum + toNumberSafe(w?.warehousingQuantity), 0);

export const computeWarehousingQualified = (warehousings: any[]): number =>
  warehousings.reduce((sum, w) => sum + toNumberSafe(w?.qualifiedQuantity), 0);

export const computeWarehousingUnqualified = (warehousings: any[]): number =>
  warehousings.reduce((sum, w) => sum + toNumberSafe(w?.unqualifiedQuantity), 0);

export const computeCuttingSizeItems = (bundles: CuttingBundle[]) => {
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
};
