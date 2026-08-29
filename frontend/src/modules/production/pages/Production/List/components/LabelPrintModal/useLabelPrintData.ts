import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/utils/api';
import type { ApiResult } from '@/utils/api';
import { compositionFromSections, washTextFromInstructions } from '@/utils/washLabelPrintTemplate';
import { parseCareIconCodes, DEFAULT_CARE_ICON_CODES } from '@/utils/careIcons';
import type { ProductionOrder } from '@/types/production';
import type { CertificateSectionState, LabelStyleInfo, SkuRow } from './types';
import { printWashLabels, printUCodeLabels, printCertificateLabels } from './helpers';
import {
  loadCertPersistedSettings,
} from '@/utils/certificateLabelPrintTemplate';
import {
  buildDefaultSections,
  type WashLabelSectionState,
} from '@/components/common/WashLabelSectionConfigPanel';

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
  /** 洗水唛分区配置（开关+内容），打印时按此渲染，只显示用户输入的内容 */
  sections: WashLabelSectionState;
  setSections: (v: WashLabelSectionState) => void;
  handleWashPrint: (selected: SkuRow[], ord: ProductionOrder, si: LabelStyleInfo | null) => Promise<void>;
  handleUCodePrint: (selected: SkuRow[], ord: ProductionOrder) => Promise<void>;
  certW: number;
  setCertW: (v: number | null) => void;
  certH: number;
  setCertH: (v: number | null) => void;
  certSections: CertificateSectionState;
  setCertSections: (v: CertificateSectionState) => void;
  handleCertificatePrint: (selected: SkuRow[], ord: ProductionOrder) => Promise<void>;
}

/** D-221：合格证行默认配置——非空预填自动勾选；跨款固定项（企业名称/地址等）从 localStorage 记忆恢复 */
function buildDefaultCertSections(
  order: ProductionOrder | null,
  styleInfo: LabelStyleInfo | null,
  compositionText: string,
): CertificateSectionState {
  const persisted = loadCertPersistedSettings();
  const priceRaw = styleInfo?.salesPrice ?? styleInfo?.tagPrice;
  const priceNum = Number(priceRaw);
  const priceText = Number.isFinite(priceNum) && priceNum > 0 ? priceNum.toFixed(2) : '';
  const inspector = (styleInfo?.inspector || '').trim();
  const defs: Array<{ key: string; label: string; value: string; remember?: boolean }> = [
    { key: 'pinming', label: '品名', value: (order?.styleName || '').trim() },
    { key: 'kuanhao', label: '款号', value: (order?.styleNo || '').trim() },
    { key: 'guige', label: '规格', value: '{码数}' },
    { key: 'yanse', label: '颜色', value: '{颜色}' },
    { key: 'chengfen', label: '成分', value: compositionText || '详情见洗水唛' },
    { key: 'biaozhun', label: '产品标准', value: (styleInfo?.executeStandard || persisted.biaozhun || '').trim(), remember: true },
    { key: 'anquan', label: '安全类别', value: (styleInfo?.safetyCategory || persisted.anquan || '').trim(), remember: true },
    { key: 'zhiliang', label: '质量等级', value: (styleInfo?.qualityGrade || persisted.zhiliang || '合格品').trim(), remember: true },
    { key: 'jianyan', label: '检验证明', value: persisted.jianyan ?? (inspector ? `检验员${inspector}` : ''), remember: true },
    { key: 'qiye', label: '企业名称', value: (persisted.qiye ?? order?.factoryName ?? '').trim(), remember: true },
    { key: 'dizhi', label: '企业地址', value: (persisted.dizhi || '').trim(), remember: true },
    { key: 'lingshou', label: '零售价', value: priceText ? `¥ ${priceText}` : '' },
  ];
  return {
    titleText: '合格证',
    rows: defs.map(d => {
      const value = d.remember && persisted[d.key] != null ? String(persisted[d.key]) : d.value;
      return { key: d.key, show: !!String(value).trim(), labelText: d.label, valueText: value };
    }),
    showBarcode: true,
    barcodeTemplate: '{款号}{颜色}{码数}',
    showBarcodeText: true,
    fontScale: 1,
  };
}

export function useLabelPrintData({ open, order, styleInfo }: UseLabelPrintDataArgs): UseLabelPrintDataReturn {
  const [orderFactoryCode, setOrderFactoryCode] = useState<string>('');
  const [washW, setWashWState] = useState<number>(30);
  const [washH, setWashHState] = useState<number>(80);
  const [uCodeSize, setUCodeSize] = useState<UCodeSize>('40x70');
  const [suitPart, setSuitPart] = useState<string>('all');
  const [certW, setCertWState] = useState<number>(70);
  const [certH, setCertHState] = useState<number>(100);
  const [certSections, setCertSections] = useState<CertificateSectionState>(() => buildDefaultCertSections(null, null, ''));

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

  // 分区默认值：从款式数据预填（款号取订单款号），用户可在面板自由改/关
  // 弹窗每次打开时按当前款式重置，避免上一单数据残留
  const [sections, setSections] = useState<WashLabelSectionState>(() => buildDefaultSections({}));
  useEffect(() => {
    if (!open) return;
    setSections(buildDefaultSections({
      styleNoText: (order?.styleNo || '').trim(),
      compositionText,
      washText: washInstructionsText,
      careIconCodes,
    }));
    setCertSections(buildDefaultCertSections(order, styleInfo, compositionText));
  }, [open, order?.styleNo, compositionText, washInstructionsText, careIconCodes]);

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
      printWashLabels(selected, ord, si, washW, washH, sections),
    [washW, washH, sections],
  );

  const handleUCodePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) => {
      const [uw, uh] = uCodeSize === '40x70' ? [70, 40] : [100, 50];
      return printUCodeLabels(selected, ord, orderFactoryCode, uw, uh);
    },
    [orderFactoryCode, uCodeSize],
  );

  const setCertW = useCallback((v: number | null) => setCertWState(v ?? 70), []);
  const setCertH = useCallback((v: number | null) => setCertHState(v ?? 100), []);

  const handleCertificatePrint = useCallback(
    (selected: SkuRow[], ord: ProductionOrder) =>
      printCertificateLabels(selected, ord, certW, certH, certSections),
    [certW, certH, certSections],
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
    sections,
    setSections,
    handleWashPrint,
    handleUCodePrint,
    certW,
    setCertW,
    certH,
    setCertH,
    certSections,
    setCertSections,
    handleCertificatePrint,
  };
}
