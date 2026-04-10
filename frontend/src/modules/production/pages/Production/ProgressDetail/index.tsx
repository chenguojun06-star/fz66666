import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Modal, Select, Space } from 'antd';
import type { InputRef } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';

import UniversalCardView from '@/components/common/UniversalCardView';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';

import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageLayout from '@/components/common/PageLayout';

import { generateRequestId, isOrderFrozenByStatus, isOrderTerminal } from '@/utils/api';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { formatDateTimeCompact } from '@/utils/datetime';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { CuttingBundle, ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import { productionCuttingApi, productionOrderApi } from '@/services/production/productionApi';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import '../../../styles.css';

import {
  defaultNodes,
  stripWarehousingNode,
  findPricingProcessForStage,
  getCloseMinRequired,
  resolveNodesForListOrder,
  getCurrentWorkflowNodeForOrder,
} from './utils';
import { ProgressNode } from './types';

import SmartOrderHoverCard from './components/SmartOrderHoverCard';
import { ensureBoardStatsForOrder } from './hooks/useBoardStats';
import { useProgressData } from './hooks/useProgressData';
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
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { useQuickEdit } from './hooks/useQuickEdit';
import { useProgressFilters } from './hooks/useProgressFilters';
import { useProgressColumns } from './hooks/useProgressColumns';
import { useShareOrderDialog } from './hooks/useShareOrderDialog';
import { useFactoryShipment } from './hooks/useFactoryShipment';
import { useOrderFocus } from './hooks/useOrderFocus';
import { useLabelPrint } from './hooks/useLabelPrint';
import ProgressModals from './components/ProgressModals';
import ProgressAlerts from './components/ProgressAlerts';
import { useCardViewConfig } from './hooks/useCardViewConfig';
import { useStagnantDetection } from './hooks/useStagnantDetection';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useDeliveryRiskMap } from './hooks/useDeliveryRiskMap';
import MaterialShortageAlert from './components/MaterialShortageAlert';
import { useProductionBoardStore } from '@/stores';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { useBottleneckBanner } from './hooks/useBottleneckBanner';
import { useTemplateNodes } from './hooks/useTemplateNodes';
import { useScanExecution } from './hooks/useScanExecution';
import {
  fetchScanHistory as fetchScanHistoryHelper,
  fetchCuttingBundles as fetchCuttingBundlesHelper,
  fetchPricingProcesses as fetchPricingProcessesHelper,
} from './helpers/fetchers';
import { fetchNodeOperations } from './helpers/nodeOperations';
import { useLocation } from 'react-router-dom';
import { useProductionSmartQueue } from '../useProductionSmartQueue';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';

type ProgressDetailProps = {
  embedded?: boolean;
};

const ProgressDetail: React.FC<ProgressDetailProps> = ({ embedded }) => {
  const { message } = App.useApp();
  const location = useLocation();
  const { factoryTypeOptions } = useOrganizationFilterOptions();
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUserFn(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const [smartQueueFilter, setSmartQueueFilter] = useState<'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue'>('all');

  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });

  // ── 工厂发货 ──
  const {
    shipModalOpen, setShipModalOpen, shipModalOrder, shipForm, shipLoading,
    shippableInfo, shipDetails, setShipDetails, handleFactoryShip, handleShipSubmit,
  } = useFactoryShipment({ message });

  // ── 筛选 / 排序 / 统计卡片 ──────────────────────────────────────
  const {
    queryParams, setQueryParams,
    dateRange, setDateRange,
    viewMode, setViewMode,
    activeStatFilter,
    orderSortField, orderSortOrder,
    statusOptions,
    handleOrderSort, handleStatClick,
    dateSortAsc, toggleDateSort,
  } = useProgressFilters();

  // ── 订单聚焦/滚动/智能导航 ──（依赖 viewMode，必须在 useProgressFilters 之后）
  const {
    pendingScrollOrderId, setPendingScrollOrderId,
    focusedOrderId,
    pendingFocusNode, setPendingFocusNode,
    focusedOrderNos: _focusedOrderNos, setFocusedOrderNos,
    focusedOrderNosRef,
    getOrderDomKey, triggerOrderFocus,
    normalizeFocusNodeName, getFocusNodeType,
    clearSmartFocus, scrollToFocusedOrder,
  } = useOrderFocus(viewMode);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = String(params.get('styleNo') || '').trim();
    const orderNo = String(params.get('orderNo') || '').trim();
    const orderNos = String(params.get('orderNos') || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const mergedOrderNos = Array.from(new Set(orderNo ? [orderNo, ...orderNos] : orderNos));
    const focusNode = normalizeFocusNodeName(String(params.get('focusNode') || '').trim());
    setFocusedOrderNos(mergedOrderNos);
    // URL filter 参数 → 激活对应智能队列筛选（如 ?filter=overdue 触发逾期筛选）
    const filterParam = String(params.get('filter') || '').trim();
    if (['overdue', 'urgent', 'behind', 'stagnant'].includes(filterParam)) {
      setSmartQueueFilter(filterParam as 'overdue' | 'urgent' | 'behind' | 'stagnant');
    }
    if (styleNo || orderNo || mergedOrderNos.length > 0) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        pageSize: mergedOrderNos.length > 0 ? 200 : prev.pageSize,
        styleNo: styleNo || prev.styleNo,
        keyword: mergedOrderNos.length > 0 ? undefined : (orderNo || prev.keyword),
      }));
    }
    if (orderNo && focusNode) {
      setPendingFocusNode({ orderNo, nodeName: focusNode });
    }
  }, [location.search, normalizeFocusNodeName, setQueryParams]);

  // ── 订单数据（委托 useProgressData hook）──────────────────────
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  // ref 版：传给 ensureBoardStatsForOrder，避免放入 useEffect 依赖导致无限循环
  const boardStatsByOrderRef = useRef(boardStatsByOrder);
  const boardStatsLoadingByOrderRef = useRef(boardStatsLoadingByOrder);
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { boardStatsLoadingByOrderRef.current = boardStatsLoadingByOrder; }, [boardStatsLoadingByOrder]);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const mergeProcessDataForOrder = useProductionBoardStore((s) => s.mergeProcessDataForOrder);

  const {
    loading, total, orders, sortedOrders, setOrders: _setOrders,
    smartError, setSmartError: _setSmartError, globalStats, setGlobalStats: _setGlobalStats,
    progressNodesByStyleNo, setProgressNodesByStyleNo, progressNodesByStyleNoRef: _progressNodesByStyleNoRef,
    showSmartErrorNotice, fetchOrders, fetchGlobalStats: _fetchGlobalStats, reportSmartError: _reportSmartError,
  } = useProgressData({ queryParams, dateRange, dateSortAsc, focusedOrderNosRef, clearAllBoardCache });

  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [nodeOps, setNodeOps] = useState<Record<string, any>>({});

  // ── 工序节点 Workflow ─────────────────────────────────────────
  const [nodes, setNodes] = useState<ProgressNode[]>(defaultNodes);
  const [nodeWorkflowLocked, setNodeWorkflowLocked] = useState(false);
  const [, setNodeWorkflowDirty] = useState(false);

  // ─────── 工序瓶颈检测 ───────
  const { bottleneckItems, bottleneckBannerVisible, setBottleneckBannerVisible } = useBottleneckBanner(orders);

  /** 自动刷新计时器：每 2 分钟递增，触发 boardStats 过期重拉 */
  const [boardRefreshTick, setBoardRefreshTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBoardRefreshTick(t => t + 1), 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  /** 卡片进度 — 委托给统一工具函数 */
  const calcCardProgress = useCallback(
    (record: ProductionOrder): number =>
      calcOrderProgress(record, boardStatsByOrder[String(record.id || '')] ?? null),
    [boardStatsByOrder],
  );

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

  // ===== 打印标签（洗水唛/吊牌）=====
  const { labelPrintOpen, labelPrintOrder, labelPrintStyle, handlePrintLabel, closeLabelPrint } = useLabelPrint();

  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');
  const [remarkMerchandiser, setRemarkMerchandiser] = useState<string | undefined>();
  const openRemarkModal = useCallback((orderNo: string, merchandiser?: string) => {
    setRemarkOrderNo(orderNo);
    setRemarkMerchandiser(merchandiser);
    setRemarkModalOpen(true);
  }, []);
  const {
    quickEditVisible, quickEditRecord, quickEditSaving,
    setQuickEditVisible, setQuickEditRecord,
    handleQuickEdit, handleQuickEditSave,
  } = useQuickEdit({ message, fetchOrders: () => fetchOrders() });

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);

  // ── 模板函数 ─────────────────────────────────────────────────────
  const { fetchTemplateNodes: _fetchTemplateNodes, ensureNodesFromTemplateIfNeeded } = useTemplateNodes({ setNodes, setProgressNodesByStyleNo });

  useEffect(() => {
    if (!orders.length) return;
    const queue = orders.slice(0, Math.min(20, orders.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o, progressNodesByStyleNo, defaultNodes));
        // 计算每个父节点下期望的子工序数（使用已应用remap后的节点）
        const cpcMap: Record<string, number> = {};
        for (const s of ns) {
          const parent = String(s.progressStage || s.name || '').trim();
          if (parent) cpcMap[parent] = (cpcMap[parent] || 0) + 1;
        }
        await ensureBoardStatsForOrder({
          order: o,
          nodes: ns,
          childProcessCountByNode: Object.keys(cpcMap).length > 0 ? cpcMap : undefined,
          boardStatsByOrder: boardStatsByOrderRef.current,
          boardStatsLoadingByOrder: boardStatsLoadingByOrderRef.current,
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
    boardRefreshTick, // 每 2 分钟递增，触发 TTL 过期的 boardStats 重新拉取
    // boardStatsByOrder/boardStatsLoadingByOrder 通过 ref 传入，不放依赖数组，避免每次 store 更新都触发重刷
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

  useOpenScan({
    isOrderFrozenByStatus,
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

  useSubmitScan({
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

  const { submitConfirmedScan, closeScanConfirm } = useScanExecution({
    scanConfirmState, closeScanConfirmState, setScanConfirmLoading,
    activeOrder, message, submitScanFeedback, progressNodesByStyleNo, nodes,
    cuttingBundles, updateOrderProgress, fetchScanHistory, fetchOrders,
    scanForm, scanInputRef, setScanSubmitting, scanSubmittingRef, lastFailedRequestRef,
  });

  const { handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder } = useCloseOrder({
    isSupervisorOrAbove,
    message,
    productionOrderApi,
    fetchOrders,
    fetchOrderDetail,
    setActiveOrder,
    activeOrderId: activeOrder?.id,
    getCloseMinRequired,
  });

  // ── 卡片视图统一 actions / titleTags ──
  const { cardActions, titleTags } = useCardViewConfig({
    isOrderFrozenByStatus, setPrintingRecord,
    handlePrintLabel, handleFactoryShip, handleQuickEdit,
    handleShareOrder, handleCloseOrder,
    isFactoryAccount, canManageOrderLifecycle, embedded: !!embedded,
  });

  // ── 停滞订单检测（≥3天无新扫码）─────────────────────────────────────
  const stagnantOrderIds = useStagnantDetection(orders, boardTimesByOrder);
  const stagnantOrderIdSet = useMemo(() => new Set(stagnantOrderIds.keys()), [stagnantOrderIds]);

  // ── AI 交期风险地图（后台静默加载，5分钟缓存）────────────────────────
  const hasActiveOrders = orders.some(o => o.status !== 'completed');
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);

  // ── 分享订单给客户追踪链接（30天有效）────────────────────────────────

  const {
    smartQueueOrders,
    smartActionItems,
  } = useProductionSmartQueue({
    orders,
    deliveryRiskMap,
    stagnantOrderIds: stagnantOrderIdSet,
    smartQueueFilter,
    setSmartQueueFilter,
    triggerOrderFocus,
    clearFocus: clearSmartFocus,
  });

  const sortedSmartQueueOrders = useMemo(() => {
    return [...smartQueueOrders].sort((a, b) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [smartQueueOrders, dateSortAsc]);

  useEffect(() => {
    if (!pendingScrollOrderId) return;
    const currentRecords = smartQueueFilter === 'all'
      ? orders
      : smartQueueOrders;
    const exists = currentRecords.some((record) => getOrderDomKey(record) === pendingScrollOrderId);
    if (!exists) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedOrder(pendingScrollOrderId)) {
        setPendingScrollOrderId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [getOrderDomKey, orders, pendingScrollOrderId, scrollToFocusedOrder, smartQueueFilter, smartQueueOrders, viewMode]);

  useEffect(() => {
    if (!pendingFocusNode) return;
    const targetOrder = orders.find((record) => String(record.orderNo || '').trim() === pendingFocusNode.orderNo);
    if (!targetOrder) return;

    const orderId = String(targetOrder.id || '').trim();
    if (orderId && boardStatsLoadingByOrder[orderId]) return;

    const resolvedNodes = stripWarehousingNode(resolveNodesForListOrder(targetOrder, progressNodesByStyleNo, defaultNodes));
    const matchedNode = resolvedNodes.find((node) => {
      const nodeName = normalizeFocusNodeName(String(node.name || node.progressStage || '').trim());
      const progressStageName = normalizeFocusNodeName(String(node.progressStage || '').trim());
      return nodeName === pendingFocusNode.nodeName || progressStageName === pendingFocusNode.nodeName;
    });
    const resolvedNodeName = String(matchedNode?.name || pendingFocusNode.nodeName).trim();
    const statsMap = boardStatsByOrder[orderId] || {};
    const matchedStatKey = Object.keys(statsMap).find((key) => normalizeFocusNodeName(key) === pendingFocusNode.nodeName);
    const completedQty = Number(statsMap[matchedStatKey || resolvedNodeName] || 0);
    const totalQty = Number(targetOrder.cuttingQuantity || targetOrder.orderQuantity) || 0;
    const percent = totalQty > 0 ? Math.min(100, Math.round((completedQty / totalQty) * 100)) : 0;
    const remaining = Math.max(0, totalQty - completedQty);

    triggerOrderFocus(targetOrder);
    openNodeDetail(
      targetOrder,
      String(matchedNode?.progressStage || getFocusNodeType(resolvedNodeName) || pendingFocusNode.nodeName),
      resolvedNodeName,
      { done: completedQty, total: totalQty, percent, remaining },
      matchedNode?.unitPrice,
      resolvedNodes
        .filter((node) => {
          const ps = String((node as any).progressStage || '').trim();
          return ps === resolvedNodeName;
        })
        .map((node) => ({
          id: String(node.id || '').trim() || undefined,
          processCode: String(node.id || '').trim() || undefined,
          name: node.name,
          unitPrice: node.unitPrice,
        }))
    );
    setPendingFocusNode(null);
  }, [
    boardStatsByOrder,
    boardStatsLoadingByOrder,
    defaultNodes,
    getFocusNodeType,
    normalizeFocusNodeName,
    openNodeDetail,
    orders,
    pendingFocusNode,
    progressNodesByStyleNo,
    triggerOrderFocus,
  ]);

  // ── 表格列定义 ─────────────────────────────────────────────────────
  const { columns } = useProgressColumns({
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, handlePrintLabel, setQuickEditRecord, setQuickEditVisible,
    openRemarkModal,
    stagnantOrderIds,
    deliveryRiskMap,
    onShareOrder: handleShareOrder,
    isFactoryAccount,
    onFactoryShip: handleFactoryShip,
    canManageOrderLifecycle,
  });
  const { columns: cardColumns } = useCardGridLayout(10);
  const productionCardFieldGroups = useMemo(() => [
    ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
      gridKey: 'cardColorSizeGrid',
      getItems: (record) => getOrderCardSizeQuantityItems(record),
      getFallbackColor: (record) => String(record.color || '').trim(),
      getFallbackSize: (record) => String(record.size || '').trim(),
      getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
    }),
    [
      { label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' },
      { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' },
      { label: '剩', key: 'remainingDays', render: (_val: any, record: any) => { const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string); return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>; } },
    ],
  ], []);
  const productionCardProgressConfig = useMemo(() => ({
    calculate: calcCardProgress,
    getStatus: (record: ProductionOrder) => (isOrderFrozenByStatus(record) ? 'default' : getProgressColorStatus(record.plannedEndDate)),
    isCompleted: (record: ProductionOrder) => record.status === 'completed',
    minVisiblePercent: (record: ProductionOrder) => String(record.status || '').trim().toLowerCase() === 'in_progress' ? 5 : 0,
    show: true,
    type: 'liquid' as const,
  }), [calcCardProgress, isOrderFrozenByStatus]);

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
                    onStatusChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, status: value || undefined, includeScrapped: value === 'scrapped' ? true : undefined, excludeTerminal: value ? undefined : true }))}
                    statusOptions={statusOptions}
                  />
                  <Select
                    value={queryParams.factoryType || ''}
                    onChange={(value) =>
                      setQueryParams((prev) => ({
                        ...prev,
                        factoryType: (value || undefined) as ProductionQueryParams['factoryType'],
                        page: 1,
                      }))
                    }
                    placeholder="内外标签"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={factoryTypeOptions}
                  />
                  <Select
                    value={queryParams.urgencyLevel || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, urgencyLevel: value || undefined, page: 1 }))}
                    placeholder="紧急程度"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部紧急度', value: '' },
                      { label: ' 急单', value: 'urgent' },
                      { label: '普通', value: 'normal' },
                    ]}
                  />
                </>
              )}
              right={(
                <Button
                  onClick={() => {
                    setQueryParams({ page: 1, pageSize: queryParams.pageSize, keyword: '', includeScrapped: undefined, excludeTerminal: true });
                    setDateRange(null);
                  }}
                >
                  重置
                </Button>
              )}
            />
          </Card>

          <ProgressAlerts
            showSmartErrorNotice={showSmartErrorNotice}
            smartError={smartError}
            onFixError={() => { void fetchOrders(); }}
            bottleneckBannerVisible={bottleneckBannerVisible}
            bottleneckItems={bottleneckItems}
            setBottleneckBannerVisible={setBottleneckBannerVisible}
          />

          <MaterialShortageAlert />

          {/* 数据概览卡片 - 我的订单也能看到全局统计 */}
          <PageStatCards
            activeKey={activeStatFilter}
            cards={[
              {
                key: 'production',
                items: [
                  { label: '生产订单', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
                  { label: '生产数量', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('production'),
                activeColor: 'var(--color-primary)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                  { label: '延期数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
              },
              {
                key: 'today',
                items: [
                  { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '今日数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
              },
            ]}
          />

          {viewMode === 'list' ? (
            <ResizableTable
              className="production-progress-list-table"
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading && orders.length === 0}
              columns={columns}
              dataSource={sortedOrders}
              resizableColumns={false}
              maxColumnWidth={1600}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                onChange: (page: number, pageSize: number) => {
                  savePageSize(pageSize);
                  setQueryParams((prev) => ({ ...prev, page, pageSize }));
                },
              }}
              scroll={{ x: 3000 }}
              stickyHeader
            />
          ) : (
            <>
            <UniversalCardView
              dataSource={sortedOrders}
              loading={loading && orders.length === 0}
              columns={cardColumns}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={productionCardFieldGroups}
              progressConfig={productionCardProgressConfig}
              actions={cardActions}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={titleTags}
            />
            <StandardPagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={total}
              wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
              showQuickJumper={false}
              onChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams((prev) => ({ ...prev, page, pageSize }));
              }}
            />
            </>
          )}
        </>
      ) : (
        <PageLayout
          title="工序跟进"
          headerContent={
            <PageStatCards
              activeKey={activeStatFilter}
              cards={[
                {
                  key: 'production',
                  items: [
                    { label: '生产订单', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
                    { label: '生产数量', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
                  ],
                  onClick: () => handleStatClick('production'),
                  activeColor: 'var(--color-primary)',
                },
                {
                  key: 'delayed',
                  items: [
                    { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                    { label: '延期数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                  ],
                  onClick: () => handleStatClick('delayed'),
                  activeColor: 'var(--color-danger)',
                },
                {
                  key: 'today',
                  items: [
                    { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                    { label: '今日数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                  ],
                  onClick: () => handleStatClick('today'),
                  activeColor: 'var(--color-primary)',
                },
              ]}
              hints={smartActionItems.map((item) => ({ ...item, count: item.value }))}
              onClearHints={smartQueueFilter !== 'all' ? () => setSmartQueueFilter('all') : undefined}
            />
          }
          filterLeft={
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
                    onStatusChange={(value) => setQueryParams((prev) => ({ ...prev, page: 1, status: value || undefined, includeScrapped: value === 'scrapped' ? true : undefined, excludeTerminal: value ? undefined : true }))}
                    statusOptions={statusOptions}
                  />
                  <Select
                    value={queryParams.factoryType || ''}
                    onChange={(value) =>
                      setQueryParams((prev) => ({
                        ...prev,
                        factoryType: (value || undefined) as ProductionQueryParams['factoryType'],
                        page: 1,
                      }))
                    }
                    placeholder="内外标签"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={factoryTypeOptions}
                  />
                  <Select
                    value={queryParams.urgencyLevel || ''}
                    onChange={(value) => setQueryParams((prev) => ({ ...prev, urgencyLevel: value || undefined, page: 1 }))}
                    placeholder="紧急程度"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部紧急度', value: '' },
                      { label: ' 急单', value: 'urgent' },
                      { label: '普通', value: 'normal' },
                    ]}
                  />
            </>
          }
          filterRight={
            <Space>
                  <Button
                    onClick={() => fetchOrders()}
                  >
                    刷新
                  </Button>
                  <Button
                    icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                    onClick={toggleDateSort}
                    title={dateSortAsc ? '按时间升序（最早在前）' : '按时间降序（最新在前）'}
                    shape="circle"
                    size="small"
                  />
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
            </Space>
          }
        >

          <ProgressAlerts
            showSmartErrorNotice={showSmartErrorNotice}
            smartError={smartError}
            onFixError={() => { void fetchOrders(); }}
            bottleneckBannerVisible={bottleneckBannerVisible}
            bottleneckItems={bottleneckItems}
            setBottleneckBannerVisible={setBottleneckBannerVisible}
          />

          {viewMode === 'list' ? (
            <ResizableTable
              className="production-progress-list-table"
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading && orders.length === 0}
              columns={columns}
              dataSource={sortedSmartQueueOrders}
              showHeader={false}
              resizableColumns={false}
              maxColumnWidth={1600}
              rowClassName={(record: ProductionOrder) => getOrderDomKey(record) === focusedOrderId ? 'smart-order-focus-row' : ''}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                onChange: (page: number, pageSize: number) => {
                  savePageSize(pageSize);
                  setQueryParams((prev) => ({ ...prev, page, pageSize }));
                },
              }}
              scroll={{ x: 'max-content' }}
            />
          ) : (
            <>
            <UniversalCardView
              dataSource={smartQueueFilter === 'all' ? sortedOrders : sortedOrders.filter((o) => smartQueueOrders.some((s) => String(s.id || '') === String(o.id || '')))
}
              loading={loading && orders.length === 0}
              columns={cardColumns}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={productionCardFieldGroups}
              progressConfig={productionCardProgressConfig}
              getCardId={(record) => `progress-order-card-${getOrderDomKey(record as ProductionOrder)}`}
              getCardStyle={(record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? {
                boxShadow: '0 0 0 2px rgba(24, 144, 255, 0.28), 0 10px 24px rgba(24, 144, 255, 0.18)',
                transform: 'translateY(-2px)',
              } : undefined}
              actions={cardActions}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={titleTags}
            />
            <StandardPagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={total}
              wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
              showQuickJumper={false}
              onChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams((prev) => ({ ...prev, page, pageSize }));
              }}
            />
            </>
          )}
        </PageLayout>
      )}

      <ProgressModals
        scanConfirmState={scanConfirmState}
        closeScanConfirm={closeScanConfirm}
        submitConfirmedScan={submitConfirmedScan}
        shipModalOpen={shipModalOpen}
        shipModalOrder={shipModalOrder}
        shippableInfo={shippableInfo}
        shipDetails={shipDetails}
        onShipDetailsChange={setShipDetails}
        shipForm={shipForm}
        shipLoading={shipLoading}
        handleShipSubmit={handleShipSubmit}
        setShipModalOpen={setShipModalOpen}
        shareOrderDialog={shareOrderDialog}

        quickEditVisible={quickEditVisible}
        quickEditSaving={quickEditSaving}
        quickEditRecord={quickEditRecord}
        handleQuickEditSave={handleQuickEditSave}
        setQuickEditVisible={setQuickEditVisible}
        setQuickEditRecord={setQuickEditRecord}
        labelPrintOpen={labelPrintOpen}
        closeLabelPrint={closeLabelPrint}
        labelPrintOrder={labelPrintOrder}
        labelPrintStyle={labelPrintStyle}
        printModalVisible={printModalVisible}
        closePrintModal={closePrintModal}
        printingRecord={printingRecord}
        nodeDetailVisible={nodeDetailVisible}
        closeNodeDetail={closeNodeDetail}
        nodeDetailOrder={nodeDetailOrder}
        nodeDetailType={nodeDetailType}
        nodeDetailName={nodeDetailName}
        nodeDetailStats={nodeDetailStats}
        nodeDetailUnitPrice={nodeDetailUnitPrice}
        nodeDetailProcessList={nodeDetailProcessList}
        fetchOrders={fetchOrders}
        pendingCloseOrder={pendingCloseOrder}
        closeOrderLoading={closeOrderLoading}
        confirmCloseOrder={confirmCloseOrder}
        cancelCloseOrder={cancelCloseOrder}
      />

      <RemarkTimelineModal
        open={remarkModalOpen}
        onClose={() => setRemarkModalOpen(false)}
        targetType="order"
        targetNo={remarkOrderNo}
        canAddRemark={isSupervisorOrAbove || isFactoryAccount || (!!user?.username && user.username === remarkMerchandiser)}
      />

    </div>
  );

  if (embedded) return pageContent;

  return <Layout>{pageContent}</Layout>;
};

export default ProgressDetail;
