import { useMemo } from 'react';
import type { MaterialPurchase } from '@/types/production';
import {
  extractColorSet,
  extractPurchaseColorSet,
  computeMissingColors,
  checkBomIncomplete,
  buildMaterialSections,
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

  const canProcure = !bomIncomplete;

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
