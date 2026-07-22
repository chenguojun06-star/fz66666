import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Form } from 'antd';
import api, { type ApiResult, toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { OrderLineWarehousingRow, WarehousingDetailRecord, CuttingBundleRow, OrderLine } from '../../types';
import { useWarehousingForm } from '../../components/WarehousingModal/hooks/useWarehousingForm';
import { qualityAiApi } from '@/services/production/productionApi';
import type { QualityAiSuggestionResult } from '@/services/production/productionApi';
import type { InspectionDetailProps, QualityBriefingData } from './types';

export function useInspectionDetail(props: InspectionDetailProps) {
  const { orderId: propOrderId, defaultTab: propDefaultTab, embedded, onClose } = props;
  const { orderId: paramOrderId } = useParams<{ orderId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const orderId = propOrderId || paramOrderId || '';
  const defaultTab = propDefaultTab || searchParams.get('tab') || 'records';
  const highlightWhNo = searchParams.get('warehousingNo') || '';
  const [loading, setLoading] = useState(true);
  const [briefing, setBriefing] = useState<QualityBriefingData | null>(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [qcRecords, setQcRecords] = useState<WarehousingDetailRecord[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<QualityAiSuggestionResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [warehousingLoading, setWarehousingLoading] = useState(false);
  const [showWarehousingModal, setShowWarehousingModal] = useState(false);
  const [markingRepairBundleId, setMarkingRepairBundleId] = useState<string | null>(null);
  const [batchUnqualifiedModalOpen, setBatchUnqualifiedModalOpen] = useState(false);
  const [_batchUnqualifiedForm] = Form.useForm();

  const formHook = useWarehousingForm(
    true, null,
    () => embedded && onClose ? onClose() : navigate('/production/warehousing'),
    () => { message.success('质检完成'); fetchBriefing(); fetchQcRecords(); },
    briefing?.order?.orderNo,
  );

  const {
    submitLoading, batchSelectedSummary, unqualifiedImageUrls,
    setUnqualifiedImageUrls, handleBatchUnqualifiedSubmit,
  } = formHook;

  const autoInitRef = useRef(false);

  const fetchBriefing = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: QualityBriefingData }>(`/production/warehousing/quality-briefing/${orderId}`);
      if (res.code === 200 && res.data) setBriefing(res.data);
      else message.error('获取质检简报失败');
    } catch (err: unknown) {
      message.error(`获取质检简报失败: ${err instanceof Error ? err.message : '请检查网络连接'}`);
    } finally { setLoading(false); }
  }, [orderId]);

  const fetchQcRecords = useCallback(async () => {
    if (!orderId) return;
    setRecordsLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>(
        '/production/warehousing/list', { params: { page: 1, pageSize: 500, orderId } },
      );
      if (res.code === 200) setQcRecords((res.data?.records || []) as WarehousingDetailRecord[]);
    } catch { message.warning('质检记录加载失败'); } finally { setRecordsLoading(false); }

    setOrderDetailLoading(true);
    try {
      const detail = await fetchProductionOrderDetail(orderId, { acceptAnyData: true });
      setOrderDetail((detail || null) as unknown as ProductionOrder | null);
    } catch { setOrderDetail(null); message.warning('订单详情加载失败'); } finally { setOrderDetailLoading(false); }

    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>(
        '/production/cutting/list', { params: { page: 1, pageSize: 500, orderId } },
      );
      if (res.code === 200) setBundles((res.data?.records || []) as CuttingBundleRow[]);
    } catch { message.warning('裁剪数据加载失败'); }
  }, [orderId]);

  useEffect(() => { fetchBriefing(); }, [fetchBriefing]);
  useEffect(() => { fetchQcRecords(); }, [fetchQcRecords]);

  useEffect(() => {
    if (!orderId) return;
    setAiLoading(true);
    qualityAiApi.getSuggestion(orderId)
      .then((res: ApiResult) => { setAiSuggestion((res?.data ?? null) as QualityAiSuggestionResult | null); })
      .catch(() => { message.warning('AI质检建议加载失败'); })
      .finally(() => setAiLoading(false));
  }, [orderId]);

  useEffect(() => {
    if (autoInitRef.current) return;
    if (!orderId) return;
    if (formHook.form.getFieldValue('orderId')) { autoInitRef.current = true; return; }
    formHook.form.setFieldValue('orderId', orderId);
    if (orderDetail) {
      void formHook.handleOrderChange(orderId, { data: orderDetail });
    } else {
      fetchProductionOrderDetail(orderId, { acceptAnyData: true })
        .then((detail) => {
          if (detail) void formHook.handleOrderChange(orderId, { data: detail });
        })
        .catch((err) => console.error('初始化加载订单详情失败:', err));
    }
    autoInitRef.current = true;
  }, [orderId, orderDetail, formHook]);

  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (qr && !m.has(qr)) m.set(qr, b);
    }
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
      if ((!qs || qs === 'qualified') && String(r.warehouse || '').trim()) {
        const q = toNumberSafe(r.qualifiedQuantity);
        if (q > 0) warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
      }
      const uq = toNumberSafe(r.unqualifiedQuantity);
      if (uq > 0) unqualifiedByKey.set(k, (unqualifiedByKey.get(k) || 0) + uq);
    }

    return lines.map((l, idx) => {
      const color = String(l?.color || '').trim();
      const size = String(l?.size || '').trim();
      const quantity = Math.max(0, toNumberSafe(l?.quantity));
      const k = `${color}@@${size}`;
      const wq = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
      const uq = Math.max(0, toNumberSafe(unqualifiedByKey.get(k) || 0));
      return {
        key: `${idx}-${k}`, orderNo: on || '-', styleNo: sn || '-',
        color: color || '-', size: size || '-', quantity,
        warehousedQuantity: wq, unqualifiedQuantity: uq,
        unwarehousedQuantity: Math.max(0, quantity - wq - uq),
      };
    }).sort((a, b) => {
      const c = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
      return c !== 0 ? c : a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
    });
  }, [bundleByQr, briefing, orderDetail, qcRecords]);

  const qcStats = useMemo(() => {
    const total = qcRecords.reduce((s, r) => s + (Number(r.warehousingQuantity) || 0), 0);
    const qualified = qcRecords.reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const unqualified = qcRecords.reduce((s, r) => s + (Number(r.unqualifiedQuantity) || 0), 0);
    const warehoused = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    const pendingWarehouse = qcRecords
      .filter(r => {
        const qs = String(r.qualityStatus || '').trim().toLowerCase();
        return (qs === 'qualified' || (!qs && Number(r.qualifiedQuantity || 0) > 0)) && !String(r.warehouse || '').trim();
      })
      .reduce((s, r) => s + (Number(r.qualifiedQuantity) || 0), 0);
    return { total, qualified, unqualified, count: qcRecords.length, warehoused, pendingWarehouse };
  }, [qcRecords]);

  const actualDefectSet = useMemo(() => {
    const set = new Set<string>();
    for (const r of qcRecords) {
      if (r.defectCategory && Number(r.unqualifiedQuantity || 0) > 0) set.add(r.defectCategory);
    }
    return set;
  }, [qcRecords]);

  const handleWarehouseSubmit = async (items: { id: string; warehouse: string; warehouseAreaId: string }[]) => {
    if (!items.length) return;
    if (!orderId) return;
    setWarehousingLoading(true);
    try {
      let failCount = 0;
      const failMessages: string[] = [];
      const queue = items.slice();
      const workers = Array.from({ length: Math.min(5, queue.length) }).map(async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) continue;
          try {
            const res = await api.put<{ code: number; message: string; data: boolean }>(
              '/production/warehousing', { id: item.id, warehouse: item.warehouse, warehouseAreaId: item.warehouseAreaId },
            );
            if (res.code !== 200) {
              failCount++;
              const msg = res.message || '入库失败';
              if (!failMessages.includes(msg)) failMessages.push(msg);
            }
          } catch (e: unknown) {
            failCount++;
            const msg = e instanceof Error ? e.message : '入库失败';
            if (!failMessages.includes(msg)) failMessages.push(msg);
          }
        }
      });
      await Promise.all(workers);
      if (failCount === 0) message.success('入库完成');
      else if (failCount < items.length) message.warning(`部分入库成功（${items.length - failCount}/${items.length}），失败原因：${failMessages.join('；')}`);
      else message.error(`入库失败：${failMessages.join('；')}`);
      fetchQcRecords();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '入库失败');
    } finally {
      setWarehousingLoading(false);
    }
  };

  const handleMarkRepaired = useCallback(async (bundleId: string) => {
    if (!bundleId) return;
    setMarkingRepairBundleId(bundleId);
    try {
      const res = await api.post<{ code: number; message?: string }>(
        '/production/warehousing/mark-bundle-repaired', { bundleId },
      );
      if (res.code === 200) {
        message.success('已标记为返修完成，可重新进行质检');
        const orderNo = briefing?.order?.orderNo;
        if (orderNo) await formHook.fetchBundlesByOrderNo(orderNo);
        fetchQcRecords();
      } else {
        message.error(res.message || '标记失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setMarkingRepairBundleId(null);
    }
  }, [briefing, formHook, fetchQcRecords]);

  const handleBack = useCallback(() => {
    if (embedded && onClose) {
      onClose();
    } else {
      navigate('/production/warehousing');
    }
  }, [embedded, onClose, navigate]);

  return {
    orderId,
    highlightWhNo,
    loading,
    briefing,
    activeTab,
    setActiveTab,
    recordsLoading,
    qcRecords,
    aiSuggestion,
    aiLoading,
    orderDetail,
    orderDetailLoading,
    formHook,
    submitLoading,
    batchSelectedSummary,
    unqualifiedImageUrls,
    setUnqualifiedImageUrls,
    handleBatchUnqualifiedSubmit,
    orderLineWarehousingRows,
    qcStats,
    actualDefectSet,
    warehousingLoading,
    showWarehousingModal,
    setShowWarehousingModal,
    markingRepairBundleId,
    batchUnqualifiedModalOpen,
    setBatchUnqualifiedModalOpen,
    handleWarehouseSubmit,
    handleMarkRepaired,
    handleBack,
    autoInitDone: autoInitRef.current,
  };
}
