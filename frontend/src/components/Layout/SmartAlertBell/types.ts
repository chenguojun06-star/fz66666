import type { XiaoyunInsightCardData } from '../../common/XiaoyunInsightCard';

export interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}

export interface BriefData {
  date: string;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
  decisionCards?: XiaoyunInsightCardData[];
}

export interface UrgentEvent {
  id: string;
  type: 'overdue' | 'defective' | 'approval' | 'material';
  title: string;
  orderNo: string;
  time: string;
}
