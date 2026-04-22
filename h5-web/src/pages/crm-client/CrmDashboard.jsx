import { useState, useEffect } from 'react';
import useCrmClientStore from '@/stores/crmClientStore';
import crmClient from '@/api/crmClient';

const CrmDashboard = () => {
  const customer = useCrmClientStore((s) => s.customer);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getDashboard();
      setData(res);
    } catch (err) {
      setError(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={styles.loading}>加载中...</div>;
  }

  if (error) {
    return <div style={styles.errorBox}>{error}</div>;
  }

  const stats = [
    { label: '订单总数', value: data?.totalOrders || 0, icon: '📦', color: '#667eea' },
    { label: '应收总额', value: `¥${(data?.totalReceivable || 0).toLocaleString()}`, icon: '💰', color: '#f093fb' },
    { label: '已收金额', value: `¥${(data?.totalReceived || 0).toLocaleString()}`, icon: '✅', color: '#4facfe' },
    { label: '未收金额', value: `¥${(data?.outstandingAmount || 0).toLocaleString()}`, icon: '⏳', color: '#fa709a' },
  ];

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.greeting}>您好，{customer?.companyName || '客户'}</h1>
          <p style={styles.subGreeting}>{customer?.customerLevel === 'VIP' ? '⭐ VIP客户' : '欢迎回来'}</p>
        </div>
      </div>

      <div style={styles.statsGrid}>
        {stats.map((s, i) => (
          <div key={i} style={{ ...styles.statCard, borderLeft: `4px solid ${s.color}` }}>
            <div style={styles.statIcon}>{s.icon}</div>
            <div style={styles.statInfo}>
              <div style={styles.statValue}>{s.value}</div>
              <div style={styles.statLabel}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>采购进度</h2>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>关联采购单</span>
          <span style={styles.infoValue}>{data?.totalPurchases || 0} 笔</span>
        </div>
        <div style={styles.infoRow}>
          <span style={styles.infoLabel}>应收账款</span>
          <span style={styles.infoValue}>{data?.receivablesCount || 0} 笔</span>
        </div>
      </div>

      {data?.recentOrders && data.recentOrders.length > 0 && (
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>最近订单</h2>
          {data.recentOrders.map((order) => (
            <div key={order.id} style={styles.orderCard}>
              <div style={styles.orderHeader}>
                <span style={styles.orderNo}>{order.orderNo}</span>
                <span style={{ ...styles.statusBadge, background: getStatusBg(order.status) }}>
                  {order.status}
                </span>
              </div>
              <div style={styles.orderBody}>
                <span style={styles.styleNo}>{order.styleNo}</span>
                <span style={styles.qty}>×{order.orderQuantity || 0}</span>
              </div>
              <div style={styles.progressBar}>
                <div style={{ ...styles.progressFill, width: `${order.productionProgress || 0}%` }} />
              </div>
              <div style={styles.progressText}>{order.productionProgress || 0}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const getStatusBg = (status) => {
  const map = { COMPLETED: '#d4edda', IN_PROGRESS: '#cce5ff', PENDING: '#fff3cd', CANCELLED: '#f8d7da' };
  return map[status] || '#e2e3e5';
};

const styles = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  loading: { textAlign: 'center', padding: '60px 20px', color: '#888', fontSize: '16px' },
  errorBox: { textAlign: 'center', padding: '40px 20px', color: '#e74c3c', background: '#ffeaea', margin: '20px', borderRadius: '12px' },
  header: { marginBottom: '20px' },
  greeting: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 4px' },
  subGreeting: { fontSize: '14px', color: '#888', margin: 0 },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' },
  statCard: { background: '#fff', borderRadius: '12px', padding: '16px', display: 'flex', alignItems: 'center', gap: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  statIcon: { fontSize: '28px' },
  statInfo: { flex: 1 },
  statValue: { fontSize: '18px', fontWeight: '700', color: '#1a1a2e' },
  statLabel: { fontSize: '12px', color: '#888', marginTop: '2px' },
  section: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  sectionTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: '0 0 12px' },
  infoRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0' },
  infoLabel: { fontSize: '14px', color: '#666' },
  infoValue: { fontSize: '14px', fontWeight: '600', color: '#1a1a2e' },
  orderCard: { padding: '12px', borderBottom: '1px solid #f0f0f0' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  orderNo: { fontSize: '14px', fontWeight: '600', color: '#333' },
  statusBadge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' },
  orderBody: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666', marginBottom: '8px' },
  styleNo: { color: '#667eea' },
  qty: { color: '#888' },
  progressBar: { height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #667eea, #764ba2)', borderRadius: '3px', transition: 'width 0.3s' },
  progressText: { fontSize: '11px', color: '#888', textAlign: 'right', marginTop: '2px' },
};

export default CrmDashboard;
