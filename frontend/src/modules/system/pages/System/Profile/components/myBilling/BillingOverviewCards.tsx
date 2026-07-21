/**
 * 套餐概览卡片
 * 展示当前套餐 / 存储使用 / 用户数 / 租户编码 + 维护开票信息入口
 */
import React from 'react';
import { Row, Col, Card, Statistic, Progress, Button } from 'antd';
import { PLAN_LABELS, formatPlanFee } from '../billingDisplay';

interface Props {
  overview: any;
  onOpenInvoiceInfo: () => void;
}

const BillingOverviewCards: React.FC<Props> = ({ overview, onOpenInvoiceInfo }) => {
  if (!overview) return null;
  return (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      <Col span={6}>
        <Card>
          <Statistic
            title="当前套餐"
            value={PLAN_LABELS[overview.planType] ?? '未知'}
            styles={{ content: { color: 'var(--color-primary)', fontSize: 20 } }}
          />
          <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
            {formatPlanFee(overview)}
            {overview.expireTime && <span> · 到期: {overview.expireTime?.slice(0, 10)}</span>}
          </div>
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="存储使用"
            value={`${overview.storageUsedMb || 0}MB`}
            suffix={`/ ${overview.storageQuotaMb}MB`}
          />
          <Progress
            percent={overview.storageUsedPercent || 0}

            status={overview.storageUsedPercent > 80 ? 'exception' : 'normal'}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic
            title="用户数"
            value={overview.currentUsers || 0}
            suffix={`/ ${overview.maxUsers || '∞'}`}
          />
        </Card>
      </Col>
      <Col span={6}>
        <Card>
          <Statistic title="租户编码" value={overview.tenantCode || '—'} styles={{ content: { fontSize: 18 } }} />
          <div style={{ marginTop: 8 }}>
            <Button type="link" onClick={onOpenInvoiceInfo}>
              维护开票信息
            </Button>
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default BillingOverviewCards;
