import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import { transformOrderData } from '@/utils/orderTransform';
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
  const [todayScanCount, setTodayScanCount] = useState(0);
  const [expandedId, setExpandedId] = useState(null);

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
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-primary)', background: 'rgba(59,130,246,0.08)', padding: '2px 10px', borderRadius: 12 }}>
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
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无订单数据</div>
      ) : (
        orders.map((order, idx) => {
          const isOverdue = order.remainDays !== null && order.remainDays < 0;
          const isClosed = order.isClosed;
          const progress = order.productionProgress || 0;
          const isExpanded = expandedId === (order.id || order.orderNo);
          return (
            <div key={order.id || idx} className="hero-card compact list-item"
              style={isOverdue ? { borderLeft: '3px solid var(--color-danger)' } : {}}>
              <div style={{ display: 'flex', gap: 10, cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : (order.id || order.orderNo))}>
                {order.styleCoverUrl ? (
                  <img src={order.styleCoverUrl} alt="" style={{ width: 64, height: 64, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }} onError={(e) => { e.target.style.display = 'none'; }} />
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
                      {order.urgencyTagText && order.urgencyTagText === '普' && <span className="order-tag order-tag-normal">普</span>}
                    </div>
                    {isClosed ? (
                      <span className="tag tag-completed">已完成</span>
                    ) : order.currentProcessName ? (
                      <span className="tag tag-process">{order.currentProcessName}</span>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {order.styleNo || '-'}
                    {order.factoryTypeText && (
                      <span style={{
                        marginLeft: 6, padding: '1px 5px', borderRadius: 4, fontSize: 'var(--font-size-xxs)',
                        background: order.factoryTypeText === '内部' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                        color: order.factoryTypeText === '内部' ? 'var(--color-primary)' : 'var(--color-warning)',
                      }}>{order.factoryTypeText}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {order.deliveryDateStr || '交期待定'}
                    {order.remainDaysText && (
                      <span className={order.remainDaysClass || ''} style={{ marginLeft: 6, fontWeight: 600 }}>
                        {order.remainDaysText}
                      </span>
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

              {isExpanded && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border-light)' }}>
                  <div className="item-meta">
                    <span className="meta-label">订单数</span>
                    <span className="meta-value meta-value-bold">{order.totalQuantity || order.orderQuantity || 0}</span>
                    <span className="meta-sep">|</span>
                    <span className="meta-label">已完成</span>
                    <span className="meta-value meta-value-bold" style={{ color: 'var(--color-success)' }}>{order.completedQuantity || 0}</span>
                  </div>
                  <div className="item-meta">
                    <span className="meta-label">工厂</span>
                    <span className="meta-value">{order.factoryName || '-'}</span>
                    {order.factoryTypeText && (
                      <>
                        <span className="meta-sep">|</span>
                        <span className="meta-value" style={{
                          padding: '1px 6px', borderRadius: 4, fontSize: 'var(--font-size-xs)',
                          background: order.factoryTypeText === '内部' ? 'rgba(59,130,246,0.1)' : 'rgba(245,158,11,0.1)',
                          color: order.factoryTypeText === '内部' ? 'var(--color-primary)' : 'var(--color-warning)',
                        }}>{order.factoryTypeText}</span>
                      </>
                    )}
                  </div>
                  {order.deliveryDateStr && (
                    <div className="item-meta">
                      <span className="meta-label">交期</span>
                      <span className="meta-value">{order.deliveryDateStr}</span>
                      {order.remainDaysText && (
                        <span className={`header-remain-days ${order.remainDaysClass || ''}`} style={{ marginLeft: 6 }}>
                          {order.remainDaysText}
                        </span>
                      )}
                    </div>
                  )}
                  {order.statusText && (
                    <div className="item-meta">
                      <span className="meta-label">状态</span>
                      <span className="meta-value">{order.statusText}</span>
                    </div>
                  )}
                  {order.colorGroups && order.colorGroups.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <div className="meta-label" style={{ marginBottom: 4 }}>尺码明细</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-xs)' }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>颜色</th>
                              {order.allSizes.map(s => (
                                <th key={s} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>{s}</th>
                              ))}
                              <th style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-text-secondary)', fontWeight: 400 }}>小计</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.colorGroups.map(g => (
                              <tr key={g.color}>
                                <td style={{ padding: '4px 8px', borderBottom: '1px solid var(--color-border-light)' }}>{g.color}</td>
                                {g.sizeQtyList.map((qty, i) => (
                                  <td key={i} style={{ padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid var(--color-border-light)' }}>{qty || '-'}</td>
                                ))}
                                <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, borderBottom: '1px solid var(--color-border-light)' }}>{g.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
