/**
 * SmartOrderHoverCard 预警信息组
 *  - AI 预测完工
 *  - 风险条（含速度/剩余天数提示）
 *  - 次品预警
 *  - 交付 SLA + SPC 质检统计（Cpk/Ppk）
 *  - 今日任务标签
 */
import React from 'react';
import type { ProductionOrder } from '@/types/production';
import type { PredictHint } from '../useSmartOrderHoverCardData';

interface Props {
  order: ProductionOrder;
  predictHint: PredictHint | null;
  risk: { text: string; color: string; bg: string } | null;
  speed: number;
  total: number;
  daysLeft: number | null;
  prog: number;
  todayTask: { target: number; color: string; label: string } | null;
}

const AlertsSection: React.FC<Props> = ({
  order,
  predictHint,
  risk,
  speed,
  total,
  daysLeft,
  prog,
  todayTask,
}) => (
  <>
    {/* AI 预测完工 */}
    {predictHint && (
      <div style={{
        padding: '3px 10px', background: '#f0f5ff', borderRadius: 6,
        marginBottom: 8, fontSize: 11, color: 'var(--color-primary)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span></span>
        <span>AI预测完工 <b>{predictHint.text}</b></span>
        {predictHint.confidence && <span style={{ color: 'var(--color-text-tertiary)' }}>置信{predictHint.confidence}</span>}
        {predictHint.remaining > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>剩{predictHint.remaining}件</span>}
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

    {/* 次品预警 - 有次品才显示 */}
    {(order.unqualifiedQuantity ?? 0) > 0 && (
      <div style={{
        padding: '3px 10px', background: '#F6FFED', borderRadius: 6,
        marginBottom: 8, fontSize: 11, color: 'var(--color-danger)', fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 5,
      }}>
        <span></span>
        <span>次品 {order.unqualifiedQuantity} 件，请核查质检记录</span>
      </div>
    )}

    {/* 交付SLA + SPC质检统计 */}
    {(order.deliverySlaStatus || (order as any).cpk) && (
      <div style={{
        padding: '4px 10px', background: '#f0f5ff', borderRadius: 6,
        marginBottom: 8, fontSize: 11, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
      }}>
        {order.deliverySlaStatus && (
          <span style={{
            padding: '1px 6px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: order.deliverySlaStatus === 'completed' ? '#f6ffed' :
                       order.deliverySlaStatus === 'on_track' ? '#e6f4ff' :
                       order.deliverySlaStatus === 'at_risk' ? '#FFF7E6' : '#F6FFED',
            color: order.deliverySlaStatus === 'completed' ? '#389e0d' :
                   order.deliverySlaStatus === 'on_track' ? 'var(--color-primary)' :
                   order.deliverySlaStatus === 'at_risk' ? 'var(--color-warning)' : 'var(--color-danger)',
          }}>
            SLA: {order.deliverySlaStatus === 'completed' ? '达标' :
                  order.deliverySlaStatus === 'on_track' ? '正常' :
                  order.deliverySlaStatus === 'at_risk' ? '预警' : '超期'}
            {order.actualDeliveryDays != null && ` ${order.actualDeliveryDays}天`}
          </span>
        )}
        {(order as any).cpk != null && (
          <span style={{
            padding: '1px 6px', borderRadius: 8, fontSize: 11, fontWeight: 600,
            background: (order as any).cpk >= 1.33 ? '#f6ffed' : (order as any).cpk >= 1.0 ? '#FFF7E6' : '#F6FFED',
            color: (order as any).cpk >= 1.33 ? '#389e0d' : (order as any).cpk >= 1.0 ? 'var(--color-warning)' : 'var(--color-danger)',
          }}>
            Cpk {(order as any).cpk}{(order as any).ppk != null && ` / Ppk ${(order as any).ppk}`}
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
        <span></span>
        <span style={{ fontWeight: 700, color: todayTask.color }}>
          今日需≥{todayTask.target}件
        </span>
        <span style={{ color: 'var(--color-text-tertiary)' }}>才能按时交货</span>
        <span style={{
          background: todayTask.color + '28',
          color: todayTask.color,
          padding: '0 5px', borderRadius: 8, fontSize: 11, fontWeight: 600,
        }}>
          {todayTask.label}
        </span>
      </div>
    )}
  </>
);

export default React.memo(AlertsSection);
