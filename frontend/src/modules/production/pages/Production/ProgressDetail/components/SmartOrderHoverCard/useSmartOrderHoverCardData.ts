/**
 * SmartOrderHoverCard 业务逻辑 Hook
 *
 * 聚合：store 数据 → 工序条目 → 风险/速度/今日任务 → AI 预测 → 智能进度分析
 * 主组件仅消费本 Hook 返回的数据，不再持有业务逻辑
 */
import { useMemo } from 'react';
import dayjs from 'dayjs';

import type { ProductionOrder } from '@/types/production';
import { useProductionBoardStore } from '@/stores/productionBoardStore';
import { isDirectCuttingOrder, isOrderTerminal } from '@/utils/api';
import { calcOrderProgress, isSentinelKey } from '@/modules/production/utils/calcOrderProgress';
import { useOrderPredictHint } from '../../hooks/useOrderPredictHint';
import { analyzeProgress } from '../../utils/progressIntelligence';
import {
  STAGES_DEF,
  STAGE_ORDER,
  fieldRate,
  normalizeNodeLabel,
  type StageItem,
} from './helpers';

/** AI 预测完工 hint（与 useOrderPredictHint 内部结构保持一致） */
export type PredictHint = {
  text: string;
  confidence?: string;
  remaining: number;
};

export interface SmartOrderHoverCardData {
  /* 基础 */
  total: number;
  directCutting: boolean;
  isCompleted: boolean;
  now: dayjs.Dayjs;
  daysLeft: number | null;
  prog: number;
  /* 工序条目 */
  stages: StageItem[];
  inProgressList: StageItem[];
  nextList: StageItem[];
  hasScan: boolean;
  /* 状态/标签 */
  stuckNode: { node: string; days: number } | null;
  deadline: { text: string; color: string } | null;
  risk: { text: string; color: string; bg: string } | null;
  speed: number;
  todayTask: { target: number; color: string; label: string } | null;
  baseDays: number;
  stageWorkDays: number;
  /* AI */
  predictHint: PredictHint | null;
  progressInsight: ReturnType<typeof analyzeProgress> | null;
}

export function useSmartOrderHoverCardData(order: ProductionOrder): SmartOrderHoverCardData {
  const boardTimesByOrder        = useProductionBoardStore(s => s.boardTimesByOrder);
  const boardStatsByOrder        = useProductionBoardStore(s => s.boardStatsByOrder);
  const processStatsByOrder      = useProductionBoardStore(s => s.processStatsByOrder);
  const processGroupsByOrder     = useProductionBoardStore(s => s.processGroupsByOrder);
  const processTimesByOrder      = useProductionBoardStore(s => s.processTimesByOrder);
  const processWorkerCountsByOrder = useProductionBoardStore(s => s.processWorkerCountsByOrder);
  const boardStats    = boardStatsByOrder[String(order.id)]  ?? null;
  const boardTimes    = useMemo(() => boardTimesByOrder[String(order.id)]  ?? {}, [boardTimesByOrder, order.id]);
  const processStats  = processStatsByOrder[String(order.id)]  ?? null;
  const processGroups = useMemo(() => processGroupsByOrder[String(order.id)] ?? {}, [processGroupsByOrder, order.id]);
  const processTimes  = useMemo(() => processTimesByOrder[String(order.id)]  ?? {}, [processTimesByOrder, order.id]);
  const processWorkers = useMemo(() => processWorkerCountsByOrder[String(order.id)] ?? {}, [processWorkerCountsByOrder, order.id]);

  const total       = Number(order.orderQuantity) || 0;
  const directCutting = isDirectCuttingOrder(order as any);
  // 已完成 / 已关单 / 已报废等终态订单均不显示悬浮卡
  const isCompleted = isOrderTerminal(order);
  // 已完成待关单：进度100%但状态未流转（生产做完、只等关单）
  const isPendingClosure = !isCompleted && (Number((order as any)?.productionProgress) || 0) >= 100;
  const now         = dayjs();
  const planEnd     = order.plannedEndDate ? dayjs(order.plannedEndDate) : null;
  const daysLeft    = planEnd ? planEnd.diff(now, 'day') : null;
  const prog        = calcOrderProgress(order, boardStats);

  /**
   * 工序条目列表：
   *  - 有子工序扫码数据 (processStats 有 qty>0 的内容)：
   *      直接按 processName 展示，并附上父工序名 (stageName)
   *  - 无子工序数据：回退到 boardStats 父工序级别（带 STAGES_DEF 字段兜底）
   */
  const stages = useMemo<StageItem[]>(() => {
    // 是否有真实扫码的子工序数据
    const hasProcess = processStats != null &&
      Object.values(processStats as Record<string, number>).some(v => v > 0);

    if (hasProcess) {
      // 真正动态：按实际 processName 展示，不依赖硬编码节点列表
      const pStats  = processStats  as Record<string, number>;
      const pGroups = processGroups as Record<string, string[]>;
      const pTimes  = processTimes  as Record<string, string>;
      const pWorkerCounts = processWorkers as Record<string, number>;
      // 每个 processName 找到对应的父工序 (stageName)
      const pToStage = (pName: string): string =>
        Object.entries(pGroups).find(([, pNames]) => pNames.includes(pName))?.[0] ?? '';

      const items: StageItem[] = Object.entries(pStats)
        .filter(([, qty]) => qty > 0)
        .map(([pName, qty]) => ({
          label:       pName,
          stageName:   pToStage(pName),
          qty,
          pct:         total > 0 ? Math.min(100, Math.round(qty / total * 100)) : 0,
          lastTime:    pTimes[pName] ? dayjs(pTimes[pName]).format('MM-DD') : null,
          workerCount: pWorkerCounts[pName] ?? 0,
        }));

      // 按父工序 STAGE_ORDER 排序，父工序相同时子工序按名字排
      items.sort((a, b) => {
        const ai = STAGE_ORDER.indexOf(a.stageName);
        const bi = STAGE_ORDER.indexOf(b.stageName);
        if (ai !== bi) {
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        }
        return a.label.localeCompare(b.label);
      });
      return items;
    }

    // 备用：boardStats 父工序级别
    //  提前规范化 boardStats key（"仓库入库"→"入库"），防止与 STAGES_DEF 生成重复同名条目
    //   若不规范化，"仓库入库"(qty=10,pct=25%) 与 STAGES_DEF "入库"(qty=0,pct=0) 并存
    //   导致 AI 看到两条"入库"，错误地把 pct=0 那条识别为"未开始"
    const normBoardMap = new Map<string, number>(); // normalizedLabel → qty
    const normBoardTimeMap = new Map<string, string>(); // normalizedLabel → time
    if (boardStats) {
      for (const [k, v] of Object.entries(boardStats as Record<string, number>)) {
        if (v > 0) {
          const nk = normalizeNodeLabel(k);
          normBoardMap.set(nk, Math.max(normBoardMap.get(nk) ?? 0, v));
        }
      }
    }
    for (const [k, t] of Object.entries(boardTimes)) {
      const nk = normalizeNodeLabel(k);
      if (!normBoardTimeMap.has(nk)) normBoardTimeMap.set(nk, t);
    }
    const boardKeys = Array.from(normBoardMap.keys());
    const stageDefs = directCutting ? STAGES_DEF.filter(s => s.label !== '采购') : STAGES_DEF;
    const stageOrder = directCutting ? STAGE_ORDER.filter(label => label !== '采购') : STAGE_ORDER;
    const allLabels = Array.from(
      new Set([...boardKeys, ...stageDefs.map(s => s.label)])
    );
    allLabels.sort((a, b) => {
      const ai = stageOrder.indexOf(a);
      const bi = stageOrder.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return allLabels.map(label => {
      const fromBoard = normBoardMap.get(label) ?? 0;
      const fieldDef = stageDefs.find(s => s.label === label);
      const fromField = fieldDef ? fieldRate(order, fieldDef.key) : 0;
      const qty = fromBoard > 0
        ? fromBoard
        : fromField > 0 && total > 0
          ? Math.round(fromField / 100 * total)
          : 0;
      const pct = fromBoard > 0 && total > 0
        ? Math.min(100, Math.round(fromBoard / total * 100))
        : fromField;
      const rawT = normBoardTimeMap.get(label);
      const lastTime = rawT ? dayjs(rawT).format('MM-DD') : null;
      return { label, stageName: '' as string, qty, pct, lastTime, workerCount: 0 };
    });
  }, [order, boardStats, boardTimes, total, processStats, processGroups, processTimes, processWorkers, directCutting]);

  /* 卡住检测（最近扫码3天没动） */
  const stuckNode = useMemo(() => {
    if (isCompleted || isPendingClosure) return null;
    const entries = Object.entries(boardTimes).filter(([k]) => !isSentinelKey(k));
    if (!entries.length) return null;
    const [node, time] = entries.reduce((a, b) =>
      dayjs(a[1]).isAfter(dayjs(b[1])) ? a : b
    );
    const days = now.diff(dayjs(time), 'day');
    return days >= 3 ? { node: normalizeNodeLabel(node), days } : null;
  }, [boardTimes, isCompleted, isPendingClosure, now]);

  /* 交期标签 */
  const deadline = useMemo(() => {
    if (isCompleted) return { text: '已完成', color: 'var(--color-success)' };
    if (isPendingClosure) {
      if (daysLeft !== null && daysLeft < 0) return { text: `已完成待关单 · 逾期 ${-daysLeft} 天`, color: 'var(--color-info)' };
      return { text: '已完成待关单', color: 'var(--color-info)' };
    }
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: `逾期 ${-daysLeft} 天`, color: 'var(--color-danger)' };
    if (daysLeft === 0) return { text: '今天交货', color: 'var(--color-danger)' };
    if (daysLeft <= 3) return { text: `还剩 ${daysLeft} 天`, color: 'var(--color-warning)' };
    return { text: `还剩 ${daysLeft} 天`, color: 'var(--color-success)' };
  }, [isCompleted, isPendingClosure, daysLeft]);

  /* 风险标签 */
  const risk = useMemo(() => {
    if (isCompleted || isPendingClosure) return null;
    if (isPendingClosure) {
      if (daysLeft !== null && daysLeft < 0) return { text: '待关单逾期', color: 'var(--color-warning)', bg: 'var(--status-warning-bg, var(--color-warning-bg))' };
      return { text: '待关单', color: 'var(--color-info)', bg: 'var(--status-info-bg, var(--color-info-bg))' };
    }
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: '已逾期', color: 'var(--color-danger)', bg: 'var(--status-success-bg)' };
    if (daysLeft <= 3 && prog < 80) return { text: ' 高风险', color: 'var(--color-danger)', bg: 'var(--status-success-bg)' };
    if (daysLeft <= 7 && prog < 50) return { text: '存在风险', color: 'var(--color-warning)', bg: 'var(--color-bg-base)BE6' };
    if (daysLeft <= 14 && prog < 30) return { text: '需关注', color: 'var(--color-warning)', bg: 'var(--color-bg-base)BE6' };
    return null;
  }, [isCompleted, isPendingClosure, daysLeft, prog]);

  /* 速度：取单工序最大件数 / 开工天数
   * 不累加所有工序，避免同一批件在多工序中重复计算导致虚高
   * D-837：elapsed 基准必须是「订单真实动起来的时刻」——曾用 createTime（下单时间），
   * 下单后排队 N 天才开工的单会把排队时间算进生产速度 → speed 系统性虚低 →
   * todayTask「超产能」误报（与 D-833 同族：注释写"开工"、代码取下单）。 */
  const speed = useMemo(() => {
    const startCandidates = [
      (order as any).procurementStartTime,
      (order as any).cuttingStartTime,
      (order as any).orderStartTime,
    ].filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
    // 取最早的真实开始时间；全无（订单从未动工）才退 createTime（此时分子也恒 0，不影响判定）
    const earliestStart = startCandidates.length > 0
      ? startCandidates.sort()[0]
      : (order.createTime || null);
    const orderStart = earliestStart ? dayjs(earliestStart) : null;
    const elapsed = orderStart ? Math.max(1, now.diff(orderStart, 'day')) : 1;
    const completedQty = Number(order.completedQuantity) || 0;
    // 优先用真实入库完成数
    if (completedQty > 0) return completedQty / elapsed;
    // 用单工序最大件数（不跨工序累加，防止同一批件重复计）
    const maxStageQty = boardStats
      ? Math.max(
          0,
          ...Object.values(boardStats as Record<string, number>).map(v => Number(v) || 0)
        )
      : 0;
    const fromProg = prog > 0 && total > 0 ? Math.round(prog / 100 * total) : 0;
    const done = Math.max(maxStageQty, fromProg);
    return done > 0 ? done / elapsed : 0;
  }, [order, prog, total, boardStats, now]);

  /* 今日任务：剩余件数 / 剩余天数 = 今天至少完成多少件 */
  const todayTask = useMemo(() => {
    if (isCompleted || daysLeft === null || daysLeft <= 0 || total <= 0) return null;
    const completedQty = Math.round(prog / 100 * total);
    const remainQty = Math.max(0, total - completedQty);
    if (remainQty === 0) return null;
    const target = Math.ceil(remainQty / daysLeft);
    if (target <= 0) return null;
    const overload = speed > 0 && target > speed * 1.5;
    const tight    = speed > 0 && target > speed * 1.0;
    return {
      target,
      color:  overload ? 'var(--color-danger)' : tight ? 'var(--color-warning)' : 'var(--color-success)',
      label:  overload ? '超产能' : tight ? '需加速' : '正常',
    };
  }, [isCompleted, daysLeft, total, prog, speed]);

  /**
   *  核心显示逻辑
   *
   * 分三类：
   *   inProgress  → pct > 0 && pct < 100（有扫码但未完成）— 全部显示
   *   notStarted  → pct === 0 && qty === 0（无扫码）
   *   done        → pct >= 100（已完成）— 不显示
   *
   * 最终列表：inProgress(全部) + notStarted前2条（按工序顺序）
   * 若 inProgress 为空，则只显示 notStarted 前2条
   */
  const { inProgressList, nextList, hasScan } = useMemo(() => {
    const ip = stages.filter(s => s.pct > 0 && s.pct < 100);
    const ns = stages.filter(s => s.pct === 0 && s.qty === 0);
    return {
      inProgressList: ip,
      nextList: ns.slice(0, 2),
      hasScan: stages.some(s => s.qty > 0 || s.pct > 0),
    };
  }, [stages]);

  /**
   * 预测时间计算
   *
   * 进行中工序：预计完成日 = now + (total - qty) / speed
   * 未开始工序的预测开始日：
   *   - 基础偏移 = 当前最慢进行中工序的剩余天数（如无进行中 = 0）
   *   - 每个 notStarted 工序叠加上一道工序的预计耗时
   */
  const baseDays = useMemo(() => {
    if (inProgressList.length === 0) return 0;
    // 取进行中工序中剩余最多的（最晚完成）
    return inProgressList.reduce((max, s) => {
      if (speed <= 0) return Math.max(max, 3);
      const remain = Math.ceil(Math.max(0, total - s.qty) / speed);
      return Math.max(max, remain);
    }, 0);
  }, [inProgressList, speed, total]);

  const stageWorkDays = speed > 0 && total > 0
    ? Math.max(1, Math.ceil(total / speed))
    : 7; // 速度未知默认7天/道

  /* AI 预测完工时间（后端算法，模块级缓存） */
  const firstActive = inProgressList[0];
  const predictHint = useOrderPredictHint(
    String(order.id || ''),
    order.orderNo,
    firstActive?.stageName || firstActive?.label,
    prog,
    isCompleted || !firstActive,
  );

  /* 智能进度分析（瓶颈/人员/资源/风险） */
  const progressInsight = useMemo(() => {
    if (isCompleted || isPendingClosure) return null;
    const snapshots = stages.map(s => ({
      name: s.label,
      qty: s.qty,
      pct: s.pct,
      lastTime: s.lastTime,
    }));
    return analyzeProgress(order, snapshots, boardTimes, speed);
  }, [order, stages, boardTimes, speed, isCompleted, isPendingClosure]);

  return {
    total,
    directCutting,
    isCompleted,
    now,
    daysLeft,
    prog,
    stages,
    inProgressList,
    nextList,
    hasScan,
    stuckNode,
    deadline,
    risk,
    speed,
    todayTask,
    baseDays,
    stageWorkDays,
    predictHint: predictHint as PredictHint | null,
    progressInsight,
  };
}
