/**
 * SmartOrderHoverCard v4 (2026-02-28)
 *
 * 数据优先级：
 *   工序进度  → boardStatsByOrder[id][label]（真实扫码件数）> *CompletionRate字段
 *   速度      → completedQuantity > productionProgress推算
 *   完成预测  → 速度推算 > 百分比线性插值
 *
 * 修复：当所有 *CompletionRate = 0、completedQuantity = 0 时，
 *       仍能基于 boardStats + productionProgress 正确显示预测
 */
import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';
import { useProductionBoardStore } from '@/stores/productionBoardStore';

interface Props { order: ProductionOrder; }

const STAGES_DEF = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

type StageDef = typeof STAGES_DEF[number];

function fieldRate(o: ProductionOrder, key: string): number {
  return Math.min(100, Math.max(0, Number((o as any)[key]) || 0));
}
function fmtDate(d: dayjs.Dayjs | null | undefined): string {
  return d ? d.format('MM-DD') : '—';
}

function calcRisk(o: ProductionOrder, predictedEnd: dayjs.Dayjs | null) {
  if (o.status === 'completed') return { label: '已完成', color: '#52c41a', bg: '#f6ffed' };
  const now    = dayjs();
  const planEnd = o.plannedEndDate ? dayjs(o.plannedEndDate) : null;
  const planDays = planEnd ? planEnd.diff(now, 'day') : null;
  const prog   = Number(o.productionProgress) || 0;
  if (planDays !== null && planDays < 0)
    return { label: '已逾期', color: '#ff4d4f', bg: '#fff2f0' };
  if (predictedEnd && planEnd && predictedEnd.isAfter(planEnd.add(3, 'day')))
    return { label: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
  if (planDays !== null && planDays <= 5 && prog < 80)
    return { label: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
  if (planDays !== null && planDays <= 14 && prog < 50)
    return { label: '存在风险', color: '#fa8c16', bg: '#fffbe6' };
  if (prog >= 90) return { label: '即将完成', color: '#52c41a', bg: '#f6ffed' };
  return { label: '正常推进', color: '#1677ff', bg: '#f0f5ff' };
}

function stageBarColor(rate: number) { return rate >= 60 ? '#1677ff' : '#fa8c16'; }

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  /* ─── Store 数据 ─── */
  const boardTimesByOrder = useProductionBoardStore(s => s.boardTimesByOrder);
  const boardStatsByOrder = useProductionBoardStore(s => s.boardStatsByOrder);
  const boardTimes = boardTimesByOrder[String(order.id)] ?? {};
  // null = 卡片视图未触发加载，{} = 加载了但无数据，{label:n} = 有真实扫码数据
  const boardStats = boardStatsByOrder[String(order.id)] ?? null;

  const total      = Number(order.orderQuantity) || 0;
  const isCompleted = order.status === 'completed';
  const now        = dayjs();
  const orderStart = order.createTime ? dayjs(order.createTime) : null;
  const elap       = orderStart ? Math.max(1, now.diff(orderStart, 'day')) : 1;
  const planEnd    = order.plannedEndDate ? dayjs(order.plannedEndDate) : null;
  const prog       = Number(order.productionProgress) || 0;

  /* effectiveDone: completedQuantity > productionProgress推算 > boardStats之和 */
  const effectiveDone = useMemo(() => {
    const raw = Number(order.completedQuantity) || 0;
    if (raw > 0) return raw;
    const fromProg = Math.round(prog / 100 * total);
    if (boardStats) {
      const boardTotal = Object.values(boardStats as Record<string, number>)
        .reduce((s, v) => s + (v ?? 0), 0);
      return Math.max(raw, fromProg, boardTotal);
    }
    return Math.max(raw, fromProg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, total, prog, boardStats]);

  /* 速度：件/天 */
  const speed = (effectiveDone > 0 && total > 0) ? effectiveDone / elap : 0;

  /* 总体预计完成日：speed推算 > 百分比线性插值 > 计划交期 */
  const overallEnd = useMemo((): dayjs.Dayjs | null => {
    if (isCompleted) return null;
    if (speed > 0 && total > 0)
      return now.add(Math.ceil((total - effectiveDone) / speed), 'day');
    if (prog > 0 && elap > 0)
      return now.add(Math.ceil(elap * (100 - prog) / prog), 'day');
    return planEnd ?? null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, speed, effectiveDone, total, elap, isCompleted, prog]);

  /* 工序维度数据：boardStats件数 > 字段rate */
  const stageData = useMemo(() => {
    return STAGES_DEF.map(s => {
      const qtyFromBoard = boardStats
        ? ((boardStats as Record<string, number>)[s.label] ?? 0)
        : 0;
      const rateFromField = fieldRate(order, s.key);
      const rateFromBoard = (qtyFromBoard > 0 && total > 0)
        ? Math.min(100, Math.round(qtyFromBoard / total * 100)) : 0;
      const effectiveRate = rateFromBoard > 0 ? rateFromBoard : rateFromField;
      const qty = rateFromBoard > 0
        ? qtyFromBoard
        : (rateFromField > 0 ? Math.round(rateFromField / 100 * total) : 0);
      return { ...s, rate: effectiveRate, qty, lastScanTime: boardTimes[s.label] ?? null };
    });
  }, [order, boardStats, total, boardTimes]);

  const activeStages  = stageData.filter(s => s.rate > 0 && s.rate < 100);
  const doneStages    = stageData.filter(s => s.rate >= 100);
  const hasStagedData = stageData.some(s => s.rate > 0);
  const curr: typeof stageData[number] | null = activeStages[0] ?? null;

  /* 当前工序预计完工 */
  const currStageEnd = useMemo((): dayjs.Dayjs | null => {
    if (!curr) return null;
    if (speed > 0 && total > 0) {
      const rem = Math.max(0, total - curr.qty);
      return now.add(Math.max(1, Math.ceil(rem / speed)), 'day');
    }
    return overallEnd;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curr, speed, total, now, overallEnd]);

  /* 当前工序开工日估算 */
  const currStageStart = useMemo((): dayjs.Dayjs | null => {
    if (!curr) return null;
    const bt = curr.lastScanTime;
    if (speed > 0 && curr.qty > 0) {
      const anchor = bt ? dayjs(bt) : now;
      return anchor.subtract(Math.round(curr.qty / speed), 'day');
    }
    if (bt) return dayjs(bt).subtract(1, 'day');
    return orderStart;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curr, speed, now, orderStart]);

  /* 下道工序 */
  const currIdx = curr ? STAGES_DEF.findIndex(s => s.label === curr.label) : -1;
  const nextStageDef: StageDef | null = currIdx >= 0
    ? (STAGES_DEF.slice(currIdx + 1).find(s => {
        const d = stageData.find(sd => sd.label === s.label);
        return d && d.rate === 0;
      }) ?? null)
    : null;

  /* 速度缺口 */
  const gap = useMemo(() => {
    if (isCompleted || !planEnd) return null;
    let needDays = 0;
    if (speed > 0 && total > 0) {
      needDays = Math.ceil((total - effectiveDone) / speed);
    } else if (prog > 0 && elap > 0) {
      needDays = Math.ceil(elap * (100 - prog) / prog);
    } else {
      return null;
    }
    const endDays = Math.max(0, planEnd.diff(now, 'day'));
    const g = needDays - endDays;
    return g > 0 ? { needDays, endDays, gap: g } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCompleted, planEnd, speed, total, effectiveDone, elap, prog, now]);

  /* 卡住节点 */
  const stuckNode = useMemo(() => {
    if (isCompleted) return null;
    const entries = Object.entries(boardTimes);
    if (!entries.length) return null;
    const best = entries.reduce((a, b) => dayjs(a[1]).isAfter(dayjs(b[1])) ? a : b);
    const days = now.diff(dayjs(best[1]), 'day');
    return days >= 3 ? { node: best[0], days } : null;
  }, [boardTimes, isCompleted, now]);

  const risk = useMemo(() => calcRisk(order, overallEnd), [order, overallEnd]);

  /* ─────── RENDER ─────── */
  return (
    <div style={{ width: 265, fontSize: 12, lineHeight: 1.6 }}>

      {/* 工厂名 */}
      {order.factoryName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <span style={{ color: '#bbb', fontSize: 11 }}>工厂</span>
          <span style={{ color: '#333', fontWeight: 600 }}>{order.factoryName}</span>
        </div>
      )}

      {/* ① 状态条：风险标签 + 预计完成日 + 速度 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 10px', background: risk.bg, borderRadius: 6, marginBottom: 7,
      }}>
        <span style={{ color: risk.color, fontWeight: 700 }}>{risk.label}</span>
        {!isCompleted && (
          <span style={{ color: '#888', fontSize: 11 }}>
            {overallEnd
              ? <>预计完成&nbsp;<b style={{ color: '#333' }}>{fmtDate(overallEnd)}</b></>
              : planEnd
                ? <>计划&nbsp;<b style={{ color: '#888' }}>{fmtDate(planEnd)}</b></>
                : null
            }
            {speed > 0 && (
              <span style={{ color: '#bbb' }}>&nbsp;·&nbsp;{speed.toFixed(1)}件/天</span>
            )}
          </span>
        )}
      </div>

      {/* ② 速度缺口警告 */}
      {gap && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', background: '#fff7e6', borderRadius: 5, marginBottom: 7,
          fontSize: 11, color: '#d46b08',
        }}>
          <span>⏱</span>
          <span>需&nbsp;<b>{gap.needDays}</b>&nbsp;天</span>
          <span style={{ color: '#ddd' }}>·</span>
          <span>剩&nbsp;<b>{gap.endDays}</b>&nbsp;天</span>
          <span style={{ color: '#ddd' }}>·</span>
          <span style={{ color: '#ff4d4f', fontWeight: 700 }}>差&nbsp;{gap.gap}&nbsp;天</span>
        </div>
      )}

      {/* ③ 卡住节点警告 */}
      {stuckNode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '3px 10px', background: '#fff7e6', borderRadius: 5, marginBottom: 7,
          fontSize: 11, color: '#d46b08',
        }}>
          <span>⏸</span>
          <span>卡在&nbsp;<b>{stuckNode.node}</b>&nbsp;·&nbsp;已&nbsp;<b>{stuckNode.days}</b>&nbsp;天无进展</span>
        </div>
      )}

      {/* ④ 工序进展区 */}
      {!isCompleted && (
        <div style={{ marginBottom: 6 }}>

          {/* ④-a 有工序维度数据（boardStats 或 字段值 > 0） */}
          {hasStagedData && (
            <>
              <div style={{ color: '#bbb', fontSize: 10, marginBottom: 5, letterSpacing: 0.8 }}>
                工序进展
                {doneStages.length > 0 && (
                  <span style={{ color: '#52c41a', marginLeft: 6 }}>
                    ✓&nbsp;{doneStages.length}&nbsp;道完成
                  </span>
                )}
              </div>

              {activeStages.map(s => {
                const isCurr = s.label === curr?.label;
                return (
                  <div key={s.key} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 28, color: '#555', flexShrink: 0, fontSize: 11 }}>
                        {s.label}
                      </span>
                      <div style={{ flex: 1, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{
                          width: `${s.rate}%`, height: '100%',
                          background: stageBarColor(s.rate), borderRadius: 3,
                        }} />
                      </div>
                      <span style={{ width: 44, textAlign: 'right', fontSize: 11, color: '#333', fontWeight: 600 }}>
                        {s.qty > 0 ? `${s.qty}件` : `${s.rate}%`}
                      </span>
                    </div>
                    {isCurr && (
                      <div style={{
                        paddingLeft: 34, fontSize: 11, color: '#888', marginTop: 2,
                        display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap',
                      }}>
                        {currStageStart && (
                          <span>开工&nbsp;<b style={{ color: '#555' }}>{fmtDate(currStageStart)}</b></span>
                        )}
                        {currStageStart && currStageEnd && (
                          <span style={{ color: '#ddd' }}>→</span>
                        )}
                        {currStageEnd && (
                          <span>预计完工&nbsp;<b style={{ color: '#1677ff' }}>{fmtDate(currStageEnd)}</b></span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {nextStageDef && currStageEnd && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  borderTop: '1px dashed #f0f0f0', marginTop: 3, paddingTop: 5,
                }}>
                  <span style={{ width: 28, color: '#bbb', flexShrink: 0, fontSize: 11 }}>
                    {nextStageDef.label}
                  </span>
                  <span style={{ fontSize: 11, color: '#888' }}>
                    预计开始&nbsp;<b style={{ color: '#555' }}>{fmtDate(currStageEnd)}</b>
                  </span>
                </div>
              )}
            </>
          )}

          {/* ④-b 无工序数据但整体进度 > 0：显示整体进度 + 预测 */}
          {!hasStagedData && prog > 0 && (
            <>
              <div style={{ color: '#bbb', fontSize: 10, marginBottom: 5, letterSpacing: 0.8 }}>
                整体进度&nbsp;
                <span style={{ color: '#333', fontSize: 11, fontWeight: 600 }}>{prog}%</span>
                <span style={{ color: '#bbb', marginLeft: 4 }}>（工序数据加载后显示详情）</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <div style={{ flex: 1, height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    width: `${prog}%`, height: '100%',
                    background: prog >= 60 ? '#1677ff' : '#fa8c16', borderRadius: 3,
                  }} />
                </div>
                <span style={{ fontSize: 11, color: '#333', fontWeight: 600, flexShrink: 0 }}>
                  {prog}%
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#888', paddingLeft: 2 }}>
                {orderStart && (
                  <span>已开工&nbsp;<b style={{ color: '#555' }}>{elap}</b>&nbsp;天</span>
                )}
                {overallEnd && (
                  <>
                    <span style={{ color: '#ddd', margin: '0 5px' }}>·</span>
                    <span>预计完成&nbsp;<b style={{ color: '#1677ff' }}>{fmtDate(overallEnd)}</b></span>
                  </>
                )}
              </div>
            </>
          )}

          {/* ④-c 完全无进度：待开工 */}
          {!hasStagedData && prog <= 0 && (
            <div style={{ color: '#bbb', fontSize: 11 }}>
              待开工
              {planEnd && (
                <span style={{ marginLeft: 8 }}>
                  ·&nbsp;计划交期&nbsp;<b style={{ color: '#555' }}>{fmtDate(planEnd)}</b>
                  <span style={{ color: '#bbb', marginLeft: 4 }}>
                    （还剩&nbsp;{Math.max(0, planEnd.diff(now, 'day'))}&nbsp;天）
                  </span>
                </span>
              )}
            </div>
          )}

          {/* ④-d 各工序均已完成 */}
          {hasStagedData && activeStages.length === 0 && doneStages.length === STAGES_DEF.length && (
            <div style={{ color: '#52c41a', fontSize: 11 }}>✓ 各工序全部完成</div>
          )}
        </div>
      )}

      {/* ⑤ 跟单 + 备注 */}
      {(order.merchandiser || (order as any).operationRemark) && (
        <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 5 }}>
          {order.merchandiser && (
            <div style={{ color: '#555' }}>
              <span style={{ color: '#bbb' }}>跟单&nbsp;</span>{order.merchandiser}
            </div>
          )}
          {(order as any).operationRemark && (
            <div style={{ color: '#555' }}>
              <span style={{ color: '#bbb' }}>备注&nbsp;</span>
              <span style={{ color: '#d46b08', background: 'rgba(250,173,20,0.1)', padding: '1px 4px', borderRadius: 3 }}>
                {(order as any).operationRemark}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartOrderHoverCard;
