export interface MindPushRuleDTO {
  ruleCode: string;
  ruleName: string;
  enabled: boolean;
  thresholdDays: number;
  thresholdProgress: number;
  notifyTimeStart?: string;
  notifyTimeEnd?: string;
}

export interface MindPushLogItem {
  id: number;
  ruleCode: string;
  ruleName: string;
  orderNo: string;
  pushMessage: string;
  channel: string;
  createdAt: string;
}

export interface MindPushStatusData {
  rules: MindPushRuleDTO[];
  recentLog: MindPushLogItem[];
  stats: { pushed24h: number; pushed7d: number; activeRules: number };
  notifyTimeStart?: string;
  notifyTimeEnd?: string;
}
