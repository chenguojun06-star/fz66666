import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Input, Modal, Select, Space, Tag } from 'antd';
import type { InputRef } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import UniversalCardView from '@/components/common/UniversalCardView';
import ResizableTable from '@/components/common/ResizableTable';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import api, { generateRequestId, isDuplicateScanMessage, parseProductionOrderLines, isApiSuccess } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { formatDateTimeCompact } from '@/utils/datetime';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { CuttingBundle, ProductionOrder, ScanRecord } from '@/types/production';
import type { TemplateLibrary } from '@/types/style';

import { productionCuttingApi, productionOrderApi, productionScanApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

import {
  defaultNodes,
  stripWarehousingNode,
  getNodeIndexFromProgress,
  parseProgressNodes,
  findPricingProcessForStage,
  getCloseMinRequired,
  calculateProgressFromBundles,
  resolveNodesForOrder,
  resolveNodesForListOrder,
  getCurrentWorkflowNodeForOrder,
} from './utils';
import { ProgressNode } from './types';
import ScanConfirmModal from './components/ScanConfirmModal';
import SmartOrderHoverCard from './components/SmartOrderHoverCard';
import { ensureBoardStatsForOrder } from './hooks/useBoardStats';
import { useScanBundles } from './hooks/useScanBundles';
import { useScanConfirm } from './hooks/useScanConfirm';
import { useNodeStats } from './hooks/useNodeStats';
import { useSubmitScan } from './hooks/useSubmitScan';
import { useNodeWorkflowActions } from './hooks/useNodeWorkflowActions';
import { useOrderSync } from './hooks/useOrderSync';
import { useInlineNodeOps } from './hooks/useInlineNodeOps';
import { useOpenScan } from './hooks/useOpenScan';
import { useOrderProgress } from './hooks/useOrderProgress';
import { useCloseOrder } from './hooks/useCloseOrder';
import { useScanFeedback } from './hooks/useScanFeedback';
import { useNodeDetail } from './hooks/useNodeDetail';
import { usePrintFlow } from './hooks/usePrintFlow';
import { useRemarkModal } from './hooks/useRemarkModal';
import { useQuickEdit } from './hooks/useQuickEdit';
import { useProgressFilters } from './hooks/useProgressFilters';
import { useProgressColumns } from './hooks/useProgressColumns';
import { useStagnantDetection } from './hooks/useStagnantDetection';
import { useProductionBoardStore } from '@/stores';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import {
  fetchScanHistory as fetchScanHistoryHelper,
  fetchCuttingBundles as fetchCuttingBundlesHelper,
  fetchPricingProcesses as fetchPricingProcessesHelper,
} from './helpers/fetchers';
import { fetchNodeOperations } from './helpers/nodeOperations';

type ProgressDetailProps = {
  embedded?: boolean;
};

const ProgressDetail: React.FC<ProgressDetailProps> = ({ embedded }) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUserFn(user), [user]);

  // ── 筛选 / 排序 / 统计卡片 ──────────────────────────────────────
  const {
    queryParams, setQueryParams,
    dateRange, setDateRange,
    viewMode, setViewMode,
    activeStatFilter,
    orderSortField, orderSortOrder,
    statusOptions,
    handleOrderSort, handleStatClick,
  } = useProgressFilters();

  // ── 订单数据 ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [globalStats, setGlobalStats] = useState({
    totalOrders: 0, totalQuantity: 0,
    delayedOrders: 0, delayedQuantity: 0,
    todayOrders: 0, todayQuantity: 0,
  });
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [nodeOps, setNodeOps] = useState<Record<string, any>>({});


  // ── 工序节点 Workflow ─────────────────────────────────────────
  const [nodes, setNodes] = useState<ProgressNode[]>(defaultNodes);
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  const [nodeWorkflowLocked, setNodeWorkflowLocked] = useState(false);
  const [, setNodeWorkflowDirty] = useState(false);
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const mergeProcessDataForOrder = useProductionBoardStore((s) => s.mergeProcessDataForOrder);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  // ── 用户列表（跟单员筛选）────────────────────────────────────────
  const [users, setUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);
  useEffect(() => {
    api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>(
      '/system/user/list', { params: { page: 1, pageSize: 1000, status: 'enabled' } }
    ).then(r => {
      if (r?.code === 200) setUsers(r.data.records || []);
    }).catch(() => {});
  }, []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  // ── 扫码弹窗 ──────────────────────────────────────────────────
  const [scanOpen, setScanOpen] = useState(false);
  const [_scanSubmitting, setScanSubmitting] = useState(false);
  const [scanForm] = Form.useForm();
  const scanInputRef = useRef<InputRef>(null);
  const scanSubmittingRef = useRef(false);
  const orderSyncingRef = useRef(false);
  const activeOrderRef = useRef<ProductionOrder | null>(null);
  const lastFailedRequestRef = useRef<{ key: string; requestId: string } | null>(null);
  const [_scanBundlesExpanded, setScanBundlesExpanded] = useState(false);
  const [bundleSelectedQr, setBundleSelectedQr] = useState('');

  const {
    state: scanConfirmState,
    openConfirm: openScanConfirm,
    closeConfirm: closeScanConfirmState,
    setLoading: setScanConfirmLoading,
  } = useScanConfirm();

  const { submitScanFeedback } = useScanFeedback();

  // ── 子模块 Hooks ──────────────────────────────────────────────
  const {
    openNodeDetail, closeNodeDetail,
    nodeDetailVisible, nodeDetailOrder, nodeDetailType,
    nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList,
  } = useNodeDetail();
  const { printingRecord, printModalVisible, setPrintingRecord, closePrintModal } = usePrintFlow();
  const {
    remarkPopoverId, remarkText, remarkSaving,
    setRemarkPopoverId, setRemarkText, handleRemarkSave,
  } = useRemarkModal({ message, fetchOrders: () => fetchOrders() });
  const {
    quickEditVisible, quickEditRecord, quickEditSaving,
    setQuickEditVisible, setQuickEditRecord,
    handleQuickEdit, handleQuickEditSave,
  } = useQuickEdit({ message, fetchOrders: () => fetchOrders() });

  const queryParamsRef = useRef(queryParams);
  const dateRangeRef = useRef(dateRange);
  useEffect(() => { queryParamsRef.current = queryParams; }, [queryParams]);
  useEffect(() => { dateRangeRef.current = dateRange; }, [dateRange]);
  useEffect(() => { progressNodesByStyleNoRef.current = progressNodesByStyleNo; }, [progressNodesByStyleNo]);
  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);


  const fetchOrders = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!silent) {
      setLoading(true);
    }
    try {
      const currentDateRange = dateRangeRef.current;
      const params: ProductionOrderListParams = {
        ...queryParamsRef.current,
        ...(currentDateRange?.[0] && currentDateRange?.[1] ? {
          startDate: currentDateRange[0].startOf('day').toISOString(),
          endDate: currentDateRange[1].endOf('day').toISOString(),
        } : {}),
      };
      const response = await productionOrderApi.list(params);
      const result = response as { code: number; message?: string; data: { records: ProductionOrder[]; total: number } };
      if (result.code === 200) {
        const records = result.data.records || [];
        setOrders(records);
        setTotal(result.data.total || 0);
        if (showSmartErrorNotice) setSmartError(null);
        // 每次刷新订单列表时清空进度球缓存，确保扫码后能看到最新数据
        clearAllBoardCache();
        // 同时清空工序节点缓存，确保模板改词汇后刷新能重新加载最新节点配置
        setProgressNodesByStyleNo({});
        progressNodesByStyleNoRef.current = {};
        const styleNos = Array.from(
          new Set(
            records
              .map((r) => String(r.styleNo || '').trim())
              .filter((sn) => sn)
          )
        );
        if (styleNos.length) {
          void (async () => {
            const settled = await Promise.allSettled(
              styleNos.map(async (sn) => {
                const res = await templateLibraryApi.progressNodeUnitPrices(sn);
                const r = res as Record<string, unknown>;
                const rows = Array.isArray(r?.data) ? r.data : [];
                const normalized: ProgressNode[] = rows
                  .map((n: any) => {
                    const name = String(n?.name || '').trim();
                    const id = String(n?.id || name || '').trim() || name;
                    const p = Number(n?.unitPrice);
                    const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
                    // ★ 保留 progressStage（父分类字段），用于进度球弹窗过滤和boardStats匹配
                    const progressStage = String(n?.progressStage || '').trim() || undefined;
                    return { id, name, unitPrice, progressStage };
                  })
                  .filter((n: ProgressNode) => n.name);
                return { styleNo: sn, nodes: stripWarehousingNode(normalized) };
              })
            );
            const next: Record<string, ProgressNode[]> = {};
            for (const s of settled) {
              if (s.status !== 'fulfilled') continue;
              if (!s.value.nodes.length) continue;
              next[s.value.styleNo] = s.value.nodes;
            }
            if (Object.keys(next).length) {
              setProgressNodesByStyleNo((prev) => ({ ...prev, ...next }));
            }
          })();
        }
      } else if (!silent) {
        const errMessage = result.message || '获取生产订单失败';
        reportSmartError('生产进度加载失败', errMessage, 'PROGRESS_LIST_LOAD_FAILED');
        message.error(errMessage);
      }
    } catch (err: any) {
      if (!silent) {
        reportSmartError('生产进度加载失败', err?.message || '网络异常或服务不可用，请稍后重试', 'PROGRESS_LIST_LOAD_EXCEPTION');
        message.error(`获取生产订单失败: ${err?.message || '请检查网络连接'}`);
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  // 获取全局统计数据（根据当前筛选条件）
  const fetchGlobalStats = useCallback(async (params?: typeof queryParams) => {
    try {
      // 只传递筛选参数，不传分页参数
      const filterParams = params ? {
        keyword: params.keyword,
        factoryName: params.factoryName,
        status: params.status,
        orderNo: params.orderNo,
        styleNo: params.styleNo,
      } : {};

      const response = await api.get<{
        totalOrders: number;
        totalQuantity: number;
        delayedOrders: number;
        delayedQuantity: number;
        todayOrders: number;
        todayQuantity: number;
      }>('/production/order/stats', { params: filterParams });
      if (isApiSuccess(response)) {
        setGlobalStats(response.data);
      }
    } catch (error) {
      console.error('获取全局统计数据失败', error);
    }
  }, []);

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    fetchGlobalStats(queryParams);
  }, [fetchGlobalStats, queryParams]);

  const closeScanConfirm = (silent?: boolean) => {
    closeScanConfirmState();
    if (!silent) {
      message.info('已取消');
    }
  };

  const submitConfirmedScan = async () => {
    if (!scanConfirmState.payload || scanConfirmState.loading) return;
    if (!activeOrder) return;
    setScanConfirmLoading(true);
    const meta = scanConfirmState.meta || {};
    const attemptKey = meta.attemptKey || '';
    const attemptRequestId = meta.attemptRequestId || '';
    const values = meta.values || {};
    try {
      const response = await productionScanApi.execute(scanConfirmState.payload);
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        lastFailedRequestRef.current = null;
        const serverMsg = String((result?.data as any)?.message || '').trim();
        const exceed = serverMsg.includes('裁剪') && serverMsg.includes('超出');
        if (exceed) {
          message.error('数量超出无法入库');
          closeScanConfirm(true);
          return;
        }
        const isDuplicate = isDuplicateScanMessage(serverMsg);
        if (isDuplicate) {
          message.info('已处理');
        } else {
          message.success(serverMsg || '扫码成功');
          // 静默反馈闭环 — 扫码成功后向智能模型提交实际数据
          submitScanFeedback({
            orderId: String(activeOrder.id || ''),
            orderNo: activeOrder.orderNo,
            stageName: values.progressStage,
            processName: values.processName,
          });
        }
        const effectiveNodes = stripWarehousingNode(resolveNodesForOrder(activeOrder, progressNodesByStyleNo, nodes));
        const isProd = String(values.scanType || '').trim() === 'production';
        if (!isDuplicate && isProd) {
          const updated = await fetchScanHistory(activeOrder);
          const autoCalculatedProgress = calculateProgressFromBundles(activeOrder, cuttingBundles, updated, effectiveNodes);
          await updateOrderProgress(activeOrder, autoCalculatedProgress);
          const currentIdx = getNodeIndexFromProgress(effectiveNodes, autoCalculatedProgress);
          const nextNode = effectiveNodes[currentIdx];
          if (nextNode) {
            scanForm.setFieldsValue({
              progressStage: String(nextNode.name || '').trim() || undefined,
              processCode: String(nextNode.id || '').trim(),
              unitPrice: Number.isFinite(Number(nextNode.unitPrice)) && Number(nextNode.unitPrice) >= 0 ? Number(nextNode.unitPrice) : undefined,
            });
          }
        } else {
          await fetchOrders();
          await fetchScanHistory(activeOrder);
        }
        scanForm.setFieldsValue({ scanCode: '', quantity: undefined });
        setTimeout(() => scanInputRef.current?.focus?.(), 0);
      } else {
        const msg = String(result.message || '').trim();
        const exceed = msg.includes('裁剪') && msg.includes('超出');
        if (exceed) {
          message.error('数量超出无法入库');
        } else if (msg) {
          message.error(msg);
        } else {
          message.error('系统繁忙');
        }
      }
    } catch (error) {
      const anyErr: any = error;
      const hasStatus = anyErr?.status != null || anyErr?.response?.status != null;
      if (!hasStatus) {
        if (attemptKey && attemptRequestId) {
          lastFailedRequestRef.current = { key: attemptKey, requestId: attemptRequestId };
        }
        message.error('连接失败');
      } else {
        lastFailedRequestRef.current = null;
        console.error('scan_execute_failed', error);
        message.error('系统繁忙');
      }
    } finally {
      setScanConfirmLoading(false);
      closeScanConfirm(true);
      setScanSubmitting(false);
      scanSubmittingRef.current = false;
    }
  };

  // 使用 ref 标记是否已经初始化加载
  const initialLoadDone = useRef(false);

  // 仅在组件首次挂载时获取数据
  useEffect(() => {
    fetchOrders();
    initialLoadDone.current = true;
  }, []);

  // 每次重新切回该页面（浏览器 Tab 或 SPA 菜单）时静默刷新
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchOrders({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchOrders]);

  // 当查询参数改变时获取数据
  useEffect(() => {
    // 跳过初始加载
    if (!initialLoadDone.current) return;

    const timer = setTimeout(() => {
      fetchOrders();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    queryParams.page,
    queryParams.pageSize,
    queryParams.keyword,
    queryParams.status,
    (queryParams as any).delayedOnly,
    (queryParams as any).todayOnly,
    // 使用稳定的值，null 转换为固定字符串
    dateRange?.[0]?.valueOf() ?? 'null-start',
    dateRange?.[1]?.valueOf() ?? 'null-end'
  ]);


  // ── 模板函数 ─────────────────────────────────────────────────────
  const fetchTemplateNodes = async (templateId: string): Promise<ProgressNode[]> => {
    const tid = String(templateId || '').trim();
    if (!tid) return [];
    const res = await templateLibraryApi.getById(tid);
    const result = res as Record<string, unknown>;
    if (result.code !== 200) return [];
    const tpl = result.data as TemplateLibrary;
    return parseProgressNodes(String(tpl?.templateContent ?? ''));
  };


  const ensureNodesFromTemplateIfNeeded = async (order: ProductionOrder) => {
    if (!order) return;
    const templateId = String((order as any)?.progressTemplateId || '').trim();
    if (!templateId) return;

    try {
      const templateNodes = await fetchTemplateNodes(templateId);
      if (templateNodes && templateNodes.length > 0) {
        setNodes(templateNodes);
        if (order.styleNo) {
          setProgressNodesByStyleNo(prev => ({
            ...prev,
            [order.styleNo]: templateNodes
          }));
        }
      }
    } catch (error) {
      // Silently ignore template loading errors
    }
  };

  useEffect(() => {
    if (!orders.length) return;
    const queue = orders.slice(0, Math.min(20, orders.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o, progressNodesByStyleNo, defaultNodes));
        // 计算每个父节点下期望的子工序数（从款式模板获取）
        const sn = String((o as any)?.styleNo || '').trim();
        const styleNodes = sn && progressNodesByStyleNo[sn] ? progressNodesByStyleNo[sn] : [];
        const cpcMap: Record<string, number> = {};
        for (const s of styleNodes) {
          const parent = String(s.progressStage || s.name || '').trim();
          if (parent) cpcMap[parent] = (cpcMap[parent] || 0) + 1;
        }
        await ensureBoardStatsForOrder({
          order: o,
          nodes: ns,
          childProcessCountByNode: Object.keys(cpcMap).length > 0 ? cpcMap : undefined,
          boardStatsByOrder,
          boardStatsLoadingByOrder,
          mergeBoardStatsForOrder,
          mergeBoardTimesForOrder,
          setBoardLoadingForOrder,
          mergeProcessDataForOrder,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [
    orders,
    progressNodesByStyleNo,
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    mergeBoardStatsForOrder,
    mergeBoardTimesForOrder,
    setBoardLoadingForOrder,
    mergeProcessDataForOrder,
  ]);

  const saveNodes = (next: ProgressNode[]) => {
    const stripped = stripWarehousingNode(next);
    setNodes(stripped.length ? stripped : defaultNodes);
  };

  const fetchScanHistory = (order: ProductionOrder, options?: { silent?: boolean }) =>
    fetchScanHistoryHelper({ order, setScanHistory, message, options });

  const fetchCuttingBundles = (order: ProductionOrder) =>
    fetchCuttingBundlesHelper({ order, setCuttingBundles, setCuttingBundlesLoading, message });

  const fetchPricingProcesses = (order: ProductionOrder) =>
    fetchPricingProcessesHelper({ order, setPricingProcesses: () => {}, setPricingProcessLoading: () => {} });

  const currentInlineNode = useMemo(() => {
    return getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
  }, [activeOrder, progressNodesByStyleNo, nodes]);

  useInlineNodeOps({
    activeOrder,
    currentInlineNode,
    nodeOps,
    setNodeOps,
    setInlineSaving: () => {},
    user,
    productionOrderApi,
    message,
    fetchNodeOperations,
    formatDateTimeCompact,
  });

  // ===== closeDetail 函数已删除 =====

  // 提前定义 fetchOrderDetail 以避免在 useOpenScan 中的引用错误
  const fetchOrderDetail = async (orderId: string): Promise<ProductionOrder | null> => {
    const oid = String(orderId || '').trim();
    if (!oid) return null;
    try {
      const res = await productionOrderApi.list({ orderNo: oid, page: 1, pageSize: 1 });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data as { records?: any[] };
        const records = data?.records || [];
        return records.length > 0 ? (records[0] as ProductionOrder) : null;
      }
      return null;
    } catch {
      // Intentionally empty
      // 忽略错误
      return null;
    }
  };

  const openScan = useOpenScan({
    isOrderFrozenByStatus: (o: ProductionOrder) => (o.status as string) === 'cancelled' || (o.status as string) === 'closed' || o.status === 'completed',
    message,
    fetchOrderDetail,
    setActiveOrder,
    setNodeWorkflowLocked,
    setNodeWorkflowDirty,
    ensureNodesFromTemplateIfNeeded,
    fetchScanHistory,
    fetchCuttingBundles,
    fetchPricingProcesses,
    setScanBundlesExpanded,
    setBundleSelectedQr,
    setScanOpen,
    scanForm,
    progressNodesByStyleNo,
    nodes,
    defaultNodes,
    findPricingProcessForStage,
    scanInputRef,
  });

  const _closeScan = () => {
    closeScanConfirm(true);
    setScanOpen(false);
    setScanSubmitting(false);
    scanSubmittingRef.current = false;
    lastFailedRequestRef.current = null;
    scanForm.resetFields();
    setCuttingBundles([]);
    setScanBundlesExpanded(false);
    setBundleSelectedQr('');
  };

  const watchScanCode = Form.useWatch('scanCode', scanForm);
  const watchProgressStage = Form.useWatch('progressStage', scanForm);
  const watchScanType = Form.useWatch('scanType', scanForm);

  const scanBundlesFetchOnceRef = useRef<string>('');

  useEffect(() => {
    if (!scanOpen) {
      scanBundlesFetchOnceRef.current = '';
      return;
    }
    if (!activeOrder?.id) return;
    if (cuttingBundlesLoading) return;
    if (cuttingBundles.length) {
      scanBundlesFetchOnceRef.current = '';
      return;
    }
    if (scanBundlesFetchOnceRef.current === activeOrder.id) return;
    scanBundlesFetchOnceRef.current = activeOrder.id;
    void fetchCuttingBundles(activeOrder);
  }, [scanOpen, activeOrder?.id, cuttingBundles.length, cuttingBundlesLoading]);

  useEffect(() => {
    if (!scanOpen) return;
    if (!activeOrder?.id) return;

    const currentNode = getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
    const name = String(currentNode?.name || '').trim();
    const code = String(currentNode?.id || '').trim();
    const p = Number(currentNode?.unitPrice);
    scanForm.setFieldsValue({
      progressStage: name || undefined,
      processCode: code || '',
      unitPrice: Number.isFinite(p) && p >= 0 ? p : undefined,
    });
  }, [scanOpen, activeOrder?.id, activeOrder?.productionProgress, nodes, scanForm]);

  const {
    matchedBundle,
    bundleDoneByQrForSelectedNode: _bundleDoneByQrForSelectedNode,
    bundleMetaByQrForSelectedNode: _bundleMetaByQrForSelectedNode,
    bundleSummary: _bundleSummary,
    isBundleCompletedForSelectedNode,
  } = useScanBundles({
    scanOpen,
    watchScanCode,
    watchProgressStage,
    watchScanType,
    cuttingBundles,
    scanHistory,
    scanForm,
    bundleSelectedQr,
    setBundleSelectedQr,
  });

  const _submitScan = useSubmitScan({
    activeOrder,
    user,
    scanForm,
    bundleSelectedQr,
    matchedBundle,
    isBundleCompletedForSelectedNode,
    setCuttingBundles,
    setScanSubmitting,
    scanSubmittingRef,
    lastFailedRequestRef,
    openScanConfirm,
    progressNodesByStyleNo,
    nodes,
    defaultNodes,
    productionCuttingApi,
    message,
    generateRequestId,
  });

  useNodeStats({ scanHistory, activeOrder, cuttingBundles, nodes });

  useNodeWorkflowActions({
    activeOrderId: activeOrder?.id,
    isSupervisorOrAbove,
    nodeWorkflowLocked,
    nodes,
    defaultNodes,
    saveNodes,
    setNodeWorkflowDirty,
    message,
    Modal,
  });


  useOrderSync({
    fetchOrders,
    fetchOrderDetail,
    fetchScanHistory,
    activeOrderRef,
    setActiveOrder,
    orderSyncingRef,
  });

  const { updateOrderProgress } = useOrderProgress({
    activeOrder,
    fetchOrders,
    fetchOrderDetail,
    setActiveOrder,
    ensureNodesFromTemplateIfNeeded,
    fetchScanHistory,
    progressNodesByStyleNo,
    nodes,
    productionOrderApi,
    message,
  });



  const handleCloseOrder = useCloseOrder({
    isSupervisorOrAbove,
    message,
    Modal,
    productionOrderApi,
    fetchOrders,
    fetchOrderDetail,
    setActiveOrder,
    activeOrderId: activeOrder?.id,
    getCloseMinRequired,
  });

  // ── 停滞订单检测（≥3天无新扫码）─────────────────────────────────────
  const stagnantOrderIds = useStagnantDetection(orders, boardTimesByOrder);

  // ── 表格列定义 ─────────────────────────────────────────────────────
  const { columns } = useProgressColumns({
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, setQuickEditRecord, setQuickEditVisible,
    setRemarkPopoverId, setRemarkText,
    openScan,
    stagnantOrderIds,
  });


  const pageContent = (
    <div className="production-progress-detail-page">
      {embedded ? (
        <>
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <>
                  <StandardSearchBar
                    searchValue={String(queryParams.keyword || '')}
                    onSearchChange={(value) =>
                      setQueryParams((prev) => ({
                        ...prev,
                        page: 1,
                        keyword: value,
                        orderNo: undefined,
                        styleNo: undefined,
                        factoryName: undefined,
                      }))
                    }
                    searchPlaceholder="搜索订单号/款号/工厂"
                    dateValue={dateRange}
                    onDateChange={(value) => setDateRange(value)}
                    statusValue={String(queryParams.status || '')}
                    onStatusChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, status: value || undefined }))}
                    statusOptions={statusOptions}
                  />
                  <Select
                    value={queryParams.urgencyLevel || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, urgencyLevel: value || undefined, page: 1 }))}
                    placeholder="紧急程度"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部紧急度', value: '' },
                      { label: '🔴 急单', value: 'urgent' },
                      { label: '普通', value: 'normal' },
                    ]}
                  />
                  <Select
                    value={queryParams.merchandiser || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, merchandiser: value || undefined, page: 1 }))}
                    placeholder="跟单员"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ minWidth: 100 }}
                    options={[
                      { label: '全部跟单员', value: '' },
                      ...users.filter(u => u.name || u.username).map(u => ({ label: u.name || u.username, value: u.name || u.username })),
                    ]}
                  />
                </>
              )}
              right={(
                <Button
                  onClick={() => {
                    setQueryParams({ page: 1, pageSize: queryParams.pageSize, keyword: '' });
                    setDateRange(null);
                  }}
                >
                  重置
                </Button>
              )}
            />
          </Card>

          {showSmartErrorNotice && smartError ? (
            <Card size="small" className="mb-sm">
              <SmartErrorNotice
                error={smartError}
                onFix={() => {
                  void fetchOrders();
                }}
              />
            </Card>
          ) : null}

          {viewMode === 'list' ? (
            <ResizableTable
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading}
              columns={columns}
              dataSource={orders}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page: number, pageSize: number) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 3000 }}
            />
          ) : (
            <UniversalCardView
              dataSource={orders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                [{ label: '码数', key: 'size', render: (val: any) => val || '-' }, { label: '数量', key: 'orderQuantity', render: (val: any) => { const qty = Number(val) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
                [{ label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '剩', key: 'remainingDays', render: (val: any, record: any) => { const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string); return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>; } }]
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => getProgressColorStatus(record.plannedEndDate),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
                show: true,
                type: 'liquid',
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'print',
                  label: '打印',
                  iconOnly: true,
                  onClick: () => setPrintingRecord(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  label: '编辑',
                  onClick: () => handleQuickEdit(record),
                },
              ].filter(Boolean)}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as ProductionOrder).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
            />
          )}
        </>
      ) : (
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">生产进度</h2>
          </div>

          {/* 数据概览卡片 - 使用全局统计数据（不受分页影响，不受列设置控制） */}
          <PageStatCards
            activeKey={activeStatFilter}
            cards={[
              {
                key: 'all',
                items: [
                  { label: '订单个数', value: globalStats.totalOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '总数量', value: globalStats.totalQuantity, unit: '件', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('all'),
                activeColor: 'var(--color-primary)',
                activeBg: 'rgba(45, 127, 249, 0.1)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                  { label: '延期数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
                activeBg: 'rgba(239, 68, 68, 0.1)',
              },
              {
                key: 'today',
                items: [
                  { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '今日数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
                activeBg: 'rgba(45, 127, 249, 0.1)',
              },
            ]}
          />

          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <>
                  <StandardSearchBar
                    searchValue={String(queryParams.keyword || '')}
                    onSearchChange={(value) =>
                      setQueryParams((prev) => ({
                        ...prev,
                        page: 1,
                        keyword: value,
                        orderNo: undefined,
                        styleNo: undefined,
                        factoryName: undefined,
                      }))
                    }
                    searchPlaceholder="搜索订单号/款号/工厂"
                    dateValue={dateRange}
                    onDateChange={(value) => setDateRange(value)}
                    statusValue={String(queryParams.status || '')}
                    onStatusChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, status: value || undefined }))}
                    statusOptions={statusOptions}
                  />
                  <Select
                    value={queryParams.urgencyLevel || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, urgencyLevel: value || undefined, page: 1 }))}
                    placeholder="紧急程度"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部紧急度', value: '' },
                      { label: '🔴 急单', value: 'urgent' },
                      { label: '普通', value: 'normal' },
                    ]}
                  />
                  <Select
                    value={queryParams.merchandiser || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, merchandiser: value || undefined, page: 1 }))}
                    placeholder="跟单员"
                    allowClear
                    showSearch
                    optionFilterProp="label"
                    style={{ minWidth: 100 }}
                    options={[
                      { label: '全部跟单员', value: '' },
                      ...users.filter(u => u.name || u.username).map(u => ({ label: u.name || u.username, value: u.name || u.username })),
                    ]}
                  />
                </>
              )}
              right={(
                <Space>
                  <Button
                    onClick={() => fetchOrders()}
                  >
                    刷新
                  </Button>
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
                </Space>
              )}
            />
          </Card>

          {showSmartErrorNotice && smartError ? (
            <Card size="small" className="mb-sm">
              <SmartErrorNotice
                error={smartError}
                onFix={() => {
                  void fetchOrders();
                }}
              />
            </Card>
          ) : null}

          {viewMode === 'list' ? (
            <ResizableTable
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading}
              columns={columns}
              dataSource={orders}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page: number, pageSize: number) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 3000 }}
            />
          ) : (
            <UniversalCardView
              dataSource={orders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                [{ label: '码数', key: 'size', render: (val: any) => val || '-' }, { label: '数量', key: 'orderQuantity', render: (val: any) => { const qty = Number(val) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
                [{ label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '剩', key: 'remainingDays', render: (val: any, record: any) => { const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string); return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>; } }]
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => getProgressColorStatus(record.plannedEndDate),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
                show: true,
                type: 'liquid',
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'print',
                  label: '打印',
                  onClick: () => setPrintingRecord(record),
                },
                {
                  key: 'close',
                  label: '关单',
                  onClick: () => handleCloseOrder(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  label: '编辑',
                  onClick: () => handleQuickEdit(record),
                },
              ].filter(Boolean)}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as ProductionOrder).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
            />
          )}
        </Card>
      )}

      <ScanConfirmModal
        open={scanConfirmState.visible}
        loading={scanConfirmState.loading}
        remain={scanConfirmState.remain}
        detail={scanConfirmState.detail}
        onCancel={() => closeScanConfirm()}
        onSubmit={submitConfirmedScan}
      />

      {/* 备注异常 Modal */}
      <Modal
        title={<><ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 8 }} />备注异常</>}
        open={remarkPopoverId !== null}
        onCancel={() => { setRemarkPopoverId(null); setRemarkText(''); }}
        onOk={() => { if (remarkPopoverId) handleRemarkSave(remarkPopoverId); }}
        okText="保存"
        cancelText="取消"
        confirmLoading={remarkSaving}
        width={500}
        destroyOnClose
      >
        <Input.TextArea
          value={remarkText}
          onChange={(e) => setRemarkText(e.target.value)}
          rows={6}
          maxLength={200}
          showCount
          placeholder="请输入异常备注..."
          style={{ marginTop: 8 }}
        />
      </Modal>

      {/* 快速编辑弹窗 */}
      <QuickEditModal
        visible={quickEditVisible}
        loading={quickEditSaving}
        initialValues={{
          remarks: quickEditRecord?.remarks as string,
          expectedShipDate: quickEditRecord?.expectedShipDate as string,
        }}
        onSave={handleQuickEditSave}
        onCancel={() => {
          setQuickEditVisible(false);
          setQuickEditRecord(null);
        }}
      />

      {/* 打印预览弹窗 - 使用通用打印组件 */}
      <StylePrintModal
        visible={printModalVisible}
        onClose={closePrintModal}
        styleId={printingRecord?.styleId}
        orderId={printingRecord?.id}
        orderNo={printingRecord?.orderNo}
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.styleCover}
        color={printingRecord?.color}
        quantity={printingRecord?.orderQuantity}
        category={(printingRecord as any)?.category}
        mode="production"
        extraInfo={{
          '订单号': printingRecord?.orderNo,
          '订单数量': printingRecord?.orderQuantity,
          '加工厂': printingRecord?.factoryName,
          '跟单员': printingRecord?.merchandiser,
          '订单交期': printingRecord?.plannedEndDate,
        }}
        sizeDetails={printingRecord ? parseProductionOrderLines(printingRecord) : []}
      />

      {/* 节点详情弹窗 - 水晶球生产节点看板 */}
      <NodeDetailModal
        visible={nodeDetailVisible}
        onClose={closeNodeDetail}
        orderId={nodeDetailOrder?.id}
        orderNo={nodeDetailOrder?.orderNo}
        nodeType={nodeDetailType}
        nodeName={nodeDetailName}
        stats={nodeDetailStats}
        unitPrice={nodeDetailUnitPrice}
        processList={nodeDetailProcessList}
        onSaved={() => {
          void fetchOrders();
        }}
      />

    </div>
  );

  if (embedded) return pageContent;

  return <Layout>{pageContent}</Layout>;
};

export default ProgressDetail;
