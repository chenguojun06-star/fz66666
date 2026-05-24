export const toMoney = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

export const toMoneyLocale = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
};

export const toPercent = (v: unknown, decimals = 1): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0%';
  return `${(n * 100).toFixed(decimals)}%`;
};

export const toPercentRaw = (v: unknown, decimals = 1): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(decimals)}%`;
};
