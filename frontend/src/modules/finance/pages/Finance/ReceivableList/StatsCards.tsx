import React from 'react';
import { Alert, Card, Col, Row, Statistic } from 'antd';
import {
  CheckCircleOutlined, DollarOutlined, ExclamationCircleOutlined, WarningOutlined,
} from '@ant-design/icons';
import type { ReceivableStats } from '@/services/crm/customerApi';
import { toMoneyLocale } from '@/utils/format';

interface StatsCardsProps {
  stats: ReceivableStats;
}

const StatsCards: React.FC<StatsCardsProps> = ({ stats }) => {
  return (
    <>
      <Row gutter={16} style={{ marginBottom: 12 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="待收款合计"
              value={Number(stats.totalPending)}
              precision={2}
              prefix={<DollarOutlined />}
              styles={{ content: { color: 'var(--color-primary)' } }}
              formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="逾期未收合计"
              value={Number(stats.totalOverdue)}
              precision={2}
              prefix={<WarningOutlined />}
              styles={{ content: { color: 'var(--color-danger)' } }}
              formatter={v => `¥ ${toMoneyLocale(Number(v))}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="逾期笔数"
              value={stats.overdueCount}
              prefix={<ExclamationCircleOutlined />}
              styles={{ content: { color: 'var(--color-warning)' } }}
              suffix="笔"
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="本月新增应收"
              value={stats.newThisMonth}
              prefix={<CheckCircleOutlined />}
              styles={{ content: { color: 'var(--color-success)' } }}
              suffix="笔"
            />
          </Card>
        </Col>
      </Row>

      {stats.overdueCount > 0 && (
        <Alert
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          title={`有 ${stats.overdueCount} 笔应收款已逾期未收，共 ¥${toMoneyLocale(Number(stats.totalOverdue))}，请及时催款。`}
          style={{ marginBottom: 16 }}
          closable
        />
      )}
    </>
  );
};

export default StatsCards;
