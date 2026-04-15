import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import wx from '@/adapters/wx';

export default function WarehouseMaterialScanPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rollCode, setRollCode] = useState('');
  const [rollInfo, setRollInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cuttingOrderNo, setCuttingOrderNo] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const rc = searchParams.get('rollCode') ? decodeURIComponent(searchParams.get('rollCode')) : '';
    if (rc) { setRollCode(rc); queryRoll(rc); }
  }, []);

  const onScanTap = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: false }).then(res => {
        const code = String(res.result || '').trim();
        if (/^MR\d{13}$/.test(code)) { setRollCode(code); setRollInfo(null); setErrorMsg(''); setSuccessMsg(''); queryRoll(code); }
        else toast.error('不是料卷二维码');
      }).catch(() => {});
    } else {
      toast.info('请在微信中使用扫码功能');
    }
  };

  const queryRoll = async (code) => {
    setLoading(true); setErrorMsg(''); setSuccessMsg(''); setRollInfo(null);
    try {
      const info = await api.materialRoll.scan({ scanCode: code });
      setRollInfo(info);
    } catch (e) { setErrorMsg(e.message || '查询失败'); } finally { setLoading(false); }
  };

  const onIssueTap = async () => {
    if (submitting || !rollCode || !rollInfo) return;
    if (rollInfo.currentStatus !== 'IN_STOCK') { toast.error('该料卷不在库，无法发料'); return; }
    if (!window.confirm(`确认将「${rollInfo.materialName}」× ${rollInfo.quantity}${rollInfo.unit} 发出？`)) return;
    setSubmitting(true); setErrorMsg(''); setSuccessMsg('');
    try {
      const result = await api.production.executeScan({ scanCode: rollCode, scanType: 'material_roll', action: 'issue', cuttingOrderNo });
      setSuccessMsg(result?.message || '发料成功！');
      setRollInfo({ ...rollInfo, currentStatus: 'ISSUED' });
    } catch (e) { setErrorMsg(e.message || '发料失败'); } finally { setSubmitting(false); }
  };

  const onReturnTap = async () => {
    if (submitting || !rollCode || !rollInfo) return;
    if (rollInfo.currentStatus !== 'ISSUED') { toast.error('该料卷尚未发料，无需退回'); return; }
    if (!window.confirm(`将「${rollInfo.materialName}」退回仓库？`)) return;
    setSubmitting(true); setErrorMsg(''); setSuccessMsg('');
    try {
      const result = await api.production.executeScan({ scanCode: rollCode, scanType: 'material_roll', action: 'return' });
      setSuccessMsg(result?.message || '退回成功！');
      setRollInfo({ ...rollInfo, currentStatus: 'IN_STOCK' });
    } catch (e) { setErrorMsg(e.message || '退回失败'); } finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input className="text-input" value={rollCode} onChange={e => setRollCode(e.target.value)} placeholder="料卷码(MR开头)" style={{ flex: 1 }} />
        <button className="secondary-button" onClick={onScanTap}>📷</button>
        <button className="primary-button" onClick={() => queryRoll(rollCode)} disabled={loading}>查询</button>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 20 }}>查询中...</div>}

      {errorMsg && <div className="hero-card compact" style={{ background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>{errorMsg}</div>}
      {successMsg && <div className="hero-card compact" style={{ background: '#dcfce7', color: '#166534', fontSize: 13 }}>{successMsg}</div>}

      {rollInfo && (
        <div className="hero-card compact">
          <div style={{ fontWeight: 600, fontSize: 15 }}>{rollInfo.materialName || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
            数量: {rollInfo.quantity || 0}{rollInfo.unit || ''} · 仓位: {rollInfo.warehouseLocation || '-'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
            状态: <span style={{ color: rollInfo.currentStatus === 'IN_STOCK' ? '#16a34a' : '#d97706' }}>
              {rollInfo.currentStatus === 'IN_STOCK' ? '在库' : '已发料'}
            </span>
          </div>
          <div className="field-block" style={{ marginTop: 8 }}>
            <label>关联裁剪单号（选填）</label>
            <input className="text-input" value={cuttingOrderNo} onChange={e => setCuttingOrderNo(e.target.value)} placeholder="输入裁剪单号" />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {rollInfo.currentStatus === 'IN_STOCK' && (
              <button className="primary-button" style={{ flex: 1 }} onClick={onIssueTap} disabled={submitting}>发料</button>
            )}
            {rollInfo.currentStatus === 'ISSUED' && (
              <button className="secondary-button" style={{ flex: 1 }} onClick={onReturnTap} disabled={submitting}>退回</button>
            )}
          </div>
        </div>
      )}

      <button className="ghost-button" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>返回</button>
    </div>
  );
}
