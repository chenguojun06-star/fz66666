import React, { useEffect, useState, useMemo, useCallback, memo } from 'react';
import { Card, Avatar, Tag, Tooltip } from 'antd';
import { TrophyOutlined, ClockCircleOutlined, UserOutlined, CalendarOutlined, ShoppingCartOutlined, AppstoreOutlined } from '@ant-design/icons';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import dayjs from 'dayjs';
import './OrderRankingDashboard.css';
import { StyleInfo } from '@/types/style';

interface TopStyleItem {
  styleNo: string;
  styleName: string;
  cover?: string;
  orderCount: number;
  totalOrderQuantity?: number;
  latestOrderCreator?: string;
  latestOrderTime?: string;
  firstOrderTime?: string;
  avgOrderCycle?: number;
  fullData: StyleInfo;
}

interface OrderRankingStats {
  totalOrders: number;
  todayOrders: number;
  weekOrders: number;
  topStyles: TopStyleItem[];
}

const TOP_COUNT = 50;
const RANK_COLORS: Record<number, string> = { 0: '#ffd700', 1: '#c0c0c0', 2: '#cd7f32' };

interface OrderRankingDashboardProps {
  onOrderClick: (style: StyleInfo) => void;
}

const RankingItem = memo(({ item, idx, onOrderClick }: {
  item: TopStyleItem;
  idx: number;
  onOrderClick: (style: StyleInfo) => void;
}) => {
  const tooltipContent = useMemo(() => (
    <div className="ranking-tooltip">
      <div className="tooltip-title">{item.styleNo} - {item.styleName}</div>
      <div className="tooltip-item"><ShoppingCartOutlined /> 下单总数: <b>{item.orderCount}次</b></div>
      <div className="tooltip-item"><AppstoreOutlined /> 下单总件数: <b>{item.totalOrderQuantity || 0}件</b></div>
      <div className="tooltip-item"><UserOutlined /> 最新下单人: {item.latestOrderCreator || '-'}</div>
      <div className="tooltip-item"><CalendarOutlined /> 最新下单: {item.latestOrderTime ? dayjs(item.latestOrderTime).format('MM-DD') : '-'}</div>
      {(item.avgOrderCycle ?? 0) > 0 && (
        <div className="tooltip-item"><ClockCircleOutlined /> 平均下单周期: <b>{item.avgOrderCycle}天</b></div>
      )}
      <div className="tooltip-hint"><TrophyOutlined /> 点击卡片快速下单</div>
    </div>
  ), [item.styleNo, item.styleName, item.orderCount, item.totalOrderQuantity, item.latestOrderCreator, item.latestOrderTime, item.avgOrderCycle]);

  const rankBgColor = RANK_COLORS[idx] || 'var(--neutral-border)';

  const handleClick = useCallback(() => {
    onOrderClick(item.fullData);
  }, [onOrderClick, item.fullData]);

  return (
    <Tooltip title={tooltipContent} placement="bottom" classNames={{ root: 'ranking-tooltip-overlay' }}>
      <div className="ranking-grid-item" onClick={handleClick}>
        <span className="rank-number" style={{ backgroundColor: rankBgColor }}>{idx + 1}</span>
        <Avatar src={getFullAuthedFileUrl(item.cover)} size={28} shape="square">
          {item.styleNo?.charAt(0)}
        </Avatar>
        <div className="ranking-info">
          <span className="style-no" title={item.styleNo}>{item.styleNo}</span>
          <Tag color="blue" style={{ fontSize: '10px', lineHeight: '14px', padding: '0 3px' }}>{item.orderCount}次</Tag>
        </div>
      </div>
    </Tooltip>
  );
});

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
              totalOrderQuantity: r.totalOrderQuantity || 0,
              latestOrderCreator: r.latestOrderCreator,
              latestOrderTime,
              firstOrderTime,
              avgOrderCycle,
              fullData: r,
            };
          });

        let todayOrders = 0;
        let weekOrders = 0;
        let totalOrders = 0;
        for (const r of withOrders) {
          totalOrders += r.orderCount || 0;
          if (r.latestOrderTime) {
            const t = dayjs(r.latestOrderTime);
            if (t.isAfter(today)) todayOrders++;
            if (t.isAfter(weekStart)) weekOrders++;
          }
        }

        setStats({ totalOrders, todayOrders, weekOrders, topStyles });
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

  const topCount = stats?.topStyles?.length || 0;

  return (
    <Card className="order-ranking-grid" loading={loading}>
      <div className="ranking-grid-header">
        <TrophyOutlined className="ranking-icon" />
        <span className="ranking-title">下单排行 TOP{topCount}</span>
        <div className="ranking-stats">
          <span>累计: <b>{stats?.totalOrders || 0}</b></span>
          <span>今日: <b>{stats?.todayOrders || 0}</b></span>
          <span>本周: <b>{stats?.weekOrders || 0}</b></span>
        </div>
      </div>

      <div className="ranking-grid-container">
        {stats?.topStyles?.map((item, idx) => (
          <RankingItem key={item.styleNo} item={item} idx={idx} onOrderClick={onOrderClick} />
        ))}
        {!topCount && (
          <div className="ranking-empty">暂无下单数据</div>
        )}
      </div>
    </Card>
  );
};

export default OrderRankingDashboard;
