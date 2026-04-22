import { useState, useEffect } from 'react';
import supplierPortal from '@/api/supplierPortal';

const SupplierInventory = () => {
  const [stocks, setStocks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [alertOnly, setAlertOnly] = useState(false);

  useEffect(() => { loadInventory(); }, [alertOnly]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      const params = {};
      if (keyword) params.keyword = keyword;
      if (alertOnly) params.alert = 'low';
      const res = await supplierPortal.getInventory(params);
      setStocks(res?.list || []);
      setTotal(res?.total || 0);
    } catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const handleSearch = (e) => { e.preventDefault(); loadInventory(); };

  return (
    <div style={s.page}>
      <h1 style={s.title}>库存查询</h1>
      <form onSubmit={handleSearch} style={s.searchBar}>
        <input type="text" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="搜索物料名称/编码" style={s.searchInput} />
        <button type="submit" style={s.searchBtn}>搜索</button>
      </form>
      <div style={s.filterRow}>
        <button onClick={() => setAlertOnly(!alertOnly)}
          style={{ ...s.filterBtn, background: alertOnly ? '#e74c3c' : '#fff', color: alertOnly ? '#fff' : '#666' }}>
          ⚠️ 仅看低库存
        </button>
        <span style={s.count}>共 {total} 条</span>
      </div>
      {loading ? <div style={s.loading}>加载中...</div> :
       stocks.length === 0 ? <div style={s.empty}>暂无库存数据</div> :
       stocks.map((st) => (
        <div key={st.id} style={{ ...s.card, borderLeft: st.isLowStock ? '4px solid #e74c3c' : '4px solid #11998e' }}>
          <div style={s.cardHeader}>
            <span style={s.cardTitle}>{st.materialName || st.materialCode}</span>
            {st.isLowStock && <span style={s.lowBadge}>低库存</span>}
          </div>
          <div style={s.cardRow}><span style={s.cardLabel}>编码</span><span style={s.cardVal}>{st.materialCode || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>当前库存</span><span style={{ ...s.cardVal, color: st.isLowStock ? '#e74c3c' : '#333' }}>{st.quantity || 0} {st.unit || ''}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>安全库存</span><span style={s.cardVal}>{st.safetyStock || '-'}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>冻结数量</span><span style={s.cardVal}>{st.lockedQuantity || 0}</span></div>
          <div style={s.cardRow}><span style={s.cardLabel}>库位</span><span style={s.cardVal}>{st.location || '-'}</span></div>
        </div>
      ))}
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: '0 0 16px' },
  searchBar: { display: 'flex', gap: '8px', marginBottom: '12px' },
  searchInput: { flex: 1, padding: '10px 12px', border: '1px solid #ddd', borderRadius: '10px', fontSize: '14px' },
  searchBtn: { padding: '10px 16px', background: '#11998e', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer' },
  filterRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' },
  filterBtn: { padding: '6px 14px', borderRadius: '20px', border: '1px solid #ddd', fontSize: '13px', cursor: 'pointer' },
  count: { fontSize: '13px', color: '#888' },
  loading: { textAlign: 'center', padding: '40px', color: '#888' },
  empty: { textAlign: 'center', padding: '60px 20px', color: '#aaa' },
  card: { background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' },
  cardTitle: { fontSize: '15px', fontWeight: '600', color: '#333' },
  lowBadge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', background: '#f8d7da', color: '#e74c3c', fontWeight: '600' },
  cardRow: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', padding: '3px 0' },
  cardLabel: { color: '#888' },
  cardVal: { color: '#333', fontWeight: '500' },
};

export default SupplierInventory;
