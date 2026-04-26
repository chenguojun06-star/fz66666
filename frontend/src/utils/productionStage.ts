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
  const sorted = [...items].sort((a, b) => {
    const sa = stageOrder.indexOf(a.progressStage || '车缝');
    const sb = stageOrder.indexOf(b.progressStage || '车缝');
    if (sa !== sb) return sa - sb;
    return 0;
  });
  const spanMap = new Map<number, StageSpanInfo>();
  let i = 0;
  while (i < sorted.length) {
    const stage = sorted[i].progressStage || '车缝';
    let j = i + 1;
    while (j < sorted.length && (sorted[j].progressStage || '车缝') === stage) j++;
    const count = j - i;
    spanMap.set(i, { rowSpan: count, stage, count });
    for (let k = i + 1; k < j; k++) spanMap.set(k, { rowSpan: 0, stage, count });
    i = j;
  }
  return { sorted, spanMap };
}

export const stageAliasMap: Record<string, string[]> = {
  procurement: ['采购', '物料', '备料'],
  cutting: ['裁剪', '裁床', '剪裁', '开裁'],
  sewing: ['车缝', '缝制', '缝纫', '车工', '整件'],
  ironing: ['整烫', '熨烫', '大烫'],
  quality: ['质检', '检验', '品检', '验货'],
  packaging: ['包装', '后整', '打包', '装箱'],
  secondaryProcess: ['二次工艺', '二次'],
  warehousing: ['入库', '仓库', '质检入库'],
};

/**
 * carSewing 工序关键词（含宽泛别名「生产」，用于列表页/详情页工序分类匹配）
 * sewing 与 carSewing 区别：sewing=进度球节点匹配（精确），carSewing=列表页工序分类（含「生产」宽泛匹配）
 */
export const carSewingKeywords: string[] = [...stageAliasMap.sewing, '生产'];

/**
 * 尾部工序关键词集合（整烫/包装/质检/后整等大尾工序合集）
 * 派生自 ironing + quality + packaging 子集，额外补「尾部」「剪线」
 */
export const tailProcessKeywords: string[] = [
  '尾部', '剪线',
  ...stageAliasMap.ironing,
  ...stageAliasMap.quality,
  ...stageAliasMap.packaging,
];

/**
 * 规范化阶段名（解决"质检入库"同时匹配质检和入库的歧义问题）
 * "质检入库"业务含义是"入库"（质检后入仓），不是"质检"
 */
const canonicalizeStage = (raw: string): string => {
  const s = raw.trim();
  if (s === '质检入库') return '入库';
  return s;
};

export const getStageAliases = (nodeTypeKey: string, nodeName?: string) => {
  const aliases = [nodeName || '', nodeTypeKey, ...(stageAliasMap[nodeTypeKey] || [])]
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
  if (!code) return name || '-';
  if (!name) return code;
  return `${code} ${name}`;
};
