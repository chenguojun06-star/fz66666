import { StyleBom } from '@/types/style';
import { getMaterialSortWeight } from '@/utils/materialType';
import type { MaterialType } from '../hooks/useBomColumns';

export const normalizeUniqueValues = (values?: string[]) => Array.from(
  new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))
);

export const isZipperMaterial = (bom: StyleBom) => /拉链/.test(String(bom.materialName || '').trim());

export const isCountLikeUnit = (unit?: string) => /^(个|套|条|只|双|粒|枚|包|张|件|根|片|台|桶|卷)$/.test(String(unit || '').trim());

export const isMeterPatternMaterial = (bom: StyleBom) => {
  const unit = String(bom.unit || '').trim();
  const materialType = String(bom.materialType || '').trim().toLowerCase();
  const materialName = String(bom.materialName || '').trim();
  const specification = String(bom.specification || '').trim();
  if (isZipperMaterial(bom)) return false;
  if (unit === '米') return true;
  if (isCountLikeUnit(unit)) return false;
  return materialType.startsWith('fabric')
    || materialType.startsWith('lining')
    || /松紧|织带|绳|带|滚条|包边|魔术贴/.test(`${materialName} ${specification}`);
};

export const resolvePatternUnit = (bom: StyleBom) => {
  const patternUnit = String(bom.patternUnit || '').trim();
  const unit = String(bom.unit || '').trim();
  if (patternUnit && patternUnit !== '米') {
    return patternUnit;
  }
  if (isMeterPatternMaterial(bom)) {
    return '米';
  }
  return unit || patternUnit || '';
};

export const sortBomRows = (rows: StyleBom[]) => {
  const list = Array.isArray(rows) ? [...rows] : [];
  list.sort((a, b) => {
    const wa = getMaterialSortWeight((a as Record<string, unknown>)?.materialType);
    const wb = getMaterialSortWeight((b as Record<string, unknown>)?.materialType);
    if (wa !== wb) return wa - wb;

    const codeA = String((a as Record<string, unknown>)?.materialCode || '').trim();
    const codeB = String((b as Record<string, unknown>)?.materialCode || '').trim();
    if (codeA && codeB && codeA !== codeB) {
      return codeA.localeCompare(codeB, 'zh-CN');
    }

    const nameA = String((a as Record<string, unknown>)?.materialName || '').trim();
    const nameB = String((b as Record<string, unknown>)?.materialName || '').trim();
    if (nameA !== nameB) {
      return nameA.localeCompare(nameB, 'zh-CN');
    }

    return String((a as Record<string, unknown>)?.id || '').localeCompare(String((b as Record<string, unknown>)?.id || ''), 'zh-CN');
  });
  return list;
};

export const mapDbTypeToBomType = (mt: any): MaterialType => {
  const t = String(mt || '').trim().toLowerCase();
  if (t.startsWith('fabric')) return 'fabricA';
  if (t.startsWith('lining')) return 'liningA';
  if (t.startsWith('accessory')) return 'accessoryA';
  return 'accessoryA';
};

export const isTempId = (id: any) => {
  if (typeof id === 'string') return id.startsWith('tmp_');
  if (typeof id === 'number') return id < 0;
  return false;
};

export const calcTotalPrice = (item: Partial<StyleBom>) => {
  // 与单件用量列显示逻辑保持一致：
  // 无纸样数据时，有效用量 = devUsageAmount（开发采购用量）；有纸样数据时用 usageAmount
  const hasPatternData = (() => {
    try { return item.patternSizeUsageMap ? Object.keys(JSON.parse(item.patternSizeUsageMap as string)).length > 0 : false; } catch { return false; }
  })();
  const effectiveUsage = hasPatternData
    ? (Number(item.usageAmount) || 0)
    : (Number(item.devUsageAmount) || Number(item.usageAmount) || 0);
  const lossRate = Number(item.lossRate) || 0;
  const unitPrice = Number(item.unitPrice) || 0;
  // 精度控制：先对含损耗的用量做4位小数舍入，再计算总价，避免浮点精度污染
  const roundedUsage = Math.round(effectiveUsage * (1 + lossRate / 100) * 10000) / 10000;
  return Number((roundedUsage * unitPrice).toFixed(2));
};

// 解析 JSON 数字 map（如 sizeUsageMap/sizeSpecMap 字段值）
export const parseNumberMap = (value?: string): Record<string, number> => {
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
};

// 从字符串中提取第一个数字（用于规格推断默认规格长度）
export const extractSpecLength = (value?: string): number => {
  const matched = String(value || '').match(/(\d+(?:\.\d+)?)/);
  return matched ? Number(matched[1]) : 0;
};

// 根据尺码列表构建 sizeUsageMap 字符串
export const buildSizeUsageMap = (
  activeSizes: string[],
  usageAmount: number,
  existing?: string
): string => {
  const parsed = parseNumberMap(existing);
  if (!activeSizes.length) return existing || '';
  return JSON.stringify(
    Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? usageAmount ?? 0)]))
  );
};

// 根据尺码列表构建 sizeSpecMap 字符串
export const buildSizeSpecMap = (
  activeSizes: string[],
  extractSpec: (value?: string) => number,
  specification?: string,
  existing?: string
): string => {
  const parsed = parseNumberMap(existing);
  const defaultSpec = extractSpec(specification);
  if (!activeSizes.length) return existing || '';
  return JSON.stringify(
    Object.fromEntries(activeSizes.map((size) => [size, Number(parsed[size] ?? defaultSpec ?? 0)]))
  );
};
