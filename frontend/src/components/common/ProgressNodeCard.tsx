import React from 'react';
import { InputNumber, Button } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';

export interface ProgressNodeCardProps {
  /** 节点名称 */
  name: string;
  /** 已完成数量 */
  done: number;
  /** 总数量 */
  total: number;
  /** 完成百分比 */
  percent: number;
  /** 单价 */
  unitPrice: number;
  /** 是否完成 */
  isDone: boolean;
  /** 是否当前节点 */
  isCurrent: boolean;
  /** 是否冻结 */
  isFrozen: boolean;
  /** 是否可编辑 */
  canEdit: boolean;
  /** 单价变更回调 */
  onPriceChange?: (value: number) => void;
  /** 删除节点回调 */
  onDelete?: () => void;
  /** 自定义样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
}

/**
 * 紧凑型进度节点卡片组件
 * 
 * 用于在生产进度详情页面展示每个工序节点的进度和单价
 * 
 * 特点：
 * - 尺寸缩小为原来的1/2
 * - 进度条和单价分开显示
 * - 支持拖拽排序
 * - 统一的视觉风格
 */
export const ProgressNodeCard: React.FC<ProgressNodeCardProps> = ({
  name,
  done,
  total,
  percent,
  unitPrice,
  isDone,
  isCurrent,
  isFrozen,
  canEdit,
  onPriceChange,
  onDelete,
  style,
  className,
}) => {
  const fillPercent = Math.min(100, Math.max(0, percent));

  // 状态样式
  const getStatusColor = () => {
    if (isFrozen) return '#94a3b8';
    if (isDone) return '#10b981';
    if (isCurrent) return '#3b82f6';
    return '#e5e7eb';
  };

  const getBackgroundColor = () => {
    if (isFrozen) return '#f8fafc';
    if (isDone) return '#f0fdf4';
    if (isCurrent) return '#eff6ff';
    return '#ffffff';
  };

  const statusColor = getStatusColor();
  const backgroundColor = getBackgroundColor();

  return (
    <div
      className={className}
      style={{
        width: '130px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px',
        background: backgroundColor,
        border: `2px solid ${statusColor}`,
        borderRadius: '6px',
        boxShadow: isDone || isCurrent ? `0 2px 8px ${statusColor}20` : '0 1px 3px rgba(0,0,0,0.1)',
        transition: 'all 0.2s ease',
        flexShrink: 0,
        ...style,
      }}
      title={`${name} ${done}/${total} · 剩余 ${total - done} · ${fillPercent.toFixed(0)}%`}
    >
      {/* 进度条 */}
      <div style={{
        position: 'relative',
        height: '28px',
        background: '#f3f4f6',
        borderRadius: '4px',
        overflow: 'hidden',
      }}>
        {/* 填充条 */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${fillPercent}%`,
          background: `linear-gradient(90deg, ${statusColor}dd, ${statusColor})`,
          transition: 'width 0.3s ease',
        }} />
        
        {/* 文字层 */}
        <div style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          fontSize: '11px',
          fontWeight: 600,
          color: fillPercent > 50 ? '#ffffff' : '#374151',
          zIndex: 1,
        }}>
          <span style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '60px',
          }}>{name}</span>
          <span style={{ flexShrink: 0 }}>
            {done}/{total}
          </span>
        </div>
      </div>

      {/* 单价输入行 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '4px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flex: 1,
        }}>
          <span style={{
            fontSize: '11px',
            color: '#6b7280',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}>单价</span>
          <InputNumber
            size="small"
            min={0}
            precision={2}
            value={unitPrice}
            disabled={!canEdit}
            onChange={(v) => onPriceChange?.(Number(v) || 0)}
            style={{
              width: '65px',
              fontSize: '11px',
            }}
            controls={false}
          />
        </div>
        
        {canEdit && onDelete && (
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined style={{ fontSize: '12px' }} />}
            onClick={onDelete}
            style={{
              width: '24px',
              height: '24px',
              padding: 0,
              minWidth: 'unset',
            }}
          />
        )}
      </div>
    </div>
  );
};

export default ProgressNodeCard;
