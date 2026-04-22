import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';

const CrmReceivables = () => {
  const navigate = useNavigate();
  const [receivables, setReceivables] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => { loadReceivables(); }, [status]);

  const loadReceivables = async () => {
    try {
      setLoading(true);
      const params = {};
      if (status) params.status = status;
      const res = await crmClient.getReceivables(params);
      setReceivables(res?.list || []);
      setTotal(res?.total || 0);
    } catch (err) {
      console.error('加载应收失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const statusFilters = [
    { label: '全部', value: '' },
    { label: '待收款', value: 'PENDING' },
    { label: '部分收款', value: 'PARTIAL' },
    { label: '已收款', value: 'PAID' },
    { label: '逾期', value: 'OVERDUE' },
  ];

  return (
    <div style={s.page}>
      <h1 style={s.title}>应收账款</h1>
      <div style={s.filterBar}>
        {statusFilters.map((f) => (
          <button key={f.value} onClick={() => setStatus(f.value)}
            style={{ ...s.filterBtn, background: status === f.value ? '#667eea' : '#fff', color: status === f.value ? '#fff' : '#666' }}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={s.count}>共 {total} 条</div>
      {loading ? <div style={s.loading}>加载中...</div> :
       receivables.length === 0 ? <div style={s.empty}>暂无应收账款</div> :
       receivables.map((r) => (
        <div key={r.id} style={s.card} onClick={() => navigate(`/crm-client/receivables/${r.id}`)}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{r.receivableNo}</span>
            <span style={{ ...s.badge, background: r.status === 'OVERDUE' ? '#f8d7da' : r.status === 'PAID' ? '#d4edda' : '#e2e3e5' }}>{r.status}</span>
          </div>
          <div style={s.cardRow}><span style={s.cardLabel}>金额</span><span style={s.cardVal}>¥{r.amount?.toLocaleString() || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>已收</span><span style={s.cardVal}>¥{r.receivedAmount?.toLocaleString() || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>未收</span><span style={{ ...s.cardVal, color: '#e74c3c' }}>¥{r.outstandingAmount?.toLocaleString() || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>到期日</span><span style={s.cardVal}>{r.dueDate || '-'}</span></div>
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
  card: { background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', cursor: 'pointer' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  cardTitle: { fontSize: '15px', fontWeight: '600', color: '#333' },
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' },
  cardRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' },
  cardLabel: { color: '#888' },
  cardVal: { color: '#333', fontWeight: '500' },
};

export default CrmReceivables;
