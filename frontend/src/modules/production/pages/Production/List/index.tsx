import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button, Input, Select, Tag, App, Popover, Checkbox, Segmented } from 'antd';

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
  useCardProgress,
  useNodeDetailModal,
  useLabelPrint,
  useOrderFocus,
  useAnomalyDetection,
} from './hooks';
import { safeString } from './utils';
import TransferOrderModal from './TransferOrderModal';
import AnomalyBanner from './AnomalyBanner';
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

    // ===== Hook 提取：进度/弹窗/打印/聚焦 =====
    const orderFocusRef = useRef<{ triggerOrderFocus: (...args: any[]) => void; clearSmartFocus: () => void } | null>(null);
    const { clearAllBoardCache, boardStatsByOrder: _boardStatsByOrder, boardTimesByOrder, boardStatsLoadingByOrder: _boardStatsLoadingByOrder, mergeBoardStatsForOrder, mergeBoardTimesForOrder, setBoardLoadingForOrder, mergeProcessDataForOrder, boardStatsByOrderRef, boardStatsLoadingByOrderRef, calcCardProgress } = useCardProgress();
    const { nodeDetailVisible, nodeDetailOrder, nodeDetailType, nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList, openNodeDetail, closeNodeDetail } = useNodeDetailModal();
    const { labelPrintOpen, closeLabelPrint, labelPrintOrder, labelPrintStyle, handlePrintLabel } = useLabelPrint();

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
  const [_selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
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

  // AI 交期风险数据（背景静默加载，不阻塞表格渲染）
  const hasActiveOrders = useMemo(() => productionList.some(o => o.status !== 'completed'), [productionList]);
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);

  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

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
      triggerOrderFocus: (...args: any[]) => orderFocusRef.current?.triggerOrderFocus(...args),
      clearFocus: () => orderFocusRef.current?.clearSmartFocus(),
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
    exportSelected: _exportSelected,
    remarkPopoverId, setRemarkPopoverId, remarkText, setRemarkText, remarkSaving, handleRemarkSave,
    handleCopyOrder,
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
    // URL factoryName 参数 → 按工厂过滤（来自仪表盘延期订单分布点击跳转）
    const factoryNameParam = (params.get('factoryName') || '').trim();
    if (factoryNameParam) {
      setQueryParams((prev) => {
        if ((prev.factoryName || '') === factoryNameParam) return prev;
        return { ...prev, factoryName: factoryNameParam, page: 1 };
      });
    }
  }, [location.search]);

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

  // WebSocket进度变更即时刷新
  const wsRefreshRef = useRef(0);
  useEffect(() => {
    const handleProgressChanged = () => {
      wsRefreshRef.current += 1;
      fetchProductionList();
    };
    window.addEventListener('order:progress:changed', handleProgressChanged);
    return () => window.removeEventListener('order:progress:changed', handleProgressChanged);
  }, [fetchProductionList]);

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

  // ===== useOrderFocus: 聚焦/滚动/高亮逻辑 =====
  const { focusedOrderId, pendingScrollOrderId: _pendingScrollOrderId, getOrderDomKey, triggerOrderFocus, clearSmartFocus, scrollToFocusedOrder: _scrollToFocusedOrder } = useOrderFocus(viewMode, sortedProductionList);
  orderFocusRef.current = { triggerOrderFocus, clearSmartFocus };

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

  // ===== useAnomalyDetection: 异常检测横幅 =====
  const { anomalyItems, anomalyBannerVisible, setAnomalyBannerVisible, fetchAnomalies, handleAnomalyClick } = useAnomalyDetection({
    productionList, message, navigate, setActiveStatFilter, setShowDelayedOnly, setSmartQueueFilter, setQueryParams, triggerOrderFocus,
  });

  // 首次加载到订单后，静默触发异常检测（仅检测一次，不阻塞主列表）
  useEffect(() => {
    if (productionList.length > 0) void fetchAnomalies();
  }, [productionList.length]);

  // 表格列渲染辅助
  const allColumns = useProductionColumns({
    sortField, sortOrder, handleSort,
    handleCloseOrder, handleScrapOrder, handleTransferOrder, handleCopyOrder,
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
                    label="导出"
                    url="/api/production/order/export-excel"
                    params={queryParams as unknown as Record<string, string>}
                    type="primary"
                    size="middle"
                  />
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
                getStatus: (record: ProductionOrder) => (isOrderFrozenByStatus(record) ? 'default' : getProgressColorStatus(record.plannedEndDate, record.status)),
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
          onClose={closeLabelPrint}
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
        title={pendingCloseOrder?.isSpecial ? '特需关单确认' : `确认关单：${safeString((pendingCloseOrder?.order as any)?.orderNo)}`}
        description={pendingCloseOrder ? (
          <div>
            {pendingCloseOrder.isSpecial && (
              <div style={{ color: '#faad14', marginBottom: 8 }}>
                ⚠️ 该订单未满足关单条件（合格入库 {pendingCloseOrder.warehousingQualified}/{pendingCloseOrder.minRequired}），特需关单不可撤销，请填写原因。
              </div>
            )}
            <div>订单数量：{pendingCloseOrder.orderQty}</div>
            <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
            <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
            <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
            <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          </div>
        ) : null}
        fieldLabel={pendingCloseOrder?.isSpecial ? '特需原因' : '关闭原因'}
        placeholder={pendingCloseOrder?.isSpecial ? '请说明特需关单具体原因（必填）' : undefined}
        required={!!pendingCloseOrder?.isSpecial}
        okDanger={false}
        okText={pendingCloseOrder?.isSpecial ? '确认特需关单' : '确认关单'}
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
