export type StatKey =
  | 'revenue'
  | 'payable'
  | 'wage'
  | 'material'
  | 'materialPending'
  | 'expense'
  | 'advance'
  | 'laborCost'
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

// D-142：SVG fill 属性不支持 CSS var()（会渲染成黑色），必须具体色值；
// 顺序与后端 buildCostStructure 一致：工资/物料/费用/借支，与现金流折线同色系
export const PIE_COLORS = [
  'var(--color-primary)', // 工资支出
  'var(--color-warning)', // 物料成本
  'var(--color-error)', // 费用支出
  'var(--color-info)', // 员工借支
];
