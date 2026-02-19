/**
 * OrderProgressCard - 订单进度卡片组件
 * 功能：显示订单基本信息、进度条、操作按钮
 */
import React from 'react';
import { Card, Tag, Button, Space, Progress } from 'antd';
import { EyeOutlined, ScanOutlined, RollbackOutlined, EditOutlined } from '@ant-design/icons';
import { ProductionOrder } from '@/types/production';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { getProgressColorStatus } from '@/utils/progressColor';

interface OrderProgressCardProps {
  order: ProductionOrder;
  onViewDetail: (order: ProductionOrder) => void;
  onScan?: (order: ProductionOrder) => void;
  onRollback?: (order: ProductionOrder) => void;
  onQuickEdit?: (order: ProductionOrder) => void;
}

const getStatusConfig = (status: ProductionOrder['status']) => {
  const configs: Record<string, { text: string; color: string }> = {
    pending: { text: '待生产', color: 'default' },
    in_progress: { text: '生产中', color: 'processing' },
    production: { text: '生产中', color: 'processing' },
    completed: { text: '已完成', color: 'success' },
    delayed: { text: '已逾期', color: 'warning' },
    cancelled: { text: '已取消', color: 'error' },
    canceled: { text: '已取消', color: 'error' },
    paused: { text: '已暂停', color: 'default' },
    returned: { text: '已退回', color: 'error' },
  };
  return configs[status] || { text: status, color: 'default' };
};

const OrderProgressCard: React.FC<OrderProgressCardProps> = ({
  order,
  onViewDetail,
  onScan,
  onRollback,
  onQuickEdit,
}) => {
  const { text, color } = getStatusConfig(order.status);

  return (
    <Card
      size="small"
      hoverable
      style={{ marginBottom: 16 }}
      onClick={() => onViewDetail(order)}
    >
      <div style={{ display: 'flex', gap: 16 }}>
        {/* 左侧：图片 */}
        <StyleCoverThumb
          styleNo={order.styleNo}
          src={order.styleCover}
          size={80}
          borderRadius={6}
        />

        {/* 中间：信息 */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div>
              <span style={{ fontSize: "var(--font-size-lg)", fontWeight: 600, marginRight: 12 }}>
                {order.orderNo}
              </span>
              <Tag color={color}>{text}</Tag>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: "var(--font-size-sm)" }}>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款号：</span>{order.styleNo}</div>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>款名：</span>{order.styleName || '-'}</div>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>工厂：</span>{order.factoryName || '-'}</div>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>数量：</span>{order.orderQuantity}</div>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>完成：</span>{order.completedQuantity || 0}</div>
            <div><span style={{ color: 'var(--neutral-text-secondary)' }}>入库：</span>{order.warehousingQualifiedQuantity || 0}</div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>生产进度</span>
              <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600 }}>{order.productionProgress}%</span>
            </div>
            <Progress
              percent={order.productionProgress}
              status={order.status === 'completed' ? 'success' : 'active'}
              strokeColor={
                order.status === 'completed'
                  ? 'var(--color-success)'
                  : getProgressColorStatus(order.plannedEndDate) === 'danger'
                  ? 'var(--color-danger)'
                  : getProgressColorStatus(order.plannedEndDate) === 'warning'
                  ? 'var(--color-warning)'
                  : 'var(--color-success)'
              }
            />
          </div>

          <div style={{ marginTop: 8, fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
            创建时间：{formatDateTime(order.createTime)}
          </div>
        </div>

        {/* 右侧：操作按钮 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
          <Button
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              onViewDetail(order);
            }}
          >
            详情
          </Button>
          {onScan && (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onScan(order);
              }}
            >
              扫码
            </Button>
          )}
          {onRollback && (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onRollback(order);
              }}
            >
              回退
            </Button>
          )}
          {onQuickEdit && (
            <Button
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onQuickEdit(order);
              }}
            >
              编辑
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default OrderProgressCard;
