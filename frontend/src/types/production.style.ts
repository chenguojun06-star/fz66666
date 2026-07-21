// 我的订单模块类型定义 —— 款式/成本域

// 款式成本明细
export interface StyleCostDetail {
  styleId: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  patternCount: number;
  developmentTime?: string;
  developmentTimeSeconds?: number;
  materialCost: number;
  processCost: number;
  secondaryProcessCost: number;
  totalCost: number;
}

// 样衣开发费用统计
export interface PatternDevelopmentStats {
  rangeType: 'day' | 'week' | 'month';
  patternCount: number;
  materialCost: number;
  processCost: number;
  secondaryProcessCost: number;
  totalCost: number;
  totalDevelopmentTimeSeconds?: number;
  styleCostDetails: StyleCostDetail[];
}
