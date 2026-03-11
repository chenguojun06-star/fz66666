import api from '../../utils/api';

export interface ProfitReportData {
  revenue: number;
  ecRevenue: number;
  totalRevenue: number;
  laborCost: number;
  materialCost: number;
  expenseCost: number;
  totalCost: number;
  grossProfit: number;
  grossProfitRate: number;
  dateRange: string;
}

export interface BalanceSheetData {
  cashAndBank: number;
  accountsReceivable: number;
  inventory: number;
  totalAssets: number;
  accountsPayable: number;
  totalLiabilities: number;
  equity: number;
  dateRange: string;
}

export interface CashFlowData {
  operatingInflow: number;
  operatingOutflow: number;
  operatingNet: number;
  investingNet: number;
  financingNet: number;
  netCashFlow: number;
  dateRange: string;
}

export const financialReportApi = {
  profitReport: async (startDate: string, endDate: string) => {
    return await api.get('/finance/reports/profit', { params: { startDate, endDate } });
  },
  balanceSheet: async (startDate: string, endDate: string) => {
    return await api.get('/finance/reports/balance-sheet', { params: { startDate, endDate } });
  },
  cashFlow: async (startDate: string, endDate: string) => {
    return await api.get('/finance/reports/cash-flow', { params: { startDate, endDate } });
  },
};
