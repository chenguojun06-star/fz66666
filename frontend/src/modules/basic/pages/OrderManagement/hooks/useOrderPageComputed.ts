import { useMemo } from 'react';
import { Form } from 'antd';
import { FormInstance } from 'antd';
import { getMaterialTypeCategory } from '@/utils/materialType';
import type { StyleBom } from '@/types/style';
import type { StyleInfo } from '@/types/style';

import { OrderLine, ProgressNode } from '../types';
import { analyzeOrderOrchestration, computeProcessBasedUnitPrice } from '../utils/orderIntelligence';
import type { SizePriceRecord } from '../utils/orderIntelligence';
import { splitOptions, mergeDistinctOptions, parseSizeColorConfig } from '../utils/orderFormHelpers';
import { normalizeSizeKey, displaySizeLabel } from './useOrderBomCalc';

interface UseOrderPageComputedParams {
  bomList: StyleBom[];
  orderLines: OrderLine[];
  sizePriceRows: SizePriceRecord[];
  selectedStyle: StyleInfo | null;
  progressNodes: ProgressNode[];
  form: FormInstance;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  factories: any[];
  departments: any[];
  factoryCapacities: any[];
}

export function useOrderPageComputed({
  bomList,
  orderLines,
  sizePriceRows,
  selectedStyle,
  progressNodes,
  form,
  factoryMode,
  factories,
  departments,
  factoryCapacities,
}: UseOrderPageComputedParams) {
  const bomByType = useMemo(() => {
    const fabric = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'fabric');
    const lining = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'lining');
    const accessory = bomList.filter((b) => getMaterialTypeCategory((b as Record<string, unknown>).materialType) === 'accessory');
    return { fabric, lining, accessory };
  }, [bomList]);

  const watchedFactoryId = Form.useWatch('factoryId', form) as string | undefined;
  const watchedOrgUnitId = Form.useWatch('orgUnitId', form) as string | undefined;
  const watchedPricingMode = (Form.useWatch('pricingMode', form) as 'PROCESS' | 'SIZE' | 'COST' | 'QUOTE' | 'MANUAL' | undefined) || 'PROCESS';
  const watchedManualOrderUnitPrice = Number(Form.useWatch('manualOrderUnitPrice', form) || 0);

  const selectedFactoryStat = useMemo(() => {
    if (!factoryCapacities.length) return null;
    if (factoryMode === 'EXTERNAL' && watchedFactoryId) {
      const factory = factories.find(f => f.id === watchedFactoryId);
      if (!factory) return null;
      return factoryCapacities.find(c => c.factoryName === factory.factoryName) ?? null;
    }
    if (factoryMode === 'INTERNAL' && watchedOrgUnitId) {
      const dept = departments.find(d => d.id === watchedOrgUnitId);
      if (!dept) return null;
      const deptName = dept.nodeName || dept.pathNames || '';
      if (!deptName) return null;
      return factoryCapacities.find(c => deptName.includes(c.factoryName) || c.factoryName.includes(deptName)) ?? null;
    }
    return null;
  }, [factoryMode, watchedFactoryId, watchedOrgUnitId, factoryCapacities, factories, departments]);

  const totalOrderQuantity = useMemo(
    () => orderLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    [orderLines],
  );

  const orderOrchestration = useMemo(() => analyzeOrderOrchestration({
    bomMaterialRows: [...bomByType.fabric, ...bomByType.lining],
    orderLines, sizePriceRows, selectedStyle,
    normalizeSizeKey, displaySizeLabel,
    processBasedUnitPrice: computeProcessBasedUnitPrice(progressNodes),
  }), [bomByType.fabric, bomByType.lining, orderLines, progressNodes, selectedStyle, sizePriceRows]);

  const orderLineColors = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.color || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  const orderLineSizes = useMemo(() => {
    const set = new Set(orderLines.map(l => (l.size || '').trim()).filter(Boolean));
    return Array.from(set);
  }, [orderLines]);

  const selectableColors = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.color), parsed.colors);
  }, [selectedStyle?.color, (selectedStyle as any)?.sizeColorConfig]);

  const selectableSizes = useMemo(() => {
    const parsed = parseSizeColorConfig((selectedStyle as any)?.sizeColorConfig);
    return mergeDistinctOptions(splitOptions(selectedStyle?.size), parsed.sizes);
  }, [selectedStyle?.size, (selectedStyle as any)?.sizeColorConfig]);

  return {
    bomByType,
    watchedFactoryId,
    watchedOrgUnitId,
    watchedPricingMode,
    watchedManualOrderUnitPrice,
    selectedFactoryStat,
    totalOrderQuantity,
    orderOrchestration,
    orderLineColors,
    orderLineSizes,
    selectableColors,
    selectableSizes,
  };
}
