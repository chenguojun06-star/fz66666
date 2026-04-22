import { useState, useEffect } from 'react';
import supplierPortal from '@/api/supplierPortal';

const SupplierReconciliations = () => {
  const [recons, setRecons] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');

  useEffect(() => { loadRecons(); }, [status]);

  const loadRecons = async () => {
    try {
      setLoading(true);
      const params = {};
      if (status) params.status = status;
      const res = await supplierPortal.getReconciliations(params);
      setRecons(res?.list || []);
      setTotal(res?.total || 0);
    } catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const filters = [
    { label: '全部', value: '' },
    { label: '待确认', value: 'pending' },
    { label: '已核实', value: 'verified' },
    { label: '已审批', value: 'approved' },
    { label: '已付款', value: 'paid' },
  ];

  const statusColor = (st) => {
    switch (st) {
      case 'pending': return '#f39c12';
      case 'verified': return '#3498db';
      case 'approved': return '#9b59b6';
      case 'paid': return '#27ae60';
      case 'rejected': return '#e74c3c';
      default: return '#888';
    }
  };

  const statusLabel = (st) => {
    switch (st) {
      case 'pending': return '待确认';
      case 'verified': return '已核实';
      case 'approved': return '已审批';
      case 'paid': return '已付款';
      case 'rejected': return '已驳回';
      default: return st || '-';
    }
  };

  return (
    <div style={s.page}>
      <h1 style={s.title}>对账单</h1>
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
       recons.length === 0 ? <div style={s.empty}>暂无对账记录</div> :
       recons.map((r) => (
        <div key={r.id} style={s.card}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{r.reconciliationNo || r.materialName || '-'}</span>
            <span style={{ ...s.badge, background: statusColor(r.status) + '20', color: statusColor(r.status) }}>
              {statusLabel(r.status)}
            </span>
          </div>
          <div style={s.cardRow}><span style={s.cardLabel}>物料</span><span style={s.cardVal}>{r.materialName || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>数量</span><span style={s.cardVal}>{r.quantity || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>单价</span><span style={s.cardVal}>¥{(r.unitPrice || 0).toLocaleString()}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>总金额</span><span style={{ ...s.cardVal, fontWeight: '700' }}>¥{(r.totalAmount || 0).toLocaleString()}</span></div>
          {r.deductionAmount > 0 && (
            <div style={s.cardRow}><span style={s.cardLabel}>扣款</span><span style={{ ...s.cardVal, color: '#e74c3c' }}>-¥{(r.deductionAmount || 0).toLocaleString()}</span></div>
          )}
          <div style={s.cardRow}><span style={s.cardLabel}>最终金额</span><span style={{ ...s.cardVal, color: '#11998e', fontWeight: '700' }}>¥{(r.finalAmount || 0).toLocaleString()}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>关联采购</span><span style={s.cardVal}>{r.purchaseNo || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>关联订单</span><span style={s.cardVal}>{r.orderNo || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>对账日期</span><span style={s.cardVal}>{r.reconciliationDate || '-'}</span></div>
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

export default SupplierReconciliations;
