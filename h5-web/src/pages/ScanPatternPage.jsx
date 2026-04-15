import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { eventBus } from '@/utils/eventBus';

const OPERATION_LABELS = {
  RECEIVE: '领取样板', COMPLETE: '完成', REVIEW: '审核',
  WAREHOUSE_IN: '入库', WAREHOUSE_OUT: '出库', WAREHOUSE_RETURN: '归还',
  PROCUREMENT: '采购', CUTTING: '裁剪', SECONDARY: '二次工艺',
  SEWING: '车缝', TAIL: '尾部', PLATE: '车板扫码', FOLLOW_UP: '跟单确认',
};

const WAREHOUSE_OPERATIONS = new Set(['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN']);

function normalizePositiveInt(value, fallback = 1) {
  const n = parseInt(value, 10);
  return !isFinite(n) || n <= 0 ? fallback : n;
}

export default function ScanPatternPage() {
  const navigate = useNavigate();
  const patternScanData = useGlobalStore(s => s.patternScanData);
  const [detail, setDetail] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!patternScanData) { toast.error('缺少样板数据'); navigate(-1); return; }
    const data = patternScanData;
    const patternDetail = data.patternDetail || {};
    const operationType = String(data.operationType || '').toUpperCase() || 'RECEIVE';
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';
    const requiresWarehouseInput = WAREHOUSE_OPERATIONS.has(operationType);
    const sizes = patternDetail.sizes || [];

    setDetail({
      patternId: data.patternId, styleNo: data.styleNo, color: data.color,
      quantity: normalizePositiveInt(data.quantity, 1), warehouseCode: '',
      operationType, operationLabel: OPERATION_LABELS[operationType] || '操作',
      requiresWarehouseInput, reviewApproved,
      coverImage: getAuthedImageUrl(patternDetail.coverImage || patternDetail.styleImage || ''),
      styleName: patternDetail.styleName || data.styleName || '',
      designer: data.designer || patternDetail.designer || '-',
      sizesText: sizes.length ? sizes.join('/') : '-',
      remark: '',
    });
  }, [patternScanData]);

  const submitOp = async () => {
    if (loading) return;
    const d = detail;
    if (!d.operationType) { toast.error('请选择操作工序'); return; }
    const operationType = String(d.operationType).toUpperCase();
    const qty = normalizePositiveInt(d.quantity, 0);
    const remarkStr = String(d.remark || '').trim();

    if (operationType !== 'REVIEW' && qty <= 0) { toast.error('请输入正确数量'); return; }
    if ((operationType === 'REVIEW' || (operationType === 'WAREHOUSE_IN' && d.requiresReviewBeforeInbound)) && !remarkStr) {
      toast.error('请填写备注'); return;
    }
    if (WAREHOUSE_OPERATIONS.has(operationType) && !String(d.warehouseCode || '').trim()) {
      toast.error('仓库操作请填写仓位编号'); return;
    }

    setLoading(true);
    try {
      let result;
      if (operationType === 'REVIEW') {
        const res = await api.production.reviewPattern(d.patternId, 'APPROVED', remarkStr);
        result = res ? { success: true, message: '样衣审核通过' } : { success: false, message: '审核提交失败' };
      } else if (operationType === 'WAREHOUSE_IN') {
        const latestDetail = await api.production.getPatternDetail(d.patternId);
        const reviewApproved = latestDetail?.reviewStatus === 'APPROVED' || latestDetail?.reviewResult === 'APPROVED';
        if (!reviewApproved) await api.production.reviewPattern(d.patternId, 'APPROVED', remarkStr);
        const wiRes = await api.production.warehouseIn(d.patternId, d.warehouseCode || '', remarkStr);
        result = wiRes ? { success: true, message: '样衣入库成功' } : { success: false, message: '入库失败' };
      } else if (operationType === 'RECEIVE') {
        const rcvRes = await api.production.receivePattern(d.patternId, remarkStr);
        result = rcvRes ? { success: true, message: '领取成功' } : { success: false, message: '领取样板失败' };
      } else {
        result = await api.production.submitPatternScan({
          patternId: d.patternId, operationType, operatorRole: 'PLATE_WORKER',
          quantity: qty, warehouseCode: d.warehouseCode, remark: remarkStr,
        });
      }
      if (result && result.success) {
        toast.success(result.message || '操作成功');
        eventBus.emit('DATA_REFRESH');
        navigate(-1);
      } else {
        toast.error(result?.message || '操作失败');
      }
    } catch (e) {
      toast.error(e.message || '提交失败');
    } finally { setLoading(false); }
  };

  return (
    <div className="scan-pattern-stack">
      {detail.coverImage && (
        <div style={{ textAlign: 'center' }}>
          <img src={detail.coverImage} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'cover' }} />
        </div>
      )}

      <div className="hero-card compact">
        <div style={{ fontWeight: 600, fontSize: 15 }}>{detail.styleName || detail.styleNo || '-'}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          款号: {detail.styleNo} · 颜色: {detail.color} · 尺码: {detail.sizesText}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          设计师: {detail.designer} · 数量: {detail.quantity}
        </div>
        <div style={{ fontSize: 13, color: 'var(--color-primary)', marginTop: 4, fontWeight: 600 }}>
          当前操作: {detail.operationLabel}
        </div>
      </div>

      <div className="field-block">
        <label>数量</label>
        <input className="text-input" type="number" value={detail.quantity} min={1}
          onChange={e => setDetail({ ...detail, quantity: parseInt(e.target.value) || 1 })} />
      </div>

      {detail.requiresWarehouseInput && (
        <div className="field-block">
          <label>仓位编号</label>
          <input className="text-input" value={detail.warehouseCode || ''}
            onChange={e => setDetail({ ...detail, warehouseCode: e.target.value })} placeholder="输入仓位编号" />
        </div>
      )}

      <div className="field-block">
        <label>备注</label>
        <textarea className="text-input" value={detail.remark || ''}
          onChange={e => setDetail({ ...detail, remark: e.target.value })} rows={2} placeholder="备注信息" />
      </div>

      <button className="primary-button" onClick={submitOp} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '提交中...' : `确认${detail.operationLabel || '操作'}`}
      </button>
    </div>
  );
}
