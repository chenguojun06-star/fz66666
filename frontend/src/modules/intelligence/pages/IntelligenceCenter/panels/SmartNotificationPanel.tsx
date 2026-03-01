import React, { useEffect, useState, useCallback } from 'react';
import { Button, Alert, Spin, Empty, Tag, Badge } from 'antd';
import { ReloadOutlined, BellOutlined, NotificationOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { SmartNotificationResponse, NotificationItem } from '@/services/production/productionApi';

const priorityStyle: Record<string, { color: string; bg: string; text: string }> = {
  urgent: { color: '#ff4d4f', bg: '#fff1f0', text: '紧急' },
  high: { color: '#fa8c16', bg: '#fff7e6', text: '高' },
  normal: { color: '#1677ff', bg: '#e6f4ff', text: '普通' },
  low: { color: '#8c8c8c', bg: '#fafafa', text: '低' },
};

const typeIcon: Record<string, string> = {
  overdue_warning: '⏰',
  stagnant_alert: '⏸️',
  milestone: '🎯',
  capacity_alert: '📊',
};

const NotifyCard: React.FC<{ item: NotificationItem }> = ({ item }) => {
  const ps = priorityStyle[item.priority] || priorityStyle.normal;
  return (
    <div className="notify-card" style={{ borderLeftColor: ps.color, background: ps.bg }}>
      <div className="notify-card-header">
        <span className="notify-icon">{typeIcon[item.type] || '📢'}</span>
        <span className="notify-title">{item.title}</span>
        <Tag color={ps.color} style={{ marginLeft: 'auto' }}>{ps.text}</Tag>
      </div>
      <div className="notify-message">{item.message}</div>
      <div className="notify-meta">
        {item.targetUser && <span>👤 {item.targetUser}</span>}
        {item.orderNo && <span>📋 {item.orderNo}</span>}
      </div>
    </div>
  );
};

const SmartNotificationPanel: React.FC = () => {
  const [data, setData] = useState<SmartNotificationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getSmartNotifications() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <div className="intelligence-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontWeight: 600 }}>
          <NotificationOutlined style={{ color: '#722ed1', marginRight: 6 }} />
          智能提醒中心
          {data && data.pendingCount > 0 && (
            <Badge count={data.pendingCount} style={{ marginLeft: 8 }} />
          )}
        </span>
        <Button icon={<ReloadOutlined />} onClick={fetch} loading={loading}>刷新</Button>
      </div>

      {data && (
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-value" style={{ color: '#ff4d4f' }}>{data.pendingCount}</div><div className="stat-label">待推送</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: '#1677ff' }}>{data.sentToday}</div><div className="stat-label">今日已发</div></div>
          <div className="stat-card"><div className="stat-value" style={{ color: '#52c41a' }}>{data.successRate}%</div><div className="stat-label">成功率</div></div>
        </div>
      )}

      {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
      <Spin spinning={loading}>
        {data?.items?.length ? (
          <div className="notify-list">
            {data.items.map((item, idx) => <NotifyCard key={idx} item={item} />)}
          </div>
        ) : !loading && <Empty description="暂无待推送提醒" />}
      </Spin>
    </div>
  );
};

export default SmartNotificationPanel;
