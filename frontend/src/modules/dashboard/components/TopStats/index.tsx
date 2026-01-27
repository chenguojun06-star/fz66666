import React, { useEffect, useState } from 'react';
import { Spin, message } from 'antd';
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
  bgGradient: string;
  data: TimeRangeStats | null;
  loading: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, dataKey, color, bgGradient, data, loading }) => {
  return (
    <div className="top-stat-item" style={{ borderColor: color }}>
      <Spin spinning={loading}>
        <div className="stat-card-content">
          {/* 头部：图标和标签 */}
          <div className="stat-header">
            <div className="stat-icon-circle" style={{ borderColor: color }}>
              <span className="stat-icon" style={{ color }}>{icon}</span>
            </div>
            <div className="stat-label" style={{ color }}>{label}</div>
          </div>

          {/* 数据展示：上下两行 */}
          <div className="stat-data-container">
            {/* 第1行：4个数量 */}
            <div className="stat-values-row">
              <div className="stat-value" style={{ color }}>{data?.day.toLocaleString() || 0}</div>
              <div className="stat-value" style={{ color }}>{data?.week.toLocaleString() || 0}</div>
              <div className="stat-value" style={{ color }}>{data?.month.toLocaleString() || 0}</div>
              <div className="stat-value" style={{ color }}>{data?.year.toLocaleString() || 0}</div>
            </div>

            {/* 第2行：4个时间标签 */}
            <div className="stat-labels-row">
              <div className="stat-time-label" style={{ color: `${color}99` }}>日</div>
              <div className="stat-time-label" style={{ color: `${color}99` }}>周</div>
              <div className="stat-time-label" style={{ color: `${color}99` }}>月</div>
              <div className="stat-time-label" style={{ color: `${color}99` }}>年</div>
            </div>
          </div>
        </div>
      </Spin>
    </div>
  );
};

const TopStats: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [statsData, setStatsData] = useState<TopStatsData | null>(null);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message?: string; data: TopStatsData }>('/dashboard/top-stats', {
        params: { range: 'week' }
      });
      if (response.code === 200 && response.data) {
        setStatsData(response.data);
      } else {
        message.error(response.message || '获取统计数据失败');
      }
    } catch (error) {
      message.error('获取统计数据失败');
      console.error('获取统计数据失败:', error);
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
      color: '#8b5cf6',
      bgGradient: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
    },
    {
      key: 'bulkOrder' as keyof TopStatsData,
      icon: <ShoppingCartOutlined />,
      label: '大货下单',
      color: '#3b82f6',
      bgGradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
    },
    {
      key: 'cutting' as keyof TopStatsData,
      icon: <ScissorOutlined />,
      label: '裁剪数量',
      color: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      key: 'warehousing' as keyof TopStatsData,
      icon: <InboxOutlined />,
      label: '出入库数量',
      color: '#10b981',
      bgGradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
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
            bgGradient={config.bgGradient}
            data={statsData?.[config.key] || null}
            loading={loading}
          />
        ))}
      </div>
    </div>
  );
};

export default TopStats;
