/**
 * OrderProgressCard - 订单进度卡片组件（智能悬停预测版）
 * 功能：显示订单基本信息、进度条、操作按钮
 *       鼠标悬停时右侧展开智能预测面板（完成日期/速度/风险）
 */
import React, { useState, useRef } from 'react';
import { Tag, Button, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';

import { ProductionOrder } from '@/types/production';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { calcSmartPrediction, fmtDate, fmtBuffer } from '../utils/smartPredict';

interface OrderProgressCardProps {
  order: ProductionOrder;
  onViewDetail: (order: ProductionOrder) => void;
  onScan?: (order: ProductionOrder) => void;
  onRollback?: (order: ProductionOrder) => void;
  onQuickEdit?: (order: ProductionOrder) => void;
}

const STATUS_CONFIG: Record<string, { text: string; color: string; bg: string }> = {
  pending:     { text: '待生产', color: '#8c8c8c', bg: '#f5f5f5' },
  in_progress: { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  production:  { text: '生产中', color: '#1677ff', bg: '#e6f4ff' },
  completed:   { text: '已完成', color: '#52c41a', bg: '#f6ffed' },
  delayed:     { text: '已逾期', color: '#fa8c16', bg: '#fff7e6' },
  cancelled:   { text: '已取消', color: '#ff4d4f', bg: '#fff2f0' },
  canceled:    { text: '已取消', color: '#ff4d4f', bg: '#fff2f0' },
  paused:      { text: '已暂停', color: '#8c8c8c', bg: '#f5f5f5' },
  returned:    { text: '已退回', color: '#ff4d4f', bg: '#fff2f0' },
};

const RISK_CONFIG = {
  safe:      { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',  icon: <CheckCircleOutlined />,   label: '按时完成' },
  warning:   { color: '#fa8c16', bg: 'rgba(250,140,22,0.08)', icon: <WarningOutlined />,       label: '存在风险' },
  danger:    { color: '#ff4d4f', bg: 'rgba(255,77,79,0.08)',  icon: <ThunderboltOutlined />,   label: '高危预警' },
  completed: { color: '#52c41a', bg: 'rgba(82,196,26,0.08)',  icon: <CheckCircleOutlined />,   label: '已完成'   },
  unknown:   { color: '#8c8c8c', bg: 'rgba(140,140,140,0.08)',icon: <QuestionCircleOutlined />, label: '待开始'  },
};

const OrderProgressCard: React.FC<OrderProgressCardProps> = ({
  order,
  onViewDetail,
  onScan,
  onRollback,
  onQuickEdit,
}) => {
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const statusCfg = STATUS_CONFIG[order.status] || { text: order.status, color: '#8c8c8c', bg: '#f5f5f5' };

  const pred = calcSmartPrediction({
    orderQuantity: order.orderQuantity,
    completedQuantity: order.completedQuantity || 0,
    productionProgress: order.productionProgress || 0,
    createTime: order.createTime,
    plannedEndDate: order.plannedEndDate,
    status: order.status,
  });

  const riskCfg = RISK_CONFIG[pred.risk];
  const progress = Math.min(100, Math.max(0, order.productionProgress || 0));

  // 进度条颜色
  const progressColor =
    pred.risk === 'danger'    ? '#ff4d4f' :
    pred.risk === 'warning'   ? '#fa8c16' :
    pred.risk === 'completed' ? '#52c41a' : '#1677ff';

  const handleMouseEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(true), 120);
  };
  const handleMouseLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => setHovered(false), 80);
  };

  return (
    <div
      style={{ position: 'relative', marginBottom: 12 }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── 主卡片 ── */}
      <div
        onClick={() => onViewDetail(order)}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '14px 16px',
          cursor: 'pointer',
          border: `1.5px solid ${hovered ? progressColor + '55' : '#f0f0f0'}`,
          boxShadow: hovered
            ? `0 6px 24px rgba(0,0,0,0.10), 0 2px 8px ${progressColor}22`
            : '0 1px 4px rgba(0,0,0,0.06)',
          transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
          transition: 'all 0.22s cubic-bezier(.4,0,.2,1)',
          display: 'flex',
          gap: 14,
        }}
      >
        {/* 图片 */}
        <div style={{ flexShrink: 0 }}>
          <StyleCoverThumb
            styleNo={order.styleNo}
            src={order.styleCover}
            size={76}
            borderRadius={8}
          />
        </div>

        {/* 主信息区 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* 标题行 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', letterSpacing: 0.3 }}>
              {order.orderNo}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 20,
              color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}33`,
            }}>
              {statusCfg.text}
            </span>
            {/* 风险小标 */}
            {(pred.risk !== 'unknown' && pred.risk !== 'completed') && (
              <Tooltip title={pred.riskLabel}>
                <span style={{
                  fontSize: 11, padding: '1px 7px', borderRadius: 20, cursor: 'default',
                  color: riskCfg.color, background: riskCfg.bg,
                }}>
                  {riskCfg.icon} {riskCfg.label}
                </span>
              </Tooltip>
            )}
          </div>

          {/* 数据格 */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '4px 0', fontSize: 12, color: '#595959', marginBottom: 10,
          }}>
            {[
              ['款号', order.styleNo],
              ['款名', order.styleName || '-'],
              ['工厂', order.factoryName || '-'],
              ['交期', order.plannedEndDate ? order.plannedEndDate.slice(0, 10) : '-'],
              ['总量', String(order.orderQuantity)],
              ['完成', String(order.completedQuantity || 0)],
              ['入库', String(order.warehousingQualifiedQuantity || 0)],
              ['速度', pred.dailyRate > 0 ? `${pred.dailyRate}件/天` : '-'],
            ].map(([k, v]) => (
              <div key={k}>
                <span style={{ color: '#8c8c8c' }}>{k}：</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>

          {/* 进度条 */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#8c8c8c' }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {pred.estimatedDate
                  ? `预计 ${fmtDate(pred.estimatedDate)} 完成`
                  : '生产进度'}
              </span>
              <span style={{ fontSize: 12, fontWeight: 700, color: progressColor }}>
                {progress}%
              </span>
            </div>
            {/* 自定义进度条 */}
            <div style={{ height: 6, borderRadius: 99, background: '#f0f0f0', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: `linear-gradient(90deg, ${progressColor}99, ${progressColor})`,
                borderRadius: 99,
                transition: 'width 0.6s ease',
                position: 'relative',
              }}>
                {/* 高光 */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
                  background: 'rgba(255,255,255,0.3)', borderRadius: 99,
                }} />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧操作 */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          justifyContent: 'center', flexShrink: 0,
          opacity: hovered ? 1 : 0.6,
          transition: 'opacity 0.2s',
        }}>
          <Button size="small" type="primary" ghost
            onClick={(e) => { e.stopPropagation(); onViewDetail(order); }}>
            详情
          </Button>
          {onScan && (
            <Button size="small"
              onClick={(e) => { e.stopPropagation(); onScan(order); }}>
              扫码
            </Button>
          )}
          {onRollback && (
            <Button size="small" danger ghost
              onClick={(e) => { e.stopPropagation(); onRollback(order); }}>
              回退
            </Button>
          )}
          {onQuickEdit && (
            <Button size="small"
              onClick={(e) => { e.stopPropagation(); onQuickEdit(order); }}>
              编辑
            </Button>
          )}
        </div>
      </div>

      {/* ── 悬停智能预测面板 ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: hovered ? -232 : -220,
          width: 220,
          background: '#fff',
          borderRadius: 12,
          padding: '14px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
          border: `1.5px solid ${progressColor}33`,
          opacity: hovered ? 1 : 0,
          pointerEvents: hovered ? 'auto' : 'none',
          transition: 'opacity 0.2s ease, right 0.22s cubic-bezier(.4,0,.2,1)',
          zIndex: 100,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* 标题 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: riskCfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: riskCfg.color, fontSize: 14,
          }}>
            {riskCfg.icon}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>智能预测</div>
            <div style={{ fontSize: 11, color: riskCfg.color }}>{pred.riskLabel}</div>
          </div>
        </div>

        {/* 分隔线 */}
        <div style={{ height: 1, background: '#f0f0f0', margin: '0 -16px 12px' }} />

        {/* 数据行 */}
        {[
          {
            icon: '📅',
            label: '预计完成',
            value: pred.estimatedDate ? fmtDate(pred.estimatedDate) : '—',
            highlight: pred.risk === 'danger',
          },
          {
            icon: '⏱',
            label: '还需天数',
            value: pred.daysNeeded >= 0 ? `${pred.daysNeeded} 天` : '—',
          },
          {
            icon: '⚡',
            label: '当前速度',
            value: pred.dailyRate > 0 ? `${pred.dailyRate} 件/天` : '—',
          },
          {
            icon: '📦',
            label: '剩余件数',
            value: `${pred.remainingQty} 件`,
          },
          {
            icon: '🎯',
            label: '交期余量',
            value: fmtBuffer(pred.bufferDays),
            highlight: pred.bufferDays !== null && pred.bufferDays < 0,
            positive: pred.bufferDays !== null && pred.bufferDays >= 5,
          },
          {
            icon: '📆',
            label: '已生产',
            value: `${pred.elapsedDays} 天`,
          },
        ].map(({ icon, label, value, highlight, positive }) => (
          <div key={label} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 8,
          }}>
            <span style={{ fontSize: 12, color: '#8c8c8c' }}>
              <span style={{ marginRight: 5 }}>{icon}</span>{label}
            </span>
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: highlight ? '#ff4d4f' : positive ? '#52c41a' : '#262626',
            }}>
              {value}
            </span>
          </div>
        ))}

        {/* 底部分隔 + 点击提示 */}
        <div style={{ height: 1, background: '#f0f0f0', margin: '8px -16px 8px' }} />
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 4, fontSize: 11, color: '#1677ff', cursor: 'pointer',
          }}
          onClick={() => onViewDetail(order)}
        >
          查看完整进度 <RightOutlined style={{ fontSize: 10 }} />
        </div>
      </div>
    </div>
  );
};

export default OrderProgressCard;
