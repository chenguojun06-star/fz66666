import { useState, useEffect } from 'react';
import useSupplierStore from '@/stores/supplierStore';
import supplierPortal from '@/api/supplierPortal';

const SupplierDashboard = () => {
  const supplier = useSupplierStore((s) => s.supplier);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try { setLoading(true); const res = await supplierPortal.getDashboard(); setData(res); }
    catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  if (loading) return <div style={s.loading}>加载中...</div>;

  const stats = [
    { label: '待发货', value: data?.pendingPurchases || 0, icon: '📦', color: '#11998e' },
    { label: '部分到货', value: data?.partialPurchases || 0, icon: '🚚', color: '#f093fb' },
    { label: '已完成', value: data?.completedPurchases || 0, icon: '✅', color: '#4facfe' },
    { label: '待对账', value: data?.pendingReconciliationCount || 0, icon: '📋', color: '#fa709a' },
  ];

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.greeting}>{supplier?.factoryName || '供应商'}</h1>
        <p style={s.subGreeting}>供应商协同平台</p>
      </div>

      <div style={s.statsGrid}>
        {stats.map((st, i) => (
          <div key={i} style={{ ...s.statCard, borderLeft: `4px solid ${st.color}` }}>
            <div style={s.statIcon}>{st.icon}</div>
            <div style={s.statInfo}>
              <div style={s.statValue}>{st.value}</div>
              <div style={s.statLabel}>{st.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <h2 style={s.sectionTitle}>财务概览</h2>
        <div style={s.row}><span style={s.label}>应付总额</span><span style={s.val}>¥{(data?.totalPayable || 0).toLocaleString()}</span></div>
        <div style={s.row}><span style={s.label}>已付金额</span><span style={{ ...s.val, color: '#27ae60' }}>¥{(data?.totalPaid || 0).toLocaleString()}</span></div>
        <div style={s.row}><span style={s.label}>未付金额</span><span style={{ ...s.val, color: '#e74c3c' }}>¥{(data?.outstandingPayable || 0).toLocaleString()}</span></div>
        <div style={s.row}><span style={s.label}>应付笔数</span><span style={s.val}>{data?.payablesCount || 0} 笔</span></div>
      </div>

      {data?.recentPurchases?.length > 0 && (
        <div style={s.section}>
          <h2 style={s.sectionTitle}>最近采购</h2>
          {data.recentPurchases.map((p) => (
            <div key={p.id} style={s.orderCard}>
              <div style={s.orderHeader}>
                <span style={s.orderNo}>{p.materialName || p.purchaseNo}</span>
                <span style={s.badge}>{p.status}</span>
              </div>
              <div style={s.orderBody}>
                <span>{p.orderNo}</span>
                <span>×{p.purchaseQuantity || 0} {p.unit || ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  loading: { textAlign: 'center', padding: '60px 20px', color: '#888' },
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
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0f0f0', fontSize: '14px' },
  label: { color: '#888' },
  val: { color: '#333', fontWeight: '600' },
  orderCard: { padding: '12px', borderBottom: '1px solid #f0f0f0' },
  orderHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  orderNo: { fontSize: '14px', fontWeight: '600', color: '#333' },
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#e2e3e5', fontWeight: '600' },
  orderBody: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#666' },
};

export default SupplierDashboard;
