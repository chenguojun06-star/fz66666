import { useEffect, useState, useCallback, useMemo } from 'react';
import { App } from 'antd';
import api, { type ApiResult, isApiSuccess } from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { getProductionProcessTracking } from '@/utils/api/production';
import type { NodeType, NodeOperations, Factory, ScanRecord, BundleRecord, OperatorSummary, NodeStats } from './types';
import { useOrderSummary } from './useOrderSummary';
import type { OrderSummary } from './useOrderSummary';
import { usePredictionFeedback } from './usePredictionFeedback';
import type { PredictionState } from './usePredictionFeedback';
import {
  normalizeText,
  formatHistoryTime as _formatHistoryTime,
  formatScanDetail as _formatScanDetail,
  extractChildProcessNames,
  filterScanRecordsByNode,
  computeCuttingTotalQty,
  computeCuttingSizeItems,
  computeOperatorSummary,
} from './utils';

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
  const [processTrackingRecords, setProcessTrackingRecords] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [loadWarnings, setLoadWarnings] = useState<string[]>([]);

  const { orderSummary } = useOrderSummary({ orderId, orderNo });

  const addLoadWarning = useCallback((warning: string) => {
    const text = String(warning || '').trim();
    if (!text) return;
    setLoadWarnings((prev) => (prev.includes(text) ? prev : [...prev, text]));
  }, []);

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
  }, [orderId, addLoadWarning]);

  const loadScanRecords = useCallback(async () => {
    if (!orderId) return;
    try {
      const pageSize = 500;
      const maxPages = 50;
      const all: ScanRecord[] = [];
      let page = 1;

      while (page <= maxPages) {
        const res = await productionScanApi.listByOrderId(orderId, { page, pageSize });
        const resData: unknown = res?.data;
        const pageObj = resData && typeof resData === 'object' && !Array.isArray(resData) ? resData as { records?: unknown[] } : null;
        const records = Array.isArray(pageObj?.records)
          ? pageObj!.records
          : Array.isArray(resData)
            ? resData
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
  }, [orderId, addLoadWarning]);

  const handleUndoSuccess = useCallback(() => {
    loadScanRecords();
    loadBundles();
    loadProcessTrackingData();
    onSaved?.();
  }, [loadScanRecords, loadBundles, loadProcessTrackingData, onSaved]);

  const handleRepairTracking = useCallback(async () => {
    if (!orderId) return;
    setRepairLoading(true);
    try {
      const res = await api.post<ApiResult>(`/production/process-tracking/${orderId}/repair-warehousing`);
      const data = (res?.data ?? {}) as Record<string, unknown>;
      const repaired = (data.repaired as number) ?? 0;
      if (repaired > 0) {
        message.success(`同步成功，已修复 ${repaired} 条入库跟踪记录`);
        loadProcessTrackingData();
      } else {
        message.info('没有需要修复的记录，已是最新状态');
      }
    } catch (err: unknown) {
      message.error(`同步失败: ${err instanceof Error ? err.message : '未知错误'}`);
    } finally {
      setRepairLoading(false);
    }
  }, [orderId, loadProcessTrackingData, message]);

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
    }
  }, [visible, orderId, isPatternProduction, loadFactories, loadUsers, loadNodeOperations, loadScanRecords, loadBundles, loadProcessTrackingData]);

  const childProcessNames = useMemo(() => {
    return extractChildProcessNames(processList);
  }, [processList]);

  const filteredScanRecords = useMemo(() => {
    return filterScanRecordsByNode(scanRecords, nodeName, nodeTypeKey, childProcessNames);
  }, [scanRecords, nodeName, nodeTypeKey, childProcessNames]);

  const { prediction, predicting, feedbackSentKeyRef } = usePredictionFeedback({
    visible,
    orderId,
    nodeName,
    isPatternProduction,
    nodeStats,
    filteredScanRecords,
    orderSummaryOrderNo: orderSummary.orderNo,
  });

  const _cuttingTotalQty = useMemo(() => {
    return computeCuttingTotalQty(bundles);
  }, [bundles]);

  const cuttingSizeItems = useMemo(() => {
    return computeCuttingSizeItems(bundles);
  }, [bundles]);

  const operatorSummary = useMemo((): OperatorSummary[] => {
    return computeOperatorSummary(filteredScanRecords);
  }, [filteredScanRecords]);

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
