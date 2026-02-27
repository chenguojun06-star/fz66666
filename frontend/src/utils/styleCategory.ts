type CategoryOption = { label: string; value: string };

export const CATEGORY_CODE_OPTIONS: CategoryOption[] = [
  { label: '女装', value: 'WOMAN' },
  { label: '男装', value: 'MAN' },
  { label: '童装', value: 'KIDS' },
  { label: '女童装', value: 'WCMAN' },
  { label: '男女同款', value: 'UNISEX' },
  { label: '运动装', value: 'SPORT' },
  { label: '内衣', value: 'UNDERWEAR' },
];

export const SEASON_CODE_OPTIONS: CategoryOption[] = [
  { label: '春季', value: 'SPRING' },
  { label: '夏季', value: 'SUMMER' },
  { label: '秋季', value: 'AUTUMN' },
  { label: '冬季', value: 'WINTER' },
  { label: '春夏', value: 'SPRING_SUMMER' },
  { label: '秋冬', value: 'AUTUMN_WINTER' },
];

export const toCategoryCn = (value: unknown, options?: CategoryOption[]): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const upper = raw.toUpperCase();
  const opt = Array.isArray(options)
    ? options.find((o) => String(o?.value ?? '').trim().toUpperCase() === upper)
    : undefined;
  if (opt?.label) return opt.label;

  const map: Record<string, string> = {
    WOMAN: '女装',
    WOMEN: '女装',
    MAN: '男装',
    MEN: '男装',
    KID: '童装',
    KIDS: '童装',
    CHILD: '童装',
    CHILDREN: '童装',
    WCMAN: '女童装',
    UNISEX: '男女同款',
  };
  return map[upper] || raw;
};

export const normalizeCategoryQuery = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper === 'WOMAN' || upper === 'WOMEN' || raw === '女装') return 'WOMAN';
  if (upper === 'MAN' || upper === 'MEN' || raw === '男装') return 'MAN';
  if (upper === 'KID' || upper === 'KIDS' || upper === 'CHILD' || upper === 'CHILDREN' || raw === '童装') return 'KIDS';
  if (upper === 'WCMAN' || raw === '女童装') return 'WCMAN';
  if (upper === 'UNISEX' || raw === '男女同款') return 'UNISEX';
  if (upper === 'SPORT' || raw === '运动装') return 'SPORT';
  if (upper === 'UNDERWEAR' || raw === '内衣') return 'UNDERWEAR';
  return raw;
};

export const toSeasonCn = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  const upper = raw.toUpperCase();
  const map: Record<string, string> = {
    SPRING: '春季',
    SUMMER: '夏季',
    AUTUMN: '秋季',
    WINTER: '冬季',
    SPRING_SUMMER: '春夏',
    AUTUMN_WINTER: '秋冬',
  };
  return map[upper] || raw;
};

export const normalizeSeasonQuery = (value: unknown): string => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  if (upper === 'SPRING' || raw === '春季') return 'SPRING';
  if (upper === 'SUMMER' || raw === '夏季') return 'SUMMER';
  if (upper === 'AUTUMN' || raw === '秋季') return 'AUTUMN';
  if (upper === 'WINTER' || raw === '冬季') return 'WINTER';
  if (upper === 'SPRING_SUMMER' || raw === '春夏') return 'SPRING_SUMMER';
  if (upper === 'AUTUMN_WINTER' || raw === '秋冬') return 'AUTUMN_WINTER';
  return raw;
};
