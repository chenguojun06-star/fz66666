import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';

export default function WarehouseSampleScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [styleNo, setStyleNo] = useState('');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [stockInfo, setStockInfo] = useState(null);
  const [actions, setActions] = useState([]);

  useEffect(() => {
    const sn = decodeURIComponent(searchParams.get('styleNo') || '');
    const c = decodeURIComponent(searchParams.get('color') || '');
    const s = decodeURIComponent(searchParams.get('size') || '');
    if (!sn || !c || !s) { setErrorMsg('缺少必要参数（款号/颜色/尺码）'); return; }
    setStyleNo(sn); setColor(c); setSize(s);
    querySample(sn, c, s);
  }, []);

  const querySample = async (sn, c, s) => {
    setLoading(true); setErrorMsg(''); setSuccessMsg(''); setStockInfo(null); setActions([]);
    try {
      const res = await api.sampleStock.scanQuery({ styleNo: sn, color: c, size: s });
      const d = res?.data || res || {};
      setStockInfo(d);
      setActions(d.actions || []);
    } catch (err) { setErrorMsg('网络异常，请重试'); } finally { setLoading(false); }
  };

  const doAction = async (actionName, apiFn) => {
    setSubmitting(true); setErrorMsg(''); setSuccessMsg('');
    const labelMap = { inbound: '入库', loan: '借调', return: '归还' };
    try {
      const res = await apiFn();
      const label = labelMap[actionName] || actionName;
      setSuccessMsg(`${label}成功`);
      toast.success(`${label}成功`);
      setTimeout(() => querySample(styleNo, color, size), 800);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '操作失败';
      setErrorMsg(msg);
      toast.error(msg);
    } finally { setSubmitting(false); }
  };

  const onInbound = () => {
    if (submitting) return;
    if (!window.confirm(`将 ${styleNo} ${color} ${size} 入库，确认？`)) return;
    doAction('inbound', () => api.sampleStock.inbound({ styleNo, color, size, quantity: 1 }));
  };

  const onLoan = () => {
    if (submitting) return;
    const user = useAuthStore.getState().user || {};
    if (!window.confirm(`借调 ${styleNo} ${color} ${size}，确认？`)) return;
    doAction('loan', () => api.sampleStock.loan({
      styleNo, color, size,
      borrower: user.name || user.username || '', borrowerId: String(user.id || ''), quantity: 1,
    }));
  };

  const onReturn = () => {
    if (submitting) return;
    const loans = stockInfo?.activeLoans || [];
    if (!loans.length) { toast.error('无借调记录'); return; }
    if (!window.confirm(`归还 ${styleNo} ${color} ${size}，确认？`)) return;
    doAction('return', () => api.sampleStock.returnSample({
      loanId: loans[0].id, quantity: loans[0].quantity || 1,
    }));
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="hero-card compact">
        <div style={{ fontWeight: 600, fontSize: 15 }}>{styleNo}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          颜色: {color} · 尺码: {size}
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20 }}>查询中...</div>}
      {errorMsg && <div className="hero-card compact" style={{ background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>{errorMsg}</div>}
      {successMsg && <div className="hero-card compact" style={{ background: '#dcfce7', color: '#166534', fontSize: 13 }}>{successMsg}</div>}

      {stockInfo && (
        <div className="hero-card compact">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>库存状态</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            在库: {stockInfo.stock?.quantity || 0}件
          </div>
          {stockInfo.activeLoans?.length > 0 && (
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
              借出: {stockInfo.activeLoans.length}条记录
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {actions.includes('inbound') && (
          <button className="primary-button" style={{ flex: 1 }} onClick={onInbound} disabled={submitting}>入库</button>
        )}
        {actions.includes('loan') && (
          <button className="secondary-button" style={{ flex: 1 }} onClick={onLoan} disabled={submitting}>借调</button>
        )}
        {actions.includes('return') && (
          <button className="secondary-button" style={{ flex: 1 }} onClick={onReturn} disabled={submitting}>归还</button>
        )}
      </div>

      <button className="ghost-button" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>返回</button>
    </div>
  );
}
