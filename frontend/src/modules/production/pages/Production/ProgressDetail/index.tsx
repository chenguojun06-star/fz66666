import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, DatePicker, Form, Grid, Input, InputNumber, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import { DeleteOutlined, EyeOutlined, RollbackOutlined, ScanOutlined, EditOutlined, AppstoreOutlined, UnorderedListOutlined, PrinterOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
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
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import { generateRequestId, isDuplicateScanMessage, isOrderFrozenByStatus, parseProductionOrderLines } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime, formatDateTimeCompact } from '@/utils/datetime';
import { CuttingBundle, ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import type { StyleProcess, TemplateLibrary } from '@/types/style';
import { productionCuttingApi, productionOrderApi, productionScanApi, productionWarehousingApi } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';

import {
  defaultNodes,
  getRecordStageName,
  stageNameMatches,
  stripWarehousingNode,
  clampPercent,
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
  getProcessesByNodeFromOrder,
  getCurrentWorkflowNodeForOrder,
  calcCuttingTotalQty
} from './utils';
import { ProgressNode } from './types';
import ModernProgressBoard from './components/ModernProgressBoard';
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

const { Text } = Typography;
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

  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);

  // ===== 详情弹窗相关状态已删除 =====
  // detailOpen 已移除，activeOrder和scanHistory保留用于快速编辑和进度统计
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);

  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [nodeOps, setNodeOps] = useState<Record<string, any>>({});
  const [inlineSaving, setInlineSaving] = useState(false);

  const [nodes, setNodes] = useState<ProgressNode[]>(defaultNodes);
  const [progressNodesByStyleNo, setProgressNodesByStyleNo] = useState<Record<string, ProgressNode[]>>({});
  const progressNodesByStyleNoRef = useRef<Record<string, ProgressNode[]>>({});
  const [nodeWorkflowLocked, setNodeWorkflowLocked] = useState(false);
  const [nodeWorkflowSaving, setNodeWorkflowSaving] = useState(false);
  const [nodeWorkflowDirty, setNodeWorkflowDirty] = useState(false);
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const [boardStatsByOrder, setBoardStatsByOrder] = useState<Record<string, Record<string, number>>>({});
  const boardStatsLoadingRef = useRef<Record<string, boolean>>({});

  const [progressTemplates, setProgressTemplates] = useState<TemplateLibrary[]>([]);
  const [progressTemplateId, setProgressTemplateId] = useState<string | undefined>(undefined);
  const [templateApplying, setTemplateApplying] = useState(false);

  const [processPriceTemplates, setProcessPriceTemplates] = useState<TemplateLibrary[]>([]);
  const [processPriceTemplateId, setProcessPriceTemplateId] = useState<string | undefined>(undefined);
  const [processPriceApplying, setProcessPriceApplying] = useState(false);

  const [pricingProcesses, setPricingProcesses] = useState<StyleProcess[]>([]);
  const [pricingProcessLoading, setPricingProcessLoading] = useState(false);

  const [scanOpen, setScanOpen] = useState(false);
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanForm] = Form.useForm();
  const scanInputRef = useRef<unknown>(null);
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
    { label: '待生产', value: 'pending' },
    { label: '生产中', value: 'production' },
    { label: '已完成', value: 'completed' },
    { label: '已关闭', value: 'closed' },
    { label: '已取消', value: 'cancelled' },
  ]), []);

  const handleOrderSort = (field: string, order: 'asc' | 'desc') => {
    setOrderSortField(field);
    setOrderSortOrder(order);
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
      const params: unknown = { ...queryParamsRef.current };
      const currentDateRange = dateRangeRef.current;
      if (currentDateRange?.[0] && currentDateRange?.[1]) {
        params.startDate = currentDateRange[0].startOf('day').toISOString();
        params.endDate = currentDateRange[1].endOf('day').toISOString();
      }
      const response = await productionOrderApi.list(params);
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        const records = (result.data.records || []) as ProductionOrder[];
        setOrders(records);
        setTotal(result.data.total || 0);

        const styleNos = Array.from(
          new Set(
            records
              .map((r) => String((r as Record<string, unknown>)?.styleNo || '').trim())
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
    } catch {
      // Intentionally empty
      // 忽略错误
      if (!silent) {
        message.error('获取生产订单失败');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

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
        const serverMsg = String(result?.data?.message || '').trim();
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
      const anyErr: unknown = error;
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
    const tpl: TemplateLibrary = result.data;
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

  const getProcessesByNode = (order: ProductionOrder | null) => getProcessesByNodeFromOrder(order);

  const fetchScanHistory = (order: ProductionOrder, options?: { silent?: boolean }) =>
    fetchScanHistoryHelper({ order, setScanHistory, message, options });

  const fetchCuttingBundles = (order: ProductionOrder) =>
    fetchCuttingBundlesHelper({ order, setCuttingBundles, setCuttingBundlesLoading, message });

  const fetchPricingProcesses = (order: ProductionOrder) =>
    fetchPricingProcessesHelper({ order, setPricingProcesses, setPricingProcessLoading });

  const openDetail = async (order: ProductionOrder) => {
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as Record<string, unknown>)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    // setDetailOpen(true); // 详情弹窗已删除
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    await fetchPricingProcesses(effective);
    try {
      const parsed = await fetchNodeOperations(String(effective.id || ''));
      setNodeOps(parsed || {});
    } catch {
      setNodeOps({});
    }
  };

  const currentInlineNode = useMemo(() => {
    return getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes);
  }, [activeOrder, progressNodesByStyleNo, nodes]);

  const cuttingTotalQtyForActive = useMemo(() => {
    return calcCuttingTotalQty(activeOrder, cuttingBundles);
  }, [activeOrder, cuttingBundles]);

  const { updateInlineOps, saveInlineOps } = useInlineNodeOps({
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
      const res = await productionOrderApi.detail(oid);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        return (result.data || null) as ProductionOrder | null;
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

  const applyProgressTemplateToOrder = async () => {
    if (!activeOrder?.id) {
      message.error('未选择订单');
      return;
    }
    if (isOrderFrozenByStatus(activeOrder)) {
      message.error('订单已完成，无法操作');
      return;
    }
    if (!isSupervisorOrAbove) {
      message.error('无权限操作进度节点');
      return;
    }
    if (nodeWorkflowLocked) {
      message.error('流程已锁定，如需修改请先退回');
      return;
    }
    if (!progressTemplateId) {
      message.error('请选择模板');
      return;
    }
    setTemplateApplying(true);
    try {
      const parsed = await fetchTemplateNodes(progressTemplateId);
      if (!parsed.length) {
        message.error('模板内容为空或不合法');
        return;
      }
      saveNodes(parsed);
      setNodeWorkflowDirty(true);
      setProgressTemplateId(undefined);
      message.success('已导入进度模板');
    } catch (e: unknown) {
      message.error(e?.message || '导入失败');
    } finally {
      setTemplateApplying(false);
    }
  };

  const applyProcessPriceTemplateToOrder = async () => {
    if (!activeOrder?.id) {
      message.error('未选择订单');
      return;
    }
    if (isOrderFrozenByStatus(activeOrder)) {
      message.error('订单已完成，无法操作');
      return;
    }
    if (!isSupervisorOrAbove) {
      message.error('无权限操作进度节点');
      return;
    }
    if (nodeWorkflowLocked) {
      message.error('流程已锁定，如需修改请先退回');
      return;
    }
    if (!processPriceTemplateId) {
      message.error('请选择工序单价模板');
      return;
    }
    setProcessPriceApplying(true);
    try {
      const parsed = await fetchTemplateNodes(processPriceTemplateId);
      if (!parsed.length) {
        message.error('模板内容为空或不合法');
        return;
      }
      // 将工序单价应用到现有节点中（只更新有单价的，没单价的不匹配）
      const priceMap = new Map<string, number>();
      parsed.forEach(p => {
        const price = Number(p.unitPrice) || 0;
        if (price > 0) {  // 只保存有单价的工序
          priceMap.set(p.name, price);
        }
      });

      let matchedCount = 0;
      const updatedNodes = nodes.map(n => {
        const newPrice = priceMap.get(n.name);
        if (newPrice !== undefined) {  // 只更新模板中有单价的工序
          matchedCount++;
          return { ...n, unitPrice: newPrice };
        }
        return n;  // 保持原单价不变
      });

      saveNodes(updatedNodes);
      setNodeWorkflowDirty(true);
      setProcessPriceTemplateId(undefined);

      if (matchedCount > 0) {
        message.success(`已导入工序单价，更新了 ${matchedCount} 个工序的单价`);
      } else {
        message.warning('未匹配到任何工序，请先导入进度模板创建节点');
      }
    } catch (e: unknown) {
      message.error(e?.message || '导入失败');
    } finally {
      setProcessPriceApplying(false);
    }
  };

  const saveNodeWorkflow = async () => {
    if (!activeOrder?.id) {
      message.error('未选择订单');
      return;
    }
    if (isOrderFrozenByStatus(activeOrder)) {
      message.error('订单已完成，无法操作');
      return;
    }
    if (!isSupervisorOrAbove) {
      message.error('无权限操作进度节点');
      return;
    }
    if (nodeWorkflowLocked) {
      message.error('流程已锁定');
      return;
    }
    if (nodeWorkflowSaving) return;

    const payloadNodes = stripWarehousingNode(nodes)
      .map((n) => {
        const name = String(n?.name || '').trim();
        const id = String(n?.id || name || '').trim() || name;
        const unitPrice = Number(n?.unitPrice);
        return {
          id,
          name,
          unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? unitPrice : 0,
        };
      })
      .filter((n) => n.name);

    if (!payloadNodes.length) {
      message.error('流程内容为空');
      return;
    }

    setNodeWorkflowSaving(true);
    try {
      const workflowJson = JSON.stringify({ nodes: payloadNodes });
      const res = await productionOrderApi.saveProgressWorkflow({
        id: activeOrder.id,
        workflowJson,
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const updated = (result.data || null) as ProductionOrder | null;
        if (updated) {
          setActiveOrder(updated);
          setNodeWorkflowLocked(Number((updated as Record<string, unknown>)?.progressWorkflowLocked) === 1);
          await ensureNodesFromTemplateIfNeeded(updated);
        } else {
          lockNodeWorkflow();
        }
        setNodeWorkflowDirty(false);
        message.success('已保存并锁定');
        await fetchOrders();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      message.error('保存失败');
    } finally {
      setNodeWorkflowSaving(false);
    }
  };

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
        const records = Array.isArray(result.data?.records) ? (result.data.records as CuttingBundle[]) : [];
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

  const nodeStats = useNodeStats({ scanHistory, activeOrder, cuttingBundles, nodes });

  const currentNodeIdx = useMemo(() => {
    return getNodeIndexFromProgress(nodes, Number(activeOrder?.productionProgress) || 0);
  }, [nodes, activeOrder?.productionProgress]);

  const { reorderNodeBefore, removeNode, updateNodeUnitPrice } = useNodeWorkflowActions({
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

  const columns: unknown[] = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: ProductionOrder) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={(record as Record<string, unknown>).styleCover || null}
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
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 140,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '最终报价单价',
      key: 'quotationUnitPrice',
      width: 120,
      align: 'right' as const,
      render: (_: any, record: ProductionOrder) => {
        const v = getQuotationUnitPriceForOrder(record);
        return `¥${v.toFixed(2)}`;
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
      title: <SortableColumnTitle title="预计出货" field="expectedShipDate" onSort={handleOrderSort} currentField={orderSortField} currentOrder={orderSortOrder} />,
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
        const map: unknown = {
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
        const totalQty = Number(record.orderQuantity) || 0;
        const nodeDoneMap = boardStatsByOrder[String(record.id || '')];

        // 空数据提示
        if (!ns || ns.length === 0) {
          return (
            <div style={{ color: '#999', fontSize: 14, padding: '20px 0' }}>
              暂无工序进度数据
            </div>
          );
        }

        return (
          <div style={{
            display: 'flex',
            gap: 0,
            alignItems: 'center',
            justifyContent: 'space-evenly',
            padding: '12px 8px',
            width: '100%',
          }}>
            {ns.map((node: ProgressNode, index: number) => {
              const nodeName = node.name || '-';
              const nodeQty = totalQty;
              const completedQty = nodeDoneMap?.[nodeName] || 0;
              const percent = nodeQty > 0 ? Math.round((completedQty / nodeQty) * 100) : 0;
              const remaining = nodeQty - completedQty;
              // 将节点名称映射到节点类型
              const nodeTypeMap: Record<string, string> = {
                '裁剪': 'cutting', '裁床': 'cutting', '剪裁': 'cutting', '开裁': 'cutting',
                '缝制': 'sewing', '车缝': 'sewing', '缝纫': 'sewing', '车工': 'sewing',
                '整烫': 'ironing', '熨烫': 'ironing', '大烫': 'ironing',
                '质检': 'quality', '检验': 'quality', '品检': 'quality', '验货': 'quality',
                '包装': 'packaging', '后整': 'packaging', '打包': 'packaging', '装箱': 'packaging',
                '二次工艺': 'secondaryProcess', '绣花': 'secondaryProcess', '印花': 'secondaryProcess',
              };
              const nodeType = nodeTypeMap[nodeName] || nodeName.toLowerCase();

              return (
                <div
                  key={node.id || index}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 8,
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
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  title={`点击查看 ${nodeName} 详情`}
                >
                  <LiquidProgressLottie
                    progress={percent}
                    size={60}
                    nodeName={nodeName}
                    text={`${completedQty}/${nodeQty}`}
                    color1={
                      percent >= 100
                        ? '#9ca3af'
                        : (() => {
                          const shipDate = record.expectedShipDate;
                          if (!shipDate) return '#52c41a';
                          const now = new Date();
                          const delivery = new Date(shipDate);
                          const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          if (diffDays < 0) return '#ef4444'; // 延期红色
                          if (diffDays <= 3) return '#f59e0b'; // 预警黄色
                          return '#52c41a'; // 正常绿色
                        })()
                    }
                    color2={
                      percent >= 100
                        ? '#d1d5db'
                        : (() => {
                          const shipDate = record.expectedShipDate;
                          if (!shipDate) return '#95de64';
                          const now = new Date();
                          const delivery = new Date(shipDate);
                          const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                          if (diffDays < 0) return '#fca5a5'; // 延期红色浅色
                          if (diffDays <= 3) return '#fbbf24'; // 预警黄色浅色
                          return '#95de64'; // 正常绿色浅色
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
      width: 200,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatus(record);
        return (
          <RowActions
            actions={[
              // 明细按钮已删除（详情弹窗功能）
              {
                key: 'print',
                label: '打印',
                title: '打印',
                icon: <PrinterOutlined />,
                onClick: () => setPrintingRecord(record),
                primary: true,
              },
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                icon: <EditOutlined />,
                onClick: () => {
                  setQuickEditRecord(record);
                  setQuickEditVisible(true);
                },
              },
              {
                key: 'register',
                label: '登记',
                title: frozen ? '登记（已完成）' : '登记',
                icon: <ScanOutlined />,
                disabled: frozen,
                onClick: () => void openScan(record),
                primary: true,
              },
              ...(isSupervisorOrAbove
                ? [
                  {
                    key: 'close',
                    label: '关单',
                    icon: <DeleteOutlined />,
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
                    icon: <RollbackOutlined />,
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
              dataSource={orders}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showSizeChanger: true,
                onChange: (page: number, pageSize: number) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 1500 }}
            />
          ) : (
            <UniversalCardView
              dataSource={orders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="styleNo"
              subtitleField="orderNo"
              fields={[
                { label: '码数', key: 'size', render: (val: unknown) => val || '-' },
                {
                  label: '数量', key: 'orderQuantity', render: (val: unknown) => {
                    const qty = Number(val) || 0;
                    return qty > 0 ? `${qty} 件` : '-';
                  }
                },
                {
                  label: '下单日期', key: 'createTime', render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
                {
                  label: '订单交期', key: 'plannedEndDate', render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => {
                  // 优先检查交期状态
                  if (record.plannedEndDate) {
                    const now = new Date();
                    const deadline = new Date(record.plannedEndDate);
                    const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                    // 超期3天以上 - 深通红色 (danger)
                    if (diffDays <= -4) return 'danger';
                    // 超期1-3天 - 红色 (danger)
                    if (diffDays < 0) return 'danger';
                    // 当天交期(0天) - 微红色 (warning)
                    if (diffDays === 0) return 'warning';
                  }

                  // 其次检查订单状态
                  const status = String(record.status || '').toLowerCase();
                  if (status === 'completed') return 'normal';
                  if (status === 'delayed') return 'danger';
                  if (status === 'production') return 'warning';
                  return 'normal';
                },
                show: true,
                type: 'liquid', // 液体波浪进度条
              }}
              actions={(record: ProductionOrder) => [
                // 扫码记录查看功能已移除（原详情弹窗功能）
                {
                  key: 'print',
                  icon: <PrinterOutlined />,
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
                  icon: <EditOutlined />,
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
            <Space>
              <Button
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
              >
                {viewMode === 'list' ? '卡片视图' : '列表视图'}
              </Button>
            </Space>
          </div>

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
              dataSource={orders}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total,
                showSizeChanger: true,
                onChange: (page: number, pageSize: number) => setQueryParams((prev) => ({ ...prev, page, pageSize })),
              }}
              scroll={{ x: 1500 }}
            />
          ) : (
            <UniversalCardView
              dataSource={orders}
              loading={loading}
              columns={6}
              coverField="styleCover"
              titleField="styleNo"
              subtitleField="orderNo"
              fields={[
                { label: '码数', key: 'size', render: (val: unknown) => val || '-' },
                {
                  label: '数量', key: 'orderQuantity', render: (val: unknown) => {
                    const qty = Number(val) || 0;
                    return qty > 0 ? `${qty} 件` : '-';
                  }
                },
                {
                  label: '下单日期', key: 'createTime', render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
                {
                  label: '订单交期', key: 'plannedEndDate', render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => {
                  // 优先检查交期状态
                  if (record.plannedEndDate) {
                    const now = new Date();
                    const deadline = new Date(record.plannedEndDate);
                    const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                    // 超期3天以上 - 深通红色 (danger)
                    if (diffDays <= -4) return 'danger';
                    // 超期1-3天 - 红色 (danger)
                    if (diffDays < 0) return 'danger';
                    // 当天交期(0天) - 微红色 (warning)
                    if (diffDays === 0) return 'warning';
                  }

                  // 其次检查订单状态
                  const status = String(record.status || '').toLowerCase();
                  if (status === 'completed') return 'normal';
                  if (status === 'delayed') return 'danger';
                  if (status === 'production') return 'warning';
                  return 'normal';
                },
                show: true,
                type: 'liquid', // 液体波浪进度条
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'print',
                  icon: <PrinterOutlined />,
                  label: '打印',
                  onClick: () => setPrintingRecord(record),
                },
                {
                  key: 'close',
                  icon: <CloseCircleOutlined />,
                  label: '关单',
                  onClick: () => handleCloseOrder(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
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
              message.error(result.message || '回流失败');
            }
          } catch (e: unknown) {
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
          remarks: quickEditRecord?.remarks,
          expectedShipDate: quickEditRecord?.expectedShipDate,
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
        styleNo={printingRecord?.styleNo}
        styleName={printingRecord?.styleName}
        cover={printingRecord?.styleCover}
        color={printingRecord?.color}
        quantity={printingRecord?.orderQuantity}
        category={printingRecord?.category}
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
