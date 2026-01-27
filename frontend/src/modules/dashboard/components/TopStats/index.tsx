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

type TimeRange = 'day' | 'week' | 'month' | 'year';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  dataKey: string;
  color: string;
  bgGradient: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, dataKey, color, bgGradient }) => {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [value, setValue] = useState<number>(0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/api/dashboard/top-stats', {
        params: { range: timeRange },
      });
      if (response.success && response.data) {
        setValue(response.data[dataKey] || 0);
      }
    } catch (error) {
      message.error('获取统计数据失败');
      console.error('获取统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange]);

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
    { value: 'year', label: '年' },
  ];

  return (
    <div className="top-stat-item" style={{ background: bgGradient }}>
      <Spin spinning={loading}>
        <div className="stat-card-content">
          {/* 第1行：图标 + 数量 + 标签 */}
          <div className="stat-header">
            <div className="stat-icon-circle" style={{ background: `rgba(255, 255, 255, 0.3)` }}>
              <span className="stat-icon" style={{ color }}>{icon}</span>
            </div>
            <div className="stat-info">
              <div className="stat-value">{value.toLocaleString()}</div>
              <div className="stat-label">{label}</div>
            </div>
          </div>

          {/* 第2行：时间选择器 */}
          <div className="stat-time-selector">
            {timeRanges.map(({ value: rangeValue, label: rangeLabel }) => (
              <button
                key={rangeValue}
                className={`stat-time-button ${timeRange === rangeValue ? 'active' : ''}`}
                onClick={() => setTimeRange(rangeValue)}
              >
                {rangeLabel}
              </button>
            ))}
          </div>
        </div>
      </Spin>
    </div>
  );
};

const TopStats: React.FC = () => {
  const statsConfig = [
    {
      key: 'sampleDevelopmentCount',
      icon: <TagsOutlined />,
      label: '样衣开发',
      color: '#8b5cf6',
      bgGradient: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
    },
    {
      key: 'bulkOrderCount',
      icon: <ShoppingCartOutlined />,
      label: '大货下单',
      color: '#3b82f6',
      bgGradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
    },
    {
      key: 'cuttingCount',
      icon: <ScissorOutlined />,
      label: '裁剪数量',
      color: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      key: 'warehousingCount',
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
          />
        ))}
      </div>
    </div>
  );
};

export default TopStats;
