import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';

const TABS = [
  { key: '', label: '全部' },
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'sewing', label: '车缝' },
  { key: 'warehousing', label: '入库' },
];

const FACTORY_TYPES = [
  { label: '全部', value: '' },
  { label: '内部', value: 'internal' },
  { label: '外部', value: 'external' },
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

  const loadOrders = useCallback(async (pageNum = 1, append = false) => {
    setLoading(true);
    try {
      const params = { page: pageNum, pageSize: 20 };
      if (activeTab) params.currentStage = activeTab;
      if (search.trim()) params.keyword = search.trim();
      if (delayedOnly) params.delayedOnly = true;
      if (factoryType) params.factoryType = factoryType;
      const res = await api.production.orderList(params);
      const data = res?.data || res;
      const list = data?.list || data?.records || data || [];
      const total = data?.total || 0;
      setOrders(append ? (prev) => [...prev, ...list] : list);
      setHasMore(list.length >= 20 && (append ? orders.length + list.length : list.length) < total);
      setPage(pageNum);
      setOrderStats({
        orderCount: total || list.length,
        totalQuantity: list.reduce((sum, o) => sum + (Number(o.totalQuantity) || Number(o.orderQuantity) || 0), 0),
      });
    } catch (e) {
      toast.error('加载订单失败');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, delayedOnly, factoryType]);

  useEffect(() => { loadOrders(1); }, [activeTab, delayedOnly, factoryType]);

  const handleSearch = () => { loadOrders(1); };

  const getRemainDays = (order) => {
    if (!order.deliveryDate) return null;
    const delivery = new Date(order.deliveryDate.replace(' ', 'T'));
    const diff = Math.ceil((delivery - Date.now()) / 86400000);
    return diff;
  };

  const getRemainDaysClass = (days) => {
    if (days === null) return '';
    if (days < 0) return 'days-overdue';
    if (days <= 3) return 'days-urgent';
    return 'days-normal';
  };

  return (
    <div className="work-container">
      <div style={{ padding: '8px 16px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input className="text-input" placeholder="搜索订单号/款号" value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            style={{ flex: 1, padding: '10px 14px' }} />
          <button className="secondary-button" onClick={handleSearch} style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>搜索</button>
        </div>
      </div>

      <div className="work-card">
        <div className="work-tabbar">
          {TABS.map((tab) => (
            <div key={tab.key} className={`work-tab${activeTab === tab.key ? ' work-tab-active' : ''}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </div>
          ))}
        </div>

        <div className="order-stats-bar">
          <span className="stats-bar-label">订单</span>
          <span className="stats-bar-value stats-primary">{orderStats.orderCount}</span>
          <span className="stats-bar-sep">｜</span>
          <span className="stats-bar-label">总量</span>
          <span className="stats-bar-value stats-accent">{orderStats.totalQuantity}</span>
        </div>

        <div className="org-filter-row">
          {FACTORY_TYPES.map((ft) => (
            <div key={ft.value} className={`org-filter-pill${factoryType === ft.value ? ' org-filter-pill-active' : ''}`}
              onClick={() => setFactoryType(ft.value)}>
              <span className="org-filter-label">工厂</span>
              <span className="org-filter-value">{ft.label}</span>
            </div>
          ))}
          <div className={`org-filter-pill${delayedOnly ? ' org-filter-pill-active' : ''}`}
            onClick={() => setDelayedOnly(!delayedOnly)}>
            <span className="org-filter-value">{delayedOnly ? '全部' : '延期'}</span>
          </div>
          <div className="refresh-btn" onClick={() => loadOrders(1)}>
            <span>刷新</span>
          </div>
        </div>
      </div>

      {!loading && !orders.length ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--color-text-disabled)', fontSize: 'var(--font-size-sm)' }}>
          暂无数据
        </div>
      ) : (
        orders.map((order) => {
          const remainDays = getRemainDays(order);
          const isOverdue = remainDays !== null && remainDays < 0;
          const isExpanded = expandedId === (order.id || order.orderNo);
          const progress = order.productionProgress || 0;
          const isClosed = order.status === 'closed' || order.isClosed;
          return (
            <div key={order.id || order.orderNo} className="list-item"
              style={isOverdue ? { borderLeft: '3px solid var(--color-danger)' } : {}}>
              <div className="item-header" onClick={() => setExpandedId(isExpanded ? null : (order.id || order.orderNo))}>
                <div className="item-cover-box">
                  {order.styleCoverUrl ? (
                    <img className="item-cover" src={order.styleCoverUrl} alt="" />
                  ) : (
                    '暂无\n图片'
                  )}
                </div>
                <div className="item-header-info">
                  <div className="item-head">
                    <div className="item-title">
                      {order.orderNo || order.orderNumber || '-'}
                      {order.plateTypeTagText && <span className="order-tag order-tag-plate">{order.plateTypeTagText}</span>}
                      {order.urgencyTagText && <span className={`order-tag ${order.urgencyTagText === '急' ? 'order-tag-urgent' : 'order-tag-normal'}`}>{order.urgencyTagText}</span>}
                    </div>
                    <div>
                      {isClosed && <span className="tag tag-completed">已完成</span>}
                      {!isClosed && order.currentProcessName && <span className="tag tag-process">{order.currentProcessName}</span>}
                    </div>
                  </div>
                  <div className="item-header-sub">
                    <span>{order.styleNo || '-'}</span>
                    <span>·</span>
                    <span>{order.deliveryDateStr || order.deliveryDate || '交期待定'}</span>
                    {remainDays !== null && (
                      <span className={`header-remain-days ${getRemainDaysClass(remainDays)}`}>
                        {isOverdue ? `已延期${Math.abs(remainDays)}天` : `剩余${remainDays}天`}
                      </span>
                    )}
                  </div>
                  <div className="header-progress-row">
                    <div className={`header-progress-bar${isClosed ? ' progress-completed' : ''}`}>
                      <div className="progress-fill" style={{ width: `${progress}%` }}></div>
                    </div>
                    <span className="header-progress-pct">{progress}%</span>
                  </div>
                </div>
                <span className={`collapse-arrow${isExpanded ? ' collapse-up' : ''}`}>▾</span>
              </div>

              {isExpanded && (
                <div className="item-collapse-body">
                  <div className="item-meta">
                    <span className="meta-label">数量</span>
                    <span className="meta-value meta-value-bold">{order.sizeTotal || order.orderQuantity || 0}</span>
                    <span className="meta-sep">|</span>
                    <span className="meta-label">完成</span>
                    <span className="meta-value meta-value-bold">{order.completedQuantity || 0}</span>
                  </div>
                  <div className="item-meta">
                    <span className="meta-label">工厂</span>
                    <span className="meta-value">{order.factoryName || '-'}</span>
                    {order.factoryTypeText && (
                      <>
                        <span className="meta-sep">|</span>
                        <span className="meta-value">{order.factoryTypeText}</span>
                      </>
                    )}
                  </div>
                  {activeTab === 'cutting' && (
                    <div className="item-actions">
                      <button className="action-btn action-btn-primary" onClick={() => navigate(`/work/bundle-split?orderNo=${order.orderNo || order.orderNumber}`)}>生成菲号</button>
                      <button className="action-btn action-btn-primary" onClick={() => { const no = order.orderNo || order.orderNumber; navigate(`/work/bundle-split?orderNo=${no}&mode=split`); }}>拆菲号</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}

      <button className="load-more-btn" disabled={loading || !hasMore}
        onClick={() => loadOrders(page + 1, true)}>
        {loading ? '加载中...' : hasMore ? '加载更多' : '没有更多了'}
      </button>
    </div>
  );
}
