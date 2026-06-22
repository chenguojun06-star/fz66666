import { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import { paths } from '@/routeConfig';

export type TimeRangeType = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface BIDashboardData {
  // 6个指标卡数据
  totalRevenue: number;      // 总营收
  accountsPayable: number;  // 应付账款
  wageExpense: number;       // 工资支出
  materialCost: number;      // 物料成本
  expenseCost: number;       // 费用支出
  netProfit: number;        // 净利润
  // 营收趋势
  revenueTrend: { month: string; value: number }[];
  // 成本结构
  costStructure: { type: string; value: number }[];
  // 工厂成本排行
  factoryRanking: { factoryName: string; cost: number }[];
  // 款号利润排行
  styleProfitRanking: { styleNo: string; profit: number }[];
}

const DEFAULT_DATA: BIDashboardData = {
  totalRevenue: 0,
  accountsPayable: 0,
  wageExpense: 0,
  materialCost: 0,
  expenseCost: 0,
  netProfit: 0,
  revenueTrend: [],
  costStructure: [],
  factoryRanking: [],
  styleProfitRanking: [],
};

const getDateRanges = (timeRange: TimeRangeType, customRange: [Dayjs, Dayjs] | null) => {
  const today = dayjs();
  let startDate: string, endDate: string;
  switch (timeRange) {
    case 'today':
      startDate = endDate = today.format('YYYY-MM-DD');
      break;
    case 'week':
      startDate = today.startOf('week').format('YYYY-MM-DD');
      endDate = today.endOf('week').format('YYYY-MM-DD');
      break;
    case 'month':
      startDate = today.startOf('month').format('YYYY-MM-DD');
      endDate = today.endOf('month').format('YYYY-MM-DD');
      break;
    case 'year':
      startDate = today.startOf('year').format('YYYY-MM-DD');
      endDate = today.endOf('year').format('YYYY-MM-DD');
      break;
    case 'custom':
      if (customRange) {
        startDate = customRange[0].format('YYYY-MM-DD');
        endDate = customRange[1].format('YYYY-MM-DD');
      } else {
        startDate = today.startOf('year').format('YYYY-MM-DD');
        endDate = today.endOf('year').format('YYYY-MM-DD');
      }
      break;
  }
  return { startDate, endDate };
};

export const useFinanceBIData = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<BIDashboardData>(DEFAULT_DATA);
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [factoryId, setFactoryId] = useState<string>('');
  const [styleNo, setStyleNo] = useState<string>('');
  const [factories, setFactories] = useState<{ id: string; name: string }[]>([]);

  // 加载工厂列表
  const loadFactories = useCallback(async () => {
    try {
      const res = await api.get('/system/organization/tree');
      if (res.code === 200 && res.data) {
        const flattenTree = (nodes: any[]): { id: string; name: string }[] => {
          const result: { id: string; name: string }[] = [];
          for (const node of nodes) {
            if (node.factoryName) result.push({ id: String(node.id), name: node.factoryName });
            if (node.children?.length) result.push(...flattenTree(node.children));
          }
          return result;
        };
        const all = flattenTree(Array.isArray(res.data) ? res.data : [res.data]);
        const production = all.filter(f => f.name && !f.name.includes('行政') && !f.name.includes('办公'));
        const unique = Array.from(new Map(production.map(f => [f.name, f])).values());
        setFactories(unique);
      }
    } catch (e) {
      console.warn('[FinanceBI] 工厂列表加载失败:', e);
    }
  }, []);

  useEffect(() => { loadFactories(); }, [loadFactories]);

  // 加载数据
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRanges(timeRange, customRange);
      const params = { startDate, endDate, factoryId: factoryId || undefined, styleNo: styleNo || undefined };

      const [revenueRes, wageStatsRes, materialRes, expenseRes, wageListRes] = await Promise.all([
        api.get('/finance/finished-settlement/summary', { params }),
        api.get('/finance/wage-payments/dashboard-stats', { params }),
        api.get('/production/material-outbound/logs/summary', { params }),
        api.get('/finance/expense-reimbursement/list', { params: { ...params, page: 1, pageSize: 1 } }),
        api.get('/finance/wage-payments/list', { params: { ...params, page: 1, pageSize: 1000 } }),
      ]);

      // 总营收
      const totalRevenue = (revenueRes as any)?.data?.totalAmount ?? 0;
      const revenueTrend = (revenueRes as any)?.data?.trend ?? [];

      // 应付账款（Payable未付额）
      const wageStats = (wageStatsRes as any)?.data ?? {};
      const accountsPayable = wageStats.totalPending ?? 0;

      // 工资支出（PayrollSettlement已付额）
      const wageExpense = wageStats.totalPaid ?? 0;

      // 物料成本
      const materialCost = (materialRes as any)?.data?.totalCost ?? (materialRes as any)?.data?.totalAmount ?? 0;

      // 费用支出
      const expenseList = (expenseRes as any)?.data?.records ?? [];
      const expenseCost = expenseList.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);

      // 净利润 = 营收 - 成本（工资+物料+费用）
      const netProfit = totalRevenue - wageExpense - materialCost - expenseCost;

      // 成本结构饼图
      const costStructure = [
        { type: '工资支出', value: wageExpense },
        { type: '物料成本', value: materialCost },
        { type: '费用支出', value: expenseCost },
      ].filter(item => item.value > 0);

      // 工厂成本排行（从wageList聚合）
      const wageList = (wageListRes as any)?.data?.records ?? [];
      const factoryMap = new Map<string, number>();
      wageList.forEach((r: any) => {
        const name = r.factoryName || '未知';
        factoryMap.set(name, (factoryMap.get(name) || 0) + (Number(r.amount) || 0));
      });
      const factoryRanking = Array.from(factoryMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([factoryName, cost]) => ({ factoryName, cost }));

      // 款号利润排行（简化：使用revenue数据）
      const styleProfitRanking: { styleNo: string; profit: number }[] = [];
      if (Array.isArray(revenueTrend) && revenueTrend.length > 0) {
        revenueTrend.slice(0, 10).forEach((item: any, i: number) => {
          styleProfitRanking.push({
            styleNo: item.styleNo || item.month || `款号${i + 1}`,
            profit: typeof item.profit === 'number' ? item.profit : (item.value || 0) * 0.2,
          });
        });
      }

      setData({
        totalRevenue,
        accountsPayable,
        wageExpense,
        materialCost,
        expenseCost,
        netProfit,
        revenueTrend,
        costStructure,
        factoryRanking,
        styleProfitRanking,
      });
    } catch (error) {
      console.error('[FinanceBI] 数据加载失败:', error);
      message.error('财务BI数据加载失败');
      setData(DEFAULT_DATA);
    } finally {
      setLoading(false);
    }
  }, [timeRange, customRange, factoryId, styleNo, message]);

  useEffect(() => { loadData(); }, [loadData]);

  // 重置筛选
  const resetFilters = useCallback(() => {
    setTimeRange('month');
    setCustomRange(null);
    setFactoryId('');
    setStyleNo('');
  }, []);

  // 跳转链接
  const goToModule = useCallback((module: string) => {
    const routeMap: Record<string, string> = {
      revenue: paths.financeCenter,
      payable: paths.wagePayment,
      wage: paths.wagePayment,
      material: paths.materialReconciliation,
      expense: paths.expenseReimbursement,
      profit: paths.financeCenter,
    };
    navigate(routeMap[module] || paths.financeDashboard);
  }, [navigate]);

  return {
    loading,
    data,
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    factoryId,
    setFactoryId,
    styleNo,
    setStyleNo,
    factories,
    resetFilters,
    goToModule,
    refresh: loadData,
  };
};