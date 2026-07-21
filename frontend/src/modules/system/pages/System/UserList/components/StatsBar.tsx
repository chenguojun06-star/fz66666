import React from 'react';
import { Button, Card, Space, Tag, Tooltip, Typography } from 'antd';
import { QrcodeOutlined, TeamOutlined, UserOutlined, ShopOutlined, ApartmentOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import type { UserStats } from '../helpers';

const { Text } = Typography;

interface StatsBarProps {
  total: number;
  userStats: UserStats;
  pendingUserCount: number;
  canManageUsers: boolean;
  onGenerateInvite: () => void;
  onAddUser: () => void;
}

const StatsBar: React.FC<StatsBarProps> = ({
  total,
  userStats,
  pendingUserCount,
  canManageUsers,
  onGenerateInvite,
  onAddUser,
}) => {
  return (
    <Card size="small" style={{ marginBottom: 12 }} styles={{ body: { padding: '10px 16px' } }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Space size={16} wrap>
          <Space size={4}>
            <TeamOutlined style={{ fontSize: 14, color: 'var(--color-text-secondary, #666)' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>总人数</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--primary-color, var(--color-primary))' }}>{total}</Text>
          </Space>
          <Space size={4}>
            <UserOutlined style={{ fontSize: 14, color: 'var(--color-success, var(--color-success))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>内部</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-success, var(--color-success))' }}>{userStats.internal}</Text>
          </Space>
          <Space size={4}>
            <ApartmentOutlined style={{ fontSize: 14, color: 'var(--color-info, var(--color-info))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>外发工厂</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-info, var(--color-info))' }}>{userStats.externalFactory}</Text>
          </Space>
          <Space size={4}>
            <ShopOutlined style={{ fontSize: 14, color: 'var(--color-warning, var(--color-warning))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>供应商</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-warning, var(--color-warning))' }}>{userStats.supplier}</Text>
          </Space>
          <Space size={4}>
            <SafetyCertificateOutlined style={{ fontSize: 14, color: 'var(--color-success, var(--color-success))' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>启用</Text>
            <Text strong style={{ fontSize: 16, color: 'var(--color-success, var(--color-success))' }}>{userStats.activeCount}</Text>
          </Space>
          {pendingUserCount > 0 && (
            <Tag color="orange" style={{ fontSize: 11, padding: '2px 8px' }}>
              {pendingUserCount} 人待审批
            </Tag>
          )}
        </Space>
        {canManageUsers && (
          <Space size={8}>
            <Tooltip title="生成邀请码，员工扫码绑定微信">
              <Button icon={<QrcodeOutlined />} onClick={onGenerateInvite}>邀请员工</Button>
            </Tooltip>
            <Button type="primary" ghost onClick={onAddUser}>新增人员</Button>
          </Space>
        )}
      </div>
    </Card>
  );
};

export default StatsBar;
