import { useCallback, useEffect, useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import dayjs, { Dayjs } from 'dayjs';
import { useNavigate } from 'react-router';
import { paths } from '@/routeConfig';
import type { CashFlowPoint } from '../helpers';

export interface FinanceSummary {
  totalRevenue: number;
  accountsPayable: number;
  wageExpense: number;
  materialCost: number;
  expenseCost: number;
  advanceAmount: number;
  /** D-243：工序产值（本厂扫码结算），仅展示，不计入 totalCost */
  laborCost: number;
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
    laborCost: 0,
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

const getDateRanges = (customRange: [Dayjs, Dayjs] | null) => {
  const today = dayjs();
  let startDate: string, endDate: string;
  if (customRange) {
    startDate = customRange[0].format('YYYY-MM-DD');
    endDate = customRange[1].format('YYYY-MM-DD');
  } else {
    startDate = today.startOf('month').format('YYYY-MM-DD');
    endDate = today.endOf('month').format('YYYY-MM-DD');
  }
  return { startDate, endDate };
};

export const useFinanceBIData = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinanceDashboardData>(DEFAULT_DATA);
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [cashFlowData, setCashFlowData] = useState<CashFlowPoint[]>([]);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRanges(customRange);
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
  }, [customRange, message]);

  const loadCashFlow = useCallback(async (startDate: string, endDate: string) => {
    setCashFlowLoading(true);
    try {
      const res: any = await api.get('/finance/report/cash-flow', {
        params: { startDate, endDate },
      });
      if (res?.code === 200 && Array.isArray(res.data?.points)) {
        setCashFlowData(res.data.points.map((p: any) => ({
          date: p.date,
          income: Number(p.income ?? 0),
          // F-2：五类金额事件全量映射（此前只映射 income/expense，新字段被丢弃导致图表全0）
          wage: Number(p.wage ?? 0),
          material: Number(p.material ?? 0),
          expense: Number(p.expense ?? 0),
          advance: Number(p.advance ?? 0),
          expenseTotal: Number(p.expenseTotal ?? 0),
        })));
      } else {
        setCashFlowData([]);
      }
    } catch {
      setCashFlowData([]);
    } finally {
      setCashFlowLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 现金流随顶部日期范围联动
  useEffect(() => {
    const { startDate, endDate } = getDateRanges(customRange);
    loadCashFlow(startDate, endDate);
  }, [loadCashFlow, customRange]);

  const resetFilters = useCallback(() => {
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
    customRange,
    setCustomRange,
    resetFilters,
    goToModule,
    refresh: loadData,
    cashFlowData,
    cashFlowLoading,
    loadCashFlow,
  };
};
