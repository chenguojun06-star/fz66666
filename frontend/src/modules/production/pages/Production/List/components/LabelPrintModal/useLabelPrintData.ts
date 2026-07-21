import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import type { ApiResult } from '@/utils/api';
import { compositionFromSections, washTextFromInstructions, getDefaultDateText } from '@/utils/washLabelPrintTemplate';
import { parseCareIconCodes, DEFAULT_CARE_ICON_CODES } from '@/utils/careIcons';
import type { ProductionOrder } from '@/types/production';
import type { LabelStyleInfo, SkuRow } from './types';
import { printWashLabels, printUCodeLabels } from './helpers';

export type UCodeSize = '40x70' | '50x100';

export interface UseLabelPrintDataArgs {
  open: boolean;
  order: ProductionOrder | null;
  styleInfo: LabelStyleInfo | null;
}

export interface UseLabelPrintDataReturn {
  orderFactoryCode: string;
  washW: number;
  setWashW: (v: number | null) => void;
  washH: number;
  setWashH: (v: number | null) => void;
  uCodeSize: UCodeSize;
  setUCodeSize: (v: UCodeSize) => void;
  suitPart: string;
  setSuitPart: (v: string) => void;
  compositionText: string;
  washInstructionsText: string;
  careIconCodes: string[];
  defaultDateText: string;
  handleWashPrint: (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) => Promise<void>;
  handleUCodePrint: (selected: SkuRow[], ord: ProductionOrder) => Promise<void>;
}

export function useLabelPrintData({ open, order, styleInfo }: UseLabelPrintDataArgs): UseLabelPrintDataReturn {
  const [orderFactoryCode, setOrderFactoryCode] = useState<string>('');
  const [washW, setWashWState] = useState<number>(30);
  const [washH, setWashHState] = useState<number>(80);
  const [uCodeSize, setUCodeSize] = useState<UCodeSize>('40x70');
  const [suitPart, setSuitPart] = useState<string>('all');

  const compositionText = useMemo(
    () => compositionFromSections(styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition),
    [styleInfo?.fabricCompositionParts, styleInfo?.fabricComposition],
  );

  const washInstructionsText = useMemo(
    () => washTextFromInstructions(styleInfo?.washInstructions, styleInfo?.fabricCompositionParts),
    [styleInfo?.washInstructions, styleInfo?.fabricCompositionParts],
  );

  const careIconCodes = useMemo(() => {
    const codes = parseCareIconCodes(styleInfo?.careIconCodes);
    return codes.length > 0 ? codes : [...DEFAULT_CARE_ICON_CODES];
  }, [styleInfo?.careIconCodes]);

  const defaultDateText = useMemo(() => getDefaultDateText(), []);

  useEffect(() => {
    if (!open || !order?.factoryId) { setOrderFactoryCode(''); return; }
    void api.get(`/system/factory/${order.factoryId}`)
      .then((res: ApiResult<Record<string, any>>) => {
        const d = res?.data ?? res ?? {};
        setOrderFactoryCode(String(d.factoryCode || ''));
      })
      .catch((err) => { console.warn('[LabelPrint] 工厂编码查询失败:', err?.message || err); setOrderFactoryCode(''); });
  }, [open, order?.factoryId]);

  const setWashW = useCallback((v: number | null) => setWashWState(v ?? 30), []);
  const setWashH = useCallback((v: number | null) => setWashHState(v ?? 80), []);

  const handleWashPrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) =>
      printWashLabels(selected, ord, si, washW, washH),
    [washW, washH],
  );

  const handleUCodePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) => {
      const [uw, uh] = uCodeSize === '40x70' ? [70, 40] : [100, 50];
      return printUCodeLabels(selected, ord, orderFactoryCode, uw, uh);
    },
    [orderFactoryCode, uCodeSize],
  );

  return {
    orderFactoryCode,
    washW,
    setWashW,
    washH,
    setWashH,
    uCodeSize,
    setUCodeSize,
    suitPart,
    setSuitPart,
    compositionText,
    washInstructionsText,
    careIconCodes,
    defaultDateText,
    handleWashPrint,
    handleUCodePrint,
  };
}
