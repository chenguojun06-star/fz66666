import React, { useEffect, useState, useMemo, useRef } from 'react';
import PieChartCard, { PieSegment, TodayStat } from '@/components/PieChartCard';
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

const CATEGORY_CONFIG = {
  fabric: { label: '面料', color: '#8b5cf6', defaultUnit: '米' },
  lining: { label: '里料', color: '#06b6d4', defaultUnit: '米' },
  accessory: { label: '辅料', color: '#f59e0b', defaultUnit: '个' },
};

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

interface CategoryStats {
  key: string;
  label: string;
  color: string;
  quantity: number;
  unit: string;
  orderCount: number;
}

const getMaterialCategory = (materialType?: string): keyof typeof CATEGORY_CONFIG => {
  if (!materialType) return 'accessory';
  const type = materialType.toLowerCase();
  if (type.includes('fabric') || type.includes('面料')) return 'fabric';
  if (type.includes('lining') || type.includes('里料') || type.includes('里布')) return 'lining';
  return 'accessory';
};

const inferUnit = (materialType?: string, unit?: string): string => {
  if (unit) return unit;
  const category = getMaterialCategory(materialType);
  return CATEGORY_CONFIG[category].defaultUnit;
};

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
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

    const categoryMap = new Map<string, CategoryStats>();
    Object.entries(CATEGORY_CONFIG).forEach(([key, config]) => {
      categoryMap.set(key, {
        key,
        label: config.label,
        color: config.color,
        quantity: 0,
        unit: config.defaultUnit,
        orderCount: 0,
      });
    });

    const categoryStatusMap = new Map<string, Map<string, { quantity: number; count: number }>>();
    Object.keys(CATEGORY_CONFIG).forEach(key => {
      const statusMap = new Map<string, { quantity: number; count: number }>();
      STATUS_STAGES.forEach(stage => {
        statusMap.set(stage.key, { quantity: 0, count: 0 });
      });
      categoryStatusMap.set(key, statusMap);
    });

    const supplierMap = new Map<string, SupplierStats>();
    purchases.forEach(p => {
      const category = getMaterialCategory(p.materialType);
      const categoryStats = categoryMap.get(category)!;
      const qty = Math.round(p.purchaseQuantity || 0);
      const unit = inferUnit(p.materialType, p.unit);

      categoryStats.quantity += qty;
      categoryStats.orderCount++;

      const statusKey = p.status || 'pending';
      const catStatusMap = categoryStatusMap.get(category)!;
      const statusEntry = catStatusMap.get(statusKey);
      if (statusEntry) {
        statusEntry.quantity += qty;
        statusEntry.count++;
      }

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

    const categoryStats = Array.from(categoryMap.values()).filter(c => c.quantity > 0);

    const categorySegments: PieSegment[] = categoryStats.map(c => ({
      key: c.key,
      label: c.label,
      color: c.color,
      count: c.quantity,
      unit: c.unit,
    }));

    const categoryStatusBreakdown = categoryStats.map(c => ({
      categoryKey: c.key,
      categoryLabel: c.label,
      categoryColor: c.color,
      totalQuantity: c.quantity,
      unit: c.unit,
      orderCount: c.orderCount,
      statuses: STATUS_STAGES.map(stage => {
        const entry = categoryStatusMap.get(c.key)!.get(stage.key)!;
        return {
          key: stage.key,
          label: stage.label,
          color: stage.color,
          quantity: entry.quantity,
          count: entry.count,
        };
      }).filter(s => s.quantity > 0),
    }));

    const todayNewPurchases = purchases.filter(p => isToday(String(p.createTime || p.createdAt)));
    const todayCompletedPurchases = purchases.filter(p => isToday(String(p.completionTime || p.completedAt)));

    return {
      totalPurchases,
      stageQuantities,
      overdueCount: overduePurchases.length,
      supplierStats,
      totalQuantity,
      categoryStats,
      categorySegments,
      categoryStatusBreakdown,
      todayNewCount: todayNewPurchases.length,
      todayCompletedCount: todayCompletedPurchases.length,
    };
  }, [purchases]);

  const segments: PieSegment[] = stats.categorySegments.length > 0 ? stats.categorySegments : stats.stageQuantities;

  const formatQuantities = (quantities: { unit: string; quantity: number }[]) => {
    return quantities.map(q => `${q.quantity}${q.unit}`).join(' ');
  };

  const todayStats: TodayStat[] = [
    { label: '今日新增', value: stats.todayNewCount, unit: '单' },
    { label: '今日完成', value: stats.todayCompletedCount, unit: '单', type: 'success' },
  ];

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
        todayStats={todayStats}
      />

      {mode === 'sidebar' && stats.categoryStatusBreakdown.length > 0 && (
        <div className="category-sidebar-stats">
          {stats.categoryStatusBreakdown.map(cat => (
            <div key={cat.categoryKey} className="category-sidebar-group">
              <div className="category-sidebar-item">
                <span className="category-sidebar-dot" style={{ background: cat.categoryColor }} />
                <span className="category-sidebar-label">{cat.categoryLabel}</span>
                <span className="category-sidebar-qty">{cat.totalQuantity}{cat.unit}</span>
              </div>
              <div className="category-sidebar-bar">
                {cat.statuses.map(s => (
                  <div
                    key={s.key}
                    className="category-sidebar-bar-seg"
                    style={{ background: s.color, flex: s.quantity }}
                    title={`${s.label}: ${s.quantity}${cat.unit}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'stage' && stats.categoryStatusBreakdown.length > 0 && (
        <div className="category-stats">
          <div className="category-stats-header">面辅料分类统计</div>
          <div className="category-stats-list">
            {stats.categoryStatusBreakdown.map(cat => (
              <div key={cat.categoryKey} className="category-breakdown-card">
                <div className="category-breakdown-header">
                  <span className="category-dot" style={{ background: cat.categoryColor }} />
                  <span className="category-label">{cat.categoryLabel}</span>
                  <span className="category-quantity">{cat.totalQuantity}{cat.unit}</span>
                  <span className="category-count">{cat.orderCount}单</span>
                </div>
                <div className="category-status-bar">
                  {cat.statuses.map(s => (
                    <div
                      key={s.key}
                      className="category-status-segment"
                      style={{ background: s.color, flex: s.quantity }}
                      title={`${s.label}: ${s.quantity}${cat.unit}`}
                    />
                  ))}
                </div>
                <div className="category-status-labels">
                  {cat.statuses.map(s => (
                    <span key={s.key} className="category-status-tag">
                      <span className="status-dot-sm" style={{ background: s.color }} />
                      {s.label} {s.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
