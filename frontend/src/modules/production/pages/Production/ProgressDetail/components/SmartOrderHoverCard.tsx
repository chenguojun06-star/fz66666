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

function getRate(o: ProductionOrder, key: string) {
  return Math.min(100, Math.max(0, Number((o as any)[key]) || 0));
}

// 风险：基于速度 vs 剩余天数动态推算
function calcRisk(o: ProductionOrder) {
  if (o.status === 'completed')
    return { label: '已完成', color: '#52c41a', bg: '#f6ffed' };
  const now   = dayjs();
  const end   = o.plannedEndDate ? dayjs(o.plannedEndDate) : null;
  const endDay = end ? end.diff(now, 'day') : null;
  const prog  = Number(o.productionProgress) || 0;
  const total = Number(o.orderQuantity) || 1;
  const done  = Number(o.completedQuantity) || 0;
  const start = o.createTime ? dayjs(o.createTime) : null;
  const elap  = start ? Math.max(1, now.diff(start, 'day')) : 1;
  const speed = done / elap;
  const need  = speed > 0 ? Math.ceil((total - done) / speed) : null;

  if (endDay !== null && endDay < 0)
    return { label: '已逾期', color: '#ff4d4f', bg: '#fff2f0' };
  if (need && endDay !== null && need > endDay + 3)
    return { label: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
  if (endDay !== null && endDay <= 5 && prog < 80)
    return { label: '⚠ 高风险', color: '#ff4d4f', bg: '#fff2f0' };
  if (endDay !== null && endDay <= 14 && prog < 50)
    return { label: '存在风险', color: '#fa8c16', bg: '#fffbe6' };
  if (prog >= 90)
    return { label: '即将完成', color: '#52c41a', bg: '#f6ffed' };
  return { label: '正常推进', color: '#1677ff', bg: '#f0f5ff' };
}

// 预测完成：有速度才显示，完成了不显示
function calcPredict(o: ProductionOrder) {
  if (o.status === 'completed') return null;
  const total = Number(o.orderQuantity) || 0;
  const done  = Number(o.completedQuantity) || 0;
  if (!total || !done) return null;
  const start = o.createTime ? dayjs(o.createTime) : null;
  if (!start) return null;
  const elap  = Math.max(1, dayjs().diff(start, 'day'));
  const speed = done / elap;
  const days  = Math.ceil((total - done) / speed);
  return { date: dayjs().add(days, 'day').format('MM-DD'), speed: `${speed.toFixed(1)}件/天` };
}

/** 速度缺口：需要多少天 vs 剩余多少天，差值 > 0 表示落后 */
function calcGap(o: ProductionOrder) {
  if (o.status === 'completed' || !o.plannedEndDate) return null;
  const total = Number(o.orderQuantity) || 0;
  const done  = Number(o.completedQuantity) || 0;
  const start = o.createTime ? dayjs(o.createTime) : null;
  if (!total || !start) return null;
  const elap  = Math.max(1, dayjs().diff(start, 'day'));
  const speed = done / elap;
  if (speed <= 0) return null;
  const needDays = Math.ceil((total - done) / speed);
  const endDays  = Math.max(0, dayjs(o.plannedEndDate).diff(dayjs(), 'day'));
  const gap      = needDays - endDays;
  if (gap <= 0) return null; // 进度正常，不显示
  return { needDays, endDays, gap };
}

function stageColor(v: number) {
  if (v >= 60) return '#1677ff';
  return '#fa8c16';
}

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const risk       = useMemo(() => calcRisk(order), [order]);
  const predict    = useMemo(() => calcPredict(order), [order]);
  const gap        = useMemo(() => calcGap(order), [order]);
  const isCompleted = order.status === 'completed';

  // 找卡住节点：取该订单最新扫码时间的节点，判断是否≥3天无进展
  const boardTimesByOrder = useProductionBoardStore(s => s.boardTimesByOrder);
  const stuckNode = useMemo(() => {
    if (order.status === 'completed') return null;
    const times = boardTimesByOrder[String(order.id)] ?? {};
    const entries = Object.entries(times);
    if (!entries.length) return null;
    const [nodeName, lastTime] = entries.reduce((a, b) =>
      dayjs(a[1]).isAfter(dayjs(b[1])) ? a : b
    );
    const days = dayjs().diff(dayjs(lastTime), 'day');
    return days >= 3 ? { node: nodeName, days } : null;
  }, [boardTimesByOrder, order.id, order.status]);

  // 只显示进行中的工序（1~99%）——完成了的隐藏，没开始的也隐藏
  const activeStages = useMemo(() =>
    STAGES_DEF.map(s => ({ ...s, val: getRate(order, s.key) }))
              .filter(s => s.val > 0 && s.val < 100),
  [order]);

  // 统计已完成工序数（供提示用）
  const doneCount = useMemo(() =>
    STAGES_DEF.filter(s => getRate(order, s.key) >= 100).length,
  [order]);

  return (
    <div style={{ width: 240, fontSize: 12, lineHeight: 1.6 }}>

      {/* 工厂名：有就显示 */}
      {order.factoryName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <span style={{ color: '#bbb', fontSize: 11 }}>工厂</span>
          <span style={{ color: '#333', fontWeight: 600, fontSize: 12 }}>{order.factoryName}</span>
        </div>
      )}

      {/* 状态条：风险级别 + 动态预测（只有进行中才显示预测） */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', background: risk.bg, borderRadius: 6, marginBottom: 8,
      }}>
        <span style={{ color: risk.color, fontWeight: 700 }}>{risk.label}</span>
        {predict && (
          <span style={{ color: '#888', fontSize: 11 }}>
            预计 <b style={{ color: '#333' }}>{predict.date}</b>
            &nbsp;·&nbsp;{predict.speed}
          </span>
        )}
      </div>

      {/* 速度缺口：需X天·剩Y天·差Z天（落后才显示） */}
      {gap && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', background: '#fff7e6', borderRadius: 5, marginBottom: 8,
          fontSize: 11, color: '#d46b08',
        }}>
          <span role="img" aria-label="gap">⏱</span>
          <span>需 <b>{gap.needDays}</b> 天</span>
          <span style={{ color: '#ccc' }}>·</span>
          <span>剩 <b>{gap.endDays}</b> 天</span>
          <span style={{ color: '#ccc' }}>·</span>
          <span style={{ color: '#ff4d4f', fontWeight: 700 }}>差 {gap.gap} 天</span>
        </div>
      )}

      {/* 卡住节点：最新扫码已≥3天无进展 */}
      {stuckNode && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', background: '#fff7e6', borderRadius: 5, marginBottom: 8,
          fontSize: 11, color: '#d46b08',
        }}>
          <span>⏸</span>
          <span>卡在 <b>{stuckNode.node}</b> · 已 <b>{stuckNode.days}</b> 天无进展</span>
        </div>
      )}

      {/* 进行中工序：完成了不显示，0%不显示，只显示 1~99% */}
      {activeStages.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#bbb', fontSize: 10, marginBottom: 4, letterSpacing: 0.8 }}>
            进行中
            {doneCount > 0 && (
              <span style={{ color: '#52c41a', marginLeft: 6 }}>✓ 已完成 {doneCount} 道</span>
            )}
          </div>
          {activeStages.map(s => (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <span style={{ width: 28, color: '#555', flexShrink: 0, fontSize: 11 }}>{s.label}</span>
              <div style={{ flex: 1, height: 5, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  width: `${s.val}%`, height: '100%',
                  background: stageColor(s.val), borderRadius: 3, transition: 'width 0.5s',
                }} />
              </div>
              <span style={{ width: 30, textAlign: 'right', fontSize: 11, color: '#333', fontWeight: 600 }}>
                {s.val}%
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 所有工序都 100% 但订单状态还未标完成 */}
      {activeStages.length === 0 && doneCount === STAGES_DEF.length && !isCompleted && (
        <div style={{ color: '#52c41a', fontSize: 11, marginBottom: 8 }}>✓ 各工序全部完成</div>
      )}

      {/* 尚未有任何工序开工 */}
      {activeStages.length === 0 && doneCount === 0 && !isCompleted && (
        <div style={{ color: '#bbb', fontSize: 11, marginBottom: 8 }}>待开工</div>
      )}

      {/* 跟单 + 备注：有内容才渲染，没有就不显示任何东西 */}
      {(order.merchandiser || order.operationRemark) && (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
          {order.merchandiser && (
            <div style={{ color: '#555' }}>
              <span style={{ color: '#bbb' }}>跟单&nbsp;</span>{order.merchandiser}
            </div>
          )}
          {order.operationRemark && (
            <div style={{ color: '#555' }}>
              <span style={{ color: '#bbb' }}>备注&nbsp;</span>
              <span style={{ color: '#d46b08', background: 'rgba(250,173,20,0.1)', padding: '1px 4px', borderRadius: 3 }}>
                {order.operationRemark}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartOrderHoverCard;
