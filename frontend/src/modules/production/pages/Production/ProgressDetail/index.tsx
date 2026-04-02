import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Modal, Select, Space, Tag } from 'antd';
import type { InputRef } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';

import UniversalCardView from '@/components/common/UniversalCardView';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import LabelPrintModal from '../List/components/LabelPrintModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import SmallModal from '@/components/common/SmallModal';
import api, { generateRequestId, hasProcurementStage, isDuplicateScanMessage, parseProductionOrderLines, isApiSuccess, isOrderFrozenByStatus, isOrderTerminal } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { formatDateTimeCompact } from '@/utils/datetime';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { CuttingBundle, ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import type { TemplateLibrary } from '@/types/style';

import { productionCuttingApi, productionOrderApi, productionScanApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { getStyleInfoByRef } from '@/services/style/styleApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import '../../../styles.css';

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
import { ensureBoardStatsForOrder, clearBoardStatsTimestamps } from './hooks/useBoardStats';
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
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { useScanFeedback } from './hooks/useScanFeedback';
import { useNodeDetail } from './hooks/useNodeDetail';
import { usePrintFlow } from './hooks/usePrintFlow';
import { useRemarkModal } from './hooks/useRemarkModal';
import { useQuickEdit } from './hooks/useQuickEdit';
import { useProgressFilters } from './hooks/useProgressFilters';
import { useProgressColumns } from './hooks/useProgressColumns';
import { useShareOrderDialog } from './hooks/useShareOrderDialog';
import { useStagnantDetection } from './hooks/useStagnantDetection';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useDeliveryRiskMap } from './hooks/useDeliveryRiskMap';
import MaterialShortageAlert from './components/MaterialShortageAlert';
import { useProductionBoardStore } from '@/stores';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { BottleneckItem } from '@/services/intelligence/intelligenceApi';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
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
  const [pendingScrollOrderId, setPendingScrollOrderId] = useState<string | null>(null);
  const [focusedOrderId, setFocusedOrderId] = useState<string | null>(null);
  const [pendingFocusNode, setPendingFocusNode] = useState<{ orderNo: string; nodeName: string } | null>(null);
  const [focusedOrderNos, setFocusedOrderNos] = useState<string[]>([]);
  const focusClearTimerRef = useRef<number | null>(null);
  const focusedOrderNosRef = useRef<string[]>([]);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });

  const getOrderDomKey = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    return String(record?.id || record?.orderNo || '').trim();
  }, []);

  const triggerOrderFocus = useCallback((record: Partial<ProductionOrder> | null | undefined) => {
    const key = getOrderDomKey(record);
    if (!key) return;
    setPendingScrollOrderId(key);
  }, [getOrderDomKey]);

  const normalizeFocusNodeName = useCallback((value: string) => {
    const safeValue = String(value || '').trim();
    if (!safeValue) return '';
    if (safeValue.includes('质检') || safeValue.includes('品检') || safeValue.includes('验货')) return '质检';
    if (safeValue.includes('入库') || safeValue.includes('入仓')) return '入库';
    if (safeValue.includes('包装') || safeValue.includes('打包') || safeValue.includes('后整')) return '包装';
    if (safeValue.includes('车缝') || safeValue.includes('车间')) return '车缝';
    if (safeValue.includes('裁剪') || safeValue.includes('裁床')) return '裁剪';
    return safeValue;
  }, []);

  const getFocusNodeType = useCallback((nodeName: string) => {
    const normalized = normalizeFocusNodeName(nodeName);
    if (normalized === '质检') return 'quality';
    if (normalized === '入库') return 'warehousing';
    return normalized;
  }, [normalizeFocusNodeName]);

  useEffect(() => {
    focusedOrderNosRef.current = focusedOrderNos;
  }, [focusedOrderNos]);

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

  // ── 订单数据 ──────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aClose = isOrderTerminal(a) ? 1 : 0;
      const bClose = isOrderTerminal(b) ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [orders, dateSortAsc]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [globalStats, setGlobalStats] = useState({
    activeOrders: 0, activeQuantity: 0,
    completedOrders: 0, completedQuantity: 0,
    scrappedOrders: 0, scrappedQuantity: 0,
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
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  // ─────── 工序瓶颈检测 ───────
  const [bottleneckItems, setBottleneckItems] = useState<BottleneckItem[]>([]);
  const [bottleneckBannerVisible, setBottleneckBannerVisible] = useState(false);
  const bottleneckFetched = useRef(false);

  const fetchBottleneck = useCallback(async () => {
    if (bottleneckFetched.current) return;
    bottleneckFetched.current = true;
    try {
      const res = await intelligenceApi.detectBottleneck() as any;
      const detection = res?.data ?? res;
      const items: BottleneckItem[] = detection?.items ?? [];
      const significant = items.filter((i: BottleneckItem) => i.severity === 'critical' || i.severity === 'warning');
      if (significant.length > 0) {
        setBottleneckItems(significant);
        setBottleneckBannerVisible(true);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (orders.length > 0) void fetchBottleneck();
  }, [orders.length]);

  /** 自动刷新计时器：每 2 分钟递增，触发 boardStats 过期重拉 */
  const [boardRefreshTick, setBoardRefreshTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setBoardRefreshTick(t => t + 1), 2 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  /**
   * 基于 boardStats 实时数据计算卡片进度。
   * 解决：进度球用 boardStats（含订单级字段兜底）显示 100%，而卡片只用 productionProgress（纯扫码公式）显示 60% 的割裂感。
   * 策略：取 boardStats 最远下游节点位置权重 与 productionProgress 的较大值。
   */
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
    // 工序流水线顺序（从前到后）
    const PIPELINE = hasProcurementStage(record as any)
      ? ['采购', '裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库']
      : ['裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库'];
    // 规范化节点名：把 "仓库入库" / "质检入库" 等都归到最近的标准节点
    const normalizeKey = (k: string) => {
      if (k.includes('入库') || k.includes('入仓')) return '入库';
      if (k.includes('质检') || k.includes('品检') || k.includes('验货')) return '质检';
      if (k.includes('包装') || k.includes('后整') || k.includes('打包')) return '包装';
      if (k.includes('裁剪') || k.includes('裁床')) return '裁剪';
      if (k.includes('车缝') || k.includes('车间')) return '车缝';
      return k;
    };
    // 汇总 boardStats，规范化后取最大值
    const normMap = new Map<string, number>();
    for (const [rawKey, rawQty] of Object.entries(stats as Record<string, number>)) {
      const nk = normalizeKey(rawKey);
      const pct = Math.min(100, Math.round(Number(rawQty) / total * 100));
      if (pct > 0) normMap.set(nk, Math.max(normMap.get(nk) ?? 0, pct));
    }
    if (normMap.size === 0) return dbProgress;
    // 找到最远下游节点
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
    // 该节点之前所有节点贡献 (lastIdx / PIPELINE.length * 100)，该节点贡献 (lastPct / PIPELINE.length)
    const perStage = 100 / PIPELINE.length;
    const boardProgress = Math.round(lastIdx * perStage + lastPct * perStage / 100);
    return Math.min(100, Math.max(dbProgress, boardProgress));
  }, [boardStatsByOrder]);


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
        const rawRecords = result.data.records || [];
        const filteredRecords = (() => {
          if (focusedOrderNosRef.current.length === 0) return rawRecords;
          const orderNoSet = new Set(focusedOrderNosRef.current);
          const orderIndex = new Map(focusedOrderNosRef.current.map((orderNo, index) => [orderNo, index]));
          return rawRecords
            .filter((record) => orderNoSet.has(String(record.orderNo || '').trim()))
            .sort((a, b) => {
              const aIndex = orderIndex.get(String(a.orderNo || '').trim()) ?? Number.MAX_SAFE_INTEGER;
              const bIndex = orderIndex.get(String(b.orderNo || '').trim()) ?? Number.MAX_SAFE_INTEGER;
              return aIndex - bIndex;
            });
        })();
        setOrders(filteredRecords);
        setTotal(focusedOrderNosRef.current.length > 0 ? filteredRecords.length : (result.data.total || 0));
        if (showSmartErrorNotice) setSmartError(null);
        // 仅非静默刷新（用户手动、换页、换过滤条件）才清空进度球缓存
        // silent=true（轮询）保留旧缓存，避免进度球瞬间闪白再回来
        if (!silent) {
          clearAllBoardCache();
          clearBoardStatsTimestamps();
          // 同时清空工序节点缓存，确保模板改词汇后刷新能重新加载最新节点配置
          setProgressNodesByStyleNo({});
          progressNodesByStyleNoRef.current = {};
        }
        const styleNos = Array.from(
          new Set(
            filteredRecords
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
                    //  保留 progressStage（父分类字段），用于进度球弹窗过滤和boardStats匹配
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
        excludeTerminal: params.excludeTerminal,
        orderNo: params.orderNo,
        styleNo: params.styleNo,
      } : {};

      const response = await api.get<{
        activeOrders: number;
        activeQuantity: number;
        completedOrders: number;
        completedQuantity: number;
        scrappedOrders: number;
        scrappedQuantity: number;
        totalOrders: number;
        totalQuantity: number;
        delayedOrders: number;
        delayedQuantity: number;
        todayOrders: number;
        todayQuantity: number;
      }>('/production/order/stats', { params: filterParams });
      if (isApiSuccess(response)) {
        const data = (response.data || {}) as Record<string, unknown>;
        setGlobalStats({
          activeOrders: Number(data.activeOrders ?? data.totalOrders ?? 0),
          activeQuantity: Number(data.activeQuantity ?? data.totalQuantity ?? 0),
          completedOrders: Number(data.completedOrders ?? 0),
          completedQuantity: Number(data.completedQuantity ?? 0),
          scrappedOrders: Number(data.scrappedOrders ?? 0),
          scrappedQuantity: Number(data.scrappedQuantity ?? 0),
          totalOrders: Number(data.totalOrders ?? data.activeOrders ?? 0),
          totalQuantity: Number(data.totalQuantity ?? data.activeQuantity ?? 0),
          delayedOrders: Number(data.delayedOrders ?? 0),
          delayedQuantity: Number(data.delayedQuantity ?? 0),
          todayOrders: Number(data.todayOrders ?? 0),
          todayQuantity: Number(data.todayQuantity ?? 0),
        });
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
    (queryParams as any).factoryType,
    (queryParams as any).factoryName,
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

  // ── 停滞订单检测（≥3天无新扫码）─────────────────────────────────────
  const stagnantOrderIds = useStagnantDetection(orders, boardTimesByOrder);
  const stagnantOrderIdSet = useMemo(() => new Set(stagnantOrderIds.keys()), [stagnantOrderIds]);

  // ── AI 交期风险地图（后台静默加载，5分钟缓存）────────────────────────
  const hasActiveOrders = orders.some(o => o.status !== 'completed');
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);

  // ── 分享订单给客户追踪链接（30天有效）────────────────────────────────
  const clearSmartFocus = useCallback(() => {
    setFocusedOrderId(null);
    setPendingScrollOrderId(null);
  }, []);

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

  const scrollToFocusedOrder = useCallback((orderId: string) => {
    const safeId = orderId.replace(/"/g, '\\"');
    const selector = viewMode === 'list'
      ? `tr[data-row-key="${safeId}"]`
      : `#progress-order-card-${safeId}`;
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
    setRemarkPopoverId, setRemarkText,
    stagnantOrderIds,
    deliveryRiskMap,
    onShareOrder: handleShareOrder,
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

          {bottleneckBannerVisible && bottleneckItems.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <Alert
                type={bottleneckItems.some(i => i.severity === 'critical') ? 'error' : 'warning'}
                showIcon
                action={(
                  <Button size="small" type="text" onClick={() => setBottleneckBannerVisible(false)}>
                    关闭
                  </Button>
                )}
                title={<span> 工序瓶颈：{bottleneckItems.length} 个阶段存在积压风险</span>}
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {bottleneckItems.slice(0, 4).map((it, idx) => (
                      <li key={idx}>
                        <b>{it.stageName}</b>
                        {it.backlog > 0 && <span style={{ marginLeft: 6, color: '#888' }}>积压 {it.backlog} 件</span>}
                        {it.suggestion && <span style={{ marginLeft: 6, color: '#666' }}>{it.suggestion}</span>}
                      </li>
                    ))}
                    {bottleneckItems.length > 4 && <li style={{ color: '#999' }}>还有 {bottleneckItems.length - 4} 个阶段...</li>}
                  </ul>
                }
              />
            </div>
          )}

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
              actions={(record: ProductionOrder) => {
                const frozen = isOrderFrozenByStatus(record);
                const frozenTitle = '订单已关单/报废/完成，无法操作';
                return [
                {
                  key: 'print',
                  label: '打印',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '打印',
                  iconOnly: true,
                  onClick: () => setPrintingRecord(record),
                },
                {
                  key: 'printLabel',
                  label: '打印标签',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '打印标签',
                  onClick: () => void handlePrintLabel(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  label: '编辑',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '编辑',
                  onClick: () => handleQuickEdit(record),
                },
                {
                  key: 'share',
                  label: '分享',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '分享',
                  onClick: () => handleShareOrder(record),
                },
              ].filter(Boolean);
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as ProductionOrder).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
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
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">生产进度</h2>
          </div>

          {/* 数据概览卡片 - 使用全局统计数据（不受分页影响，不受列设置控制） */}
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

          <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--neutral-light)' }}>
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
                    style={{ borderRadius: 16, minWidth: 32, width: 32, padding: 0 }}
                  />
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
          </div>

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

          {bottleneckBannerVisible && bottleneckItems.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <Alert
                type={bottleneckItems.some(i => i.severity === 'critical') ? 'error' : 'warning'}
                showIcon
                action={(
                  <Button size="small" type="text" onClick={() => setBottleneckBannerVisible(false)}>
                    关闭
                  </Button>
                )}
                title={<span> 工序瓶颈：{bottleneckItems.length} 个阶段存在积压风险</span>}
                description={
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {bottleneckItems.slice(0, 4).map((it, idx) => (
                      <li key={idx}>
                        <b>{it.stageName}</b>
                        {it.backlog > 0 && <span style={{ marginLeft: 6, color: '#888' }}>积压 {it.backlog} 件</span>}
                        {it.suggestion && <span style={{ marginLeft: 6, color: '#666' }}>{it.suggestion}</span>}
                      </li>
                    ))}
                    {bottleneckItems.length > 4 && <li style={{ color: '#999' }}>还有 {bottleneckItems.length - 4} 个阶段...</li>}
                  </ul>
                }
              />
            </div>
          )}

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
              actions={(record: ProductionOrder) => {
                const frozen = isOrderFrozenByStatus(record);
                const frozenTitle = '订单已关单/报废/完成，无法操作';
                return [
                {
                  key: 'print',
                  label: '打印',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '打印',
                  onClick: () => setPrintingRecord(record),
                },
                {
                  key: 'printLabel',
                  label: '打印标签',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '打印标签',
                  onClick: () => void handlePrintLabel(record),
                },
                ...(canManageOrderLifecycle ? [{
                  key: 'close',
                  label: '关单',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '关单',
                  onClick: () => handleCloseOrder(record),
                }] : []),
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  label: '编辑',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '编辑',
                  onClick: () => handleQuickEdit(record),
                },
                {
                  key: 'share',
                  label: '分享',
                  disabled: frozen,
                  title: frozen ? frozenTitle : '分享',
                  onClick: () => handleShareOrder(record),
                },
              ].filter(Boolean);
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as ProductionOrder).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
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

      {shareOrderDialog}

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

      {/* 打印标签（洗水唛 / U编码）双 Tab 弹窗 */}
      <LabelPrintModal
        open={labelPrintOpen}
        onClose={() => { setLabelPrintOpen(false); setLabelPrintOrder(null); setLabelPrintStyle(null); }}
        order={labelPrintOrder}
        styleInfo={labelPrintStyle}
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

      <RejectReasonModal
        open={pendingCloseOrder !== null}
        title={`确认关单：${pendingCloseOrder?.orderNo || ''}`}
        description={pendingCloseOrder ? (
          <div>
            <div>订单数量：{pendingCloseOrder.orderQty}</div>
            <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
            <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
            <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
            <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          </div>
        ) : undefined}
        fieldLabel="关闭原因（可选，将记录到操作日志）"
        required={false}
        okDanger={false}
        okText="确认关单"
        loading={closeOrderLoading}
        onOk={confirmCloseOrder}
        onCancel={cancelCloseOrder}
      />

    </div>
  );

  if (embedded) return pageContent;

  return <Layout>{pageContent}</Layout>;
};

export default ProgressDetail;
