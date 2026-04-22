import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import supplierPortal from '@/api/supplierPortal';

const SupplierPurchaseDetail = () => {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [shipping, setShipping] = useState(false);
  const [shipQty, setShipQty] = useState('');
  const [shipRemark, setShipRemark] = useState('');

  useEffect(() => { loadDetail(); }, [purchaseId]);

  const loadDetail = async () => {
    try { setLoading(true); const res = await supplierPortal.getPurchaseDetail(purchaseId); setData(res); }
    catch (err) { console.error('加载失败:', err); }
    finally { setLoading(false); }
  };

  const handleShip = async () => {
    if (!shipQty || parseInt(shipQty) <= 0) { alert('请输入发货数量'); return; }
    setShipping(true);
    try {
      await supplierPortal.updateShipment(purchaseId, {
        status: 'partial_arrival',
        shipQuantity: parseInt(shipQty),
        remark: shipRemark,
      });
      alert('发货信息已更新');
      setShipQty('');
      setShipRemark('');
      loadDetail();
    } catch (err) { alert('更新失败: ' + (err?.message || '')); }
    finally { setShipping(false); }
  };

  const handleComplete = async () => {
    if (!confirm('确认该采购单已全部发货？')) return;
    setShipping(true);
    try {
      await supplierPortal.updateShipment(purchaseId, { status: 'completed', remark: '供应商确认全部发货' });
      alert('已标记为全部发货');
      loadDetail();
    } catch (err) { alert('更新失败'); }
    finally { setShipping(false); }
  };

  if (loading) return <div style={s.loading}>加载中...</div>;
  if (!data?.purchase) return <div style={s.empty}>采购单不存在</div>;
  const p = data.purchase;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn}>← 返回</button>
        <h1 style={s.title}>{p.purchaseNo}</h1>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>采购信息</h2>
        <div style={s.row}><span style={s.label}>物料名称</span><span style={s.val}>{p.materialName || '-'}</span></div>
        <div style={s.row}><span style={s.label}>物料编码</span><span style={s.val}>{p.materialCode || '-'}</span></div>
        <div style={s.row}><span style={s.label}>规格</span><span style={s.val}>{p.specifications || '-'}</span></div>
        <div style={s.row}><span style={s.label}>采购数量</span><span style={s.val}>{p.purchaseQuantity || 0} {p.unit || ''}</span></div>
        <div style={s.row}><span style={s.label}>已到货</span><span style={s.val}>{p.arrivedQuantity || 0}</span></div>
        <div style={s.row}><span style={s.label}>状态</span><span style={s.val}>{p.status}</span></div>
        <div style={s.row}><span style={s.label}>关联订单</span><span style={s.val}>{p.orderNo || '-'}</span></div>
        <div style={s.row}><span style={s.label}>款号</span><span style={s.val}>{p.styleNo || '-'}</span></div>
        <div style={s.row}><span style={s.label}>预计到货</span><span style={s.val}>{p.expectedArrivalDate || '-'}</span></div>
      </div>

      {p.status !== 'completed' && p.status !== 'cancelled' && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>发货操作</h2>
          <div style={s.field}>
            <label style={s.label}>本次发货数量</label>
            <input type="number" value={shipQty} onChange={(e) => setShipQty(e.target.value)} placeholder="输入数量" style={s.input} />
          </div>
          <div style={s.field}>
            <label style={s.label}>备注</label>
            <input type="text" value={shipRemark} onChange={(e) => setShipRemark(e.target.value)} placeholder="物流单号等" style={s.input} />
          </div>
          <div style={s.btnGroup}>
            <button onClick={handleShip} disabled={shipping} style={s.shipBtn}>{shipping ? '提交中...' : '登记发货'}</button>
            <button onClick={handleComplete} disabled={shipping} style={s.completeBtn}>确认全部发货</button>
          </div>
        </div>
      )}

      {p.remark && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>备注</h2>
          <p style={s.remarkText}>{p.remark}</p>
        </div>
      )}
    </div>
  );
};

const s = {
  page: { padding: '16px', maxWidth: '600px', margin: '0 auto' },
  loading: { textAlign: 'center', padding: '60px', color: '#888' },
  empty: { textAlign: 'center', padding: '60px', color: '#aaa' },
  header: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' },
  backBtn: { background: 'none', border: 'none', fontSize: '16px', color: '#11998e', cursor: 'pointer', padding: 0 },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: '0 0 12px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '14px' },
  label: { color: '#888' },
  val: { color: '#333', fontWeight: '500' },
  field: { marginBottom: '12px' },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box' },
  btnGroup: { display: 'flex', gap: '10px', marginTop: '12px' },
  shipBtn: { flex: 1, padding: '12px', background: 'linear-gradient(135deg, #11998e, #38ef7d)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  completeBtn: { flex: 1, padding: '12px', background: '#fff', color: '#11998e', border: '1px solid #11998e', borderRadius: '10px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
  remarkText: { fontSize: '13px', color: '#666', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' },
};

export default SupplierPurchaseDetail;
