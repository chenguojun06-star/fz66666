import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { transformOrderData } from '@/utils/orderTransform';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';
import OrderCard from '@/components/OrderCard';
import EmptyState from '@/components/EmptyState';

const TABS = [
  { key: '', label: '全部' },
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'sewing', label: '车缝' },
  { key: 'warehousing', label: '入库' },
];

const FACTORY_TYPES = [
  { key: '', label: '全部' },
  { key: 'INTERNAL', label: '内部' },
  { key: 'EXTERNAL', label: '外部' },
];

export default function WorkPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [activeTab, setActiveTab] = useState('');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState('');
  const [delayedOnly, setDelayedOnly] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [factoryType, setFactoryType] = useState('');
  const [orderStats, setOrderStats] = useState({ orderCount: 0, totalQuantity: 0 });

  const loadOrders = useCallback(async (reset = false) => {
    if (loading) return;
    const nextPage = reset ? 1 : page;
    setLoading(true);
    try {
      const params = { page: nextPage, pageSize: 20 };
      if (activeTab) params.currentStage = activeTab;
      if (search) params.keyword = search;
      if (delayedOnly) params.delayedOnly = true;
      if (factoryType) params.factoryType = factoryType;
      const res = await api.production.orderList(params);
      const data = res?.data || res || {};
      const list = (data?.list || data?.records || data || []).map(transformOrderData);
      const total = data?.total || list.length;
      let filtered = list;
      if (delayedOnly && !params.delayedOnly) {
        filtered = list.filter(o => o.remainDays !== null && o.remainDays < 0);
      }
      const newOrders = reset ? filtered : [...orders, ...filtered];
      setOrders(newOrders);
      setPage(nextPage + 1);
      setHasMore(newOrders.length < total);
      let qty = 0;
      newOrders.forEach(o => { qty += (o.totalQuantity || o.orderQuantity || 0); });
      setOrderStats({ orderCount: total, totalQuantity: qty });
    } catch (e) {
      toast.error('加载失败');
    } finally { setLoading(false); }
  }, [activeTab, search, delayedOnly, factoryType, loading, orders, page]);

  useEffect(() => { loadOrders(true); }, [activeTab, delayedOnly, factoryType]);

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const goBundleSplit = useCallback((orderNo, mode) => {
    navigate(`/work/bundle-split?orderNo=${encodeURIComponent(orderNo)}${mode ? `&mode=${mode}` : ''}`);
  }, [navigate]);

  const handleCopyOrderNo = useCallback((orderNo) => {
    navigator.clipboard.writeText(orderNo).then(() => toast.success('已复制订单号')).catch(() => toast.error('复制失败'));
  }, []);

  const orderStatsDisplay = useMemo(() => (
    <div className="order-stats-row">
      <span>订单 <strong>{orderStats.orderCount}</strong></span>
      <span className="order-card-divider">|</span>
      <span>总量 <strong>{orderStats.totalQuantity}</strong></span>
    </div>
  ), [orderStats]);

  return (
    <div className="sub-page" style={{ paddingBottom: 'calc(80px + var(--safe-area-bottom, 0px))' }}>
      <div className="filter-row">
        {TABS.map(t => (
          <button key={t.key} className={`filter-btn${activeTab === t.key ? ' active' : ''}`}
            onClick={() => { setActiveTab(t.key); setPage(1); }}>{t.label}</button>
        ))}
      </div>

      <div className="filter-row">
        {FACTORY_TYPES.map(f => (
          <button key={f.key} className={`filter-btn${factoryType === f.key ? ' active' : ''}`}
            onClick={() => setFactoryType(f.key)}>{f.label}</button>
        ))}
        <button className={`filter-btn${delayedOnly ? ' active' : ''}`}
          onClick={() => setDelayedOnly(!delayedOnly)} style={{ marginLeft: 'auto' }}>延期</button>
        <button className="refresh-btn" onClick={() => loadOrders(true)}>
          <Icon name="refresh" size={12} /> 刷新
        </button>
      </div>

      {orderStatsDisplay}

      <div className="search-box">
        <input className="text-input" placeholder="搜索订单号/款号" value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadOrders(true)} style={{ flex: 1 }} />
        <button className="secondary-button" onClick={() => loadOrders(true)}>搜索</button>
      </div>

      {orders.length === 0 && !loading && (
        <EmptyState icon="📋" title="暂无数据" />
      )}

      {orders.map((order) => (
        <OrderCard
          key={order.id}
          order={order}
          isExpanded={expandedId === order.id}
          onToggle={toggleExpand}
          activeTab={activeTab}
          onBundleSplit={goBundleSplit}
          onCopyOrderNo={handleCopyOrderNo}
        />
      ))}

      {loading && <div className="loading-state">加载中...</div>}
      {!loading && hasMore && orders.length > 0 && (
        <button className="ghost-button" style={{ width: '100%', marginTop: 8 }} onClick={() => loadOrders()}>加载更多</button>
      )}
      {!loading && !hasMore && orders.length > 0 && (
        <div className="list-end-text">没有更多了</div>
      )}
    </div>
  );
}
