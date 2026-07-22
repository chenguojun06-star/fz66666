import type { TrendPoint, BriefData } from './types';
import { STORAGE_KEY } from './constants';

export const todayStr = () => new Date().toLocaleDateString('zh-CN');
export const hasShownToday = () => localStorage.getItem(STORAGE_KEY) === todayStr();
export const markShownToday = () => localStorage.setItem(STORAGE_KEY, todayStr());

export const isInPopupWindow = () => {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= 9 * 60 + 30 && mins <= 11 * 60;
};

export function buildTrendOption(trend: TrendPoint[]) {
  const dates = trend.map(t => t.date);
  const scans = trend.map(t => Number(t.scanCount) || 0);
  const wh = trend.map(t => Number(t.warehousingCount) || 0);
  const orders = trend.map(t => Number(t.orderCount) || 0);

  return {
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(255,255,255,0.96)',
      borderColor: 'var(--color-border)',
      textStyle: { fontSize: 14, color: 'var(--color-text-primary)' },
    },
    legend: {
      data: ['扫码次数', '入库单数', '下单数'],
      bottom: 0, textStyle: { fontSize: 14 }, itemWidth: 16, itemHeight: 8,
    },
    grid: { left: 36, right: 16, top: 10, bottom: 32, containLabel: false },
    xAxis: {
      type: 'category' as const, data: dates, boundaryGap: false,
      axisLine: { lineStyle: { color: '#e8e8e8' } },
      axisLabel: { fontSize: 14, color: 'var(--color-text-tertiary)' },
    },
    yAxis: {
      type: 'value' as const, splitLine: { lineStyle: { color: 'var(--color-bg-subtle)' } },
      axisLabel: { fontSize: 14, color: 'var(--color-text-tertiary)' },
    },
    series: [
      {
        name: '扫码次数', type: 'line', data: scans, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: 'var(--color-primary)' },
        itemStyle: { color: 'var(--color-primary)' },
        areaStyle: { color: 'rgba(22,119,255,0.08)' },
      },
      {
        name: '入库单数', type: 'line', data: wh, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: 'var(--color-success)' },
        itemStyle: { color: 'var(--color-success)' },
        areaStyle: { color: 'rgba(82,196,26,0.08)' },
      },
      {
        name: '下单数', type: 'line', data: orders, smooth: true,
        symbol: 'circle', symbolSize: 5,
        lineStyle: { width: 2, color: 'var(--color-warning)' },
        itemStyle: { color: 'var(--color-warning)' },
        areaStyle: { color: 'rgba(250,140,22,0.08)' },
      },
    ],
  };
}

export function getHealthLevel(brief: BriefData): { label: string; color: string; tagColor: string } {
  const overdue = Number(brief.overdueOrderCount) || 0;
  const risk = Number(brief.highRiskOrderCount) || 0;
  if (overdue > 3 || risk > 5) return { label: '需紧急处理', color: 'var(--color-danger)', tagColor: 'error' };
  if (overdue > 0 || risk > 2) return { label: '有待办需关注', color: 'var(--color-warning)', tagColor: 'warning' };
  if (risk > 0) return { label: '整体可控', color: 'var(--color-primary)', tagColor: 'processing' };
  return { label: '运行良好', color: 'var(--color-success)', tagColor: 'success' };
}
