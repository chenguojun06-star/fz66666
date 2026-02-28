/**
 * SmartOrderHoverCard v5 (2026-02-28)
 * 重新设计：聚焦"每道工序做了多少件"，去掉没意义的抽象文字
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

function fieldRate(o: ProductionOrder, key: string): number {
  return Math.min(100, Math.max(0, Number((o as any)[key]) || 0));
}

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const boardTimesByOrder = useProductionBoardStore(s => s.boardTimesByOrder);
  const boardStatsByOrder = useProductionBoardStore(s => s.boardStatsByOrder);
  const boardStats = boardStatsByOrder[String(order.id)] ?? null;
  const boardTimes = boardTimesByOrder[String(order.id)] ?? {};

  const total       = Number(order.orderQuantity) || 0;
  const isCompleted = order.status === 'completed';
  const now         = dayjs();
  const planEnd     = order.plannedEndDate ? dayjs(order.plannedEndDate) : null;
  const daysLeft    = planEnd ? planEnd.diff(now, 'day') : null;

  /* 每道工序件数 + 百分比 */
  const stages = useMemo(() => STAGES_DEF.map(s => {
    const fromBoard  = boardStats ? ((boardStats as Record<string, number>)[s.label] ?? 0) : 0;
    const fromField  = fieldRate(order, s.key);
    const qty = fromBoard > 0 ? fromBoard
              : fromField > 0 && total > 0 ? Math.round(fromField / 100 * total)
              : 0;
    const pct = fromBoard > 0 && total > 0
              ? Math.min(100, Math.round(fromBoard / total * 100))
              : fromField;
    const lastTime = boardTimes[s.label]
      ? dayjs(boardTimes[s.label]).format('MM-DD HH:mm') : null;
    return { label: s.label, qty, pct, lastTime };
  }), [order, boardStats, boardTimes, total]);

  const activeStage = stages.find(s => s.pct > 0 && s.pct < 100);

  /* 卡住检测 */
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

  const prog = Number(order.productionProgress) || 0;

  /* 交期标签 + 风险标签 */
  const deadline = useMemo(() => {
    if (isCompleted) return { text: '已完成', color: '#52c41a' };
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: `逾期 ${-daysLeft} 天`, color: '#ff4d4f' };
    if (daysLeft === 0) return { text: '今天交货', color: '#ff4d4f' };
    if (daysLeft <= 3) return { text: `还剩 ${daysLeft} 天`, color: '#fa8c16' };
    return { text: `还剩 ${daysLeft} 天`, color: '#52c41a' };
  }, [isCompleted, daysLeft]);

  const risk = useMemo(() => {
    if (isCompleted) return null;
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: '已逾期', color: '#ff4d4f', bg: '#fff2f0' };
    if (daysLeft <= 3 && prog < 80) return { text: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
    if (daysLeft <= 7 && prog < 50) return { text: '存在风险', color: '#fa8c16', bg: '#fffbe6' };
    if (daysLeft <= 14 && prog < 30) return { text: '需关注', color: '#fa8c16', bg: '#fffbe6' };
    return null;
  }, [isCompleted, daysLeft, prog]);

  /**
   * 最多显示4条：有进展的最后2条（已完成/进行中）+ 未开始的前2条（预测）
   * 动态根据扫码速度预测未开始工序的开始日期
   */
  const visibleStages = useMemo(() => {
    const withProgress = stages.filter(s => s.pct > 0 || s.qty > 0);
    const notStarted   = stages.filter(s => s.pct === 0 && s.qty === 0);
    // 有进展：取最后最多2条（最靠近当前）
    const doneSlice = withProgress.slice(-2);
    // 未开始：取最前最多2条
    const nextSlice = notStarted.slice(0, 2);
    return [...doneSlice, ...nextSlice];
  }, [stages]);

  // 速度：优先用 completedQuantity，其次 productionProgress 推算，最后看 boardStats 之和
  // 不依赖 activeStage，一旦有历史完成量就能算
  const speed = useMemo(() => {
    const orderStart = order.createTime ? dayjs(order.createTime) : null;
    const elap = orderStart ? Math.max(1, now.diff(orderStart, 'day')) : 1;
    const completedQty = Number(order.completedQuantity) || 0;
    const fromProg = prog > 0 && total > 0 ? Math.round(prog / 100 * total) : 0;
    const fromBoard = boardStats
      ? Object.values(boardStats as Record<string, number>).reduce((s, v) => s + (v ?? 0), 0)
      : 0;
    const done = Math.max(completedQty, fromProg, fromBoard);
    return done > 0 && elap > 0 ? done / elap : 0;
  }, [order, prog, total, boardStats, now]);

  // 距下一道工序可开始的天数
  // - 有进行中工序 → 等当前工序完成（剩余件数/速度）
  // - 已完成工序都完成但无进行中 → 预测从今天开始
  const activeRemainDays = useMemo(() => {
    if (!activeStage) return 0; // 无进行中，下一道立即可排
    if (speed <= 0 || total <= 0) return 3; // 速度未知，保守估3天
    return Math.ceil(Math.max(0, total - activeStage.qty) / speed);
  }, [activeStage, speed, total]);

  const hasAnyData = stages.some(s => s.qty > 0 || s.pct > 0);

  /* ─────── RENDER ─────── */
  return (
    <div style={{ width: 260, fontSize: 12, lineHeight: 1.5 }}>

      {/* 顶部：工厂 + 交期 */}
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

      {/* 风险条 */}
      {risk && (
        <div style={{
          padding: '4px 10px', background: risk.bg, borderRadius: 6,
          marginBottom: 8, fontSize: 11, color: risk.color, fontWeight: 700,
        }}>
          {risk.text}
          {speed > 0 && total > 0 && daysLeft !== null && daysLeft >= 0 && (
            <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
              当前 {speed.toFixed(1)} 件/天，还需约 {Math.ceil((total - Math.round(prog / 100 * total)) / speed)} 天
            </span>
          )}
        </div>
      )}

      {/* 工序逐行（最多4条） */}
      {hasAnyData ? (
        <div>
          {visibleStages.map((s, idx) => {
            const done       = s.pct >= 100;
            const active     = s.label === activeStage?.label;
            const notStarted = s.qty === 0 && s.pct === 0;

            // 未开始工序的预计开始日：按顺序叠加
            // notStartedIdx = 在未开始序列中是第几个（0或1）
            const notStartedIdx = notStarted
              ? visibleStages.slice(0, idx).filter(x => x.pct === 0 && x.qty === 0).length
              : -1;
            const predictStart = notStarted && speed > 0
              ? now.add(activeRemainDays + notStartedIdx * Math.ceil(total / Math.max(speed, 0.1)), 'day')
              : null;

            // 是否是预测区（有分隔线）
            const isFirstPrediction = notStarted && idx > 0 && visibleStages[idx - 1].pct > 0;

            return (
              <React.Fragment key={s.label}>
                {isFirstPrediction && (
                  <div style={{
                    borderTop: '1px dashed #e8e8e8', margin: '4px 0 6px',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 10, color: '#bbb', whiteSpace: 'nowrap', paddingTop: 2 }}>
                      预测
                    </span>
                  </div>
                )}
                <div style={{ marginBottom: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {/* 状态图标 */}
                    <span style={{
                      width: 14, fontSize: 11, textAlign: 'center', flexShrink: 0,
                      color: done ? '#52c41a' : active ? '#1677ff' : '#d9d9d9',
                    }}>
                      {done ? '✓' : active ? '▶' : '○'}
                    </span>
                    {/* 工序名 */}
                    <span style={{
                      width: 26, flexShrink: 0,
                      fontWeight: active || done ? 600 : 400,
                      color: done ? '#52c41a' : active ? '#1677ff' : notStarted ? '#bbb' : '#555',
                    }}>
                      {s.label}
                    </span>
                    {/* 进度条（未开始显示虚线占位） */}
                    <div style={{
                      flex: 1, height: 5, background: '#f5f5f5', borderRadius: 3, overflow: 'hidden',
                    }}>
                      {s.pct > 0 && (
                        <div style={{
                          width: `${Math.min(100, s.pct)}%`, height: '100%', borderRadius: 3,
                          background: done ? '#52c41a' : active ? '#1677ff' : '#d9d9d9',
                        }} />
                      )}
                    </div>
                    {/* 件数 or 预测日期 */}
                    <span style={{
                      width: 60, textAlign: 'right', flexShrink: 0, fontSize: 11,
                      fontWeight: active ? 600 : 400,
                      color: done ? '#52c41a' : active ? '#333' : '#bbb',
                    }}>
                      {done && total > 0
                        ? `${total}件 ✓`
                        : active && s.qty > 0
                          ? `${s.qty}/${total}件`
                          : notStarted && predictStart
                            ? `约 ${predictStart.format('MM-DD')}`
                            : notStarted
                              ? '待安排'
                              : s.qty > 0 ? `${s.qty}件` : `${s.pct}%`
                      }
                    </span>
                  </div>
                  {/* 当前工序最近扫码时间 */}
                  {active && s.lastTime && (
                    <div style={{ paddingLeft: 46, fontSize: 10, color: '#aaa', marginTop: 1 }}>
                      最近扫码&nbsp;{s.lastTime}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
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
