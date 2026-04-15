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
    setSubmitting(true); setErrorMsg(''); setSuccessMsg('');
    try {
      const result = await api.production.executeScan({ scanCode: rollCode, scanType: 'material_roll', action: 'return' });
      setSuccessMsg(result?.message || '退回成功！');
      setRollInfo({ ...rollInfo, currentStatus: 'IN_STOCK' });
    } catch (e) { setErrorMsg(e.message || '退回失败'); } finally { setSubmitting(false); }
  };

  return (
    <div className="sub-page">
      <div className="search-row" style={{ marginBottom: 12 }}>
        <input className="text-input" value={rollCode} onChange={e => setRollCode(e.target.value)} placeholder="扫描箱/卷上的MR开头二维码" />
        <button className="secondary-button" onClick={onScanTap}>📷</button>
        <button className="primary-button" onClick={() => queryRoll(rollCode)} disabled={loading}>查询</button>
      </div>

      {loading && <div className="loading-state">查询中...</div>}

      {errorMsg && <div className="alert-card alert-card-danger">{errorMsg}</div>}
      {successMsg && <div className="alert-card alert-card-success">{successMsg}</div>}

      {!loading && !rollInfo && !errorMsg && (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <div className="empty-state-title">请输入料卷码</div>
          <div className="empty-state-desc">输入或扫码料卷码查询库存信息</div>
        </div>
      )}

      {rollInfo && (
        <div className="card-item">
          <div className="card-item-title">{rollInfo.materialName || '-'}</div>
          <div className="info-row">
            <span className="info-label">数量:</span>
            <span className="info-value-bold">{rollInfo.quantity || 0}{rollInfo.unit || ''}</span>
            <span className="info-label">仓位:</span>
            <span className="info-value">{rollInfo.warehouseLocation || '-'}</span>
          </div>
          <div className="info-row">
            <span className="info-label">状态:</span>
            <span className={`status-tag ${rollInfo.currentStatus === 'IN_STOCK' ? 'status-tag-success' : 'status-tag-warning'}`}>
              {rollInfo.currentStatus === 'IN_STOCK' ? '在库' : '已发料'}
            </span>
          </div>
          <div className="field-block" style={{ marginTop: 8 }}>
            <label>关联裁剪单号（选填）</label>
            <input className="text-input" value={cuttingOrderNo} onChange={e => setCuttingOrderNo(e.target.value)} placeholder="输入裁剪单号，如 CO20260219001" />
          </div>
          <div className="sub-page-row-stretch" style={{ marginTop: 8 }}>
            {rollInfo.currentStatus === 'IN_STOCK' && (
              <button className="primary-button" onClick={onIssueTap} disabled={submitting}>{submitting ? '处理中...' : '确认发料出库'}</button>
            )}
            {rollInfo.currentStatus === 'ISSUED' && (
              <button className="secondary-button" onClick={onReturnTap} disabled={submitting}>{submitting ? '处理中...' : '退回入库'}</button>
            )}
          </div>
        </div>
      )}

      <button className="ghost-button" style={{ marginTop: 12 }} onClick={() => navigate(-1)}>返回</button>
    </div>
  );
}
