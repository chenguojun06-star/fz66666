import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Spin, Empty } from 'antd';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import './WarehousePieChart.css';

interface FinishedInventory {
  id: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  totalInboundQty?: number;
}

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const WarehousePieChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [inventory, setInventory] = useState<FinishedInventory[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const [ordersRes, inventoryRes] = await Promise.all([
        api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
          params: { page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString(), excludeTerminal: true },
        }),
        api.post<{ code: number; data: { records?: FinishedInventory[] } }>('/warehouse/finished-inventory/list', {
          page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString(),
        }),
      ]);
      setOrders(ordersRes?.data?.records || []);
      setInventory(inventoryRes?.data?.records || []);
    } catch (e) {
      console.error('Load warehouse data failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalInStock = inventory.reduce((sum, i) => sum + (i.availableQty || 0) + (i.lockedQty || 0) + (i.defectQty || 0), 0);
    const totalOutStock = orders.reduce((sum, o) => sum + (o.outstockQuantity || 0), 0);
    const totalPendingInbound = orders
      .filter(o => { const s = String(o.status || '').toUpperCase(); return s === 'COMPLETED' || s === 'PRODUCTION'; })
      .reduce((sum, o) => {
        const produced = o.completedQuantity || 0;
        const instock = o.inStockQuantity || 0;
        return sum + Math.max(0, produced - instock);
      }, 0);

    const todayOutboundOrders = orders.filter(o => isToday(String(o.outstockTime || o.outstockDate)));
    const todayOutboundQty = todayOutboundOrders.reduce((sum, o) => sum + (o.outstockQuantity || 0), 0);

    return {
      totalPendingInbound,
      totalInStock,
      totalOutStock,
      totalQty: totalPendingInbound + totalInStock + totalOutStock,
      todayOutboundCount: todayOutboundOrders.length,
      todayOutboundQty,
    };
  }, [orders, inventory]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (stats.totalQty === 0) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;
  }

  return (
    <div className="warehouse-card-wrapper">
      {/* 核心指标 */}
      <div className="warehouse-metrics">
        <div className="warehouse-metric">
          <div className="warehouse-metric-value warehouse-metric-value--primary">{stats.totalPendingInbound.toLocaleString()}</div>
          <div className="warehouse-metric-label">待入库</div>
        </div>
        <div className="warehouse-metric">
          <div className="warehouse-metric-value warehouse-metric-value--success">{stats.totalInStock.toLocaleString()}</div>
          <div className="warehouse-metric-label">已入库</div>
        </div>
        <div className="warehouse-metric">
          <div className="warehouse-metric-value">{stats.totalOutStock.toLocaleString()}</div>
          <div className="warehouse-metric-label">已出库</div>
        </div>
        <div className="warehouse-metric">
          <div className="warehouse-metric-value">{stats.totalQty.toLocaleString()}</div>
          <div className="warehouse-metric-label">总件数</div>
        </div>
      </div>

      {/* 今日数据 */}
      <div className="warehouse-today-row">
        <div className="warehouse-today-stat">
          <span className="warehouse-today-label">今日出库</span>
          <span className="warehouse-today-value">{stats.todayOutboundCount}单</span>
        </div>
        <div className="warehouse-today-stat">
          <span className="warehouse-today-label">今日件数</span>
          <span className="warehouse-today-value warehouse-today-value--success">{stats.todayOutboundQty.toLocaleString()}件</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(WarehousePieChart);
