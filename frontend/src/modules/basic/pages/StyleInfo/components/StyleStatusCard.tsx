import React from 'react';
import { Popover, Tag, Tooltip } from 'antd';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  SyncOutlined,
  ExperimentOutlined,
  NodeIndexOutlined,
  UserOutlined,
  AuditOutlined,
  WarningOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import type { StyleInfo } from '@/types/style';

/**
 * 款式状态摘要条（紧凑横向布局，置于图片资产条与基础信息之间）
 * 一行展示：状态徽章 | 当前进度 | 当前操作人（动态） | 预计交板 | 样衣/入库/订单/库存
 * 次要信息（创建/更新/完工/审核/推单时间）收纳进"详情"Popover
 */
interface StyleStatusCardProps {
  style: StyleInfo | null | undefined;
  /** 紧凑模式（当前唯一使用方式）：单行摘要条 */
  compact?: boolean;
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

  const fmtTime = (t?: string) => {
    if (!t) return null;
    const sliced = t.length >= 16 ? t.slice(0, 16) : t;
    return sliced.replace('T', ' ');
  };

  const createTime = fmtTime(style.createTime);
  const updateTime = fmtTime(style.updateTime);
  const sampleCompletedTime = fmtTime(style.sampleCompletedTime);
  const pushedOrderTime = fmtTime(style.pushedToOrderTime);

  // 当前操作人 = 最近启动环节的负责人（动态：随工序启动时间自动更新）
  const assigneeStages = [
    { assignee: (style as any).bomAssignee, startTime: (style as any).bomStartTime },
    { assignee: (style as any).patternAssignee, startTime: (style as any).patternStartTime },
    { assignee: (style as any).productionAssignee, startTime: (style as any).productionStartTime },
    { assignee: (style as any).secondaryAssignee, startTime: (style as any).secondaryStartTime },
    { assignee: (style as any).processAssignee, startTime: (style as any).processStartTime },
  ];
  const timedStages = assigneeStages
    .filter((s) => s.assignee && s.startTime)
    .sort((a, b) => String(b.startTime).localeCompare(String(a.startTime)));
  const currentOperator = timedStages.length
    ? timedStages[0].assignee
    : ((style as any).patternAssignee ||
       (style as any).productionAssignee ||
       (style as any).bomAssignee ||
       (style as any).secondaryAssignee ||
       (style as any).processAssignee ||
       '');
  const deliveryDateRaw = (style as any).deliveryDate || (style as any).deliveryTime;
  const deliveryDate = deliveryDateRaw ? String(deliveryDateRaw).slice(0, 10) : null;
  const sampleReviewStatus = String((style as any).sampleReviewStatus ?? '').trim().toUpperCase();
  const sampleReviewer = (style as any).sampleReviewer || '';
  const sampleReviewTime = fmtTime((style as any).sampleReviewTime);

  const reviewTagConfig: Record<string, { color: string; text: string }> = {
    PASS: { color: 'success', text: '审核通过' },
    APPROVED: { color: 'success', text: '审核通过' },
    REJECT: { color: 'error', text: '审核驳回' },
    REJECTED: { color: 'error', text: '审核驳回' },
    REWORK: { color: 'warning', text: '需返修' },
    PENDING: { color: 'default', text: '待审核' },
  };
  const reviewConfig = sampleReviewStatus ? reviewTagConfig[sampleReviewStatus] : null;

  const isDeliveryOverdue = (() => {
    if (!deliveryDate) return false;
    const due = new Date(deliveryDate.replace(' ', 'T'));
    return !isNaN(due.getTime()) && due.getTime() < Date.now();
  })();

  // 详情 Popover 内容（次要时间信息收纳）
  const detailContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 180 }}>
      {createTime && <DetailRow label="创建" value={createTime} />}
      {updateTime && updateTime !== createTime && <DetailRow label="更新" value={updateTime} />}
      {sampleCompletedTime && <DetailRow label="完工" value={sampleCompletedTime} />}
      {sampleReviewTime && sampleReviewer && <DetailRow label="审核" value={`${sampleReviewer} · ${sampleReviewTime}`} />}
      {pushedOrderTime && <DetailRow label="推单" value={pushedOrderTime} />}
    </div>
  );
  const hasDetail = Boolean(createTime || updateTime || sampleCompletedTime || (sampleReviewTime && sampleReviewer) || pushedOrderTime);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '6px 16px',
        padding: '8px 12px',
        borderRadius: 10,
        border: '1px solid var(--color-border)',
        background: 'var(--color-bg-container, var(--color-bg-base))',
        fontSize: 12,
        minWidth: 0,
      }}
    >
      {/* 状态徽章 */}
      <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
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
        {reviewConfig && (
          <Tag color={reviewConfig.color} style={{ margin: 0 }}>
            <AuditOutlined style={{ marginRight: 4 }} />
            {reviewConfig.text}
          </Tag>
        )}
        {pushedToOrder && (
          <Tag color="blue" style={{ margin: 0 }}>
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            已推单
          </Tag>
        )}
      </span>

      {/* 当前进度 */}
      {progressNode && (
        <SummaryItem
          icon={<NodeIndexOutlined style={{ color: 'var(--color-primary)' }} />}
          label="当前进度"
          value={progressNode}
        />
      )}

      {/* 当前操作人（动态字段：随最近启动工序自动更新） */}
      {currentOperator && (
        <Tooltip title="当前操作人为动态字段：自动取「最近一次已启动工序」的负责人，工序变化后会自动更新，无需手动维护">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <SummaryItem
              icon={<UserOutlined style={{ color: 'var(--color-primary)' }} />}
              label="当前操作人"
              value={currentOperator}
            />
            <InfoCircleOutlined style={{ color: 'var(--color-text-quaternary)', fontSize: 11 }} />
          </span>
        </Tooltip>
      )}

      {/* 预计交板（超期红色） */}
      {deliveryDate && (
        <SummaryItem
          icon={isDeliveryOverdue
            ? <WarningOutlined style={{ color: 'var(--color-danger, var(--color-error))' }} />
            : <ClockCircleOutlined style={{ color: 'var(--color-warning)' }} />}
          label="预计交板"
          value={deliveryDate + (isDeliveryOverdue ? '（已超期）' : '')}
          valueColor={isDeliveryOverdue ? 'var(--color-danger, var(--color-error))' : undefined}
        />
      )}

      {/* 关键数量（横向紧凑） */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <MetricInline label="样衣数" value={sampleQuantity} />
        <MetricInline label="入库数" value={totalWarehousedQuantity} />
        <MetricInline label="订单数" value={orderCount} />
        <MetricInline label="库存" value={style.stockQuantity ?? 0} />
      </span>

      {/* 详情收纳 */}
      {hasDetail && (
        <Popover content={detailContent} title="时间信息" placement="bottomRight">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: 'var(--color-text-tertiary)' }}>
            <SyncOutlined />
            <span>{updateTime || createTime || ''}</span>
            <InfoCircleOutlined style={{ fontSize: 11 }} />
          </span>
        </Popover>
      )}
    </div>
  );
};

const SummaryItem: React.FC<{ icon: React.ReactNode; label: string; value: string; valueColor?: string }> = ({
  icon,
  label,
  value,
  valueColor,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      color: 'var(--color-text-secondary)',
      maxWidth: 260,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
    }}
    title={`${label}：${value}`}
  >
    <span style={{ display: 'inline-flex', flexShrink: 0 }}>{icon}</span>
    <span style={{ flexShrink: 0 }}>{label}：</span>
    <span
      style={{
        color: valueColor || 'var(--color-text)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: 0,
      }}
    >
      {value}
    </span>
  </span>
);

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--color-text-secondary)' }}>
    <span style={{ flexShrink: 0 }}>{label}：</span>
    <span style={{ color: 'var(--color-text)' }}>{value}</span>
  </div>
);

const MetricInline: React.FC<{ label: string; value: number | string }> = ({ label, value }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
    <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{label}</span>
  </span>
);

export default StyleStatusCard;
