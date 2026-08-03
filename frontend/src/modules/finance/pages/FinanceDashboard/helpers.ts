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

export const PIE_COLORS = [
  'var(--color-primary)',
  'var(--color-orange-300)',
  'var(--color-danger)',
  'var(--color-success)',
];
