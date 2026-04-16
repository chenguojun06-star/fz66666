import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { eventBus } from '@/utils/eventBus';

function normalizePositiveInt(value, fallback = 1) {
  const n = parseInt(value, 10);
  return !isFinite(n) || n <= 0 ? fallback : n;
}

const HTTP_ERROR_MAP = {
  401: '登录已过期，请重新登录',
  403: '无权限执行此操作',
  404: '未找到对应订单数据',
  409: '重复操作，请勿重复提交',
  500: '服务器异常，请稍后重试',
};

const PROCESS_TYPE_MAP = {
  embroidery: '绣花', printing: '印花', washing: '洗水',
  dyeing: '染色', ironing: '整烫', pleating: '压褶',
  beading: '钉珠', other: '其他'
};

const STATUS_MAP = {
  pending: '待处理', processing: '进行中',
  completed: '已完成', cancelled: '已取消'
};

const MATERIAL_TYPE_MAP = {
  fabricA: '主面料', fabricB: '辅面料',
  liningA: '里料', liningB: '夹里', liningC: '衬布/粘合衬',
  accessoryA: '拉链', accessoryB: '纽扣', accessoryC: '配件'
};

import { normalizeScanType } from '@/utils/scanHelpers';

export default function ScanResultPage() {
  const navigate = useNavigate();
  const scanResultData = useGlobalStore(s => s.scanResultData);
  const clearScanResultData = useGlobalStore(s => s.clearScanResultData);
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
  const [aiTipData, setAiTipData] = useState(null);
  const [aiTipVisible, setAiTipVisible] = useState(false);
  const [description, setDescription] = useState('');
  const [secondaryProcesses, setSecondaryProcesses] = useState([]);
  const [materialPurchases, setMaterialPurchases] = useState([]);
  const [materialSummary, setMaterialSummary] = useState({ totalDemand: 0, totalArrived: 0, totalPending: 0 });

  const splitTipPoints = (text) => {
    if (!text) return [];
    return text.split(/\n|。/)
      .map(s => s.replace(/^[·•\-\s]+/, '').trim())
      .filter(Boolean);
  };

  useEffect(() => {
    return () => { clearScanResultData(); };
  }, [clearScanResultData]);

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
      bundleStatusHints: raw.bundleStatusHints || [],
      bundleStatusText: raw.bundleStatusText || '',
    });
    setProcessOptions(processOpts);
    setSelectedNames(selNames);
    setSelectedCount(summary.count);
    setSelectedAmount(summary.amount);
    setQuantity(normalizePositiveInt(raw.quantity, 1));
    setShowWarehouse(isWarehouseStage);
    setIsQualityReceive(isQuality);
    setWarehouseCode(raw.warehouseCode || '');

    setDescription(orderDetail.description || raw.description || '');

    const rawProcesses = orderDetail.secondaryProcesses || raw.secondaryProcesses || [];
    setSecondaryProcesses(rawProcesses.map(item => ({
      ...item,
      processTypeCN: PROCESS_TYPE_MAP[item.processType] || item.processType || '',
      statusCN: STATUS_MAP[item.status] || item.status || ''
    })));

    const isProcurement = raw.progressStage === 'procurement' || raw.progressStage === '采购';
    const rawMaterials = isProcurement ? (raw.materialPurchases || []) : [];
    let totalDemand = 0, totalArrived = 0, totalPending = 0;
    const mappedMaterials = rawMaterials.map(item => {
      totalDemand += Number(item.purchaseQuantity) || 0;
      totalArrived += Number(item.arrivedQuantity) || 0;
      totalPending += Number(item.pendingQuantity) || 0;
      return { ...item, materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '' };
    });
    setMaterialPurchases(mappedMaterials);
    setMaterialSummary({ totalDemand, totalArrived, totalPending });

    if (isWarehouseStage) loadWarehouseOptions();

    if (raw.orderNo) {
      fetchAiTip(raw.orderNo, raw.processName || raw.progressStage || '');
    }
  }, [scanResultData]);

  const fetchAiTip = async (orderNo, processName) => {
    try {
      const res = await api.intelligence.getScanTips({ orderNo, processName });
      if (res && res.aiTip) {
        setAiTipData(res);
        setAiTipVisible(true);
      }
    } catch (err) {
      console.warn('[ScanResultPage] AI提示获取失败:', err);
    }
  };

  const dismissAiTip = () => {
    setAiTipVisible(false);
  };

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

  const isHigh = aiTipData?.priority === 'high';

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
        {detail.bundleStatusHints && detail.bundleStatusHints.length > 0 && (
          <div style={{
            marginTop: 8, padding: '8px 10px', borderRadius: 8,
            background: 'rgba(16,185,129,0.08)', borderLeft: '3px solid #10b981',
          }}>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginBottom: 4, fontWeight: 600 }}>
              📋 菲号工序进度
            </div>
            {detail.bundleStatusHints.map((hint, i) => (
              <div key={i} style={{ fontSize: 12, color: '#374151', lineHeight: '20px' }}>{hint}</div>
            ))}
          </div>
        )}
      </div>

      {aiTipVisible && aiTipData && aiTipData.aiTip && (
        <div className={`ai-bubble${isHigh ? ' ai-bubble-high' : ' ai-bubble-normal'}`}>
          <div className="ai-bubble-header">
            <span className="ai-bubble-icon">{isHigh ? '🔴' : '💡'}</span>
            {aiTipData.stage && <span className={`ai-bubble-stage${isHigh ? ' high' : ''}`}>{aiTipData.stage}</span>}
            <span className="ai-bubble-close" onClick={dismissAiTip}>✕</span>
          </div>
          <div className="ai-bubble-points">
            {splitTipPoints(aiTipData.aiTip).map((pt, i) => (
              <div key={i} className="ai-bubble-point">· {pt}</div>
            ))}
          </div>
          {aiTipData.keywords && aiTipData.keywords.length > 0 && (
            <div className="ai-bubble-tags">
              {aiTipData.keywords.map((kw, i) => (
                <span key={i} className={`ai-bubble-tag${isHigh ? ' high' : ''}`}>{kw}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {description && (
        <div className="section-card">
          <div className="section-title">生产工艺要点</div>
          <div className="craft-points">
            {splitTipPoints(description).map((pt, i) => (
              <div key={i} className="craft-point">· {pt}</div>
            ))}
          </div>
        </div>
      )}

      {secondaryProcesses.length > 0 && (
        <div className="section-card process-highlight-card">
          <div className="section-title process-highlight-title">二次工艺（{secondaryProcesses.length}）</div>
          <div className="process-list">
            {secondaryProcesses.map((item, idx) => (
              <div key={item.id || idx} className="process-item">
                <div className="process-item-row">
                  {item.processTypeCN && <span className="process-type-tag">{item.processTypeCN}</span>}
                  <span className="process-name">{item.processName || item.processTypeCN || '-'}</span>
                  <span className={`process-status${item.status === 'completed' ? ' status-done' : ' status-active'}`}>{item.statusCN}</span>
                </div>
                {item.description && <div className="process-item-desc">· {item.description}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {materialPurchases.length > 0 && (
        <div className="section-card">
          <div className="section-title">面辅料（{materialPurchases.length}项）</div>
          <div className="material-list">
            {materialPurchases.map((item, idx) => (
              <div key={item.id || idx} className="material-item">
                <div className="mat-row">
                  {item.materialTypeCN && <span className="mat-tag">{item.materialTypeCN}</span>}
                  <span className="mat-name">{item.materialCode || item.specifications || '-'}</span>
                </div>
                <div className="mat-row">
                  {item.fabricComposition && <span className="mat-text">成分 {item.fabricComposition}</span>}
                  {item.fabricWeight && <span className="mat-text">克重 {item.fabricWeight}</span>}
                  {item.fabricWidth && <span className="mat-text">幅宽 {item.fabricWidth}</span>}
                </div>
                <div className="mat-row mat-row-qty">
                  <span className="mat-text">需求 {item.purchaseQuantity || 0}</span>
                  <span className="mat-text arrived">已到 {item.arrivedQuantity || 0}</span>
                  <span className="mat-text pending">待到 {item.pendingQuantity || 0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field-block">
        <label>选择工序（可多选，已选 {selectedCount} 个，单价合计 ¥{selectedAmount.toFixed(2)}）</label>
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
          <label>目标仓库</label>
          {warehouseOptions.length > 0 ? (
            <div>
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
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <input className="text-input" value={warehouseCode} onChange={e => setWarehouseCode(e.target.value)} placeholder="或手动输入仓库编号" style={{ flex: 1 }} />
                {warehouseCode && <button className="ghost-button" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setWarehouseCode('')}>清除</button>}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="text-input" value={warehouseCode} onChange={e => setWarehouseCode(e.target.value)} placeholder="请输入仓库编号" style={{ flex: 1 }} />
              {warehouseCode && <button className="ghost-button" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => setWarehouseCode('')}>清除</button>}
            </div>
          )}
        </div>
      )}

      <button className="primary-button" onClick={submitScanResult} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '提交中...' : '确认扫码'}
      </button>
    </div>
  );
}
