export type SmartRiskLevel = 'low' | 'medium' | 'high';

export interface SmartHintItem {
  key: string;
  level?: SmartRiskLevel;
  title: string;
  description?: string;
  actionText?: string;
}

export interface SmartCheckResult {
  ok: boolean;
  items: SmartHintItem[];
}

export interface SmartErrorInfo {
  code?: string;
  title: string;
  reason?: string;
  actionText?: string;
}
