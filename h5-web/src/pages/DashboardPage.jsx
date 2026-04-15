import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import { transformOrderData } from '@/utils/orderTransform';
import Icon from '@/components/Icon';
import OrderCard from '@/components/OrderCard';
import EmptyState from '@/components/EmptyState';

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'in_production', label: '生产中' },
  { key: 'overdue', label: '延期' },
  { key: 'completed', label: '已完成' },
];

const SUMMARY_CARDS = [
  { key: 'sample', title: '样衣开发', icon: 'scissors', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', tone: 'purple' },
  { key: 'production', title: '生产订单', icon: 'package', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', tone: 'blue' },
  { key: 'inbound', title: '入库', icon: 'inbox', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)', tone: 'green' },
  { key: 'outbound', title: '出库', icon: 'download', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', tone: 'orange' },
];

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [cards, setCards] = useState({
    sample: { developing: 0, completed: 0 },
    production: { total: 0, overdue: 0, pieces: 0 },
    inbound: { today: 0, week: 0 },
    outbound: { today: 0, week: 0 },
  });
  const [orders, setOrders] = useState([]);
  const [searchKey, setSearchKey] = useState('');
  const [todayScanCount, setTodayScanCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    refreshCards();
    loadOrders(true);
  }, []);

  const refreshCards = async () => {
    setLoading(true);
    try {
      const [dashRes, topStatsRes] = await Promise.allSettled([
        api.dashboard.get(),
        api.dashboard.getTopStats(),
      ]);
      const dash = dashRes.status === 'fulfilled' ? (dashRes.value?.data || dashRes.value || {}) : {};
      const topStats = topStatsRes.status === 'fulfilled' ? (topStatsRes.value?.data || topStatsRes.value || {}) : {};
      setTodayScanCount(Number(dash.todayScanCount || 0));
      setCards({
        sample: { developing: Number(dash.sampleDevelopmentCount || 0), completed: Number(topStats.sampleDevelopment?.total || 0) },
        production: { total: Number(dash.productionOrderCount || 0), overdue: Number(dash.overdueOrderCount || 0), pieces: Number(dash.orderQuantityTotal || 0) },
        inbound: { today: Number(topStats.warehousingInbound?.day || 0), week: Number(topStats.warehousingInbound?.week || 0) },
        outbound: { today: Number(topStats.warehousingOutbound?.day || 0), week: Number(topStats.warehousingOutbound?.week || 0) },
      });
    } catch (e) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = useCallback(async (reset) => {
    try {
      const params = { deleteFlag: 0, page: 1, pageSize: 30, excludeTerminal: 'true' };
      if (activeFilter === 'in_production') params.status = 'production';
      else if (activeFilter === 'completed') params.status = 'completed';
      else if (activeFilter === 'overdue') params.status = 'production';
      if (searchKey) params.orderNo = searchKey;
      const res = await api.production.orderList(params);
      const data = res?.data || res || {};
      let rawList = data?.records || data?.list || [];
      if (activeFilter === 'overdue') {
        rawList = rawList.filter(o => {
          const delivery = new Date(String(o.plannedEndDate || o.expectedShipDate || o.deliveryDate || '').replace(' ', 'T'));
          return !isNaN(delivery.getTime()) && delivery < new Date();
        });
      }
      const list = rawList.map(r => transformOrderData(r));
      setOrders(reset ? list : prev => [...prev, ...list]);
    } catch (e) {
      console.error('Dashboard loadOrders failed:', e);
    }
  }, [activeFilter, searchKey]);

  useEffect(() => { loadOrders(true); }, [activeFilter]);

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const renderCardMetrics = useCallback((key) => {
    const c = cards[key];
    switch (key) {
      case 'sample':
        return (
          <div className="card-bd">
            <div className="metric"><div className="metric-val">{c.developing}</div><div className="metric-lbl">款式总数</div></div>
            <div className="metric-divider" />
            <div className="metric"><div className="metric-val val--muted">{c.completed}</div><div className="metric-lbl">已完成</div></div>
          </div>
        );
      case 'production':
        return (
          <div className="card-bd">
            <div className="metric"><div className="metric-val">{c.total}</div><div className="metric-lbl">生产中</div></div>
            <div className="metric-divider" />
            <div className="metric"><div className="metric-val val--muted">{c.pieces}</div><div className="metric-lbl">件数</div></div>
            <div className="metric-divider" />
            <div className="metric"><div className={`metric-val${c.overdue > 0 ? ' val--danger' : ' val--muted'}`}>{c.overdue}</div><div className="metric-lbl">已延期</div></div>
          </div>
        );
      case 'inbound':
        return (
          <div className="card-bd">
            <div className="metric"><div className="metric-val">{c.today}</div><div className="metric-lbl">今日</div></div>
            <div className="metric-divider" />
            <div className="metric"><div className="metric-val val--muted">{c.week}</div><div className="metric-lbl">本周</div></div>
          </div>
        );
      case 'outbound':
        return (
          <div className="card-bd">
            <div className="metric"><div className="metric-val">{c.today}</div><div className="metric-lbl">今日</div></div>
            <div className="metric-divider" />
            <div className="metric"><div className="metric-val val--muted">{c.week}</div><div className="metric-lbl">本周</div></div>
          </div>
        );
    }
  }, [cards]);

  return (
    <div className="dashboard-stack">
      <div className="sub-page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sub-page-title">今日概览</span>
        {todayScanCount > 0 && (
          <span className="today-scan-badge">
            今日扫码 {todayScanCount} 次
          </span>
        )}
      </div>

      <div className="card-grid">
        {SUMMARY_CARDS.map(card => (
          <div key={card.key} className={`summary-card card--${card.tone}`}>
            <div className="card-hd">
              <div className="card-icon" style={{ background: card.bg }}>
                <Icon name={card.icon} size={20} color={card.color} />
              </div>
              <div className="card-title">{card.title}</div>
            </div>
            {renderCardMetrics(card.key)}
          </div>
        ))}
      </div>

      <div className="scan-type-bar">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} className={`filter-btn${activeFilter === f.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="search-box">
        <input className="text-input" placeholder="搜索订单号/款号" value={searchKey}
          onChange={e => setSearchKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadOrders(true)} style={{ flex: 1 }} />
        <button className="secondary-button" onClick={() => loadOrders(true)}>搜索</button>
      </div>

      {loading ? (
        <div className="loading-center">加载中...</div>
      ) : orders.length === 0 ? (
        <EmptyState icon="📦" title="暂无订单数据" />
      ) : (
        orders.map((order, idx) => (
          <OrderCard
            key={order.id || idx}
            order={order}
            isExpanded={expandedId === (order.id || order.orderNo)}
            onToggle={toggleExpand}
            activeTab=""
          />
        ))
      )}
    </div>
  );
}
