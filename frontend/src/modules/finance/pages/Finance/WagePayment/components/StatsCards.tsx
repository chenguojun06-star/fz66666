import React from 'react';
import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons';

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
  paymentStats: PaymentStats;
}

const CloseIcon = () => <span className="u-mr-4 u-fs-12">✕</span>;

/**
 * 顶部统计卡（D-298 梳理）：
 * - 只显示真实数字。旧版"已完成 = 总数 - 勾选数""待付款tab已处理金额恒0"是假数字，已移除。
 * - 应收/应付账单 tab 自带统计卡，顶层不再渲染，避免一屏两套卡片。
 */
const StatsCards: React.FC<StatsCardsProps> = ({
  activeTab,
  paymentStats,
}) => {
  // 账单流水 Tab 自带统计卡，顶层不再渲染，避免一屏两套卡片
  if (activeTab === 'bills') {
    return null;
  }

  const cards = [
        { title: '付款笔数', icon: <DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.total, suffix: '笔', color: 'var(--color-text-primary)' },
        { title: '处理中', icon: <ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.pendingCount, suffix: '笔', color: 'var(--color-warning)' },
        { title: '已成功金额', icon: <CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.successAmount, prefix: '¥', precision: 2, color: 'var(--color-success)' },
        { title: '失败/取消', icon: <CloseIcon />, value: paymentStats.rejectedCount, suffix: '笔', color: 'var(--color-text-secondary)' },
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
