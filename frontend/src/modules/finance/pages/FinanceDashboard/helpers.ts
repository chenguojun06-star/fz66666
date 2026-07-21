import dayjs from 'dayjs';
import type { TimeRangeType } from './hooks/useFinanceBIData';

export type CashFlowDays = 7 | 30 | 90;

export type StatKey =
  | 'revenue'
  | 'payable'
  | 'wage'
  | 'material'
  | 'expense'
  | 'advance'
  | 'profit'
  | 'approval';

export interface CashFlowPoint {
  date: string;
  income: number;
  expense: number;
}

export const TIME_OPTIONS: { label: string; value: TimeRangeType }[] = [
  { label: '今日', value: 'today' },
  { label: '本周', value: 'week' },
  { label: '本月', value: 'month' },
  { label: '本年', value: 'year' },
];

export const CASH_FLOW_DAYS_OPTIONS: { label: string; value: CashFlowDays }[] = [
  { label: '近7天', value: 7 },
  { label: '近30天', value: 30 },
  { label: '近90天', value: 90 },
];

export const PIE_COLORS = [
  'var(--color-primary)',
  '#ffa940',
  '#ff7875',
  'var(--color-success)',
];

export const generateCashFlowMockData = (days: number): CashFlowPoint[] => {
  const data: CashFlowPoint[] = [];
  const today = dayjs();
  for (let i = days - 1; i >= 0; i--) {
    const date = today.subtract(i, 'day');
    const baseIncome = 50000 + Math.sin(i / 5) * 20000 + Math.random() * 15000;
    const baseExpense = 35000 + Math.cos(i / 7) * 15000 + Math.random() * 10000;
    data.push({
      date: date.format('MM-DD'),
      income: Math.round(baseIncome),
      expense: Math.round(baseExpense),
    });
  }
  return data;
};
