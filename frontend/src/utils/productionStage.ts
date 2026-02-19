export const stageAliasMap: Record<string, string[]> = {
  procurement: ['采购'],
  cutting: ['裁剪', '裁床', '剪裁', '开裁'],
  sewing: ['车缝', '缝制', '缝纫', '车工'],
  ironing: ['整烫', '熨烫', '大烫'],
  quality: ['质检', '检验', '品检', '验货'],
  packaging: ['包装', '后整', '打包', '装箱'],
  secondaryProcess: ['二次工艺', '绣花', '印花'],
  warehousing: ['入库'],
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
  const stage = String(recordStage || '').trim().toLowerCase();
  const process = String(recordProcess || '').trim().toLowerCase();
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
    quality: 'quality',
    ironing: 'pressing',
    packaging: 'packaging',
    warehousing: 'warehousing',
  };
  const key = String(nodeTypeKey || '').trim();
  return map[key];
};
