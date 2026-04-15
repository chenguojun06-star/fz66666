import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { getUserInfo } from '@/utils/storage';
import { eventBus } from '@/utils/eventBus';

function normalizePositiveInt(value, fallback = 1) {
  const n = parseInt(value, 10);
  return !isFinite(n) || n <= 0 ? fallback : n;
}

function normalizeScanType(progressStage, scanType) {
  const stage = String(progressStage || '').trim();
  if (stage === 'quality' || stage === '质检') return 'quality';
  if (stage === 'warehouse' || stage === '入库') return 'warehousing';
  if (stage === 'cutting' || stage === '裁剪') return 'cutting';
  if (stage === 'procurement' || stage === '采购') return 'procurement';
  if (stage === 'packaging' || stage === '包装') return 'packaging';
  return scanType || 'production';
}

export default function ScanResultPage() {
  const navigate = useNavigate();
  const scanResultData = useGlobalStore(s => s.scanResultData);
  const [detail, setDetail] = useState({});
  const [processOptions, setProcessOptions] = useState([]);
  const [selectedNames, setSelectedNames] = useState([]);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedAmount, setSelectedAmount] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [warehouseCode, setWarehouseCode] = useState('');
  const [warehouseOptions, setWarehouseOptions] = useState([]);
  const [showWarehouse, setShowWarehouse] = useState(false);
  const [isQualityReceive, setIsQualityReceive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!scanResultData) {
      toast.error('数据异常');
      navigate(-1);
      return;
    }
    const raw = scanResultData;
    const orderDetail = raw.orderDetail || {};
    const coverImage = getAuthedImageUrl(orderDetail.coverImage || orderDetail.styleImage || '');
    const isWarehouseStage = raw.progressStage === 'warehouse' || raw.progressStage === '入库';
    const isQuality = raw.progressStage === 'quality' || raw.progressStage === '质检';

    let processOpts = buildProcessOptions(raw);
    if (processOpts.length === 0 && raw.processName) {
      processOpts = [{ label: raw.processName, value: raw.processName, scanType: raw.scanType || 'production', unitPrice: 0, hidePrice: true, checked: true }];
    }
    let selNames = processOpts.filter(o => o.checked).map(o => o.value);
    if (selNames.length === 0 && processOpts.length > 0) { selNames = [processOpts[0].value]; processOpts[0].checked = true; }
    const summary = buildSummary(processOpts, selNames);

    setDetail({
      coverImage, styleNo: raw.styleNo || orderDetail.styleNo || '', orderNo: raw.orderNo || '',
      bundleNo: raw.bundleNo || '', processName: raw.processName || '', progressStage: raw.progressStage || '',
      color: raw.color || '', size: raw.size || '', displayQuantity: raw.quantity || 0,
    });
    setProcessOptions(processOpts);
    setSelectedNames(selNames);
    setSelectedCount(summary.count);
    setSelectedAmount(summary.amount);
    setQuantity(normalizePositiveInt(raw.quantity, 1));
    setShowWarehouse(isWarehouseStage);
    setIsQualityReceive(isQuality);
    setWarehouseCode(raw.warehouseCode || '');

    if (isWarehouseStage) loadWarehouseOptions();
  }, [scanResultData]);

  const buildProcessOptions = (raw) => {
    const stageResult = raw.stageResult || {};
    const allProcesses = stageResult.allBundleProcesses || [];
    const scannedArr = stageResult.scannedProcessNames || [];
    const scannedSet = {};
    scannedArr.forEach(n => { scannedSet[n] = true; });
    return allProcesses.filter(p => {
      const name = p.processName || p.name || '';
      return !scannedSet[name] || name === raw.processName;
    }).map(p => ({
      label: p.processName || p.name || '', value: p.processName || p.name || '',
      scanType: p.scanType || 'production', unitPrice: p.unitPrice || 0, hidePrice: !p.unitPrice,
      checked: (p.processName || p.name || '') === raw.processName,
    }));
  };

  const buildSummary = (options, selNames) => {
    const selected = {}; selNames.forEach(n => { selected[n] = true; });
    let count = 0, amount = 0;
    options.forEach(o => { if (selected[o.value]) { count++; amount += (o.unitPrice || 0); } });
    return { count, amount: Math.round(amount * 100) / 100 };
  };

  const loadWarehouseOptions = async () => {
    try {
      const res = await api.system.getDictList('warehouse_location');
      const records = Array.isArray(res) ? res : (res?.records || []);
      if (records.length > 0) setWarehouseOptions(records.filter(i => i.dictLabel).map(i => i.dictLabel));
    } catch (e) { /* ignore */ }
  };

  const onProcessTap = (value) => {
    let sel = [...selectedNames];
    const idx = sel.indexOf(value);
    if (idx >= 0) { if (sel.length <= 1) return; sel.splice(idx, 1); } else { sel.push(value); }
    const selected = {}; sel.forEach(n => { selected[n] = true; });
    const newOpts = processOptions.map(o => ({ ...o, checked: !!selected[o.value] }));
    const summary = buildSummary(newOpts, sel);
    setSelectedNames(sel);
    setProcessOptions(newOpts);
    setSelectedCount(summary.count);
    setSelectedAmount(summary.amount);
  };

  const submitScanResult = async () => {
    if (loading) return;
    if (!scanResultData || selectedNames.length === 0) { toast.error('请至少选择一个工序'); return; }
    if (quantity <= 0) { toast.error('数量必须大于0'); return; }
    if (showWarehouse && !warehouseCode.trim()) { toast.error('请输入仓库编号'); return; }

    setLoading(true);
    const selected = {}; selectedNames.forEach(n => { selected[n] = true; });
    const selectedOptions = processOptions.filter(o => selected[o.value]);
    let successCount = 0;
    const failedItems = [];

    try {
      for (const option of selectedOptions) {
        let effectiveScanType = option.scanType || 'production';
        if (scanResultData.progressStage === 'quality' || scanResultData.progressStage === '质检') effectiveScanType = 'quality';
        const scanPayload = {
          ...(scanResultData.scanData || {}),
          scanType: normalizeScanType(scanResultData.progressStage, effectiveScanType),
          processName: option.value, quantity,
        };
        if (scanResultData.progressStage === 'quality' || scanResultData.progressStage === '质检') {
          scanPayload.qualityStage = scanPayload.qualityStage || scanResultData.qualityStage || 'receive';
        }
        if (warehouseCode) scanPayload.warehouse = warehouseCode;
        try {
          const result = await api.production.executeScan(scanPayload);
          if (result && (result.recordId || result.id)) successCount++;
        } catch (itemErr) {
          failedItems.push({ processName: option.value, error: itemErr.message || '提交失败' });
        }
      }
      if (successCount > 0) eventBus.emit('DATA_REFRESH');
      if (failedItems.length === 0) {
        if (isQualityReceive) {
          toast.success('已领取质检任务，请录入质检结果');
        } else {
          toast.success('已完成 ' + successCount + ' 个工序扫码');
        }
        navigate(-1);
      } else if (successCount > 0) {
        toast.info('成功 ' + successCount + ' 个，失败：' + failedItems.map(f => f.processName).join('、'));
        navigate(-1);
      } else {
        toast.error(failedItems[0].error || '提交失败');
      }
    } catch (e) {
      toast.error(e.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="scan-result-stack">
      {detail.coverImage && (
        <div style={{ textAlign: 'center' }}>
          <img src={detail.coverImage} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'cover' }} />
        </div>
      )}

      <div className="hero-card compact">
        <div style={{ fontWeight: 600, fontSize: 15 }}>{detail.orderNo}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          款号: {detail.styleNo} · 菲号: {detail.bundleNo}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          颜色: {detail.color} · 码数: {detail.size} · 数量: {detail.displayQuantity}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-primary)', marginTop: 4 }}>
          工序: {detail.processName} · 阶段: {detail.progressStage}
        </div>
      </div>

      <div className="field-block">
        <label>选择工序（已选 {selectedCount} 个，单价合计 ¥{selectedAmount.toFixed(2)}）</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {processOptions.map(opt => (
            <button key={opt.value}
              className={`scan-type-chip${opt.checked ? ' active' : ''}`}
              onClick={() => onProcessTap(opt.value)}
              style={{ padding: '6px 12px', borderRadius: 16, border: '1px solid var(--color-border)',
                background: opt.checked ? 'var(--color-primary)' : 'var(--color-bg-light)',
                color: opt.checked ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
              {opt.label}{!opt.hidePrice && ` ¥${opt.unitPrice}`}
            </button>
          ))}
        </div>
      </div>

      <div className="field-block">
        <label>数量</label>
        <input className="text-input" type="number" value={quantity} min={1}
          onChange={e => setQuantity(parseInt(e.target.value) || 1)} />
      </div>

      {showWarehouse && (
        <div className="field-block">
          <label>仓库编号</label>
          {warehouseOptions.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {warehouseOptions.map(opt => (
                <button key={opt} className={`scan-type-chip${warehouseCode === opt ? ' active' : ''}`}
                  onClick={() => setWarehouseCode(opt)}
                  style={{ padding: '6px 10px', borderRadius: 16, border: '1px solid var(--color-border)',
                    background: warehouseCode === opt ? 'var(--color-primary)' : 'var(--color-bg-light)',
                    color: warehouseCode === opt ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
                  {opt}
                </button>
              ))}
            </div>
          ) : (
            <input className="text-input" value={warehouseCode} onChange={e => setWarehouseCode(e.target.value)} placeholder="输入仓库编号" />
          )}
        </div>
      )}

      <button className="primary-button" onClick={submitScanResult} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '提交中...' : '确认扫码'}
      </button>
    </div>
  );
}
