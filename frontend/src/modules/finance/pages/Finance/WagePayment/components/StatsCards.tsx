import React from 'react';
import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';

export interface PendingStats {
  total: number;
  totalAmount: number;
  reconCount: number;
  reimbCount: number;
  payrollCount: number;
}

export interface PaymentStats {
  total: number;
  pendingCount: number;
  successCount: number;
  rejectedCount: number;
  totalAmount: number;
  successAmount: number;
}

interface StatsCardsProps {
  activeTab: string;
  pendingStats: PendingStats;
  paymentStats: PaymentStats;
  selectedPayableKeysLength: number;
}

const StatsCards: React.FC<StatsCardsProps> = ({
  activeTab,
  pendingStats,
  paymentStats,
  selectedPayableKeysLength,
}) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
      <Card
        size="small"
        style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
        styles={{ body: { padding: '5px 10px' } }}
      >
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待处理</span>}
          value={activeTab === 'pending' ? pendingStats.total : paymentStats.pendingCount}
          suffix="笔"
          valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card
        size="small"
        style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
        styles={{ body: { padding: '5px 10px' } }}
      >
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已完成</span>}
          value={activeTab === 'pending' ? (pendingStats.total - selectedPayableKeysLength) : paymentStats.successCount}
          suffix="笔"
          valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card
        size="small"
        style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
        styles={{ body: { padding: '5px 10px' } }}
      >
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />已处理金额</span>}
          value={activeTab === 'pending' ? 0 : paymentStats.successAmount}
          precision={2}
          prefix="¥"
          valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card
        size="small"
        style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
        styles={{ body: { padding: '5px 10px' } }}
      >
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>合计金额</span>}
          value={activeTab === 'pending' ? pendingStats.totalAmount : paymentStats.totalAmount}
          precision={2}
          prefix="¥"
          valueStyle={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
    </div>
  );
};

export default StatsCards;
