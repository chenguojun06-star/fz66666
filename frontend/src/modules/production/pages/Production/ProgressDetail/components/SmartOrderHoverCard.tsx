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
  if (gap <= 0) return null;
  return { needDays, endDays, gap };
}

/**
 * 工序时间线预测
 * 算法：整体速度 = 已完成件数 / 已用天数
 * 当前工序已做比例 → 推算开工时间
 * 剩余比例 / 速度 → 预计完工时间
 * 下道工序开始 = 当前工序完工
 * 总计完成 = 今天 + 全部剩余件数 / 速度
 */
function calcTimeline(o: ProductionOrder, boardTimes: Record<string, string>) {
  if (o.status === 'completed') return null;
  const total = Number(o.orderQuantity) || 0;
  const done  = Number(o.completedQuantity) || 0;
  const now   = dayjs();
  const orderStart = o.createTime ? dayjs(o.createTime) : null;
  if (!total || !orderStart) return null;

  const elap  = Math.max(1, now.diff(orderStart, 'day'));
  const speed = done > 0 ? done / elap : 0; // 件/天

  // 找当前进行中工序（取第一个 1-99% 的）
  const activeList = STAGES_DEF
    .map(s => ({ ...s, rate: getRate(o, s.key) }))
    .filter(s => s.rate > 0 && s.rate < 100);

  const curr = activeList[0] ?? null;
  if (!curr) return speed > 0 ? {
    curr: null, next: null,
    overallEnd: now.add(Math.ceil((total - done) / speed), 'day'),
    speed,
  } : null;

  // 当前工序开工时间：
  //   已完成 rate% → 消耗天数 ≈ (rate/100 * total) / speed
  //   开工 = 今天 - 消耗天数
  //   若 boardTimes 有该工序数据，取 max(推算值, 最早合理值) 让结果更准
  let stageStart: dayjs.Dayjs | null = null;
  let stageEnd: dayjs.Dayjs | null = null;
  if (speed > 0) {
    const doneInStage = (curr.rate / 100) * total;
    const daysWorked  = doneInStage / speed;
    stageStart = now.subtract(Math.round(daysWorked), 'day');
    // 用 boardTimes 校正：若最近有扫码记录，且推算起始晚于扫码时间，以扫码时间为准
    const bt = boardTimes[curr.label];
    if (bt && dayjs(bt).isBefore(stageStart)) {
      stageStart = dayjs(bt);
    }
    const remaining = ((100 - curr.rate) / 100) * total;
    stageEnd = now.add(Math.ceil(remaining / speed), 'day');
  }

  // 找下道工序（当前之后第一个 0%）
  const currIdx = STAGES_DEF.findIndex(s => s.label === curr.label);
  const nextDef = STAGES_DEF.slice(currIdx + 1).find(s => getRate(o, s.key) === 0);
  const nextStage = nextDef ? { label: nextDef.label, start: stageEnd } : null;

  // 总体预计完成
  const overallEnd = speed > 0
    ? now.add(Math.ceil((total - done) / speed), 'day')
    : null;

  return { curr, stageStart, stageEnd, nextStage, overallEnd, speed };
}

function stageColor(v: number) {
  if (v >= 60) return '#1677ff';
  return '#fa8c16';
}

function fmtDate(d: dayjs.Dayjs | null) {
  if (!d) return '—';
  return d.format('MM-DD');
}

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const risk        = useMemo(() => calcRisk(order), [order]);
  const gap         = useMemo(() => calcGap(order), [order]);
  const isCompleted = order.status === 'completed';

  // boardTimes：取当前订单的各节点最后扫码时间
  const boardTimesByOrder = useProductionBoardStore(s => s.boardTimesByOrder);
  const boardTimes = boardTimesByOrder[String(order.id)] ?? {};

  // 找卡住节点：≥3天无进展
  const stuckNode = useMemo(() => {
    if (order.status === 'completed') return null;
    const entries = Object.entries(boardTimes);
    if (!entries.length) return null;
    const [nodeName, lastTime] = entries.reduce((a, b) =>
      dayjs(a[1]).isAfter(dayjs(b[1])) ? a : b
    );
    const days = dayjs().diff(dayjs(lastTime), 'day');
    return days >= 3 ? { node: nodeName, days } : null;
  }, [boardTimes, order.status]);

  // 工序时间线预测
  const timeline = useMemo(
    () => calcTimeline(order, boardTimes),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, boardTimes],
  );

  // 进行中工序列表（用于进度条）
  const activeStages = useMemo(() =>
    STAGES_DEF.map(s => ({ ...s, val: getRate(order, s.key) }))
              .filter(s => s.val > 0 && s.val < 100),
  [order]);

  const doneCount = useMemo(() =>
    STAGES_DEF.filter(s => getRate(order, s.key) >= 100).length,
  [order]);

  return (
    <div style={{ width: 255, fontSize: 12, lineHeight: 1.6 }}>

      {/* 工厂名 */}
      {order.factoryName && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <span style={{ color: '#bbb', fontSize: 11 }}>工厂</span>
          <span style={{ color: '#333', fontWeight: 600, fontSize: 12 }}>{order.factoryName}</span>
        </div>
      )}

      {/* 状态条：风险级别 + 总体预计完成日期 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', background: risk.bg, borderRadius: 6, marginBottom: 8,
      }}>
        <span style={{ color: risk.color, fontWeight: 700 }}>{risk.label}</span>
        {timeline?.overallEnd && !isCompleted && (
          <span style={{ color: '#888', fontSize: 11 }}>
            总完成 <b style={{ color: '#333' }}>{fmtDate(timeline.overallEnd)}</b>
            {timeline.speed > 0 && (
              <span style={{ color: '#bbb' }}>&nbsp;·&nbsp;{timeline.speed.toFixed(1)}件/天</span>
            )}
          </span>
        )}
      </div>

      {/* 速度缺口：落后才显示 */}
      {gap && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 10px', background: '#fff7e6', borderRadius: 5, marginBottom: 8,
          fontSize: 11, color: '#d46b08',
        }}>
          <span>⏱</span>
          <span>需 <b>{gap.needDays}</b> 天</span>
          <span style={{ color: '#ccc' }}>·</span>
          <span>剩 <b>{gap.endDays}</b> 天</span>
          <span style={{ color: '#ccc' }}>·</span>
          <span style={{ color: '#ff4d4f', fontWeight: 700 }}>差 {gap.gap} 天</span>
        </div>
      )}

      {/* 卡住节点 */}
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

      {/* 工序时间线：进行中工序 + 下道预测 */}
      {activeStages.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#bbb', fontSize: 10, marginBottom: 5, letterSpacing: 0.8 }}>
            工序进展
            {doneCount > 0 && (
              <span style={{ color: '#52c41a', marginLeft: 6 }}>✓ {doneCount} 道已完成</span>
            )}
          </div>

          {/* 当前进行中工序：进度条 + 开工→完工时间 */}
          {activeStages.map(s => {
            const isCurr = timeline?.curr?.label === s.label;
            return (
              <div key={s.key} style={{ marginBottom: 7 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                {/* 开工时间 → 预计完工时间 */}
                {isCurr && (timeline?.stageStart || timeline?.stageEnd) && (
                  <div style={{ paddingLeft: 34, fontSize: 11, color: '#888', marginTop: 1 }}>
                    {timeline.stageStart && (
                      <span>开工 <b style={{ color: '#555' }}>{fmtDate(timeline.stageStart)}</b></span>
                    )}
                    {timeline.stageStart && timeline.stageEnd && (
                      <span style={{ color: '#ddd', margin: '0 4px' }}>→</span>
                    )}
                    {timeline.stageEnd && (
                      <span>预计完工 <b style={{ color: '#1677ff' }}>{fmtDate(timeline.stageEnd)}</b></span>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* 下道工序预计开始 */}
          {timeline?.nextStage && timeline.nextStage.start && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '3px 0 0 0', borderTop: '1px dashed #f0f0f0', marginTop: 4, paddingTop: 5,
            }}>
              <span style={{ width: 28, color: '#bbb', flexShrink: 0, fontSize: 11 }}>
                {timeline.nextStage.label}
              </span>
              <span style={{ fontSize: 11, color: '#888' }}>
                预计开始 <b style={{ color: '#555' }}>{fmtDate(timeline.nextStage.start)}</b>
              </span>
            </div>
          )}
        </div>
      )}

      {activeStages.length === 0 && doneCount === STAGES_DEF.length && !isCompleted && (
        <div style={{ color: '#52c41a', fontSize: 11, marginBottom: 8 }}>✓ 各工序全部完成</div>
      )}

      {activeStages.length === 0 && doneCount === 0 && !isCompleted && (
        <div style={{ color: '#bbb', fontSize: 11, marginBottom: 8 }}>待开工</div>
      )}

      {/* 跟单 + 备注 */}
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
