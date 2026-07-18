/**
 * 样衣工序阶段映射工具（与 PC 端 useSampleProcessProgress.ts / styleTableViewUtils.ts 完全对齐）
 *
 * PC 端源文件：
 * - frontend/src/modules/basic/pages/StyleInfoList/components/useSampleProcessProgress.ts
 * - frontend/src/modules/basic/pages/StyleInfoList/components/styleTableViewUtils.ts
 *
 * 作用：把子工序（如"侧缝""上领"）归类到 6 个父阶段（采购/裁剪/二次工艺/车缝/尾部/入库）
 */

// 样衣 6 个父阶段定义（与 PC 端 SAMPLE_PARENT_STAGES 一致）
var SAMPLE_PARENT_STAGES = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];

// 工序名 → 父阶段 key 映射（与 PC 端 STAGE_KEY_MAP 一致）
var STAGE_KEY_MAP = {
  '采购': 'procurement',
  '裁剪': 'cutting',
  '二次工艺': 'secondary',
  '车缝': 'sewing',
  '尾部': 'tail',
  '入库': 'warehousing',
  'procurement': 'procurement',
  'cutting': 'cutting',
  'secondary': 'secondary',
  'sewing': 'sewing',
  'tail': 'tail',
  'warehousing': 'warehousing',
  // 同义词映射
  '缝制': 'sewing',
  '后整': 'tail',
  '下板': 'cutting',
  '裁床': 'cutting',
};

// 样衣扫码 operationType（英文大写）→ 中文工序名 映射（与 PC 端 OP_TYPE_TO_CHINESE 一致）
var OP_TYPE_TO_CHINESE = {
  RECEIVE: '采购',
  CUTTING: '裁剪',
  SECONDARY: '二次工艺',
  SEWING: '车缝',
  TAIL: '尾部',
  WAREHOUSE_IN: '入库',
  WAREHOUSE_OUT: '出库',
  WAREHOUSE_RETURN: '归还',
  PLATE: '车板',
  FOLLOW_UP: '跟单确认',
  COMPLETE: '完成确认',
  REVIEW: '审核',
  REWORK: '返修',
  PROCUREMENT: '采购',
  IRONING: '整烫',
  QUALITY: '质检',
  PACKAGING: '包装',
};

/**
 * 解析阶段 key（与 PC 端 resolveStageKey 一致）
 * 1. 精确匹配 STAGE_KEY_MAP
 * 2. 模糊匹配（名称包含已知阶段关键词）
 * 3. 无法匹配返回 'unknown'
 */
function resolveStageKey(name) {
  if (!name) return 'tail';
  if (STAGE_KEY_MAP[name]) return STAGE_KEY_MAP[name];
  var lower = String(name).toLowerCase();
  for (var key in STAGE_KEY_MAP) {
    if (Object.prototype.hasOwnProperty.call(STAGE_KEY_MAP, key)) {
      var val = STAGE_KEY_MAP[key];
      if (lower.indexOf(String(key).toLowerCase()) >= 0 || lower.indexOf(String(val).toLowerCase()) >= 0) {
        return val;
      }
    }
  }
  return 'unknown';
}

/**
 * 规范化操作类型（与 PC 端 normalizeOperationType 一致）
 * 英文大写 operationType → 中文工序名
 */
function normalizeOperationType(opType) {
  if (!opType) return null;
  var upper = String(opType).trim().toUpperCase();
  return OP_TYPE_TO_CHINESE[upper] || null;
}

/**
 * 按父阶段分组子工序（与 PC 端 stages useMemo 逻辑一致）
 * @param {Array} nodes - 工序节点数组，每项需有 name/processCode/progressStage 字段
 * @param {Array} scanRecords - 扫码记录数组
 * @returns {Array} 按 SAMPLE_PARENT_STAGES 顺序分组的阶段数组，每项含 {key,label,subProcesses,completedCount,totalCount,percent}
 */
function groupByParentStages(nodes, scanRecords) {
  // 收集已扫码的工序名/阶段
  var scannedNames = {};
  var scannedStages = {};
  (scanRecords || []).forEach(function (r) {
    if (r.processName) scannedNames[r.processName] = true;
    if (r.operationType) scannedNames[r.operationType] = true;
    var normalized = normalizeOperationType(r.operationType);
    if (normalized) {
      scannedNames[normalized] = true;
      scannedStages[normalized] = true;
    }
    if (r.progressStage) scannedStages[r.progressStage] = true;
  });

  // 按父阶段分组
  var stageMap = {};
  (nodes || []).forEach(function (node) {
    var stageKey = resolveStageKey(node.progressStage || node.name || node.processCode || '');
    if (!stageMap[stageKey]) stageMap[stageKey] = [];
    stageMap[stageKey].push(node);
  });

  // unknown 阶段归入尾部（与 PC 端一致）
  var unknownSubs = stageMap['unknown'] || [];
  if (unknownSubs.length > 0) {
    if (!stageMap['tail']) stageMap['tail'] = [];
    stageMap['tail'] = stageMap['tail'].concat(unknownSubs);
    delete stageMap['unknown'];
  }

  // 按 SAMPLE_PARENT_STAGES 顺序输出
  return SAMPLE_PARENT_STAGES.map(function (stage) {
    var subs = (stageMap[stage.key] || []).map(function (sub) {
      var normName = normalizeOperationType(sub.name);
      var normCode = normalizeOperationType(sub.processCode || '');
      var completed = scannedNames[sub.name] ||
        scannedNames[sub.processCode || ''] ||
        (normName && scannedNames[normName]) ||
        (normCode && scannedNames[normCode]) ||
        (sub.progressStage && scannedStages[sub.progressStage]);
      return Object.assign({}, sub, { completed: !!completed });
    });
    var completedCount = subs.filter(function (s) { return s.completed; }).length;
    var totalCount = subs.length;
    var percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    return {
      key: stage.key,
      label: stage.label,
      subProcesses: subs,
      completedCount: completedCount,
      totalCount: totalCount,
      percent: percent,
    };
  }).filter(function (s) { return s.totalCount > 0; });
}

module.exports = {
  SAMPLE_PARENT_STAGES: SAMPLE_PARENT_STAGES,
  STAGE_KEY_MAP: STAGE_KEY_MAP,
  OP_TYPE_TO_CHINESE: OP_TYPE_TO_CHINESE,
  resolveStageKey: resolveStageKey,
  normalizeOperationType: normalizeOperationType,
  groupByParentStages: groupByParentStages,
};
