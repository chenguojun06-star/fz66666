import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Spin, Empty } from 'antd';
import { useTimeDimension } from '../contexts/TimeDimensionContext';
import api from '@/utils/api';
import type { MaterialPurchase } from '@/types/production';
import './ProcurementPieChart.css';

const CATEGORY_CONFIG = {
  fabric: { label: '面料', color: '#7c3aed' },
  lining: { label: '里料', color: '#0891b2' },
  accessory: { label: '辅料', color: '#d97706' },
};

const getMaterialCategory = (materialType?: string): keyof typeof CATEGORY_CONFIG => {
  if (!materialType) return 'accessory';
  const type = materialType.toLowerCase();
  if (type.includes('fabric') || type.includes('面料')) return 'fabric';
  if (type.includes('lining') || type.includes('里料') || type.includes('里布')) return 'lining';
  return 'accessory';
};

const isToday = (dateStr?: string | null): boolean => {
  if (!dateStr) return false;
  const date = new Date(dateStr);
  const today = new Date();
  return date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
};

const ProcurementPieChart: React.FC = () => {
  const { getDateRange } = useTimeDimension();
  const [loading, setLoading] = useState(true);
  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();
      const res = await api.get<{ code: number; data: { records?: MaterialPurchase[] } }>('/production/purchase/list', {
        params: { page: 1, pageSize: 500, startDate: start.toISOString(), endDate: end.toISOString() },
      });
      setPurchases(res?.data?.records || []);
    } catch (e) {
      console.error('Load purchase data failed:', e);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalPurchases = purchases.length;
    const totalQuantity = Math.round(purchases.reduce((sum, p) => sum + (p.purchaseQuantity || 0), 0));

    const categoryMap = new Map<keyof typeof CATEGORY_CONFIG, { quantity: number; count: number; completedQty: number }>();
    Object.keys(CATEGORY_CONFIG).forEach(key => {
      categoryMap.set(key as keyof typeof CATEGORY_CONFIG, { quantity: 0, count: 0, completedQty: 0 });
    });

    purchases.forEach(p => {
      const category = getMaterialCategory(p.materialType);
      const entry = categoryMap.get(category)!;
      const qty = Math.round(p.purchaseQuantity || 0);
      entry.quantity += qty;
      entry.count++;
      if (p.status === 'completed') entry.completedQty += qty;
    });

    const categoryStats = Array.from(categoryMap.entries())
      .filter(([, v]) => v.quantity > 0)
      .map(([key, val]) => ({
        key,
        ...CATEGORY_CONFIG[key],
        quantity: val.quantity,
        count: val.count,
        completedQty: val.completedQty,
      }));

    const overdueCount = purchases.filter(p => {
      if (p.status === 'completed' || p.status === 'cancelled') return false;
      const exp = p.expectedArrivalDate || p.expectedShipDate;
      return exp ? new Date(exp) < new Date() : false;
    }).length;

    const todayNew = purchases.filter(p => isToday(String(p.createTime || p.createdAt))).length;
    const todayCompleted = purchases.filter(p => isToday(String(p.completionTime || p.completedAt))).length;

    return { totalPurchases, totalQuantity, categoryStats, overdueCount, todayNew, todayCompleted };
  }, [purchases]);

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spin /></div>;
  }

  if (stats.totalPurchases === 0) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Empty description="暂无数据" image={Empty.PRESENTED_IMAGE_SIMPLE} /></div>;
  }

  return (
    <div className="procurement-card-wrapper">
      {/* 核心指标 */}
      <div className="procurement-metrics">
        <div className="procurement-metric">
          <div className="procurement-metric-value">{stats.totalPurchases}</div>
          <div className="procurement-metric-label">采购单</div>
        </div>
        <div className="procurement-metric">
          <div className="procurement-metric-value procurement-metric-value--primary">{stats.totalQuantity.toLocaleString()}</div>
          <div className="procurement-metric-label">总数量</div>
        </div>
        <div className="procurement-metric">
          <div className="procurement-metric-value procurement-metric-value--warning">{stats.overdueCount}</div>
          <div className="procurement-metric-label">逾期预警</div>
        </div>
      </div>

      {/* 分类统计 */}
      <div className="procurement-categories">
        {stats.categoryStats.map(cat => (
          <div key={cat.key} className="procurement-category-item">
            <div className="procurement-category-header">
              <span className="procurement-category-dot" style={{ background: cat.color }} />
              <span className="procurement-category-label">{cat.label}</span>
              <span className="procurement-category-qty">{cat.quantity.toLocaleString()}</span>
              <span className="procurement-category-count">{cat.count}单</span>
            </div>
            <div className="procurement-category-bar">
              {cat.quantity > 0 && (
                <div className="procurement-category-seg" style={{
                  width: `${(cat.completedQty / cat.quantity) * 100}%`,
                  background: cat.color,
                }} />
              )}
            </div>
            <div className="procurement-category-info">
              <span className="procurement-category-pct">完成 {cat.quantity > 0 ? Math.round((cat.completedQty / cat.quantity) * 100) : 0}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* 今日数据 */}
      <div className="procurement-today-row">
        <div className="procurement-today-stat">
          <span className="procurement-today-label">今日新增</span>
          <span className="procurement-today-value">{stats.todayNew}单</span>
        </div>
        <div className="procurement-today-stat">
          <span className="procurement-today-label">今日完成</span>
          <span className="procurement-today-value procurement-today-value--success">{stats.todayCompleted}单</span>
        </div>
      </div>
    </div>
  );
};

export default React.memo(ProcurementPieChart);
