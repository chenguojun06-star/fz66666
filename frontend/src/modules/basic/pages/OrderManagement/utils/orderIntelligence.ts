import type { StyleBom, StyleInfo } from '@/types/style';
import type { OrderLine, ProgressNode } from '../types';
import { buildOrderQtyStats, calcBomRequirementMeters } from './orderBomMetrics';

export type SizePriceRecord = {
  styleId?: number;
  processCode: string;
  processName: string;
  progressStage?: string;
  size: string;
  price: number;
};

export type OrderOrchestrationResult = {
  sizeLabels: string[];
  colorLabels: string[];
  comboCount: number;
  totalQty: number;
  avgQtyPerCombo: number;
  lowQtyComboCount: number;
  sizeSensitiveFabricRows: StyleBom[];
  differentialProcesses: string[];
  missingPriceRecords: string[];
  pricingMode: string;
  pricingStatus: 'error' | 'warning' | 'success' | 'default';
  pricingSummary: string;
  fabricFamily: '针织' | '梭织';
  fabricSubcategory: string;
  materialAnalyses: Array<{
    key: string;
    label: string;
    categoryLabel: string;
    requiredMeters: number;
    benchmarkMeters: number;
    noScatterQtyThreshold: number;
    qtyGapToNoScatter: number;
  }>;
  primaryFabricName: string;
  primaryRequiredMeters: number;
  benchmarkRollMeters: number;
  noScatterQtyThreshold: number;
  qtyGapToNoScatter: number;
  scatterPremiumRate: number;
  scatterPremiumPerPiece: number;
  scatterPremiumTotal: number;
  scatterConditionText: string;
  scatterLevel: 'low' | 'medium' | 'high';
  scatterMode: string;
  scatterStatus: 'error' | 'warning' | 'success';
  scatterSummary: string;
};

const KNIT_KEYWORDS = ['针织', '汗布', '双面', '单面', '罗纹', '罗马布', '毛圈', '卫衣', '珠地', '拉架', '棉毛', '空气层', '坑条'];
const WOVEN_KEYWORDS = ['梭织', '衬衫', '牛仔', '雪纺', '府绸', '斜纹', '平纹', '风衣', '西装', '灯芯绒', '牛津纺', '塔丝隆'];

const inferFabricFamily = (selectedStyle: StyleInfo | null, fabricRows: StyleBom[]) => {
  const styleMeta = selectedStyle ? Object.values(selectedStyle).map((value) => String(value || '')).join(' ') : '';
  const fabricMeta = fabricRows.map((row) => [row.materialName, row.fabricComposition, row.specification, row.materialCode].map((value) => String(value || '')).join(' ')).join(' ');
  const text = `${styleMeta} ${fabricMeta}`.toLowerCase();
  const knitKeyword = KNIT_KEYWORDS.find((keyword) => text.includes(keyword.toLowerCase())) || '';
  const wovenKeyword = WOVEN_KEYWORDS.find((keyword) => text.includes(keyword.toLowerCase())) || '';
  if (knitKeyword && !wovenKeyword) {
    return { family: '针织' as const, subcategory: knitKeyword };
  }
  if (wovenKeyword && !knitKeyword) {
    return { family: '梭织' as const, subcategory: wovenKeyword };
  }
  if ((selectedStyle as Record<string, unknown> | null)?.category && String((selectedStyle as Record<string, unknown>).category).includes('针织')) {
    return { family: '针织' as const, subcategory: String((selectedStyle as Record<string, unknown>).category || '').trim() || '常规针织' };
  }
  return { family: '梭织' as const, subcategory: wovenKeyword || knitKeyword || '常规梭织' };
};

const parseWidthMeters = (text: unknown) => {
  const raw = String(text || '').toLowerCase();
  const cmMatch = raw.match(/(\d+(?:\.\d+)?)\s*cm/);
  if (cmMatch) return Number(cmMatch[1]) / 100;
  const plainMatch = raw.match(/(\d+(?:\.\d+)?)/);
  if (!plainMatch) return 1.6;
  const value = Number(plainMatch[1]);
  if (Number.isNaN(value) || value <= 0) return 1.6;
  return value > 10 ? value / 100 : value;
};

const parseWeightGsm = (text: unknown) => {
  const raw = String(text || '').toLowerCase();
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  const value = match ? Number(match[1]) : NaN;
  return Number.isNaN(value) || value <= 0 ? 180 : value;
};

const getRollBenchmarkMeters = (fabricFamily: '针织' | '梭织', subcategory: string, widthMeters = 1.6, weightGsm = 180) => {
  const text = subcategory.toLowerCase();
  if (fabricFamily === '针织') {
    const referenceKg = text.includes('卫衣') || text.includes('毛圈')
      ? 28
      : text.includes('罗纹') || text.includes('坑条')
        ? 18
        : 24;
    return Number(((referenceKg * 1000) / Math.max(120, weightGsm) / Math.max(1.4, widthMeters)).toFixed(1));
  }
  if (text.includes('牛仔')) return 75;
  if (text.includes('西装') || text.includes('风衣')) return 85;
  if (text.includes('雪纺')) return 110;
  return 95;
};

export const computeProcessBasedUnitPrice = (progressNodes: ProgressNode[]) => {
  const total = progressNodes.reduce((sum, node) => {
    const nodeTotal = (Array.isArray(node.processes) ? node.processes : []).reduce((nodeSum, process) => {
      return nodeSum + (Number(process?.unitPrice) || 0);
    }, 0);
    return sum + nodeTotal;
  }, 0);
  return Number(total.toFixed(2));
};

export const analyzeOrderOrchestration = ({
  bomMaterialRows,
  orderLines,
  sizePriceRows,
  selectedStyle,
  normalizeSizeKey,
  displaySizeLabel,
  processBasedUnitPrice,
}: {
  bomMaterialRows: StyleBom[];
  orderLines: OrderLine[];
  sizePriceRows: SizePriceRecord[];
  selectedStyle: StyleInfo | null;
  normalizeSizeKey: (value: unknown) => string;
  displaySizeLabel: (value: unknown) => string;
  processBasedUnitPrice: number;
}): OrderOrchestrationResult => {
  const effectiveLines = orderLines.filter((line) => (Number(line.quantity) || 0) > 0);
  const sizeLabels = Array.from(new Set(effectiveLines.map((line) => displaySizeLabel(line.size)).filter((value) => value !== '-')));
  const colorLabels = Array.from(new Set(effectiveLines.map((line) => String(line.color || '').trim()).filter(Boolean)));
  const comboCount = effectiveLines.length;
  const totalQty = effectiveLines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const avgQtyPerCombo = comboCount > 0 ? totalQty / comboCount : 0;
  const lowQtyComboCount = effectiveLines.filter((line) => (Number(line.quantity) || 0) > 0 && (Number(line.quantity) || 0) < 12).length;
  const sizeSensitiveFabricRows = bomMaterialRows.filter((row) => Boolean(String((row as Record<string, unknown>).sizeUsageMap || '').trim() || String((row as Record<string, unknown>).size || '').trim()));
  const orderQtyStats = buildOrderQtyStats(orderLines);

  const sizePriceByProcess = new Map<string, { label: string; prices: Map<string, number> }>();
  for (const row of sizePriceRows) {
    const processKey = String(row.processCode || row.processName || '').trim();
    const sizeKey = normalizeSizeKey(row.size);
    if (!processKey || !sizeKey) continue;
    if (!sizePriceByProcess.has(processKey)) {
      sizePriceByProcess.set(processKey, { label: String(row.processName || row.processCode || '').trim() || processKey, prices: new Map<string, number>() });
    }
    sizePriceByProcess.get(processKey)!.prices.set(sizeKey, Number(row.price) || 0);
  }

  const missingPriceRecords: string[] = [];
  const differentialProcesses: string[] = [];
  for (const [, entry] of sizePriceByProcess.entries()) {
    const seenPrices = new Set<number>();
    const missingSizes: string[] = [];
    for (const size of sizeLabels) {
      const price = entry.prices.get(normalizeSizeKey(size));
      if (price == null) {
        missingSizes.push(size);
        continue;
      }
      seenPrices.add(Number(price) || 0);
    }
    if (missingSizes.length > 0) missingPriceRecords.push(`${entry.label}：${missingSizes.join('、')}`);
    if (seenPrices.size > 1) differentialProcesses.push(entry.label);
  }

  const pricingMode = differentialProcesses.length > 0 ? '尺码价差' : sizePriceRows.length > 0 ? '统一工序价' : '待维护';
  const pricingStatus = missingPriceRecords.length > 0 ? 'error' : differentialProcesses.length > 0 ? 'warning' : sizePriceRows.length > 0 ? 'success' : 'default';
  const pricingSummary = missingPriceRecords.length > 0
    ? '下单尺码未全部覆盖码数单价，先补齐再下单更稳。'
    : differentialProcesses.length > 0
      ? `已识别 ${differentialProcesses.length} 个存在价差的工序，建议按尺码单独核价。`
      : sizePriceRows.length > 0
        ? '当前尺码未发现明显价差，可按统一工序价执行。'
        : '当前还没有维护码数单价，默认只能按工序单价判断。';

  const fabricProfile = inferFabricFamily(selectedStyle, bomMaterialRows);
  const materialAnalyses = bomMaterialRows.map((row) => {
    const widthMeters = parseWidthMeters(row.specification);
    const weightGsm = parseWeightGsm((row as Record<string, unknown>).fabricWeight);
    const requiredMeters = calcBomRequirementMeters(row, orderQtyStats);
    const benchmarkMeters = getRollBenchmarkMeters(fabricProfile.family, String(row.materialName || row.materialCode || fabricProfile.subcategory), widthMeters, weightGsm);
    const perPieceMeters = totalQty > 0 ? requiredMeters / totalQty : 0;
    const threshold = perPieceMeters > 0
      ? Math.ceil((benchmarkMeters * (fabricProfile.family === '针织' ? 0.72 : 0.82) * (1 + Math.max(0, comboCount - 2) * 0.05 + lowQtyComboCount * 0.03)) / perPieceMeters)
      : 0;
    return {
      key: String(row.id || row.materialCode || row.materialName || Math.random()),
      label: String(row.materialName || row.materialCode || '面料').trim(),
      categoryLabel: String(row.materialType || '').startsWith('lining') ? '里布' : '面料',
      requiredMeters: Number(requiredMeters.toFixed(1)),
      benchmarkMeters,
      noScatterQtyThreshold: threshold,
      qtyGapToNoScatter: Math.max(0, threshold - totalQty),
    };
  }).sort((a, b) => b.requiredMeters - a.requiredMeters);
  const primaryFabricRow = materialAnalyses[0];
  const benchmarkRollMeters = primaryFabricRow?.benchmarkMeters || getRollBenchmarkMeters(fabricProfile.family, fabricProfile.subcategory);
  const primaryRequiredMeters = Number((primaryFabricRow?.requiredMeters || 0).toFixed(1));
  const primaryPerPieceMeters = totalQty > 0 ? primaryRequiredMeters / totalQty : 0;
  const noScatterUtilization = fabricProfile.family === '针织' ? 0.72 : 0.82;
  const comboPenalty = 1 + Math.max(0, comboCount - 2) * 0.05 + lowQtyComboCount * 0.03;
  const noScatterQtyThreshold = primaryPerPieceMeters > 0 ? Math.ceil((benchmarkRollMeters * noScatterUtilization * comboPenalty) / primaryPerPieceMeters) : 0;
  const qtyGapToNoScatter = Math.max(0, noScatterQtyThreshold - totalQty);
  const scatterPremiumRate = Math.min(
    fabricProfile.family === '针织' ? 0.12 : 0.15,
    (fabricProfile.family === '针织' ? 0.025 : 0.04)
      + Math.max(0, comboCount - 1) * 0.008
      + Math.max(0, lowQtyComboCount) * 0.006
      + (sizeSensitiveFabricRows.length > 0 ? 0.012 : 0)
      + (primaryRequiredMeters > 0 && primaryRequiredMeters < benchmarkRollMeters * 0.55 ? 0.018 : 0)
  );
  const scatterPremiumPerPiece = totalQty > 0 ? Number((processBasedUnitPrice * scatterPremiumRate).toFixed(2)) : 0;
  const scatterPremiumTotal = Number((scatterPremiumPerPiece * totalQty).toFixed(2));
  const scatterLevel = sizeSensitiveFabricRows.length === 0
    ? 'low'
    : qtyGapToNoScatter <= 0 && comboCount <= 2
      ? 'low'
      : qtyGapToNoScatter <= Math.max(18, Math.round(noScatterQtyThreshold * 0.2))
        ? 'medium'
        : 'high';
  const scatterMode = scatterLevel === 'high' ? '建议散剪' : scatterLevel === 'medium' ? '临界观察' : '可不散剪';
  const scatterStatus = scatterLevel === 'high' ? 'error' : scatterLevel === 'medium' ? 'warning' : 'success';
  const scatterSummary = sizeSensitiveFabricRows.length === 0
    ? '当前面料 BOM 未维护码数配比，先按常规整裁估算。'
    : scatterLevel === 'high'
      ? `按当前下单量，主面料约 ${primaryRequiredMeters} 米，低于${fabricProfile.family}常规成卷基准，建议按散剪预案核价。`
      : scatterLevel === 'medium'
        ? `当前已接近 ${fabricProfile.family} 整裁线，建议再补 ${qtyGapToNoScatter} 件左右可明显降低散剪概率。`
        : `当前主面料约 ${primaryRequiredMeters} 米，已接近完整段长，可优先按整裁推进。`;
  const scatterConditionText = fabricProfile.family === '针织'
    ? '针织通常在码数碎、单色单码量低、主面料不足整段时容易散剪。'
    : '梭织通常在颜色拆分多、单码量低、主面料不足整卷时容易散剪。';

  return {
    sizeLabels,
    colorLabels,
    comboCount,
    totalQty,
    avgQtyPerCombo,
    lowQtyComboCount,
    sizeSensitiveFabricRows,
    differentialProcesses,
    missingPriceRecords,
    pricingMode,
    pricingStatus,
    pricingSummary,
    fabricFamily: fabricProfile.family,
    fabricSubcategory: fabricProfile.subcategory,
    materialAnalyses,
    primaryFabricName: String(primaryFabricRow?.label || '').trim() || '主面料',
    primaryRequiredMeters,
    benchmarkRollMeters,
    noScatterQtyThreshold,
    qtyGapToNoScatter,
    scatterPremiumRate,
    scatterPremiumPerPiece,
    scatterPremiumTotal,
    scatterConditionText,
    scatterLevel,
    scatterMode,
    scatterStatus,
    scatterSummary,
  };
};
