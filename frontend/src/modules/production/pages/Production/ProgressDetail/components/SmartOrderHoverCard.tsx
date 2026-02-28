import React, { useMemo } from 'react';
import dayjs from 'dayjs';
import type { ProductionOrder } from '@/types/production';

interface Props {
  order: ProductionOrder;
}

// 风险计算：基于速度倒推是否能按时完成
function calcRisk(o: ProductionOrder) {
  if (o.status === 'completed') return { label: '已完成', color: '#52c41a', bg: 'rgba(82,196,26,0.08)' };
  const now = dayjs();
  const end = o.plannedEndDate ? dayjs(o.plannedEndDate) : null;
  const remaining = end ? end.diff(now, 'day') : null;
  const progress = Number(o.productionProgress) || 0;
  const total = Number(o.orderQuantity) || 1;
  const done = Number(o.completedQuantity) || 0;
  const start = o.createTime ? dayjs(o.createTime) : null;
  const elapsed = start ? Math.max(1, now.diff(start, 'day')) : 1;
  const speed = done / elapsed;
  const needDays = speed > 0 ? Math.ceil((total - done) / speed) : null;
  const endDays = end ? end.diff(now, 'day') : null;

  if (remaining !== null && remaining < 0)
    return { label: '已逾期', color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)' };
  if (needDays !== null && endDays !== null && needDays > endDays + 3)
    return { label: '高风险', color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)' };
  if (remaining !== null && remaining <= 5 && progress < 80)
    return { label: '高风险', color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)' };
  if (remaining !== null && remaining <= 14 && progress < 50)
    return { label: '存在风险', color: '#fa8c16', bg: 'rgba(250,140,22,0.08)' };
  if (progress >= 90)
    return { label: '按时完成', color: '#52c41a', bg: 'rgba(82,196,26,0.08)' };
  return { label: '正常推进', color: '#1677ff', bg: 'rgba(22,119,255,0.08)' };
}

// 预测完成日期：基于实际生产速度动态推算
function calcPredict(o: ProductionOrder): { date: string; speed: string } {
  if (o.status === 'completed') return { date: '已完成', speed: '' };
  const total = Number(o.orderQuantity) || 0;
  const done = Number(o.completedQuantity) || 0;
  if (total === 0) return { date: '-', speed: '' };
  if (done === 0) return { date: '待开始', speed: '' };
  const start = o.createTime ? dayjs(o.createTime) : null;
  if (!start) return { date: '-', speed: '' };
  const elapsed = Math.max(1, dayjs().diff(start, 'day'));
  const speed = done / elapsed;
  const remaining = total - done;
  const days = Math.ceil(remaining / speed);
  return {
    date: dayjs().add(days, 'day').format('MM-DD'),
    speed: `${speed.toFixed(1)}件/天`,
  };
}

const STAGES = [
  { key: 'procurementCompletionRate', label: '采购' },
  { key: 'cuttingCompletionRate',     label: '裁剪' },
  { key: 'sewingCompletionRate',      label: '车缝' },
  { key: 'qualityCompletionRate',     label: '质检' },
  { key: 'warehousingCompletionRate', label: '入库' },
] as const;

function stageColor(v: number) {
  if (v >= 100) return '#52c41a';
  if (v >= 60)  return '#1677ff';
  if (v > 0)    return '#fa8c16';
  return '#e8e8e8';
}

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const risk    = useMemo(() => calcRisk(order), [order]);
  const predict = useMemo(() => calcPredict(order), [order]);

  return (
    <div style={{ width: 250, fontSize: 12, lineHeight: 1.5 }}>

      {/* 顶部：风险级别 + 预测完成 */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px', background: risk.bg, borderRadius: 6, marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: risk.color, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ color: risk.color, fontWeight: 700 }}>{risk.label}</span>
        </div>
        <div style={{ color: '#555' }}>
          预计&nbsp;<span style={{ color: '#222', fontWeight: 600 }}>{predict.date}</span>
          {predict.speed && (
            <span style={{ color: '#999', marginLeft: 4 }}>·&nbsp;{predict.speed}</span>
          )}
        </div>
      </div>

      {/* 工序进度 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ color: '#aaa', fontSize: 11, marginBottom: 5, letterSpacing: 1 }}>工序进度</div>
        {STAGES.map(s => {
          const val = Math.min(100, Math.max(0, Number((order as any)[s.key]) || 0));
          const color = stageColor(val);
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ width: 28, color: '#666', flexShrink: 0, fontSize: 11 }}>{s.label}</span>
              <div style={{ flex: 1, height: 4, background: '#f0f0f0', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${val}%`, height: '100%', background: color,
                  borderRadius: 2, transition: 'width 0.6s cubic-bezier(.4,0,.2,1)',
                }} />
              </div>
              <span style={{
                width: 30, textAlign: 'right', fontSize: 11,
                color: val >= 100 ? '#52c41a' : val > 0 ? '#333' : '#ccc',
                fontWeight: val >= 100 ? 700 : 400,
              }}>{val}%</span>
            </div>
          );
        })}
      </div>

      {/* 跟单 + 备注 */}
      <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 8 }}>
        {order.merchandiser ? (
          <div style={{ color: '#555', marginBottom: 4 }}>
            <span style={{ color: '#aaa' }}>跟单&nbsp;</span>{order.merchandiser}
          </div>
        ) : null}
        {order.operationRemark ? (
          <div style={{ color: '#555' }}>
            <span style={{ color: '#aaa' }}>备注&nbsp;</span>
            <span style={{
              color: '#d46b08', background: 'rgba(250,173,20,0.08)',
              padding: '1px 4px', borderRadius: 3,
            }}>{order.operationRemark}</span>
          </div>
        ) : null}
        {!order.merchandiser && !order.operationRemark && (
          <div style={{ color: '#ccc', fontSize: 11 }}>暂无跟单备注</div>
        )}
      </div>
    </div>
  );
};

export default SmartOrderHoverCard;
