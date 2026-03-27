import type { StyleBom } from '@/types/style';
import type { OrderLine } from '../types';

export type OrderQtyStats = {
  total: number;
  byColor: Map<string, number>;
  bySize: Map<string, number>;
  byColorSize: Map<string, number>;
};

export const normalizeMatchKey = (value: unknown) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

export const buildOrderOptionSet = (raw: unknown) => {
  const list = String(raw || '')
    .split(/[、,，/／|\n]+/)
    .map(normalizeMatchKey)
    .filter(Boolean);
  return list.length ? new Set(list) : null;
};

export const buildOrderQtyStats = (orderLines: OrderLine[]): OrderQtyStats => {
  const byColor = new Map<string, number>();
  const bySize = new Map<string, number>();
  const byColorSize = new Map<string, number>();
  let total = 0;

  for (const line of orderLines) {
    const qty = Number(line.quantity) || 0;
    if (qty <= 0) continue;
    total += qty;
    const colorKey = normalizeMatchKey(line.color);
    const sizeKey = normalizeMatchKey(line.size);
    if (colorKey) byColor.set(colorKey, (byColor.get(colorKey) || 0) + qty);
    if (sizeKey) bySize.set(sizeKey, (bySize.get(sizeKey) || 0) + qty);
    if (colorKey && sizeKey) {
      const key = `${colorKey}|${sizeKey}`;
      byColorSize.set(key, (byColorSize.get(key) || 0) + qty);
    }
  }

  return { total, byColor, bySize, byColorSize };
};

export const getMatchedOrderQty = (stats: OrderQtyStats, colorRaw: unknown, sizeRaw: unknown) => {
  const intersect = (source: Set<string> | null, allowed: Iterable<string>) => {
    if (!source) return null;
    const allowedSet = new Set<string>();
    for (const value of allowed) allowedSet.add(value);
    const next = new Set<string>();
    for (const value of source) {
      if (allowedSet.has(value)) next.add(value);
    }
    return next.size ? next : null;
  };

  let colorSet = buildOrderOptionSet(colorRaw);
  let sizeSet = buildOrderOptionSet(sizeRaw);
  colorSet = intersect(colorSet, stats.byColor.keys());
  sizeSet = intersect(sizeSet, stats.bySize.keys());

  if (!colorSet && !sizeSet) return stats.total;
  if (colorSet && !sizeSet) {
    let sum = 0;
    for (const color of colorSet) sum += stats.byColor.get(color) || 0;
    return sum;
  }
  if (!colorSet && sizeSet) {
    let sum = 0;
    for (const size of sizeSet) sum += stats.bySize.get(size) || 0;
    return sum;
  }

  let sum = 0;
  for (const color of colorSet!) {
    for (const size of sizeSet!) {
      sum += stats.byColorSize.get(`${color}|${size}`) || 0;
    }
  }
  return sum;
};

const parseUsageJson = (raw: unknown) => {
  if (!raw) return null as Record<string, number> | null;
  try {
    const source = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const clean: Record<string, number> = {};
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      const amount = Number(value);
      if (Number.isFinite(amount) && amount > 0) {
        clean[normalizeMatchKey(key)] = amount;
      }
    }
    return Object.keys(clean).length ? clean : null;
  } catch {
    return null;
  }
};

const normalizeUnit = (value: unknown) => String(value || '').trim().toLowerCase();
const isMeterUnit = (value: unknown) => {
  const unit = normalizeUnit(value);
  return unit === '米' || unit === 'm' || unit === 'meter' || unit === 'meters';
};
const isKilogramUnit = (value: unknown) => {
  const unit = normalizeUnit(value);
  return unit === 'kg' || unit === '公斤' || unit === '千克' || unit === 'kilogram' || unit === 'kilograms';
};

const buildMeterUsageMap = (record: StyleBom) => {
  const sizeUsageMap = parseUsageJson((record as Record<string, unknown>).sizeUsageMap);
  if (sizeUsageMap) return sizeUsageMap;

  const patternUsageMap = parseUsageJson((record as Record<string, unknown>).patternSizeUsageMap);
  if (!patternUsageMap) return null;

  const patternUnit = (record as Record<string, unknown>).patternUnit;
  if (isMeterUnit(patternUnit)) {
    return patternUsageMap;
  }

  const conversionRate = Number((record as Record<string, unknown>).conversionRate) || 0;
  if (isKilogramUnit(patternUnit) && conversionRate > 0) {
    const converted: Record<string, number> = {};
    for (const [key, value] of Object.entries(patternUsageMap)) {
      converted[key] = Number((value * conversionRate).toFixed(6));
    }
    return converted;
  }

  return patternUsageMap;
};

export const calcBomRequirementQty = (record: StyleBom, stats: OrderQtyStats) => {
  const loss = Number((record as Record<string, unknown>).lossRate) || 0;
  const meterUsageMap = buildMeterUsageMap(record);

  if (meterUsageMap) {
    const colorRaw = (record as Record<string, unknown>).color;
    const colorOptions = colorRaw ? buildOrderOptionSet(colorRaw) : null;
    const bomColorInOrder = colorOptions ? Array.from(colorOptions).some((color) => stats.byColor.has(color)) : false;
    let total = 0;
    for (const [sizeKey, usage] of Object.entries(meterUsageMap)) {
      let qty = 0;
      if (colorOptions && bomColorInOrder) {
        for (const color of colorOptions) qty += stats.byColorSize.get(`${color}|${sizeKey}`) || 0;
      } else {
        qty = stats.bySize.get(sizeKey) || 0;
      }
      total += usage * (1 + loss / 100) * qty;
    }
    if (total > 0 && Number.isFinite(total)) return Number(total.toFixed(4));
  }

  const matchedQty = getMatchedOrderQty(stats, (record as Record<string, unknown>).color, (record as Record<string, unknown>).size);
  const usage = Number((record as Record<string, unknown>).usageAmount) || 0;
  const required = usage * (1 + loss / 100) * matchedQty;
  if (!Number.isFinite(required)) return 0;
  return Number(required.toFixed(4));
};

export const calcBomRequirementMeters = (record: StyleBom, stats: OrderQtyStats) => {
  const requirementQty = calcBomRequirementQty(record, stats);
  if (!Number.isFinite(requirementQty) || requirementQty <= 0) return 0;

  const patternUnit = (record as Record<string, unknown>).patternUnit;
  if (isMeterUnit(patternUnit) || buildMeterUsageMap(record)) {
    return Number(requirementQty.toFixed(4));
  }

  const unit = normalizeUnit((record as Record<string, unknown>).unit || patternUnit);
  const conversionRate = Number((record as Record<string, unknown>).conversionRate) || 0;

  if (unit.includes('yard') || unit.includes('yd') || unit.includes('码')) return Number((requirementQty * 0.9144).toFixed(4));
  if (unit.includes('cm') || unit === '厘米') return Number((requirementQty / 100).toFixed(4));
  if (isKilogramUnit(unit) && conversionRate > 0) {
    return Number((requirementQty * conversionRate).toFixed(4));
  }
  return Number(requirementQty.toFixed(4));
};
