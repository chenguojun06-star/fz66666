import type { StyleInfo } from '@/types/style';

const SOURCE_TYPE_SELECTION = 'SELECTION_CENTER';
const SELECTION_DETAILS = new Set(['外部市场', '供应商', '客户定制', '内部选品', '选品中心']);

const cleanText = (value: unknown): string => String(value || '').trim();

const looksLikeMojibake = (value: string): boolean => {
  if (!value) return false;
  if (value.length > 12 || value.includes('�')) return true;
  return Array.from(value).some((char) => {
    const code = char.codePointAt(0) || 0;
    return code >= 0x00c0 && code <= 0x024f;
  });
};

const normalizeSourceDetail = (type: string, detail: string): string => {
  if (type === SOURCE_TYPE_SELECTION) {
    if (!detail || looksLikeMojibake(detail) || !SELECTION_DETAILS.has(detail)) {
      return '选品中心';
    }
    return detail;
  }
  return '自主开发';
};

export const getStyleSourceMeta = (record: Pick<StyleInfo, 'developmentSourceType' | 'developmentSourceDetail'>) => {
  const type = cleanText(record.developmentSourceType).toUpperCase();
  const normalizedType = type === SOURCE_TYPE_SELECTION ? SOURCE_TYPE_SELECTION : 'SELF_DEVELOPED';
  const detail = normalizeSourceDetail(normalizedType, cleanText(record.developmentSourceDetail));
  const label = normalizedType === SOURCE_TYPE_SELECTION ? `选品来源·${detail}` : '自主开发';

  return {
    type: normalizedType,
    detail,
    label,
    color: normalizedType === SOURCE_TYPE_SELECTION ? 'volcano' : 'blue',
  } as const;
};

export const getStyleSourceText = (record: Pick<StyleInfo, 'developmentSourceType' | 'developmentSourceDetail'>): string => {
  return getStyleSourceMeta(record).label;
};
