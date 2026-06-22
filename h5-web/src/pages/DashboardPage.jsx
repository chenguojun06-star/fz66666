import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { canSeeDashboard } from '@/utils/permission';
import { toast } from '@/utils/uiHelper';
import { transformOrderData } from '@/utils/orderTransform';
import { eventBus } from '@/utils/eventBus';
import Icon from '@/components/Icon';
import OrderCard from '@/components/OrderCard';
import EmptyState from '@/components/EmptyState';

// 状态过滤（已延期/临近交期用 smart-hints 小标签筛选，此处不重复）
const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'in_production', label: '生产中' },
  { key: 'completed', label: '已完成' },
];

const FACTORY_TYPES = [
  { key: '', label: '全部' },
  { key: 'INTERNAL', label: '内部' },
  { key: 'EXTERNAL', label: '外部' },
];

export default function DashboardPage() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!canSeeDashboard()) {
      toast.info('无权限访问进度看板');
      navigate('/', { replace: true });
    }
  }, []);

  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [factoryType, setFactoryType] = useState('');
  const [smartFilter, setSmartFilter] = useState(''); // 已延期/临近交期筛选
  const [smartHintsData, setSmartHintsData] = useState({ overdueCount: 0, warningCount: 0 });
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
    let failCount = 0;
    try {
      const [dashRes, statsRes] = await Promise.allSettled([
        api.dashboard.get(),
        api.production.orderStats({}),
      ]);

      if (dashRes.status === 'rejected') {
        console.error('[Dashboard] dash API失败:', dashRes.reason?.message);
        failCount++;
      }
      if (statsRes.status === 'rejected') {
        console.error('[Dashboard] orderStats API失败:', statsRes.reason?.message);
        failCount++;
      }

      const dash = dashRes.status === 'fulfilled' ? (dashRes.value?.data ?? dashRes.value ?? {}) : {};
      const stats = statsRes.status === 'fulfilled' ? (statsRes.value?.data ?? statsRes.value ?? {}) : {};
      setTodayScanCount(Number(dash.todayScanCount || 0));
      // 更新 smart-hints：已延期/临近交期计数
      const overdueCount = Number(dash.overdueOrderCount || stats.delayedOrders || 0);
      const warningCount = Number(stats.warningOrders || 0);
      setSmartHintsData({ overdueCount, warningCount });

      if (failCount >= 2) {
        toast.error('数据加载失败，请检查网络后刷新');
      } else if (failCount > 0) {
        toast.warn('部分数据加载失败');
      }
    } catch (e) {
      console.error('[Dashboard] refreshCards error:', e?.message);
      toast.error('数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  const loadOrders = useCallback(async (reset) => {
    try {
      const params = { page: 1, pageSize: smartFilter ? 50 : 30, excludeTerminal: 'true' };
      // 生产中：不传 status，由 excludeTerminal='true' 排除终止状态（已完成/已取消/已报废/已归档/已关单），
      // 这样可以正确显示所有活跃订单（production/in_progress/cutting/sewing/ironing/packaging/quality_check/warehousing 等）
      if (activeFilter === 'completed') params.status = 'completed';
      if (searchKey) params.orderNo = searchKey;
      if (factoryType) params.factoryType = factoryType;
      const res = await api.production.orderList(params);
      const data = res?.data ?? res ?? {};
      let rawList = data?.records ?? data?.list ?? [];
      // smart-hints 筛选：已延期/临近交期
      if (smartFilter === 'overdue') {
        rawList = rawList.filter(o => {
          const delivery = new Date(String(o.plannedEndDate || o.expectedShipDate || o.deliveryDate || '').replace(' ', 'T'));
          return !isNaN(delivery.getTime()) && delivery < new Date();
        });
      } else if (smartFilter === 'warning') {
        rawList = rawList.filter(o => {
          const delivery = new Date(String(o.plannedEndDate || o.expectedShipDate || o.deliveryDate || '').replace(' ', 'T'));
          if (isNaN(delivery.getTime())) return false;
          const diffDays = (delivery.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          return diffDays >= 0 && diffDays <= 3; // 3天内交期
        });
      }
      const list = rawList.map(r => transformOrderData(r));
      setOrders(reset ? list : prev => [...prev, ...list]);
    } catch (e) {
      console.error('[Dashboard] loadOrders error:', e?.message);
      toast.error('订单数据加载失败');
    }
  }, [activeFilter, searchKey, factoryType, smartFilter]);

  useEffect(() => { loadOrders(true); }, [activeFilter, factoryType, smartFilter]);

  useEffect(() => {
    const onRefresh = () => { refreshCards(); loadOrders(true); };
    eventBus.on('DATA_REFRESH', onRefresh);
    return () => eventBus.off('DATA_REFRESH', onRefresh);
  }, [loadOrders]);

  const toggleExpand = useCallback((id) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  const handleRefresh = useCallback(() => {
    refreshCards();
    loadOrders(true);
  }, [loadOrders]);

  const handleSmartHintClick = (key) => {
    // 点击小标签切换筛选，点击已选中的则清除
    setSmartFilter(prev => prev === key ? '' : key);
  };

  const hasSmartHints = smartHintsData.overdueCount > 0 || smartHintsData.warningCount > 0;

  return (
    <div className="dashboard-stack">
      <div className="sub-page-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sub-page-title">今日概览</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {todayScanCount > 0 && (
            <span className="today-scan-badge">今日扫码 {todayScanCount} 次</span>
          )}
          <button className="refresh-btn" onClick={handleRefresh}>
            <Icon name="refresh" size={12} /> 刷新
          </button>
        </div>
      </div>

      {/* smart-hints 小标签：已延期/临近交期 */}
      <div className="smart-hints" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
        {smartHintsData.overdueCount > 0 && (
          <button
            className={`smart-hint danger${smartFilter === 'overdue' ? ' active' : ''}`}
            onClick={() => handleSmartHintClick('overdue')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', fontSize: 12, borderRadius: 4,
              background: smartFilter === 'overdue' ? '#ff4d4f' : '#fff1f0',
              color: smartFilter === 'overdue' ? '#fff' : '#ff4d4f',
              border: '1px solid #ffa39e', cursor: 'pointer'
            }}
          >
            <span style={{ fontWeight: 600 }}>{smartHintsData.overdueCount}</span>
            <span>已延期</span>
          </button>
        )}
        {smartHintsData.warningCount > 0 && (
          <button
            className={`smart-hint warning${smartFilter === 'warning' ? ' active' : ''}`}
            onClick={() => handleSmartHintClick('warning')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', fontSize: 12, borderRadius: 4,
              background: smartFilter === 'warning' ? '#fa8c16' : '#fff7e6',
              color: smartFilter === 'warning' ? '#fff' : '#d46b08',
              border: '1px solid #ffd591', cursor: 'pointer'
            }}
          >
            <span style={{ fontWeight: 600 }}>{smartHintsData.warningCount}</span>
            <span>临近交期</span>
          </button>
        )}
        {smartFilter && (
          <button
            className="smart-hint-clear"
            onClick={() => setSmartFilter('')}
            style={{ fontSize: 12, color: '#8c8c8c', padding: '4px 8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
          >清除筛选 ✕</button>
        )}
      </div>

      <div className="filter-row">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} className={`filter-btn${activeFilter === f.key ? ' active' : ''}`}
            onClick={() => setActiveFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="filter-row">
        {FACTORY_TYPES.map(f => (
          <button key={f.key} className={`filter-btn${factoryType === f.key ? ' active' : ''}`}
            onClick={() => setFactoryType(f.key)}>{f.label}</button>
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
