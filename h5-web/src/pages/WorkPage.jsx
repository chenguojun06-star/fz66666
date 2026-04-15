import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { transformOrderData } from '@/utils/orderTransform';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';

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

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const goBundleSplit = (orderNo, mode) => {
    navigate(`/work/bundle-split?orderNo=${encodeURIComponent(orderNo)}${mode ? `&mode=${mode}` : ''}`);
  };

  return (
    <div className="sub-page" style={{ paddingBottom: 'calc(80px + var(--safe-area-bottom, 0px))' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} className={`filter-btn${activeTab === t.key ? ' active' : ''}`}
            onClick={() => { setActiveTab(t.key); setPage(1); }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {FACTORY_TYPES.map(f => (
          <button key={f.key} className={`filter-btn${factoryType === f.key ? ' active' : ''}`}
            onClick={() => setFactoryType(f.key)}>{f.label}</button>
        ))}
        <button className={`filter-btn${delayedOnly ? ' active' : ''}`}
          onClick={() => setDelayedOnly(!delayedOnly)} style={{ marginLeft: 'auto' }}>延期</button>
        <button className="filter-btn" onClick={() => loadOrders(true)}>
          <Icon name="refresh" size={12} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
        <span>订单 <strong style={{ color: 'var(--color-text-primary)' }}>{orderStats.orderCount}</strong></span>
        <span style={{ color: 'var(--color-border)' }}>|</span>
        <span>总量 <strong style={{ color: 'var(--color-text-primary)' }}>{orderStats.totalQuantity}</strong></span>
      </div>

      <div className="search-box">
        <input className="text-input" placeholder="搜索订单号/款号" value={search}
          onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadOrders(true)} style={{ flex: 1 }} />
        <button className="secondary-button" onClick={() => loadOrders(true)}>搜索</button>
      </div>

      {orders.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <div className="empty-text">暂无数据</div>
        </div>
      )}

      {orders.map((order) => {
        const isExpanded = expandedId === order.id;
        const imgUrl = order.styleCoverUrl ? getAuthedImageUrl(order.styleCoverUrl) : '';
        const isOverdue = order.remainDays !== null && order.remainDays < 0;
        return (
          <div key={order.id} className="card-item">
            <div style={{ display: 'flex', gap: 12 }} onClick={() => toggleExpand(order.id)}>
              <div style={{ width: 88, height: 88, borderRadius: 8, overflow: 'hidden', background: 'var(--color-bg-gray)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {imgUrl ? (
                  <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling && (e.target.nextSibling.style.display = 'flex'); }} />
                ) : null}
                <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center', lineHeight: 1.3, display: imgUrl ? 'none' : 'flex' }}>暂无<br/>图片</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{order.orderNo}</span>
                  {order.plateTypeTagText && (
                    <span className="tag tag-blue">{order.plateTypeTagText === '首' ? '首单' : '翻单'}</span>
                  )}
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
              </div>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', paddingLeft: 4 }}>
                <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={16} />
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <div style={{ flex: 1, height: 4, background: 'var(--color-bg-gray)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${order.productionProgress || 0}%`, background: order.isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)', borderRadius: 2, transition: 'width 0.3s' }} />
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: order.isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)' }}>{order.productionProgress || 0}%</span>
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
                {(!order.colorGroups || order.colorGroups.length === 0) && order.sizeList && order.sizeList.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                    {order.sizeList.map((s, i) => (
                      <span key={i} className="tag tag-muted">{s}: {order.sizeQtyList[i]}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {activeTab === 'cutting' && (
                    <>
                      <button className="mf-mini-btn" onClick={() => goBundleSplit(order.orderNo, 'generate')}>生成菲号</button>
                      <button className="mf-mini-btn" onClick={() => goBundleSplit(order.orderNo, 'split')}>拆菲号</button>
                    </>
                  )}
                  <button className="mf-mini-btn" onClick={() => { navigator.clipboard.writeText(order.orderNo).then(() => toast.success('已复制订单号')).catch(() => {}); }}>复制订单号</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {loading && <div className="loading-state">加载中...</div>}
      {!loading && hasMore && orders.length > 0 && (
        <button className="ghost-button" style={{ width: '100%', marginTop: 8 }} onClick={() => loadOrders()}>加载更多</button>
      )}
      {!loading && !hasMore && orders.length > 0 && (
        <div style={{ textAlign: 'center', padding: '12px 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>没有更多了</div>
      )}
    </div>
  );
}
