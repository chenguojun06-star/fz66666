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

export const SAMPLE_PARENT_STAGES = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondary', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tail', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];
export const SAMPLE_PROGRESS_NODE_ALIASES: Record<string, string[]> = {
  procurement: ['procurement', '采购'],
  cutting: ['cutting', '裁剪', '下板'],
  secondary: ['secondary', '二次工艺'],
  sewing: ['sewing', '车缝', '缝制'],
  tail: ['tail', '尾部', '后整'],
  warehousing: ['warehousing', '入库'],
};
