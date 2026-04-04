import { sortSizeNames, toNumberSafe } from '@/utils/api';

export type MatrixCell = {
  id?: string | number;
  value: number;
};

export type GradingZone = {
  key: string;
  label: string;
  sizes: string[];
  step: number;
  partKeys?: string[];
  frontSizes?: string[];
  frontStep?: number;
  backSizes?: string[];
  backStep?: number;
};

export type MatrixRow = {
  key: string;
  groupName: string;
  partName: string;
  measureMethod: string;
  baseSize: string;
  gradingZones: GradingZone[];
  tolerance: number;
  sort: number;
  cells: Record<string, MatrixCell>;
  imageUrls?: string[];
};

export type GroupToneMeta = {
  key: 'upper' | 'lower' | 'other';
  tint: string;
  tagBg: string;
  tagColor: string;
};

export type DisplayRow = MatrixRow & {
  resolvedGroupName: string;
  groupToneMeta: GroupToneMeta;
  isGroupStart: boolean;
  isGroupChunkStart: boolean;
  groupChunkSpan: number;
  isImageChunkStart: boolean;
  imageChunkSpan: number;
  chunkImageUrls: string[];
  chunkRowKeys: string[];
};

const GROUP_TONE_METAS: Record<GroupToneMeta['key'], GroupToneMeta> = {
  upper: {
    key: 'upper',
    tint: '#f7fbff',
    tagBg: '#e8f3ff',
    tagColor: '#1677ff',
  },
  lower: {
    key: 'lower',
    tint: '#fffaf2',
    tagBg: '#fff1db',
    tagColor: '#d48806',
  },
  other: {
    key: 'other',
    tint: '#fafafa',
    tagBg: '#f0f0f0',
    tagColor: '#595959',
  },
};

export const splitSizeNames = (name: string) => {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const parts = raw
    .split(/[\n,，、;；]+/g)
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  if (!parts.length) return [];
  return parts;
};

export const normalizeSizeList = (sizes: string[] = []) => {
  return sortSizeNames(
    Array.from(
      new Set(
        sizes
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    ),
  );
};

const inferGroupNameFromPart = (partName: string): string => {
  const normalized = String(partName || '').replace(/\s+/g, '').toLowerCase();
  if (!normalized) return '其他区';

  const upperKeywords = [
    '衣长', '胸围', '肩宽', '袖长', '袖口', '袖肥', '领围', '领宽', '领深', '门襟', '胸宽', '摆围', '下摆', '前长', '后长', '前胸', '后背', '袖窿',
  ];
  const lowerKeywords = [
    '裤长', '腰围', '臀围', '前浪', '后浪', '脚口', '裤口', '腿围', '小腿围', '大腿围', '膝围', '坐围', '裆', '裙长', '裙摆',
  ];

  if (upperKeywords.some((keyword) => normalized.includes(keyword))) {
    return '上装区';
  }
  if (lowerKeywords.some((keyword) => normalized.includes(keyword))) {
    return '下装区';
  }
  return '其他区';
};

export const resolveGroupName = (groupName?: string, partName?: string) => {
  const explicit = String(groupName || '').trim();
  if (explicit) return explicit;
  return inferGroupNameFromPart(String(partName || ''));
};

export const resolveGroupToneMeta = (groupName: string): GroupToneMeta => {
  const normalized = String(groupName || '').replace(/\s+/g, '').toLowerCase();
  if (normalized.includes('上装')) {
    return GROUP_TONE_METAS.upper;
  }
  if (normalized.includes('下装') || normalized.includes('裤') || normalized.includes('裙')) {
    return GROUP_TONE_METAS.lower;
  }
  return GROUP_TONE_METAS.other;
};

export const normalizeRowSorts = (list: MatrixRow[]) => {
  return list.map((row, index) => ({
    ...row,
    sort: index + 1,
  }));
};

export const normalizeChunkImageAssignments = (list: MatrixRow[]) => {
  const sortedRows = normalizeRowSorts(list)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const sortDiff = toNumberSafe(a.row.sort) - toNumberSafe(b.row.sort);
      return sortDiff !== 0 ? sortDiff : a.index - b.index;
    })
    .map((item) => item.row);

  const groupOrder: string[] = [];
  const grouped = new Map<string, MatrixRow[]>();
  sortedRows.forEach((row) => {
    const groupName = resolveGroupName(row.groupName, row.partName);
    if (!grouped.has(groupName)) {
      grouped.set(groupName, []);
      groupOrder.push(groupName);
    }
    grouped.get(groupName)!.push(row);
  });

  const normalizedRows: MatrixRow[] = [];
  groupOrder.forEach((groupName) => {
    const groupRows = grouped.get(groupName) || [];
    const ownerImages = groupRows.find((row) => Array.isArray(row.imageUrls) && row.imageUrls.length > 0)?.imageUrls;
    groupRows.forEach((row, index) => {
      normalizedRows.push({
        ...row,
        imageUrls: index === 0 && ownerImages?.length ? ownerImages.slice(0, 2) : undefined,
      });
    });
  });

  return normalizedRows;
};

export const buildEmptySizeCells = (sizeColumns: string[]) => {
  const cells: Record<string, MatrixCell> = {};
  sizeColumns.forEach((sizeName) => {
    cells[sizeName] = { value: 0 };
  });
  return cells;
};

export const createGradingZone = (
  sizes: string[] = [],
  label = '跳码区',
  partKeys: string[] = [],
  frontSizes: string[] = [],
  backSizes: string[] = [],
): GradingZone => ({
  key: `grading-zone-${Date.now()}-${Math.random()}`,
  label,
  sizes,
  step: 0,
  partKeys,
  frontSizes,
  frontStep: 0,
  backSizes,
  backStep: 0,
});

export const normalizeGradingZones = (zones: GradingZone[], sizeColumns: string[]) => {
  const validSizes = new Set(sizeColumns);
  return zones
    .map((zone, index) => {
      let frontSizes = (zone.frontSizes || []).filter((size) => validSizes.has(size));
      let backSizes = (zone.backSizes || []).filter((size) => validSizes.has(size));
      if (frontSizes.length === 0 && backSizes.length === 0 && (zone.sizes || []).length > 0) {
        const allSizes = (zone.sizes || []).filter((size) => validSizes.has(size));
        backSizes = allSizes;
      }
      return {
        key: zone.key || `grading-zone-${index}`,
        label: String(zone.label || `跳码区${index + 1}`),
        sizes: zone.sizes || [],
        step: toNumberSafe(zone.step),
        frontSizes,
        frontStep: toNumberSafe(zone.frontStep || zone.step),
        backSizes,
        backStep: toNumberSafe(zone.backStep || zone.step),
      };
    })
    .filter((zone) => zone.frontSizes.length > 0 || zone.backSizes.length > 0);
};

export const parseGradingRule = (rule: unknown, sizeColumns: string[]) => {
  try {
    const parsed = JSON.parse(String(rule || '{}'));
    const zones = normalizeGradingZones(
      Array.isArray(parsed?.zones) ? parsed.zones.map((zone: any, index: number) => ({
        key: String(zone?.key || `grading-zone-${index}`),
        label: String(zone?.label || `跳码区${index + 1}`),
        sizes: Array.isArray(zone?.sizes) ? zone.sizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        step: toNumberSafe(zone?.step),
        frontSizes: Array.isArray(zone?.frontSizes) ? zone.frontSizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        frontStep: toNumberSafe(zone?.frontStep),
        backSizes: Array.isArray(zone?.backSizes) ? zone.backSizes.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
        backStep: toNumberSafe(zone?.backStep),
      })) : [],
      sizeColumns,
    );
    const baseSize = sizeColumns.includes(String(parsed?.baseSize || '').trim())
      ? String(parsed.baseSize).trim()
      : '';
    return { baseSize, gradingZones: zones };
  } catch {
    return {
      baseSize: '',
      gradingZones: [],
    };
  }
};

export const serializeGradingRule = (row: MatrixRow, sizeColumns: string[]) => {
  const gradingZones = normalizeGradingZones(row.gradingZones || [], sizeColumns);
  return JSON.stringify({
    baseSize: String(row.baseSize || '').trim(),
    zones: gradingZones.map((zone) => ({
      key: zone.key,
      label: zone.label,
      sizes: zone.sizes,
      step: toNumberSafe(zone.step),
      frontSizes: zone.frontSizes,
      frontStep: toNumberSafe(zone.frontStep),
      backSizes: zone.backSizes,
      backStep: toNumberSafe(zone.backStep),
    })),
  });
};
