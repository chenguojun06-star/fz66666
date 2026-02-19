import React, { useEffect, useState } from 'react';
import { App, Spin } from 'antd';
import {
  TagsOutlined,
  ShoppingCartOutlined,
  ScissorOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import './styles.css';

interface TimeRangeStats {
  day: number;
  week: number;
  month: number;
  year: number;
  total: number;
}

interface TopStatsData {
  sampleDevelopment: TimeRangeStats;
  bulkOrder: TimeRangeStats;
  cutting: TimeRangeStats;
  warehousing: TimeRangeStats;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  dataKey: keyof TopStatsData;
  color: string;
  data: TimeRangeStats | null;
  loading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, color, data, loading }) => {
  return (
    <div className="top-stat-item" style={{ borderColor: color }}>
      <Spin spinning={loading}>
        <div className="stat-card-content">
          {/* 头部：图标 + 标签 + 汇总数量 同一行 */}
          <div className="stat-header">
            <span className="stat-icon" style={{ color }}>{icon}</span>
            <span className="stat-label" style={{ color }}>{label}</span>
            <span className="stat-total" style={{ color }}>{data?.total?.toLocaleString() || 0}</span>
          </div>

          {/* 底部：日/周/月/年 文字与数量同一行 */}
          <div className="stat-tags-row">
            <div className="stat-tag" style={{ borderColor: `${color}33`, background: `${color}08` }}>
              <span className="stat-tag-label" style={{ color: `${color}99` }}>日</span>
              <span className="stat-tag-value" style={{ color }}>{data?.day?.toLocaleString() || 0}</span>
            </div>
            <div className="stat-tag" style={{ borderColor: `${color}33`, background: `${color}08` }}>
              <span className="stat-tag-label" style={{ color: `${color}99` }}>周</span>
              <span className="stat-tag-value" style={{ color }}>{data?.week?.toLocaleString() || 0}</span>
            </div>
            <div className="stat-tag" style={{ borderColor: `${color}33`, background: `${color}08` }}>
              <span className="stat-tag-label" style={{ color: `${color}99` }}>月</span>
              <span className="stat-tag-value" style={{ color }}>{data?.month?.toLocaleString() || 0}</span>
            </div>
            <div className="stat-tag" style={{ borderColor: `${color}33`, background: `${color}08` }}>
              <span className="stat-tag-label" style={{ color: `${color}99` }}>年</span>
              <span className="stat-tag-value" style={{ color }}>{data?.year?.toLocaleString() || 0}</span>
            </div>
          </div>
        </div>
      </Spin>
    </div>
  );
};

const TopStats: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<TopStatsData | null>(null);

  const getErrorStatus = (err: unknown) => {
    const anyErr = err as { status?: number; response?: { status?: number } };
    return Number(anyErr?.status || anyErr?.response?.status || 0);
  };

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message?: string; data: TopStatsData }>('/dashboard/top-stats', {
        params: { range: 'week' }
      });
      if (response.code === 200 && response.data) {
        setStatsData(response.data);
      } else if (response.code === 401 || response.code === 403) {
        message.error('登录已过期，请重新登录');
      } else {
        message.error(response.message || '获取统计数据失败');
      }
    } catch (error) {
      const status = getErrorStatus(error);
      if (status === 401 || status === 403) {
        message.error('登录已过期，请重新登录');
        return;
      }
      message.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const statsConfig = [
    {
      key: 'sampleDevelopment' as keyof TopStatsData,
      icon: <TagsOutlined />,
      label: '样衣开发',
      color: '#8b5cf6', // 紫色
    },
    {
      key: 'bulkOrder' as keyof TopStatsData,
      icon: <ShoppingCartOutlined />,
      label: '大货下单',
      color: '#3b82f6', // 蓝色
    },
    {
      key: 'cutting' as keyof TopStatsData,
      icon: <ScissorOutlined />,
      label: '裁剪数量',
      color: '#f59e0b', // 橙色
    },
    {
      key: 'warehousing' as keyof TopStatsData,
      icon: <InboxOutlined />,
      label: '出入库数量',
      color: '#10b981', // 绿色
    },
  ];

  return (
    <div className="top-stats-container">
      <div className="top-stats-grid">
        {statsConfig.map((config) => (
          <StatCard
            key={config.key}
            dataKey={config.key}
            icon={config.icon}
            label={config.label}
            color={config.color}
            data={statsData?.[config.key] || null}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
};

export default TopStats;
