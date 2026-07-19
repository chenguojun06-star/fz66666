const SAMPLE_PARENT_STAGES = [
  { key: 'procurement', name: '采购' },
  { key: 'cutting', name: '裁剪' },
  { key: 'secondary', name: '二次工艺' },
  { key: 'sewing', name: '车缝' },
  { key: 'tail', name: '尾部' },
  { key: 'warehousing', name: '入库' },
];

const STAGE_NAMES = {
  procurement: '采购',
  cutting: '裁剪',
  secondary: '二次工艺',
  sewing: '车缝',
  tail: '尾部',
  warehousing: '入库',
};

const SAMPLE_PROGRESS_NODE_ALIASES = {
  procurement: ['procurement', '采购'],
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
  warehousing: ['warehousing', '入库'],
};

function getStageName(key) {
  return STAGE_NAMES[key] || key || '';
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
  getStageName,
  getStageByKey,
  getAllStageKeys,
  getAllStageNames,
};
