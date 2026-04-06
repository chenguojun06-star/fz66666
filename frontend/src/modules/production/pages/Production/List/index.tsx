import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button, Card, Input, Select, Tag, App, Popover, Checkbox, Tabs, Segmented } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined, RadarChartOutlined } from '@ant-design/icons';
import ExternalFactorySmartView from '../ExternalFactory/ExternalFactorySmartView';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';

import StandardSearchBar from '@/components/common/StandardSearchBar';
import PageLayout from '@/components/common/PageLayout';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import LabelPrintModal from './components/LabelPrintModal';
import SubProcessRemapModal from './components/SubProcessRemapModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { useSubProcessRemap } from './hooks/useSubProcessRemap';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import api, {
  hasProcurementStage,
  parseProductionOrderLines,
  isApiSuccess,
  isOrderFrozenByStatus,
  isOrderTerminal,
} from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { Dayjs } from 'dayjs';
import '../../../styles.css';
import dayjs from 'dayjs';
import UniversalCardView from '@/components/common/UniversalCardView';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { ensureBoardStatsForOrder, clearBoardStatsTimestamps } from '../ProgressDetail/hooks/useBoardStats';
import { getDynamicParentMapping, setDynamicParentMapping } from '../ProgressDetail/utils';
import { processParentMappingApi } from '@/services/production/productionApi';
import { useDeliveryRiskMap } from '../ProgressDetail/hooks/useDeliveryRiskMap';
import { useShareOrderDialog } from '../ProgressDetail/hooks/useShareOrderDialog';
import { useStagnantDetection } from '../ProgressDetail/hooks/useStagnantDetection';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { AnomalyItem } from '@/services/intelligence/intelligenceApi';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import ExportButton from '@/components/common/ExportButton';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import type { ProgressNode } from '../ProgressDetail/types';
import { DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE_OPTIONS, readPageSize, savePageSize } from '@/utils/pageSizeStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useModal } from '@/hooks';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import { usePersistentSort } from '@/hooks/usePersistentSort';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import {
  useColumnSettings,
  useProductionTransfer,
  useProcessDetail,
  useProductionActions,
  useProgressTracking,
  useProductionStats,
  useProductionColumns,
} from './hooks';
import { safeString } from './utils';
import TransferOrderModal from './TransferOrderModal';
import AnomalyBanner from './AnomalyBanner';
import { useProductionBoardStore } from '@/stores';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useProductionSmartQueue } from '../useProductionSmartQueue';

const LIST_VIEW_MODE_STORAGE_KEY = 'production_list_view_mode';

// 悬停卡预加载用的默认工序节点（与 SmartOrderHoverCard STAGES_DEF 对应）
const DEFAULT_HOVER_NODES: ProgressNode[] = [
  { id: '采购', name: '采购' },
  { id: '裁剪', name: '裁剪' },
  { id: '车缝', name: '车缝' },
  { id: '质检', name: '质检' },
  { id: '入库', name: '入库' },
];

const ProductionList: React.FC = () => {
  const { message } = App.useApp();
  useViewport();
  const { columns: cardColumns } = useCardGridLayout(10);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });
  const quickEditModal = useModal<ProductionOrder>();
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string }>({ open: false, orderNo: '' });
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const navigate = useNavigate();
  const location = useLocation();
  const { factoryTypeOptions } = useOrganizationFilterOptions();

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  // ===== 打印标签（洗水唛/吊牌）状态 =====
  const [labelPrintOpen, setLabelPrintOpen] = useState(false);
  const [labelPrintOrder, setLabelPrintOrder] = useState<ProductionOrder | null>(null);
  const [labelPrintStyle, setLabelPrintStyle] = useState<{
    fabricComposition?: string;
    fabricCompositionParts?: string;
    washInstructions?: string;
    uCode?: string;
    washTempCode?: string;
    bleachCode?: string;
    tumbleDryCode?: string;
    ironCode?: string;
    dryCleanCode?: string;
  } | null>(null);

  // ===== NodeDetailModal 状态（进度球点击弹窗）=====
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailOrder, setNodeDetailOrder] = useState<ProductionOrder | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState('');
  const [nodeDetailName, setNodeDetailName] = useState('');
  const [nodeDetailStats, setNodeDetailStats] = useState<{ done: number; total: number; percent: number; remaining: number } | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<any[]>([]);

  const openNodeDetail = useCallback((
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: any[]
  ) => {
    setNodeDetailOrder(order);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailVisible(true);
  }, []);

  const closeNodeDetail = useCallback(() => {
    setNodeDetailVisible(false);
    setNodeDetailOrder(null);
  }, []);

  const handlePrintLabel = async (record: ProductionOrder) => {
    setLabelPrintOrder(record);
    setLabelPrintStyle(null);
    setLabelPrintOpen(true);
    if (record.styleId || record.styleNo) {
      const styleInfo = await getStyleInfoByRef(record.styleId, record.styleNo);
      const d = styleInfo ?? {};
      setLabelPrintStyle({
        fabricComposition: d.fabricComposition,
        fabricCompositionParts: d.fabricCompositionParts,
        washInstructions: d.washInstructions,
        uCode: d.uCode,
        washTempCode: d.washTempCode,
        bleachCode: d.bleachCode,
        tumbleDryCode: d.tumbleDryCode,
        ironCode: d.ironCode,
        dryCleanCode: d.dryCleanCode,
      });
    }
  };

  // ===== 查询参数 =====
  // 跨页跳转精准定位：组件 mount 时就从 URL 读取 orderNo，避免初始 fetch 与 URL params effect 之间的竞态条件
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>(() => {
    const initSearch = new URLSearchParams(window.location.search);
    const initOrderNo = initSearch.get('orderNo') || '';
    return {
      page: 1, pageSize: readPageSize(DEFAULT_PAGE_SIZE), includeScrapped: true, excludeTerminal: false,
      ...(initOrderNo ? { keyword: initOrderNo } : {}),
    };
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const { sortField, sortOrder, handleSort } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'production-list',
    defaultField: 'createTime',
    defaultOrder: 'desc',
  });
  // ===== 数据状态 =====
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewModeState] = useState<'list' | 'card' | 'smart'>(
    () => (localStorage.getItem(LIST_VIEW_MODE_STORAGE_KEY) as 'list' | 'card' | 'smart') || 'list'
  );
  const setViewMode = (mode: 'list' | 'card' | 'smart') => {
    localStorage.setItem(LIST_VIEW_MODE_STORAGE_KEY, mode);
    setViewModeState(mode);
    // 无论切到哪个视图，都只重置页码，pageSize 由用户自己选择（不强制覆盖）
    setQueryParams(prev => ({ ...prev, page: 1 }));
  };
  const [showDelayedOnly, setShowDelayedOnly] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState<'production' | 'delayed' | 'today'>('production');
  const [smartQueueFilter, setSmartQueueFilter] = useState<'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue'>('all');
  const [pendingScrollOrderId, setPendingScrollOrderId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const focusClearTimerRef = useRef<number | null>(null);

  // AI 交期风险数据（背景静默加载，不阻塞表格渲染）
  const hasActiveOrders = useMemo(() => productionList.some(o => o.status !== 'completed'), [productionList]);
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);

  // ===== 异常检测 Banner =====
  const [anomalyItems, setAnomalyItems] = useState<AnomalyItem[]>([]);
  const [anomalyBannerVisible, setAnomalyBannerVisible] = useState(false);
  const anomalyFetched = useRef(false);

  const fetchAnomalies = useCallback(async () => {
    if (anomalyFetched.current || !isSmartFeatureEnabled('smart.production.precheck.enabled')) return;
    anomalyFetched.current = true;
    try {
      const res = await intelligenceApi.detectAnomalies() as any;
      const items: AnomalyItem[] = res?.data?.items ?? res?.items ?? [];
      const significant = items.filter(i => i.severity === 'critical' || i.severity === 'warning');
      if (significant.length > 0) {
        setAnomalyItems(significant);
        setAnomalyBannerVisible(true);
      }
    } catch { /* silent — 不阻塞主列表 */ }
  }, []);
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);
  const mergeProcessDataForOrder = useProductionBoardStore((s) => s.mergeProcessDataForOrder);
  // ref 版：避免放入 useEffect 依赖导致无限循环
  const boardStatsByOrderRef = useRef(boardStatsByOrder);
  const boardStatsLoadingByOrderRef = useRef(boardStatsLoadingByOrder);
  useEffect(() => { boardStatsByOrderRef.current = boardStatsByOrder; }, [boardStatsByOrder]);
  useEffect(() => { boardStatsLoadingByOrderRef.current = boardStatsLoadingByOrder; }, [boardStatsLoadingByOrder]);

  // 卡片进度：取 boardStats 实时数据与 productionProgress DB值 的较大值，
  // 但仅下单、无任何采购/裁剪/生产动作时，真实显示值必须是 0。
  const calcCardProgress = useCallback((record: ProductionOrder): number => {
    const dbProgress = Math.min(100, Math.max(0, Number(record.productionProgress) || 0));
    if (record.status === 'completed') return 100;
    if (isOrderFrozenByStatus(record)) return dbProgress;
    const orderId = String(record.id || '');
    const stats = boardStatsByOrder[orderId];
    const hasProcurementAction = Boolean(record.procurementManuallyCompleted)
      || Boolean(record.procurementConfirmedAt)
      || (Number(record.materialArrivalRate) || 0) > 0;
    const hasCuttingAction = (Number(record.cuttingCompletionRate) || 0) > 0
      || (Number(record.cuttingQuantity) || 0) > 0;
    const hasBoardAction = !!stats && Object.values(stats as Record<string, number>)
      .some((value) => (Number(value) || 0) > 0);
    const hasRealAction = hasProcurementAction || hasCuttingAction || hasBoardAction;
    if (!hasRealAction) return 0;
    if (!stats) return dbProgress;
    const total = Math.max(1, Number(record.cuttingQuantity || record.orderQuantity) || 1);
    const PIPELINE = hasProcurementStage(record as any)
      ? ['采购', '裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库']
      : ['裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库'];
    const normalizeKey = (k: string) => {
      if (k.includes('入库') || k.includes('入仓')) return '入库';
      if (k.includes('质检') || k.includes('品检') || k.includes('验货')) return '质检';
      if (k.includes('包装') || k.includes('后整') || k.includes('打包')) return '包装';
      if (k.includes('裁剪') || k.includes('裁床')) return '裁剪';
      if (k.includes('车缝') || k.includes('车间')) return '车缝';
      return k;
    };
    const normMap = new Map<string, number>();
    for (const [rawKey, rawQty] of Object.entries(stats as Record<string, number>)) {
      const nk = normalizeKey(rawKey);
      const pct = Math.min(100, Math.round(Number(rawQty) / total * 100));
      if (pct > 0) normMap.set(nk, Math.max(normMap.get(nk) ?? 0, pct));
    }
    if (normMap.size === 0) return dbProgress;
    let lastIdx = -1;
    let lastPct = 0;
    for (const [nk, pct] of normMap.entries()) {
      const idx = PIPELINE.indexOf(nk);
      if (idx > lastIdx || (idx === lastIdx && pct > lastPct)) {
        lastIdx = idx;
        lastPct = pct;
      }
    }
    if (lastIdx < 0) return dbProgress;
    const perStage = 100 / PIPELINE.length;
    const boardProgress = Math.round(lastIdx * perStage + lastPct * perStage / 100);
    return Math.min(100, Math.max(dbProgress, boardProgress));
  }, [boardStatsByOrder]);

  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const getOrderDomKey = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    return String(record?.id || record?.orderNo || '').trim();
  }, []);

  const triggerOrderFocus = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    const key = getOrderDomKey(record);
    if (!key) return;
    setPendingScrollOrderId(key);
  }, [getOrderDomKey]);

  const clearSmartFocus = useCallback(() => {
    setFocusedOrderId(null);
    setPendingScrollOrderId(null);
  }, []);

  // 停滞检测：返回 Map<orderId, stagnantDays>，与生产进度页保持一致
  const stagnantOrderIds = useStagnantDetection(productionList, boardTimesByOrder);

  const {
    smartActionItems,
    smartQueueOrders,
  } = useProductionSmartQueue({
    orders: productionList,
    deliveryRiskMap,
    stagnantOrderIds,
    smartQueueFilter,
    setSmartQueueFilter,
    triggerOrderFocus,
    clearFocus: clearSmartFocus,
  });

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  const resolveAnomalyTargetOrder = useCallback((item: AnomalyItem) => {
    const targetName = String(item.targetName || '').trim();
    const description = String(item.description || '').trim();
    const candidateTexts = [targetName, description].filter(Boolean);
    const orderNoPattern = /[A-Z]{1,6}\d{6,}/g;

    for (const text of candidateTexts) {
      const matches = text.match(orderNoPattern) || [];
      for (const match of matches) {
        const order = productionList.find((record) => String(record.orderNo || '').trim() === match);
        if (order) return order;
      }
      const exactOrder = productionList.find((record) => String(record.orderNo || '').trim() === text);
      if (exactOrder) return exactOrder;
    }

    const factoryMatchedOrder = productionList.find((record) => {
      const factoryName = String(record.factoryName || '').trim();
      return !!factoryName && !!targetName && (factoryName === targetName || targetName.includes(factoryName) || factoryName.includes(targetName));
    });
    if (factoryMatchedOrder) return factoryMatchedOrder;

    return null;
  }, [productionList]);

  const handleAnomalyClick = useCallback((item: AnomalyItem) => {
    const targetOrder = resolveAnomalyTargetOrder(item);
    if (!targetOrder) {
      message.info(`暂未匹配到“${item.targetName}”对应订单`);
      return;
    }

    const targetOrderNo = String(targetOrder.orderNo || '').trim();
    if (item.type === 'quality_spike' && targetOrderNo) {
      navigate(`/production/progress-detail?orderNo=${encodeURIComponent(targetOrderNo)}&focusNode=${encodeURIComponent('质检')}`);
      return;
    }

    setActiveStatFilter('production');
    setShowDelayedOnly(false);
    setSmartQueueFilter('all');
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      status: '',
      delayedOnly: undefined,
      todayOnly: undefined,
      keyword: targetOrderNo || prev.keyword,
    }));
    triggerOrderFocus(targetOrder);
  }, [message, navigate, resolveAnomalyTargetOrder, triggerOrderFocus]);

  // ===== 提取的 Hooks =====
  const { visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions } = useColumnSettings();
  const { globalStats } = useProductionStats(queryParams);

  // 获取生产订单列表
  const fetchProductionList = async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<ProductionOrder>>(
        '/production/order/list',
        { params: queryParams }
      );
      if (isApiSuccess(response)) {
        setProductionList(response.data.records || []);
        setTotal(response.data.total || 0);
        clearAllBoardCache();
        clearBoardStatsTimestamps();
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        const errMessage =
          typeof response === 'object' && response !== null && 'message' in response
            ? String((response as any).message) || '获取生产订单列表失败'
            : '获取生产订单列表失败';
        reportSmartError('生产订单加载失败', errMessage, 'PROD_LIST_LOAD_FAILED');
        message.error(
          errMessage
        );
      }
    } catch (error) {
      reportSmartError('生产订单加载失败', '网络异常或服务不可用，请稍后重试', 'PROD_LIST_LOAD_EXCEPTION');
      message.error('获取生产订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 依赖 fetchProductionList 的 Hooks
  const {
    quickEditSaving, handleQuickEditSave: hookQuickEditSave,
    handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder,
    handleScrapOrder, pendingScrapOrder, scrapOrderLoading, confirmScrapOrder, cancelScrapOrder,
    exportSelected,
    remarkPopoverId, setRemarkPopoverId, remarkText, setRemarkText, remarkSaving, handleRemarkSave,
  } = useProductionActions({ message, isSupervisorOrAbove, fetchProductionList });

  const {
    transferModalVisible, transferRecord,
    transferType, setTransferType,
    transferUserId, setTransferUserId,
    transferMessage, setTransferMessage, transferUsers, transferSearching,
    transferFactoryId, setTransferFactoryId,
    transferFactoryMessage, setTransferFactoryMessage, transferFactories, transferFactorySearching,
    transferSubmitting, submitTransfer, searchTransferUsers, searchTransferFactories, handleTransferOrder,
    transferBundles, transferBundlesLoading, transferSelectedBundleIds, setTransferSelectedBundleIds,
    transferProcesses, transferProcessesLoading, transferSelectedProcessCodes, setTransferSelectedProcessCodes,
    closeTransferModal,
  } = useProductionTransfer({ message });

  const {
    processDetailVisible, processDetailRecord, processDetailType,
    procurementStatus, processStatus, processDetailNodeOperations: _processDetailNodeOperations,
    openProcessDetail, closeProcessDetail, syncProcessFromTemplate,
    factories: _factories, factoriesLoading: _factoriesLoading,
  } = useProcessDetail({ message, fetchProductionList });

  const {
    remapVisible, remapRecord, parentNodes: remapParentNodes,
    remapConfig, remapSaving,
    openSubProcessRemap, closeRemap, saveRemap,
  } = useSubProcessRemap({ message, fetchProductionList });

  const {
    renderCompletionTimeTag,
  } = useProgressTracking(productionList);

  // ===== Effects =====
  // 挂载时懒加载动态工序父级映射（供二次工艺等子工序识别父级用，全局只请求一次）
  useEffect(() => {
    if (!getDynamicParentMapping()) {
      processParentMappingApi.list().then((res: any) => {
        const data = res?.data?.data ?? res?.data ?? {};
        if (data && typeof data === 'object') setDynamicParentMapping(data);
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    fetchProductionList();
  }, [queryParams]);

  // 每次重新切回该页面（浏览器 Tab 或 SPA 菜单）时静默刷新
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchProductionList();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // 预加载悬停卡 boardStats（与生产进度页保持一致：前20条）
  useEffect(() => {
    if (!productionList.length) return;
    const queue = productionList.slice(0, Math.min(20, productionList.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        await ensureBoardStatsForOrder({
          order: o,
          nodes: DEFAULT_HOVER_NODES,
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
    return () => { cancelled = true; };
  // boardStatsByOrder/boardStatsLoadingByOrder 通过 ref 传入，不放依赖数组，避免无限循环
  }, [productionList, mergeBoardStatsForOrder, mergeBoardTimesForOrder, setBoardLoadingForOrder, mergeProcessDataForOrder]);

  // 首次加载到订单后，静默触发异常检测（仅检测一次，不阻塞主列表）
  useEffect(() => {
    if (productionList.length > 0) void fetchAnomalies();
  // productionList.length 变化是触发时机，fetchAnomalies 是稳定回调
  }, [productionList.length]);

  // URL 参数解析
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => {
        const newKeyword = orderNo || (prev.keyword || '');
        const newStyleNo = styleNo || (prev.styleNo || '');
        // 值与当前完全一致时返回同一引用，避免触发多余的 fetch（常见于跨页 mount 时 URL 已预读场景）
        if (newKeyword === (prev.keyword || '') && newStyleNo === (prev.styleNo || '')) {
          return prev;
        }
        return { ...prev, page: 1, styleNo: newStyleNo || undefined, keyword: newKeyword };
      });
    }
    // URL filter 参数 → 激活对应智能队列筛选（如 ?filter=overdue 触发逾期筛选）
    const filterParam = (params.get('filter') || '').trim();
    if (['overdue', 'urgent', 'behind', 'stagnant'].includes(filterParam)) {
      setSmartQueueFilter(filterParam as 'overdue' | 'urgent' | 'behind' | 'stagnant');
    }
  }, [location.search]);

  // 跨页跳转精准聚焦：URL 含 orderNo 且列表首次加载完成后，自动滚动高亮目标订单
  // 仅触发一次（urlFocusApplied ref 保护），避免后续定时刷新反复高亮
  const urlFocusApplied = useRef(false);
  useEffect(() => {
    if (urlFocusApplied.current || productionList.length === 0) return;
    const orderNo = (new URLSearchParams(window.location.search).get('orderNo') || '').trim();
    if (!orderNo) return;
    const targetOrder = productionList.find((o) => String(o.orderNo || '').trim() === orderNo);
    if (targetOrder) {
      urlFocusApplied.current = true;
      triggerOrderFocus(targetOrder);
    }
  }, [productionList, triggerOrderFocus]);

  // 实时同步：30秒自动轮询更新数据
  useSync(
    'production-orders',
    async () => {
      try {
        const response = await api.get<PaginatedResponse<ProductionOrder>>(
          '/production/order/list',
          { params: queryParams }
        );
        if (isApiSuccess(response)) return response.data.records || [];
        return [];
      } catch {
        return [];
      }
    },
    (newData, oldData) => {
      if (oldData !== null) {
        setProductionList(newData);
      }
    },
    {
      interval: 30000,
      enabled: !loading && !quickEditModal.visible,
      pauseOnHidden: true,
      onError: (error) => {
        console.error('[实时同步] 错误', error);
      }
    }
  );

  // 排序：终态订单（关单/报废/完成）始终排到最后，智能条筛选结果也走同一套共享逻辑
  const sortedProductionList = useMemo(() => {
    const filtered = [...smartQueueOrders];
    filtered.sort((a: any, b: any) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      if (sortField === 'createTime') {
        const aTime = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bTime = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });
    return filtered;
  }, [smartQueueOrders, sortField, sortOrder, showDelayedOnly, activeStatFilter]);

  const scrollToFocusedOrder = useCallback((orderId: string) => {
    const safeId = orderId.replace(/"/g, '\\"');
    const selector = viewMode === 'list'
      ? `tr[data-row-key="${safeId}"]`
      : `#production-order-card-${safeId}`;
    const node = document.querySelector(selector) as HTMLElement | null;
    if (!node) return false;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocusedOrderId(orderId);
    if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    focusClearTimerRef.current = window.setTimeout(() => setFocusedOrderId(null), 2200);
    return true;
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (focusClearTimerRef.current) window.clearTimeout(focusClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!pendingScrollOrderId) return;
    const exists = sortedProductionList.some((record) => getOrderDomKey(record) === pendingScrollOrderId);
    if (!exists) return;
    const timer = window.setTimeout(() => {
      if (scrollToFocusedOrder(pendingScrollOrderId)) {
        setPendingScrollOrderId(null);
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [getOrderDomKey, pendingScrollOrderId, scrollToFocusedOrder, sortedProductionList, viewMode]);

  // 表格列渲染辅助
  const allColumns = useProductionColumns({
    sortField, sortOrder, handleSort,
    handleCloseOrder, handleScrapOrder, handleTransferOrder,
    navigate, openProcessDetail, openNodeDetail, syncProcessFromTemplate,
    setPrintModalVisible, setPrintingRecord,
    setRemarkPopoverId, setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
    deliveryRiskMap,
    stagnantOrderIds,
    handleShareOrder,
    handlePrintLabel,
    canManageOrderLifecycle,
    openSubProcessRemap,
    isFactoryAccount,
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
  });

  // 根据 visibleColumns 过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  // 点击统计卡片筛选
  const handleStatClick = (type: 'production' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'production') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 });
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams({ ...queryParams, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 });
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 });
    }
  };

  return (
    <Layout>
        <PageLayout
          title="我的订单"
          headerContent={<>
          {showSmartErrorNotice && smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchProductionList} />
            </div>
          ) : null}

          <AnomalyBanner
            visible={anomalyBannerVisible}
            items={anomalyItems}
            onClose={() => setAnomalyBannerVisible(false)}
            onItemClick={handleAnomalyClick}
          />

          <PageStatCards
            activeKey={activeStatFilter}
            cards={[
              {
                key: 'production',
                items: [
                  { label: '生产订单', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
                  { label: '数量', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('production'),
                activeColor: 'var(--color-primary)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                  { label: '数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
              },
              {
                key: 'today',
                items: [
                  { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
              },
            ]}
            hints={smartActionItems.map((item) => ({ ...item, count: item.value }))}
            onClearHints={smartQueueFilter !== 'all' ? () => setSmartQueueFilter('all') : undefined}
          />
          </>}
          filterLeft={
            <>
                  <StandardSearchBar
                    searchValue={queryParams.keyword || ''}
                    onSearchChange={(value) => setQueryParams({ ...queryParams, keyword: value, page: 1 })}
                    searchPlaceholder="搜索订单号/款号/加工厂"
                    dateValue={dateRange}
                    onDateChange={setDateRange}
                    statusValue={queryParams.status || ''}
                    onStatusChange={(value) => setQueryParams({ ...queryParams, status: value || undefined, includeScrapped: value === 'scrapped' ? true : queryParams.includeScrapped, excludeTerminal: value ? undefined : true, page: 1 })}
                    statusOptions={[
                      { label: '全部', value: '' },
                      { label: '待生产', value: 'pending' },
                      { label: '生产中', value: 'production' },
                      { label: '已完成', value: 'completed' },
                      { label: '已报废', value: 'scrapped' },
                      { label: '已逾期', value: 'delayed' },
                      { label: '已取消', value: 'cancelled' },
                    ]}
                  />
                  <Select
                    value={queryParams.factoryType || ''}
                    onChange={(value) =>
                      setQueryParams({
                        ...queryParams,
                        factoryType: (value || undefined) as ProductionQueryParams['factoryType'],
                        page: 1,
                      })
                    }
                    placeholder="内外标签"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={factoryTypeOptions}
                  />
                  <Select
                    value={queryParams.urgencyLevel || ''}
                    onChange={(value) => setQueryParams({ ...queryParams, urgencyLevel: value || undefined, page: 1 })}
                    placeholder="紧急程度"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部紧急度', value: '' },
                      { label: ' 急单', value: 'urgent' },
                      { label: '普通', value: 'normal' },
                    ]}
                  />
                  <Select
                    value={queryParams.plateType || ''}
                    onChange={(value) => setQueryParams({ ...queryParams, plateType: value || undefined, page: 1 })}
                    placeholder="首/翻单"
                    allowClear
                    style={{ minWidth: 110 }}
                    options={[
                      { label: '全部单型', value: '' },
                      { label: '首单', value: 'FIRST' },
                      { label: '翻单', value: 'REORDER' },
                    ]}
                  />
                </>
          }
          filterRight={
            <>
                  <Button onClick={() => fetchProductionList()}>刷新</Button>
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    overlayStyle={{ padding: 0 }}
                    styles={{ container: { maxHeight: '70vh', overflowY: 'auto', minWidth: 200, padding: 0 } }}
                    content={(
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '8px 16px 4px' }}>选择要显示的列</div>
                        <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
                        {columnOptions.map(opt => (
                          <div key={opt.key} style={{ padding: '4px 16px' }}>
                            <Checkbox
                              checked={visibleColumns[opt.key] === true}
                              onChange={() => toggleColumnVisible(opt.key)}
                            >
                              {opt.label}
                            </Checkbox>
                          </div>
                        ))}
                        <div style={{ borderTop: '1px solid #f0f0f0', margin: '4px 0' }} />
                        <div
                          style={{ color: 'var(--primary-color)', textAlign: 'center', cursor: 'pointer', padding: '6px 16px' }}
                          onClick={() => resetColumnSettings()}
                        >
                          重置为默认
                        </div>
                      </div>
                    )}
                  >
                    <Button icon={<SettingOutlined />}>列设置</Button>
                  </Popover>
                  <Segmented
                    value={viewMode}
                    onChange={(v) => setViewMode(v as 'list' | 'card' | 'smart')}
                    options={[
                      { value: 'list', icon: <UnorderedListOutlined /> },
                      { value: 'card', icon: <AppstoreOutlined /> },
                      { value: 'smart', icon: <RadarChartOutlined /> },
                    ]}
                  />
                                    <ExportButton
                    label="导出明细"
                    url="/api/production/order/export-excel"
                    params={queryParams as unknown as Record<string, string>}
                  />
                  <Button onClick={() => exportSelected(selectedRows)} disabled={!selectedRowKeys.length}>
                    导出
                  </Button>
                </>
          }
        >
          {viewMode === 'smart' ? (
            <ExternalFactorySmartView
              data={sortedProductionList}
              loading={loading}
              total={total}
              currentPage={queryParams.page}
              pageSize={queryParams.pageSize}
              onPageChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams({ ...queryParams, page, pageSize });
              }}
              handleCloseOrder={handleCloseOrder}
              handleScrapOrder={handleScrapOrder}
              handleTransferOrder={handleTransferOrder}
              openProcessDetail={openProcessDetail}
              syncProcessFromTemplate={syncProcessFromTemplate}
              setPrintModalVisible={setPrintModalVisible}
              setPrintingRecord={setPrintingRecord}
              quickEditModal={quickEditModal}
              handleShareOrder={handleShareOrder}
              handlePrintLabel={handlePrintLabel}
              canManageOrderLifecycle={canManageOrderLifecycle}
              isSupervisorOrAbove={isSupervisorOrAbove}
              openSubProcessRemap={openSubProcessRemap}
              isFactoryAccount={isFactoryAccount}
            />
          ) : viewMode === 'list' ? (
            <ResizableTable<any>
              storageKey="production-order-table"
              columns={columns as any}
              dataSource={sortedProductionList}
              rowKey="id"
              loading={loading}
              rowClassName={(record: ProductionOrder) => getOrderDomKey(record) === focusedOrderId ? 'smart-order-focus-row' : ''}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys: React.Key[], rows: ProductionOrder[]) => {
                  setSelectedRowKeys(keys);
                  setSelectedRows(rows);
                },
              }}
              stickyHeader
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total: total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                onChange: (page, pageSize) => {
                  savePageSize(pageSize);
                  setQueryParams({ ...queryParams, page, pageSize });
                },
              }}
            />
          ) : (
            <>
            <UniversalCardView
              dataSource={sortedProductionList}
              columns={cardColumns}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
                  gridKey: 'cardColorSizeGrid',
                  getItems: (record) => getOrderCardSizeQuantityItems(record),
                  getFallbackColor: (record) => String(record.color || '').trim(),
                  getFallbackSize: (record) => String(record.size || '').trim(),
                  getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
                }),
                [
                  { label: '下单', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                  { label: '交期', key: 'plannedEndDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                  {
                    label: '剩',
                    key: 'remainingDays',
                    render: (val: unknown, record: Record<string, unknown>) => {
                      const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
                      return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>;
                    }
                  }
                ]
              ]}
              progressConfig={{
                calculate: calcCardProgress,
                getStatus: (record: ProductionOrder) => (isOrderFrozenByStatus(record) ? 'default' : getProgressColorStatus(record.plannedEndDate)),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
                minVisiblePercent: (record: ProductionOrder) => String(record.status || '').trim().toLowerCase() === 'in_progress' ? 5 : 0,
                show: true,
                type: 'liquid',
              }}
              getCardId={(record) => `production-order-card-${getOrderDomKey(record as ProductionOrder)}`}
              getCardStyle={(record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? {
                boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
                transform: 'translateY(-2px)',
              } : undefined}
              actions={(record: ProductionOrder) => {
                const frozen = isOrderFrozenByStatus(record);
                const frozenTitle = '订单已关单/报废/完成，无法操作';
                return [
                { key: 'print', label: '打印', disabled: frozen, title: frozen ? frozenTitle : '打印', onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); } },
                { key: 'printLabel', label: '打印标签', disabled: frozen, title: frozen ? frozenTitle : '打印标签', onClick: () => void handlePrintLabel(record) },
                ...(canManageOrderLifecycle ? [{ key: 'close', label: '关单', disabled: frozen, title: frozen ? frozenTitle : '关单', onClick: () => { handleCloseOrder(record); } }] : []),
                { key: 'divider1', type: 'divider' as const, label: '' },
                { key: 'edit', label: '编辑', disabled: frozen, title: frozen ? frozenTitle : '编辑', onClick: () => { quickEditModal.open(record); } },
                { key: 'share', label: '分享', disabled: frozen, title: frozen ? frozenTitle : '分享', onClick: () => { void handleShareOrder(record); } },
              ].filter(Boolean);
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as any).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
            />
            {/* 卡片视图分页器 */}
            <StandardPagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={total}
              wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
              showQuickJumper={false}
              onChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams({ ...queryParams, page, pageSize });
              }}
            />
            </>
          )}
        </PageLayout>

        {/* 快速编辑弹窗 */}
        <QuickEditModal
          visible={quickEditModal.visible}
          loading={quickEditSaving}
          initialValues={{
            remarks: (quickEditModal.data as any)?.remarks,
            expectedShipDate: (quickEditModal.data as any)?.expectedShipDate,
            urgencyLevel: (quickEditModal.data as any)?.urgencyLevel || 'normal',
          }}
          onSave={(values) => hookQuickEditSave(values, quickEditModal.data, quickEditModal.close)}
          onCancel={() => { quickEditModal.close(); }}
        />

        {/* 备注异常 Modal */}
        <SmallModal
          title={<><ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 8 }} />备注异常</>}
          open={remarkPopoverId !== null}
          onCancel={() => { setRemarkPopoverId(null); setRemarkText(''); }}
          onOk={() => { if (remarkPopoverId) handleRemarkSave(remarkPopoverId); }}
          okText="保存"
          cancelText="取消"
          confirmLoading={remarkSaving}
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
        </SmallModal>

        {/* 工序详情弹窗 */}
        <ProcessDetailModal
          visible={processDetailVisible}
          onClose={closeProcessDetail}
          record={processDetailRecord}
          processType={processDetailType}
          procurementStatus={procurementStatus}
          processStatus={processStatus}
          onDataChanged={() => {
            void fetchProductionList();
          }}
        />

        {/* 节点详情弹窗 - 进度球点击 */}
        <NodeDetailModal
          visible={nodeDetailVisible}
          onClose={closeNodeDetail}
          orderId={nodeDetailOrder?.id}
          orderNo={nodeDetailOrder?.orderNo}
          styleNo={nodeDetailOrder?.styleNo}
          nodeType={nodeDetailType}
          nodeName={nodeDetailName}
          stats={nodeDetailStats}
          unitPrice={nodeDetailUnitPrice}
          processList={nodeDetailProcessList}
          onSaved={() => {
            void fetchProductionList();
          }}
        />

        {/* 转单弹窗 */}
        <TransferOrderModal
          transferModalVisible={transferModalVisible}
          transferRecord={transferRecord}
          transferType={transferType}
          setTransferType={setTransferType}
          transferUserId={transferUserId}
          setTransferUserId={setTransferUserId}
          transferMessage={transferMessage}
          setTransferMessage={setTransferMessage}
          transferUsers={transferUsers}
          transferSearching={transferSearching}
          transferFactoryId={transferFactoryId}
          setTransferFactoryId={setTransferFactoryId}
          transferFactoryMessage={transferFactoryMessage}
          setTransferFactoryMessage={setTransferFactoryMessage}
          transferFactories={transferFactories}
          transferFactorySearching={transferFactorySearching}
          transferSubmitting={transferSubmitting}
          transferBundles={transferBundles}
          transferBundlesLoading={transferBundlesLoading}
          transferSelectedBundleIds={transferSelectedBundleIds}
          setTransferSelectedBundleIds={setTransferSelectedBundleIds}
          transferProcesses={transferProcesses}
          transferProcessesLoading={transferProcessesLoading}
          transferSelectedProcessCodes={transferSelectedProcessCodes}
          setTransferSelectedProcessCodes={setTransferSelectedProcessCodes}
          searchTransferUsers={searchTransferUsers}
          searchTransferFactories={searchTransferFactories}
          submitTransfer={submitTransfer}
          closeTransferModal={closeTransferModal}
        />

        {shareOrderDialog}

        {/* 通用备注记录弹窗 */}
        <RemarkTimelineModal
          open={remarkTarget.open}
          onClose={() => setRemarkTarget({ open: false, orderNo: '' })}
          targetType="order"
          targetNo={remarkTarget.orderNo}
          defaultRole={remarkTarget.defaultRole}
          canAddRemark={isSupervisorOrAbove || isFactoryAccount || (!!user?.username && user.username === remarkTarget.merchandiser)}
        />

        {/* 打印标签（洗水唛 / U编码）双 Tab 弹窗 */}
        <LabelPrintModal
          open={labelPrintOpen}
          onClose={() => { setLabelPrintOpen(false); setLabelPrintOrder(null); setLabelPrintStyle(null); }}
          order={labelPrintOrder}
          styleInfo={labelPrintStyle}
        />

        {/* 子工序临时重新分配弹窗 */}
        <SubProcessRemapModal
          visible={remapVisible}
          record={remapRecord}
          parentNodes={remapParentNodes}
          config={remapConfig}
          saving={remapSaving}
          onSave={saveRemap}
          onClose={closeRemap}
          isFactoryAccount={isFactoryAccount}
        />

        {/* 打印预览弹窗 */}
        <StylePrintModal
          visible={printModalVisible}
          onClose={() => { setPrintModalVisible(false); setPrintingRecord(null); }}
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

      <RejectReasonModal
        open={!!pendingCloseOrder}
        title={`确认关单：${safeString((pendingCloseOrder?.order as any)?.orderNo)}`}
        description={pendingCloseOrder ? (
          <div>
            <div>订单数量：{pendingCloseOrder.orderQty}</div>
            <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
            <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
            <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
            <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          </div>
        ) : null}
        fieldLabel="关闭原因"
        required={false}
        okDanger={false}
        okText="确认关单"
        loading={closeOrderLoading}
        onOk={confirmCloseOrder}
        onCancel={cancelCloseOrder}
      />
      <RejectReasonModal
        open={!!pendingScrapOrder}
        title={`确认报废：${safeString((pendingScrapOrder as any)?.orderNo)}`}
        fieldLabel="报废原因"
        required
        okDanger
        okText="确认报废"
        loading={scrapOrderLoading}
        onOk={confirmScrapOrder}
        onCancel={cancelScrapOrder}
      />

    </Layout>
  );
};

export default ProductionList;
