import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { App } from 'antd';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { intelligenceApi, productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { matchRecordToStage } from '@/utils/productionStage';
import { getProductionProcessTracking } from '@/utils/api/production';
import type { NodeType, NodeOperations, Factory, ScanRecord, BundleRecord, OperatorSummary, NodeStats } from './types';

interface UseNodeDetailDataParams {
  visible: boolean;
  orderId?: string;
  orderNo?: string;
  nodeType: NodeType | string;
  nodeName: string;
  nodeStats?: NodeStats;
  isPatternProduction?: boolean;
  processList: any[];
  onSaved?: () => void;
}

export function useNodeDetailData(params: UseNodeDetailDataParams) {
  const { visible, orderId, orderNo, nodeType, nodeName, nodeStats, isPatternProduction = false, processList, onSaved } = params;
  const { message } = App.useApp();

  const nodeTypeKey = nodeType as NodeType;

  const [loading, setLoading] = useState(false);
  const [factories, setFactories] = useState<Factory[]>();
  const [users, setUsers] = useState<{ id: string; name: string; username: string }[]>([]);
  const [nodeOperations, setNodeOperations] = useState<NodeOperations>({});
  const [scanRecords, setScanRecords] = useState<ScanRecord[]>([]);
  const [bundles, setBundles] = useState<BundleRecord[]>([]);
  const [_orderDetail, setOrderDetail] = useState<Record<string, unknown> | null>(null);
  const [orderSummary, setOrderSummary] = useState<{ orderNo?: string; styleNo?: string; orderQuantity?: number }>({
    orderNo,
  });
  const [processTrackingRecords, setProcessTrackingRecords] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);
  // 进度预测
  const [prediction, setPrediction] = useState<{
    predictedFinishTime?: string;
    confidence?: number;
    reasons?: string[];
    suggestions?: string[];
    predictionId?: string;
  } | null>(null);
  const [predicting, setPredicting] = useState(false);
  // 反馈闭环 ref：每次弹窗打开，同一 orderId+nodeName 只上报一次
  const feedbackSentKeyRef = useRef<string>('');

  const addLoadWarning = useCallback((warning: string) => {
    const text = String(warning || '').trim();
    if (!text) return;
    setLoadWarnings((prev) => (prev.includes(text) ? prev : [...prev, text]));
  }, []);

  const normalizeText = useCallback((input?: string): string => {
    const t = String(input || '').trim();
    if (!t) return '';
    try {
      const decoded = decodeURIComponent(escape(t));
      return decoded || t;
    } catch {
      return t;
    }
  }, []);

  // 加载工厂列表
  const loadFactories = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records: Factory[] } }>('/system/factory/list', {
        params: { page: 1, pageSize: 500 }
      });
      if (res.data?.records) {
        setFactories(res.data.records);
      }
    } catch (err) {
      console.error('加载工厂列表失败', err);
      addLoadWarning('工厂列表加载失败');
    }
  }, [addLoadWarning]);

  // 加载用户列表
  const loadUsers = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: { records: { id: string; name: string; username: string }[] } }>('/system/user/list', {
        params: { page: 1, pageSize: 500, status: 'enabled' }
      });
      if (res.data?.records) {
        setUsers(res.data.records);
      }
    } catch (err) {
      console.error('加载用户列表失败', err);
      addLoadWarning('用户列表加载失败');
    }
  }, [addLoadWarning]);

  // 加载节点操作数据
  const loadNodeOperations = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const res = await productionOrderApi.getNodeOperations(orderId);
      if (res.code === 200 && res.data) {
        const parsed = typeof res.data === 'string'
          ? JSON.parse(res.data)
          : res.data;
        setNodeOperations(parsed || {});
      }
    } catch (err) {
      console.error('加载节点操作数据失败', err);
      addLoadWarning('节点设置数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [orderId, orderNo, addLoadWarning]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orderId) {
        setOrderSummary({ orderNo });
        return;
      }
      try {
        const res = await productionOrderApi.list({ orderNo: orderId, page: 1, pageSize: 1 });
        const result = res as any;
        if (!cancelled && result.code === 200 && result.data) {
          const data = result.data as { records?: unknown[] };
          const records = data?.records || [];
          if (records.length > 0) {
            const orderData = records[0] as any;
            setOrderDetail(orderData);
            setOrderSummary({
              orderNo: String(orderData.orderNo || orderNo || '').trim() || undefined,
              styleNo: String(orderData.styleNo || '').trim() || undefined,
              orderQuantity: Number(orderData.orderQuantity ?? 0) || 0,
            });
          }
        }
      } catch {
        if (!cancelled) setOrderSummary({ orderNo });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [orderId, orderNo]);

  // 加载扫码记录
  const loadScanRecords = useCallback(async () => {
    if (!orderId) return;
    try {
      const pageSize = 500;
      const maxPages = 50;
      const all: ScanRecord[] = [];
      let page = 1;

      while (page <= maxPages) {
        const res = await productionScanApi.listByOrderId(orderId, { page, pageSize });
        const result = res as any;
        const records = Array.isArray(result?.data?.records)
          ? result.data.records
          : Array.isArray(result?.data)
            ? result.data
            : [];
        if (!records.length) break;
        all.push(...(records as ScanRecord[]));
        if (records.length < pageSize) break;
        page += 1;
      }

      setScanRecords(all);
    } catch (err) {
      console.error('加载扫码记录失败', err);
      addLoadWarning('扫码记录加载失败');
    }
  }, [orderId, addLoadWarning]);

  // 加载菲号列表
  const loadBundles = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get<{ code: number; data: { records: BundleRecord[] } }>('/production/cutting/list', {
        params: { productionOrderId: orderId, productionOrderNo: orderNo, page: 1, pageSize: 500 }
      });
      if (res.data?.records) {
        const list = Array.isArray(res.data.records) ? res.data.records : [];
        const filtered = orderNo
          ? list.filter((b) => String(b.qrCode || '').trim().startsWith(String(orderNo || '').trim()))
          : list;
        setBundles(filtered);
      }
    } catch (err) {
      console.error('加载菲号列表失败', err);
      addLoadWarning('菲号列表加载失败');
    }
  }, [orderId, orderNo, addLoadWarning]);

  // 加载工序跟踪数据（工资结算依据）
  const loadProcessTrackingData = useCallback(async () => {
    if (!orderId) return;
    setTrackingLoading(true);
    try {
      const response = await getProductionProcessTracking(orderId);
      const data = (response as any)?.data || [];
      const records = Array.isArray(data) ? data : [];
      setProcessTrackingRecords(records);
    } catch (error) {
      console.error('NodeDetailModal: 加载工序跟踪数据失败:', error);
      addLoadWarning('工序跟踪数据加载失败');
      setProcessTrackingRecords([]);
    } finally {
      setTrackingLoading(false);
    }
  }, [orderId, orderNo, addLoadWarning]);

  const handleUndoSuccess = useCallback(() => {
    loadScanRecords();
    loadBundles();
    loadProcessTrackingData();
    onSaved?.();
  }, [loadScanRecords, loadBundles, loadProcessTrackingData, onSaved]);

  // 修复历史入库漏更新的跟踪记录
  const handleRepairTracking = useCallback(async () => {
    if (!orderId) return;
    setRepairLoading(true);
    try {
      const res = await api.post(`/production/process-tracking/${orderId}/repair-warehousing`);
      const data = (res as any)?.data || {};
      const repaired = data.repaired ?? 0;
      if (repaired > 0) {
        message.success(`同步成功，已修复 ${repaired} 条入库跟踪记录`);
        loadProcessTrackingData();
      } else {
        message.info('没有需要修复的记录，已是最新状态');
      }
    } catch (err: any) {
      message.error(`同步失败: ${err?.message || '未知错误'}`);
    } finally {
      setRepairLoading(false);
    }
  }, [orderId, loadProcessTrackingData, message]);

  // 弹窗打开时加载数据
  useEffect(() => {
    if (visible && orderId) {
      setLoadWarnings([]);
      loadFactories();
      loadUsers();
      loadNodeOperations();
      if (!isPatternProduction) {
        loadScanRecords();
        loadBundles();
        loadProcessTrackingData();
      } else {
        setScanRecords([]);
        setBundles([]);
      }
    }
    if (!visible) {
      setLoadWarnings([]);
      setPrediction(null);
      feedbackSentKeyRef.current = '';
    }
  }, [visible, orderId, isPatternProduction, loadFactories, loadNodeOperations, loadScanRecords, loadBundles, loadProcessTrackingData]);

  // 进度预测：弹窗打开且有订单ID时异步拉取
  useEffect(() => {
    if (!visible || !orderId || isPatternProduction) return;
    let cancelled = false;
    setPredicting(true);
    intelligenceApi.predictFinishTime({ orderId, stageName: nodeName })
      .then((res: any) => {
        if (!cancelled && res.code === 200 && res.data) {
          setPrediction(res.data);
        }
      })
      .catch(() => { /* 静默失败，不影响主流程 */ })
      .finally(() => { if (!cancelled) setPredicting(false); });
    return () => { cancelled = true; };
  }, [visible, orderId, nodeName, isPatternProduction]);

  // 从 processList 提取子工序名称集合
  const childProcessNames = useMemo(() => {
    if (!processList || processList.length === 0) return [] as string[];
    const names = processList.map(p => ((p as any).processName || p.name || '').trim()).filter(Boolean);
    return names;
  }, [processList, nodeName]);

  // 筛选当前节点的扫码记录
  const filteredScanRecords = useMemo(() => {
    const nName = normalizeText(nodeName);
    const nKey = String(nodeTypeKey || '').trim();
    const matched = scanRecords.filter((r) => {
      if (String((r as any)?.scanResult || '').trim() !== 'success') return false;
      if ((Number((r as any)?.quantity) || 0) <= 0) return false;
      if (matchRecordToStage(r.progressStage, r.processName, nKey, nName)) return true;
      const stage = (r.progressStage || '').trim();
      const process = (r.processName || '').trim();
      if (stage && nName && (stage.includes(nName) || nName.includes(stage))) return true;
      if (childProcessNames.length > 0 && process) {
        return childProcessNames.some(cp => process.includes(cp) || cp.includes(process));
      }
      return false;
    });
    return matched;
  }, [scanRecords, nodeName, nodeTypeKey, normalizeText, childProcessNames]);

  // 反馈闭环：节点完成(100%)时，静默上报实际完工时间
  useEffect(() => {
    if (!orderId || !visible || isPatternProduction) return;
    if ((nodeStats?.percent ?? 0) < 100) return;
    if (filteredScanRecords.length === 0) return;

    const key = `${orderId}::${nodeName}`;
    if (feedbackSentKeyRef.current === key) return;
    feedbackSentKeyRef.current = key;

    const maxScanTime = filteredScanRecords.reduce((latest, r) => {
      const t = String((r as any).scanTime || '');
      return t > latest ? t : latest;
    }, '');

    if (!maxScanTime) return;

    intelligenceApi.feedback({
      predictionId: prediction?.predictionId,
      orderId,
      orderNo: orderSummary.orderNo,
      stageName: nodeName,
      predictedFinishTime: prediction?.predictedFinishTime,
      actualFinishTime: maxScanTime,
      actualResult: 'completed',
    }).catch(() => { /* 静默失败 */ });
  }, [orderId, nodeName, visible, isPatternProduction, nodeStats?.percent, filteredScanRecords, prediction, orderSummary.orderNo]);

  const _cuttingTotalQty = useMemo(() => {
    return bundles.reduce((sum, b) => sum + (b.quantity || 0), 0);
  }, [bundles]);

  // 裁剪数量按尺码汇总
  const cuttingSizeItems = useMemo(() => {
    const sizes = ['S', 'M', 'L', 'XL', 'XXL'];
    const sizeMap: Record<string, number> = {};
    sizes.forEach(s => { sizeMap[s] = 0; });

    bundles.forEach(b => {
      const size = (b.size || '').toUpperCase().trim();
      if (Object.prototype.hasOwnProperty.call(sizeMap, size)) {
        sizeMap[size] += (b.quantity || 0);
      }
    });

    return sizes
      .map(size => ({ size, quantity: sizeMap[size] }))
      .filter(item => item.quantity > 0);
  }, [bundles]);

  // 汇总操作员数据
  const operatorSummary = useMemo((): OperatorSummary[] => {
    const map = new Map<string, OperatorSummary>();
    filteredScanRecords.forEach(r => {
      const id = r.operatorId || 'unknown';
      const name = r.operatorName || '未知';
      if (!map.has(id)) {
        map.set(id, { operatorId: id, operatorName: name, totalQty: 0, scanCount: 0 });
      }
      const item = map.get(id)!;
      item.totalQty += r.quantity || 0;
      item.scanCount += 1;
      if (!item.lastScanTime || (r.scanTime && r.scanTime > item.lastScanTime)) {
        item.lastScanTime = r.scanTime;
      }
    });
    return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
  }, [filteredScanRecords]);

  const _formatHistoryTime = useCallback((value?: string) => (value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '-'), []);

  const _formatScanDetail = useCallback((record: ScanRecord) => {
    const parts: string[] = [];
    const nodeLabel = normalizeText(record.processName || record.progressStage);
    if (nodeLabel) parts.push(nodeLabel);
    if (typeof record.quantity === 'number') parts.push(`${record.quantity}件`);
    const colorSize = [record.color, record.size].filter(Boolean).join('/');
    if (colorSize) parts.push(colorSize);
    const bundle = record.cuttingBundleNo || record.cuttingBundleQrCode;
    if (bundle) parts.push(`菲号${bundle}`);
    if (record.scanCode) parts.push(`码:${record.scanCode}`);
    return parts.filter(Boolean).join(' · ') || '-';
  }, [normalizeText]);

  return {
    loading, factories, users, nodeOperations, setNodeOperations,
    scanRecords, bundles, orderSummary,
    processTrackingRecords, trackingLoading, repairLoading,
    loadWarnings, prediction, predicting, feedbackSentKeyRef,
    filteredScanRecords, operatorSummary, cuttingSizeItems,
    childProcessNames, _cuttingTotalQty,
    handleUndoSuccess, handleRepairTracking,
    normalizeText, _formatHistoryTime, _formatScanDetail,
  };
}
