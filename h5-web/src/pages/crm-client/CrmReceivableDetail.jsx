import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';

const CrmReceivableDetail = () => {
  const { receivableId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDetail(); }, [receivableId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getReceivableDetail(receivableId);
      setData(res);
    } catch (err) {
      console.error('加载应收详情失败:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={s.loading}>加载中...</div>;
  if (!data?.receivable) return <div style={s.empty}>账款不存在</div>;

  const r = data.receivable;

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button onClick={() => navigate(-1)} style={s.backBtn}>← 返回</button>
        <h1 style={s.title}>{r.receivableNo}</h1>
      </div>

      <div style={s.card}>
        <h2 style={s.cardTitle}>账款信息</h2>
        <div style={s.row}><span style={s.label}>应收金额</span><span style={s.val}>¥{r.amount?.toLocaleString() || 0}</span></div>
        <div style={s.row}><span style={s.label}>已收金额</span><span style={{ ...s.val, color: '#27ae60' }}>¥{r.receivedAmount?.toLocaleString() || 0}</span></div>
        <div style={s.row}><span style={s.label}>未收金额</span><span style={{ ...s.val, color: '#e74c3c' }}>¥{r.outstandingAmount?.toLocaleString() || 0}</span></div>
        <div style={s.row}><span style={s.label}>状态</span><span style={s.val}>{r.status}</span></div>
        <div style={s.row}><span style={s.label}>到期日</span><span style={s.val}>{r.dueDate || '-'}</span></div>
        <div style={s.row}><span style={s.label}>关联订单</span><span style={s.val}>{r.orderNo || '-'}</span></div>
        <div style={s.row}><span style={s.label}>描述</span><span style={s.val}>{r.description || '-'}</span></div>
      </div>

      {data.receiptLogs && data.receiptLogs.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>收款记录</h2>
          {data.receiptLogs.map((log) => (
            <div key={log.id} style={s.logItem}>
              <div style={s.logHeader}>
                <span style={s.logAmount}>¥{log.receivedAmount?.toLocaleString() || 0}</span>
                <span style={s.logTime}>{log.receivedTime || '-'}</span>
              </div>
              {log.remark && <div style={s.logRemark}>{log.remark}</div>}
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
  logItem: { padding: '10px 0', borderBottom: '1px solid #f5f5f5' },
  logHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' },
  logAmount: { fontSize: '15px', fontWeight: '600', color: '#27ae60' },
  logTime: { fontSize: '12px', color: '#888' },
  logRemark: { fontSize: '12px', color: '#666' },
};

export default CrmReceivableDetail;
