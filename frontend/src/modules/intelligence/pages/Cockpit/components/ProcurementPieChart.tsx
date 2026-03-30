import React, { useEffect, useState, useMemo } from 'react';
import PieChartCard, { PieSegment } from '@/components/PieChartCard';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import { useStyleLink } from '../contexts/StyleLinkContext';
import api from '@/utils/api';
import type { MaterialPurchase } from '@/types/production';
import './ProcurementPieChart.css';

const STATUS_STAGES = [
  { key: 'pending', label: '待采购', color: '#64748b' },
  { key: 'received', label: '已到货', color: '#3b82f6' },
  { key: 'partial', label: '部分到货', color: '#f59e0b' },
  { key: 'completed', label: '已完成', color: '#10b981' },
];

interface ProcurementPieChartProps {
  mode?: 'sidebar' | 'stage';
  moduleKey?: string;
  position?: { x: number; y: number; width: number; height: number };
}

interface SupplierStats {
  supplierName: string;
  orderCount: number;
  quantities: { unit: string; quantity: number }[];
  completedQuantity: number;
  completionRate: number;
  overdueCount: number;
}

const isFabricType = (type?: string): boolean => {
  if (!type) return false;
  const lower = type.toLowerCase();
  return lower.includes('fabric') || lower.includes('lining');
};

const ProcurementPieChart: React.FC<ProcurementPieChartProps> = ({ mode = 'sidebar', moduleKey, position }) => {
  const { dimension, getDateRange } = useTimeDimension();
  const styleLink = useStyleLink();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const { start, end } = getDateRange();
        const res = await api.get<{ code: number; data: { records?: MaterialPurchase[] } }>('/production/purchase/list', {
          params: { 
            page: 1, 
            pageSize: 500,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          },
        });
        setPurchases(res?.data?.records || []);
      } catch (e) {
        console.error('Load purchase data failed:', e);
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [dimension, getDateRange]);

  const styleList = useMemo(() => {
    const styleNos = new Set<string>();
    purchases.forEach(p => {
      const styleNo = (p as any).styleNo || (p as any).styleNumber;
      if (styleNo) styleNos.add(styleNo);
    });
    return Array.from(styleNos).map(styleNo => ({ styleNo, styleName: styleNo }));
  }, [purchases]);

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
    const totalPurchases = purchases.length;

    const stageQuantities: PieSegment[] = STATUS_STAGES.map(stage => {
      const matched = purchases.filter(p => p.status === stage.key);
      const quantity = Math.round(matched.reduce((sum, p) => sum + (p.purchaseQuantity || 0), 0));
      return {
        key: stage.key,
        label: stage.label,
        color: stage.color,
        count: quantity,
      };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overduePurchases = purchases.filter(p => {
      if (p.status === 'completed' || p.status === 'cancelled') return false;
      const exp = p.expectedArrivalDate || p.expectedShipDate;
      return exp ? new Date(exp) < today : false;
    });

    const supplierMap = new Map<string, SupplierStats>();
    purchases.forEach(p => {
      const supplierName = p.supplierName || '未知供应商';
      const existing = supplierMap.get(supplierName) || {
        supplierName,
        orderCount: 0,
        quantities: [] as { unit: string; quantity: number }[],
        completedQuantity: 0,
        completionRate: 0,
        overdueCount: 0,
      };
      existing.orderCount++;
      const qty = Math.round(p.purchaseQuantity || 0);
      const unit = p.unit || (isFabricType(p.materialType) ? '米' : '件');
      
      const existingUnit = existing.quantities.find(q => q.unit === unit);
      if (existingUnit) {
        existingUnit.quantity += qty;
      } else {
        existing.quantities.push({ unit, quantity: qty });
      }
      
      if (p.status === 'completed') {
        existing.completedQuantity += qty;
      }
      const exp = p.expectedArrivalDate || p.expectedShipDate;
      if (p.status !== 'completed' && p.status !== 'cancelled' && exp && new Date(exp) < today) {
        existing.overdueCount++;
      }
      supplierMap.set(supplierName, existing);
    });

    const totalQuantity = Array.from(supplierMap.values()).reduce(
      (sum, s) => sum + s.quantities.reduce((qSum, q) => qSum + q.quantity, 0),
      0
    );
    
    const supplierStats = Array.from(supplierMap.values()).map(s => ({
      ...s,
      completionRate: totalQuantity > 0 ? Math.round((s.completedQuantity / totalQuantity) * 100) : 0,
    })).sort((a, b) => {
      const aTotal = a.quantities.reduce((sum, q) => sum + q.quantity, 0);
      const bTotal = b.quantities.reduce((sum, q) => sum + q.quantity, 0);
      return bTotal - aTotal;
    });

    return { 
      totalPurchases, 
      stageQuantities, 
      overdueCount: overduePurchases.length, 
      supplierStats,
      totalQuantity,
    };
  }, [purchases]);

  const segments: PieSegment[] = stats.stageQuantities;

  const formatQuantities = (quantities: { unit: string; quantity: number }[]) => {
    return quantities.map(q => `${q.quantity}${q.unit}`).join(' ');
  };

  return (
    <div className="procurement-pie-wrapper">
      <PieChartCard
        mode={mode}
        title="物料采购"
        total={stats.totalQuantity}
        inProgress={stats.totalPurchases - purchases.filter(p => p.status === 'completed').length}
        completed={purchases.filter(p => p.status === 'completed').length}
        avgTime={stats.overdueCount > 0 ? `${stats.overdueCount}单逾期` : undefined}
        segments={segments}
        loading={loading}
      />
      
      {mode === 'stage' && stats.supplierStats.length > 0 && (
        <div className="supplier-stats">
          <div className="supplier-stats-header">供应商采购统计</div>
          <div className="supplier-stats-list">
            {stats.supplierStats.map(supplier => {
              const supplierTotal = supplier.quantities.reduce((sum, q) => sum + q.quantity, 0);
              return (
                <div key={supplier.supplierName} className="supplier-stats-item">
                  <span className="supplier-name">{supplier.supplierName}</span>
                  <span className="supplier-percent">
                    {stats.totalQuantity > 0 
                      ? Math.round((supplierTotal / stats.totalQuantity) * 100) 
                      : 0}%
                  </span>
                  <span className="supplier-detail">{supplier.orderCount}单</span>
                  <span className="supplier-detail supplier-qty">{formatQuantities(supplier.quantities)}</span>
                  <span className="supplier-detail supplier-completion">完成{supplier.completionRate}%</span>
                  {supplier.overdueCount > 0 && (
                    <span className="supplier-overdue">{supplier.overdueCount}单逾期</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default React.memo(ProcurementPieChart);
