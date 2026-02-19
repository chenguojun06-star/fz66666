import React, { useEffect, useState } from 'react';
import { Card, Avatar, Tag, Tooltip } from 'antd';
import { TrophyOutlined, ClockCircleOutlined, UserOutlined, CalendarOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import dayjs from 'dayjs';
import './OrderRankingDashboard.css';
import { StyleInfo } from '@/types/style';

interface OrderRankingStats {
  totalOrders: number;
  todayOrders: number;
  weekOrders: number;
  topStyles: Array<{
    styleNo: string;
    styleName: string;
    cover?: string;
    orderCount: number;
    latestOrderCreator?: string;
    latestOrderTime?: string;
    firstOrderTime?: string;
    avgOrderCycle?: number;
    fullData: StyleInfo;
  }>;
}

const TOP_COUNT = 50;

interface OrderRankingDashboardProps {
  onOrderClick: (style: StyleInfo) => void;
}

const OrderRankingDashboard: React.FC<OrderRankingDashboardProps> = ({ onOrderClick }) => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<OrderRankingStats | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: StyleInfo[] } }>('/style/info/list', {
        params: { page: 1, pageSize: 100, onlyCompleted: true }
      });

      if (res.code === 200) {
        const records = res.data?.records || [];
        const withOrders = records.filter(r => (r.orderCount || 0) > 0);

        const today = dayjs().startOf('day');
        const weekStart = dayjs().startOf('week');

        const topStyles = withOrders
          .sort((a, b) => (b.orderCount || 0) - (a.orderCount || 0))
          .slice(0, TOP_COUNT)
          .map(r => {
            const orderCount = r.orderCount || 0;
            const latestOrderTime = r.latestOrderTime;
            const firstOrderTime = r.firstOrderTime || r.createTime;

            let avgOrderCycle = 0;
            if (orderCount > 1 && firstOrderTime && latestOrderTime) {
              const first = dayjs(firstOrderTime);
              const latest = dayjs(latestOrderTime);
              const daysDiff = latest.diff(first, 'day');
              avgOrderCycle = Math.round(daysDiff / (orderCount - 1));
            }

            return {
              styleNo: r.styleNo,
              styleName: r.styleName,
              cover: r.cover,
              orderCount,
              latestOrderCreator: r.latestOrderCreator,
              latestOrderTime,
              firstOrderTime,
              avgOrderCycle,
              fullData: r,
            };
          });

        setStats({
          totalOrders: withOrders.reduce((sum, r) => sum + (r.orderCount || 0), 0),
          todayOrders: withOrders.filter(r => r.latestOrderTime && dayjs(r.latestOrderTime).isAfter(today)).length,
          weekOrders: withOrders.filter(r => r.latestOrderTime && dayjs(r.latestOrderTime).isAfter(weekStart)).length,
          topStyles,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 60000);
    return () => clearInterval(timer);
  }, []);

  const rankColors = ['#ffd700', '#c0c0c0', '#cd7f32'];

  const renderTooltipContent = (item: OrderRankingStats['topStyles'][0]) => {
    return (
      <div className="ranking-tooltip">
        <div className="tooltip-title">{item.styleNo} - {item.styleName}</div>
        <div className="tooltip-item">
          <UserOutlined /> 最新下单人: {item.latestOrderCreator || '-'}
        </div>
        <div className="tooltip-item">
          <CalendarOutlined /> 最新下单: {item.latestOrderTime ? dayjs(item.latestOrderTime).format('MM-DD HH:mm') : '-'}
        </div>
        {item.avgOrderCycle > 0 && (
          <div className="tooltip-item">
            <ClockCircleOutlined /> 平均下单周期: <b>{item.avgOrderCycle}天</b>
          </div>
        )}
        <div className="tooltip-item">
          <TrophyOutlined /> 累计下单: <b>{item.orderCount}次</b>
        </div>
        <div className="tooltip-hint">
          <ShoppingCartOutlined /> 点击卡片快速下单
        </div>
      </div>
    );
  };

  return (
    <Card className="order-ranking-grid" size="small" loading={loading}>
      <div className="ranking-grid-header">
        <TrophyOutlined className="ranking-icon" />
        <span className="ranking-title">下单排行 TOP{stats?.topStyles?.length || 0}</span>
        <div className="ranking-stats">
          <span>累计: <b>{stats?.totalOrders || 0}</b></span>
          <span>今日: <b>{stats?.todayOrders || 0}</b></span>
          <span>本周: <b>{stats?.weekOrders || 0}</b></span>
        </div>
      </div>

      <div className="ranking-grid-container">
        {stats?.topStyles?.map((item, idx) => (
          <Tooltip
            key={item.styleNo}
            title={renderTooltipContent(item)}
            placement="top"
            classNames={{ root: 'ranking-tooltip-overlay' }}
          >
            <div
              className="ranking-grid-item"
              onClick={() => onOrderClick(item.fullData)}
            >
              <span
                className="rank-number"
                style={{ backgroundColor: rankColors[idx] || 'var(--neutral-border)' }}
              >
                {idx + 1}
              </span>
              <Avatar src={getFullAuthedFileUrl(item.cover)} size={28} shape="square">
                {item.styleNo?.charAt(0)}
              </Avatar>
              <div className="ranking-info">
                <span className="style-no" title={item.styleNo}>{item.styleNo}</span>
                <Tag color="blue" style={{ fontSize: '10px', lineHeight: '14px', padding: '0 3px' }}>{item.orderCount}次</Tag>
              </div>
            </div>
          </Tooltip>
        ))}
        {!stats?.topStyles?.length && (
          <div className="ranking-empty">暂无下单数据</div>
        )}
      </div>
    </Card>
  );
};

export default OrderRankingDashboard;
