import { useMemo } from 'react';
import { StyleBom } from '@/types/style';
import { OrderLine } from '../types';
import { buildOrderQtyStats, calcBomRequirementQty, getMatchedOrderQty } from '../utils/orderBomMetrics';
import { computeReferenceKilograms } from '@/modules/production/pages/Production/MaterialPurchase/utils';

export const normalizeSizeKey = (v: unknown) => String(v || '').trim().toUpperCase().replace(/\s+/g, '');
export const displaySizeLabel = (v: unknown) => normalizeSizeKey(v) || '-';

export const useOrderBomCalc = (orderLines: OrderLine[]) => {
  const orderQtyStats = useMemo(() => buildOrderQtyStats(orderLines), [orderLines]);

  const getMatchedQty = (colorRaw: any, sizeRaw: any) => {
    return getMatchedOrderQty(orderQtyStats, colorRaw, sizeRaw);
  };

  const calcBomBudgetQty = (record: StyleBom) => calcBomRequirementQty(record, orderQtyStats);

  const calcBomTotalPrice = (record: StyleBom) => {
    const unitPrice = Number((record as Record<string, unknown>).unitPrice) || 0;
    const budgetQty = calcBomBudgetQty(record);
    if (!Number.isFinite(budgetQty) || !Number.isFinite(unitPrice)) return 0;
    return Number((budgetQty * unitPrice).toFixed(2));
  };

  const calcBomReferenceKg = (record: StyleBom) => {
    const meters = calcBomBudgetQty(record);
    if (!Number.isFinite(meters) || meters <= 0) return null;
    return computeReferenceKilograms(meters, (record as Record<string, unknown>).conversionRate, '米');
  };

  return {
    orderQtyStats,
    getMatchedQty,
    calcBomBudgetQty,
    calcBomTotalPrice,
    calcBomReferenceKg,
  };
};
