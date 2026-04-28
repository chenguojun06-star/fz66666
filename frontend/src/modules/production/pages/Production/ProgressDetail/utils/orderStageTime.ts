import { ProductionOrder } from '@/types/production';
import { ProgressNode } from '../types';
import {
  isCuttingStageKey,
  isSecondaryProcessStageKey,
  isSewingStageKey,
  isTailStageKey,
  isPackagingStageKey,
  isIroningStageKey,
  isQualityStageKey,
  isWarehouseStageKey,
} from './stageMapping';

export const getOrderStageCompletionTimeFallback = (
  order: ProductionOrder | null,
  stageName?: string,
  parentStage?: string,
): string => {
  if (!order) return '';

  const candidates = [stageName, parentStage]
    .map((item) => String(item || '').trim())
    .filter(Boolean);

  if (candidates.length === 0) return '';

  const pickField = (...keys: string[]): string => {
    for (const key of keys) {
      const value = String((order as Record<string, unknown>)?.[key] || '').trim();
      if (value) return value;
    }
    return '';
  };

  const matchAny = (matcher: (value: string) => boolean) => candidates.some(matcher);

  if (matchAny((value) => /采购|物料|备料|辅料|面料/.test(value))) {
    return pickField('procurementConfirmedAt', 'procurementEndTime');
  }

  if (matchAny(isCuttingStageKey)) {
    return pickField('cuttingEndTime');
  }

  if (matchAny(isSecondaryProcessStageKey)) {
    return pickField('secondaryProcessEndTime');
  }

  if (matchAny(isSewingStageKey)) {
    return pickField('carSewingEndTime', 'sewingEndTime');
  }

  if (matchAny(isTailStageKey)) {
    return pickField('packagingEndTime', 'ironingEndTime');
  }

  if (matchAny(isPackagingStageKey)) {
    return pickField('packagingEndTime', 'ironingEndTime');
  }

  if (matchAny(isIroningStageKey)) {
    return pickField('ironingEndTime', 'packagingEndTime');
  }

  if (matchAny(isQualityStageKey)) {
    return pickField('qualityEndTime');
  }

  if (matchAny(isWarehouseStageKey)) {
    return pickField('warehousingEndTime');
  }

  return '';
};
