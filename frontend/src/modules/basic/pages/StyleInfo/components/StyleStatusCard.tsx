import React from 'react';
import { Tag } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ExperimentOutlined,
  NodeIndexOutlined,
} from '@ant-design/icons';
import type { StyleInfo } from '@/types/style';

/**
 * 样衣详情页左侧状态卡片
 * <p>
 * 用途：填充图片下方空白区域，展示样衣关键状态信息（开发进度/时间/推单状态/入库数量）
 * 设计：纯展示卡片，无交互，符合项目 ERP 风格（CSS变量+阴影+无边框）
 */
interface StyleStatusCardProps {
  style: StyleInfo | null | undefined;
}

const StatusTagConfig: Record<string, { color: string; text: string }> = {
  // sampleStatus
  PENDING: { color: 'default', text: '待开发' },
  IN_PROGRESS: { color: 'processing', text: '开发中' },
  COMPLETED: { color: 'success', text: '已完成' },
  WAREHOUSE_IN: { color: 'success', text: '已入库' },
  // status
  ENABLED: { color: 'success', text: '已启用' },
  DISABLED: { color: 'default', text: '已停用' },
  SCRAPPED: { color: 'error', text: '已报废' },
};

const StyleStatusCard: React.FC<StyleStatusCardProps> = ({ style }) => {
  if (!style) return null;

  const sampleStatus = String(style.sampleStatus ?? '').trim().toUpperCase();
  const sampleConfig = sampleStatus ? StatusTagConfig[sampleStatus] : null;

  const generalStatus = String(style.status ?? '').trim().toUpperCase();
  const generalConfig = generalStatus ? StatusTagConfig[generalStatus] : null;

  const progressNode = style.progressNode;
  const pushedToOrder = Boolean(style.pushedToOrder);
  const totalWarehousedQuantity = style.totalWarehousedQuantity ?? 0;
  const sampleQuantity = style.sampleQuantity ?? 0;
  const orderCount = style.orderCount ?? 0;

  // 时间格式化：取 YYYY-MM-DD HH:mm
  const fmtTime = (t?: string) => {
    if (!t) return null;
    const sliced = t.length >= 16 ? t.slice(0, 16) : t;
    return sliced.replace('T', ' ');
  };

  const createTime = fmtTime(style.createTime);
  const updateTime = fmtTime(style.updateTime);
  const sampleCompletedTime = fmtTime(style.sampleCompletedTime);
  const pushedOrderTime = fmtTime(style.pushedToOrderTime);

  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: 8,
        background: 'var(--color-bg-container, var(--color-bg-base))',
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 1px 6px rgba(0,0,0,0.04)',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text, var(--color-bg-dark))',
          marginBottom: 10,
          paddingLeft: 8,
          borderLeft: '3px solid var(--color-primary, var(--color-primary))',
          lineHeight: 1.4,
        }}
      >
        款式状态
      </div>

      {/* 状态徽章行 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {sampleConfig && (
          <Tag color={sampleConfig.color} style={{ margin: 0 }}>
            <ExperimentOutlined style={{ marginRight: 4 }} />
            {sampleConfig.text}
          </Tag>
        )}
        {generalConfig && generalConfig.text !== sampleConfig?.text && (
          <Tag color={generalConfig.color} style={{ margin: 0 }}>
            {generalConfig.text}
          </Tag>
        )}
        {pushedToOrder && (
          <Tag color="blue" style={{ margin: 0 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            已推单
          </Tag>
        )}
      </div>

      {/* 进度节点 */}
      {progressNode && (
        <StatusRow
          icon={<NodeIndexOutlined style={{ color: 'var(--color-primary, var(--color-primary))' }} />}
          label="当前进度"
          value={progressNode}
        />
      )}

      {/* 关键数量 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 10,
          padding: '8px 0',
          borderTop: '1px solid var(--color-border, var(--color-border-light))',
          borderBottom: '1px solid var(--color-border, var(--color-border-light))',
        }}
      >
        <MetricItem label="样衣数" value={sampleQuantity} />
        <MetricItem label="入库数" value={totalWarehousedQuantity} />
        <MetricItem label="订单数" value={orderCount} />
        <MetricItem
          label="库存"
          value={style.stockQuantity ?? 0}
        />
      </div>

      {/* 时间信息 */}
      {createTime && (
        <StatusRow
          icon={<ClockCircleOutlined style={{ color: 'var(--color-text-secondary, var(--color-text-muted))' }} />}
          label="创建"
          value={createTime}
        />
      )}
      {updateTime && updateTime !== createTime && (
        <StatusRow
          icon={<SyncOutlined style={{ color: 'var(--color-text-secondary, var(--color-text-muted))' }} />}
          label="更新"
          value={updateTime}
        />
      )}
      {sampleCompletedTime && (
        <StatusRow
          icon={<CheckCircleOutlined style={{ color: 'var(--color-success, var(--color-success))' }} />}
          label="完工"
          value={sampleCompletedTime}
        />
      )}
      {pushedOrderTime && (
        <StatusRow
          icon={<CheckCircleOutlined style={{ color: 'var(--color-primary, var(--color-primary))' }} />}
          label="推单"
          value={pushedOrderTime}
        />
      )}
    </div>
  );
};

const StatusRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({
  icon,
  label,
  value,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 12,
      color: 'var(--color-text-secondary, var(--color-text-muted))',
      marginBottom: 4,
      lineHeight: 1.5,
    }}
  >
    <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
    <span style={{ flexShrink: 0 }}>{label}：</span>
    <span
      style={{
        color: 'var(--color-text, var(--color-bg-dark))',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
      title={value}
    >
      {value}
    </span>
  </div>
);

const MetricItem: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <div style={{ textAlign: 'center' }}>
    <div
      style={{
        fontSize: 16,
        fontWeight: 600,
        color: 'var(--color-text, var(--color-bg-dark))',
        lineHeight: 1.2,
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: 11, color: 'var(--color-text-secondary, var(--color-text-muted))', marginTop: 2 }}>
      {label}
    </div>
  </div>
);

export default StyleStatusCard;
