import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'in_production', label: '生产中' },
  { key: 'completed', label: '已完成' },
  { key: 'overdue', label: '延期' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [cards, setCards] = useState({
    sample: { developing: 0, completed: 0 },
    production: { total: 0, overdue: 0, pieces: 0 },
    inbound: { today: 0, week: 0 },
    outbound: { today: 0, week: 0 },
  });
  const [todayScanCount, setTodayScanCount] = useState(0);
  const [orders, setOrders] = useState([]);
  const [searchKey, setSearchKey] = useState('');

  useEffect(() => {
    if (!isTenantOwner() && !isAdminOrSupervisor()) {
      toast.error('无权限访问');
      navigate(-1);
      return;
    }
    refreshCards();
    loadOrders(true);
  }, []);

  const refreshCards = async () => {
    setLoading(true);
    try {
      const [dashRes, topStatsRes, prodRes] = await Promise.allSettled([
        api.dashboard.get(),
        api.dashboard.getTopStats(),
        api.production.orderList({ deleteFlag: 0, status: 'production', page: 1, pageSize: 50 }),
      ]);
      const dash = dashRes.status === 'fulfilled' ? (dashRes.value?.data || dashRes.value || {}) : {};
      const topStats = topStatsRes.status === 'fulfilled' ? (topStatsRes.value?.data || topStatsRes.value || {}) : {};
      const prodData = prodRes.status === 'fulfilled' ? (prodRes.value?.data || prodRes.value || {}) : {};
      const prodRecords = prodData?.records || prodData?.list || [];
      let totalPieces = 0;
      if (Array.isArray(prodRecords)) {
        prodRecords.forEach(o => { totalPieces += Number(o.orderQuantity || o.totalQuantity || 0); });
      }
      setCards({
        sample: { developing: Number(dash.sampleDevelopmentCount || dash.sampleCount || 0), completed: Number(dash.completedOrderCount || 0) },
        production: { total: Number(prodData?.total || prodRecords.length || 0), overdue: Number(dash.overdueOrderCount || dash.overdueCount || 0), pieces: totalPieces },
        inbound: { today: Number(topStats.warehousingInbound?.day || topStats.inboundToday || 0), week: Number(topStats.warehousingInbound?.week || topStats.inboundWeek || 0) },
        outbound: { today: Number(topStats.warehousingOutbound?.day || topStats.outboundToday || 0), week: Number(topStats.warehousingOutbound?.week || topStats.outboundWeek || 0) },
      });
      setTodayScanCount(Number(dash.todayScanCount || dash.scanCount || 0));
    } catch (e) {
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = async (reset) => {
    try {
      const params = { deleteFlag: 0, page: 1, pageSize: 30 };
      if (activeFilter === 'in_production') params.status = 'production';
      else if (activeFilter === 'completed') params.status = 'completed';
      else if (activeFilter === 'overdue') params.status = 'production';
      if (searchKey) params.orderNo = searchKey;
      const res = await api.production.orderList(params);
      const data = res?.data || res || {};
      let list = data?.records || data?.list || [];
      if (activeFilter === 'overdue') {
        list = list.filter(o => {
          const delivery = new Date(String(o.deliveryDate || o.expectedShipDate || '').replace(' ', 'T'));
          return !isNaN(delivery.getTime()) && delivery < new Date();
        });
      }
      setOrders(reset ? list : [...orders, ...list]);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadOrders(true); }, [activeFilter]);

  return (
    <div className="dashboard-stack">
      <div className="stats-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="stat-card tone-blue">
          <div className="stat-number">{cards.sample.developing}</div>
          <div className="stat-label">样衣开发</div>
        </div>
        <div className="stat-card tone-green">
          <div className="stat-number">{cards.production.total}</div>
          <div className="stat-label">生产中</div>
        </div>
        <div className="stat-card tone-orange">
          <div className="stat-number">{cards.production.overdue}</div>
          <div className="stat-label">逾期</div>
        </div>
        <div className="stat-card tone-indigo">
          <div className="stat-number">{todayScanCount}</div>
          <div className="stat-label">今日扫码</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
        {STATUS_FILTERS.map(f => (
          <button key={f.key}
            className={`scan-type-chip${activeFilter === f.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.key)}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 16, border: '1px solid var(--color-border)',
              background: activeFilter === f.key ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: activeFilter === f.key ? '#fff' : 'var(--color-text-primary)',
              fontWeight: activeFilter === f.key ? 700 : 400, cursor: 'pointer', fontSize: 12 }}>
            {f.label}
          </button>
        ))}
      </div>

      <input className="text-input" placeholder="搜索订单号" value={searchKey}
        onChange={e => setSearchKey(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && loadOrders(true)} />

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无订单</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {orders.map((order, idx) => (
            <div key={order.id || idx} className="hero-card compact">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{order.orderNo || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{order.styleNo || '-'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 12 }}>{order.orderQuantity || 0}件</div>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4,
                    background: order.status === 'completed' ? '#dcfce7' : '#fef3c7',
                    color: order.status === 'completed' ? '#166534' : '#92400e' }}>
                    {order.status === 'completed' ? '已完成' : '生产中'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
