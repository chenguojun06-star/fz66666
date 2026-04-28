export const STAGE_ORDER: string[] = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

export const CUTTING_STAGE_ORDER: string[] = ['裁剪', '二次工艺', '车缝', '尾部', '入库'];

export interface StageSpanInfo {
  rowSpan: number;
  stage: string;
  count: number;
}

export function computeStageSortedAndSpan<T extends { progressStage?: string }>(
  items: T[],
  stageOrder: readonly string[] = STAGE_ORDER,
): { sorted: T[]; spanMap: Map<number, StageSpanInfo> } {
  const resolveStage = (item: T) => {
    const ps = item.progressStage?.trim();
    if (ps && stageOrder.includes(ps)) return ps;
    if (ps) return ps;
    return stageOrder[0] || '裁剪';
  };
  const sorted = [...items].sort((a, b) => {
    const sa = stageOrder.indexOf(resolveStage(a));
    const sb = stageOrder.indexOf(resolveStage(b));
    // 自定义阶段（不在 stageOrder 中，indexOf=-1）排到已知阶段后面
    const na = sa === -1 ? stageOrder.length : sa;
    const nb = sb === -1 ? stageOrder.length : sb;
    return na - nb;
  });
  const spanMap = new Map<number, StageSpanInfo>();
  let i = 0;
  while (i < sorted.length) {
    const stage = resolveStage(sorted[i]);
    let j = i + 1;
    while (j < sorted.length && resolveStage(sorted[j]) === stage) j++;
    const count = j - i;
    spanMap.set(i, { rowSpan: count, stage, count });
    for (let k = i + 1; k < j; k++) spanMap.set(k, { rowSpan: 0, stage, count });
    i = j;
  }
  return { sorted, spanMap };
}

export const stageAliasMap: Record<string, string[]> = {
  procurement: ['采购', '物料采购', '面辅料采购', '备料', '到料', '进料', '物料'],
  cutting: ['裁剪', '裁床', '剪裁', '开裁', '裁片', '裁切'],
  sewing: ['车缝', '缝制', '缝纫', '车工', '整件', '生产', '制作', '车位', '车间生产'],
  tailProcess: ['尾部', '后整理', '后道'],
  secondaryProcess: ['二次工艺', '二次'],
  warehousing: ['入库', '仓储', '上架', '进仓', '入仓', '验收', '成品入库'],
};

export const carSewingKeywords: string[] = [...stageAliasMap.sewing];

export const tailProcessKeywords: string[] = [...stageAliasMap.tailProcess];

/**
 * 规范化阶段名（解决"质检入库"同时匹配质检和入库的歧义问题）
 * "质检入库"业务含义是"入库"（质检后入仓），不是"质检"
 */
export const canonicalizeStage = (raw: string): string => {
  const s = raw.trim();
  if (s === '质检入库') return '入库';
  return s;
};

const CHINESE_TO_ENGLISH_STAGE: Record<string, string> = {
  '采购': 'procurement', '物料采购': 'procurement', '面辅料采购': 'procurement', '备料': 'procurement', '到料': 'procurement', '进料': 'procurement', '物料': 'procurement',
  '裁剪': 'cutting', '裁床': 'cutting', '剪裁': 'cutting', '开裁': 'cutting', '裁片': 'cutting', '裁切': 'cutting',
  '二次工艺': 'secondaryProcess', '二次': 'secondaryProcess',
  '车缝': 'carSewing', '缝制': 'carSewing', '缝纫': 'carSewing', '车工': 'carSewing', '整件': 'carSewing', '生产': 'carSewing', '制作': 'carSewing', '车位': 'carSewing', '车间生产': 'carSewing',
  '尾部': 'tailProcess', '后整理': 'tailProcess', '后道': 'tailProcess',
  '入库': 'warehousing', '仓储': 'warehousing', '上架': 'warehousing', '进仓': 'warehousing', '入仓': 'warehousing', '验收': 'warehousing', '成品入库': 'warehousing',
};

const resolveEnglishStageKey = (key: string): string => {
  const trimmed = key.trim();
  if (stageAliasMap[trimmed]) return trimmed;
  const mapped = CHINESE_TO_ENGLISH_STAGE[trimmed];
  if (mapped) return mapped;
  for (const [cn, en] of Object.entries(CHINESE_TO_ENGLISH_STAGE)) {
    if (trimmed.includes(cn) || cn.includes(trimmed)) return en;
  }
  return trimmed;
};

export const getStageAliases = (nodeTypeKey: string, nodeName?: string) => {
  const englishKey = resolveEnglishStageKey(nodeTypeKey);
  const aliases = [nodeName || '', nodeTypeKey, englishKey, ...(stageAliasMap[englishKey] || [])]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  return Array.from(new Set(aliases));
};

export const matchRecordToStage = (recordStage?: string, recordProcess?: string, nodeTypeKey?: string, nodeName?: string) => {
  const aliases = getStageAliases(String(nodeTypeKey || '').trim(), nodeName)
    .map((v) => v.toLowerCase());
  // 规范化记录的阶段/工序名称，消除"质检入库"歧义
  const stage = canonicalizeStage(String(recordStage || '').trim()).toLowerCase();
  const process = canonicalizeStage(String(recordProcess || '').trim()).toLowerCase();
  if (!stage && !process) return false;
  return aliases.some((alias) =>
    stage.includes(alias) || alias.includes(stage) ||
    process.includes(alias) || alias.includes(process)
  );
};

export const getScanTypeFromNodeKey = (nodeTypeKey?: string) => {
  const map: Record<string, string> = {
    procurement: 'production',
    cutting: 'cutting',
    sewing: 'production',
    carSewing: 'production',
    quality: 'quality',
    ironing: 'production',
    packaging: 'production',
    tailProcess: 'production',
    warehousing: 'warehouse',
    secondaryProcess: 'production',
  };
  const key = String(nodeTypeKey || '').trim();
  return map[key];
};

/**
 * 格式化工序显示名称：工序编号 + 工序名称
 * @param processCode 工序编号（如 "01", "02"）
 * @param processName 工序名称（如 "裁剪", "绣花"）
 * @returns 格式化后的显示名称（如 "01 裁剪", "02 绣花"）
 */
export const formatProcessDisplayName = (processCode?: string, processName?: string): string => {
  const code = String(processCode || '').trim();
  const name = String(processName || '').trim();
  if (!code && !name) return '-';
  if (!code || code === name) return name || '-';
  if (!name) return code;
  return `${code} ${name}`;
};
