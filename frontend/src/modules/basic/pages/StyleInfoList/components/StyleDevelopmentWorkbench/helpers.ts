import dayjs from 'dayjs';
import type { StyleInfo, WorkbenchSection } from '@/types/style';

export const DEFAULT_BUDGET_HOURS = 5;
export const HOURS_PER_DAY = 14;

export const formatTime = (value?: unknown): string => {
  if (!value) return '待领取';
  const instance = dayjs(value as string | number | Date | null | undefined);
  if (instance.isValid()) return instance.format('YYYY-MM-DD');
  return String(value);
};

export const resolveStageMeta = (done: boolean, started: boolean) => {
  if (done) return { label: '已完成', color: 'success' as const, percent: 100 };
  if (started) return { label: '进行中', color: 'processing' as const, percent: 58 };
  return { label: '未开始', color: 'default' as const, percent: 0 };
};

export const resolvePreferredSection = (detail: StyleInfo | null | undefined): WorkbenchSection => {
  if (!detail) return 'bom';
  if (!(detail as any).bomCompletedTime) return 'bom';
  if (!(detail as any).patternCompletedTime) return 'pattern';
  if (!(detail as any).processCompletedTime) return 'process';
  if (!(detail as any).secondaryCompletedTime) return 'secondary';
  if (!(detail as any).productionCompletedTime) return 'production';
  if (!(detail as any).price) return 'quotation';
  return 'files';
};
