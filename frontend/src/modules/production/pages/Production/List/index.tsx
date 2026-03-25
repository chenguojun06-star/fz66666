import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button, Card, Input, Select, Tag, App, Dropdown, Checkbox, Alert, InputNumber, Tabs, Pagination } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined, ShareAltOutlined, CopyOutlined, StopOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import PageStatCards from '@/components/common/PageStatCards';
import SmartPredictionStrip from '@/components/common/SmartPredictionStrip';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import LabelPrintModal from './components/LabelPrintModal';
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
import SupplierSelect from '@/components/common/SupplierSelect';
import UniversalCardView from '@/components/common/UniversalCardView';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { ensureBoardStatsForOrder, clearBoardStatsTimestamps } from '../ProgressDetail/hooks/useBoardStats';
import { useDeliveryRiskMap } from '../ProgressDetail/hooks/useDeliveryRiskMap';
import { useStagnantDetection } from '../ProgressDetail/hooks/useStagnantDetection';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { AnomalyItem } from '@/services/intelligence/intelligenceApi';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import ExportButton from '@/components/common/ExportButton';
import type { ProgressNode } from '../ProgressDetail/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useModal } from '@/hooks';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
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
import { safeString, mainStages } from './utils';
import { useProductionBoardStore } from '@/stores';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useProductionSmartQueue } from '../useProductionSmartQueue';

const { Option } = Select;

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
  const quickEditModal = useModal<ProductionOrder>();
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

  // ===== 分享进度弹窗状态 =====
  const [shareModal, setShareModal] = useState<{
    open: boolean;
    record: ProductionOrder | null;
    token: string | null;
    loading: boolean;
    revoking: boolean;
  }>({ open: false, record: null, token: null, loading: false, revoking: false });

  const handleShareOrder = useCallback(async (record: ProductionOrder) => {
    setShareModal({ open: true, record, token: null, loading: true, revoking: false });
    try {
      const res = await intelligenceApi.generateShareToken(String(record.id));
      const token = (res as any)?.data as string | null;
      if (!token) throw new Error('未返回 token');
      setShareModal(prev => ({ ...prev, token, loading: false }));
    } catch {
      setShareModal(prev => ({ ...prev, loading: false }));
      message.error('生成分享链接失败，请重试');
    }
  }, [message]);

  const handleRevokeShare = useCallback(async () => {
    const orderId = shareModal.record?.id;
    if (!orderId) return;
    setShareModal(prev => ({ ...prev, revoking: true }));
    try {
      await intelligenceApi.revokeShareToken(String(orderId));
      message.success('分享链接已撤销');
      setShareModal({ open: false, record: null, token: null, loading: false, revoking: false });
    } catch {
      setShareModal(prev => ({ ...prev, revoking: false }));
      message.error('撤销失败，请重试');
    }
  }, [shareModal.record, message]);

  const copyTextSafely = useCallback(async (text: string) => {
    const value = String(text || '').trim();
    if (!value) {
      message.warning('复制内容为空');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        message.success('链接已复制');
        return;
      }
    } catch {
      // fallback to document.execCommand('copy')
    }

    try {
      if (typeof document === 'undefined') {
        message.error('当前环境不支持复制，请手动复制');
        return;
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.top = '-1000px';
      textarea.style.left = '-1000px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        message.success('链接已复制');
      } else {
        message.error('复制失败，请手动复制');
      }
    } catch {
      message.error('复制失败，请手动复制');
    }
  }, [message]);

  // ===== 查询参数 =====
  // 跨页跳转精准定位：组件 mount 时就从 URL 读取 orderNo，避免初始 fetch 与 URL params effect 之间的竞态条件
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>(() => {
    const initSearch = new URLSearchParams(window.location.search);
    const initOrderNo = initSearch.get('orderNo') || '';
    // 读取上次用户选择的每页条数，刷新后仍保持（仅列表模式；卡片模式由 cardPageSize 控制）
    const savedPageSize = (() => {
      try {
        const raw = localStorage.getItem('production_list_page_size');
        const n = raw ? parseInt(raw, 10) : NaN;
        return Number.isFinite(n) && n > 0 ? n : 10;
      } catch { return 10; }
    })();
    return {
      page: 1, pageSize: savedPageSize, includeScrapped: true, excludeTerminal: false,
      ...(initOrderNo ? { keyword: initOrderNo } : {}),
    };
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortField, setSortField] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };
  // ===== 数据状态 =====
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewModeState] = useState<'list' | 'card'>(
    () => (localStorage.getItem('production_view_mode') as 'list' | 'card') || 'list'
  );
  const setViewMode = (mode: 'list' | 'card') => {
    localStorage.setItem('production_view_mode', mode);
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
    processDetailActiveTab, setProcessDetailActiveTab,
    procurementStatus, processStatus, processDetailNodeOperations: _processDetailNodeOperations,
    openProcessDetail, closeProcessDetail, syncProcessFromTemplate, saveDelegation,
    childProcessesByStage, activeStageKeys,
    factories: _factories, factoriesLoading: _factoriesLoading, delegationData, setDelegationData,
  } = useProcessDetail({ message, fetchProductionList });

  const {
    renderCompletionTimeTag,
  } = useProgressTracking(productionList);

  // ===== Effects =====
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
    navigate, openProcessDetail, syncProcessFromTemplate,
    setPrintModalVisible, setPrintingRecord,
    setRemarkPopoverId, setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
    deliveryRiskMap,
    stagnantOrderIds,
    handleShareOrder,
    handlePrintLabel,
    canManageOrderLifecycle,
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
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">我的订单</h2>
          </div>

          {showSmartErrorNotice && smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchProductionList} />
            </div>
          ) : null}

          {anomalyBannerVisible && anomalyItems.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <Alert
                type={anomalyItems.some(i => i.severity === 'critical') ? 'error' : 'warning'}
                showIcon
                closable
                onClose={() => setAnomalyBannerVisible(false)}
                title={
                  <span style={{ fontWeight: 600, fontSize: 13 }}>
                    🔔 智能异常检测：发现 {anomalyItems.length} 条异常
                  </span>
                }
                description={
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {anomalyItems.slice(0, 5).map((item, idx) => {
                      const severityColor = item.severity === 'critical' ? '#ff4d4f' : '#fa8c16';
                      const typeLabel: Record<string, string> = {
                        output_spike: '产量异常',
                        quality_spike: '质量异常',
                        idle_worker: '工人空闲',
                        night_scan: '夜间扫码',
                      };
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleAnomalyClick(item)}
                          style={{
                            fontSize: 12,
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            width: '100%',
                            border: 'none',
                            background: 'transparent',
                            padding: '4px 6px',
                            borderRadius: 6,
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                          title="点击定位对应订单"
                        >
                          <span style={{ color: severityColor, fontWeight: 700, minWidth: 60 }}>
                            [{typeLabel[item.type] ?? item.type}]
                          </span>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)', minWidth: 80 }}>{item.targetName}</span>
                          <span>{item.description}</span>
                          {item.deviationRatio > 0 && (
                            <span style={{ color: severityColor, marginLeft: 4 }}>
                              偏差 {(item.deviationRatio * 100).toFixed(0)}%
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {anomalyItems.length > 5 && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>…还有 {anomalyItems.length - 5} 条，建议继续按异常项逐条处理</div>
                    )}
                  </div>
                }
              />
            </div>
          )}

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

          {/* 智能提示条 */}
          <SmartPredictionStrip
            items={smartActionItems.map((item) => ({
              ...item,
              count: item.value,
            }))}
            onClear={smartQueueFilter !== 'all' ? () => {
              setSmartQueueFilter('all');
            } : undefined}
          />

          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
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
                      { label: '🔴 急单', value: 'urgent' },
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
              )}
              right={(
                <>
                  <Button onClick={() => fetchProductionList()}>刷新</Button>
                  <Dropdown
                    menu={{
                      items: [
                        {
                          key: 'column-settings-title',
                          label: <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '0 4px' }}>选择要显示的列</div>,
                          disabled: true,
                        },
                        { type: 'divider' as const },
                        ...columnOptions.map(opt => ({
                          key: opt.key,
                          label: (
                            <div onClick={(e) => e.stopPropagation()}>
                              <Checkbox
                                checked={visibleColumns[opt.key] === true}
                                onChange={() => toggleColumnVisible(opt.key)}
                              >
                                {opt.label}
                              </Checkbox>
                            </div>
                          ),
                        })),
                        { type: 'divider' as const },
                        {
                          key: 'reset-columns',
                          label: (
                            <div
                              style={{ color: 'var(--primary-color)', textAlign: 'center', cursor: 'pointer' }}
                              onClick={(e) => { e.stopPropagation(); resetColumnSettings(); }}
                            >
                              重置为默认
                            </div>
                          ),
                        },
                      ],
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <Button icon={<SettingOutlined />}>列设置</Button>
                  </Dropdown>
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
                                    <ExportButton
                    label="导出明细"
                    url="/api/production/order/export-excel"
                    params={queryParams as unknown as Record<string, string>}
                  />
                  <Button onClick={() => exportSelected(selectedRows)} disabled={!selectedRowKeys.length}>
                    导出
                  </Button>
                </>
              )}
            />
          </Card>

          {viewMode === 'list' ? (
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
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total: total,
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
                onChange: (page, pageSize) => {
                  try { localStorage.setItem('production_list_page_size', String(pageSize)); } catch { /* ignore */ }
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
                [
                  {
                    label: '码数',
                    key: 'orderDetails',
                    render: (val: unknown, record: Record<string, unknown>) => {
                      try {
                        const details = record?.orderDetails;
                        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                        const lines = parsed?.orderLines || parsed?.lines || parsed;
                        if (Array.isArray(lines) && lines.length > 0) {
                          return (
                            <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                              {lines.map((l: any, idx: number) => (
                                <span key={idx} style={{ width: '22px', textAlign: 'center', fontSize: '10px' }}>{l.size || '-'}</span>
                              ))}
                            </div>
                          );
                        }
                      } catch { /* ignore */ }
                      return String(record?.size || '').trim() || '-';
                    }
                  }
                ],
                [
                  {
                    label: '数量',
                    key: 'orderDetails',
                    render: (val: unknown, record: Record<string, unknown>) => {
                      try {
                        const details = record?.orderDetails;
                        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                        const lines = parsed?.orderLines || parsed?.lines || parsed;
                        if (Array.isArray(lines) && lines.length > 0) {
                          const total = lines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0), 0);
                          return (
                            <div style={{ display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {lines.map((l: any, idx: number) => (
                                <span key={idx} style={{ width: '22px', textAlign: 'center', fontSize: '10px', color: 'var(--color-info)', fontWeight: 600 }}>{l.quantity || 0}</span>
                              ))}
                              <span style={{ marginLeft: '4px', color: '#8c8c8c', fontSize: '10px', flexShrink: 0 }}>共{total}</span>
                            </div>
                          );
                        }
                      } catch { /* ignore */ }
                      const qty = Number(record?.orderQuantity) || 0;
                      return qty > 0 ? `${qty}件` : '-';
                    }
                  }
                ],
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 0 4px' }}>
              <Pagination
                current={queryParams.page}
                pageSize={queryParams.pageSize}
                total={total}
                showTotal={(t) => `共 ${t} 条`}
                showSizeChanger
                pageSizeOptions={['10', '20', '50', '100']}
                onChange={(page, pageSize) => {
                  try { localStorage.setItem('production_list_page_size', String(pageSize)); } catch { /* ignore */ }
                  setQueryParams({ ...queryParams, page, pageSize });
                }}
              />
            </div>
            </>
          )}
        </Card>

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
        <ResizableModal
          title={<><ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 8 }} />备注异常</>}
          open={remarkPopoverId !== null}
          onCancel={() => { setRemarkPopoverId(null); setRemarkText(''); }}
          onOk={() => { if (remarkPopoverId) handleRemarkSave(remarkPopoverId); }}
          okText="保存"
          cancelText="取消"
          confirmLoading={remarkSaving}
          width="40vw"
          destroyOnHidden
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
        </ResizableModal>

        {/* 工序详情弹窗 */}
        <ProcessDetailModal
          visible={processDetailVisible}
          onClose={closeProcessDetail}
          record={processDetailRecord}
          processType={processDetailType}
          procurementStatus={procurementStatus}
          processStatus={processStatus}
          activeTab={processDetailActiveTab}
          onTabChange={setProcessDetailActiveTab}
          onDataChanged={() => {
            void fetchProductionList();
          }}
          delegationContent={processDetailRecord && (
            <div style={{ padding: '8px 0' }}>
              <Alert
                title="可以为不同的生产节点指定执行工厂"
                type="info"
                showIcon
                closable
                style={{ marginBottom: '12px', padding: '6px 12px', fontSize: '12px' }}
              />
              {(() => {
                const stageStatusMap: Record<string, any> = {
                  cutting: processStatus?.cutting,
                  carSewing: processStatus?.sewing,
                  tailProcess: processStatus?.finishing,
                  warehousing: processStatus?.warehousing,
                };
                const stagesToShow = mainStages.filter(s => activeStageKeys.includes(s.key));
                return (
                  <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                      background: 'var(--color-bg-subtle)',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--neutral-text-secondary)',
                      borderBottom: '1px solid var(--color-border)'
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>订单：</span>
                      <span style={{ marginRight: '16px' }}>{processDetailRecord?.orderNo || '-'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>款号：</span>
                      <span style={{ marginRight: '16px' }}>{processDetailRecord?.styleNo || '-'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>数量：</span>
                      <span>{processDetailRecord?.orderQuantity || 0} 件</span>
                    </div>
                    <ResizableTable
                      storageKey="production-list-process"
                      dataSource={stagesToShow}
                      columns={[
                        {
                          title: '生产节点',
                          dataIndex: 'name',
                          width: 90,
                          render: (text: string, record) => (
                            <span style={{ fontSize: '13px', fontWeight: 600, color: (record as any).color }}>{text}</span>
                          ),
                        },
                        {
                          title: '当前状态',
                          key: 'status',
                          width: 90,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status ? (
                              <span style={{
                                fontSize: '11px', fontWeight: 600,
                                color: status.completed ? 'var(--color-success)' : 'var(--color-warning)',
                                background: status.completed ? '#d1fae5' : '#fef3c7',
                                padding: '2px 6px', whiteSpace: 'nowrap'
                              }}>
                                {status.completed ? '✓ 完成' : `${status.completionRate}%`}
                              </span>
                            ) : null;
                          },
                        },
                        {
                          title: '工序名称',
                          key: 'processName',
                          width: 140,
                          render: (_, record) => (
                            <Select
                              placeholder="选择工序" size="small" style={{ width: '100%', minWidth: '120px' }}
                              allowClear showSearch optionFilterProp="children"
                              value={delegationData[record.key]?.processName}
                              onChange={(value) => {
                                setDelegationData(prev => ({ ...prev, [record.key]: { ...prev[record.key], processName: value } }));
                              }}
                              disabled={childProcessesByStage[record.key]?.length === 0}
                            >
                              {(childProcessesByStage[record.key] || []).map((proc, idx) => (
                                <Select.Option key={idx} value={proc.name}>
                                  {proc.name} (¥{proc.unitPrice.toFixed(2)})
                                </Select.Option>
                              ))}
                            </Select>
                          ),
                        },
                        {
                          title: '数量',
                          key: 'quantity',
                          width: 90,
                          align: 'right',
                          render: (_, record) => (
                            <InputNumber
                              placeholder="数量" size="small" min={0} step={1} style={{ width: '85px' }}
                              value={delegationData[record.key]?.quantity}
                              onChange={(value) => {
                                setDelegationData(prev => ({ ...prev, [record.key]: { ...prev[record.key], quantity: value || undefined } }));
                              }}
                            />
                          ),
                        },
                        {
                          title: '执行工厂',
                          key: 'factoryId',
                          render: (_, record) => (
                            <SupplierSelect
                              placeholder="选择工厂"
                              size="small"
                              style={{ width: '100%', maxWidth: '220px' }}
                              value={delegationData[record.key]?.factoryId}
                              onChange={(value, option) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [record.key]: {
                                    ...prev[record.key],
                                    factoryId: value,
                                    factoryContactPerson: option?.supplierContactPerson,
                                    factoryContactPhone: option?.supplierContactPhone,
                                  }
                                }));
                              }}
                            />
                          ),
                        },
                        {
                          title: '委派单价',
                          key: 'unitPrice',
                          width: 110,
                          render: (_, record) => (
                            <InputNumber
                              placeholder="单价" size="small" min={0} step={0.01} precision={2} prefix="¥" style={{ width: '100px' }}
                              value={delegationData[record.key]?.unitPrice}
                              onChange={(value) => {
                                setDelegationData(prev => ({ ...prev, [record.key]: { ...prev[record.key], unitPrice: value || undefined } }));
                              }}
                            />
                          ),
                        },
                        {
                          title: '委派人',
                          key: 'operatorName',
                          width: 90,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status?.operatorName ? (
                              <a
                                style={{ cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 500 }}
                                onClick={() => {
                                  if (processDetailRecord?.orderNo) {
                                    navigate(`/finance/payroll-operator-summary?orderNo=${processDetailRecord.orderNo}&processName=${record.name}`);
                                  }
                                }}
                              >
                                {status.operatorName}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                            );
                          },
                        },
                        {
                          title: '委派时间',
                          key: 'completedTime',
                          width: 110,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status?.completedTime ? (
                              <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>
                                {new Date(status.completedTime).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                            );
                          },
                        },
                        {
                          title: '操作',
                          key: 'action',
                          width: 90,
                          align: 'center',
                          render: (_, record) => (
                            <Button type="primary" size="small"
                              onClick={() => processDetailRecord && saveDelegation(record.key, processDetailRecord.id)}
                            >
                              保存
                            </Button>
                          ),
                        },
                      ]}
                      pagination={false}
                      size="small"
                      bordered
                      rowKey="key"
                    />
                  </div>
                );
              })()}
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--neutral-text)',
                  marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid var(--color-border)'
                }}>
                  委派历史
                </div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: '12px', padding: '16px', textAlign: 'center' }}>
                  暂无委派记录
                </div>
              </div>
            </div>
          )}
        />

        {/* 转单弹窗 */}
        <ResizableModal
          title={`转单 - ${safeString((transferRecord as any)?.orderNo)}`}
          open={transferModalVisible}
          onCancel={closeTransferModal}
          onOk={submitTransfer}
          confirmLoading={transferSubmitting}
          okText={transferType === 'factory' ? '确认转工厂' : '确认转人员'}
          cancelText="取消"
          width="60vw"
          initialHeight={Math.round(window.innerHeight * 0.82)}
          destroyOnHidden
        >
          <div style={{ padding: '8px 0' }}>
            {/* 转单类型 Tab */}
            <Tabs
              activeKey={transferType}
              onChange={(key) => setTransferType(key as 'user' | 'factory')}
              style={{ marginBottom: 16 }}
              items={[
                { key: 'user', label: '转人员（系统内部）' },
                { key: 'factory', label: '转工厂（系统内部）' },
              ]}
            />

            {/* 转人员 */}
            {transferType === 'user' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>转给谁：</div>
                <Select
                  showSearch placeholder="输入姓名搜索系统用户（仅限本系统内部）" value={transferUserId}
                  onChange={(val) => setTransferUserId(val)} onSearch={searchTransferUsers}
                  filterOption={false} loading={transferSearching}
                  notFoundContent={transferSearching ? '搜索中...' : '输入姓名搜索'}
                  style={{ width: '100%' }} allowClear
                >
                  {transferUsers.map(u => (
                    <Option key={u.id} value={u.id}>
                      {u.name}{u.username ? ` (${u.username})` : ''}
                    </Option>
                  ))}
                </Select>
              </div>
            )}

            {/* 转工厂 */}
            {transferType === 'factory' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ marginBottom: 6, fontWeight: 500 }}>转给哪个工厂：</div>
                <Select
                  showSearch placeholder="输入工厂名称搜索（仅限本系统内部工厂）" value={transferFactoryId}
                  onChange={(val) => setTransferFactoryId(val)} onSearch={searchTransferFactories}
                  filterOption={false} loading={transferFactorySearching}
                  notFoundContent={transferFactorySearching ? '搜索中...' : '输入工厂名称搜索'}
                  style={{ width: '100%' }} allowClear
                >
                  {transferFactories.map(f => (
                    <Option key={f.id} value={f.id}>
                      {f.factoryName}{f.factoryCode ? ` (${f.factoryCode})` : ''}
                      {f.contactPerson ? ` · ${f.contactPerson}` : ''}
                    </Option>
                  ))}
                </Select>
              </div>
            )}

            {/* 菲号选择（共用） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                选择菲号（可选）：
                {transferSelectedBundleIds.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    已选 {transferSelectedBundleIds.length} 个
                  </span>
                )}
              </div>
              <ResizableTable
                storageKey="production-list-transfer"
                size="small" loading={transferBundlesLoading} dataSource={transferBundles}
                rowKey="id" pagination={false} scroll={{ y: 200 }}
                rowClassName={(record: any) => {
                  const s = record?.status;
                  if (s === 'received' || s === 'qualified' || s === 'completed') return 'transfer-bundle-row-disabled';
                  return '';
                }}
                rowSelection={{
                  selectedRowKeys: transferSelectedBundleIds,
                  onChange: (keys) => setTransferSelectedBundleIds(keys as string[]),
                  getCheckboxProps: (record: any) => ({
                    disabled: record?.status === 'received' || record?.status === 'qualified' || record?.status === 'completed',
                  }),
                }}
                columns={[
                  { title: '菲号', dataIndex: 'bundleNo', width: 80, render: (val: any) => val || '-' },
                  { title: '颜色', dataIndex: 'color', width: 100 },
                  { title: '尺码', dataIndex: 'size', width: 80 },
                  { title: '数量', dataIndex: 'quantity', width: 70 },
                  {
                    title: '状态', dataIndex: 'status', width: 90,
                    render: (v: string) => {
                      const statusMap: Record<string, string> = {
                        'created': '已创建', 'received': '已领取', 'qualified': '已质检',
                        'completed': '已完成', 'in_progress': '生产中',
                      };
                      return statusMap[v] || v || '-';
                    }
                  },
                ]}
                locale={{ emptyText: transferBundlesLoading ? '加载中...' : '暂无菲号数据' }}
              />
            </div>

            {/* 工序选择（共用） */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                选择工序（可选）：
                {transferSelectedProcessCodes.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    已选 {transferSelectedProcessCodes.length} 个工序
                  </span>
                )}
              </div>
              <Select
                mode="multiple" placeholder="选择要转移的工序" value={transferSelectedProcessCodes}
                onChange={(vals) => setTransferSelectedProcessCodes(vals)}
                loading={transferProcessesLoading} style={{ width: '100%' }}
                allowClear optionFilterProp="label" maxTagCount="responsive"
              >
                {transferProcesses.map((p: any) => {
                  const price = Number(p.unitPrice || 0);
                  const priceText = price > 0 ? ` - ¥${price.toFixed(2)}/件` : '';
                  const label = `${p.processName}${priceText}${p.progressStage ? ` (${p.progressStage})` : ''}`;
                  return (
                    <Option key={p.processCode || p.id} value={p.processCode || p.id} label={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{p.processName}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                          {p.progressStage && `${p.progressStage} | `}
                          {price > 0 ? `¥${price.toFixed(2)}` : '未配置单价'}
                        </span>
                      </div>
                    </Option>
                  );
                })}
              </Select>
              {transferProcesses.length === 0 && !transferProcessesLoading && (
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: 4 }}>
                  该订单暂无工序配置
                </div>
              )}
            </div>

            {/* 备注（时间戳由后端自动植入，格式 [2026-02-19 14:30] 备注内容） */}
            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                备注（可选）：
                <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', fontSize: '12px', marginLeft: 6 }}>
                  系统将自动记录备注时间
                </span>
              </div>
              <Input.TextArea
                placeholder="请输入转单备注"
                value={transferType === 'factory' ? transferFactoryMessage : transferMessage}
                onChange={(e) => transferType === 'factory'
                  ? setTransferFactoryMessage(e.target.value)
                  : setTransferMessage(e.target.value)
                }
                autoSize={{ minRows: 2, maxRows: 4 }} maxLength={200} showCount
              />
            </div>
          </div>
        </ResizableModal>

        {/* 分享进度弹窗 */}
        <ResizableModal
          title={<><ShareAltOutlined style={{ color: 'var(--primary-color)', marginRight: 8 }} />分享订单进度</>}
          open={shareModal.open}
          onCancel={() => setShareModal({ open: false, record: null, token: null, loading: false, revoking: false })}
          footer={null}
          width="30vw"
          destroyOnHidden
        >
          {shareModal.loading ? (
            <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>正在生成链接……</div>
          ) : shareModal.token ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Alert
                type="info"
                showIcon
                title="链接已生成，1天后自动失效"
                description="客户打开链接可查看完整进度与AI预测，不展示单价，不支持下载。"
                style={{ fontSize: 12 }}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Input
                  readOnly
                  value={`${window.location.origin}/share/${shareModal.token}`}
                  style={{ flex: 1, fontSize: 12 }}
                />
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void copyTextSafely(`${window.location.origin}/share/${shareModal.token}`);
                  }}
                >
                  复制
                </Button>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  danger
                  icon={<StopOutlined />}
                  loading={shareModal.revoking}
                  onClick={handleRevokeShare}
                >
                  撤销链接
                </Button>
              </div>
            </div>
          ) : null}
        </ResizableModal>

        {/* 打印标签（洗水唛 / U编码）双 Tab 弹窗 */}
        <LabelPrintModal
          open={labelPrintOpen}
          onClose={() => { setLabelPrintOpen(false); setLabelPrintOrder(null); setLabelPrintStyle(null); }}
          order={labelPrintOrder}
          styleInfo={labelPrintStyle}
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
