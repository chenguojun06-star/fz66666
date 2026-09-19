import React from 'react';
import { Card, Statistic } from 'antd';
import { ClockCircleOutlined, FileTextOutlined, CheckCircleOutlined } from '@ant-design/icons';

export interface BillStats {
  pendingAmount: number;
  pendingCount: number;
  confirmedAmount: number;
  confirmedCount: number;
  settledAmount: number;
  settledCount: number;
}

interface StatsCardsProps {
  activeTab: string;
  billStats: BillStats;
}

const StatsCards: React.FC<StatsCardsProps> = ({ activeTab, billStats }) => {
  if (activeTab === 'bills') {
    return null;
  }

  const cards = [
    {
      title: '账单笔数',
      icon: <FileTextOutlined style={{ marginRight: 4, fontSize: 12 }} />,
      value: billStats.pendingCount + billStats.confirmedCount + billStats.settledCount,
      suffix: '笔',
      color: 'var(--color-text-primary)',
    },
    {
      title: '待确认',
      icon: <ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />,
      value: billStats.pendingAmount,
      prefix: '¥',
      precision: 2,
      color: billStats.pendingAmount > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)',
    },
    {
      title: '已确认',
      icon: <CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />,
      value: billStats.confirmedAmount,
      prefix: '¥',
      precision: 2,
      color: 'var(--color-primary)',
    },
    {
      title: '已结清',
      icon: <CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />,
      value: billStats.settledAmount,
      prefix: '¥',
      precision: 2,
      color: 'var(--color-success)',
    },
  ];

  return (
    <div className="u-d-grid u-gap-12 u-mb-12" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
      {cards.map((c) => (
        <Card
          key={c.title}
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>{c.icon}{c.title}</span>}
            value={c.value}
            prefix={c.prefix}
            precision={c.precision}
            suffix={c.suffix}
            valueStyle={{ color: c.color, fontSize: 15, fontWeight: 500 }}
          />
        </Card>
      ))}
    </div>
  );
};

export default StatsCards;
