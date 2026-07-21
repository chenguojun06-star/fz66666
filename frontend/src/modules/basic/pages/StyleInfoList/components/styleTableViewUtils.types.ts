import { StyleInfo } from '@/types/style';

// ── Types ──────────────────────────────────────────────

export type StageStatus = 'done' | 'active' | 'waiting' | 'risk' | 'scrapped';
export type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success' | 'scrapped';
export type StageActionKey = 'detail' | 'pattern' | 'sizePrice' | 'secondary';

export type StyleRecord = StyleInfo & Record<string, unknown>;

export interface SmartStage {
  key: string;
  label: string;
  helper: string;
  startTimeLabel: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
  details: string[];
  actionKey?: StageActionKey;
  actionLabel?: string;
}

export type StageBuilder = (record: StyleRecord) => SmartStage | null;

export interface PatternProductionSnapshot {
  id: string;
  status: string;
  receiver: string;
  releaseTime: string;
  receiveTime: string;
  completeTime: string;
  updateTime: string;
  reviewStatus: string;
  reviewTime: string;
  procurementProgress: number;
  progressNodes: Record<string, number>;
  productionOrderId?: string;
  color?: string;
  quantity?: number;
  colors?: string[];
  sizeColorConfig?: string;
  size?: string;
}

export interface StageQuickAction {
  key: string;
  label: string;
  type?: 'primary' | 'default' | 'link' | 'text' | 'dashed';
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}
