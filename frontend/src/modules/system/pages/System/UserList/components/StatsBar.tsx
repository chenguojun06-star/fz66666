import React from 'react';
import { Card, Col, Row, Tooltip, Typography } from 'antd';
import {
  AuditOutlined,
  TeamOutlined,
  UserDeleteOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { UserStats } from '../helpers';

const { Text } = Typography;

interface StatsBarProps {
  total: number;
  userStats: UserStats;
  pendingUserCount: number;
  onGoApproval?: () => void;
}

interface KpiItem {
  key: string;
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  subtext: string;
  clickable?: boolean;
  onClick?: () => void;
}

const StatsBar: React.FC<StatsBarProps> = ({
  total,
  userStats,
  pendingUserCount,
  onGoApproval,
}) => {
  const employedRatio = total > 0 ? Math.round((userStats.employed / total) * 100) : 0;

  const items: KpiItem[] = [
    {
      key: 'total',
      label: '员工总数',
      value: total,
      icon: <TeamOutlined />,
      color: 'var(--color-primary, #1677ff)',
      bg: 'var(--color-primary-bg, #e8f2ff)',
      subtext: `在职占比 ${employedRatio}%`,
    },
    {
      key: 'employed',
      label: '在职',
      value: userStats.employed,
      icon: <UserOutlined />,
      color: 'var(--color-success, #52c41a)',
      bg: 'var(--color-success-bg, #e9f9ee)',
      subtext: `占 ${employedRatio}%`,
    },
    {
      key: 'resigned',
      label: '离职 / 归档',
      value: userStats.resigned,
      icon: <UserDeleteOutlined />,
      color: 'var(--color-error, #ff4d4f)',
      bg: 'var(--color-error-bg, #fef0f0)',
      subtext: total > 0 ? `占 ${100 - employedRatio}%` : '暂无',
    },
    {
      key: 'pending',
      label: '待审批',
      value: pendingUserCount,
      icon: <AuditOutlined />,
      color: 'var(--color-warning, #faad14)',
      bg: 'var(--color-warning-bg, #fff7e6)',
      subtext: pendingUserCount > 0 ? '点击前往审批' : '无待办',
      clickable: pendingUserCount > 0,
      onClick: onGoApproval,
    },
  ];

  return (
    <Row gutter={12} style={{ marginBottom: 12 }}>
      {items.map((item) => {
        const cardBody = (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0' }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: item.bg,
                color: item.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              {item.icon}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, color: 'var(--color-text-tertiary, #8c8c8c)', lineHeight: '16px' }}>
                {item.label}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--color-text-primary, #262626)',
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: '28px',
                  }}
                >
                  {item.value}
                </span>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {item.subtext}
                </Text>
              </div>
            </div>
          </div>
        );

        return (
          <Col xs={12} md={6} key={item.key}>
            {item.clickable && item.onClick ? (
              <Tooltip title="前往审批页面">
                <Card
                  size="small"
                  hoverable
                  onClick={item.onClick}
                  styles={{ body: { padding: '12px 16px' } }}
                  style={{ cursor: 'pointer', boxShadow: 'var(--card-shadow, 0 1px 4px rgba(0,0,0,0.06))' }}
                >
                  {cardBody}
                </Card>
              </Tooltip>
            ) : (
              <Card
                size="small"
                styles={{ body: { padding: '12px 16px' } }}
                style={{ boxShadow: 'var(--card-shadow, 0 1px 4px rgba(0,0,0,0.06))' }}
              >
                {cardBody}
              </Card>
            )}
          </Col>
        );
      })}
    </Row>
  );
};

export default StatsBar;
