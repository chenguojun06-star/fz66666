import { useState, useEffect } from 'react';
import supplierPortal from '@/api/supplierPortal';

const SupplierPayables = () => {
  const [payables, setPayables] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => { loadPayables(); }, [status]);

  const loadPayables = async () => {
    try {
      setLoading(true);
      const params = {};
      if (status) params.status = status;
      const res = await supplierPortal.getPayables(params);
      setPayables(res?.list || []);
      setTotal(res?.total || 0);
    } catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const filters = [
    { label: '全部', value: '' },
    { label: '待付款', value: 'PENDING' },
    { label: '部分付款', value: 'PARTIAL' },
    { label: '已付清', value: 'PAID' },
    { label: '逾期', value: 'OVERDUE' },
  ];

  const statusColor = (st) => {
    switch (st) {
      case 'PENDING': return '#f39c12';
      case 'PARTIAL': return '#3498db';
      case 'PAID': return '#27ae60';
      case 'OVERDUE': return '#e74c3c';
      default: return '#888';
    }
  };

  const statusLabel = (st) => {
    switch (st) {
      case 'PENDING': return '待付款';
      case 'PARTIAL': return '部分付款';
      case 'PAID': return '已付清';
      case 'OVERDUE': return '逾期';
      default: return st || '-';
    }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>应付账款</h1>
      <div style={s.filterBar}>
        {filters.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)}
            style={{ ...s.filterBtn, background: status === f.value ? '#11998e' : '#fff', color: status === f.value ? '#fff' : '#666' }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={s.count}>共 {total} 条</div>
      {loading ? <div style={s.loading}>加载中...</div> :
       payables.length === 0 ? <div style={s.empty}>暂无应付账款</div> :
       payables.map((p) => (
        <div key={p.id} style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{p.payableNo || p.orderNo || '-'}</span>
            <span style={{ ...s.badge, background: statusColor(p.status) + '20', color: statusColor(p.status) }}>
              {statusLabel(p.status)}
            </span>
          </div>
          <div style={s.cardRow}><span style={s.cardLabel}>关联单号</span><span style={s.cardVal}>{p.orderNo || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>应付金额</span><span style={{ ...s.cardVal, fontWeight: '700' }}>¥{(p.amount || 0).toLocaleString()}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>已付金额</span><span style={{ ...s.cardVal, color: '#27ae60' }}>¥{(p.paidAmount || 0).toLocaleString()}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>未付金额</span><span style={{ ...s.cardVal, color: '#e74c3c' }}>¥{(p.outstandingAmount || 0).toLocaleString()}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>到期日</span><span style={s.cardVal}>{p.dueDate || '-'}</span></div>
          {p.description && <div style={s.cardRow}><span style={s.cardLabel}>说明</span><span style={s.cardVal}>{p.description}</span></div>}
        </div>
      ))}
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 16px' },
  filterBar: { display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' },
  count: { fontSize: '13px', color: '#888', marginBottom: '12px' },
  loading: { textAlign: 'center', padding: '40px', color: '#888' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#aaa' },
  card: { background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  cardTitle: { fontSize: '15px', fontWeight: '600', color: '#333' },
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' },
  cardRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' },
  cardLabel: { color: '#888' },
  cardVal: { color: '#333', fontWeight: '500' },
};

export default SupplierPayables;
