import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { getUserInfo } from '@/utils/storage';
import { eventBus } from '@/utils/eventBus';

import { normalizeScanType, MATERIAL_TYPE_MAP } from '@/utils/scanHelpers';

export default function ScanConfirmPage() {
  const navigate = useNavigate();
  const confirmScanData = useGlobalStore(s => s.scanResultData);
  const [isProcurement, setIsProcurement] = useState(false);
  const [isCutting, setIsCutting] = useState(false);
  const [detail, setDetail] = useState({});
  const [skuList, setSkuList] = useState([]);
  const [materialPurchases, setMaterialPurchases] = useState([]);
  const [materialSummary, setMaterialSummary] = useState({ totalDemand: 0, totalArrived: 0, totalPending: 0 });
  const [summary, setSummary] = useState({ totalQuantity: 0, totalAmount: 0 });
  const [sizeMatrix, setSizeMatrix] = useState({ sizes: [], rows: [] });
  const [cuttingTask, setCuttingTask] = useState(null);
  const [description, setDescription] = useState('');
  const [secondaryProcesses, setSecondaryProcesses] = useState([]);
  const [buttonText, setButtonText] = useState('确认扫码');
  const [loading, setLoading] = useState(false);
  const submitLockRef = useRef(false);

  useEffect(() => {
    if (!confirmScanData) { toast.error('数据异常'); navigate(-1); return; }
    const raw = confirmScanData;
    const orderDetail = raw.orderDetail || {};
    const isProc = raw.progressStage === '采购' || raw.progressStage === 'procurement';
    const isCut = raw.progressStage === '裁剪';
    setIsProcurement(isProc);
    setIsCutting(isCut);

    const skuItems = raw.skuItems || orderDetail.orderItems || [];
    const formItems = skuItems.map(item => ({
      ...item, inputQuantity: item.cuttingQty || item.totalQuantity || item.quantity || 0,
    }));
    let totalQty = 0;
    formItems.forEach(i => { totalQty += Number(i.inputQuantity) || 0; });

    const coverImage = getAuthedImageUrl(orderDetail.coverImage || orderDetail.styleImage || '');
    setDetail({
      coverImage, styleNo: orderDetail.styleNo || raw.styleNo || '', orderNo: raw.orderNo || '',
      bundleNo: raw.bundleNo || '', processName: raw.processName || '', progressStage: raw.progressStage || '',
      quantity: raw.quantity || 0,
    });
    setSkuList(formItems);
    setSummary({ totalQuantity: totalQty, totalAmount: 0 });

    if (isProc && Array.isArray(raw.materialPurchases)) {
      const mps = raw.materialPurchases.map(item => ({
        ...item, materialTypeCN: MATERIAL_TYPE_MAP[item.materialType] || item.materialType || '',
      }));
      let totalDemand = 0, totalArrived = 0, totalPending = 0;
      mps.forEach(item => {
        totalDemand += Number(item.purchaseQuantity) || 0;
        totalArrived += Number(item.arrivedQuantity) || 0;
        totalPending += Number(item.pendingQuantity) || 0;
      });
      setMaterialPurchases(mps);
      setMaterialSummary({ totalDemand, totalArrived, totalPending });
    }

    if (isCut && raw.cuttingTask) {
      const ct = raw.cuttingTask;
      const statusMap = { pending: '待领取', not_started: '待领取', received: '已领取', in_progress: '已领取', bundled: '已完成', completed: '已完成', done: '已完成' };
      ct.statusText = statusMap[ct.status] || ct.status || '待领取';
      setCuttingTask(ct);
    }

    let btnText = '确认扫码';
    if (isProc) btnText = '一键领取';
    else if (isCut) btnText = cuttingTask && ['completed', 'done'].includes(cuttingTask?.status) ? '裁剪已完成' : (cuttingTask ? '领取任务' : '返回');
    setButtonText(btnText);
    setDescription(orderDetail.description || raw.description || '');

    const PROCESS_TYPE_MAP = { embroidery: '绣花', printing: '印花', washing: '洗水', dyeing: '染色', ironing: '整烫', pleating: '压褶', beading: '钉珠', other: '其他' };
    const STATUS_MAP = { pending: '待处理', processing: '进行中', completed: '已完成', cancelled: '已取消' };
    const rawProcesses = orderDetail.secondaryProcesses || raw.secondaryProcesses || [];
    setSecondaryProcesses(rawProcesses.map(item => ({
      ...item, processTypeCN: PROCESS_TYPE_MAP[item.processType] || item.processType || '',
      statusCN: STATUS_MAP[item.status] || item.status || '',
    })));
  }, [confirmScanData]);

  const confirmScan = async () => {
    if (loading || submitLockRef.current) return;
    submitLockRef.current = true;
    try {
      if (isProcurement) return await _confirmProcurement();
      if (isCutting) return await _confirmCutting();
      return await _confirmNormalScan();
    } finally {
      submitLockRef.current = false;
    }
  };

  const _confirmProcurement = async () => {
    const pendingItems = materialPurchases.filter(item => {
      const status = String(item.status || '').trim().toLowerCase();
      return !status || status === 'pending';
    });
    if (!pendingItems.length) { toast.success('所有物料均已领取'); navigate(-1); return; }
    const userInfo = getUserInfo() || {};
    setLoading(true);
    try {
      await Promise.all(pendingItems.map(item => api.production.receivePurchase({
        purchaseId: item.id || item.purchaseId, receiverId: String(userInfo.id || userInfo.userId || ''),
        receiverName: String(userInfo.name || userInfo.username || ''),
      })));
      toast.success('已领取 ' + pendingItems.length + ' 项物料');
      eventBus.emit('DATA_REFRESH');
      navigate(-1);
    } catch (e) {
      toast.error(e.message || '领取失败');
    } finally { setLoading(false); }
  };

  const _confirmCutting = async () => {
    if (!cuttingTask || !cuttingTask.id) { toast.error('无裁剪任务可领取'); return; }
    const userInfo = getUserInfo() || {};
    setLoading(true);
    try {
      await api.production.receiveCuttingTaskById(cuttingTask.id, String(userInfo.id || userInfo.userId || ''), String(userInfo.name || userInfo.username || ''));
      toast.success('裁剪任务已领取');
      eventBus.emit('DATA_REFRESH');
      navigate(`/cutting/task-detail?orderNo=${encodeURIComponent(detail.orderNo)}&styleNo=${encodeURIComponent(detail.styleNo)}`);
    } catch (e) {
      toast.error(e.message || '领取失败');
    } finally { setLoading(false); }
  };

  const _confirmNormalScan = async () => {
    if (!confirmScanData) { toast.error('数据异常'); return; }
    const hasInput = skuList.some(i => Number(i.inputQuantity) > 0);
    if (!hasInput) { toast.error('请至少输入一个数量'); return; }
    setLoading(true);
    try {
      const requests = skuList.filter(i => Number(i.inputQuantity) > 0).map(item => {
        const payload = {
          orderNo: detail.orderNo, styleNo: detail.styleNo, processName: detail.processName,
          progressStage: detail.progressStage, quantity: Number(item.inputQuantity) || 0,
          scanCode: confirmScanData.scanCode || detail.orderNo || '',
          scanType: normalizeScanType(detail.progressStage, 'production'),
          color: item.color || '', size: item.size || '',
          requestId: `h5_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          source: 'h5',
        };
        return api.production.executeScan(payload);
      });
      const results = await Promise.all(requests);
      toast.success('批量提交成功（' + requests.length + '条）');
      eventBus.emit('DATA_REFRESH');
      navigate(-1);
    } catch (e) {
      toast.error(e.message || '提交失败');
    } finally { setLoading(false); }
  };

  return (
    <div className="scan-confirm-stack">
      {detail.coverImage && (
        <div style={{ textAlign: 'center' }}>
          <img src={detail.coverImage} alt="" style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 8, objectFit: 'cover' }} />
        </div>
      )}

      <div className="hero-card compact">
        <div style={{ fontWeight: 600, fontSize: 15 }}>{detail.orderNo}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          款号: {detail.styleNo} · 阶段: {detail.progressStage}
        </div>
      </div>

      {isProcurement && materialPurchases.length > 0 && (
        <div className="hero-card compact">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>采购物料</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            需求: {materialSummary.totalDemand} · 已到: {materialSummary.totalArrived} · 待到: {materialSummary.totalPending}
          </div>
          {materialPurchases.map((item, idx) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: 12 }}>
              <div>{item.materialTypeCN} · {item.materialName || '-'}</div>
              <div style={{ color: 'var(--color-text-secondary)' }}>
                需求: {item.purchaseQuantity || 0} · 已到: {item.arrivedQuantity || 0}
              </div>
            </div>
          ))}
        </div>
      )}

      {isCutting && cuttingTask && (
        <div className="hero-card compact">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>裁剪任务</div>
          <div style={{ fontSize: 12 }}>状态: <span style={{ color: cuttingTask.status === 'completed' ? '#16a34a' : '#d97706' }}>{cuttingTask.statusText}</span></div>
        </div>
      )}

      {!isProcurement && !isCutting && skuList.length > 0 && (
        <div className="hero-card compact">
          <div style={{ fontWeight: 600, marginBottom: 8 }}>SKU明细</div>
          {skuList.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '1px solid var(--color-border)' }}>
              <span>{item.color || '-'} / {item.size || '-'}</span>
              <input className="text-input" type="number" value={item.inputQuantity} min={0}
                onChange={e => {
                  const newSku = [...skuList]; newSku[idx] = { ...newSku[idx], inputQuantity: parseInt(e.target.value) || 0 };
                  setSkuList(newSku);
                }} style={{ width: 60, textAlign: 'center', padding: '4px' }} />
            </div>
          ))}
        </div>
      )}

      {description && (
        <div className="hero-card compact" style={{ fontSize: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>备注</div>
          <div style={{ color: 'var(--color-text-secondary)' }}>{description}</div>
        </div>
      )}

      <button className="primary-button" onClick={confirmScan} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '提交中...' : buttonText}
      </button>
    </div>
  );
}
