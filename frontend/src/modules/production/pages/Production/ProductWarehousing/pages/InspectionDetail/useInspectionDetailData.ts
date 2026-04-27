import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Form } from 'antd';
import api, { type ApiResult, toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLineWarehousingRow, WarehousingDetailRecord, CuttingBundleRow, OrderLine } from '../../types';
import { qualityAiApi } from '@/services/production/productionApi';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';
import { message } from '@/utils/antdStatic';

export interface QualityBriefingData {
  order: {
    orderNo: string; styleNo: string; styleName: string;
    orderQuantity: number; color: string; size: string;
    factoryName: string; merchandiser: string; remarks: string;
    orderDetails: string; progressWorkflowJson: string; styleCover: string;
  };
  style: {
    cover: string; sizeColorConfig: string; category: string;
    styleNo: string; styleName: string; description: string;
    sampleReviewStatus?: string; sampleReviewComment?: string;
    sampleReviewer?: string; sampleReviewTime?: string;
  };
  bom: Array<{
    id: string; materialCode: string; materialName: string;
    materialType: string; color: string; size: string;
    unit: string; usageAmount: number; lossRate: number;
  }>;
}

export function useInspectionDetailData() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<QualityBriefingData | null>(null);
  const [activeTab, setActiveTab] = useState('records');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [qcRecords, setQcRecords] = useState<WarehousingDetailRecord[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<QualityAiSuggestionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [warehouseValue, setWarehouseValue] = useState('');
  const [warehousingLoading, setWarehousingLoading] = useState(false);
  const [showWarehousingModal, setShowWarehousingModal] = useState(false);
  const [markingRepairBundleId, setMarkingRepairBundleId] = useState<string | null>(null);
  const [batchUnqualifiedModalOpen, setBatchUnqualifiedModalOpen] = useState(false);

  const formHook = useWarehousingForm(
    true, null,
    () => navigate('/production/warehousing'),
    () => { message.success('质检完成'); fetchBriefing(); fetchQcRecords(); },
    briefing?.order?.orderNo,
  );

  const autoInitRef = useRef(false);
  useEffect(() => {
    if (autoInitRef.current) return;
    if (!orderId || !orderDetail) return;
    if (formHook.form.getFieldValue('orderId')) { autoInitRef.current = true; return; }
    formHook.form.setFieldValue('orderId', orderId);
    void formHook.handleOrderChange(orderId, { data: orderDetail });
    autoInitRef.current = true;
  }, [orderId, orderDetail]);

  const fetchBriefing = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try { const res = await api.get<{ code: number; data: QualityBriefingData }>(`/production/warehousing/quality-briefing/${orderId}`); if (res.code === 200 && res.data) setBriefing(res.data); else message.error('获取质检简报失败'); }
    catch (err: unknown) { message.error(`获取质检简报失败: ${err instanceof Error ? err.message : '请检查网络连接'}`); }
    finally { setLoading(false); }
  }, [orderId]);

  const fetchQcRecords = useCallback(async () => {
    if (!orderId) return;
    setRecordsLoading(true);
    try { const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: { page: 1, pageSize: 500, orderId } }); if (res.code === 200) setQcRecords((res.data?.records || []) as WarehousingDetailRecord[]); }
    catch { message.warning('质检记录加载失败'); } finally { setRecordsLoading(false); }
    setOrderDetailLoading(true);
    try { const detail = await fetchProductionOrderDetail(orderId, { acceptAnyData: true }); setOrderDetail((detail || null) as unknown as ProductionOrder | null); }
    catch { setOrderDetail(null); message.warning('订单详情加载失败'); } finally { setOrderDetailLoading(false); }
    try { const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', { params: { page: 1, pageSize: 500, orderId } }); if (res.code === 200) setBundles((res.data?.records || []) as CuttingBundleRow[]); }
    catch { message.warning('裁剪数据加载失败'); }
  }, [orderId]);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);
  useEffect(() => { fetchQcRecords(); }, [fetchQcRecords]);
  useEffect(() => {
    if (!orderId) return;
    setAiLoading(true);
    qualityAiApi.getSuggestion(orderId).then((res: ApiResult) => { setAiSuggestion(res?.data ?? null); }).catch(() => { message.warning('AI质检建议加载失败'); }).finally(() => setAiLoading(false));
  }, [orderId]);

  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) { const qr = String(b.qrCode || '').trim(); if (qr && !m.has(qr)) m.set(qr, b); }
    return m;
  }, [bundles]);

  const orderLineWarehousingRows = useMemo<OrderLineWarehousingRow[]>(() => {
    const on = String(orderDetail?.orderNo || briefing?.order?.orderNo || '').trim();
    const sn = String(orderDetail?.styleNo || briefing?.order?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];
    const warehousedByKey = new Map<string, number>();
    const unqualifiedByKey = new Map<string, number>();
    for (const r of qcRecords) {
      if (!r) continue;
      const qr = String(r.cuttingBundleQrCode || (r as any).qrCode || '').trim();
      const b = qr ? bundleByQr.get(qr) : undefined;
      const color = String(b?.color || r.color || (r as any).colour || '').trim();
      const size = String(b?.size || r.size || '').trim();
      if (!color || !size) continue;
      const k = `${color}@@${size}`;
      const qs = String(r.qualityStatus || '').trim().toLowerCase();
      if ((!qs || qs === 'qualified') && String(r.warehouse || '').trim()) { const q = toNumberSafe(r.qualifiedQuantity); if (q > 0) warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q); }
      const uq = toNumberSafe(r.unqualifiedQuantity); if (uq > 0) unqualifiedByKey.set(k, (unqualifiedByKey.get(k) || 0) + uq);
    }
    return lines.map((l, idx) => {
      const color = String(l?.color || '').trim(); const size = String(l?.size || '').trim(); const quantity = Math.max(0, toNumberSafe(l?.quantity)); const k = `${color}@@${size}`;
      const wq = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0)); const uq = Math.max(0, toNumberSafe(unqualifiedByKey.get(k) || 0));
      return { key: `${idx}-${k}`, orderNo: on || '-', styleNo: sn || '-', color: color || '-', size: size || '-', quantity, warehousedQuantity: wq, unqualifiedQuantity: uq, unwarehousedQuantity: Math.max(0, quantity - wq - uq) };
    }).sort((a, b) => { const c = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true }); return c !== 0 ? c : a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true }); });
  }, [bundleByQr, briefing, orderDetail, qcRecords]);

  const qcStats = useMemo(() => {
    const total = qcRecords.reduce((s, r) => s + (Number(r.warehousingQuantity) || 0), 0);
    const qualified = qcRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const unqualified = qcRecords.reduce((s, r) => s + (Number(r.unqualifiedQuantity) || 0), 0);
    const warehoused = qcRecords.filter(r => { const qs = String(r.qualityStatus || '').trim().toLowerCase(); return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && String(r.warehouse || '').trim(); }).reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const pendingWarehouse = Math.max(0, qualified - warehoused);
    const passRate = total > 0 ? ((qualified / total) * 100).toFixed(1) : '-';
    return { total, qualified, unqualified, warehoused, pendingWarehouse, passRate };
  }, [qcRecords]);

  const handleMarkRepair = useCallback(async (bundleId: string) => {
    setMarkingRepairBundleId(bundleId);
    try { await api.put(`/production/cutting/bundle/${encodeURIComponent(bundleId)}/mark-repair`); message.success('已标记为需返修'); fetchQcRecords(); }
    catch { message.error('标记返修失败'); } finally { setMarkingRepairBundleId(null); }
  }, [fetchQcRecords]);

  const handleWarehouse = useCallback(async () => {
    if (!warehouseValue.trim()) { message.warning('请选择仓库'); return; }
    setWarehousingLoading(true);
    try { await api.post('/production/warehousing/batch-warehouse', { orderId, warehouse: warehouseValue.trim() }); message.success('批量入库成功'); setShowWarehousingModal(false); setWarehouseValue(''); fetchQcRecords(); fetchBriefing(); }
    catch { message.error('批量入库失败'); } finally { setWarehousingLoading(false); }
  }, [orderId, warehouseValue, fetchQcRecords, fetchBriefing]);

  return {
    orderId, navigate, loading, briefing, activeTab, setActiveTab,
    recordsLoading, qcRecords, aiSuggestion, aiLoading,
    orderDetail, orderDetailLoading, bundles,
    warehouseValue, setWarehouseValue, warehousingLoading,
    showWarehousingModal, setShowWarehousingModal,
    markingRepairBundleId, batchUnqualifiedModalOpen, setBatchUnqualifiedModalOpen,
    formHook, orderLineWarehousingRows, qcStats,
    fetchBriefing, fetchQcRecords, handleMarkRepair, handleWarehouse,
  };
}
