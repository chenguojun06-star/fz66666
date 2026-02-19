import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Card, Form, Grid, Input, Modal, Popover, Space, Tag, Tooltip } from 'antd';
import type { InputRef } from 'antd';
import { AppstoreOutlined, UnorderedListOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import UniversalCardView from '@/components/common/UniversalCardView';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import { StyleCoverThumb } from '@/components/StyleAssets';
import api, { generateRequestId, isDuplicateScanMessage, isOrderFrozenByStatus, parseProductionOrderLines, isApiSuccess } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime, formatDateTimeCompact } from '@/utils/datetime';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { CuttingBundle, ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import type { StyleProcess, TemplateLibrary } from '@/types/style';

import { productionCuttingApi, productionOrderApi, productionScanApi, productionWarehousingApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

import {
  defaultNodes,
  stripWarehousingNode,
  formatTime,
  getOrderShipTime,
  getNodeIndexFromProgress,
  parseProgressNodes,
  findPricingProcessForStage,
  getProgressFromNodeIndex,
  formatTimeCompact,
  getQuotationUnitPriceForOrder,
  getCloseMinRequired,
  calculateProgressFromBundles,
  resolveNodesForOrder,
  resolveNodesForListOrder,
  getCurrentWorkflowNodeForOrder,
} from './utils';
import { ProgressNode } from './types';
import ScanEntryModal from './components/ScanEntryModal';
import ScanConfirmModal from './components/ScanConfirmModal';
import RollbackModal from './components/RollbackModal';
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
import {
  fetchScanHistory as fetchScanHistoryHelper,
  fetchCuttingBundles as fetchCuttingBundlesHelper,
  fetchPricingProcesses as fetchPricingProcessesHelper,
} from './helpers/fetchers';
import { fetchNodeOperations } from './helpers/nodeOperations';

const { useBreakpoint } = Grid;







/**
 * 生产进度详情组件属性
 */
type ProgressDetailProps = {
  /** 是否内嵌显示 */
  embedded?: boolean;
};

/**
 * 生产进度详情组件
 * 用于展示和管理生产订单的详细进度信息，包括扫码记录、裁剪扎号、进度节点等
 */
const ProgressDetail: React.FC<ProgressDetailProps> = ({ embedded }) => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const { modalWidth } = useViewport();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUserFn(user), [user]);
  const location = useLocation();
  const screens = useBreakpoint();
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10, keyword: '' });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [_showDelayedOnly, setShowDelayedOnly] = useState(false); // 是否只显示延期订单
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'delayed' | 'today'>('all'); // 当前激活的统计卡片筛选

  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);

  // 全局统计数据（从API获取，不受分页影响）
  const [globalStats, setGlobalStats] = useState<{
    totalOrders: number;
    totalQuantity: number;
    delayedOrders: number;
    delayedQuantity: number;
    todayOrders: number;
    todayQuantity: number;
  }>({ totalOrders: 0, totalQuantity: 0, delayedOrders: 0, delayedQuantity: 0, todayOrders: 0, todayQuantity: 0 });

  // ===== 详情弹窗相关状态已删除 =====
  // detailOpen 已移除，activeOrder和scanHistory保留用于快速编辑和进度统计
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);

  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [nodeOps, setNodeOps] = useState<Record<string, any>>({});
  const [_inlineSaving, setInlineSaving] = useState(false);

  const [nodes, setNodes] = useState<ProgressNode[]>(defaultNodes);
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  const [nodeWorkflowLocked, setNodeWorkflowLocked] = useState(false);
  const [nodeWorkflowSaving, setNodeWorkflowSaving] = useState(false);
  const [_nodeWorkflowDirty, setNodeWorkflowDirty] = useState(false);
  const [boardStatsByOrder, setBoardStatsByOrder] = useState<Record<string, Record<string, number>>>({});
  const [boardTimesByOrder, setBoardTimesByOrder] = useState<Record<string, Record<string, string>>>({});
  const boardStatsLoadingRef = useRef<Record<string, boolean>>({});

  const [_progressTemplates, setProgressTemplates] = useState<TemplateLibrary[]>([]);
  const [progressTemplateId, setProgressTemplateId] = useState<string | undefined>(undefined);
  const [_templateApplying, setTemplateApplying] = useState(false);

  const [_processPriceTemplates, setProcessPriceTemplates] = useState<TemplateLibrary[]>([]);
  const [processPriceTemplateId, setProcessPriceTemplateId] = useState<string | undefined>(undefined);
  const [_processPriceApplying, setProcessPriceApplying] = useState(false);

  const [pricingProcesses, setPricingProcesses] = useState<StyleProcess[]>([]);
  const [pricingProcessLoading, setPricingProcessLoading] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanForm] = Form.useForm();
  const scanInputRef = useRef<InputRef>(null);
  const scanSubmittingRef = useRef(false);
  const orderSyncingRef = useRef(false);
  const activeOrderRef = useRef<ProductionOrder | null>(null);
  const lastFailedRequestRef = useRef<{ key: string; requestId: string } | null>(null);
  const {
    state: scanConfirmState,
    openConfirm: openScanConfirm,
    closeConfirm: closeScanConfirmState,
    setLoading: setScanConfirmLoading,
  } = useScanConfirm();

  const [scanBundlesExpanded, setScanBundlesExpanded] = useState(false);
  const [bundleSelectedQr, setBundleSelectedQr] = useState('');

  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackMode, setRollbackMode] = useState<'step' | 'bundle'>('step');
  const [rollbackOrder, setRollbackOrder] = useState<ProductionOrder | null>(null);
  const [rollbackStepMeta, setRollbackStepMeta] = useState<{ nextProgress: number; nextProcessName: string } | null>(null);
  const [rollbackSubmitting, setRollbackSubmitting] = useState(false);
  const [rollbackBundlesLoading, setRollbackBundlesLoading] = useState(false);
  const [rollbackBundles, setRollbackBundles] = useState<CuttingBundle[]>([]);
  const [rollbackForm] = Form.useForm();

  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<ProductionOrder | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 跟单员备注异常状态
  const [remarkPopoverId, setRemarkPopoverId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  // 打印功能状态
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  // 监听 printingRecord 变化，打开打印弹窗
  useEffect(() => {
    if (printingRecord) {
      setPrintModalVisible(true);
    }
  }, [printingRecord]);

  // 节点详情弹窗状态
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailOrder, setNodeDetailOrder] = useState<ProductionOrder | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState<string>('');
  const [nodeDetailName, setNodeDetailName] = useState<string>('');
  const [nodeDetailStats, setNodeDetailStats] = useState<{ done: number; total: number; percent: number; remaining: number } | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<{ id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]>([]);

  const [orderSortField, setOrderSortField] = useState<string>('createTime');
  const [orderSortOrder, setOrderSortOrder] = useState<'asc' | 'desc'>('desc');

  const statusOptions = useMemo(() => ([
    { label: '全部', value: '' },
    { label: '待生产', value: 'pending' },
    { label: '生产中', value: 'production' },
    { label: '已完成', value: 'completed' },
    { label: '已逾期', value: 'delayed' },
    { label: '已取消', value: 'cancelled' },
  ]), []);

  const handleOrderSort = (field: string, order: 'asc' | 'desc') => {
    setOrderSortField(field);
    setOrderSortOrder(order);
  };

  // 处理统计卡片点击
  const handleStatClick = (type: 'all' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setShowDelayedOnly(false);
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 } as any));
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 } as any));
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams((prev) => ({ ...prev, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 } as any));
    }
  };

  // 打开节点详情弹窗
  const openNodeDetail = useCallback((
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { id?: string; processCode?: string; code?: string; name: string; unitPrice?: number }[]
  ) => {
    setNodeDetailOrder(order);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailVisible(true);
  }, []);

  const queryParamsRef = useRef(queryParams);
  const dateRangeRef = useRef(dateRange);

  useEffect(() => {
    queryParamsRef.current = queryParams;
  }, [queryParams]);

  useEffect(() => {
    dateRangeRef.current = dateRange;
  }, [dateRange]);


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

        const styleNos = Array.from(
          new Set(
            records
              .map((r) => String(r.styleNo || '').trim())
              .filter((sn) => sn)
              .filter((sn) => !progressNodesByStyleNoRef.current[sn])
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
                    return { id, name, unitPrice };
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
        message.error(result.message || '获取生产订单失败');
      }
    } catch (err: any) {
      if (!silent) {
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
    // 使用稳定的值，null 转换为固定字符串
    dateRange?.[0]?.valueOf() ?? 'null-start',
    dateRange?.[1]?.valueOf() ?? 'null-end'
  ]);

  useEffect(() => {
    progressNodesByStyleNoRef.current = progressNodesByStyleNo;
  }, [progressNodesByStyleNo]);

  useEffect(() => {
    activeOrderRef.current = activeOrder;
  }, [activeOrder]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = String(params.get('styleNo') || '').trim();
    const orderNo = String(params.get('orderNo') || '').trim();
    if (!styleNo && !orderNo) return;
    const keyword = orderNo || styleNo;
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      keyword,
      orderNo: undefined,
      styleNo: undefined,
      factoryName: undefined,
    }));
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        const res = await templateLibraryApi.listByType('progress');
        const result = res as Record<string, unknown>;
        if (result.code === 200) {
          setProgressTemplates(Array.isArray(result.data) ? result.data : []);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await templateLibraryApi.listByType('process_price');
        const result = res as Record<string, unknown>;
        if (result.code === 200) {
          setProcessPriceTemplates(Array.isArray(result.data) ? result.data : []);
        }
      } catch {
        // Intentionally empty
        // 忽略错误
      }
    })();
  }, []);

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

  const lockNodeWorkflow = () => {
    setNodeWorkflowLocked(true);
    setNodeWorkflowDirty(false);
  };


  const boardStatsByOrderRef = useRef<Record<string, Record<string, number>>>({});
  useEffect(() => {
    boardStatsByOrderRef.current = boardStatsByOrder;
  }, [boardStatsByOrder]);

  useEffect(() => {
    if (!orders.length) return;
    const queue = orders.slice(0, Math.min(20, orders.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o, progressNodesByStyleNo, defaultNodes));
        await ensureBoardStatsForOrder({
          order: o,
          nodes: ns,
          boardStatsByOrderRef,
          boardStatsLoadingRef,
          setBoardStatsByOrder,
          setBoardTimesByOrder,
        });
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orders, progressNodesByStyleNo]);

  const saveNodes = (next: ProgressNode[]) => {
    const stripped = stripWarehousingNode(next);
    setNodes(stripped.length ? stripped : defaultNodes);
  };

  const fetchScanHistory = (order: ProductionOrder, options?: { silent?: boolean }) =>
    fetchScanHistoryHelper({ order, setScanHistory, message, options });

  const fetchCuttingBundles = (order: ProductionOrder) =>
    fetchCuttingBundlesHelper({ order, setCuttingBundles, setCuttingBundlesLoading, message });

  const fetchPricingProcesses = (order: ProductionOrder) =>
    fetchPricingProcessesHelper({ order, setPricingProcesses, setPricingProcessLoading });

  const currentInlineNode = useMemo(() => {
    return getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
  }, [activeOrder, progressNodesByStyleNo, nodes]);

  useInlineNodeOps({
    activeOrder,
    currentInlineNode,
    nodeOps,
    setNodeOps,
    setInlineSaving,
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

  const closeScan = () => {
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

  const closeRollback = () => {
    setRollbackOpen(false);
    setRollbackMode('step');
    setRollbackOrder(null);
    setRollbackStepMeta(null);
    setRollbackSubmitting(false);
    rollbackForm.resetFields();
    setRollbackBundles([]);
  };

  const loadRollbackBundles = async (order: ProductionOrder) => {
    if (!order?.id) return;
    setRollbackBundlesLoading(true);
    try {
      const res = await productionCuttingApi.list({
        page: 1,
        pageSize: 10000,
        orderNo: String(order.orderNo || '').trim() || undefined,
        orderId: String(order.id || '').trim() || undefined,
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const records = Array.isArray((result.data as any)?.records) ? ((result.data as any).records as CuttingBundle[]) : [];
        records.sort((a, b) => (Number(a?.bundleNo) || 0) - (Number(b?.bundleNo) || 0));
        setRollbackBundles(records);
      } else {
        setRollbackBundles([]);
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      setRollbackBundles([]);
    } finally {
      setRollbackBundlesLoading(false);
    }
  };

  const handleRollbackModeChange = useCallback((next: 'step' | 'bundle') => {
    setRollbackMode(next);
    rollbackForm.resetFields();
    if (next === 'bundle' && rollbackOrder) {
      void loadRollbackBundles(rollbackOrder);
    }
  }, [rollbackOrder, rollbackForm]);

  const openRollback = (order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限回流');
      return;
    }
    const effectiveNodes = stripWarehousingNode(resolveNodesForListOrder(order, progressNodesByStyleNo, defaultNodes));
    const idx = getNodeIndexFromProgress(effectiveNodes, Number(order.productionProgress) || 0);
    if (idx <= 0) {
      message.info('当前已是第一步');
      return;
    }
    const nextIdx = idx - 1;
    const nextProgress = getProgressFromNodeIndex(effectiveNodes, nextIdx);
    const nextProcessName = String(effectiveNodes[nextIdx]?.name || '上一步').trim() || '上一步';

    setRollbackOrder(order);
    setRollbackStepMeta({ nextProgress, nextProcessName });
    setRollbackMode('step');
    setRollbackOpen(true);
    setRollbackBundles([]);
    rollbackForm.resetFields();
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
    bundleDoneByQrForSelectedNode,
    bundleMetaByQrForSelectedNode,
    bundleSummary,
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

  const submitScan = useSubmitScan({
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

  const currentNodeIdx = useMemo(() => {
    return getNodeIndexFromProgress(nodes, Number(activeOrder?.productionProgress) || 0);
  }, [nodes, activeOrder?.productionProgress]);

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



  // ===== handleViewScanHistory 和 handleViewDetail 函数已删除 =====

  // 快速编辑
  const handleQuickEdit = (order: ProductionOrder) => {
    setQuickEditRecord(order);
    setQuickEditVisible(true);
  };

  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: quickEditRecord?.id,
        ...values,
      });
      message.success('编辑成功');
      setQuickEditVisible(false);
      setQuickEditRecord(null);
      await fetchOrders();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '编辑失败');
      throw err;
    } finally {
      setQuickEditSaving(false);
    }
  };

  // 跟单员备注异常保存
  const handleRemarkSave = async (orderId: string) => {
    setRemarkSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: orderId,
        remarks: remarkText.trim(),
      });
      message.success('备注已保存');
      setRemarkPopoverId(null);
      setRemarkText('');
      await fetchOrders();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败');
    } finally {
      setRemarkSaving(false);
    }
  };

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

  const columns: any[] = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ProductionOrder) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={(record as any).styleCover || null}
          size={48}
          borderRadius={6}
        />
      ),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 160,
      render: (v: any) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (v: any) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 120,
      render: (v: any, record: ProductionOrder) => {
        const name = String(v || '').trim();
        const remark = String((record as Record<string, unknown>).remarks || '').trim();
        const orderId = String(record.id || '');
        const isOpen = remarkPopoverId === orderId;

        const remarkContent = (
          <div style={{ width: 220 }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: '#1f2937' }}>
              <ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 4 }} />
              备注异常
            </div>
            <Input.TextArea
              value={isOpen ? remarkText : remark}
              onChange={(e) => setRemarkText(e.target.value)}
              rows={3}
              maxLength={200}
              showCount
              placeholder="请输入异常备注..."
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button
                size="small"
                onClick={() => { setRemarkPopoverId(null); setRemarkText(''); }}
              >
                取消
              </Button>
              <Button
                type="primary"
                size="small"
                loading={remarkSaving}
                onClick={() => handleRemarkSave(orderId)}
              >
                保存
              </Button>
            </div>
          </div>
        );

        return (
          <div style={{ position: 'relative', lineHeight: 1.3 }}>
            <Popover
              content={remarkContent}
              trigger="click"
              open={isOpen}
              onOpenChange={(open) => {
                if (open) {
                  setRemarkPopoverId(orderId);
                  setRemarkText(remark);
                } else {
                  setRemarkPopoverId(null);
                  setRemarkText('');
                }
              }}
              placement="bottom"
            >
              <Tooltip title={remark ? `备注：${remark}` : '点击添加备注'} placement="top">
                <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 500, color: '#1f2937' }}>{name || '-'}</span>
                  {remark && (
                    <Badge
                      dot
                      color="#ef4444"
                      offset={[0, -2]}
                    >
                      <ExclamationCircleOutlined style={{ fontSize: 12, color: '#ef4444' }} />
                    </Badge>
                  )}
                </div>
              </Tooltip>
            </Popover>
            {/* 备注摘要（名字下方显示） */}
            {remark && (
              <Tooltip title={remark} placement="bottom">
                <div style={{
                  fontSize: 10,
                  color: '#ef4444',
                  fontWeight: 500,
                  lineHeight: 1.2,
                  marginTop: 2,
                  maxWidth: 100,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}>
                  {remark.length > 6 ? remark.substring(0, 6) + '...' : remark}
                </div>
              </Tooltip>
            )}
          </div>
        );
      },
    },
    {
      title: '下单人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      width: 100,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: (
        <Tooltip title="款式报价单单价（BOM+工序成本合计含利润）">
          <span>单价</span>
        </Tooltip>
      ),
      key: 'quotationUnitPrice',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => {
        const v = getQuotationUnitPriceForOrder(record);
        return v > 0 ? (
          <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>¥{v.toFixed(2)}</span>
        ) : (
          <span style={{ color: 'var(--neutral-text-secondary)' }}>未报价</span>
        );
      },
    },
    {
      title: '入库数量',
      key: 'warehousingQualifiedQuantity',
      width: 110,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => Number((record as Record<string, unknown>).warehousingQualifiedQuantity) || 0,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 200,
      ellipsis: true,
    },
    {
      title: '下单时间',
      key: 'createTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => formatTime(record.createTime),
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 150,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: <SortableColumnTitle title="预计出货" fieldName="expectedShipDate" onSort={handleOrderSort} sortField={orderSortField} sortOrder={orderSortOrder} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '订单交期',
      key: 'shipTime',
      width: 170,
      render: (_: any, record: ProductionOrder) => formatTime(getOrderShipTime(record)),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: ProductionOrder['status']) => {
        const map: any = {
          pending: { color: 'default', label: '待开始' },
          production: { color: 'success', label: '生产中' },
          completed: { color: 'default', label: '已完成' },
          delayed: { color: 'warning', label: '延期' },
        };
        const t = map[value] || { color: 'default', label: value };
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '生产进度',
      key: 'progressNodes',
      width: 900,
      align: 'center' as const,
      render: (_: any, record: ProductionOrder) => {
        // 获取该订单的工序节点
        const ns = stripWarehousingNode(resolveNodesForListOrder(record, progressNodesByStyleNo, defaultNodes));
        const totalQty = Number(record.cuttingQuantity || record.orderQuantity) || 0;
        const nodeDoneMap = boardStatsByOrder[String(record.id || '')];
        const nodeTimeMap = boardTimesByOrder[String(record.id || '')];

        // 空数据提示
        if (!ns || ns.length === 0) {
          return (
            <div style={{ color: 'var(--neutral-text-disabled)', fontSize: "var(--font-size-base)", padding: '20px 0' }}>
              暂无工序进度数据
            </div>
          );
        }

        // 格式化完成时间为简洁格式 MM-DD HH:mm
        const formatCompletionTime = (timeStr: string) => {
          if (!timeStr) return '';
          try {
            const d = new Date(timeStr);
            if (isNaN(d.getTime())) return '';
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mi = String(d.getMinutes()).padStart(2, '0');
            return `${mm}-${dd} ${hh}:${mi}`;
          } catch { return ''; }
        };

        return (
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'flex-start',
            justifyContent: 'space-evenly',
            padding: '12px 8px',
            width: '100%',
          }}>
            {ns.map((node: ProgressNode, index: number) => {
              const nodeName = node.name || '-';
              const nodeQty = totalQty;
              const completedQty = nodeDoneMap?.[nodeName] || 0;
              // 修复：添加100%上限，避免超过100%的情况
              const percent = nodeQty > 0
                ? Math.min(100, Math.round((completedQty / nodeQty) * 100))
                : 0;
              const remaining = nodeQty - completedQty;
              const completionTime = nodeTimeMap?.[nodeName] || '';
              // 将节点名称映射到节点类型
              const nodeTypeMap: Record<string, string> = {
                '采购': 'procurement', '物料': 'procurement', '备料': 'procurement',
                '裁剪': 'cutting', '裁床': 'cutting', '剪裁': 'cutting', '开裁': 'cutting',
                '缝制': 'sewing', '车缝': 'sewing', '缝纫': 'sewing', '车工': 'sewing',
                '整烫': 'ironing', '熨烫': 'ironing', '大烫': 'ironing',
                '质检': 'quality', '检验': 'quality', '品检': 'quality', '验货': 'quality',
                '包装': 'packaging', '后整': 'packaging', '打包': 'packaging', '装箱': 'packaging',
                '二次工艺': 'secondaryProcess', '绣花': 'secondaryProcess', '印花': 'secondaryProcess',
                '入库': 'warehousing', '仓库': 'warehousing',
              };
              const nodeType = nodeTypeMap[nodeName] || nodeName.toLowerCase();

              return (
                <div
                  key={node.id || index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    flex: 1,
                    cursor: 'pointer',
                    padding: 4,
                    transition: 'background 0.2s',
                  }}
                  onClick={() => openNodeDetail(
                    record,
                    nodeType,
                    nodeName,
                    { done: completedQty, total: nodeQty, percent, remaining },
                    node.unitPrice,
                    ns.map(n => ({
                      id: String(n.id || '').trim() || undefined,
                      processCode: String(n.id || '').trim() || undefined,
                      name: n.name,
                      unitPrice: n.unitPrice,
                    }))
                  )}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-bg-base)'; }}
                  title={completionTime ? `${nodeName} 完成时间：${completionTime}\n点击查看详情` : `点击查看 ${nodeName} 详情`}
                >
                  {/* 完成时间（显示在进度球上方） */}
                  {completionTime ? (
                    <div style={{
                      fontSize: 10,
                      color: percent >= 100 ? '#10b981' : '#6b7280',
                      fontWeight: percent >= 100 ? 600 : 400,
                      lineHeight: 1.2,
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      marginBottom: 2,
                    }}>
                      {formatCompletionTime(completionTime)}
                    </div>
                  ) : (
                    <div style={{ fontSize: 10, color: '#d1d5db', lineHeight: 1.2, marginBottom: 2 }}>
                      --
                    </div>
                  )}
                  <LiquidProgressLottie
                    progress={percent}
                    size={60}
                    nodeName={nodeName}
                    text={`${completedQty}/${nodeQty}`}
                    color1={
                      percent >= 100
                        ? '#d1d5db'
                        : (() => {
                          const shipDate = record.expectedShipDate;
                          if (!shipDate) return '#10b981';
                          const now = new Date();
                          const delivery = new Date(shipDate as string);
                          const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          if (diffDays < 0) return '#dc2626'; // 延期深红
                          if (diffDays <= 3) return '#d97706'; // 预警橙黄
                          return '#10b981'; // 正常翠绿
                        })()
                    }
                    color2={
                      percent >= 100
                        ? '#e5e7eb'
                        : (() => {
                          const shipDate = record.expectedShipDate;
                          if (!shipDate) return '#6ee7b7';
                          const now = new Date();
                          const delivery = new Date(shipDate as string);
                          const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          if (diffDays < 0) return '#f87171'; // 延期浅红
                          if (diffDays <= 3) return '#fbbf24'; // 预警浅黄
                          return '#6ee7b7'; // 正常浅绿
                        })()
                    }
                  />
                </div>
              );
            })}
          </div>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 140,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        return (
          <RowActions
            actions={[
              // 明细按钮已删除（详情弹窗功能）
              {
                key: 'print',
                label: '打印',
                title: frozen ? '打印（订单已关单）' : '打印',
                disabled: frozen,
                onClick: () => setPrintingRecord(record),
                primary: true,
              },
              {
                key: 'edit',
                label: '编辑',
                title: frozen ? '编辑（订单已关单）' : '编辑',
                disabled: frozen,
                onClick: () => {
                  setQuickEditRecord(record);
                  setQuickEditVisible(true);
                },
              },
              {
                key: 'register',
                label: '登记',
                title: frozen ? '登记（已完成）' : '登记',
                disabled: frozen,
                onClick: () => void openScan(record),
                primary: true,
              },
              ...(isSupervisorOrAbove
                ? [
                  {
                    key: 'close',
                    label: '关单',
                    disabled: frozen,
                    onClick: () => handleCloseOrder(record),
                  },
                ]
                : []),
              ...(isSupervisorOrAbove
                ? [
                  {
                    key: 'reflow',
                    label: '回流',
                    title: frozen ? '回流（订单已关单）' : '回流',
                    disabled: frozen,
                    onClick: () => void openRollback(record),
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  // ===== detailNodeCards (useMemo) 已删除 =====
  // ===== 自动打开详情弹窗的逻辑已删除 =====
  // autoOpenDetailOnceRef 和 useEffect 已移除（详情弹窗功能）

  // 根据API筛选结果显示订单（筛选已在后端完成）
  const displayOrders = useMemo(() => {
    return orders;
  }, [orders]);

  const pageContent = (
    <div className="production-progress-detail-page">
      {embedded ? (
        <>
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
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

          {viewMode === 'list' ? (
            <ResizableTable
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading}
              columns={columns}
              dataSource={displayOrders}
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
              dataSource={displayOrders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                [{ label: '码数', key: 'size', render: (val: any) => val || '-' }, { label: '数量', key: 'orderQuantity', render: (val: any) => { const qty = Number(val) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
                [{ label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '剩', key: 'remainingDays', render: (val: any, record: any) => { const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string); return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>; } }]
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

          {viewMode === 'list' ? (
            <ResizableTable
              rowKey={(r: ProductionOrder) => String(r.id || r.orderNo)}
              loading={loading}
              columns={columns}
              dataSource={displayOrders}
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
              dataSource={displayOrders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                [{ label: '码数', key: 'size', render: (val: any) => val || '-' }, { label: '数量', key: 'orderQuantity', render: (val: any) => { const qty = Number(val) || 0; return qty > 0 ? `${qty}件` : '-'; } }],
                [{ label: '下单', key: 'createTime', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '交期', key: 'plannedEndDate', render: (val: any) => val ? dayjs(val as string).format('MM-DD') : '-' }, { label: '剩', key: 'remainingDays', render: (val: any, record: any) => { const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string); return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>; } }]
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
            />
          )}
        </Card>
      )}

      {/* ===== 详情弹窗已删除 ===== */}

      <ScanEntryModal
        open={scanOpen}
        onCancel={closeScan}
        onOk={submitScan}
        confirmLoading={scanSubmitting}
        modalWidth={modalWidth}
        modalInitialHeight={modalInitialHeight}
        scanForm={scanForm}
        userName={String(user?.name || '-')}
        scanInputRef={scanInputRef}
        scanBundlesExpanded={scanBundlesExpanded}
        onBundlesExpandedChange={setScanBundlesExpanded}
        cuttingBundles={cuttingBundles}
        cuttingBundlesLoading={cuttingBundlesLoading}
        bundleSummary={bundleSummary}
        matchedBundle={matchedBundle}
        screens={screens}
        setBundleSelectedQr={setBundleSelectedQr}
        isBundleCompletedForSelectedNode={isBundleCompletedForSelectedNode}
        bundleDoneByQrForSelectedNode={bundleDoneByQrForSelectedNode}
        bundleMetaByQrForSelectedNode={bundleMetaByQrForSelectedNode}
        formatTimeCompact={formatTimeCompact}
        nodes={nodes}
        currentNodeIdx={currentNodeIdx}
        pricingProcessLoading={pricingProcessLoading}
        pricingProcesses={pricingProcesses}
      />

      <ScanConfirmModal
        open={scanConfirmState.visible}
        loading={scanConfirmState.loading}
        remain={scanConfirmState.remain}
        detail={scanConfirmState.detail}
        onCancel={() => closeScanConfirm()}
        onSubmit={submitConfirmedScan}
      />

      <RollbackModal
        open={rollbackOpen}
        confirmLoading={rollbackSubmitting}
        modalWidth={modalWidth}
        rollbackForm={rollbackForm}
        rollbackMode={rollbackMode}
        rollbackStepMeta={rollbackStepMeta}
        rollbackBundlesLoading={rollbackBundlesLoading}
        rollbackBundles={rollbackBundles}
        onCancel={closeRollback}
        onModeChange={handleRollbackModeChange}
        onOk={async () => {
          if (!rollbackOrder?.id) return;
          if (rollbackSubmitting) return;
          setRollbackSubmitting(true);
          try {
            if (rollbackMode === 'step') {
              const remark = String(rollbackForm.getFieldValue('stepRemark') || '').trim();
              if (!remark) {
                message.error('请填写问题点');
                return;
              }
              if (!rollbackStepMeta) {
                message.error('回流目标异常');
                return;
              }
              await updateOrderProgress(rollbackOrder, rollbackStepMeta.nextProgress, {
                rollbackRemark: remark,
                rollbackToProcessName: rollbackStepMeta.nextProcessName,
              });
              closeRollback();
              return;
            }

            const values = await rollbackForm.validateFields(['selectedQr', 'scannedQr', 'rollbackQuantity', 'remark']);
            const selectedQr = String(values.selectedQr || '').trim();
            const scannedQr = String(values.scannedQr || '').trim();
            const remark = String(values.remark || '').trim();
            const qty = Number(values.rollbackQuantity) || 0;

            if (!selectedQr) {
              message.error('请选择扎号');
              return;
            }
            if (!scannedQr) {
              message.error('请扫码对应扎号二维码');
              return;
            }
            if (selectedQr !== scannedQr) {
              message.error('扫码扎号与选择扎号不一致');
              return;
            }
            if (qty <= 0) {
              message.error('扎号数量异常，无法回流');
              return;
            }
            if (!remark) {
              message.error('请填写问题点');
              return;
            }

            const res = await productionWarehousingApi.rollbackByBundle({
              orderId: rollbackOrder.id,
              cuttingBundleQrCode: scannedQr,
              rollbackQuantity: qty,
              rollbackRemark: remark,
            });
            const result = res as Record<string, unknown>;
            if (result.code === 200) {
              message.success('回流成功');
              closeRollback();
              await fetchOrders();
              if (activeOrder?.id === rollbackOrder.id) {
                await fetchScanHistory(rollbackOrder);
              }
            } else {
              message.error(String(result.message || '回流失败'));
            }
          } catch (e: any) {
            if (e?.errorFields) {
              const firstError = e.errorFields?.[0];
              message.error(firstError?.errors?.[0] || '表单验证失败');
            } else {
              message.error(e?.message || '回流失败');
            }
          } finally {
            setRollbackSubmitting(false);
          }
        }}
      />

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
        onClose={() => {
          setPrintModalVisible(false);
          setPrintingRecord(null);
        }}
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
        onClose={() => {
          setNodeDetailVisible(false);
          setNodeDetailOrder(null);
        }}
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
