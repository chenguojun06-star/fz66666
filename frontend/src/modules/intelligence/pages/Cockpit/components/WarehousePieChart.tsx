import React, { useEffect, useState, useMemo, useRef } from 'react';
import PieChartCard, { PieSegment } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
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

interface WarehousePieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

interface StyleStats {
  styleNo: string;
  styleName: string;
  totalQty: number;
  inboundQty: number;
  outboundQty: number;
}

const WarehousePieChart: React.FC<WarehousePieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [inventory, setInventory] = useState<FinishedInventory[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange();
        const [ordersRes, inventoryRes] = await Promise.all([
          api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
            params: { 
              page: 1, 
              pageSize: 500,
              startDate: start.toISOString(),
              endDate: end.toISOString(),
              excludeTerminal: true,
            },
          }),
          api.post<{ code: number; data: { records?: FinishedInventory[] } }>(
            '/warehouse/finished-inventory/list',
            { 
              page: 1, 
              pageSize: 500,
              startDate: start.toISOString(),
              endDate: end.toISOString(),
            }
          ),
        ]);
        setOrders(ordersRes?.data?.records || []);
        setInventory(inventoryRes?.data?.records || []);
      } catch (e) {
        console.error('Load warehouse data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [dimension, getDateRange]);

  const styleList = useMemo(() => {
    const styleNos = new Map<string, string>();
    inventory.forEach(i => {
      if (i.styleNo) styleNos.set(i.styleNo, i.styleName || i.styleNo);
    });
    orders.forEach(o => {
      if (o.styleNo) styleNos.set(o.styleNo, o.styleName || o.styleNo);
    });
    return Array.from(styleNos.entries()).map(([styleNo, styleName]) => ({ styleNo, styleName }));
  }, [orders, inventory]);

  const prevStyleListRef = useRef<string>('');
  const prevPositionRef = useRef<string>('');

  useEffect(() => {
    if (mode !== 'stage' || !styleLink || !moduleKey || !position || styleList.length === 0) return;
    
    const styleListKey = styleList.map(s => s.styleNo).sort().join(',');
    const positionKey = `${position.x},${position.y},${position.width},${position.height}`;
    
    if (prevStyleListRef.current === styleListKey && prevPositionRef.current === positionKey) {
      return;
    }
    
    prevStyleListRef.current = styleListKey;
    prevPositionRef.current = positionKey;
    
    styleLink.registerStyle(moduleKey, styleList, position);
  }, [mode, styleLink, moduleKey, position, styleList]);

  useEffect(() => {
    return () => {
      if (styleLink && moduleKey) {
        styleLink.unregisterModule(moduleKey);
      }
    };
  }, [styleLink, moduleKey]);

  const stats = useMemo(() => {
    const totalInStock = inventory.reduce((sum, i) => sum + (i.availableQty || 0) + (i.lockedQty || 0) + (i.defectQty || 0), 0);
    const totalOutStock = orders.reduce((sum, o) => sum + (o.outstockQuantity || 0), 0);
    const totalPendingInbound = orders
      .filter(o => { const s = String(o.status||'').toUpperCase(); return s === 'COMPLETED' || s === 'PRODUCTION'; })
      .reduce((sum, o) => {
        const produced = o.completedQuantity || 0;
        const instock = o.inStockQuantity || 0;
        return sum + Math.max(0, produced - instock);
      }, 0);

    const totalQty = totalPendingInbound + totalInStock + totalOutStock;

    const stageQuantities: PieSegment[] = [
      { key: 'pending', label: '待入库', color: '#64748b', count: Math.round(totalPendingInbound) },
      { key: 'instock', label: '已入库', color: '#10b981', count: Math.round(totalInStock) },
      { key: 'outstock', label: '已出库', color: '#3b82f6', count: Math.round(totalOutStock) },
    ];

    const styleMap = new Map<string, StyleStats>();
    inventory.forEach(i => {
      const key = i.styleNo || '未知款号';
      const existing = styleMap.get(key) || {
        styleNo: i.styleNo,
        styleName: i.styleName || i.styleNo,
        totalQty: 0,
        inboundQty: 0,
        outboundQty: 0,
      };
      existing.inboundQty += (i.availableQty || 0) + (i.lockedQty || 0) + (i.defectQty || 0);
      existing.totalQty = existing.inboundQty + existing.outboundQty;
      styleMap.set(key, existing);
    });

    orders.forEach(o => {
      if (!o.styleNo) return;
      const key = o.styleNo;
      const existing = styleMap.get(key) || {
        styleNo: o.styleNo,
        styleName: o.styleName || o.styleNo,
        totalQty: 0,
        inboundQty: 0,
        outboundQty: 0,
      };
      existing.outboundQty += o.outstockQuantity || 0;
      existing.totalQty = existing.inboundQty + existing.outboundQty;
      styleMap.set(key, existing);
    });

    const styleStats = Array.from(styleMap.values())
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 8);

    return { totalQty, totalPendingInbound, totalInStock, totalOutStock, stageQuantities, styleStats };
  }, [orders, inventory]);

  const segments: PieSegment[] = stats.stageQuantities;

  return (
    <div className="warehouse-pie-wrapper">
      <PieChartCard
        mode={mode}
        title="成品仓库"
        total={stats.totalQty}
        inProgress={stats.totalPendingInbound}
        completed={stats.totalInStock}
        avgTime={stats.totalOutStock > 0 ? `已出库${stats.totalOutStock}件` : undefined}
        segments={segments}
        loading={loading}
      />
      
      {mode === 'stage' && stats.styleStats.length > 0 && (
        <div className="style-stats">
          <div className="style-stats-header">款号库存统计</div>
          <div className="style-stats-list">
            {stats.styleStats.map(style => (
              <div key={style.styleNo} className="style-stats-item">
                <span className="style-no">{style.styleNo}</span>
                <span className="style-percent">
                  {stats.totalQty > 0 ? Math.round((style.totalQty / stats.totalQty) * 100) : 0}%
                </span>
                <span className="style-detail">{style.totalQty}件</span>
                <span className="style-detail style-instock">入库{style.inboundQty}</span>
                {style.outboundQty > 0 && (
                  <span className="style-detail style-outstock">出库{style.outboundQty}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(WarehousePieChart);
