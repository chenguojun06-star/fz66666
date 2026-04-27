import dayjs, { Dayjs } from 'dayjs';
import type { TimeRangeType, EChartData } from './dashboardTypes';

export const getCompareLabel = (range: TimeRangeType) => {
  if (range === 'day') return '较昨日';
  if (range === 'week') return '较上周';
  if (range === 'month') return '较上月';
  if (range === 'year') return '较去年';
  return '较上期';
};

export const getDateRanges = (timeRange: TimeRangeType, customRange: [Dayjs | null, Dayjs | null] | null) => {
  const now = dayjs();
  let currentStart: Dayjs;
  let currentEnd: Dayjs = now;
  let prevStart: Dayjs;
  let prevEnd: Dayjs;

  switch (timeRange) {
    case 'day':
      currentStart = now.startOf('day');
      currentEnd = now.endOf('day');
      prevStart = now.subtract(1, 'day').startOf('day');
      prevEnd = now.subtract(1, 'day').endOf('day');
      break;
    case 'week':
      currentStart = now.startOf('week');
      currentEnd = now.endOf('week');
      prevStart = now.subtract(1, 'week').startOf('week');
      prevEnd = now.subtract(1, 'week').endOf('week');
      break;
    case 'month':
      currentStart = now.startOf('month');
      currentEnd = now.endOf('month');
      prevStart = now.subtract(1, 'month').startOf('month');
      prevEnd = now.subtract(1, 'month').endOf('month');
      break;
    case 'year':
      currentStart = now.startOf('year');
      currentEnd = now.endOf('year');
      prevStart = now.subtract(1, 'year').startOf('year');
      prevEnd = now.subtract(1, 'year').endOf('year');
      break;
    case 'custom':
      if (customRange && customRange[0] && customRange[1]) {
        currentStart = customRange[0].startOf('day');
        currentEnd = customRange[1].endOf('day');
        const diffDays = currentEnd.diff(currentStart, 'day') + 1;
        prevStart = currentStart.subtract(diffDays, 'day');
        prevEnd = currentStart.subtract(1, 'day').endOf('day');
      } else {
        currentStart = now.startOf('month');
        currentEnd = now.endOf('month');
        prevStart = now.subtract(1, 'month').startOf('month');
        prevEnd = now.subtract(1, 'month').endOf('month');
      }
      break;
    default:
      currentStart = now.startOf('month');
      currentEnd = now.endOf('month');
      prevStart = now.subtract(1, 'month').startOf('month');
      prevEnd = now.subtract(1, 'month').endOf('month');
  }

  return {
    currentStart: currentStart.format('YYYY-MM-DD'),
    currentEnd: currentEnd.format('YYYY-MM-DD'),
    prevStart: prevStart.format('YYYY-MM-DD'),
    prevEnd: prevEnd.format('YYYY-MM-DD'),
  };
};

export const calcChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
};

export const generateTrendData = (
  rows: any[], timeRange: TimeRangeType,
  currentStart: string, currentEnd: string,
): EChartData => {
  const start = dayjs(currentStart);
  const end = dayjs(currentEnd);
  const dates: string[] = [];
  const amounts: number[] = [];
  const inboundQuantities: number[] = [];
  const orderCounts: number[] = [];
  const defectQuantities: number[] = [];

  if (timeRange === 'day') {
    for (let h = 0; h < 24; h++) {
      const label = `${String(h).padStart(2, '0')}:00`;
      dates.push(label);
      const hourRows = rows.filter(r => dayjs(r.settlementDate || r.createTime).hour() === h);
      amounts.push(hourRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0));
      inboundQuantities.push(hourRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0));
      orderCounts.push(hourRows.length);
      defectQuantities.push(hourRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0));
    }
  } else if (timeRange === 'week' || timeRange === 'custom') {
    let cur = start;
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      const label = cur.format('MM-DD');
      dates.push(label);
      const dayRows = rows.filter(r => dayjs(r.settlementDate || r.createTime).isSame(cur, 'day'));
      amounts.push(dayRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0));
      inboundQuantities.push(dayRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0));
      orderCounts.push(dayRows.length);
      defectQuantities.push(dayRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0));
      cur = cur.add(1, 'day');
    }
  } else if (timeRange === 'month') {
    let cur = start.startOf('week');
    while (cur.isBefore(end) || cur.isSame(end, 'day')) {
      const weekEnd = cur.endOf('week');
      const label = `${cur.format('MM/DD')}-${weekEnd.format('MM/DD')}`;
      dates.push(label);
      const weekRows = rows.filter(r => { const d = dayjs(r.settlementDate || r.createTime); return (d.isAfter(cur) || d.isSame(cur, 'day')) && (d.isBefore(weekEnd) || d.isSame(weekEnd, 'day')); });
      amounts.push(weekRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0));
      inboundQuantities.push(weekRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0));
      orderCounts.push(weekRows.length);
      defectQuantities.push(weekRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0));
      cur = cur.add(1, 'week');
    }
  } else {
    let cur = start;
    while (cur.isBefore(end) || cur.isSame(end, 'month')) {
      const label = cur.format('YYYY-MM');
      dates.push(label);
      const monthRows = rows.filter(r => dayjs(r.settlementDate || r.createTime).isSame(cur, 'month'));
      amounts.push(monthRows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0));
      inboundQuantities.push(monthRows.reduce((s, r) => s + (Number(r.inboundQuantity) || 0), 0));
      orderCounts.push(monthRows.length);
      defectQuantities.push(monthRows.reduce((s, r) => s + (Number(r.defectQuantity) || 0), 0));
      cur = cur.add(1, 'month');
    }
  }

  return { dates, amounts, inboundQuantities, orderCounts, defectQuantities };
};
