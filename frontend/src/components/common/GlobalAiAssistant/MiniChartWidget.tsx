/**
 * MiniChartWidget — 小云 AI 对话内嵌迷你图表组件
 * 独立文件，不污染 GlobalAiAssistant/index.tsx
 * 支持 11 种图表类型：bar / line / cylinder / comparison / waterfall / pie / ring / gauge / radar / funnel / progress
 */
import React, { Suspense, lazy } from 'react';
import styles from './MiniChartWidget.module.css';

const ReactEChartsLazy = lazy(() => import('echarts-for-react'));

// ── 类型定义（导出供 index.tsx parseAiResponse 使用）─────────────────────────
export interface ChartSpec {
  type: 'bar' | 'line' | 'pie' | 'ring' | 'progress' | 'gauge' | 'radar' | 'funnel' | 'comparison' | 'cylinder' | 'waterfall';
  title: string;
  subtitle?: string;           // 副标题，显示在标题右侧
  xAxis?: string[];
  series?: Array<{ name: string; data?: number[]; value?: number }>;
  value?: number;              // gauge/progress 的当前值
  colors?: string[];
  unit?: string;               // 数值单位，如 "件" "万元" "%"
  target?: number;             // 目标线（bar/line/cylinder/gauge）
  highlight?: string;          // ring 图中心大字显示值
  indicators?: Array<{ name: string; max: number }>; // radar 图维度定义
}

const CHART_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#e8686a', '#722ed1', '#13c2c2', '#eb2f96'];

const MiniChartWidget: React.FC<{ chart: ChartSpec }> = ({ chart }) => {
  // ── progress：纯 CSS，无 ECharts，最轻量 ───────────────────────────────
  if (chart.type === 'progress') {
    const pct = Math.min(chart.value ?? 0, 100);
    const pctColor = pct >= 80 ? '#52c41a' : pct >= 60 ? '#faad14' : '#ff7875';
    return (
      <div className={styles.miniProgressChart}>
        <div className={styles.miniChartTitle}>
          {chart.title}
          {chart.subtitle && <span className={styles.miniChartSubtitle}> · {chart.subtitle}</span>}
        </div>
        <div className={styles.progressBarWrap}>
          <div className={styles.progressBarFill} style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${pctColor}, ${pctColor}99)` }} />
        </div>
        <div className={styles.progressLabel} style={{ color: pctColor }}>{pct}{chart.unit ?? '%'}</div>
      </div>
    );
  }

  // ── 所有 ECharts 图表类型 ───────────────────────────────────────────────
  const colors = chart.colors ?? CHART_COLORS;
  let option: Record<string, unknown>;
  let chartHeight = '140px';

  if (chart.type === 'gauge') {
    // 仪表盘 — 单 KPI 直观展示，支持 target 作为 max
    chartHeight = '160px';
    const val = chart.value ?? 0;
    const maxVal = chart.target ?? 100;
    const pctOfMax = maxVal > 0 ? val / maxVal : 0;
    const gaugeColor = pctOfMax >= 0.8 ? '#52c41a' : pctOfMax >= 0.6 ? '#faad14' : '#ff7875';
    option = {
      series: [{
        type: 'gauge',
        radius: '82%',
        startAngle: 210,
        endAngle: -30,
        min: 0,
        max: maxVal,
        progress: { show: true, width: 10, itemStyle: { color: gaugeColor } },
        axisLine: { lineStyle: { width: 10, color: [[1, '#f0f0f0']] } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { fontSize: 9, distance: 14 },
        pointer: { length: '58%', width: 4, itemStyle: { color: gaugeColor } },
        detail: {
          valueAnimation: true,
          formatter: `{value}${chart.unit ?? ''}`,
          fontSize: 20,
          fontWeight: 'bold',
          color: gaugeColor,
          offsetCenter: [0, '28%'],
        },
        title: { fontSize: 11, color: '#8c8c8c', offsetCenter: [0, '48%'] },
        data: [{ value: val, name: chart.subtitle ?? '' }],
      }],
    };

  } else if (chart.type === 'ring') {
    // 环形图 — 中心显示 highlight 关键值，适合占比数据
    const ringData = (chart.series ?? []).map(s => ({
      name: s.name,
      value: s.value ?? (s.data?.[0] ?? 0),
    }));
    option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', right: 4, top: 'middle', textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['38%', '50%'],
        avoidLabelOverlap: false,
        label: chart.highlight ? {
          show: true,
          position: 'center',
          formatter: () => `{val|${chart.highlight}}\n{subval|${chart.unit ?? ''}}`,
          rich: {
            val: { fontSize: 18, fontWeight: 'bold', color: '#262626', lineHeight: 24 },
            subval: { fontSize: 11, color: '#8c8c8c', lineHeight: 18 },
          },
        } : { show: false },
        data: ringData,
        color: colors,
      }],
    };

  } else if (chart.type === 'pie') {
    // 普通饼图
    const pieData = (chart.series ?? []).map(s => ({
      name: s.name,
      value: s.value ?? (s.data?.[0] ?? 0),
    }));
    option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { orient: 'vertical', right: 4, top: 'middle', textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 },
      series: [{
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['38%', '50%'],
        label: { show: false },
        data: pieData,
        color: colors,
      }],
    };

  } else if (chart.type === 'radar') {
    // 雷达图 — 多维度对比，适合工厂/工人能力评估
    chartHeight = '160px';
    const indicators = chart.indicators ?? (chart.xAxis ?? []).map(name => ({ name, max: 100 }));
    option = {
      tooltip: { trigger: 'item' },
      legend: (chart.series ?? []).length > 1
        ? { top: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10, data: (chart.series ?? []).map(s => s.name) }
        : undefined,
      radar: {
        indicator: indicators,
        radius: '55%',
        center: ['50%', (chart.series ?? []).length > 1 ? '58%' : '52%'],
        splitArea: { areaStyle: { color: ['#fff', '#f5f7ff'] } },
        axisName: { fontSize: 10, color: '#595959' },
      },
      series: [{
        type: 'radar',
        data: (chart.series ?? []).map((s, si) => ({
          name: s.name,
          value: s.data ?? [],
          areaStyle: { opacity: 0.18 },
          lineStyle: { width: 2 },
          symbolSize: 4,
          itemStyle: { color: colors[si % colors.length] },
        })),
      }],
    };

  } else if (chart.type === 'funnel') {
    // 漏斗图 — 订单各阶段转化流程
    chartHeight = '160px';
    const funnelData = (chart.xAxis ?? []).map((name, i) => ({
      name,
      value: chart.series?.[0]?.data?.[i] ?? 0,
    })).sort((a, b) => b.value - a.value);
    option = {
      tooltip: { trigger: 'item', formatter: '{b}: {c}' },
      series: [{
        type: 'funnel',
        left: '8%',
        width: '84%',
        gap: 3,
        label: { show: true, position: 'inside', fontSize: 11, formatter: `{b}: {c}${chart.unit ?? ''}` },
        itemStyle: { borderWidth: 0 },
        data: funnelData,
        color: colors,
      }],
    };

  } else if (chart.type === 'comparison') {
    // 横向对比条形图 — 多工厂/多周期并排对比
    const hasMultiSeries = (chart.series ?? []).length > 1;
    option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: hasMultiSeries
        ? { top: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10, data: (chart.series ?? []).map(s => s.name) }
        : undefined,
      grid: { top: hasMultiSeries ? 36 : 12, right: 60, bottom: 20, left: 80 },
      xAxis: { type: 'value', axisLabel: { fontSize: 10 }, splitLine: { lineStyle: { type: 'dashed' as const } } },
      yAxis: { type: 'category', data: chart.xAxis, axisLabel: { fontSize: 10, width: 72, overflow: 'truncate' as const } },
      series: (chart.series ?? []).map((s, si) => ({
        name: s.name,
        type: 'bar',
        data: s.data,
        barMaxWidth: 16,
        label: { show: true, position: 'right', fontSize: 10, formatter: `{c}${chart.unit ?? ''}` },
        itemStyle: { color: colors[si % colors.length], borderRadius: [0, 4, 4, 0] },
      })),
    };

  } else if (chart.type === 'cylinder') {
    // 圆柱效果 — 渐变+圆角顶部，视觉现代感强，支持目标线
    option = {
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      grid: { top: 28, right: 10, bottom: 28, left: 40 },
      xAxis: { type: 'category', data: chart.xAxis, axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10, formatter: `{value}${chart.unit ?? ''}` },
        splitLine: { lineStyle: { type: 'dashed' as const } },
      },
      series: [
        ...(chart.series ?? []).map((s, si) => ({
          name: s.name,
          type: 'bar',
          barMaxWidth: 28,
          data: s.data?.map((v, vi) => {
            const c = (chart.series?.length ?? 1) === 1 ? colors[vi % colors.length] : colors[si % colors.length];
            return {
              value: v,
              itemStyle: {
                borderRadius: [6, 6, 0, 0],
                color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: c }, { offset: 1, color: `${c}55` }] },
              },
            };
          }),
          label: (chart.series?.length ?? 1) === 1
            ? { show: true, position: 'top', fontSize: 10, formatter: `{c}${chart.unit ?? ''}` }
            : undefined,
        })),
        ...(chart.target !== undefined ? [{
          type: 'line', name: '目标线',
          data: new Array((chart.xAxis ?? []).length).fill(chart.target),
          lineStyle: { type: 'dashed' as const, color: '#ff7875', width: 1.5 },
          symbol: 'none', label: { show: false },
        }] : []),
      ],
    };

  } else if (chart.type === 'waterfall') {
    // 瀑布图 — 成本/利润结构拆分，正负分色
    const rawData = chart.series?.[0]?.data ?? [];
    const xData = chart.xAxis ?? [];
    const placeholders: number[] = [];
    const positives: number[] = [];
    const negatives: number[] = [];
    let cum = 0;
    for (const v of rawData) {
      if (v >= 0) {
        placeholders.push(cum); positives.push(v); negatives.push(0); cum += v;
      } else {
        cum += v; placeholders.push(cum); positives.push(0); negatives.push(-v);
      }
    }
    option = {
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'shadow' },
        formatter: (p: unknown) => {
          const arr = p as Array<{ seriesName?: string; name?: string; value?: number }>;
          const main = arr.find(x => x.seriesName !== '辅助' && (x.value ?? 0) > 0);
          return main ? `${main.name ?? ''}: ${main.value ?? ''}${chart.unit ?? ''}` : '';
        },
      },
      grid: { top: 28, right: 10, bottom: 28, left: 46 },
      xAxis: { type: 'category', data: xData, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: `{value}${chart.unit ?? ''}` }, splitLine: { lineStyle: { type: 'dashed' as const } } },
      series: [
        { type: 'bar', name: '辅助', stack: 'total', itemStyle: { color: 'transparent', borderColor: 'transparent' }, data: placeholders },
        { type: 'bar', name: '增加', stack: 'total', itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] }, data: positives, label: { show: true, position: 'top', fontSize: 9, formatter: `{c}${chart.unit ?? ''}` } },
        { type: 'bar', name: '减少', stack: 'total', itemStyle: { color: '#ff7875', borderRadius: [4, 4, 0, 0] }, data: negatives, label: { show: true, position: 'top', fontSize: 9, formatter: `{c}${chart.unit ?? ''}` } },
      ],
    };

  } else {
    // bar / line — 默认，支持多系列 + 目标线
    const hasLegend = (chart.series ?? []).length > 1;
    option = {
      tooltip: { trigger: 'axis' },
      legend: hasLegend ? { top: 0, textStyle: { fontSize: 10 }, itemWidth: 10, itemHeight: 10 } : undefined,
      grid: { top: hasLegend ? 32 : 20, right: 10, bottom: 28, left: 40 },
      xAxis: { type: 'category', data: chart.xAxis, axisLabel: { fontSize: 10 } },
      yAxis: {
        type: 'value',
        axisLabel: { fontSize: 10, formatter: `{value}${chart.unit ?? ''}` },
        splitLine: { lineStyle: { type: 'dashed' as const } },
      },
      color: colors,
      series: [
        ...(chart.series ?? []).map(s => ({
          name: s.name,
          type: chart.type === 'line' ? 'line' : 'bar',
          data: s.data,
          smooth: chart.type === 'line',
          barMaxWidth: 28,
          itemStyle: chart.type === 'bar' ? { borderRadius: [3, 3, 0, 0] } : undefined,
          areaStyle: chart.type === 'line' ? { opacity: 0.08 } : undefined,
        })),
        ...(chart.target !== undefined ? [{
          type: 'line', name: '目标线',
          data: new Array((chart.xAxis ?? []).length).fill(chart.target),
          lineStyle: { type: 'dashed' as const, color: '#ff7875', width: 1.5 },
          symbol: 'none', label: { show: false },
        }] : []),
      ],
    };
  }

  return (
    <div className={styles.miniEChart}>
      <div className={styles.miniChartTitle}>
        {chart.title}
        {chart.subtitle && <span className={styles.miniChartSubtitle}> · {chart.subtitle}</span>}
      </div>
      <Suspense fallback={<div className={styles.chartLoading}>图表加载中…</div>}>
        <ReactEChartsLazy option={option} style={{ height: chartHeight }} opts={{ renderer: 'svg' }} />
      </Suspense>
    </div>
  );
};

export default MiniChartWidget;
