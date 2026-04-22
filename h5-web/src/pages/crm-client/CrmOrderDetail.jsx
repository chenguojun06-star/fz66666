import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';

const CrmOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDetail();
  }, [orderId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getOrderDetail(orderId);
      setData(res);
    } catch (err) {
      console.error('加载订单详情失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={s.loading}>加载中...</div>;
  if (!data?.order) return <div style={s.empty}>订单不存在</div>;

  const order = data.order;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn}>← 返回</button>
        <h1 style={s.title}>{order.orderNo}</h1>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>订单信息</h2>
        <div style={s.row}><span style={s.label}>款号</span><span style={s.val}>{order.styleNo}</span></div>
        <div style={s.row}><span style={s.label}>款名</span><span style={s.val}>{order.styleName || '-'}</span></div>
        <div style={s.row}><span style={s.label}>颜色/尺码</span><span style={s.val}>{[order.color, order.size].filter(Boolean).join('/') || '-'}</span></div>
        <div style={s.row}><span style={s.label}>数量</span><span style={s.val}>{order.orderQuantity || 0} 件</span></div>
        <div style={s.row}><span style={s.label}>状态</span><span style={s.val}>{order.status}</span></div>
        <div style={s.row}><span style={s.label}>客户</span><span style={s.val}>{order.company || '-'}</span></div>
        <div style={s.row}><span style={s.label}>交期</span><span style={s.val}>{order.plannedEndDate || '-'}</span></div>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>生产进度</h2>
        <div style={s.progressWrap}>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${order.productionProgress || 0}%` }} />
          </div>
          <span style={s.progressText}>{order.productionProgress || 0}%</span>
        </div>
      </div>

      {data.purchases && data.purchases.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>关联采购 ({data.purchases.length})</h2>
          {data.purchases.map((p) => (
            <div key={p.id} style={s.subItem} onClick={() => navigate(`/crm-client/purchases/${p.id}`)}>
              <div style={s.subHeader}>
                <span style={s.subTitle}>{p.materialName || p.purchaseNo}</span>
                <span style={s.subStatus}>{p.status}</span>
              </div>
              <div style={s.subInfo}>{p.orderNo} · {p.purchaseQuantity || 0} {p.materialType || ''}</div>
            </div>
          ))}
        </div>
      )}

      {data.receivables && data.receivables.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>关联应收 ({data.receivables.length})</h2>
          {data.receivables.map((r) => (
            <div key={r.id} style={s.subItem} onClick={() => navigate(`/crm-client/receivables/${r.id}`)}>
              <div style={s.subHeader}>
                <span style={s.subTitle}>{r.receivableNo}</span>
                <span style={s.subStatus}>{r.status}</span>
              </div>
              <div style={s.subInfo}>¥{r.amount?.toLocaleString() || 0} · 已收 ¥{r.receivedAmount?.toLocaleString() || 0}</div>
            </div>
          ))}
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
  progressWrap: { display: 'flex', alignItems: 'center', gap: '10px' },
  progressBar: { flex: 1, height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' },
  progressFill: { height: '100%', background: 'linear-gradient(90deg, #667eea, #764ba2)', borderRadius: '4px', transition: 'width 0.3s' },
  progressText: { fontSize: '14px', fontWeight: '600', color: '#667eea', minWidth: '40px' },
  subItem: { padding: '10px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' },
  subHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' },
  subTitle: { fontSize: '14px', fontWeight: '500', color: '#333' },
  subStatus: { fontSize: '11px', padding: '2px 6px', borderRadius: '8px', background: '#e2e3e5' },
  subInfo: { fontSize: '12px', color: '#888' },
};

export default CrmOrderDetail;
