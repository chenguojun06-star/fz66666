import { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import { paths } from '@/routeConfig';

export type TimeRangeType = 'today' | 'week' | 'month' | 'year' | 'custom';

export interface FinanceSummary {
  totalRevenue: number;
  accountsPayable: number;
  wageExpense: number;
  materialCost: number;
  expenseCost: number;
  advanceAmount: number;
  totalCost: number;
  netProfit: number;
  pendingApprovals: number;
  overdueCount: number;
}

export interface FinanceTrendPoint {
  label: string;
  revenue: number;
  cost: number;
  profit: number;
}

export interface FinanceCostItem {
  type: string;
  value: number;
}

export interface RevenueDetailItem {
  source: string;
  orderNo: string;
  customerName: string;
  amount: number;
  time: string;
}

export interface PayableDetailItem {
  payableNo: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  outstanding: number;
  status: string;
  dueDate: string;
}

export interface WageDetailItem {
  paymentNo: string;
  payeeName: string;
  bizType: string;
  amount: number;
  paymentMethod: string;
  time: string;
}

export interface MaterialDetailItem {
  reconciliationNo: string;
  supplierName: string;
  materialName: string;
  finalAmount: number;
  status: string;
  time: string;
}

export interface ExpenseDetailItem {
  reimbursementNo: string;
  applicantName: string;
  expenseType: string;
  title: string;
  amount: number;
  status: string;
  time: string;
}

export interface AdvanceDetailItem {
  advanceNo: string;
  employeeName: string;
  amount: number;
  remainingAmount: number;
  repaymentStatus: string;
  time: string;
}

export interface FinanceDashboardData {
  summary: FinanceSummary;
  revenueTrend: FinanceTrendPoint[];
  costStructure: FinanceCostItem[];
  details: {
    revenue: RevenueDetailItem[];
    payable: PayableDetailItem[];
    wage: WageDetailItem[];
    material: MaterialDetailItem[];
    expense: ExpenseDetailItem[];
    advance: AdvanceDetailItem[];
  };
}

const DEFAULT_DATA: FinanceDashboardData = {
  summary: {
    totalRevenue: 0,
    accountsPayable: 0,
    wageExpense: 0,
    materialCost: 0,
    expenseCost: 0,
    advanceAmount: 0,
    totalCost: 0,
    netProfit: 0,
    pendingApprovals: 0,
    overdueCount: 0,
  },
  revenueTrend: [],
  costStructure: [],
  details: {
    revenue: [],
    payable: [],
    wage: [],
    material: [],
    expense: [],
    advance: [],
  },
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
        startDate = today.startOf('month').format('YYYY-MM-DD');
        endDate = today.endOf('month').format('YYYY-MM-DD');
      }
      break;
  }
  return { startDate, endDate };
};

export const useFinanceBIData = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinanceDashboardData>(DEFAULT_DATA);
  const [timeRange, setTimeRange] = useState<TimeRangeType>('month');
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRanges(timeRange, customRange);
      const res: any = await api.get('/finance/dashboard/summary', {
        params: { startDate, endDate },
      });
      const payload = res?.data ?? DEFAULT_DATA;
      setData({
        summary: { ...DEFAULT_DATA.summary, ...(payload.summary ?? {}) },
        revenueTrend: Array.isArray(payload.revenueTrend) ? payload.revenueTrend : [],
        costStructure: Array.isArray(payload.costStructure) ? payload.costStructure : [],
        details: {
          revenue: [],
          payable: [],
          wage: [],
          material: [],
          expense: [],
          advance: [],
          ...(payload.details ?? {}),
        },
      });
    } catch (error) {
      console.error('[FinanceDashboard] 数据加载失败:', error);
      message.error('财务总览数据加载失败');
      setData(DEFAULT_DATA);
    } finally {
      setLoading(false);
    }
  }, [timeRange, customRange, message]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetFilters = useCallback(() => {
    setTimeRange('month');
    setCustomRange(null);
  }, []);

  const goToModule = useCallback(
    (module: string) => {
      const routeMap: Record<string, string> = {
        revenue: paths.financeCenter,
        payable: paths.wagePayment,
        wage: paths.payrollOperatorSummary,
        expense: paths.expenseReimbursement,
        material: paths.materialReconciliation,
        advance: paths.employeeAdvance,
        profit: paths.financeDashboard,
        approval: paths.financeCenter,
      };
      navigate(routeMap[module] || paths.financeDashboard);
    },
    [navigate],
  );

  return {
    loading,
    data,
    timeRange,
    setTimeRange,
    customRange,
    setCustomRange,
    resetFilters,
    goToModule,
    refresh: loadData,
  };
};
