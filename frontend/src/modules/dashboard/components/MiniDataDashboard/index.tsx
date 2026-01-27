import React, { useEffect, useState } from 'react';
import { Card, Spin, message } from 'antd';
import { FileTextOutlined, ShoppingCartOutlined, ApartmentOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import './styles.css';

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

const MiniDataDashboard: React.FC = () => {
  const [stats, setStats] = useState<DataCenterStats>({
    styleCount: 0,
    materialCount: 0,
    productionCount: 0,
  });
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: DataCenterStats }>('/data-center/stats');
      if (response.code === 200) {
        const d = response.data as DataCenterStats || {} as DataCenterStats;
        setStats({
          styleCount: d.styleCount ?? 0,
          materialCount: d.materialCount ?? 0,
          productionCount: d.productionCount ?? 0,
        });
      } else {
        message.error(response.message || '获取资料中心统计失败');
      }
    } catch (error: any) {
      console.error('获取资料中心统计失败:', error);
      // 不显示错误提示，避免干扰首页用户体验
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <Card className="mini-data-dashboard" title="📊 资料中心统计">
      {loading ? (
        <div className="mini-dashboard-loading">
          <Spin />
        </div>
      ) : (
        <div className="mini-dashboard-grid">
          <div className="mini-stat-card mini-stat-card--style">
            <div className="mini-stat-icon mini-stat-icon--style">
              <FileTextOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.styleCount}</div>
              <div className="mini-stat-label">款号总数</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--material">
            <div className="mini-stat-icon mini-stat-icon--material">
              <ShoppingCartOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.materialCount}</div>
              <div className="mini-stat-label">物料总数</div>
            </div>
          </div>

          <div className="mini-stat-card mini-stat-card--production">
            <div className="mini-stat-icon mini-stat-icon--production">
              <ApartmentOutlined />
            </div>
            <div className="mini-stat-content">
              <div className="mini-stat-value">{stats.productionCount}</div>
              <div className="mini-stat-label">生产订单</div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

export default MiniDataDashboard;
