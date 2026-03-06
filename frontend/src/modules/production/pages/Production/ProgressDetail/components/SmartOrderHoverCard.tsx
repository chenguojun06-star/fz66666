/**
 * SmartOrderHoverCard v6 (2026-02-28)
 * 显示规则：
 *  - 进行中（有扫码但未完成）→ 全部显示，带预计完成日期
 *  - 已完成 → 不显示
 *  - 未开始 → 按工序顺序前2条，带预测开始日期
 *  - 全无扫码 → 按工序顺序前2条，带预测日期
 */
import React, { useMemo, useState, useEffect } from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';
import { useProductionBoardStore } from '@/stores/productionBoardStore';
import { useOrderPredictHint } from '../hooks/useOrderPredictHint';
import { analyzeProgress, renderProgressInsight } from '../utils/progressIntelligence';


interface Props { order: ProductionOrder; }

const STAGES_DEF = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

/** 固定展示顺序（工厂有自定义工序时也按此排） */
const STAGE_ORDER = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '质检', '入库'];

/**
 * 规范化节点显示名称：将冗长变体名简化为标准名，仅用于 UI 显示层
 * 例："仓库入库" / "成品入库" / "质检入库" / "入仓" → "入库"
 */
const normalizeNodeLabel = (name: string): string => {
  if (!name) return name;
  if (name.includes('入库') || name.includes('入仓')) return '入库';
  return name;
};

function fieldRate(o: ProductionOrder, key: string): number {
  return Math.min(100, Math.max(0, Number((o as any)[key]) || 0));
}

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const boardTimesByOrder = useProductionBoardStore(s => s.boardTimesByOrder);
  const boardStatsByOrder = useProductionBoardStore(s => s.boardStatsByOrder);
  const processStatsByOrder      = useProductionBoardStore(s => s.processStatsByOrder);
  const processGroupsByOrder     = useProductionBoardStore(s => s.processGroupsByOrder);
  const processTimesByOrder      = useProductionBoardStore(s => s.processTimesByOrder);
  const processWorkerCountsByOrder = useProductionBoardStore(s => s.processWorkerCountsByOrder);
  const boardStats    = boardStatsByOrder[String(order.id)]  ?? null;
  const boardTimes    = boardTimesByOrder[String(order.id)]  ?? {};
  const processStats  = processStatsByOrder[String(order.id)]  ?? null;
  const processGroups = processGroupsByOrder[String(order.id)] ?? {};
  const processTimes  = processTimesByOrder[String(order.id)]  ?? {};
  const processWorkers = processWorkerCountsByOrder[String(order.id)] ?? {};

  const total       = Number(order.orderQuantity) || 0;
  // 已完成（status=completed）或已关单（status=CLOSED / actualEndDate 有值）均不显示悬浮卡
  const isCompleted = order.status === 'completed' || (order.status as string) === 'CLOSED' || !!order.actualEndDate;
  const now         = dayjs();
  const planEnd     = order.plannedEndDate ? dayjs(order.plannedEndDate) : null;
  const daysLeft    = planEnd ? planEnd.diff(now, 'day') : null;
  const prog        = Number(order.productionProgress) || 0;

  /**
   * 工序条目列表：
   *  - 有子工序扫码数据 (processStats 有 qty>0 的内容)：
   *      直接按 processName 展示，并附上父工序名 (stageName)
   *  - 无子工序数据：回退到 boardStats 父工序级别（带 STAGES_DEF 字段兜底）
   */
  const stages = useMemo(() => {
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

      const items = Object.entries(pStats)
        .filter(([, qty]) => qty > 0)
        .map(([pName, qty]) => ({
          label:       pName,
          stageName:   pToStage(pName),
          qty,
          pct:         total > 0 ? Math.min(100, Math.round(qty / total * 100)) : 0,
          lastTime:    pTimes[pName] ? dayjs(pTimes[pName]).format('MM-DD HH:mm') : null,
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
    // ★ 提前规范化 boardStats key（"仓库入库"→"入库"），防止与 STAGES_DEF 生成重复同名条目
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
    const allLabels = Array.from(
      new Set([...boardKeys, ...STAGES_DEF.map(s => s.label)])
    );
    allLabels.sort((a, b) => {
      const ai = STAGE_ORDER.indexOf(a);
      const bi = STAGE_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return allLabels.map(label => {
      const fromBoard = normBoardMap.get(label) ?? 0;
      const fieldDef = STAGES_DEF.find(s => s.label === label);
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
      const lastTime = rawT ? dayjs(rawT).format('MM-DD HH:mm') : null;
      return { label, stageName: '' as string, qty, pct, lastTime, workerCount: 0 };
    });
  }, [order, boardStats, boardTimes, total, processStats, processGroups, processTimes, processWorkers]);

  /* 卡住检测（最近扫码3天没动） */
  const stuckNode = useMemo(() => {
    if (isCompleted) return null;
    const entries = Object.entries(boardTimes);
    if (!entries.length) return null;
    const [node, time] = entries.reduce((a, b) =>
      dayjs(a[1]).isAfter(dayjs(b[1])) ? a : b
    );
    const days = now.diff(dayjs(time), 'day');
    return days >= 3 ? { node, days } : null;
  }, [boardTimes, isCompleted, now]);

  /* 交期标签 */
  const deadline = useMemo(() => {
    if (isCompleted) return { text: '已完成', color: '#52c41a' };
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: `逾期 ${-daysLeft} 天`, color: '#ff4d4f' };
    if (daysLeft === 0) return { text: '今天交货', color: '#ff4d4f' };
    if (daysLeft <= 3) return { text: `还剩 ${daysLeft} 天`, color: '#fa8c16' };
    return { text: `还剩 ${daysLeft} 天`, color: '#52c41a' };
  }, [isCompleted, daysLeft]);

  /* 风险标签 */
  const risk = useMemo(() => {
    if (isCompleted) return null;
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: '已逾期', color: '#ff4d4f', bg: '#fff2f0' };
    if (daysLeft <= 3 && prog < 80) return { text: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
    if (daysLeft <= 7 && prog < 50) return { text: '存在风险', color: '#fa8c16', bg: '#fffbe6' };
    if (daysLeft <= 14 && prog < 30) return { text: '需关注', color: '#fa8c16', bg: '#fffbe6' };
    return null;
  }, [isCompleted, daysLeft, prog]);
  /* 速度：取单工序最大件数 / 开工天数
   * 不累加所有工序，避免同一批件在多工序中重复计算导致虚高 */
  const speed = useMemo(() => {
    const orderStart = order.createTime ? dayjs(order.createTime) : null;
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
      color:  overload ? '#ff4d4f' : tight ? '#fa8c16' : '#52c41a',
      label:  overload ? '超产能' : tight ? '需加速' : '正常',
    };
  }, [isCompleted, daysLeft, total, prog, speed]);

  /**
   * ★ 核心显示逻辑
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
    if (isCompleted) return null;
    const snapshots = stages.map(s => ({
      name: s.label,
      qty: s.qty,
      pct: s.pct,
      lastTime: s.lastTime,
    }));
    return analyzeProgress(order, snapshots, boardTimes, speed);
  }, [order, stages, boardTimes, speed, isCompleted]);

  /* ─────── RENDER ─────── */
  // 已完成/已关单不显示悬浮卡
  if (isCompleted) return null;

  return (
    <div style={{ width: 270, fontSize: 12, lineHeight: 1.5 }}>

      {/* 顶部：款号 + 款名 + EC单号 */}
      {(order.styleNo || order.ecOrderNo) && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 6, flexWrap: 'wrap',
        }}>
          {order.styleNo && (
            <span style={{
              fontSize: 11, color: '#555', background: '#f5f5f5',
              padding: '1px 7px', borderRadius: 10, fontWeight: 600,
            }}>
              款号 {order.styleNo}
            </span>
          )}
          {order.styleName && (
            <span style={{ fontSize: 11, color: '#888', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {order.styleName}
            </span>
          )}
          {order.ecOrderNo && (
            <span style={{
              fontSize: 11, color: '#1677ff', background: '#e6f4ff',
              padding: '1px 7px', borderRadius: 10, fontWeight: 600,
            }}>
              {order.ecPlatform ? `${order.ecPlatform} ` : ''}{order.ecOrderNo}
            </span>
          )}
        </div>
      )}

      {/* 工厂 + 交期 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 8,
      }}>
        <span style={{ color: '#555', fontWeight: 600, fontSize: 13 }}>
          {order.factoryName || '工序进度'}
        </span>
        {deadline && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: deadline.color,
            background: deadline.color + '18', padding: '2px 8px', borderRadius: 10,
          }}>
            {deadline.text}
          </span>
        )}
      </div>

      {/* AI 预测完工 */}
      {predictHint && (
        <div style={{
          padding: '3px 10px', background: '#f0f5ff', borderRadius: 6,
          marginBottom: 8, fontSize: 11, color: '#1677ff',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span>🔮</span>
          <span>AI预测完工 <b>{predictHint.text}</b></span>
          {predictHint.confidence && <span style={{ color: '#8c8c8c' }}>置信{predictHint.confidence}</span>}
          {predictHint.remaining > 0 && <span style={{ color: '#8c8c8c' }}>剩{predictHint.remaining}件</span>}
        </div>
      )}

      {/* 风险条 */}
      {risk && (
        <div style={{
          padding: '4px 10px', background: risk.bg, borderRadius: 6,
          marginBottom: 8, fontSize: 11, color: risk.color, fontWeight: 700,
        }}>
          {risk.text}
          {speed > 0 && total > 0 && daysLeft !== null && daysLeft >= 0 && (
            <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
              {speed.toFixed(1)} 件/天，还需约 {Math.ceil((total - Math.round(prog / 100 * total)) / speed)} 天
            </span>
          )}
        </div>
      )}

      {/* 今日任务标签 */}
      {todayTask && (
        <div style={{
          padding: '3px 10px', borderRadius: 6, marginBottom: 8,
          background: todayTask.color + '14',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 11,
        }}>
          <span>🎯</span>
          <span style={{ fontWeight: 700, color: todayTask.color }}>
            今日需≥{todayTask.target}件
          </span>
          <span style={{ color: '#8c8c8c' }}>才能按时交货</span>
          <span style={{
            background: todayTask.color + '28',
            color: todayTask.color,
            padding: '0 5px', borderRadius: 8, fontSize: 10, fontWeight: 600,
          }}>
            {todayTask.label}
          </span>
        </div>
      )}

      {/* ① 进行中工序（全部显示） */}
      {inProgressList.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          {inProgressList.map((s, idx) => {
            const remainDays = speed > 0
              ? Math.ceil(Math.max(0, total - s.qty) / speed)
              : null;
            const estFinish = remainDays !== null
              ? now.add(remainDays, 'day').format('MM-DD')
              : null;
            // 子工序模式：展示父工序分组标题
            const showGroupHeader = s.stageName &&
              (idx === 0 || inProgressList[idx - 1].stageName !== s.stageName);
            const isSubProcess = !!s.stageName;
            return (
              <React.Fragment key={s.label}>
                {showGroupHeader && (
                  <div style={{
                    fontSize: 10, color: '#888', fontWeight: 600,
                    marginTop: idx > 0 ? 6 : 0, marginBottom: 2,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                    <span style={{ color: '#1677ff' }}>◆</span>
                    <span>{s.stageName}</span>
                    <div style={{ flex: 1, height: 1, background: '#e8f4ff', marginLeft: 2 }} />
                  </div>
                )}
                <div style={{ paddingLeft: isSubProcess ? 10 : 0, marginBottom: 6 }}>
                  {/* 第一行：图标 + 工序名 + 进度条(60px) + 百分比 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 12, flexShrink: 0, fontSize: 10, textAlign: 'center', color: '#1677ff' }}>▶</span>
                    <span style={{ minWidth: 40, maxWidth: 56, flexShrink: 0, fontWeight: 600, color: '#1677ff', fontSize: 11 }}>{s.label}</span>
                    {/* 瓶颈标记：当前工序与 progressInsight 检测到的瓶颈匹配 */}
                    {progressInsight?.bottleneck?.stage === s.label && (
                      <span style={{
                        background: '#fff2f0', color: '#ff4d4f',
                        borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700,
                      }}>🔴瓶颈</span>
                    )}
                    <div style={{ width: 60, flexShrink: 0, height: 4, background: '#f0f5ff', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(100, s.pct)}%`, height: '100%',
                        borderRadius: 2, background: '#1677ff',
                      }} />
                    </div>
                    <span style={{ flexShrink: 0, fontSize: 11, color: '#1677ff', fontWeight: 700, minWidth: 34, textAlign: 'right' }}>
                      {s.pct}%
                    </span>
                  </div>
                  {/* 第二行：件数 + 操作人数 + 人均产能 + 最近扫码时间 + 预计完成日 */}
                  <div style={{ paddingLeft: 17, fontSize: 10, color: '#aaa', marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ color: '#888' }}>{s.qty}/{total}件</span>
                    {s.workerCount > 0 && (
                      <span style={{
                        color: '#1677ff', background: '#e6f4ff',
                        padding: '0px 5px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                      }}>
                        👥 {s.workerCount}人
                      </span>
                    )}
                    {s.workerCount > 0 && speed > 0 && (
                      <span style={{ color: '#999' }}>
                        约{(speed / s.workerCount).toFixed(1)}件/人·天
                      </span>
                    )}
                    {s.lastTime && <span>最近 {s.lastTime}</span>}
                    {estFinish && <span style={{ color: '#1677ff' }}>预计 {estFinish}</span>}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ② 分隔线（有进行中时才加） */}
      {inProgressList.length > 0 && nextList.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          borderTop: '1px dashed #e8e8e8', margin: '2px 0 6px',
        }}>
          <span style={{ fontSize: 10, color: '#bbb', paddingTop: 3, whiteSpace: 'nowrap' }}>预测</span>
        </div>
      )}

      {/* ③ 未开始前2条（带预测日期） */}
      {nextList.length > 0 ? (
        <div>
          {nextList.map((s, idx) => {
            // 第0条：从baseDays之后开始
            // 第1条：再加一道工序耗时
            const startOffset = baseDays + idx * stageWorkDays;
            const predictDate = now.add(startOffset, 'day').format('MM-DD');
            return (
              <div key={s.label} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 14, fontSize: 11, textAlign: 'center', flexShrink: 0, color: '#d9d9d9' }}>○</span>
                  <span style={{ width: 26, flexShrink: 0, fontWeight: 400, color: '#bbb' }}>{s.label}</span>
                  <div style={{ flex: 1, height: 5, background: '#f5f5f5', borderRadius: 3 }} />
                  <span style={{ width: 70, textAlign: 'right', flexShrink: 0, fontSize: 11, color: '#bbb' }}>
                    约 {predictDate}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : !hasScan && (
        <div style={{ color: '#bbb', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
          {prog > 0 ? `整体进度 ${prog}%，工序数据加载中…` : '待开工'}
        </div>
      )}

      {/* 卡住警告 */}
      {stuckNode && (
        <div style={{
          marginTop: 6, padding: '3px 8px', background: '#fff7e6',
          borderRadius: 5, fontSize: 11, color: '#d46b08',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>⏸</span>
          <span><b>{stuckNode.node}</b> 已 <b>{stuckNode.days}</b> 天无扫码</span>
        </div>
      )}

      {/* 🤖 智能进度分析 */}
      {progressInsight && renderProgressInsight(progressInsight)}

      {/* 跟单 + 备注 */}
      {(order.merchandiser || (order as any).operationRemark) && (
        <div style={{
          borderTop: '1px solid #f5f5f5', marginTop: 7, paddingTop: 6,
          display: 'flex', gap: 10, flexWrap: 'wrap',
        }}>
          {order.merchandiser && (
            <span>
              <span style={{ color: '#bbb' }}>跟单 </span>
              <span style={{ color: '#555' }}>{order.merchandiser}</span>
            </span>
          )}
          {(order as any).operationRemark && (
            <span style={{
              color: '#d46b08', background: 'rgba(250,173,20,0.1)',
              padding: '1px 5px', borderRadius: 3,
            }}>
              {(order as any).operationRemark}
            </span>
          )}
        </div>
      )}


    </div>
  );
};

export default SmartOrderHoverCard;
