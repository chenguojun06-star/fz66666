import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import Icon from '@/components/Icon';

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'in_production', label: '生产中' },
  { key: 'overdue', label: '延期' },
  { key: 'completed', label: '已完成' },
];

const SUMMARY_CARDS = [
  { key: 'sample', title: '样衣开发', icon: 'scissors', color: 'var(--color-purple)', bg: 'rgba(124,92,252,0.1)', tone: 'purple' },
  { key: 'production', title: '生产订单', icon: 'package', color: 'var(--color-primary)', bg: 'rgba(59,130,246,0.1)', tone: 'blue' },
  { key: 'inbound', title: '今日入库', icon: 'package', color: 'var(--color-success)', bg: 'rgba(34,197,94,0.1)', tone: 'green' },
  { key: 'outbound', title: '今日出库', icon: 'package', color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', tone: 'orange' },
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
      const [dashRes, topStatsRes, prodRes, compRes] = await Promise.allSettled([
        api.dashboard.get(),
        api.dashboard.getTopStats(),
        api.production.orderList({ deleteFlag: 0, status: 'production', page: 1, pageSize: 50 }),
        api.production.orderList({ deleteFlag: 0, status: 'completed', page: 1, pageSize: 1 }),
      ]);
      const dash = dashRes.status === 'fulfilled' ? (dashRes.value?.data || dashRes.value || {}) : {};
      const topStats = topStatsRes.status === 'fulfilled' ? (topStatsRes.value?.data || topStatsRes.value || {}) : {};
      const prodData = prodRes.status === 'fulfilled' ? (prodRes.value?.data || prodRes.value || {}) : {};
      const compData = compRes.status === 'fulfilled' ? (compRes.value?.data || compRes.value || {}) : {};
      const prodRecords = prodData?.records || prodData?.list || [];
      let totalPieces = 0;
      if (Array.isArray(prodRecords)) {
        prodRecords.forEach(o => { totalPieces += Number(o.orderQuantity || o.totalQuantity || 0); });
      }
      setCards({
        sample: { developing: Number(dash.sampleDevelopmentCount || dash.sampleCount || 0), completed: Number(compData?.total || 0) },
        production: { total: Number(prodData?.total || prodRecords.length || 0), overdue: Number(dash.overdueOrderCount || dash.overdueCount || 0), pieces: totalPieces },
        inbound: { today: Number(topStats.warehousingInbound?.day || topStats.inboundToday || 0), week: Number(topStats.warehousingInbound?.week || topStats.inboundWeek || 0) },
        outbound: { today: Number(topStats.warehousingOutbound?.day || topStats.outboundToday || 0), week: Number(topStats.warehousingOutbound?.week || topStats.outboundWeek || 0) },
      });
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

  const getRemainDays = (order) => {
    if (!order.deliveryDate) return null;
    const delivery = new Date(order.deliveryDate.replace(' ', 'T'));
    return Math.ceil((delivery - Date.now()) / 86400000);
  };

  const getRemainDaysClass = (days) => {
    if (days === null) return '';
    if (days < 0) return 'days-overdue';
    if (days <= 3) return 'days-urgent';
    if (days <= 7) return 'days-warn';
    return 'days-safe';
  };

  const renderCardMetrics = (key) => {
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
  };

  return (
    <div className="dashboard-stack">
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
          <button key={f.key} className={`scan-type-chip${activeFilter === f.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="text-input" placeholder="搜索订单号/款号" value={searchKey}
          onChange={e => setSearchKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadOrders(true)} style={{ flex: 1 }} />
        <button className="secondary-button" onClick={() => loadOrders(true)}>搜索</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无订单</div>
      ) : (
        orders.map((order, idx) => {
          const remainDays = getRemainDays(order);
          const isOverdue = remainDays !== null && remainDays < 0;
          const isClosed = order.status === 'completed' || order.status === 'closed';
          const progress = order.productionProgress || 0;
          const imgUrl = getAuthedImageUrl(order.styleCoverUrl || order.coverImage || order.styleImage || '');
          return (
            <div key={order.id || idx} className="hero-card compact list-item"
              style={isOverdue ? { borderLeft: '3px solid var(--color-danger)' } : {}}>
              <div style={{ display: 'flex', gap: 10 }}>
                {imgUrl ? (
                  <img src={imgUrl} alt="" style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-gray)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-disabled)', textAlign: 'center', lineHeight: 1.3 }}>
                    暂无<br/>图片
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-size-base)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {order.orderNo || '-'}
                      {order.plateTypeTagText && <span className="order-tag order-tag-plate">{order.plateTypeTagText}</span>}
                      {order.urgencyTagText && order.urgencyTagText === '急' && <span className="order-tag order-tag-urgent">急</span>}
                    </div>
                    {isClosed ? (
                      <span className="tag tag-completed">已完成</span>
                    ) : order.currentProcessName ? (
                      <span className="tag tag-process">{order.currentProcessName}</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {order.styleNo || '-'}
                    {order.deliveryDate && (
                      <>
                        <span style={{ margin: '0 4px' }}>·</span>
                        <span className={getRemainDaysClass(remainDays)}>
                          {isOverdue ? `逾${Math.abs(remainDays)}天` : remainDays !== null ? `${remainDays}天` : ''}
                        </span>
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 3, background: 'var(--color-border-light)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: isClosed ? 'var(--color-success)' : 'var(--color-primary)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: isClosed ? 'var(--color-success)' : 'var(--color-primary)' }}>{progress}%</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
