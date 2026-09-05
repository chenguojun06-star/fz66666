import React from 'react';
import { Card, Statistic } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  WalletOutlined,
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

const CloseIcon = () => <span style={{ marginRight: 4, fontSize: 12 }}>✕</span>;

/**
 * 顶部统计卡（D-298 梳理）：
 * - 只显示真实数字。旧版"已完成 = 总数 - 勾选数""待付款tab已处理金额恒0"是假数字，已移除。
 * - 应收/应付账单 tab 自带统计卡，顶层不再渲染，避免一屏两套卡片。
 */
const StatsCards: React.FC<StatsCardsProps> = ({
  activeTab,
  pendingStats,
  paymentStats,
  selectedPayableKeysLength,
}) => {
  if (activeTab === 'receivable' || activeTab === 'payable') {
    return null;
  }

  const isPendingTab = activeTab === 'pending';

  const cards = isPendingTab
    ? [
        { title: '待付款笔数', icon: <ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: pendingStats.total, suffix: '笔', color: 'var(--color-warning)' },
        { title: '待付款金额', icon: <DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: pendingStats.totalAmount, prefix: '¥', precision: 2, color: 'var(--color-text-primary)' },
        { title: '其中工资结算', icon: <WalletOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: pendingStats.payrollCount, suffix: '笔', color: 'var(--color-text-secondary)' },
        { title: selectedPayableKeysLength > 0 ? '已勾选（可批量付款）' : '工厂对账 + 费用报销', icon: <CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: selectedPayableKeysLength > 0 ? selectedPayableKeysLength : pendingStats.reconCount + pendingStats.reimbCount, suffix: selectedPayableKeysLength > 0 ? '笔' : '笔', color: selectedPayableKeysLength > 0 ? 'var(--color-primary)' : 'var(--color-text-secondary)' },
      ]
    : [
        { title: '付款笔数', icon: <DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.total, suffix: '笔', color: 'var(--color-text-primary)' },
        { title: '处理中', icon: <ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.pendingCount, suffix: '笔', color: 'var(--color-warning)' },
        { title: '已成功金额', icon: <CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />, value: paymentStats.successAmount, prefix: '¥', precision: 2, color: 'var(--color-success)' },
        { title: '失败/取消', icon: <CloseIcon />, value: paymentStats.rejectedCount, suffix: '笔', color: 'var(--color-text-secondary)' },
      ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
      {cards.map((c) => (
        <Card
          key={c.title}
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '5px 10px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{c.icon}{c.title}</span>}
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
