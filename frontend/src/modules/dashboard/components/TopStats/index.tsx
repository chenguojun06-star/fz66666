import React, { useEffect, useState } from 'react';
import { Card, Spin, message } from 'antd';
import {
  TagsOutlined,
  ShoppingCartOutlined,
  ScissorOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import './styles.css';

interface TopStatsData {
  sampleDevelopmentCount: number;  // 样衣开发数量
  bulkOrderCount: number;          // 大货下单数量
  cuttingCount: number;            // 裁剪数量
  warehousingCount: number;        // 出入库数量
}

type TimeRange = 'day' | 'week' | 'month' | 'year';

const TopStats: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [stats, setStats] = useState<TopStatsData>({
    sampleDevelopmentCount: 0,
    bulkOrderCount: 0,
    cuttingCount: 0,
    warehousingCount: 0,
  });

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<TopStatsData>('/api/dashboard/top-stats', {
        params: { range: timeRange },
      });
      if (response.success && response.data) {
        setStats(response.data);
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
  }, [timeRange]);

  const timeRanges: { value: TimeRange; label: string }[] = [
    { value: 'day', label: '日' },
    { value: 'week', label: '周' },
    { value: 'month', label: '月' },
    { value: 'year', label: '年' },
  ];

  const statsConfig = [
    {
      key: 'sampleDevelopmentCount',
      icon: <TagsOutlined />,
      label: '样衣开发',
      color: '#8b5cf6', // 紫色
      bgGradient: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
    },
    {
      key: 'bulkOrderCount',
      icon: <ShoppingCartOutlined />,
      label: '大货下单',
      color: '#3b82f6', // 蓝色
      bgGradient: 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
    },
    {
      key: 'cuttingCount',
      icon: <ScissorOutlined />,
      label: '裁剪数量',
      color: '#f59e0b', // 橙色
      bgGradient: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
    },
    {
      key: 'warehousingCount',
      icon: <InboxOutlined />,
      label: '出入库数量',
      color: '#10b981', // 绿色
      bgGradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
    },
  ];

  return (
    <Card className="top-stats-card">
      <div className="top-stats-header">
        <div className="time-selector">
          {timeRanges.map(({ value, label }) => (
            <button
              key={value}
              className={`time-button ${timeRange === value ? 'active' : ''}`}
              onClick={() => setTimeRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Spin spinning={loading}>
        <div className="top-stats-grid">
          {statsConfig.map(({ key, icon, label, color, bgGradient }) => (
            <div
              key={key}
              className="top-stat-item"
              style={{
                background: bgGradient,
              }}
            >
              <div className="top-stat-icon" style={{ color }}>
                {icon}
              </div>
              <div className="top-stat-content">
                <div className="top-stat-value">{stats[key as keyof TopStatsData]}</div>
                <div className="top-stat-label">{label}</div>
              </div>
            </div>
          ))}
        </div>
      </Spin>
    </Card>
  );
};

export default TopStats;
