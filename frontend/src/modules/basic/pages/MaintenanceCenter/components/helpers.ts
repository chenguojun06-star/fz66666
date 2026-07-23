import type { TemplateLibrary } from '@/types/style';

export interface PageResp<T> { records: T[]; total: number }

export const directCardStyle = {
  border: '1px solid #ececec',
  borderRadius: 10,
  padding: 12,
  background: 'var(--color-bg-base)',
} as const;

export const directStackStyle = { display: 'grid', gap: 10 } as const;

export const directTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--color-text-primary)',
  lineHeight: 1.2,
} as const;

export const directMetaStyle = {
  fontSize: 14,
  color: 'var(--neutral-text-secondary)',
  lineHeight: 1.4,
} as const;

export const directFieldLabelStyle = {
  marginBottom: 4,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--neutral-text-secondary)',
} as const;

export const processingBannerStyle = {
  marginBottom: 10,
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #ffd591',
  background: 'var(--status-warning-bg)',
  display: 'grid',
  gap: 4,
} as const;

export const templateTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '工序进度单价', value: 'process' },
  { label: '多码工序进度单价', value: 'process_size' },
];

export interface UnitPricePanelProps { styleNo?: string; onSaved?: () => void; }

export const normalizeTemplateRecords = (payload: unknown, sourceStyleNo?: string) => {
  const records = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as PageResp<TemplateLibrary> | undefined)?.records)
      ? (payload as PageResp<TemplateLibrary>).records
      : [];
  const normalizedStyleNo = String(sourceStyleNo || '').trim();
  return records
    .filter((item): item is TemplateLibrary => !!item)
    .filter((item) => !normalizedStyleNo || String(item.sourceStyleNo || '').trim() === normalizedStyleNo);
};

export const parseTemplateContent = (content: unknown) => {
  if (typeof content === 'object' && content !== null) return content;
  const text = String(content ?? '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export const isProcessSizeTemplate = (row: TemplateLibrary) => {
  const parsed = parseTemplateContent(row?.templateContent);
  return !!parsed && typeof parsed === 'object' && Array.isArray((parsed as { sizes?: unknown[] }).sizes);
};

export const isUnitPriceTemplate = (row: TemplateLibrary, selectedType?: string) => {
  const normalizedSelectedType = String(selectedType || '').trim().toLowerCase();
  const normalizedRowType = String(row?.templateType || '').trim().toLowerCase();
  if (normalizedRowType === 'size' || normalizedRowType === 'bom') return false;
  if (!normalizedSelectedType) {
    return normalizedRowType === 'process' || normalizedRowType === 'process_price';
  }
  if (normalizedSelectedType === 'process_size') {
    return (normalizedRowType === 'process' || normalizedRowType === 'process_price') && isProcessSizeTemplate(row);
  }
  return normalizedRowType === normalizedSelectedType;
};

export const getDirectTemplatePriority = (row: TemplateLibrary) => {
  const normalizedRowType = String(row?.templateType || '').trim().toLowerCase();
  if (normalizedRowType === 'process_price') return 0;
  if (normalizedRowType === 'process' && !isProcessSizeTemplate(row)) return 1;
  if (normalizedRowType === 'process') return 2;
  return 99;
};

export const isLockedRow = (row?: TemplateLibrary | null) => {
  const v = Number(row?.locked);
  return Number.isFinite(v) && v === 1;
};

export const isProcessingRow = (row?: TemplateLibrary | null) => !!row && !isLockedRow(row);
