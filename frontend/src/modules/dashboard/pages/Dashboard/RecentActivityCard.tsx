import React from 'react';
import {
  AccountBookOutlined,
  FileTextOutlined,
  InboxOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { RecentActivity } from './useDashboardStats';

interface RecentActivityCardProps {
  activities: RecentActivity[];
}

const getActivityIcon = (type: string) => {
  const iconMap: Record<string, React.ReactNode> = {
    production: <InboxOutlined />,
    reconciliation: <AccountBookOutlined />,
    style: <TagsOutlined />,
    material: <ShoppingCartOutlined />,
  };
  return iconMap[type] || <FileTextOutlined />;
};

const formatActivityTime = (timeStr: string) => {
  if (!timeStr) return '';
  if (timeStr.includes('-')) return timeStr;
  const now = new Date();
  const today = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const timePart = timeStr.split(':').slice(0, 2).join(':');
  return `${today} ${timePart}`;
};

const RecentActivityCard: React.FC<RecentActivityCardProps> = ({ activities }) => {
  return (
    <div className="dashboard-card">
      <div className="card-header">
        <h3 className="card-title">最近动态</h3>
      </div>
      <div className="card-content">
        {activities.length === 0 ? (
          <div className="dashboard-empty-state">
            <div className="dashboard-empty-state-icon">
              <InboxOutlined />
            </div>
            <div className="dashboard-empty-state-text">暂无最近动态</div>
            <div className="dashboard-empty-state-hint">订单和扫码记录将在这里实时显示</div>
          </div>
        ) : (
          <ul className="activity-list">
            {activities.map(activity => (
              <li
                key={activity.id}
                className="activity-item"
              >
                <span className={`activity-icon activity-icon--${activity.type}`}>
                  {getActivityIcon(activity.type)}
                </span>
                <span className="activity-content">{activity.content}</span>
                <span className="activity-time">{formatActivityTime(activity.time)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default RecentActivityCard;
