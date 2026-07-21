/**
 * 续费到期提醒 Alert
 * 30天内到期（含已过期）的应用列表，按到期紧迫程度显示红/橙告警
 */
import React from 'react';
import { Alert, Space, Typography, Tag } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import type { MyAppInfo } from '@/services/system/appStore';
import { daysUntilExpiry, expiryColor } from './helpers';

const { Text } = Typography;

interface Props {
  expiringApps: MyAppInfo[];
}

const ExpiringAppsAlert: React.FC<Props> = ({ expiringApps }) => {
  if (expiringApps.length === 0) return null;
  const isCritical = expiringApps.some(a => {
    const days = daysUntilExpiry(a.endTime);
    return days !== null && days <= 7;
  });
  return (
    <Alert
      type={isCritical ? 'error' : 'warning'}
      icon={<BellOutlined />}
      showIcon
      style={{ marginBottom: 16 }}
      title={
        <Space size={4} wrap>
          <Text strong>续费提醒：</Text>
          {expiringApps.map(app => {
            const days = daysUntilExpiry(app.endTime);
            const expired = days !== null && days < 0;
            return (
              <Tag key={app.subscriptionId} color={expired ? 'error' : expiryColor(days)}>
                {app.appName}
                {expired ? ' 已过期' : `（${days}天后到期）`}
              </Tag>
            );
          })}
        </Space>
      }
      description="请及时续费，过期后相关功能将暂停使用，数据保留30天。"
      closable
    />
  );
};

export default ExpiringAppsAlert;
