import React, { useEffect, useState, useMemo } from 'react';
import PieChartCard, { PieSegment } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import './ProductionPieChart.css';

const PROCESS_STAGES = [
  { key: 'procurement', label: '采购', color: '#3b82f6', rateField: 'procurementCompletionRate' },
  { key: 'cutting', label: '裁剪', color: '#8b5cf6', rateField: 'cuttingCompletionRate' },
  { key: 'secondaryProcess', label: '二次工艺', color: '#f59e0b', rateField: 'secondaryProcessRate' },
  { key: 'sewing', label: '车缝', color: '#06b6d4', rateField: 'sewingCompletionRate' },
  { key: 'tail', label: '尾部', color: '#ec4899', rateField: 'tailProcessRate' },
];

const formatDays = (days: number): string => {
  if (days < 1) return '<1天';
  if (days < 30) return `${Math.round(days)}天`;
  const months = Math.floor(days / 30);
  const remainDays = Math.round(days % 30);
  return remainDays > 0 ? `${months}月${remainDays}天` : `${months}月`;
};

const getStageRate = (order: ProductionOrder, rateField: string): number => {
  const rate = order[rateField as keyof ProductionOrder];
  if (rate == null) return 0;
  const numRate = typeof rate === 'number' ? rate : parseFloat(String(rate));
  return isNaN(numRate) ? 0 : numRate;
};

const getWarehousingRate = (order: ProductionOrder): number => {
  const qualified = Number(order.warehousingQualifiedQuantity ?? 0) || 0;
  const total = Number(order.cuttingQuantity || order.orderQuantity) || 1;
  return Math.min(100, Math.round((qualified / total) * 100));
};

interface ProductionPieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

interface FactoryStats {
  factoryName: string;
  orderCount: number;
  totalQuantity: number;
  completedQuantity: number;
  completionRate: number;
  avgDeliveryDays: number;
  overdueCount: number;
  atRiskCount: number;
}

const ProductionPieChart: React.FC<ProductionPieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [factoryCapacity, setFactoryCapacity] = useState<FactoryCapacityItem[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [ordersRes, factoryRes] = await Promise.all([
          api.get<{ code: number; data: { records?: ProductionOrder[] } }>('/production/order/list', {
            params: { 
              page: 1, 
              pageSize: 1000,
            },
          }),
          api.get<{ code: number; data: FactoryCapacityItem[] }>('/production/order/factory-capacity'),
        ]);
        console.log('Orders:', ordersRes?.data?.records?.length);
        console.log('Factory capacity:', factoryRes?.data);
        setOrders(ordersRes?.data?.records || []);
        setFactoryCapacity(factoryRes?.data || []);
      } catch (e) {
        console.error('Load production data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, []);

  const styleList = useMemo(() => {
    return orders
      .filter(o => o.styleNo)
      .map(o => ({ styleNo: o.styleNo, styleName: o.styleName }));
  }, [orders]);

  useEffect(() => {
    if (mode === 'stage' && styleLink && moduleKey && position && styleList.length > 0) {
      styleLink.registerStyle(moduleKey, styleList, position);
    }
  }, [mode, styleLink, moduleKey, position, styleList]);

  useEffect(() => {
    return () => {
      if (styleLink && moduleKey) {
        styleLink.unregisterModule(moduleKey);
      }
    };
  }, [styleLink, moduleKey]);

  const stats = useMemo(() => {
    const totalOrders = orders.length;
    const inProgress = orders.filter(o => String(o.status||'').toUpperCase() === 'PRODUCTION').length;
    const completed = orders.filter(o => String(o.status||'').toUpperCase() === 'COMPLETED').length;

    const totalQuantity = orders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);

    const stageQuantities: PieSegment[] = [
      ...PROCESS_STAGES.map(stage => {
        const matchedOrders = orders.filter(o => getStageRate(o, stage.rateField) >= 100);
        const quantity = matchedOrders.reduce((sum, o) => sum + (o.orderQuantity || 0), 0);
        return {
          key: stage.key,
          label: stage.label,
          color: stage.color,
          count: quantity,
        };
      }),
      {
        key: 'warehousing',
        label: '入库',
        color: '#10b981',
        count: orders.filter(o => getWarehousingRate(o) >= 100).reduce((sum, o) => sum + (o.orderQuantity || 0), 0),
      },
    ];

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
      completedQuantity: 0,
      completionRate: f.deliveryOnTimeRate >= 0 ? f.deliveryOnTimeRate : 0,
      avgDeliveryDays: f.estimatedCompletionDays >= 0 ? f.estimatedCompletionDays : 0,
      overdueCount: f.overdueCount || 0,
      atRiskCount: f.atRiskCount || 0,
    })).sort((a, b) => b.totalQuantity - a.totalQuantity);

    console.log('Factory stats:', factoryStats);

    return { totalOrders, totalQuantity, inProgress, completed, stageQuantities, avgDays, factoryStats };
  }, [orders, factoryCapacity]);

  const segments: PieSegment[] = stats.stageQuantities;

  return (
    <div className="production-pie-wrapper">
      <PieChartCard
        mode={mode}
        title="大货生产"
        total={stats.totalQuantity}
        inProgress={stats.inProgress}
        completed={stats.completed}
        avgTime={formatDays(stats.avgDays)}
        segments={segments}
        loading={loading}
      />

      {stats.factoryStats.length > 0 && (
        <div className="factory-stats">
          <div className="factory-stats-header">工厂生产统计</div>
          <div className="factory-stats-list">
            {stats.factoryStats.slice(0, mode === 'sidebar' ? 3 : 10).map(factory => (
              <div key={factory.factoryName} className="factory-stats-item">
                <span className="factory-name">{factory.factoryName}</span>
                <span className="factory-percent">
                  {stats.totalQuantity > 0 ? Math.round((factory.totalQuantity / stats.totalQuantity) * 100) : 0}%
                </span>
                <span className="factory-detail">{factory.orderCount}单</span>
                <span className="factory-detail">{factory.totalQuantity}件</span>
                <span className="factory-detail factory-completion">完成{factory.completionRate}%</span>
                {mode === 'stage' && (
                  <>
                    <span className="factory-detail">交期{formatDays(factory.avgDeliveryDays)}</span>
                    {factory.overdueCount > 0 && (
                      <span className="factory-overdue">{factory.overdueCount}单延期</span>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProductionPieChart);
