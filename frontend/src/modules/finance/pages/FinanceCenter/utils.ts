import dayjs from 'dayjs';
import type { FormInstance } from 'antd';
import { toMoney } from '@/utils/format';
import type { FactorySummaryRow, FactorySummaryStats, FactorySummaryTotals } from './useFactorySummaryData';

export function computeStats(
  data: FactorySummaryRow[],
  pushedFactoryIds: Set<string>,
): FactorySummaryStats {
  const pendingCount = data.filter(
    r => r.factoryType !== 'INTERNAL' && !pushedFactoryIds.has(r.factoryId || r.factoryName),
  ).length;
  const approvedCount = data.filter(r => pushedFactoryIds.has(r.factoryId || r.factoryName)).length;
  const totalAmount = data.reduce((s: number, r) => s + Number(r.totalAmount || 0), 0);
  return { total: data.length, pendingCount, approvedCount, totalAmount };
}

export function filterDataByTab(
  data: FactorySummaryRow[],
  statusTab: string,
  pushedFactoryIds: Set<string>,
): FactorySummaryRow[] {
  if (!statusTab) return data;
  if (statusTab === 'pending')
    return data.filter(
      r => r.factoryType !== 'INTERNAL' && !pushedFactoryIds.has(r.factoryId || r.factoryName),
    );
  if (statusTab === 'approved')
    return data.filter(r => pushedFactoryIds.has(r.factoryId || r.factoryName));
  return data;
}

export function filterExternalFactories(data: FactorySummaryRow[]): FactorySummaryRow[] {
  return data.filter(r => r.factoryType !== 'INTERNAL');
}

export function computeTotals(filteredData: FactorySummaryRow[]): FactorySummaryTotals {
  const totalOrders = filteredData.reduce((s, r) => s + (r.orderCount || 0), 0);
  const totalQty = filteredData.reduce((s, r) => s + (r.totalOrderQuantity || 0), 0);
  const totalWarehoused = filteredData.reduce((s, r) => s + (r.totalWarehousedQuantity || 0), 0);
  const totalDefect = filteredData.reduce((s, r) => s + (r.totalDefectQuantity || 0), 0);
  const totalMaterialCost = filteredData.reduce((s, r) => s + Number(r.totalMaterialCost || 0), 0);
  const totalProductionCost = filteredData.reduce(
    (s, r) => s + Number(r.totalProductionCost || 0),
    0,
  );
  const totalAmount = filteredData.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalProfit = filteredData.reduce((s, r) => s + Number(r.totalProfit || 0), 0);
  return {
    totalOrders,
    totalQty,
    totalWarehoused,
    totalDefect,
    totalMaterialCost,
    totalProductionCost,
    totalAmount,
    totalProfit,
  };
}

export function getPrintData(
  selectedRowKeys: string[],
  data: FactorySummaryRow[],
): Array<{
  factoryId: string;
  factoryName: string;
  totalAmount: number;
  totalOrderQuantity: number;
  orderCount: number;
  orderNos: string[];
}> {
  return selectedRowKeys
    .map(key => {
      const summary = data.find(
        (r: FactorySummaryRow) => r.factoryName === key || r.factoryId === key,
      );
      if (!summary) return null;
      return {
        factoryId: summary.factoryId,
        factoryName: summary.factoryName,
        totalAmount: summary.totalAmount,
        totalOrderQuantity: summary.totalOrderQuantity,
        orderCount: summary.orderCount,
        orderNos: summary.orderNos,
      };
    })
    .filter(Boolean) as Array<{
    factoryId: string;
    factoryName: string;
    totalAmount: number;
    totalOrderQuantity: number;
    orderCount: number;
    orderNos: string[];
  }>;
}

export function getDateRange(form: FormInstance): [string, string] {
  try {
    if (!form.isFieldsTouched()) return ['-', '-'];
    const values = form.getFieldsValue();
    if (values.dateRange && values.dateRange.length === 2) {
      return [
        values.dateRange[0].format('YYYY-MM-DD'),
        values.dateRange[1].format('YYYY-MM-DD'),
      ];
    }
  } catch {
    /* form not connected yet */
  }
  return ['-', '-'];
}

export function extractApprovedOrderNos(rows: FactorySummaryRow[]): Set<string> {
  const approvedNos = new Set<string>();
  rows.forEach(row => {
    (row.approvedOrderNos ?? []).forEach(no => approvedNos.add(no));
  });
  return approvedNos;
}

export function buildPayableDescription(record: FactorySummaryRow): string {
  return `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件 | 面料:${record.totalMaterialCost || 0} · 工费:${record.totalProductionCost || 0} · 利润:${record.totalProfit || 0} · 次品:${record.totalDefectQuantity || 0} · 入库:${record.totalWarehousedQuantity || 0} · 订单量:${record.totalOrderQuantity || 0}`;
}

export function formatExportData(data: FactorySummaryRow[]): Array<Record<string, unknown>> {
  return data.map((item: FactorySummaryRow) => ({
    工厂名称: item.factoryName || '-',
    订单数: item.orderCount || 0,
    下单总量: item.totalOrderQuantity || 0,
    入库总量: item.totalWarehousedQuantity || 0,
    次品量: item.totalDefectQuantity || 0,
    面辅料成本: item.totalMaterialCost || 0,
    生产成本: item.totalProductionCost || 0,
    总金额: item.totalAmount || 0,
    利润: item.totalProfit || 0,
    订单号列表: item.orderNos?.join(', ') || '-',
  }));
}

export const exportHeaders = [
  '工厂名称',
  '订单数',
  '下单总量',
  '入库总量',
  '次品量',
  '面辅料成本',
  '生产成本',
  '总金额',
  '利润',
  '订单号列表',
];

export function buildExportFileName(): string {
  return `工厂订单汇总_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`;
}

export function buildApproveConfirmContent(record: FactorySummaryRow): string {
  return `确认将工厂「${record.factoryName}」的 ${record.orderCount} 个订单（总金额 ¥${toMoney(record.totalAmount)}）终审推送到收付款中心？`;
}

export function buildBatchApproveConfirmContent(selected: FactorySummaryRow[]): {
  totalAmount: number;
  totalOrders: number;
  content: string;
} {
  const totalAmount = selected.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalOrders = selected.reduce((s, r) => s + (r.orderCount || 0), 0);
  const content = `确认将 ${selected.length} 个工厂（共 ${totalOrders} 个订单，总金额 ¥${toMoney(totalAmount)}）终审推送到收付款中心？`;
  return { totalAmount, totalOrders, content };
}
