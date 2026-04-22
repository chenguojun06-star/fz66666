import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supplierPortal from '@/api/supplierPortal';

const SupplierPurchases = () => {
  const navigate = useNavigate();
  const [purchases, setPurchases] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => { loadPurchases(); }, [status]);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      const params = {};
      if (status) params.status = status;
      const res = await supplierPortal.getPurchases(params);
      setPurchases(res?.list || []);
      setTotal(res?.total || 0);
    } catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const filters = [
    { label: '全部', value: '' },
    { label: '待发货', value: 'pending' },
    { label: '部分到货', value: 'partial_arrival' },
    { label: '已完成', value: 'completed' },
  ];

  return (
    <div style={s.page}>
      <h1 style={s.title}>采购需求</h1>
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
       purchases.length === 0 ? <div style={s.empty}>暂无采购需求</div> :
       purchases.map((p) => (
        <div key={p.id} style={s.card} onClick={() => navigate(`/supplier-portal/purchases/${p.id}`)}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{p.materialName || p.purchaseNo}</span>
            <span style={s.badge}>{p.status}</span>
          </div>
          <div style={s.cardRow}><span style={s.cardLabel}>采购单号</span><span style={s.cardVal}>{p.purchaseNo}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>关联订单</span><span style={s.cardVal}>{p.orderNo || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>数量</span><span style={s.cardVal}>{p.purchaseQuantity || 0} {p.unit || ''}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>已到货</span><span style={s.cardVal}>{p.arrivedQuantity || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>预计到货</span><span style={s.cardVal}>{p.expectedArrivalDate || '-'}</span></div>
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
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#e2e3e5', fontWeight: '600' },
  cardRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' },
  cardLabel: { color: '#888' },
  cardVal: { color: '#333', fontWeight: '500' },
};

export default SupplierPurchases;
