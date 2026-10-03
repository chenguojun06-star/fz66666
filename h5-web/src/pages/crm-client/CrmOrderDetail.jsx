import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import { orderStatusText } from './CrmOrders';
import { purchaseStatusText } from './CrmPurchases';
import { receivableStatusText } from './CrmReceivables';

/** 时间格式化：兼容 ISO 字符串与 Jackson 数组两种序列化形态（避免渲染成 "2026,10,3"） */
const fmtTime = (v) => {
  if (!v) return '-';
  if (Array.isArray(v)) {
    const [y, mo, d, h = 0, mi = 0] = v;
    const p = (n) => String(n).padStart(2, '0');
    return `${y}-${p(mo)}-${p(d)} ${p(h)}:${p(mi)}`;
  }
  return String(v).replace('T', ' ').slice(0, 16);
};

/** 工序状态文案（与后端 status 取值对齐：not_started / in_progress / completed） */
const stageStatusText = (st) => {
  if (st === 'completed') return '已完成';
  if (st === 'in_progress') return '进行中';
  if (st === 'not_started') return '未开始';
  return st || '-';
};

const stageBadgeStyle = (st) => {
  if (st === 'completed') return { background: 'rgba(39,174,96,0.12)', color: '#27ae60' };
  if (st === 'in_progress') return { background: 'rgba(52,152,219,0.12)', color: '#3498db' };
  return { background: '#e2e3e5', color: '#888' };
};

const CrmOrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

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

  /** 复制物流单号（客户最常用的动作：发给收货人/查快递） */
  const copyText = async (txt) => {
    if (!txt) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(txt);
      } else {
        const ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(txt);
      setTimeout(() => setCopied(''), 1500);
    } catch (e) {
      /* 复制失败不打断浏览 */
    }
  };

  if (loading) return <div style={s.loading}>加载中...</div>;
  if (!data?.order) return <div style={s.empty}>订单不存在</div>;

  const order = data.order;
  const shipments = data.shipments || [];
  const stages = data.stages || [];
  const orderQty = order.orderQuantity || 0;
  const shippedQty = data.shippedQuantity || 0;
  const remainQty = Math.max(0, orderQty - shippedQty);

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
        <div style={s.row}><span style={s.label}>状态</span><span style={s.val}>{orderStatusText(order.status)}</span></div>
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

      <div style={s.card}>
        <h2 style={s.cardTitle}>发货进度</h2>
        <div style={s.statRow}>
          <div style={s.statItem}>
            <span style={s.statNum}>{shippedQty}</span>
            <span style={s.statLabel}>已发货</span>
          </div>
          <div style={s.statItem}>
            <span style={{ ...s.statNum, color: remainQty > 0 ? '#e67e22' : '#27ae60' }}>{remainQty}</span>
            <span style={s.statLabel}>未发货</span>
          </div>
          <div style={s.statItem}>
            <span style={{ ...s.statNum, color: '#667eea' }}>{orderQty}</span>
            <span style={s.statLabel}>订单量</span>
          </div>
        </div>

        {shipments.length === 0 ? (
          <div style={s.hint}>暂无发货记录</div>
        ) : (
          shipments.map((sh) => (
            <div key={sh.id} style={s.shipItem}>
              <div style={s.shipHead}>
                <span style={s.shipNo}>{sh.outstockNo || '-'}</span>
                <span style={{ ...s.badge, ...(sh.receiveTime ? s.badgeDone : s.badgeOnWay) }}>
                  {sh.receiveTime ? '已收货' : '已发出'}
                </span>
              </div>
              <div style={s.shipRow}><span style={s.shipLabel}>发货数量</span><span style={s.shipVal}>{sh.quantity || 0} 件</span></div>
              {sh.expressCompany && (
                <div style={s.shipRow}><span style={s.shipLabel}>快递公司</span><span style={s.shipVal}>{sh.expressCompany}</span></div>
              )}
              {sh.trackingNo && (
                <div style={s.shipRow}>
                  <span style={s.shipLabel}>物流单号</span>
                  <span style={s.shipVal}>
                    <span style={s.trackingNo}>{sh.trackingNo}</span>
                    <button onClick={() => copyText(sh.trackingNo)} style={s.copyBtn}>
                      {copied === sh.trackingNo ? '已复制' : '复制'}
                    </button>
                  </span>
                </div>
              )}
              <div style={s.shipRow}><span style={s.shipLabel}>发货时间</span><span style={s.shipVal}>{fmtTime(sh.shipTime)}</span></div>
              {sh.receiveTime && (
                <div style={s.shipRow}><span style={s.shipLabel}>收货时间</span><span style={s.shipVal}>{fmtTime(sh.receiveTime)}</span></div>
              )}
              {sh.shippingAddress && (
                <div style={s.shipRow}><span style={s.shipLabel}>收货地址</span><span style={{ ...s.shipVal, maxWidth: '62%', textAlign: 'right' }}>{sh.shippingAddress}</span></div>
              )}
            </div>
          ))
        )}
      </div>

      {stages.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>工序进度</h2>
          {stages.map((st, idx) => {
            const qty = st.totalQuantity || 0;
            const pct = orderQty > 0 ? Math.min(100, Math.round((qty / orderQty) * 100)) : 0;
            return (
              <div key={st.processName || idx} style={s.stageItem}>
                <div style={s.stageHead}>
                  <span style={s.stageName}>{st.processName || '-'}</span>
                  <span style={{ ...s.badge, ...stageBadgeStyle(st.status) }}>{stageStatusText(st.status)}</span>
                </div>
                <div style={s.stageBarWrap}>
                  <div style={{ ...s.stageBarFill, width: `${pct}%` }} />
                </div>
                <div style={s.stageInfo}>
                  {qty} / {orderQty} 件 · {pct}%
                  {st.lastTime ? ` · 最后更新 ${fmtTime(st.lastTime)}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.purchases && data.purchases.length > 0 && (
        <div style={s.card}>
          <h2 style={s.cardTitle}>关联采购 ({data.purchases.length})</h2>
          {data.purchases.map((p) => (
            <div key={p.id} style={s.subItem} onClick={() => navigate(`/crm-client/purchases/${p.id}`)}>
              <div style={s.subHeader}>
                <span style={s.subTitle}>{p.materialName || p.purchaseNo}</span>
                <span style={s.subStatus}>{purchaseStatusText(p.status)}</span>
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
                <span style={s.subStatus}>{receivableStatusText(r.status)}</span>
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
  badge: { fontSize: '11px', padding: '2px 8px', borderRadius: '10px', fontWeight: '600' },
  badgeDone: { background: 'rgba(39,174,96,0.12)', color: '#27ae60' },
  badgeOnWay: { background: 'rgba(230,126,34,0.12)', color: '#e67e22' },
  hint: { fontSize: '13px', color: '#aaa', padding: '8px 0' },
  statRow: { display: 'flex', justifyContent: 'space-around', padding: '4px 0 12px' },
  statItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' },
  statNum: { fontSize: '22px', fontWeight: '700', color: '#1a1a2e' },
  statLabel: { fontSize: '12px', color: '#888' },
  shipItem: { padding: '10px 0', borderTop: '1px solid #f5f5f5' },
  shipHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  shipNo: { fontSize: '14px', fontWeight: '600', color: '#333' },
  shipRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '3px 0' },
  shipLabel: { color: '#888' },
  shipVal: { color: '#333', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px' },
  trackingNo: { fontFamily: 'monospace', letterSpacing: '0.3px' },
  copyBtn: {
    fontSize: '11px', padding: '2px 8px', borderRadius: '8px', border: '1px solid #667eea',
    background: '#fff', color: '#667eea', cursor: 'pointer',
  },
  stageItem: { padding: '8px 0', borderTop: '1px solid #f5f5f5' },
  stageHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' },
  stageName: { fontSize: '14px', fontWeight: '500', color: '#333' },
  stageBarWrap: { height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' },
  stageBarFill: { height: '100%', background: '#667eea', borderRadius: '3px', transition: 'width 0.3s' },
  stageInfo: { fontSize: '12px', color: '#888', marginTop: '4px' },
  subItem: { padding: '10px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' },
  subHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' },
  subTitle: { fontSize: '14px', fontWeight: '500', color: '#333' },
  subStatus: { fontSize: '11px', padding: '2px 6px', borderRadius: '8px', background: '#e2e3e5' },
  subInfo: { fontSize: '12px', color: '#888' },
};

export default CrmOrderDetail;
