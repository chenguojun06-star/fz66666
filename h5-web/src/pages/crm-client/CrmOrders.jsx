import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useCrmClientStore from '@/stores/crmClientStore';
import crmClient from '@/api/crmClient';

const ORDER_STATUS_MAP = {
  PENDING: '待处理', IN_PROGRESS: '进行中', COMPLETED: '已完成',
  CANCELLED: '已取消', CONFIRMED: '已确认', SHIPPED: '已发货',
  DELIVERED: '已送达', CLOSED: '已关闭', REJECTED: '已拒绝',
};
export const orderStatusText = (s) => ORDER_STATUS_MAP[s] || '未知';

const CrmOrders = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => {
    loadOrders();
  }, [status, page]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const params = { page, pageSize };
      if (status) params.status = status;
      const res = await crmClient.getOrders(params);
      setOrders(res?.list || []);
      setTotal(res?.total || 0);
      setTotalPages(res?.totalPages || 0);
    } catch (err) {
      console.error('加载订单失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const goPrev = () => { if (page > 1) { setPage(page - 1); window.scrollTo({ top: 0, behavior: 'smooth' }); } };
  const goNext = () => { if (page < totalPages) { setPage(page + 1); window.scrollTo({ top: 0, behavior: 'smooth' }); } };

  const statusFilters = [
    { label: '全部', value: '' },
    { label: '进行中', value: 'IN_PROGRESS' },
    { label: '已完成', value: 'COMPLETED' },
    { label: '待处理', value: 'PENDING' },
  ];

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>我的订单</h1>

      <div style={styles.filterBar}>
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatus(f.value)}
            style={{
              ...styles.filterBtn,
              background: status === f.value ? '#667eea' : '#fff',
              color: status === f.value ? '#fff' : '#666',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={styles.count}>共 {total} 条</div>

      {loading ? (
        <div style={styles.loading}>加载中...</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>暂无订单</div>
      ) : (
        orders.map((order) => (
          <div key={order.id} style={styles.card} onClick={() => navigate(`/crm-client/orders/${order.id}`)}>
            <div style={styles.cardHeader}>
              <span style={styles.orderNo}>{order.orderNo}</span>
              <span style={{ ...styles.badge, background: getStatusBg(order.status) }}>{orderStatusText(order.status)}</span>
            </div>
            <div style={styles.cardBody}>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>款号</span>
                <span style={styles.cardValue}>{order.styleNo}</span>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>数量</span>
                <span style={styles.cardValue}>{order.orderQuantity || 0} 件</span>
              </div>
              <div style={styles.cardRow}>
                <span style={styles.cardLabel}>进度</span>
                <span style={styles.cardValue}>{order.productionProgress || 0}%</span>
              </div>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${order.productionProgress || 0}%` }} />
            </div>
          </div>
        ))
      )}
      {totalPages > 1 && (
        <div style={styles.pagination}>
          <button onClick={goPrev} disabled={page <= 1} style={{ ...styles.pagBtn, opacity: page <= 1 ? 0.4 : 1 }}>上一页</button>
          <span style={styles.pagInfo}>第 {page} / {totalPages} 页 · 共 {total} 条</span>
          <button onClick={goNext} disabled={page >= totalPages} style={{ ...styles.pagBtn, opacity: page >= totalPages ? 0.4 : 1 }}>下一页</button>
        </div>
      )}
    </div>
  );
};

const getStatusBg = (s) => {
  const m = { COMPLETED: '#d4edda', IN_PROGRESS: '#cce5ff', PENDING: '#fff3cd', CANCELLED: '#f8d7da' };
  return m[s] || '#e2e3e5';
};

const styles = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 16px' },
  filterBar: { display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
  count: { fontSize: '13px', color: '#888', marginBottom: '12px' },
  loading: { textAlign: 'center', padding: '40px', color: '#888' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#aaa', fontSize: '15px' },
  card: { background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' },
  orderNo: { fontSize: '15px', fontWeight: '600', color: '#333' },
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' },
  cardBody: { display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '10px' },
  cardRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px' },
  cardLabel: { color: '#888' },
  cardValue: { color: '#333', fontWeight: '500' },
  progressBar: { height: '4px', background: '#e9ecef', borderRadius: '2px', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #667eea, #764ba2)', borderRadius: '2px' },
  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '16px 8px 24px' },
  pagBtn: { padding: '6px 16px', background: '#667eea', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
  pagInfo: { fontSize: '13px', color: '#888' },
};

export default CrmOrders;
