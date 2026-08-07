// ── Constants ──────────────────────────────────────────

export const REVIEW_STATUS_OPTIONS = [
  { label: '审核通过', value: 'PASS' },
  { label: '需返修', value: 'REWORK' },
  { label: '审核不通过', value: 'REJECT' },
];

export const CATEGORY_MAP: Record<string, string> = {
  WOMAN: '女装',
  WOMEN: '女装',
  MAN: '男装',
  MEN: '男装',
  KID: '童装',
  KIDS: '童装',
  WCMAN: '女童装',
  UNISEX: '男女同款',
};

export const SEASON_MAP: Record<string, string> = {
  SPRING: '春季',
  SUMMER: '夏季',
  AUTUMN: '秋季',
  WINTER: '冬季',
  SPRING_SUMMER: '春夏',
  AUTUMN_WINTER: '秋冬',
};

export const STAGE_MIN_SLOT_WIDTH = 128;

// 行业标准：生产工序只含4个阶段（裁剪/二次工艺/车缝/尾部）
// 采购/入库不属于生产工序，进度由采购单状态/仓库收货驱动
export const SAMPLE_PARENT_STAGES = [
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
];
export const SAMPLE_PROGRESS_NODE_ALIASES: Record<string, string[]> = {
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
};
