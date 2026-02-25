// TemplateCenter 公共类型和工具函数

export type TemplateLibraryRecord = import('@/types/style').TemplateLibrary & Record<string, unknown>;

export type SizeTablePart = {
  partName: string;
  values?: Record<string, string>;
  measureMethod?: string;
  tolerance?: string | number;
};

export type SizeTableData = { sizes: string[]; parts: SizeTablePart[] };

export type BomTableRow = {
  materialName?: string;
  spec?: string;
  quantity?: string | number;
  unit?: string;
};

export type BomTableData = BomTableRow[];

export type BomTableContainer = { rows: BomTableRow[] };

/** 合并后的工序进度单价模板行类型 */
export type ProcessStepRow = {
  processCode?: string;
  processName?: string;
  progressStage?: string; // 进度节点
  machineType?: string;
  standardTime?: number;
  unitPrice?: number;    // 工价（统一使用 unitPrice）
  price?: number;        // 兼容旧数据
  sizePrices?: Record<string, number>; // 多码单价 { 'XS': 1.5, 'S': 1.5, 'M': 2.0 }
};

/** 工序进度单价模板数据（含 sizes 尺码列表） */
export type ProcessTableData = { steps: ProcessStepRow[]; sizes?: string[] };

export type ProcessPriceRow = {
  processCode?: string;
  processName?: string;
  unitPrice?: number;
};

export type ProcessPriceTableData = { steps: ProcessPriceRow[] };

export const MAIN_PROGRESS_STAGE_OPTIONS = [
  { value: '采购', label: '采购' },
  { value: '裁剪', label: '裁剪' },
  { value: '车缝', label: '车缝' },
  { value: '二次工艺', label: '二次工艺' },
  { value: '尾部', label: '尾部' },
  { value: '入库', label: '入库' },
];

export const isSizeTableData = (data: any): data is SizeTableData => {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray(data.sizes) && Array.isArray(data.parts);
};

export const isBomTableData = (data: any): data is BomTableData => Array.isArray(data);

export const isBomTableContainer = (data: any): data is BomTableContainer => {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray(data.rows);
};

export const isProcessTableData = (data: any): data is ProcessTableData => {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray(data.steps);
};

export const isProcessPriceTableData = (data: any): data is ProcessPriceTableData => {
  if (!data || typeof data !== 'object') return false;
  return Array.isArray(data.steps);
};

export const convertStyleSizeListToTable = (rows: Record<string, unknown>[]): SizeTableData => {
  const sizeSet: string[] = [];
  const partMap = new Map<string, SizeTablePart>();
  rows.forEach((row) => {
    const sizeName = String(row?.sizeName ?? '').trim();
    const partName = String(row?.partName ?? '').trim();
    if (!sizeName || !partName) return;
    if (!sizeSet.includes(sizeName)) sizeSet.push(sizeName);
    if (!partMap.has(partName)) {
      partMap.set(partName, {
        partName,
        measureMethod: String(row?.measureMethod ?? '').trim() || undefined,
        tolerance: row?.tolerance as string | number | undefined,
        values: {},
      });
    }
    const part = partMap.get(partName)!;
    const value = row?.standardValue;
    const v = value == null ? '' : String(value);
    part.values = { ...(part.values || {}), [sizeName]: v };
  });
  return { sizes: sizeSet, parts: Array.from(partMap.values()) };
};

export const normalizeProcessSteps = (steps: ProcessStepRow[]) => {
  const sorted = [...steps].sort((a, b) => {
    const na = Number.parseInt(String(a.processCode ?? '').trim() || '0', 10);
    const nb = Number.parseInt(String(b.processCode ?? '').trim() || '0', 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) {
      return na - nb;
    }
    return 0;
  });
  return sorted.map((s, idx) => ({
    ...s,
    processCode: String(idx + 1).padStart(2, '0'),
  }));
};

export const typeColor = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'blue';
  if (v === 'size') return 'purple';
  if (v === 'process') return 'green';
  return 'default';
};

export const formatTemplateKey = (raw: unknown) => {
  const key = String(raw ?? '').trim();
  if (!key) return { text: '-', full: '' };
  if (key === 'default') return { text: '系统默认', full: key };
  if (key.startsWith('style_')) return { text: key.slice(6) || key, full: key };
  if (key.startsWith('progress_custom_')) return { text: '自定义', full: key };
  return { text: key, full: key };
};

export const typeLabel = (t: string) => {
  const v = String(t || '').trim().toLowerCase();
  if (v === 'bom') return 'BOM';
  if (v === 'size') return '尺寸';
  if (v === 'process') return '工序进度单价';
  return v || '-';
};

export const hasErrorFields = (err: unknown): err is { errorFields: unknown } => {
  return typeof err === 'object' && err !== null && 'errorFields' in err;
};

export const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
};
