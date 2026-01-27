import React, { useEffect, useState } from 'react';
import { Card, Spin, message } from 'antd';
import { InboxOutlined, WarningOutlined, CheckCircleOutlined, LineChartOutlined, ToolOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import './styles.css';

interface QualityStats {
  totalWarehousing: number;
  defectiveCount: number;
  defectRate: number;
  qualifiedRate: number;
  repairIssues: number;
}

type TimeRange = 'day' | 'week' | 'month';

const MiniDataDashboard: React.FC = () => {
  const [stats, setStats] = useState<QualityStats>({
    totalWarehousing: 0,
    defectiveCount: 0,
    defectRate: 0,
    qualifiedRate: 0,
    repairIssues: 0,
  });
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('week');

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: QualityStats }>('/dashboard/quality-stats', {
        params: { range: timeRange }
      });
      if (response.code === 200) {
        const d = response.data as QualityStats || {} as QualityStats;
        setStats({
          totalWarehousing: d.totalWarehousing ?? 0,
          defectiveCount: d.defectiveCount ?? 0,
          defectRate: d.defectRate ?? 0,
          qualifiedRate: d.qualifiedRate ?? 0,
          repairIssues: d.repairIssues ?? 0,
        });
      } else {
        message.error(response.message || '获取质检统计失败');
      }
    } catch (error: any) {
      console.error('获取质检统计失败:', error);
      // 不显示错误提示，避免干扰首页用户体验
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [timeRange]);

  return (
    <Card 
      className="mini-data-dashboard" 
      title="🔍 质检统计概览"
      extra={
        <div className="time-range-selector">
          <button
            className={`time-range-btn ${timeRange === 'day' ? 'active' : ''}`}
            onClick={() => setTimeRange('day')}
          >
            日
          </button>
          <button
            className={`time-range-btn ${timeRange === 'week' ? 'active' : ''}`}
            onClick={() => setTimeRange('week')}
          >
            周
          </button>
          <button
            className={`time-range-btn ${timeRange === 'month' ? 'active' : ''}`}
            onClick={() => setTimeRange('month')}
          >
            月
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="mini-dashboard-loading">
          <Spin />
        </div>
      ) : (
        <div className="mini-dashboard-grid">
          <div className="mini-stat-card mini-stat-card--warehousing">
            <div className="mini-stat-icon mini-stat-icon--warehousing">
              <InboxOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.totalWarehousing}</div>
              <div className="mini-stat-label">入库数</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--defective">
            <div className="mini-stat-icon mini-stat-icon--defective">
              <WarningOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.defectiveCount}</div>
              <div className="mini-stat-label">次品数</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--defect-rate">
            <div className="mini-stat-icon mini-stat-icon--defect-rate">
              <LineChartOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.defectRate.toFixed(2)}%</div>
              <div className="mini-stat-label">次品率</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--qualified">
            <div className="mini-stat-icon mini-stat-icon--qualified">
              <CheckCircleOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.qualifiedRate.toFixed(2)}%</div>
              <div className="mini-stat-label">合格率</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--repair">
            <div className="mini-stat-icon mini-stat-icon--repair">
              <ToolOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.repairIssues}</div>
              <div className="mini-stat-label">返修问题</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MiniDataDashboard;
