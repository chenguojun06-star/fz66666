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

  /* 交期标签 */
  const deadline = useMemo(() => {
    if (isCompleted) return { text: '已完成', color: '#52c41a' };
    if (daysLeft === null) return null;
    if (daysLeft < 0) return { text: `逾期 ${-daysLeft} 天`, color: '#ff4d4f' };
    if (daysLeft === 0) return { text: '今天交货', color: '#ff4d4f' };
    if (daysLeft <= 3) return { text: `还剩 ${daysLeft} 天`, color: '#fa8c16' };
    return { text: `还剩 ${daysLeft} 天`, color: '#52c41a' };
  }, [isCompleted, daysLeft]);

  const hasAnyData = stages.some(s => s.qty > 0 || s.pct > 0);
  const prog = Number(order.productionProgress) || 0;

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

      {/* 工序逐行 */}
      {hasAnyData ? (
        <div>
          {stages.map(s => {
            const done       = s.pct >= 100;
            const active     = s.label === activeStage?.label;
            const notStarted = s.qty === 0 && s.pct === 0;
            return (
              <div key={s.label} style={{ marginBottom: 7 }}>
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
                  {/* 进度条 */}
                  <div style={{
                    flex: 1, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden',
                  }}>
                    {s.pct > 0 && (
                      <div style={{
                        width: `${Math.min(100, s.pct)}%`, height: '100%', borderRadius: 3,
                        background: done ? '#52c41a' : active ? '#1677ff' : '#d9d9d9',
                      }} />
                    )}
                  </div>
                  {/* 件数 */}
                  <span style={{
                    width: 56, textAlign: 'right', flexShrink: 0, fontSize: 11,
                    fontWeight: active ? 600 : 400,
                    color: done ? '#52c41a' : active ? '#333' : '#bbb',
                  }}>
                    {done && total > 0
                      ? `${total}件 ✓`
                      : active && s.qty > 0
                        ? `${s.qty}/${total}件`
                        : notStarted
                          ? '未开始'
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

