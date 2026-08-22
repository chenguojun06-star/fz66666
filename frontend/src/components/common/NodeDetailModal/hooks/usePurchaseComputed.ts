import { useMemo } from 'react';
import type { MaterialPurchase } from '@/types/production';
import {
  extractColorSet,
  extractPurchaseColorSet,
  computeMissingColors,
  checkBomIncomplete,
  buildMaterialSections,
  isPurchaseRowComplete,
} from '../utils';
import type { OrderLine, MaterialSection } from '../utils';

export interface UsePurchaseComputedParams {
  purchases: MaterialPurchase[];
  orderLines: OrderLine[];
  editing: boolean;
  editableData: MaterialPurchase[];
}

export interface UsePurchaseComputedResult {
  orderColors: string[];
  orderColorSet: Set<string>;
  purchaseColorSet: Set<string>;
  missingColors: string[];
  bomIncomplete: boolean;
  canProcure: boolean;
  sections: MaterialSection[];
  displayData: MaterialPurchase[];
}

export const usePurchaseComputed = (params: UsePurchaseComputedParams): UsePurchaseComputedResult => {
  const { purchases, orderLines, editing, editableData } = params;

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    orderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [orderLines]);

  const orderColorSet = useMemo(() => extractColorSet(orderLines), [orderLines]);

  const purchaseColorSet = useMemo(() => extractPurchaseColorSet(purchases), [purchases]);

  const missingColors = useMemo(
    () => computeMissingColors(orderColorSet, purchaseColorSet),
    [orderColorSet, purchaseColorSet]
  );

  const bomIncomplete = useMemo(() => checkBomIncomplete(purchases), [purchases]);

  // D-修复：canProcure 改为"存在至少一行本体信息完整的记录"。
  // 旧逻辑 = !bomIncomplete（任一行缺供应商即全单禁采，一行有缺惩罚全部）
  const canProcure = purchases.length > 0 && purchases.some(p => isPurchaseRowComplete(p));

  const sections = useMemo(() => buildMaterialSections(purchases), [purchases]);

  const displayData = editing ? editableData : purchases;

  return {
    orderColors,
    orderColorSet,
    purchaseColorSet,
    missingColors,
    bomIncomplete,
    canProcure,
    sections,
    displayData,
  };
};

export default usePurchaseComputed;
