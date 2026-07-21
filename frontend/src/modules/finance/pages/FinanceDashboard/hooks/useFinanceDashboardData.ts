import { useEffect, useMemo, useState } from 'react';
import type { ColumnsType } from 'antd/es/table';
import { useFinanceBIData } from './useFinanceBIData';
import { useSync } from '@/utils/syncManager';
import {
  type CashFlowDays,
  type StatKey,
  generateCashFlowMockData,
} from '../helpers';

export interface StatCardConfig {
  key: StatKey;
  title: string;
  value: number;
  color?: string;
}

export interface DetailConfig {
  title: string;
  columns: ColumnsType<any>;
  rows: any[];
}

const buildCashFlowChartOption = (
  dates: string[],
  incomes: number[],
  expenses: number[],
) => ({
  tooltip: {
    trigger: 'axis',
    confine: true,
    backgroundColor: 'var(--color-bg-base)',
    borderColor: 'var(--color-border)',
    borderWidth: 1,
    textStyle: {
      color: 'var(--color-text-primary)',
    },
    formatter: (params: any) => {
      if (!params || params.length === 0) return '';
      const date = params[0].axisValue;
      let html = `<div style="padding: 4px 0; font-weight: 600; color: var(--color-text-primary);">${date}</div>`;
      params.forEach((item: any) => {
        const value = item.value !== undefined && item.value !== null ? item.value : 0;
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 2px 0;">
            <span style="display: flex; align-items: center; gap: 8px;">
              <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${item.color};"></span>
              <span style="color: var(--color-text-primary);">${item.seriesName}</span>
            </span>
            <span style="font-weight: 600; color: var(--color-text-primary);">¥${Number(value).toLocaleString()}</span>
          </div>
        `;
      });
      return html;
    },
  },
  legend: {
    data: ['收入', '支出'],
    top: 5,
    textStyle: {
      fontSize: 14,
      color: 'var(--color-text-secondary)',
    },
  },
  grid: {
    left: '3%',
    right: '4%',
    bottom: '5px',
    top: 35,
    containLabel: true,
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: dates,
    axisLine: {
      lineStyle: {
        color: 'var(--color-border)',
      },
    },
    axisLabel: {
      color: 'var(--color-text-tertiary)',
      fontSize: 12,
    },
  },
  yAxis: {
    type: 'value',
    axisLine: {
      show: false,
    },
    axisTick: {
      show: false,
    },
    axisLabel: {
      color: 'var(--color-text-tertiary)',
      fontSize: 12,
      formatter: (value: number) => {
        if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
        return value.toLocaleString();
      },
    },
    splitLine: {
      lineStyle: {
        color: 'var(--color-border-light)',
      },
    },
  },
  series: [
    {
      name: '收入',
      type: 'line',
      smooth: true,
      data: incomes,
      lineStyle: {
        width: 2,
        color: 'var(--color-success)',
      },
      itemStyle: {
        color: 'var(--color-success)',
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(82, 196, 26, 0.25)' },
            { offset: 1, color: 'rgba(82, 196, 26, 0.02)' },
          ],
        },
      },
    },
    {
      name: '支出',
      type: 'line',
      smooth: true,
      data: expenses,
      lineStyle: {
        width: 2,
        color: 'var(--color-error)',
      },
      itemStyle: {
        color: 'var(--color-error)',
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(255, 77, 79, 0.25)' },
            { offset: 1, color: 'rgba(255, 77, 79, 0.02)' },
          ],
        },
      },
    },
  ],
});

const buildStatCards = (
  summary: ReturnType<typeof useFinanceBIData>['data']['summary'],
): StatCardConfig[] => [
  { key: 'revenue', title: '总营收', value: summary.totalRevenue, color: undefined },
  { key: 'payable', title: '应付账款', value: summary.accountsPayable, color: 'var(--color-warning)' },
  { key: 'profit', title: '净利润', value: summary.netProfit, color: summary.netProfit >= 0 ? 'var(--color-success)' : 'var(--color-error)' },
  { key: 'approval', title: `待审批 / 逾期`, value: summary.pendingApprovals, color: 'var(--color-info)' },
  { key: 'wage', title: '工资支出', value: summary.wageExpense, color: 'var(--color-danger)' },
  { key: 'material', title: '物料成本', value: summary.materialCost, color: '#13c2c2' },
  { key: 'expense', title: '费用支出', value: summary.expenseCost, color: '#ffa940' },
  { key: 'advance', title: '员工借支', value: summary.advanceAmount, color: '#ff7875' },
];

const buildDetailConfig = (
  selectedDetail: StatKey,
  data: ReturnType<typeof useFinanceBIData>['data'],
): DetailConfig => {
  switch (selectedDetail) {
    case 'revenue':
      return {
        title: '营收明细（出货对账 + 电商销售）',
        columns: [
          { title: '来源', dataIndex: 'source', width: 140 },
          { title: '单号', dataIndex: 'orderNo' },
          { title: '客户/店铺', dataIndex: 'customerName' },
          { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '时间', dataIndex: 'time', width: 110 },
        ],
        rows: data.details.revenue,
      };
    case 'payable':
      return {
        title: '应付账款明细（待付/部分付/逾期）',
        columns: [
          { title: '应付单号', dataIndex: 'payableNo' },
          { title: '供应商', dataIndex: 'supplierName' },
          { title: '应付金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '已付金额', dataIndex: 'paidAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '未付余额', dataIndex: 'outstanding', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '状态', dataIndex: 'status', width: 100 },
          { title: '到期日', dataIndex: 'dueDate', width: 110 },
        ],
        rows: data.details.payable,
      };
    case 'wage':
      return {
        title: '工资支付明细（已支付）',
        columns: [
          { title: '支付单号', dataIndex: 'paymentNo' },
          { title: '收款方', dataIndex: 'payeeName' },
          { title: '业务类型', dataIndex: 'bizType', width: 110 },
          { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '支付方式', dataIndex: 'paymentMethod', width: 100 },
          { title: '时间', dataIndex: 'time', width: 110 },
        ],
        rows: data.details.wage,
      };
    case 'material':
      return {
        title: '物料对账明细（已审批/已支付）',
        columns: [
          { title: '对账单号', dataIndex: 'reconciliationNo' },
          { title: '供应商', dataIndex: 'supplierName' },
          { title: '物料', dataIndex: 'materialName' },
          { title: '对账金额', dataIndex: 'finalAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '状态', dataIndex: 'status', width: 100 },
          { title: '审批时间', dataIndex: 'time', width: 110 },
        ],
        rows: data.details.material,
      };
    case 'expense':
      return {
        title: '费用报销明细（已审批/已付款）',
        columns: [
          { title: '报销单号', dataIndex: 'reimbursementNo' },
          { title: '申请人', dataIndex: 'applicantName', width: 100 },
          { title: '类型', dataIndex: 'expenseType', width: 110 },
          { title: '事由', dataIndex: 'title' },
          { title: '金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '状态', dataIndex: 'status', width: 100 },
          { title: '审批时间', dataIndex: 'time', width: 110 },
        ],
        rows: data.details.expense,
      };
    case 'advance':
      return {
        title: '员工借支明细（未还清）',
        columns: [
          { title: '借支单号', dataIndex: 'advanceNo' },
          { title: '员工', dataIndex: 'employeeName' },
          { title: '借支金额', dataIndex: 'amount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '未还余额', dataIndex: 'remainingAmount', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
          { title: '还款状态', dataIndex: 'repaymentStatus', width: 110 },
          { title: '创建时间', dataIndex: 'time', width: 110 },
        ],
        rows: data.details.advance,
      };
    case 'profit':
      return {
        title: '净利润构成',
        columns: [
          { title: '项目', dataIndex: 'name' },
          { title: '金额', dataIndex: 'value', align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toLocaleString()}` },
        ],
        rows: [
          { name: '总营收', value: data.summary.totalRevenue },
          { name: '工资支出', value: -data.summary.wageExpense },
          { name: '物料成本', value: -data.summary.materialCost },
          { name: '费用支出', value: -data.summary.expenseCost },
          { name: '员工借支', value: -data.summary.advanceAmount },
          { name: '净利润', value: data.summary.netProfit },
        ],
      };
    case 'approval':
      return {
        title: '待审批 / 逾期统计',
        columns: [
          { title: '项目', dataIndex: 'name' },
          { title: '数量', dataIndex: 'count', align: 'right' as const },
        ],
        rows: [
          { name: '待审批总数（物料+费用+借支+出货）', count: data.summary.pendingApprovals },
          { name: '逾期应付账款笔数', count: data.summary.overdueCount },
        ],
      };
    default:
      return { title: '', columns: [], rows: [] };
  }
};

export const useFinanceDashboardData = () => {
  const { loading, data, timeRange, setTimeRange, goToModule, refresh } = useFinanceBIData();
  const [selectedDetail, setSelectedDetail] = useState<StatKey>('revenue');
  const [cashFlowDays, setCashFlowDays] = useState<CashFlowDays>(30);

  // 90s 轮询刷新财务看板数据
  useSync(
    'finance-dashboard',
    async () => {
      try {
        await refresh();
      } catch { /* 轮询失败忽略 */ }
      return null;
    },
    () => {},
    { interval: 90000, pauseOnHidden: true },
  );

  // 监听 data:changed 事件，500ms 防抖后刷新看板数据
  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refresh();
      }, 500);
    };
    window.addEventListener('data:changed', handleChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('data:changed', handleChange);
    };
  }, [refresh]);

  const cashFlowData = useMemo(() => generateCashFlowMockData(cashFlowDays), [cashFlowDays]);

  const cashFlowChartOption = useMemo(
    () =>
      buildCashFlowChartOption(
        cashFlowData.map(d => d.date),
        cashFlowData.map(d => d.income),
        cashFlowData.map(d => d.expense),
      ),
    [cashFlowData],
  );

  const statCards = useMemo(() => buildStatCards(data.summary), [data.summary]);

  const detailConfig = useMemo(
    () => buildDetailConfig(selectedDetail, data),
    [selectedDetail, data],
  );

  return {
    loading,
    data,
    timeRange,
    setTimeRange,
    goToModule,
    refresh,
    selectedDetail,
    setSelectedDetail,
    cashFlowDays,
    setCashFlowDays,
    cashFlowChartOption,
    statCards,
    detailConfig,
  };
};
