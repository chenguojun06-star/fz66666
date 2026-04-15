import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { isAdminOrSupervisor } from '@/utils/permission';
import EmptyState from '@/components/EmptyState';
import LoadMore from '@/components/LoadMore';

const TABS = [
  { key: '', label: '全部' },
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'sewing', label: '车缝' },
  { key: 'warehousing', label: '入库' },
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
  const [unreadCount, setUnreadCount] = useState(0);

  const loadOrders = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    try {
      const params = { page: pageNum, pageSize: 20 };
      if (activeTab) params.currentStage = activeTab;
      if (search.trim()) params.keyword = search.trim();
      if (delayedOnly) params.delayedOnly = true;
      const res = await api.production.orderList(params);
      const data = res?.data || res;
      const list = data?.list || data?.records || data || [];
      const total = data?.total || 0;
      setOrders(append ? (prev) => [...prev, ...list] : list);
      setHasMore(list.length >= 20 && (append ? orders.length + list.length : list.length) < total);
      setPage(pageNum);
    } catch (e) {
      toast.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, delayedOnly]);

  useEffect(() => { loadOrders(1); }, [activeTab]);
  useEffect(() => {
    api.notice.unreadCount().then((res) => {
      setUnreadCount(Number((res?.data ?? res) || 0));
    }).catch(() => {});
  }, []);

  const handleSearch = () => { loadOrders(1); };

  const getStageLabel = (stage) => {
    const map = { procurement: '采购', cutting: '裁剪', sewing: '车缝', warehousing: '入库', packaging: '包装', quality: '质检' };
    return map[stage] || stage || '待定';
  };

  const getStageColor = (stage) => {
    const map = { procurement: '#f59e0b', cutting: '#6366f1', sewing: '#3b82f6', warehousing: '#10b981', packaging: '#8b5cf6', quality: '#ef4444' };
    return map[stage] || 'var(--color-text-secondary)';
  };

  const getRemainDays = (order) => {
    if (!order.deliveryDate) return null;
    const delivery = new Date(order.deliveryDate.replace(' ', 'T'));
    const diff = Math.ceil((delivery - Date.now()) / 86400000);
    return diff;
  };

  return (
    <div className="scan-stack">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input className="text-input" placeholder="搜索订单号/款号" value={search}
          onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          style={{ flex: 1, padding: '10px 14px' }} />
        <button className="secondary-button" onClick={handleSearch} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>搜索</button>
      </div>

      {isAdminOrSupervisor() && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={delayedOnly} onChange={(e) => setDelayedOnly(e.target.checked)} />
          仅看延期
        </label>
      )}

      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
        {TABS.map((tab) => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
              background: activeTab === tab.key ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: activeTab === tab.key ? '#fff' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab.key ? 700 : 400, fontSize: 'var(--font-size-sm)', whiteSpace: 'nowrap',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
          共 {orders.length} 个订单
        </span>
        <button className="ghost-button" onClick={() => navigate('/work/inbox')}
          style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)', position: 'relative' }}>
          📨 通知
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4, background: 'var(--color-danger)', color: '#fff',
              borderRadius: '50%', minWidth: 16, height: 16, fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
      </div>

      <LoadMore onLoadMore={() => loadOrders(page + 1, true)} hasMore={hasMore} loading={loading}>
        {!loading && !orders.length ? (
          <EmptyState icon="📦" title="暂无订单" description="当前筛选条件下没有订单数据" />
        ) : (
          orders.map((order) => {
            const remainDays = getRemainDays(order);
            const isOverdue = remainDays !== null && remainDays < 0;
            const isExpanded = expandedId === (order.id || order.orderNo);
            return (
              <div key={order.id || order.orderNo}
                style={{
                  background: 'var(--color-bg-card)', borderRadius: 16, padding: '14px 16px',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.04)', border: isOverdue ? '1px solid var(--color-danger)' : '1px solid var(--color-border-light)',
                }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                  onClick={() => setExpandedId(isExpanded ? null : (order.id || order.orderNo))}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 'var(--font-size-base)' }}>{order.orderNo || order.orderNumber}</span>
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                        background: `${getStageColor(order.currentStage)}18`, color: getStageColor(order.currentStage),
                      }}>{getStageLabel(order.currentStage)}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      {order.styleName || order.styleNo || ''} {order.customerName ? `· ${order.customerName}` : ''}
                    </div>
                    {remainDays !== null && (
                      <div style={{ fontSize: 'var(--font-size-xs)', color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-secondary)', marginTop: 2 }}>
                        {isOverdue ? `已延期${Math.abs(remainDays)}天` : `剩余${remainDays}天`}
                      </div>
                    )}
                  </div>
                  <span style={{ color: 'var(--color-text-disabled)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>

                {isExpanded && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--color-border-light)' }}>
                    {order.totalQuantity != null && (
                      <div style={{ fontSize: 'var(--font-size-sm)', marginBottom: 4 }}>
                        总件数: <strong>{order.totalQuantity}</strong>
                      </div>
                    )}
                    {order.processes && order.processes.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                        {order.processes.map((p, i) => (
                          <span key={i} style={{
                            padding: '3px 8px', borderRadius: 6, fontSize: 11,
                            background: p.completed ? 'rgba(16,185,129,0.12)' : 'var(--color-bg-gray)',
                            color: p.completed ? 'var(--color-success)' : 'var(--color-text-secondary)',
                          }}>{p.name || p.processName}{p.completed ? ' ✓' : ''}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button className="ghost-button" onClick={() => navigate(`/work/bundle-split?orderNo=${order.orderNo || order.orderNumber}`)}
                        style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}>菲号单价</button>
                      <button className="ghost-button" onClick={() => navigate(`/scan/confirm?orderNo=${order.orderNo || order.orderNumber}`)}
                        style={{ padding: '6px 12px', fontSize: 'var(--font-size-xs)' }}>扫码</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </LoadMore>
    </div>
  );
}
