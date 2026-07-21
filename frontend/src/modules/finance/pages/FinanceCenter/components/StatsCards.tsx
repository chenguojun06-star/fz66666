import React from 'react';
import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import type { FactorySummaryStats, FactorySummaryTotals } from '../useFactorySummaryData';

interface Props {
  stats: FactorySummaryStats;
  summary: FactorySummaryTotals;
}

const StatsCards: React.FC<Props> = ({ stats, summary }) => {
  const cardStyle: React.CSSProperties = {
    borderRadius: 6,
    border: '1px solid var(--color-border-secondary)',
    background: 'var(--color-fill-tertiary)',
  };
  const bodyStyle = { padding: '5px 10px' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
      <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待推送</span>}
          value={stats.pendingCount}
          suffix="个"
          valueStyle={{ color: 'var(--color-warning)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已推送</span>}
          value={stats.approvedCount}
          suffix="个"
          valueStyle={{ color: 'var(--color-primary)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ShopOutlined style={{ marginRight: 4, fontSize: 12 }} />工厂总数</span>}
          value={stats.total}
          suffix="个"
          valueStyle={{ color: 'var(--color-success)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
      <Card size="small" style={cardStyle} styles={{ body: bodyStyle }}>
        <Statistic
          title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />总金额</span>}
          value={summary.totalAmount}
          precision={2}
          prefix="¥"
          valueStyle={{ color: 'var(--color-text-primary)', fontSize: 15, fontWeight: 500 }}
        />
      </Card>
    </div>
  );
};

export default StatsCards;
