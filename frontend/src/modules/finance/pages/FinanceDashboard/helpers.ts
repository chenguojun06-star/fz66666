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
  /** 营收（出货对账创建 + 电商销售，业务发生口径） */
  income: number;
  /** 工资实付 */
  wage: number;
  /** 物料成本（对账已审/已付） */
  material: number;
  /** 费用支出（报销已审/已付） */
  expense: number;
  /** 员工借支（借出） */
  advance: number;
  /** 支出合计 = 工资+物料+费用+借支 */
  expenseTotal: number;
}

export const PIE_COLORS = [
  'var(--color-primary)',
  'var(--color-orange-300)',
  'var(--color-danger)',
  'var(--color-success)',
];
