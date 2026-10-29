import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Drawer, Empty, Tag, Table, Tooltip, Button, Alert, Progress } from 'antd';
import { BrandLoading } from '@/components/common/loading';
import { ReloadOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type {
  PreOrderDeliveryPredictionResponse,
  PreOrderTimelineNode,
  CapacityGapResponse,
  FactoryCapacityGap,
  FactoryActiveOrderDTO,
  FactoryDailyOutputResponse,
} from '@/services/intelligence/intelligenceTypes';

// 项目惯例：ECharts 懒加载 + SVG 渲染（同 ScanCountChart），不拖首屏
const ReactECharts = lazy(() => import('echarts-for-react'));

interface FactoryInsightDrawerProps {
  open: boolean;
  onClose: () => void;
  factoryName: string;
  orderQuantity: number;
  plannedDeadline?: string;
  styleNo?: string;
  /**
   * 工厂产能卡片数据（可选）。
   * 传入后抽屉顶部会显示「推荐指数 / 历史评级」，与列表卡片口径一致；
   * 不传也能正常工作（老调用点无需改动）。
   */
  stat?: FactoryCapacityItem;
}

const RISK_COLOR: Record<string, string> = {
  safe: 'var(--color-success)',
  warning: 'var(--color-warning)',
  danger: 'var(--color-danger)',
};

const GAP_LEVEL_META: Record<string, { color: string; label: string }> = {
  safe: { color: 'var(--color-success)', label: '产能充足' },
  tight: { color: 'var(--color-warning)', label: '产能紧张' },
  gap: { color: 'var(--color-danger)', label: '产能缺口' },
  critical: { color: 'var(--color-danger)', label: '严重缺口' },
};

/** ECharts 不解析 CSS 变量，统一用具体色值（与 ScanCountChart 同色系） */
const C = {
  bar: '#3b82f6',
  barWeak: '#93c5fd',
  zeroBand: 'rgba(156,163,175,0.075)',
  avgLine: '#9ca3af',
  peak: '#ef4444',
  low: '#10b981',
  axis: '#e5e7eb',
  split: '#f0f0f0',
  label: '#9ca3af',
  text: '#6b7280',
};

/** 千分位 + 最多一位小数 */
const fmt = (v: number | null | undefined, digits = 0): string => {
  if (v == null || Number.isNaN(v)) return '-';
  return digits > 0 ? v.toFixed(digits) : Math.round(v).toLocaleString();
};

/** 完成率 → 颜色（<50 红 / 50-80 黄 / ≥80 绿）—— 供 DOM/antd 组件用（支持 CSS 变量） */
const progressColor = (v: number) =>
  v >= 80 ? 'var(--color-success)' : v >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';

/**
 * 完成率 → 具体色值 —— 供 ECharts 用。
 * ECharts 的 itemStyle 走 SVG 属性，**不解析 CSS 变量**，
 * 直接传 'var(--color-success)' 会画成黑色（或透明），必须给 hex。
 */
const progressHex = (v: number) => (v >= 80 ? '#10b981' : v >= 50 ? '#f59e0b' : '#ef4444');

/** 区块标题（左侧 3px 主色竖条，统一视觉节奏） */
const SectionTitle: React.FC<{ children: React.ReactNode; extra?: React.ReactNode }> = ({
  children,
  extra,
}) => (
  <div className="u-d-flex u-ai-center u-jc-between" style={{ marginBottom: 8 }}>
    <div className="u-d-flex u-ai-center u-gap-6">
      <span
        style={{
          width: 3,
          height: 13,
          borderRadius: 2,
          background: 'var(--primary-color, var(--color-primary))',
          display: 'inline-block',
        }}
      />
      <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>
        {children}
      </span>
    </div>
    {extra ? <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{extra}</div> : null}
  </div>
);

/** 指标卡（顶部 KPI 条用） */
const Kpi: React.FC<{
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  color?: string;
}> = ({ label, value, hint, color }) => (
  <div
    style={{
      padding: '8px 10px',
      borderRadius: 6,
      background: 'var(--color-bg-layout, var(--color-bg-subtle))',
      border: '1px solid var(--color-border)',
      minWidth: 0,
    }}
  >
    <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
      {label}
    </div>
    <div
      className="u-fs-16 u-fw-600"
      style={{
        color: color || 'var(--color-text-primary)',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {value}
    </div>
    {hint ? (
      <div
        className="u-fs-12"
        style={{
          color: 'var(--color-text-quaternary, var(--color-text-tertiary))',
          marginTop: 2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {hint}
      </div>
    ) : null}
  </div>
);

const FactoryInsightDrawer: React.FC<FactoryInsightDrawerProps> = ({
  open,
  onClose,
  factoryName,
  orderQuantity,
  plannedDeadline,
  styleNo,
  stat,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<PreOrderDeliveryPredictionResponse | null>(null);
  const [gapList, setGapList] = useState<FactoryCapacityGap | null>(null);
  const [activeOrders, setActiveOrders] = useState<FactoryActiveOrderDTO[]>([]);
  const [daily, setDaily] = useState<FactoryDailyOutputResponse | null>(null);

  // 用 ref 保存最新参数，避免 loadAll 依赖闭包过期 + 防抖控制
  const paramsRef = useRef({ factoryName, orderQuantity, styleNo, plannedDeadline });
  paramsRef.current = { factoryName, orderQuantity, styleNo, plannedDeadline };

  const loadAll = useCallback(async () => {
    const { factoryName: fn, orderQuantity: qty, styleNo: sn, plannedDeadline: dl } = paramsRef.current;
    if (!fn) return;
    setLoading(true);
    setError(null);
    try {
      const [predRes, gapRes, ordersRes, dailyRes] = await Promise.all([
        intelligenceApi.predictPreOrderDelivery({
          factoryName: fn,
          orderQuantity: qty,
          styleNo: sn,
          plannedDeadline: dl,
        }),
        intelligenceApi.getCapacityGap(),
        intelligenceApi.getFactoryActiveOrders(fn),
        // 走势图单独兜底：它挂了不影响预测/缺口/订单三块（原来会让整抽屉报错）
        intelligenceApi.getFactoryDailyOutput(fn, 14).catch(() => null),
      ]);
      setPrediction(predRes ?? null);
      const gapResp: CapacityGapResponse | undefined = gapRes;
      setGapList(gapResp?.factories.find((f) => f.factoryName === fn) ?? null);
      setActiveOrders(ordersRes ?? []);
      setDaily(dailyRes ?? null);
    } catch (e: any) {
      console.error('[FactoryInsightDrawer] load failed', e);
      setError(e?.message || '加载工厂动态失败，请重试');
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载策略：
  // 1. open 从 false→true：立即加载
  // 2. factoryName 变化：立即加载
  // 3. orderQuantity/plannedDeadline 变化：防抖 600ms 重新加载（避免连续修改雪崩）
  const prevOpenRef = useRef(false);
  const prevFactoryRef = useRef(factoryName);
  const debounceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const openedNow = open && !prevOpenRef.current;
    const factoryChanged = open && prevFactoryRef.current !== factoryName;
    prevOpenRef.current = open;
    prevFactoryRef.current = factoryName;

    if (!open) return;
    if (!factoryName) return;

    if (openedNow || factoryChanged) {
      // 立即加载
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void loadAll();
      return;
    }

    // 参数变化防抖
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void loadAll();
    }, 600);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [open, factoryName, orderQuantity, plannedDeadline, loadAll]);

  const renderTimeline = (nodes: PreOrderTimelineNode[]) => {
    if (!nodes || nodes.length === 0) return <Empty description="无时间线数据" />;
    const sorted = [...nodes].sort((a, b) => a.daysFromToday - b.daysFromToday);
    return (
      <div className="u-pos-relative" style={{ padding: '18px 4px 4px' }}>
        <div className="u-pos-relative" style={{ height: 56 }}>
          <div
            className="u-pos-absolute"
            style={{ top: 9, left: 8, right: 8, height: 2, background: 'var(--color-border, var(--color-border-light))' }}
          />
          <div className="u-d-flex u-jc-between u-pos-relative">
            {sorted.map((n) => {
              const color = RISK_COLOR[n.riskLevel] || 'var(--color-text-secondary)';
              return (
                <Tooltip key={n.type} title={`${n.label}: ${n.date}（${n.daysFromToday >= 0 ? '+' : ''}${n.daysFromToday}天）`}>
                  <div className="u-d-flex u-fd-column u-ai-center u-flex-1" style={{ minWidth: 0 }}>
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: color,
                        border: '2px solid var(--color-bg-container, var(--color-bg-base))',
                        boxShadow: `0 0 0 2px ${color}33`,
                      }}
                    />
                    <div className="u-mt-6 u-fs-11 u-ta-center" style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                      {n.label}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color }}>
                      {n.daysFromToday >= 0 ? `+${n.daysFromToday}天` : `${n.daysFromToday}天`}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── 派生指标（全部来自已加载数据，不额外请求）──────────────────────────
  const m = useMemo(() => {
    const orders = activeOrders || [];
    const totalQty = orders.reduce((s, o) => s + (o.orderQuantity ?? 0), 0);
    const doneQty = orders.reduce((s, o) => {
      if (o.completedQuantity != null) return s + o.completedQuantity;
      return s + Math.round(((o.orderQuantity ?? 0) * (o.productionProgress ?? 0)) / 100);
    }, 0);
    const progress = totalQty > 0 ? Math.round((doneQty / totalQty) * 1000) / 10 : 0;

    const overdueList = orders.filter((o) => !o.completedPendingClosure && (o.daysToDeadline ?? 0) < 0);
    const maxOverdue = overdueList.reduce((mx, o) => Math.max(mx, -(o.daysToDeadline ?? 0)), 0);
    // 已完成待关单：生产做完、只等关单。单独统计，避免和"真逾期"混在一起 alarms
    const pendingClosureList = orders.filter((o) => o.completedPendingClosure);
    const pendingClosureOverdueList = pendingClosureList.filter((o) => (o.daysToDeadline ?? 0) < 0);
    const maxPendingClosureOverdue = pendingClosureOverdueList.reduce((mx, o) => Math.max(mx, -(o.daysToDeadline ?? 0)), 0);

    // 日均产能：优先用走势图同口径（近14个完整日），再退预测值 / 缺口分析值
    const velocity =
      (daily?.avgPerActiveDay && daily.avgPerActiveDay > 0 ? daily.avgPerActiveDay : 0) ||
      prediction?.factoryDailyVelocity ||
      gapList?.dailyCapacity ||
      0;
    const activeDays = daily?.activeDays ?? prediction?.velocityActiveDays ?? 0;
    const pending = prediction?.factoryPendingQuantity ?? gapList?.pendingQuantity ?? 0;
    const daysToClear = velocity > 0 && pending > 0 ? Math.round((pending / velocity) * 10) / 10 : null;

    return {
      orderCount: orders.length,
      totalQty,
      progress,
      overdueCount: overdueList.length,
      maxOverdue,
      pendingClosureCount: pendingClosureList.length,
      pendingClosureOverdueCount: pendingClosureOverdueList.length,
      maxPendingClosureOverdue,
      velocity,
      activeDays,
      pending,
      daysToClear,
    };
  }, [activeOrders, prediction, gapList, daily]);

  // ── 一句话结论（先给判断，再给证据）─────────────────────────────────
  const conclusion = useMemo(() => {
    if (!m.orderCount && !m.pending) return null;
    const parts: string[] = [];
    parts.push(`在产 ${m.orderCount} 单 / ${fmt(m.totalQty)} 件（整体完成 ${m.progress}%）`);
    if (m.overdueCount > 0) {
      parts.push(`${m.overdueCount} 单已逾期（最久 ${m.maxOverdue} 天）`);
    } else {
      parts.push('暂无逾期');
    }
    if (m.pendingClosureCount > 0) {
      const overdueHint =
        m.pendingClosureOverdueCount > 0
          ? `（其中 ${m.pendingClosureOverdueCount} 单已逾期 ${m.maxPendingClosureOverdue} 天，但生产已完成，仅待关单）`
          : '';
      parts.push(`${m.pendingClosureCount} 单已完成待关单${overdueHint}`);
    }
    if (m.daysToClear != null) {
      parts.push(`按近14天日均 ${fmt(m.velocity, 1)} 件/天 估算，清完在手 ${fmt(m.pending)} 件需 ${m.daysToClear} 天`);
    } else if (m.velocity <= 0) {
      parts.push('近14天无扫码记录，无法估算产能');
    }

    let advice = '暂无需要干预的风险';
    let level: 'danger' | 'warning' | 'success' = 'success';
    if (m.overdueCount > 0) {
      level = 'danger';
      advice = `建议优先催 ${m.overdueCount} 单逾期订单${m.overdueCount >= 2 ? '，必要时转单' : ''}`;
    } else if (m.pendingClosureOverdueCount > 0) {
      level = 'warning';
      advice = `${m.pendingClosureOverdueCount} 单已完成生产并入库但逾期 ${m.maxPendingClosureOverdue} 天未关单，请尽快确认关单`;
    } else if (gapList && (gapList.gapLevel === 'gap' || gapList.gapLevel === 'critical')) {
      level = 'danger';
      advice = '产能缺口，建议协调加班或转单';
    } else if (m.velocity <= 0) {
      level = 'warning';
      advice = '该厂近14天无生产记录，下单前请先确认产能';
    } else if (gapList?.gapLevel === 'tight') {
      level = 'warning';
      advice = '产能偏紧，建议提前排产';
    } else if (daily && daily.zeroStreak >= 3) {
      level = 'warning';
      advice = `已连续 ${daily.zeroStreak} 天无生产记录，建议确认是否停摆`;
    }

    const bg =
      level === 'danger'
        ? 'var(--status-error-bg)'
        : level === 'warning'
        ? 'var(--status-warning-bg, var(--color-warning-bg))'
        : 'var(--status-success-bg)';
    const border =
      level === 'danger'
        ? 'var(--status-error-border)'
        : level === 'warning'
        ? 'var(--status-warning-border, var(--color-warning-border))'
        : 'var(--status-success-border)';
    const color =
      level === 'danger' ? 'var(--color-danger)' : level === 'warning' ? 'var(--color-warning)' : 'var(--color-success)';

    return { text: parts.join('；'), advice, bg, border, color };
  }, [m, gapList, daily]);

  // ── 产能走势图（核心新增）──────────────────────────────────────────
  const trendOption = useMemo(() => {
    if (!daily || !daily.points || daily.points.length === 0) return null;
    const pts = daily.points;
    const labels = pts.map((p) => p.label);
    const values = pts.map((p) => p.qty);

    // 连续无产出日 → 灰色底纹（让"14 天里只干了 3 天"一眼可见）
    const bands: any[] = [];
    let startIdx = -1;
    pts.forEach((p, i) => {
      if (!p.active && startIdx < 0) startIdx = i;
      const isLast = i === pts.length - 1;
      if ((p.active || isLast) && startIdx >= 0) {
        const endIdx = p.active ? i - 1 : i;
        if (endIdx >= startIdx) {
          bands.push([{ xAxis: labels[startIdx] }, { xAxis: labels[endIdx] }]);
        }
        startIdx = -1;
      }
    });

    const markPoints: any[] = [];
    if (daily.peakQty > 0 && daily.peakDate) {
      markPoints.push({
        coord: [daily.peakDate.slice(5), daily.peakQty],
        value: daily.peakQty,
        itemStyle: { color: C.peak },
        label: {
          show: true,
          position: 'top',
          distance: 8,
          formatter: `最高 ${daily.peakQty.toLocaleString()}`,
          color: C.peak,
          fontSize: 10,
          fontWeight: 600,
        },
      });
    }
    if (daily.lowQty > 0 && daily.lowDate) {
      markPoints.push({
        coord: [daily.lowDate.slice(5), daily.lowQty],
        value: daily.lowQty,
        itemStyle: { color: C.low },
        label: {
          show: true,
          // 最低值通常就在柱子顶上，'bottom' 会压进柱体里 —— 放右侧，配 8px 间距
          position: 'right',
          distance: 8,
          formatter: `最低 ${daily.lowQty.toLocaleString()}`,
          color: C.low,
          fontSize: 10,
          fontWeight: 600,
        },
      });
    }

    return {
      grid: { left: 8, right: 16, top: 28, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        formatter: (params: any[]) => {
          const p = params?.[0];
          if (!p) return '';
          const point = pts[p.dataIndex];
          if (!point) return '';
          const head = `<div style="font-weight:600;margin-bottom:2px">${point.date}</div>`;
          if (!point.active) return `${head}<span style="color:#9ca3af">当日无生产记录</span>`;
          const share = daily.avgPerActiveDay > 0 ? Math.round((point.qty / daily.avgPerActiveDay) * 100) : 0;
          return (
            `${head}<div>产出 <b>${point.qty.toLocaleString()}</b> 件</div>` +
            `<div style="color:#9ca3af">相当于日均的 ${share}%</div>`
          );
        },
      },
      xAxis: {
        type: 'category',
        data: labels,
        axisTick: { show: false },
        axisLine: { lineStyle: { color: C.axis } },
        axisLabel: { color: C.label, fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: C.label, fontSize: 11, formatter: (v: number) => v.toLocaleString() },
        splitLine: { lineStyle: { color: C.split } },
      },
      series: [
        {
          name: '日产量',
          type: 'bar',
          data: values,
          barMaxWidth: 26,
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: (p: any) => (values[p.dataIndex] > 0 ? C.bar : 'transparent'),
          },
          markArea: bands.length
            ? {
                silent: true,
                itemStyle: { color: C.zeroBand },
                data: bands,
              }
            : undefined,
          markLine: daily.avgPerActiveDay > 0
            ? {
                silent: true,
                symbol: 'none',
                lineStyle: { color: C.avgLine, type: 'dashed', width: 1 },
                label: {
                  formatter: `有产出日均 ${fmt(daily.avgPerActiveDay, 1)}`,
                  color: C.text,
                  fontSize: 10,
                  position: 'insideEndTop',
                },
                data: [{ yAxis: daily.avgPerActiveDay }],
              }
            : undefined,
          markPoint: markPoints.length ? { symbolSize: 6, data: markPoints } : undefined,
        },
      ],
    };
  }, [daily]);

  // ── 在产订单进度分布 ───────────────────────────────────────────────
  const orderProgressOption = useMemo(() => {
    if (!activeOrders.length) return null;
    const sorted = [...activeOrders].sort((a, b) => (a.daysToDeadline ?? 999) - (b.daysToDeadline ?? 999));
    const labels = sorted.map((o) => `${o.styleNo || '-'} · ${String(o.orderNo || '').slice(-6)}`);
    const done = sorted.map((o) => Math.round(((o.orderQuantity ?? 0) * (o.productionProgress ?? 0)) / 100));
    const left = sorted.map((o) =>
      Math.max(0, (o.orderQuantity ?? 0) - Math.round(((o.orderQuantity ?? 0) * (o.productionProgress ?? 0)) / 100)),
    );
    return {
      grid: { left: 8, right: 40, top: 6, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        confine: true,
        formatter: (p: any[]) => {
          const o = sorted[p[0]?.dataIndex ?? 0];
          if (!o) return '';
          return [
            `<b>${o.orderNo}</b>`,
            `款号 ${o.styleNo || '-'}`,
            `数量 ${o.orderQuantity} 件 · 完成 ${o.productionProgress ?? 0}%`,
            `交期 ${o.plannedEndDate ? dayjs(o.plannedEndDate).format('MM-DD') : '-'}`,
            (o.daysToDeadline ?? 0) < 0
              ? `<span style="color:#ef4444">逾期 ${-(o.daysToDeadline ?? 0)} 天</span>`
              : `剩余 ${o.daysToDeadline ?? '-'} 天`,
          ].join('<br/>');
        },
      },
      xAxis: {
        type: 'value',
        axisLabel: { fontSize: 10, color: C.label },
        splitLine: { lineStyle: { color: C.split } },
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLabel: { fontSize: 11, color: C.text },
        axisTick: { show: false },
        axisLine: { show: false },
      },
      series: [
        {
          name: '已完成',
          type: 'bar',
          stack: 'q',
          data: done,
          barMaxWidth: 16,
          itemStyle: {
            color: (p: any) => progressHex(sorted[p.dataIndex]?.productionProgress ?? 0),
            borderRadius: [3, 0, 0, 3],
          },
          label: {
            show: true,
            position: 'inside',
            fontSize: 9.5,
            color: '#fff',
            formatter: (p: any) =>
              sorted[p.dataIndex]?.productionProgress ? `${sorted[p.dataIndex].productionProgress}%` : '',
          },
        },
        {
          name: '未完成',
          type: 'bar',
          stack: 'q',
          data: left,
          barMaxWidth: 16,
          itemStyle: { color: 'rgba(156,163,175,.22)', borderRadius: [0, 3, 3, 0] },
        },
      ],
    };
  }, [activeOrders]);

  const orderColumns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 130, ellipsis: true },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 110, ellipsis: true },
    { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 70, align: 'right' as const },
    {
      title: '进度',
      dataIndex: 'productionProgress',
      key: 'productionProgress',
      width: 110,
      render: (v: number) =>
        v != null ? (
          <Progress
            percent={v}
            size="small"
            strokeColor={progressColor(v)}
            format={(p) => <span style={{ fontSize: 10.5 }}>{p}%</span>}
          />
        ) : (
          '-'
        ),
    },
    {
      title: '交期',
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 100,
      render: (v: string) => (v ? dayjs(v).format('MM-DD') : '-'),
    },
    {
      title: '剩余天数',
      dataIndex: 'daysToDeadline',
      key: 'daysToDeadline',
      width: 110,
      render: (v: number, record: FactoryActiveOrderDTO) => {
        // 已完成待关单：进度100%但状态未流转。生产已做完，只是等关单 ——
        // 不再按"逾期高危" alarms，但把逾期天数与"待关单"状态说清楚，避免用户误解。
        if (record.completedPendingClosure) {
          const overdue = (v ?? 0) < 0 ? -(v ?? 0) : 0;
          return (
            <Tooltip
              title={
                <div style={{ lineHeight: 1.6 }}>
                  <div>生产已完成并入库，等待关单确认</div>
                  {overdue > 0 ? <div style={{ color: '#fca5a5' }}>已逾期 {overdue} 天（按计划交期 {dayjs(record.plannedEndDate).format('MM-DD')}）</div> : null}
                </div>
              }
            >
              <div className="u-d-flex u-fd-column u-ai-center" style={{ lineHeight: 1.2 }}>
                <span style={{ color: 'var(--color-info)', fontWeight: 600 }}>已完成待关单</span>
                {overdue > 0 ? (
                  <span style={{ color: 'var(--color-warning)', fontSize: 11, fontWeight: 600 }}>逾期 {overdue} 天</span>
                ) : (
                  <span style={{ color: 'var(--color-text-quaternary)', fontSize: 11 }}>待关单</span>
                )}
              </div>
            </Tooltip>
          );
        }
        const color = v < 0 ? 'var(--color-danger)' : v <= 7 ? 'var(--color-warning)' : 'var(--color-text-secondary)';
        return <span style={{ color, fontWeight: 600 }}>{v < 0 ? `逾期${-v}天` : `${v}天`}</span>;
      },
    },
    {
      title: '风险',
      dataIndex: 'riskLevel',
      key: 'riskLevel',
      width: 80,
      render: (v: string, record: FactoryActiveOrderDTO) => {
        if (record.completedPendingClosure) {
          return (
            <Tag style={{ color: 'var(--color-info)', borderColor: 'var(--color-info)', background: 'transparent' }}>
              待关单
            </Tag>
          );
        }
        const meta =
          {
            safe: { c: 'var(--color-success)', t: '正常' },
            warning: { c: 'var(--color-warning)', t: '关注' },
            danger: { c: 'var(--color-danger)', t: '高危' },
          }[v] || { c: 'var(--color-text-quaternary)', t: '-' };
        return <Tag style={{ color: meta.c, borderColor: meta.c, background: 'transparent' }}>{meta.t}</Tag>;
      },
    },
  ];

  const tierColor = (tier?: string) => {
    if (!tier) return 'var(--color-text-secondary)';
    if (tier === 'S') return 'var(--color-success)';
    if (tier === 'A') return 'var(--color-info)';
    if (tier === 'B') return 'var(--color-warning)';
    return 'var(--color-danger)';
  };

  return (
    <Drawer
      title={<span className="u-fs-15 u-fw-600">{factoryName} — 工厂全动态详情</span>}
      open={open}
      onClose={onClose}
      styles={{ wrapper: { width: '85%' } }}
      destroyOnClose
      extra={
        <Button
          size="small"
          type="default"
          icon={<ReloadOutlined />}
          onClick={loadAll}
          loading={loading}
          style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
        >
          刷新
        </Button>
      }
    >
      <BrandLoading spinning={loading}>
        {error && (
          <Alert
            type="error"
            message={error}
            action={
              <Button size="small" onClick={loadAll} loading={loading}>
                重试
              </Button>
            }
            style={{ marginBottom: 16 }}
          />
        )}

        {/* ── 0. 一句话结论（先给判断，再给证据）── */}
        {conclusion && (
          <div
            style={{
              marginBottom: 20,
              padding: '9px 12px',
              borderRadius: 6,
              background: conclusion.bg,
              border: `1px solid ${conclusion.border}`,
              borderLeft: `3px solid ${conclusion.color}`,
              lineHeight: 1.7,
            }}
          >
            <div className="u-fs-13" style={{ color: 'var(--color-text-primary)' }}>
              {conclusion.text}
            </div>
            <div className="u-fs-12 u-mt-4" style={{ color: conclusion.color, fontWeight: 600 }}>
              {conclusion.advice}
            </div>
          </div>
        )}

        {/* ── 1. KPI 指标条（一眼看清体量/健康度）── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))',
            gap: 8,
            marginBottom: 20,
          }}
        >
          <Kpi label="在产订单" value={`${m.orderCount} 单`} hint={`共 ${fmt(m.totalQty)} 件`} />
          <Kpi
            label="整体完成"
            value={`${m.progress}%`}
            hint={`已完成 ${fmt(Math.round((m.totalQty * m.progress) / 100))} 件`}
            color={progressColor(m.progress)}
          />
          <Kpi
            label="逾期订单"
            value={`${m.overdueCount} 单`}
            hint={m.overdueCount > 0 ? `最久 ${m.maxOverdue} 天` : '无逾期'}
            color={m.overdueCount > 0 ? 'var(--color-danger)' : 'var(--color-success)'}
          />
          {m.pendingClosureCount > 0 && (
            <Kpi
              label="已完成待关单"
              value={`${m.pendingClosureCount} 单`}
              hint={m.pendingClosureOverdueCount > 0 ? `${m.pendingClosureOverdueCount} 单已逾期` : '等待关单'}
              color="var(--color-info)"
            />
          )}
          <Kpi
            label="近14天日均"
            value={m.velocity > 0 ? `${fmt(m.velocity, 1)} 件/天` : '无记录'}
            hint={m.activeDays > 0 ? `14 天中 ${m.activeDays} 天有产出` : '近14天未扫码'}
            color={m.velocity > 0 ? 'var(--color-info)' : 'var(--color-warning)'}
          />
          <Kpi
            label="在手负载"
            value={`${fmt(m.pending)} 件`}
            hint={m.daysToClear != null ? `按现产能需 ${m.daysToClear} 天` : '无法估算'}
          />
          {stat && (stat.matchScore > 0 || stat.supplierTier) && (
            <Kpi
              label="推荐指数"
              value={stat.matchScore > 0 ? `${stat.matchScore} 分` : '-'}
              hint={
                stat.supplierTier ? (
                  <span>
                    历史评级 <b style={{ color: tierColor(stat.supplierTier) }}>{stat.supplierTier}</b>
                  </span>
                ) : (
                  '暂无评级'
                )
              }
              color={
                stat.matchScore >= 70
                  ? 'var(--color-success)'
                  : stat.matchScore >= 40
                  ? 'var(--color-warning)'
                  : 'var(--color-danger)'
              }
            />
          )}
        </div>

        {/* ── 2. 产能走势（核心：产能稳不稳，比单个日均更重要）── */}
        <div style={{ marginBottom: 24 }}>
          <SectionTitle
            extra={
              daily && daily.points?.length
                ? `近 ${daily.days} 个完整日（${dayjs(daily.windowStart).format('MM-DD')} ~ ${dayjs(daily.windowEnd).format('MM-DD')}）`
                : undefined
            }
          >
            产能走势
          </SectionTitle>
          {daily && trendOption ? (
            <>
              <Suspense fallback={<div style={{ height: 210 }} />}>
                <ReactECharts option={trendOption} style={{ height: 210 }} opts={{ renderer: 'svg' }} notMerge />
              </Suspense>
              <div
                className="u-d-flex u-fwrap-wrap u-gap-16 u-fs-12"
                style={{ color: 'var(--color-text-tertiary)', marginTop: 6 }}
              >
                <span>
                  合计 <b style={{ color: 'var(--color-text-primary)' }}>{fmt(daily.totalQty)}</b> 件
                </span>
                <span>
                  有产出日均 <b style={{ color: 'var(--color-info)' }}>{fmt(daily.avgPerActiveDay, 1)}</b> 件/天
                </span>
                <span>
                  日历日均 <b style={{ color: 'var(--color-text-secondary)' }}>{fmt(daily.avgPerCalendarDay, 1)}</b> 件/天
                </span>
                {daily.peakDate && (
                  <span>
                    <RiseOutlined style={{ color: C.peak }} /> 最高 {fmt(daily.peakQty)} 件（
                    {dayjs(daily.peakDate).format('MM-DD')}）
                  </span>
                )}
                {daily.lowDate && (
                  <span>
                    <FallOutlined style={{ color: C.low }} /> 最低 {fmt(daily.lowQty)} 件（
                    {dayjs(daily.lowDate).format('MM-DD')}）
                  </span>
                )}
              </div>
              {daily.activeDays === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                  message="近 14 个完整日无任何扫码产出记录 —— 该厂可能未开工或未使用扫码，产能无法评估"
                />
              ) : daily.zeroStreak >= 3 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginTop: 8 }}
                  message={`已连续 ${daily.zeroStreak} 天无生产记录（截至 ${dayjs(daily.windowEnd).format('MM-DD')}）—— 存在停摆风险，建议电话确认`}
                />
              ) : null}
              <div className="u-fs-12 u-mt-4" style={{ color: 'var(--color-text-quaternary, var(--color-text-tertiary))' }}>
                柱=日产量；灰色底纹=当日无生产记录；虚线=有产出日均。有产出日均与日历日均是两个口径（前者不含停产日），
                下单预测用的是前者。
              </div>
            </>
          ) : (
            <Empty description="暂无逐日产出数据" />
          )}
        </div>

        {/* ── 3. 交期预测 / 产能缺口（两列并排，窄屏自动堆叠）── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <SectionTitle
              extra={
                prediction?.confidence != null ? (
                  <span>
                    置信度{' '}
                    <b
                      style={{
                        color:
                          prediction.confidence >= 70
                            ? 'var(--color-success)'
                            : prediction.confidence >= 50
                            ? 'var(--color-warning)'
                            : 'var(--color-danger)',
                      }}
                    >
                      {prediction.confidence}%
                    </b>
                  </span>
                ) : undefined
              }
            >
              交期预测
            </SectionTitle>
            {prediction ? (
              <>
                <Progress
                  percent={prediction.confidence ?? 0}
                  size={{ height: 4 }}
                  showInfo={false}
                  strokeColor={
                    (prediction.confidence ?? 0) >= 70
                      ? 'var(--color-success)'
                      : (prediction.confidence ?? 0) >= 50
                      ? 'var(--color-warning)'
                      : 'var(--color-danger)'
                  }
                  style={{ marginBottom: 2 }}
                />
                {prediction.confidence < 60 && (prediction.velocityActiveDays ?? 0) > 0 && (
                  <div className="u-fs-12" style={{ color: 'var(--color-warning)' }}>
                    近14天仅 {prediction.velocityActiveDays} 天有生产记录，样本不足，仅供参考
                  </div>
                )}
                {renderTimeline(prediction.timelineNodes)}
                <div
                  className="u-br-6 u-fs-12"
                  style={{
                    padding: '8px 10px',
                    background: 'var(--color-bg-layout, var(--color-bg-subtle))',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  {prediction.rationale}
                </div>
                {prediction.likelyDelayed && (
                  <div
                    className="u-mt-8 u-br-4 u-fs-12"
                    style={{
                      padding: '6px 10px',
                      background: 'var(--status-error-bg)',
                      border: '1px solid var(--status-error-border)',
                      color: 'var(--color-danger)',
                    }}
                  >
                    预计延期：最可能完工日期晚于计划交期，建议调整交期或增加产能
                  </div>
                )}
              </>
            ) : (
              <Empty description="暂无预测数据" />
            )}
          </div>

          <div>
            <SectionTitle>产能缺口</SectionTitle>
            {gapList ? (
              <div
                className="u-br-6"
                style={{ padding: '10px 12px', background: 'var(--color-bg-layout, var(--color-bg-subtle))' }}
              >
                <div className="u-d-flex u-ai-center u-gap-8 u-mb-6 u-fwrap-wrap">
                  <Tag
                    style={{
                      color: GAP_LEVEL_META[gapList.gapLevel]?.color,
                      borderColor: GAP_LEVEL_META[gapList.gapLevel]?.color,
                      background: 'transparent',
                      fontWeight: 600,
                      margin: 0,
                    }}
                  >
                    {GAP_LEVEL_META[gapList.gapLevel]?.label || gapList.gapLevel}
                  </Tag>
                  <span className="u-fs-12" style={{ color: 'var(--color-text-secondary)' }}>
                    在手 {fmt(gapList.pendingQuantity)} 件 · 日产 {fmt(gapList.dailyCapacity)} 件/天 · 预计{' '}
                    {fmt(gapList.estimatedDaysToComplete)} 天
                  </span>
                </div>
                {gapList.nearestDueDate && (
                  <div className="u-fs-12 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>
                    最近交期 {dayjs(gapList.nearestDueDate).format('MM-DD')}（
                    {gapList.daysToNearestDue < 0 ? `逾期 ${-gapList.daysToNearestDue} 天` : `剩 ${gapList.daysToNearestDue} 天`}）
                  </div>
                )}
                <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.6 }}>
                  {gapList.advice}
                </div>
              </div>
            ) : (
              <Empty description="暂无缺口分析数据" />
            )}
          </div>
        </div>

        {/* ── 4. 在产订单进度分布 ── */}
        {orderProgressOption && (
          <div style={{ marginBottom: 24 }}>
            <SectionTitle extra="按紧急度排序 · 红=进度落后">在产订单进度分布</SectionTitle>
            <Suspense fallback={<div style={{ height: 120 }} />}>
              <ReactECharts
                option={orderProgressOption}
                style={{ height: Math.max(110, activeOrders.length * 34 + 20) }}
                opts={{ renderer: 'svg' }}
                notMerge
              />
            </Suspense>
          </div>
        )}

        {/* ── 5. 在产订单明细 ── */}
        <div>
          <SectionTitle extra={`共 ${activeOrders.length} 单`}>在产订单明细</SectionTitle>
          <Table
            dataSource={activeOrders}
            columns={orderColumns}
            rowKey="orderId"
            size="small"
            pagination={{ pageSize: 8, size: 'small' }}
            scroll={{ x: 660 }}
            locale={{ emptyText: <Empty description="该工厂暂无在产订单" /> }}
          />
        </div>
      </BrandLoading>
    </Drawer>
  );
};

export default FactoryInsightDrawer;
