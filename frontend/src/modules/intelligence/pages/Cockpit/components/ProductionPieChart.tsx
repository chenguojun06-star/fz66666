import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Spin, Empty, Popover } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import './ProductionPieChart.css';

const PROCESS_STAGES = [
  { key: 'cutting', label: '裁剪', color: '#7c3aed' },
  { key: 'secondaryProcess', label: '二次工艺', color: '#d97706' },
  { key: 'sewing', label: '车缝', color: '#0891b2' },
  { key: 'tail', label: '尾部', color: '#db2777' },
];

const formatDays = (days: number): string => {
  if (days < 1) return '<1天';
  if (days < 30) return `${Math.round(days)}天`;
  const months = Math.floor(days / 30);
  const remainDays = Math.round(days % 30);
  return remainDays > 0 ? `${months}月${remainDays}天` : `${months}月`;
};

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const getStageRate = (order: ProductionOrder, rateField: string): number => {
  const rate = order[rateField as keyof ProductionOrder];
  if (rate == null) return 0;
  const numRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
  return isNaN(numRate) ? 0 : numRate;
};

const ProductionPieChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [factoryCapacity, setFactoryCapacity] = useState<FactoryCapacityItem[]>([]);
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const [ordersRes, factoryRes] = await Promise.all([
        api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: { page: 1, pageSize: 1000, startDate: start.toISOString(), endDate: end.toISOString() },
        }),
        api.get<{ code: number; data: FactoryCapacityItem[] }>('/production/order/factory-capacity'),
      ]);
      setOrders(ordersRes?.data?.records || []);
      setFactoryCapacity(factoryRes?.data || []);
    } catch (e) {
      console.error('Load production data failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const inProgress = orders.filter(o => String(o.status || '').toUpperCase() === 'PRODUCTION').length;
    const completed = orders.filter(o => String(o.status || '').toUpperCase() === 'COMPLETED').length;
    const totalQuantity = orders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    const stageStats = PROCESS_STAGES.map(stage => {
      let filteredOrders = stage.key === 'secondaryProcess'
        ? orders.filter(o => o.hasSecondaryProcess === true)
        : orders;
      const notStarted = filteredOrders.filter(o => getStageRate(o, `${stage.key}Rate`) === 0);
      const inProg = filteredOrders.filter(o => {
        const rate = getStageRate(o, `${stage.key}Rate`);
        return rate > 0 && rate < 100;
      });
      const comp = filteredOrders.filter(o => getStageRate(o, `${stage.key}Rate`) >= 100);
      return {
        key: stage.key,
        label: stage.label,
        color: stage.color,
        notStartedQty: notStarted.reduce((s, o) => s + (o.orderQuantity || 0), 0),
        inProgressQty: inProg.reduce((s, o) => s + (o.orderQuantity || 0), 0),
        completedQty: comp.reduce((s, o) => s + (o.orderQuantity || 0), 0),
      };
    });

    const completedOrders = orders.filter(o => o.actualStartDate && o.actualEndDate);
    let avgDays = 0;
    if (completedOrders.length > 0) {
      const totalDays = completedOrders.reduce((sum, o) => {
        const start = new Date(o.actualStartDate!).getTime();
        const end = new Date(o.actualEndDate!).getTime();
        return sum + (end - start) / (1000 * 60 * 60 * 24);
      }, 0);
      avgDays = totalDays / completedOrders.length;
    }

    const factoryStats = (factoryCapacity || []).map(f => ({
      factoryName: f.factoryName || '未知工厂',
      orderCount: f.totalOrders || 0,
      totalQuantity: f.totalQuantity || 0,
      completionRate: f.deliveryOnTimeRate >= 0 ? f.deliveryOnTimeRate : 0,
      avgDeliveryDays: f.estimatedCompletionDays >= 0 ? f.estimatedCompletionDays : 0,
      overdueCount: f.overdueCount || 0,
    })).sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5);

    const todayCompletedOrders = orders.filter(o =>
      String(o.status || '').toUpperCase() === 'COMPLETED' && isToday(o.actualEndDate)
    );
    const todayCompletedQty = todayCompletedOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    return { totalOrders, totalQuantity, inProgress, completed, stageStats, avgDays, factoryStats, todayCompletedCount: todayCompletedOrders.length, todayCompletedQty };
  }, [orders, factoryCapacity]);

  const overdueOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter(o =>
      String(o.status || '').toUpperCase() !== 'COMPLETED' &&
      o.plannedEndDate &&
      new Date(o.plannedEndDate) < today
    );
  }, [orders]);

  const overduePopover = (
    <div style={{ maxHeight: 200, overflowY: 'auto', minWidth: 180 }}>
      {overdueOrders.slice(0, 10).map((o, i) => {
        const days = Math.floor((Date.now() - new Date(o.plannedEndDate!).getTime()) / 86400000);
        return (
          <div key={o.id || i} onClick={() => navigate('/production')} style={{ padding: '4px 0', cursor: 'pointer', fontSize: 12, borderBottom: i < overdueOrders.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.orderNo}</span>
            <span style={{ color: '#ef4444', flexShrink: 0 }}>逾期{days}天</span>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (stats.totalQuantity === 0) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;
  }

  return (
    <div className="production-card-wrapper">
      {/* 核心指标 */}
      <div className="production-metrics">
        <div className="production-metric">
          <div className="production-metric-value">{stats.totalQuantity.toLocaleString()}</div>
          <div className="production-metric-label">总件数</div>
        </div>
        <div className="production-metric">
          <div className="production-metric-value production-metric-value--primary">{stats.inProgress}</div>
          <div className="production-metric-label">生产中</div>
        </div>
        <div className="production-metric">
          <div className="production-metric-value production-metric-value--success">{stats.completed}</div>
          <div className="production-metric-label">已完成</div>
        </div>
        <div className="production-metric">
          <div className="production-metric-value">{formatDays(stats.avgDays)}</div>
          <div className="production-metric-label">平均周期</div>
        </div>
      </div>

      {/* 工序进度 */}
      <div className="production-stages">
        {stats.stageStats.map(stage => {
          const total = stage.notStartedQty + stage.inProgressQty + stage.completedQty;
          const notStartedPct = total > 0 ? Math.round((stage.notStartedQty / total) * 100) : 0;
          const inProgressPct = total > 0 ? Math.round((stage.inProgressQty / total) * 100) : 0;
          const completedPct = total > 0 ? Math.round((stage.completedQty / total) * 100) : 0;
          return (
            <div key={stage.key} className="production-stage-item">
              <div className="production-stage-header">
                <span className="production-stage-dot" style={{ background: stage.color }} />
                <span className="production-stage-label">{stage.label}</span>
              </div>
              <div className="production-stage-bar">
                {notStartedPct > 0 && <div className="production-stage-seg" style={{ width: `${notStartedPct}%`, background: '#e2e8f0' }} />}
                {inProgressPct > 0 && <div className="production-stage-seg" style={{ width: `${inProgressPct}%`, background: stage.color }} />}
                {completedPct > 0 && <div className="production-stage-seg" style={{ width: `${completedPct}%`, background: '#059669' }} />}
              </div>
              <div className="production-stage-info">
                <span className="production-stage-pct">完成 {completedPct}%</span>
                <span className="production-stage-qty">{stage.inProgressQty.toLocaleString()}件</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 今日完成 */}
      <div className="production-today-row">
        <div className="production-today-stat">
          <span className="production-today-label">今日完成</span>
          <span className="production-today-value production-today-value--success">{stats.todayCompletedQty.toLocaleString()}件</span>
        </div>
        {overdueOrders.length > 0 && (
          <Popover content={overduePopover} trigger="hover" placement="bottomLeft">
            <div className="production-warning" style={{ cursor: 'pointer' }}>
              <span>⚠ 逾期</span>
              <span>{overdueOrders.length}单</span>
            </div>
          </Popover>
        )}
      </div>

      {/* 工厂统计 */}
      {stats.factoryStats.length > 0 && (
        <div className="production-factory-list">
          {stats.factoryStats.map(factory => (
            <div key={factory.factoryName} className="production-factory-item">
              <span className="production-factory-name">{factory.factoryName}</span>
              <span className="production-factory-qty">{factory.totalQuantity.toLocaleString()}件</span>
              <span className="production-factory-rate">{factory.completionRate}%</span>
              {factory.overdueCount > 0 && <span className="production-factory-overdue">{factory.overdueCount}延期</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(ProductionPieChart);
