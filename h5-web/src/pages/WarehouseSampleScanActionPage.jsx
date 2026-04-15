import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';

export default function WarehouseSampleScanActionPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [sampleCode, setSampleCode] = useState(searchParams.get('code') || '');
  const [sample, setSample] = useState(null);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    if (!sampleCode.trim()) { toast.info('请输入样衣编码'); return; }
    setLoading(true);
    try {
      const res = await api.styleWarehouse.sampleScanQuery({ qrCode: sampleCode.trim() });
      const data = res?.data || res;
      setSample(data);
      setAction('');
    } catch (e) {
      toast.error('查询失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (actionType) => {
    if (!sample) return;
    setLoading(true);
    try {
      const payload = { sampleId: sample.id || sample.sampleId, qrCode: sampleCode };
      let res;
      if (actionType === 'inbound') res = await api.styleWarehouse.sampleInbound(payload);
      else if (actionType === 'loan') res = await api.styleWarehouse.sampleLoan(payload);
      else if (actionType === 'return') res = await api.styleWarehouse.sampleReturn(payload);
      toast.success('操作成功');
      handleQuery();
    } catch (e) {
      toast.error(e.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 16, paddingBottom: 'calc(80px + var(--safe-area-bottom, 0px))' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="text-input" placeholder="输入或扫码获取样衣编码" value={sampleCode}
          onChange={(e) => setSampleCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
          style={{ flex: 1 }} />
        <button className="primary-button" onClick={handleQuery} disabled={loading} style={{ padding: '10px 16px' }}>查询</button>
      </div>

      {sample && (
        <div style={{ background: 'var(--color-bg-card)', borderRadius: 16, padding: 16, border: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 8 }}>{sample.styleName || sample.styleNo || '样衣详情'}</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>状态: {sample.status || '未知'}</div>
          {sample.color && <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>颜色: {sample.color}</div>}
          {sample.size && <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>尺码: {sample.size}</div>}

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="primary-button" onClick={() => handleAction('inbound')} disabled={loading}
              style={{ flex: 1, padding: '10px' }}>入库</button>
            <button className="secondary-button" onClick={() => handleAction('loan')} disabled={loading}
              style={{ flex: 1, padding: '10px' }}>借调</button>
            <button className="ghost-button" onClick={() => handleAction('return')} disabled={loading}
              style={{ flex: 1, padding: '10px' }}>归还</button>
          </div>
        </div>
      )}
    </div>
  );
}
