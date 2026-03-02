export const stageAliasMap: Record<string, string[]> = {
  procurement: ['采购', '物料', '备料'],
  cutting: ['裁剪', '裁床', '剪裁', '开裁'],
  sewing: ['车缝', '缝制', '缝纫', '车工', '整件'],
  ironing: ['整烫', '熨烫', '大烫'],
  quality: ['质检', '检验', '品检', '验货'],
  packaging: ['包装', '后整', '打包', '装箱'],
  secondaryProcess: ['二次工艺', '绣花', '印花', '二次'],
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
    procurement: 'procurement',
    cutting: 'cutting',
    sewing: 'sewing',
    carSewing: 'sewing',       // List/utils.ts 使用 carSewing 键名，需对齐
    quality: 'quality',
    ironing: 'pressing',
    packaging: 'packaging',
    tailProcess: 'packaging',  // 尾部=大尾部工序（整烫/包装/质检）
    warehousing: 'warehousing',
    secondaryProcess: 'sewing', // 二次工艺归入扫码类型 sewing
  };
  const key = String(nodeTypeKey || '').trim();
  return map[key];
};
