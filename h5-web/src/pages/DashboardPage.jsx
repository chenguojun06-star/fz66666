import { useState, useEffect } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import { transformOrderData } from '@/utils/orderTransform';
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

  const loadOrders = async (reset) => {
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
      setOrders(reset ? list : [...orders, ...list]);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => { loadOrders(true); }, [activeFilter]);

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
      <div className="sub-page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sub-page-title">今日概览</span>
        {todayScanCount > 0 && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', background: 'rgba(59,130,246,0.08)', padding: '2px 10px', borderRadius: 8 }}>
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

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="text-input" placeholder="搜索订单号/款号" value={searchKey}
          onChange={e => setSearchKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && loadOrders(true)} style={{ flex: 1 }} />
        <button className="secondary-button" onClick={() => loadOrders(true)}>搜索</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无订单数据</div>
      ) : (
        orders.map((order, idx) => {
          const isOverdue = order.remainDays !== null && order.remainDays < 0;
          const isClosed = order.isClosed;
          const progress = order.productionProgress || 0;
          const isExpanded = expandedId === (order.id || order.orderNo);
          const imgUrl = order.styleCoverUrl ? getAuthedImageUrl(order.styleCoverUrl) : '';
          return (
            <div key={order.id || idx} className="card-item">
              <div style={{ display: 'flex', gap: 12, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : (order.id || order.orderNo))}>
                <div style={{ width: 88, height: 88, borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-gray)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {imgUrl ? (
                    <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={(e) => { e.target.style.display = 'none'; }} />
                  ) : (
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-disabled)', textAlign: 'center', lineHeight: 1.3 }}>暂无<br/>图片</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{order.orderNo || '-'}</span>
                    {order.plateTypeTagText && <span className="tag tag-blue">{order.plateTypeTagText === '首' ? '首单' : '翻单'}</span>}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 3 }}>
                    {order.styleNo || '-'}
                    {order.factoryName && <span style={{ marginLeft: 8 }}>{order.factoryName}</span>}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>数量 <strong style={{ color: 'var(--color-text-primary)' }}>{order.totalQuantity || order.orderQuantity || 0}</strong></span>
                    <span style={{ color: 'var(--color-border)' }}>|</span>
                    <span style={{ color: 'var(--color-text-secondary)' }}>完成 <strong style={{ color: 'var(--color-success)' }}>{order.completedQuantity || 0}</strong></span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {order.deliveryDateStr ? (
                      <span style={{ color: 'var(--color-text-secondary)' }}>交期 {order.deliveryDateStr}</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-tertiary)' }}>交期待定</span>
                    )}
                    {isOverdue && <span className="days-tag days-overdue">逾{Math.abs(order.remainDays)}天</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 4, background: 'var(--color-bg-gray)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, background: isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)', borderRadius: 2, transition: 'width 0.3s' }} />
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)' }}>{progress}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', paddingLeft: 4 }}>
                  <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={16} />
                </div>
              </div>

              {isExpanded && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--color-border-light)' }}>
                  {order.colorGroups && order.colorGroups.length > 0 && (
                    <div style={{ marginBottom: 8 }}>
                      {order.colorGroups.map((g, gi) => (
                        <div key={gi} style={{ marginBottom: 6 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-xs)', marginBottom: 2 }}>
                            <span className="tag tag-muted">{g.color}</span>
                            <span style={{ color: 'var(--color-text-secondary)' }}>{g.total}件</span>
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {order.allSizes.map((s, si) => {
                              const qty = g.sizeMap[s] || 0;
                              return qty > 0 ? (
                                <span key={si} className="tag tag-muted">{s}: {qty}</span>
                              ) : null;
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
