import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';

const CrmPurchaseDetail = () => {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDetail(); }, [purchaseId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getPurchaseDetail(purchaseId);
      setData(res);
    } catch (err) {
      console.error('加载采购详情失败:', err);
    } finally {
      setLoading(false);
    }
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
        <div style={s.row}><span style={s.label}>物料类型</span><span style={s.val}>{p.materialType || '-'}</span></div>
        <div style={s.row}><span style={s.label}>规格</span><span style={s.val}>{p.specifications || '-'}</span></div>
        <div style={s.row}><span style={s.label}>采购数量</span><span style={s.val}>{p.purchaseQuantity || 0}</span></div>
        <div style={s.row}><span style={s.label}>已到数量</span><span style={s.val}>{p.arrivedQuantity || 0}</span></div>
        <div style={s.row}><span style={s.label}>单价</span><span style={s.val}>¥{p.unitPrice?.toLocaleString() || '-'}</span></div>
        <div style={s.row}><span style={s.label}>总金额</span><span style={s.val}>¥{p.totalAmount?.toLocaleString() || '-'}</span></div>
        <div style={s.row}><span style={s.label}>状态</span><span style={s.val}>{p.status}</span></div>
        <div style={s.row}><span style={s.label}>关联订单</span><span style={s.val}>{p.orderNo || '-'}</span></div>
        <div style={s.row}><span style={s.label}>预计到货</span><span style={s.val}>{p.expectedArrivalDate || '-'}</span></div>
        <div style={s.row}><span style={s.label}>实际到货</span><span style={s.val}>{p.actualArrivalDate || '-'}</span></div>
      </div>

      {data.order && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>关联订单</h2>
          <div style={s.row}><span style={s.label}>订单号</span><span style={s.val}>{data.order.orderNo}</span></div>
          <div style={s.row}><span style={s.label}>款号</span><span style={s.val}>{data.order.styleNo}</span></div>
          <div style={s.row}><span style={s.label}>进度</span><span style={s.val}>{data.order.productionProgress || 0}%</span></div>
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
  backBtn: { background: 'none', border: 'none', fontSize: '16px', color: '#667eea', cursor: 'pointer', padding: 0 },
  title: { fontSize: '20px', fontWeight: '700', color: '#1a1a2e', margin: 0 },
  card: { background: '#fff', borderRadius: '12px', padding: '16px', marginBottom: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' },
  cardTitle: { fontSize: '16px', fontWeight: '600', color: '#1a1a2e', margin: '0 0 12px' },
  row: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: '14px' },
  label: { color: '#888' },
  val: { color: '#333', fontWeight: '500' },
};

export default CrmPurchaseDetail;
