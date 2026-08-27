// 行业标准：生产工序只含4个阶段（裁剪/二次工艺/车缝/尾部）
// 采购/入库不属于生产工序，进度由采购单状态/仓库收货驱动
const SAMPLE_PARENT_STAGES = [
  { key: 'cutting', name: '裁剪' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'sewing', name: '车缝' },
  { key: 'tail', name: '尾部' },
];

const STAGE_NAMES = {
  cutting: '裁剪',
  secondary: '二次工艺',
  sewing: '车缝',
  tail: '尾部',
};

const SAMPLE_PROGRESS_NODE_ALIASES = {
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
};

function getStageName(key) {
  return STAGE_NAMES[key] || key || '';
}

// D-182：子工序名/progressStage → 父阶段 key 映射（与列表页/PC 端 resolveStageKey 同源）
const STAGE_KEY_MAP = {
  '采购': 'procurement', '裁剪': 'cutting', '二次工艺': 'secondary',
  '车缝': 'sewing', '尾部': 'tail', '入库': 'warehousing',
  'procurement': 'procurement', 'cutting': 'cutting', 'secondary': 'secondary',
  'sewing': 'sewing', 'tail': 'tail', 'warehousing': 'warehousing',
  '缝制': 'sewing', '后整': 'tail', '下板': 'cutting', '裁床': 'cutting',
};

function resolveStageKey(name) {
  if (!name) return 'unknown';
  if (STAGE_KEY_MAP[name]) return STAGE_KEY_MAP[name];
  const lower = String(name).toLowerCase();
  for (const k in STAGE_KEY_MAP) {
    if (lower.indexOf(k.toLowerCase()) >= 0 || lower.indexOf(STAGE_KEY_MAP[k].toLowerCase()) >= 0) {
      return STAGE_KEY_MAP[k];
    }
  }
  return 'unknown';
}

function getStageByKey(key) {
  return SAMPLE_PARENT_STAGES.find(function (s) { return s.key === key; });
}

function getAllStageKeys() {
  return SAMPLE_PARENT_STAGES.map(function (s) { return s.key; });
}

function getAllStageNames() {
  return SAMPLE_PARENT_STAGES.map(function (s) { return s.name; });
}

module.exports = {
  SAMPLE_PARENT_STAGES,
  STAGE_NAMES,
  SAMPLE_PROGRESS_NODE_ALIASES,
  STAGE_KEY_MAP,
  resolveStageKey,
  getStageName,
  getStageByKey,
  getAllStageKeys,
  getAllStageNames,
};
