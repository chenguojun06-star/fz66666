import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Button, Card, Input, Select, Tag, App, Dropdown, Checkbox, Alert, InputNumber, Badge, Tooltip, Tabs, Popover } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import PageStatCards from '@/components/common/PageStatCards';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import api, {
  isOrderFrozenByStatus,
  isOrderFrozenByStatusOrStock,
  parseProductionOrderLines,
  withQuery,
  isApiSuccess,
} from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { Dayjs } from 'dayjs';
import '../../../styles.css';
import dayjs from 'dayjs';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import SupplierSelect from '@/components/common/SupplierSelect';
import UniversalCardView from '@/components/common/UniversalCardView';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { ensureBoardStatsForOrder, clearBoardStatsTimestamps } from '../ProgressDetail/hooks/useBoardStats';
import { useDeliveryRiskMap, clearDeliveryRiskCache } from '../ProgressDetail/hooks/useDeliveryRiskMap';
import type { DeliveryRiskItem } from '@/services/intelligence/intelligenceApi';
import type { ProgressNode } from '../ProgressDetail/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { toCategoryCn } from '@/utils/styleCategory';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
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
import { safeString, getStatusConfig, mainStages } from './utils';
import { useProductionBoardStore } from '@/stores';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import SupplierScorecardPanel from '@/modules/intelligence/pages/IntelligenceCenter/SupplierScorecardPanel';

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
  const { message, modal } = App.useApp();
  const { isMobile } = useViewport();
  const quickEditModal = useModal<ProductionOrder>();
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const navigate = useNavigate();
  const location = useLocation();

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  // ===== 查询参数 =====
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10, includeScrapped: true });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [sortField, setSortField] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };
  // ===== 用户列表（跟单员筛选用）=====
  const [users, setUsers] = useState<Array<{ id: number; name: string; username: string }>>([]);
  useEffect(() => {
    api.get<{ code: number; data: { records: Array<{ id: number; name: string; username: string }> } }>(
      '/system/user/list', { params: { page: 1, pageSize: 1000, status: 'enabled' } }
    ).then(r => {
      if (r?.code === 200) setUsers(r.data.records || []);
    }).catch(() => {});
  }, []);

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
  };
  const [showDelayedOnly, setShowDelayedOnly] = useState(false);
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'delayed' | 'today'>('all');
  const [aiRiskFilter, setAiRiskFilter] = useState<'all' | 'overdue' | 'danger' | 'warning'>('all');

  // AI 交期风险数据（背景静默加载，不阻塞表格渲染）
  const hasActiveOrders = useMemo(() => productionList.some(o => o.status !== 'completed' && o.status !== 'COMPLETED'), [productionList]);
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);

  // AI 风险各级别计数
  const aiRiskCounts = useMemo(() => {
    const counts = { overdue: 0, danger: 0, warning: 0 };
    for (const o of productionList) {
      const risk = deliveryRiskMap.get(String(o.orderNo || ''));
      if (risk && risk.riskLevel !== 'safe') {
        counts[risk.riskLevel as keyof typeof counts]++;
      }
    }
    return counts;
  }, [productionList, deliveryRiskMap]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
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

  // 卡片进度：取 boardStats 实时扫码数据与 productionProgress DB值 的较大值
  const calcCardProgress = useCallback((record: ProductionOrder): number => {
    const dbProgress = Math.min(100, Math.max(0, Number(record.productionProgress) || 0));
    if (record.status === 'completed') return 100;
    const orderId = String(record.id || '');
    const stats = boardStatsByOrder[orderId];
    if (!stats) return dbProgress;
    const total = Math.max(1, Number(record.cuttingQuantity || record.orderQuantity) || 1);
    const PIPELINE = ['采购', '裁剪', '二次工艺', '绣花', '车缝', '尾部', '剪线', '整烫', '后整', '质检', '包装', '入库'];
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

  // 智能提示：催交 + 落后计数（仅当前页）
  const smartHints = useMemo(() => {
    const active = productionList.filter(o => o.status !== 'completed');
    const urgentCount = active.filter(o => {
      if (!o.plannedEndDate) return false;
      return dayjs(o.plannedEndDate).diff(dayjs(), 'day') <= 3;
    }).length;
    const behindCount = active.filter(o => {
      if (!o.plannedEndDate) return false;
      const daysLeft = dayjs(o.plannedEndDate).diff(dayjs(), 'day');
      return daysLeft <= 7 && (Number(o.productionProgress) || 0) < 50;
    }).length;
    return { urgentCount, behindCount };
  }, [productionList]);

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
    handleCloseOrder, handleScrapOrder, exportSelected,
    remarkPopoverId, setRemarkPopoverId, remarkText, setRemarkText, remarkSaving, handleRemarkSave,
  } = useProductionActions({ message, modal, isSupervisorOrAbove, fetchProductionList });

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

  // URL 参数解析
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        styleNo: styleNo || prev.styleNo,
        keyword: orderNo || prev.keyword,
      }));
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

  // 排序：已关单/已完成始终排到最后，其余按选择字段排序；支持 AI 交期风险筛选
  const sortedProductionList = useMemo(() => {
    let filtered = [...productionList];
    // AI 交期风险层居筛选
    if (aiRiskFilter !== 'all' && deliveryRiskMap.size > 0) {
      filtered = filtered.filter(o => {
        const risk = deliveryRiskMap.get(String(o.orderNo || ''));
        return risk?.riskLevel === aiRiskFilter;
      });
    }
    filtered.sort((a: any, b: any) => {
      const aClose = (a.actualEndDate || a.status === 'CLOSED' || a.status === 'closed' || a.status === 'completed') ? 1 : 0;
      const bClose = (b.actualEndDate || b.status === 'CLOSED' || b.status === 'closed' || b.status === 'completed') ? 1 : 0;
      if (aClose !== bClose) return aClose - bClose;
      if (sortField === 'createTime') {
        const aTime = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bTime = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });
    return filtered;
  }, [productionList, sortField, sortOrder, showDelayedOnly, activeStatFilter, aiRiskFilter, deliveryRiskMap]);

  // 表格列渲染辅助
  const allColumns = useProductionColumns({
    sortField, sortOrder, handleSort,
    handleCloseOrder, handleScrapOrder, handleTransferOrder,
    navigate, openProcessDetail, syncProcessFromTemplate,
    setPrintModalVisible, setPrintingRecord,
    setRemarkPopoverId, setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
    deliveryRiskMap,
  });

  // 根据 visibleColumns 过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  // 点击统计卡片筛选
  const handleStatClick = (type: 'all' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 } as any);
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams({ ...queryParams, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 } as any);
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 } as any);
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

          {/* 智能提示条 */}
          {(smartHints.urgentCount > 0 || smartHints.behindCount > 0) && (
            <div style={{
              display: 'flex', gap: 12, flexWrap: 'wrap',
              margin: '0 0 8px 0',
              padding: '8px 14px',
              background: 'linear-gradient(90deg, #fff9f0 0%, #fff0f0 100%)',
              border: '1px solid #ffd591',
              borderRadius: 8,
              fontSize: 13,
            }}>
              <span style={{ color: '#595959', fontWeight: 500 }}>⚡ 智能提示：</span>
              {smartHints.urgentCount > 0 && (
                <span style={{ color: '#d46b08' }}>
                  📅 今日有 <strong>{smartHints.urgentCount}</strong> 单需3天内交货
                </span>
              )}
              {smartHints.urgentCount > 0 && smartHints.behindCount > 0 && <span style={{ color: '#d9d9d9' }}>·</span>}
              {smartHints.behindCount > 0 && (
                <span style={{ color: '#cf1322' }}>
                  📉 <strong>{smartHints.behindCount}</strong> 单进度严重落后
                </span>
              )}
            </div>
          )}

          {/* AI 交期风险快速筛选 */}
          {deliveryRiskMap.size > 0 && (aiRiskCounts.overdue > 0 || aiRiskCounts.danger > 0 || aiRiskCounts.warning > 0) && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
              margin: '0 0 8px', padding: '7px 14px',
              background: 'linear-gradient(90deg, #f0f5ff 0%, #fff9f0 100%)',
              border: '1px solid #d6e4ff', borderRadius: 8, fontSize: 13,
            }}>
              <span style={{ color: '#595959', fontWeight: 600, fontSize: 12 }}>🤖 AI交期预测：</span>
              {([
                { key: 'all',    label: '全部', color: aiRiskFilter === 'all' ? 'blue' : 'default' },
                { key: 'overdue', label: `🔴 预测逾期 ${aiRiskCounts.overdue}`, color: aiRiskFilter === 'overdue' ? 'red' : 'default', show: aiRiskCounts.overdue > 0 },
                { key: 'danger',  label: `🟠 存在风险 ${aiRiskCounts.danger}`, color: aiRiskFilter === 'danger' ? 'orange' : 'default', show: aiRiskCounts.danger > 0 },
                { key: 'warning', label: `🟡 需关注 ${aiRiskCounts.warning}`, color: aiRiskFilter === 'warning' ? 'gold' : 'default', show: aiRiskCounts.warning > 0 },
              ] as const).filter((item: any) => item.key === 'all' || item.show).map((item: any) => (
                <Tag
                  key={item.key}
                  color={item.color}
                  style={{ cursor: 'pointer', userSelect: 'none', margin: 0 }}
                  onClick={() => setAiRiskFilter(item.key as typeof aiRiskFilter)}
                >
                  {item.label}
                </Tag>
              ))}
              <span style={{ fontSize: 11, color: '#8c8c8c', marginLeft: 4 }}>
                · 基于扫码速度 + 历史工效预测
              </span>
            </div>
          )}

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
                    onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                    statusOptions={[
                      { label: '全部', value: '' },
                      { label: '待生产', value: 'pending' },
                      { label: '生产中', value: 'production' },
                      { label: '已完成', value: 'completed' },
                      { label: '已逾期', value: 'delayed' },
                      { label: '已取消', value: 'cancelled' },
                    ]}
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
                  <Select
                    value={queryParams.merchandiser || ''}
                    onChange={(value) => setQueryParams({ ...queryParams, merchandiser: value || undefined, page: 1 })}
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
                onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
              }}
            />
          ) : (
            <UniversalCardView
              dataSource={sortedProductionList}
              columns={isMobile ? 2 : 6}
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
                      const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string);
                      return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>;
                    }
                  }
                ]
              ]}
              progressConfig={{
                calculate: calcCardProgress,
                getStatus: (record: ProductionOrder) => getProgressColorStatus(record.plannedEndDate),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
                show: true,
                type: 'liquid',
              }}
              actions={(record: ProductionOrder) => [
                { key: 'print', label: '打印', onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); } },
                { key: 'close', label: '关单', onClick: () => { handleCloseOrder(record); } },
                { key: 'divider1', type: 'divider' as const, label: '' },
                { key: 'edit', label: '编辑', onClick: () => { quickEditModal.open(record); } },
              ].filter(Boolean)}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as any).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
            />
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

        {/* 工厂实力评分卡：订单列表页底部，接单/选巧工厂时参考各巧工厂历史评分 */}
        <div style={{ padding: '16px 0 0' }}>
          <SupplierScorecardPanel />
        </div>
    </Layout>
  );
};

export default ProductionList;
