type CategoryOption = { label: string; value: string };

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
  return raw;
};
