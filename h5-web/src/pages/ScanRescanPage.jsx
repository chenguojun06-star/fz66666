import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { eventBus } from '@/utils/eventBus';

export default function ScanRescanPage() {
  const navigate = useNavigate();
  const rescanData = useGlobalStore(s => s.rescanData);
  const [detail, setDetail] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!rescanData) { toast.error('数据异常'); navigate(-1); return; }
    setDetail({
      recordId: rescanData.recordId || '', orderNo: rescanData.orderNo || '-',
      bundleNo: rescanData.bundleNo || '-', quantity: rescanData.quantity || 0,
      scanTime: rescanData.scanTime || '-', coverImage: getAuthedImageUrl(rescanData.coverImage || ''),
      styleNo: rescanData.styleNo || '', styleName: rescanData.styleName || '',
      processName: rescanData.processName || '', progressStage: rescanData.progressStage || '',
    });
  }, [rescanData]);

  const confirmRescan = async () => {
    if (loading || !detail.recordId) return;
    setLoading(true);
    try {
      await api.production.rescan({ recordId: detail.recordId });
      toast.success('退回成功，可重新扫码');
      eventBus.emit('DATA_REFRESH');
      navigate(-1);
    } catch (e) {
      toast.error(e.message || '退回失败，请稍后重试');
    } finally { setLoading(false); }
  };

  return (
    <div className="scan-rescan-stack">
      {detail.coverImage && (
        <div style={{ textAlign: 'center' }}>
          <img src={detail.coverImage} alt="" className="card-item-cover" style={{ maxHeight: 160 }} />
        </div>
      )}

      <div className="card-item">
        <div className="card-item-title">退回重扫</div>
        <div className="info-row" style={{ marginTop: 8 }}>
          <span className="info-label">订单:</span>
          <span className="info-value">{detail.orderNo}</span>
        </div>
        <div className="info-row">
          <span className="info-label">菲号:</span>
          <span className="info-value">{detail.bundleNo}</span>
          <span className="info-label">数量:</span>
          <span className="info-value">{detail.quantity}</span>
        </div>
        <div className="info-row">
          <span className="info-label">工序:</span>
          <span className="info-value">{detail.processName}</span>
          <span className="info-label">阶段:</span>
          <span className="info-value">{detail.progressStage}</span>
        </div>
        <div className="info-row">
          <span className="info-label">扫码时间:</span>
          <span className="info-value">{detail.scanTime}</span>
        </div>
      </div>

      <div className="alert-card alert-card-warning">
        ⚠️ 仅允许退回1小时内的扫码记录，退回后可重新扫码。
      </div>

      <button className="danger-button" onClick={confirmRescan} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '处理中...' : '确认退回'}
      </button>
    </div>
  );
}
