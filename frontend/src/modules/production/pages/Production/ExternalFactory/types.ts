export type StageStatus = 'done' | 'active' | 'waiting' | 'risk' | 'scrapped';
export type DeliveryTone = 'normal' | 'warning' | 'danger' | 'success' | 'scrapped';

export interface SmartStage {
  key: string;
  label: string;
  helper: string;
  timeLabel: string;
  status: StageStatus;
  progress: number;
}
