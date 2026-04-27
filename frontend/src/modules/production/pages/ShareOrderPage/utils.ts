import type { StageStatus } from './types';

export const getRiskTone = (riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH') => {
  if (riskLevel === 'HIGH') return { label: '高风险预警', color: '#ef4444', softColor: 'rgba(239,68,68,0.12)' };
  if (riskLevel === 'MEDIUM') return { label: '中风险关注', color: '#f59e0b', softColor: 'rgba(245,158,11,0.12)' };
  return { label: '低风险可控', color: '#10b981', softColor: 'rgba(16,185,129,0.12)' };
};

export const getStageTone = (status: StageStatus) => {
  if (status === 'DONE') return { color: '#10b981', tagColor: 'success', label: '已完成', helper: '该节点已完成' as const, shadow: 'rgba(16,185,129,0.16)' };
  if (status === 'ACTIVE') return { color: '#3b82f6', tagColor: 'processing', label: '进行中', helper: '该节点正在推进' as const, shadow: 'rgba(59,130,246,0.16)' };
  return { color: '#94a3b8', tagColor: 'default', label: '待开始', helper: '该节点尚未开始' as const, shadow: 'rgba(148,163,184,0.12)' };
};

export const isCurrentStage = (stageName: string, currentStage?: string, latestStage?: string) => {
  const current = String(currentStage || latestStage || '').trim();
  return !!current && (current.includes(stageName) || stageName.includes(current));
};

export const formatDate = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('zh-CN');
  } catch { return String(value); }
};

export const formatDateTime = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return String(value); }
};

export const formatRemainingDays = (days?: number) => {
  if (days == null) return '待确认';
  if (days <= 0) return '临近完成';
  return `约 ${days} 天`;
};

export const describeDelivery = (plannedEndDate?: string, predictedFinishDate?: string) => {
  if (!plannedEndDate && !predictedFinishDate) return '系统正在持续跟踪交付节奏';
  if (plannedEndDate && predictedFinishDate) {
    const planned = new Date(plannedEndDate);
    const predicted = new Date(predictedFinishDate);
    if (!Number.isNaN(planned.getTime()) && !Number.isNaN(predicted.getTime())) {
      const diffDays = Math.round((predicted.getTime() - planned.getTime()) / 86400000);
      if (diffDays > 0) return `预计较计划晚 ${diffDays} 天完成`;
      if (diffDays < 0) return `预计可比计划提前 ${Math.abs(diffDays)} 天完成`;
      return '预计可按计划完成';
    }
  }
  return '系统正在持续跟踪交付节奏';
};

export const getDisplayColorSizeQuantities = (
  rawColor?: string, rawSize?: string, rawQuantity?: number,
  colorSizeQuantities?: Array<{ color?: string; size?: string; quantity?: number }>,
) => {
  const normalized = Array.isArray(colorSizeQuantities)
    ? colorSizeQuantities.map((item) => ({
        color: String(item?.color || '').trim(),
        size: String(item?.size || '').trim().toUpperCase(),
        quantity: Number(item?.quantity ?? 0),
      })).filter((item) => item.color && item.size && item.quantity > 0)
    : [];
  if (normalized.length > 0) return normalized;
  const fallbackColor = String(rawColor || '').trim();
  const fallbackSizes = String(rawSize || '').split(/[,\s，/]+/).map((item) => item.trim().toUpperCase()).filter(Boolean);
  const fallbackQuantity = Number(rawQuantity || 0);
  if (fallbackColor && fallbackSizes.length === 1 && fallbackQuantity > 0) {
    return [{ color: fallbackColor, size: fallbackSizes[0], quantity: fallbackQuantity }];
  }
  return [];
};
