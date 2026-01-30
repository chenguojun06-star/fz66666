import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, App, Button, Card, Collapse, Form, Grid, Input, InputNumber, Modal, Select, Segmented, Space, Tag, Tooltip, Typography } from 'antd';
import { UnifiedRangePicker } from '@/components/common/UnifiedDatePicker';
import { DeleteOutlined, EyeOutlined, RollbackOutlined, ScanOutlined, EditOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import UniversalCardView from '@/components/common/UniversalCardView';
import LiquidProgressLottie from '@/components/common/LiquidProgressLottie';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import NodeDetailModal from '@/components/common/NodeDetailModal';
import { ProductionOrderHeader, StyleCoverThumb } from '@/components/StyleAssets';
import { compareSizeAsc, generateRequestId, isDuplicateScanMessage, isOrderFrozenByStatus } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { formatDateTime, formatDateTimeCompact } from '@/utils/datetime';
import { CuttingBundle, ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import type { StyleProcess, TemplateLibrary } from '@/types/style';
import { productionCuttingApi, productionOrderApi, productionScanApi, productionWarehousingApi } from '@/services/production/productionApi';
import { styleProcessApi } from '@/services/style/styleApi';
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
  isCuttingStageKey,
  formatTimeCompact
} from './utils';
import { ProgressNode } from './types';
import ModernProgressBoard from './components/ModernProgressBoard';

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
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({ page: 1, pageSize: 10 });
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);

  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);

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
  const [scanConfirmVisible, setScanConfirmVisible] = useState(false);
  const [scanConfirmRemain, setScanConfirmRemain] = useState(0);
  const [scanConfirmLoading, setScanConfirmLoading] = useState(false);
  const [scanConfirmPayload, setScanConfirmPayload] = useState<any | null>(null);
  const [scanConfirmDetail, setScanConfirmDetail] = useState<any | null>(null);
  const [scanConfirmMeta, setScanConfirmMeta] = useState<any | null>(null);
  const [scanForm] = Form.useForm();
  const scanInputRef = useRef<unknown>(null);
  const scanSubmittingRef = useRef(false);
  const orderSyncingRef = useRef(false);
  const activeOrderRef = useRef<ProductionOrder | null>(null);
  const lastFailedRequestRef = useRef<{ key: string; requestId: string } | null>(null);
  const scanConfirmTimerRef = useRef<number | null>(null);
  const scanConfirmTickRef = useRef<number | null>(null);

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

  // 节点详情弹窗状态
  const [nodeDetailVisible, setNodeDetailVisible] = useState(false);
  const [nodeDetailOrder, setNodeDetailOrder] = useState<ProductionOrder | null>(null);
  const [nodeDetailType, setNodeDetailType] = useState<string>('');
  const [nodeDetailName, setNodeDetailName] = useState<string>('');
  const [nodeDetailStats, setNodeDetailStats] = useState<{ done: number; total: number; percent: number; remaining: number } | undefined>(undefined);
  const [nodeDetailUnitPrice, setNodeDetailUnitPrice] = useState<number | undefined>(undefined);
  const [nodeDetailProcessList, setNodeDetailProcessList] = useState<{ name: string; unitPrice?: number }[]>([]);

  // 打开节点详情弹窗
  const openNodeDetail = useCallback((
    order: ProductionOrder,
    nodeType: string,
    nodeName: string,
    stats?: { done: number; total: number; percent: number; remaining: number },
    unitPrice?: number,
    processList?: { name: string; unitPrice?: number }[]
  ) => {
    setNodeDetailOrder(order);
    setNodeDetailType(nodeType);
    setNodeDetailName(nodeName);
    setNodeDetailStats(stats);
    setNodeDetailUnitPrice(unitPrice);
    setNodeDetailProcessList(processList || []);
    setNodeDetailVisible(true);
  }, []);

  const [orderSortField, setOrderSortField] = useState<string>('createTime');
  const [orderSortOrder, setOrderSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleOrderSort = (field: string, order: 'asc' | 'desc') => {
    setOrderSortField(field);
    setOrderSortOrder(order);
  };

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

  const clearScanConfirmTimers = () => {
    if (scanConfirmTimerRef.current) {
      window.clearTimeout(scanConfirmTimerRef.current);
      scanConfirmTimerRef.current = null;
    }
    if (scanConfirmTickRef.current) {
      window.clearInterval(scanConfirmTickRef.current);
      scanConfirmTickRef.current = null;
    }
  };

  useEffect(() => () => {
    clearScanConfirmTimers();
  }, []);

  const closeScanConfirm = (silent?: boolean) => {
    clearScanConfirmTimers();
    setScanConfirmVisible(false);
    setScanConfirmRemain(0);
    setScanConfirmLoading(false);
    setScanConfirmPayload(null);
    setScanConfirmDetail(null);
    setScanConfirmMeta(null);
    if (!silent) {
      message.info('已取消');
    }
  };

  const openScanConfirm = (payload: any, detail: any, meta: any) => {
    clearScanConfirmTimers();
    setScanConfirmPayload(payload || null);
    setScanConfirmDetail(detail || null);
    setScanConfirmMeta(meta || null);
    setScanConfirmVisible(true);
    setScanConfirmRemain(15);
    const expireAt = Date.now() + 15000;
    scanConfirmTimerRef.current = window.setTimeout(() => {
      closeScanConfirm(true);
    }, 15000);
    scanConfirmTickRef.current = window.setInterval(() => {
      const remain = Math.max(0, Math.ceil((expireAt - Date.now()) / 1000));
      setScanConfirmRemain((prev) => (prev === remain ? prev : remain));
    }, 500);
  };

  const submitConfirmedScan = async () => {
    if (!scanConfirmPayload || scanConfirmLoading) return;
    if (!activeOrder) return;
    setScanConfirmLoading(true);
    const meta = scanConfirmMeta || {};
    const attemptKey = meta.attemptKey || '';
    const attemptRequestId = meta.attemptRequestId || '';
    const values = meta.values || {};
    try {
      const response = await productionScanApi.execute(scanConfirmPayload);
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
        const effectiveNodes = stripWarehousingNode(resolveNodesForOrder(activeOrder));
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
    queryParams.orderNo,
    queryParams.styleNo,
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
    setQueryParams((prev) => ({
      ...prev,
      page: 1,
      styleNo: styleNo || prev.styleNo,
      orderNo: orderNo || prev.orderNo,
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

  const parseProgressNodes = (raw: string): ProgressNode[] => {
    const text = String(raw ?? '').trim();
    if (!text) return [];
    try {
      const obj = JSON.parse(text);
      // 支持两种格式：nodes (进度节点) 和 steps (工序单价)
      let itemsRaw = (obj as Record<string, unknown>)?.nodes;
      if (!Array.isArray(itemsRaw)) {
        itemsRaw = (obj as Record<string, unknown>)?.steps;
      }
      if (!Array.isArray(itemsRaw)) return [];

      const normalized: ProgressNode[] = itemsRaw
        .map((n: any) => {
          const name = String(n?.name || n?.processName || '').trim();
          const p = Number(n?.unitPrice);
          const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
          const id = String(n?.id || n?.processCode || name || '');
          return { id, name, unitPrice };
        })
        .filter((n: ProgressNode) => n.name);
      return stripWarehousingNode(normalized);
    } catch {
      // Intentionally empty
      // 忽略错误
      return [];
    }
  };

  const parseWorkflowNodesFromOrder = (order: ProductionOrder | null): ProgressNode[] => {
    const raw = String((order as Record<string, unknown>)?.progressWorkflowJson ?? '').trim();
    if (!raw) return [];
    return parseProgressNodes(raw);
  };

  const fetchTemplateNodes = async (templateId: string): Promise<ProgressNode[]> => {
    const tid = String(templateId || '').trim();
    if (!tid) return [];
    const res = await templateLibraryApi.getById(tid);
    const result = res as Record<string, unknown>;
    if (result.code !== 200) return [];
    const tpl: TemplateLibrary = result.data;
    return parseProgressNodes(String(tpl?.templateContent ?? ''));
  };

  const resolveNodesForOrder = (order: ProductionOrder | null): ProgressNode[] => {
    const orderNodes = parseWorkflowNodesFromOrder(order);
    if (orderNodes.length) {
      // 如果订单有进度节点，但单价都是0，则从款号工序单价中回填（只回填有单价的）
      const styleNo = String((order as Record<string, unknown>)?.styleNo || '').trim();
      const styleNodes = styleNo && progressNodesByStyleNo[styleNo] ? progressNodesByStyleNo[styleNo] : [];
      if (styleNodes.length > 0) {
        const hasAnyPrice = orderNodes.some(n => (Number(n.unitPrice) || 0) > 0);
        if (!hasAnyPrice) {
          // 创建名称到单价的映射（只保存有单价的工序）
          const priceMap = new Map<string, number>();
          styleNodes.forEach(sn => {
            const price = Number(sn.unitPrice) || 0;
            if (price > 0) {
              priceMap.set(sn.name, price);
            }
          });
          // 回填单价（只回填有单价的）
          return orderNodes.map(n => ({
            ...n,
            unitPrice: priceMap.get(n.name) ?? (Number(n.unitPrice) || 0)
          }));
        }
      }
      return orderNodes;
    }
    const sn = String((order as Record<string, unknown>)?.styleNo || '').trim();
    if (sn && progressNodesByStyleNo[sn]?.length) {
      // 从款号带入时，只带单价>0的工序
      return progressNodesByStyleNo[sn].filter(n => (Number(n.unitPrice) || 0) > 0);
    }
    return nodes?.length ? nodes : defaultNodes;
  };

  /**
   * 基于菲号完成情况计算进度
   * @param order 生产订单
   * @param cuttingBundles 裁剪捆包列表
   * @param scanHistory 扫码历史记录
   * @returns 计算后的进度百分比
   */
  const calculateProgressFromBundles = (
    order: ProductionOrder,
    cuttingBundles: CuttingBundle[],
    scanHistory: ScanRecord[],
    nodes?: ProgressNode[],
  ): number => {
    if (!cuttingBundles.length) {
      return Number(order.productionProgress) || 0;
    }

    const effectiveNodes = stripWarehousingNode(Array.isArray(nodes) && nodes.length ? nodes : defaultNodes);
    if (effectiveNodes.length <= 1) {
      return Number(order.productionProgress) || 0;
    }

    // 计算每个节点的完成情况
    const nodeCompletion = effectiveNodes.map((node) => {
      const nodeName = node.name;
      // 统计该节点下所有菲号的完成情况
      const totalQtyForNode = cuttingBundles.reduce((acc, bundle) => acc + (Number(bundle?.quantity) || 0), 0);

      // 计算该节点已完成的数量
      const doneQtyForNode = scanHistory
        .filter((r) => String(r?.scanResult || '').trim() === 'success')
        .filter((r) => String(r?.scanType || '').trim() === 'production')
        .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
        .reduce((acc, r) => acc + (Number(r?.quantity) || 0), 0);

      // 计算该节点的完成率
      const completionRate = totalQtyForNode > 0 ? doneQtyForNode / totalQtyForNode : 0;
      return { nodeName, completionRate };
    });

    // 计算整体进度：每个节点按顺序贡献进度，前一个节点未完成，后续节点不贡献
    let totalProgress = 0;
    const nodeWeight = 100 / effectiveNodes.length;

    for (let i = 0; i < nodeCompletion.length; i++) {
      const { completionRate } = nodeCompletion[i];
      // 如果当前节点完成率达到98%，视为完全完成
      if (completionRate >= 0.98) {
        totalProgress += nodeWeight;
      } else {
        // 当前节点只贡献部分进度，后续节点不贡献
        totalProgress += nodeWeight * completionRate;
        break;
      }
    }

    return clampPercent(totalProgress);
  };

  const resolveNodesForListOrder = (order: ProductionOrder | null): ProgressNode[] => {
    const orderNodes = parseWorkflowNodesFromOrder(order);
    if (orderNodes.length) {
      return orderNodes;
    }
    const sn = String((order as Record<string, unknown>)?.styleNo || '').trim();
    if (sn && progressNodesByStyleNo[sn]?.length) {
      return progressNodesByStyleNo[sn];
    }
    return defaultNodes;
  };

  const boardStatsByOrderRef = useRef<Record<string, Record<string, number>>>({});
  useEffect(() => {
    boardStatsByOrderRef.current = boardStatsByOrder;
  }, [boardStatsByOrder]);

  const ensureBoardStatsForOrder = async (order: ProductionOrder, ns: ProgressNode[]) => {
    const oid = String(order?.id || '').trim();
    if (!oid) return;
    const existing = boardStatsByOrderRef.current[oid];
    if (existing && ns.every((n) => {
      const name = String((n as Record<string, unknown>)?.name || '').trim();
      return !name || Object.prototype.hasOwnProperty.call(existing, name);
    })) {
      return;
    }
    if (boardStatsLoadingRef.current[oid]) return;
    boardStatsLoadingRef.current[oid] = true;
    try {
      const res = await productionScanApi.listByOrderId(oid, { page: 1, pageSize: 500 });
      const result = res as Record<string, unknown>;
      const records: ScanRecord[] = result?.code === 200 && Array.isArray(result?.data?.records) ? result.data.records : [];
      const valid = records
        .filter((r) => String((r as Record<string, unknown>)?.scanResult || '').trim() === 'success')
        .filter((r) => (Number((r as Record<string, unknown>)?.quantity) || 0) > 0);
      const stats: Record<string, number> = {};
      for (const n of ns || []) {
        const nodeName = String((n as Record<string, unknown>)?.name || '').trim();
        if (!nodeName) continue;
        const done = valid
          .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
          .reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.quantity) || 0), 0);
        stats[nodeName] = done;
      }
      const cuttingVal = Number((order as Record<string, unknown>)?.cuttingQuantity) || 0;
      if (cuttingVal > 0) {
        for (const key of Object.keys(stats)) {
          if (key.includes('裁剪')) {
            stats[key] = Math.max(stats[key] || 0, cuttingVal);
          }
        }
      }
      boardStatsByOrderRef.current[oid] = stats;
      setBoardStatsByOrder((prev) => ({ ...prev, [oid]: stats }));
    } catch {
      // Intentionally empty
      // 忽略错误
    } finally {
      boardStatsLoadingRef.current[oid] = false;
    }
  };

  useEffect(() => {
    if (!orders.length) return;
    const queue = orders.slice(0, Math.min(20, orders.length));
    let cancelled = false;
    const run = async () => {
      for (const o of queue) {
        if (cancelled) return;
        const ns = stripWarehousingNode(resolveNodesForListOrder(o));
        await ensureBoardStatsForOrder(o, ns);
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

  const ensureNodesFromTemplateIfNeeded = async (order: ProductionOrder) => {
    const orderNodes = parseWorkflowNodesFromOrder(order);
    if (orderNodes.length) {
      // 使用 resolveNodesForOrder 以便回填款号工序单价
      const resolvedNodes = resolveNodesForOrder(order);
      saveNodes(resolvedNodes);
      return;
    }
    const styleNo = String(order.styleNo || '').trim();
    if (!styleNo) return;

    if (progressNodesByStyleNo[styleNo]?.length) {
      saveNodes(progressNodesByStyleNo[styleNo]);
      return;
    }

    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const rows = Array.isArray(result.data) ? result.data : [];
        const normalized: ProgressNode[] = rows
          .map((n: any) => {
            const name = String(n?.name || '').trim();
            const id = String(n?.id || name || '').trim() || name;
            const p = Number(n?.unitPrice);
            const unitPrice = Number.isFinite(p) && p >= 0 ? p : 0;
            return { id, name, unitPrice };
          })
          .filter((n: ProgressNode) => n.name);
        const stripped = stripWarehousingNode(normalized);
        if (stripped.length) {
          setProgressNodesByStyleNo((prev) => ({ ...prev, [styleNo]: stripped }));
          saveNodes(stripped);
          return;
        }
      }
    } catch {
      // Intentionally empty
      // 忽略错误
    }

    try {
      const res = await templateLibraryApi.list({
        page: 1,
        pageSize: 10,
        templateType: 'progress',
        sourceStyleNo: styleNo,
        keyword: '',
      });
      const result = res as Record<string, unknown>;
      if (result.code !== 200) return;
      const records = (result.data?.records || []) as TemplateLibrary[];
      const list = Array.isArray(records) ? [...records] : [];
      list.sort((a, b) => {
        const ta = Date.parse(String((a as Record<string, unknown>)?.updateTime || (a as Record<string, unknown>)?.createTime || '')) || 0;
        const tb = Date.parse(String((b as Record<string, unknown>)?.updateTime || (b as Record<string, unknown>)?.createTime || '')) || 0;
        return tb - ta;
      });
      const picked = list[0] || null;
      if (picked?.id) {
        const parsed = await fetchTemplateNodes(picked.id);
        if (parsed.length) {
          saveNodes(parsed);
          return;
        }
      }
    } catch {
      // Intentionally empty
      // 忽略错误
    }

    try {
      let list = progressTemplates;
      if (!list.length) {
        const res = await templateLibraryApi.listByType('progress');
        const result = res as Record<string, unknown>;
        if (result.code === 200) {
          list = Array.isArray(result.data) ? result.data : [];
          list = [...list].sort((a, b) => {
            const ta = Date.parse(String((a as Record<string, unknown>)?.updateTime || (a as Record<string, unknown>)?.createTime || '')) || 0;
            const tb = Date.parse(String((b as Record<string, unknown>)?.updateTime || (b as Record<string, unknown>)?.createTime || '')) || 0;
            return tb - ta;
          });
          setProgressTemplates(list);
        }
      }
      const sorted = [...list].sort((a, b) => {
        const ta = Date.parse(String((a as Record<string, unknown>)?.updateTime || (a as Record<string, unknown>)?.createTime || '')) || 0;
        const tb = Date.parse(String((b as Record<string, unknown>)?.updateTime || (b as Record<string, unknown>)?.createTime || '')) || 0;
        return tb - ta;
      });
      const def = sorted.find((t) => String(t.templateKey || '').trim() === 'default') || sorted[0];
      if (def?.id) {
        const parsed = await fetchTemplateNodes(def.id);
        if (parsed.length) {
          saveNodes(parsed);
        }
      }
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  };

  const lockNodeWorkflow = () => {
    setNodeWorkflowLocked(true);
    setNodeWorkflowDirty(false);
  };

  useEffect(() => {
    const locked = Number((activeOrder as Record<string, unknown>)?.progressWorkflowLocked) === 1;
    setNodeWorkflowLocked(locked);
    setNodeWorkflowDirty(false);
  }, [activeOrder?.id, (activeOrder as Record<string, unknown>)?.progressWorkflowLocked]);

  const fetchScanHistory = async (order: ProductionOrder, options?: { silent?: boolean }): Promise<ScanRecord[]> => {
    const silent = options?.silent === true;
    if (!order.id) {
      setScanHistory([]);
      return [];
    }
    try {
      const response = await productionScanApi.listByOrderId(String(order.id), { page: 1, pageSize: 200 });
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        const records = Array.isArray(result.data?.records) ? result.data.records : [];
        setScanHistory(records);
        return records;
      } else if (!silent) {
        message.error(result.message || '获取扫码记录失败');
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      if (!silent) {
        message.error('获取扫码记录失败');
      }
    } finally {
    }
    return [];
  };

  const fetchCuttingBundles = async (order: ProductionOrder): Promise<CuttingBundle[]> => {
    const orderNo = String(order?.orderNo || '').trim();
    const orderId = String(order?.id || '').trim();
    if (!orderNo && !orderId) {
      setCuttingBundles([]);
      return [];
    }
    setCuttingBundlesLoading(true);
    try {
      const res = await productionCuttingApi.list({
        page: 1,
        pageSize: 10000,
        orderNo: orderNo || undefined,
        orderId: orderId || undefined,
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data;
        const records = Array.isArray(data)
          ? (data as CuttingBundle[])
          : Array.isArray(data?.records)
            ? (data.records as CuttingBundle[])
            : Array.isArray(data?.list)
              ? (data.list as CuttingBundle[])
              : [];
        records.sort((a, b) => (Number(a?.bundleNo) || 0) - (Number(b?.bundleNo) || 0));
        setCuttingBundles(records);
        return records;
      }
      message.error(result.message || '获取扎号列表失败');
    } catch (e: unknown) {
      message.error(e?.result?.message || e?.message || '获取扎号列表失败');
    } finally {
      setCuttingBundlesLoading(false);
    }
    setCuttingBundles([]);
    return [];
  };

  const fetchPricingProcesses = async (order: ProductionOrder): Promise<StyleProcess[]> => {
    const styleId = String((order as Record<string, unknown>)?.styleId || '').trim();
    if (!styleId) {
      setPricingProcesses([]);
      return [];
    }
    setPricingProcessLoading(true);
    try {
      const res = await styleProcessApi.listByStyleId(styleId);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const list = Array.isArray(result.data) ? (result.data as StyleProcess[]) : [];
        setPricingProcesses(list);
        return list;
      }
      setPricingProcesses([]);
      return [];
    } catch {
      // Intentionally empty
      // 忽略错误
      setPricingProcesses([]);
      return [];
    } finally {
      setPricingProcessLoading(false);
    }
  };

  const openDetail = async (order: ProductionOrder) => {
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as Record<string, unknown>)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    setDetailOpen(true);
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    await fetchPricingProcesses(effective);
  };

  const getCurrentWorkflowNodeForOrder = (order: ProductionOrder | null): ProgressNode => {
    const ns = stripWarehousingNode(resolveNodesForOrder(order));
    const progress = Number(order?.productionProgress) || 0;
    const idx = getNodeIndexFromProgress(ns, progress);
    let picked: ProgressNode | undefined = ns[idx] || ns[0];
    if (!picked || !String(picked?.name || '').trim()) {
      picked = ns.find((n) => String(n?.name || '').trim()) || defaultNodes.find((n) => String(n?.name || '').trim());
    }
    if (!picked) {
      return { id: '', name: '', unitPrice: 0 } as ProgressNode;
    }
    return picked;
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setActiveOrder(null);
    setScanHistory([]);
    setCuttingBundles([]);
  };

  const openScan = async (order: ProductionOrder) => {
    if (isOrderFrozenByStatus(order)) {
      message.error('订单已完成，无法操作');
      return;
    }
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as Record<string, unknown>)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    const procs = await fetchPricingProcesses(effective);
    setScanBundlesExpanded(false);
    setBundleSelectedQr('');
    setScanOpen(true);
    scanForm.resetFields();

    const currentNode = getCurrentWorkflowNodeForOrder(effective);
    const currentNodeName = String(currentNode?.name || '').trim();
    const currentNodeCode = String(currentNode?.id || '').trim();
    const currentUnitPrice = Number(currentNode?.unitPrice);
    const baseUnitPrice = Number.isFinite(currentUnitPrice) && currentUnitPrice >= 0 ? currentUnitPrice : undefined;

    scanForm.setFieldsValue({
      scanType: 'production',
      orderNo: effective.orderNo,
      scanCode: '',
      progressStage: currentNodeName || undefined,
      processCode: currentNodeCode || '',
      color: '',
      size: '',
      quantity: undefined,
      baseUnitPrice,
      unitPrice: baseUnitPrice,
    });

    const matched = findPricingProcessForStage(procs, currentNodeName);
    const autoPicked = matched || (procs.length === 1 ? procs[0] : null);
    if (autoPicked) {
      const name = String((autoPicked as Record<string, unknown>)?.processName || '').trim();
      const price = Number((autoPicked as Record<string, unknown>)?.price);
      scanForm.setFieldsValue({
        processName: name || undefined,
        unitPrice: Number.isFinite(price) && price >= 0 ? price : baseUnitPrice,
      });
    }
    setTimeout(() => {
      scanInputRef.current?.focus?.();
    }, 0);
  };

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

  const openRollback = (order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限回流');
      return;
    }
    const effectiveNodes = stripWarehousingNode(resolveNodesForListOrder(order));
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

    const currentNode = getCurrentWorkflowNodeForOrder(activeOrder);
    const name = String(currentNode?.name || '').trim();
    const code = String(currentNode?.id || '').trim();
    const p = Number(currentNode?.unitPrice);
    scanForm.setFieldsValue({
      progressStage: name || undefined,
      processCode: code || '',
      unitPrice: Number.isFinite(p) && p >= 0 ? p : undefined,
    });
  }, [scanOpen, activeOrder?.id, activeOrder?.productionProgress, nodes, scanForm]);

  const matchedBundle = useMemo(() => {
    const code = String(watchScanCode || '').trim();
    if (!code || !cuttingBundles.length) return null;
    return cuttingBundles.find((b) => String(b.qrCode || '').trim() === code) || null;
  }, [watchScanCode, cuttingBundles]);

  useEffect(() => {
    if (!scanOpen) return;
    if (matchedBundle) {
      const matchedQty = Number(matchedBundle?.quantity);
      scanForm.setFieldsValue({
        color: matchedBundle?.color || '',
        size: matchedBundle?.size || '',
        quantity: Number.isFinite(matchedQty) && matchedQty > 0 ? matchedQty : undefined,
      });
      return;
    }
    const code = String(watchScanCode || '').trim();
    if (!code) {
      scanForm.setFieldsValue({ color: '', size: '', quantity: undefined });
      if (bundleSelectedQr) setBundleSelectedQr('');
      return;
    }
    if (bundleSelectedQr && bundleSelectedQr !== code) {
      setBundleSelectedQr('');
    }
  }, [matchedBundle, scanOpen, scanForm, watchScanCode, bundleSelectedQr]);

  const bundleDoneByQrForSelectedNode = useMemo(() => {
    const pn = String(watchProgressStage || '').trim();
    const st = String(watchScanType || '').trim();
    if (!pn) return {} as Record<string, number>;
    const map: Record<string, number> = {};
    for (const r of scanHistory) {
      if (String((r as Record<string, unknown>)?.scanResult || '').trim() !== 'success') continue;
      if (st && String((r as Record<string, unknown>)?.scanType || '').trim() !== st) continue;
      if (getRecordStageName(r) !== pn) continue;
      const qr = String((r as Record<string, unknown>)?.cuttingBundleQrCode || '').trim();
      if (!qr) continue;
      map[qr] = (map[qr] || 0) + (Number((r as Record<string, unknown>)?.quantity) || 0);
    }
    return map;
  }, [scanHistory, watchProgressStage, watchScanType]);

  const bundleMetaByQrForSelectedNode = useMemo(() => {
    const pn = String(watchProgressStage || '').trim();
    const st = String(watchScanType || '').trim();
    if (!pn) return {} as Record<string, { operatorId: string; operatorIds: string[]; receiveTime?: string; completeTime?: string }>;

    const qtyByQr: Record<string, number> = {};
    for (const b of cuttingBundles) {
      const qr = String((b as Record<string, unknown>)?.qrCode || '').trim();
      if (!qr) continue;
      qtyByQr[qr] = Number((b as Record<string, unknown>)?.quantity) || 0;
    }

    const grouped: Record<string, ScanRecord[]> = {};
    for (const r of scanHistory) {
      if (String((r as Record<string, unknown>)?.scanResult || '').trim() !== 'success') continue;
      if (st && String((r as Record<string, unknown>)?.scanType || '').trim() !== st) continue;
      if (getRecordStageName(r) !== pn) continue;
      const qr = String((r as Record<string, unknown>)?.cuttingBundleQrCode || '').trim();
      if (!qr) continue;
      if (!grouped[qr]) grouped[qr] = [];
      grouped[qr].push(r);
    }

    const meta: Record<string, { operatorId: string; operatorIds: string[]; receiveTime?: string; completeTime?: string }> = {};
    for (const [qr, records] of Object.entries(grouped)) {
      const sorted = [...records].sort((a, b) => {
        const ta = dayjs(String((a as Record<string, unknown>)?.scanTime || '')).valueOf() || 0;
        const tb = dayjs(String((b as Record<string, unknown>)?.scanTime || '')).valueOf() || 0;
        return ta - tb;
      });

      const operatorIds: string[] = [];
      const seen = new Set<string>();
      for (const r of sorted) {
        const id = String((r as Record<string, unknown>)?.operatorId || '').trim();
        if (!id) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        operatorIds.push(id);
      }

      const receiveTime = String((sorted[0] as Record<string, unknown>)?.scanTime || '').trim() || undefined;

      const total = Number(qtyByQr[qr]) || 0;
      let cum = 0;
      let completeTime: string | undefined;
      if (total > 0) {
        for (const r of sorted) {
          cum += Number((r as Record<string, unknown>)?.quantity) || 0;
          if (!completeTime && cum >= total) {
            completeTime = String((r as Record<string, unknown>)?.scanTime || '').trim() || undefined;
            break;
          }
        }
      }

      const lastOperatorId = String((sorted[sorted.length - 1] as Record<string, unknown>)?.operatorId || '').trim();
      meta[qr] = {
        operatorId: lastOperatorId || '-',
        operatorIds,
        receiveTime,
        completeTime,
      };
    }
    return meta;
  }, [scanHistory, watchProgressStage, watchScanType, cuttingBundles]);

  const isBundleCompletedForSelectedNode = (b: CuttingBundle | null | undefined) => {
    const pn = String(watchProgressStage || '').trim();
    if (!pn || !b) return false;
    const qr = String(b.qrCode || '').trim();
    if (!qr) return false;
    const done = Number(bundleDoneByQrForSelectedNode[qr]) || 0;
    const total = Number(b.quantity) || 0;
    return total > 0 && done >= total;
  };

  const bundleSummary = useMemo(() => {
    const sizeMap: Record<string, number> = {};
    let totalQty = 0;
    for (const b of cuttingBundles) {
      const size = String(b.size || '').trim() || '-';
      const qty = Number(b.quantity) || 0;
      totalQty += qty;
      sizeMap[size] = (sizeMap[size] || 0) + qty;
    }
    const sizeRows = Object.entries(sizeMap)
      .map(([size, qty]) => ({ size, qty }))
      .sort((a, b) => compareSizeAsc(a.size, b.size));
    return { totalQty, sizeRows };
  }, [cuttingBundles]);

  const submitScan = async () => {
    if (!activeOrder) return;
    if (!user?.id || !user?.name) {
      message.error('未获取到当前登录人员信息');
      return;
    }

    if (scanSubmittingRef.current) return;
    scanSubmittingRef.current = true;
    setScanSubmitting(true);

    let attemptKey = '';
    let attemptRequestId = '';
    let didOpenConfirm = false;
    try {
      const stg = String(scanForm.getFieldValue('progressStage') || '').trim();
      if (!stg) {
        const currentNode = getCurrentWorkflowNodeForOrder(activeOrder);
        const name = String(currentNode?.name || '').trim();
        const code = String(currentNode?.id || '').trim();
        const p = Number(currentNode?.unitPrice);
        scanForm.setFieldsValue({
          progressStage: name || undefined,
          processCode: code || '',
          unitPrice: Number.isFinite(p) && p >= 0 ? p : undefined,
        });
      }
      const values = await scanForm.validateFields();
      const scanCode = String(values.scanCode || '').trim();
      if (!scanCode) {
        message.error('请扫码或选择扎号');
        return;
      }
      if (isCuttingStageKey(values.progressStage)) {
        const selectedQr = String(bundleSelectedQr || '').trim();
        if (!selectedQr || selectedQr !== scanCode) {
          message.error('请先在扎号列表选择菲号');
          return;
        }
      }
      let selectedBundle = matchedBundle;
      if (!selectedBundle) {
        const parts = scanCode.split('-').filter(Boolean);
        const looksLikeBundleQr = parts.length >= 6 && /\d+$/.test(parts[parts.length - 1] || '');
        if (looksLikeBundleQr) {
          try {
            const res = await productionCuttingApi.getByCode(scanCode);
            const result = res as Record<string, unknown>;
            if (result.code !== 200) {
              message.error(result.message || '未找到对应的裁剪扎号');
              return;
            }
            if (result.data) {
              const fetched = result.data as CuttingBundle;
              const fetchedOrderNo = String((fetched as Record<string, unknown>)?.productionOrderNo || '').trim();
              const fetchedOrderId = String((fetched as Record<string, unknown>)?.productionOrderId || '').trim();
              const currentOrderNo = String(activeOrder.orderNo || '').trim();
              const currentOrderId = String(activeOrder.id || '').trim();
              const belongsToOrder =
                (fetchedOrderNo && currentOrderNo && fetchedOrderNo === currentOrderNo)
                || (fetchedOrderId && currentOrderId && fetchedOrderId === currentOrderId);
              if (!belongsToOrder) {
                message.error('扎号与当前订单不匹配');
                return;
              }
              selectedBundle = fetched;
              setCuttingBundles((prev) => {
                const next = Array.isArray(prev) ? [...prev] : [];
                const exists = next.some((b) => String(b?.qrCode || '').trim() === String(fetched?.qrCode || '').trim());
                if (!exists) {
                  next.push(fetched);
                  next.sort((a, b) => (Number(a?.bundleNo) || 0) - (Number(b?.bundleNo) || 0));
                }
                return next;
              });
              const fetchedQty = Number((fetched as Record<string, unknown>)?.quantity);
              const formQty = Number(values.quantity);
              const nextQty = Number.isFinite(fetchedQty) && fetchedQty > 0
                ? fetchedQty
                : (Number.isFinite(formQty) && formQty > 0 ? formQty : undefined);
              scanForm.setFieldsValue({
                color: (fetched as Record<string, unknown>)?.color || values.color || '',
                size: (fetched as Record<string, unknown>)?.size || values.size || '',
                quantity: nextQty,
              });
            }
          } catch {
            // Intentionally empty
            // 忽略错误
          }
        }
      }
      if (selectedBundle && isBundleCompletedForSelectedNode(selectedBundle)) {
        message.error('该扎号在当前环节已完成，请选择其他扎号');
        return;
      }

      const bundleQty = Number(selectedBundle?.quantity);
      const formQty = Number(values.quantity);
      const resolvedQty = Number.isFinite(bundleQty) && bundleQty > 0
        ? bundleQty
        : (Number.isFinite(formQty) && formQty > 0 ? formQty : null);
      if (!resolvedQty) {
        message.error('请填写数量');
        return;
      }

      const formUnitPrice = Number(values.unitPrice ?? scanForm.getFieldValue('baseUnitPrice'));
      const resolvedUnitPrice = Number.isFinite(formUnitPrice) && formUnitPrice >= 0 ? formUnitPrice : undefined;

      // 自动填充扎号信息，简化用户操作
      const bundleInfo = {
        color: selectedBundle?.color || values.color,
        size: selectedBundle?.size || values.size,
        quantity: resolvedQty,
      };

      const payloadBase: unknown = {
        scanType: values.scanType || 'production',
        scanCode: scanCode || undefined,
        orderId: activeOrder.id,
        orderNo: activeOrder.orderNo,
        styleId: activeOrder.styleId,
        styleNo: activeOrder.styleNo,
        processCode: values.processCode,
        progressStage: values.progressStage,
        processName: values.processName,
        unitPrice: resolvedUnitPrice,
        ...bundleInfo,
        operatorId: user.id,
        operatorName: user.name,
      };

      const requestKey = JSON.stringify(payloadBase);
      const requestId = lastFailedRequestRef.current?.key === requestKey
        ? lastFailedRequestRef.current.requestId
        : generateRequestId();
      attemptKey = requestKey;
      attemptRequestId = requestId;
      const payload = { ...payloadBase, requestId };

      const detail = {
        scanCode,
        quantity: resolvedQty,
        progressStage: values.progressStage,
        processName: values.processName,
        unitPrice: resolvedUnitPrice,
        orderNo: activeOrder.orderNo,
        styleNo: activeOrder.styleNo,
        color: values.color,
        size: values.size,
      };

      didOpenConfirm = true;
      openScanConfirm(payload, detail, { attemptKey, attemptRequestId, values });
      return;
    } catch (error) {
      if ((error as Record<string, unknown>).errorFields) {
        const firstError = (error as Record<string, unknown>).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error('系统繁忙');
      }
    } finally {
      if (!didOpenConfirm) {
        setScanSubmitting(false);
        scanSubmittingRef.current = false;
      }
    }
  };

  const nodeStats = useMemo(() => {
    const bundlesTotalQty = cuttingBundles.reduce((acc, b) => acc + (Number(b?.quantity) || 0), 0);
    const totalQty = bundlesTotalQty > 0 ? bundlesTotalQty : (Number(activeOrder?.orderQuantity) || 0);
    const records = (scanHistory || []).filter((r) => {
      if (String((r as Record<string, unknown>)?.scanResult || '').trim() !== 'success') return false;
      const q = Number((r as Record<string, unknown>)?.quantity) || 0;
      return q > 0;
    });

    const statsByName: Record<string, { done: number; total: number; remaining: number; percent: number }> = {};
    const total = Math.max(0, totalQty);

    for (const n of nodes || []) {
      const nodeName = String((n as Record<string, unknown>)?.name || '').trim();
      if (!nodeName) continue;
      const doneFromScans = records
        .filter((r) => stageNameMatches(nodeName, getRecordStageName(r)))
        .reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.quantity) || 0), 0);

      let done = doneFromScans;
      if (nodeName.includes('裁剪') && bundlesTotalQty > 0) {
        done = Math.max(done, bundlesTotalQty);
      }

      const safeDone = Math.max(0, Math.min(done, total));
      const remaining = Math.max(0, total - safeDone);
      const percent = total ? clampPercent((safeDone / total) * 100) : 0;
      statsByName[nodeName] = { done: safeDone, total, remaining, percent };
    }

    return { statsByName, totalQty: total };
  }, [scanHistory, activeOrder?.id, activeOrder?.orderQuantity, cuttingBundles, nodes]);

  const currentNodeIdx = useMemo(() => {
    return getNodeIndexFromProgress(nodes, Number(activeOrder?.productionProgress) || 0);
  }, [nodes, activeOrder?.productionProgress]);

  const reorderNodeBefore = (fromId: string, toId: string) => {
    const from = String(fromId || '').trim();
    const to = String(toId || '').trim();
    if (!from || !to || from === to) return;

    const fromIdx = nodes.findIndex((n) => String(n.id) === from);
    const toIdx = nodes.findIndex((n) => String(n.id) === to);
    if (fromIdx < 0 || toIdx < 0) return;

    const next = [...nodes];
    const [picked] = next.splice(fromIdx, 1);
    const insertIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    next.splice(insertIdx, 0, picked);
    saveNodes(next);
    setNodeWorkflowDirty(true);
  };

  const removeNode = (nodeId: string) => {
    if (!activeOrder?.id) {
      message.error('未选择订单');
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
    if (nodes.length <= 1) {
      message.error('至少保留一个节点');
      return;
    }
    const target = nodes.find((n) => String(n.id) === String(nodeId));
    Modal.confirm({
      title: '确认删除节点？',
      content: `将删除「${target?.name || '该节点'}」`,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        const next = nodes.filter((n) => String(n.id) !== String(nodeId));
        saveNodes(next.length ? next : defaultNodes);
        setNodeWorkflowDirty(true);
      },
    });
  };

  const updateNodeUnitPrice = (nodeId: string, unitPrice: number) => {
    if (!activeOrder?.id) return;
    if (!isSupervisorOrAbove) return;
    if (nodeWorkflowLocked) return;
    const p = Number(unitPrice);
    const nextPrice = Number.isFinite(p) && p >= 0 ? p : 0;
    const next = nodes.map((n) => (String(n.id) === String(nodeId) ? { ...n, unitPrice: nextPrice } : n));
    saveNodes(next);
    setNodeWorkflowDirty(true);
  };


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

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (orderSyncingRef.current) return;
      orderSyncingRef.current = true;
      try {
        await fetchOrders({ silent: true });
        const current = activeOrderRef.current;
        if (current?.id) {
          const detail = await fetchOrderDetail(current.id);
          if (!cancelled && detail) {
            setActiveOrder(detail);
          }
          const base = detail || current;
          if (base) {
            await fetchScanHistory(base, { silent: true });
          }
        }
      } finally {
        orderSyncingRef.current = false;
      }
    };
    run();
    const timer = window.setInterval(run, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []); // 移除所有函数依赖，避免重复创建定时器

  const updateOrderProgress = async (
    order: ProductionOrder,
    nextProgress: number,
    opts?: { rollbackRemark?: string; rollbackToProcessName?: string }
  ) => {
    if (!order.id) return;
    try {
      const payload: unknown = { id: order.id, progress: clampPercent(nextProgress) };
      if (opts?.rollbackRemark) payload.rollbackRemark = opts.rollbackRemark;
      if (opts?.rollbackToProcessName) payload.rollbackToProcessName = opts.rollbackToProcessName;

      const response = await productionOrderApi.updateProgress(payload);
      const result = response as Record<string, unknown>;
      if (result.code === 200) {
        message.success('进度已更新');
        await fetchOrders();
        if (activeOrder?.id === order.id) {
          const p = clampPercent(nextProgress);
          const detail = await fetchOrderDetail(order.id);
          const nodeSource = (detail || activeOrder || order) as ProductionOrder;
          const effectiveNodes = stripWarehousingNode(resolveNodesForOrder(nodeSource));
          const idx = getNodeIndexFromProgress(effectiveNodes, p);
          const derivedName = String(effectiveNodes[idx]?.name || '').trim();
          const nextName = String(opts?.rollbackToProcessName || derivedName || '').trim();
          if (detail) {
            setActiveOrder({ ...detail, currentProcessName: nextName || (detail as Record<string, unknown>).currentProcessName });
            await ensureNodesFromTemplateIfNeeded(detail);
          } else {
            setActiveOrder((prev) => (prev ? { ...prev, productionProgress: p, currentProcessName: nextName || prev.currentProcessName } : prev));
          }
          await fetchScanHistory(detail || order);
        }
      } else {
        message.error(result.message || '更新进度失败');
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      message.error('更新进度失败');
    }
  };

  const getProgressLabelForTable = (order: ProductionOrder) => {
    const cp = String(order.currentProcessName || '').trim();
    const progress = clampPercent(Number(order.productionProgress) || 0);
    const ns = stripWarehousingNode(resolveNodesForListOrder(order));
    const idx = getNodeIndexFromProgress(ns, progress);
    const derived = ns[idx]?.name || '生产';
    if (!cp) return derived;
    const cpInNodes = ns.some((n) => String(n?.name || '').trim() === cp);
    return cpInNodes ? cp : derived;
  };

  const getProgressPercentForTable = (order: ProductionOrder, nodes: ProgressNode[]) => {
    const raw = Number((order as Record<string, unknown>).productionProgress);
    const direct = clampPercent(Number.isFinite(raw) ? raw : 0);
    if (direct > 0) return direct;

    const cp = String((order as Record<string, unknown>).currentProcessName || '').trim();
    if (cp && Array.isArray(nodes) && nodes.length) {
      const idx = nodes.findIndex((n) => String(n?.name || '').trim() === cp);
      if (idx >= 0) {
        return clampPercent(getProgressFromNodeIndex(nodes, idx));
      }
    }

    const rate = clampPercent(Number((order as Record<string, unknown>).materialArrivalRate) || 0);
    const base = 5 + Math.round((15 * rate) / 100);
    return clampPercent(base);
  };

  const getQuotationUnitPriceForOrder = (order: ProductionOrder) => {
    const v = Number((order as Record<string, unknown>)?.quotationUnitPrice);
    if (Number.isFinite(v) && v > 0) {
      return v;
    }
    return 0;
  };

  const getCloseMinRequired = (cuttingQuantity: number) => {
    const cq = Number(cuttingQuantity ?? 0);
    if (!Number.isFinite(cq) || cq <= 0) return 0;
    return Math.ceil(cq * 0.9);
  };

  // 查看扫码记录
  const handleViewScanHistory = async (order: ProductionOrder) => {
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as Record<string, unknown>)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    setDetailOpen(true);
  };

  // 查看详情
  const handleViewDetail = async (order: ProductionOrder) => {
    const detail = order?.id ? await fetchOrderDetail(order.id) : null;
    const effective = detail || order;
    setActiveOrder(effective);
    setNodeWorkflowLocked(Number((effective as Record<string, unknown>)?.progressWorkflowLocked) === 1);
    setNodeWorkflowDirty(false);
    await ensureNodesFromTemplateIfNeeded(effective);
    await fetchScanHistory(effective);
    await fetchCuttingBundles(effective);
    setDetailOpen(true);
  };

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

  const handleCloseOrder = (order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限关单');
      return;
    }

    const orderId = String((order as Record<string, unknown>)?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as Record<string, unknown>)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as Record<string, unknown>)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as Record<string, unknown>)?.warehousingQualifiedQuantity ?? 0) || 0;

    if ((order as Record<string, unknown>)?.status === 'completed') {
      message.info('该订单已完成，无需关单');
      return;
    }

    if (minRequired <= 0) {
      message.warning('裁剪数量异常，无法关单');
      return;
    }

    if (warehousingQualified < minRequired) {
      message.warning(`关单条件未满足：合格入库${warehousingQualified}/${minRequired}（裁剪${cuttingQty}，允许差异10%）`);
      return;
    }

    Modal.confirm({
      title: `确认关单：${String((order as Record<string, unknown>)?.orderNo || '').trim() || '-'}`,
      okText: '确认关单',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div>订单数量：{orderQty}</div>
          <div>关单阈值（裁剪数90%）：{minRequired}</div>
          <div>当前裁剪数：{cuttingQty}</div>
          <div>当前合格入库：{warehousingQualified}</div>
          <div style={{ marginTop: 8 }}>关单后订单状态将变为“已完成”，并自动生成对账记录。</div>
        </div>
      ),
      onOk: async () => {
        const result = await productionOrderApi.close(orderId, 'productionProgress');
        if ((result as Record<string, unknown>)?.code !== 200) {
          throw new Error((result as Record<string, unknown>)?.message || '关单失败');
        }
        message.success('关单成功');
        await fetchOrders();
        if (activeOrder?.id === orderId) {
          const detail = await fetchOrderDetail(orderId);
          if (detail) {
            setActiveOrder(detail);
          }
        }
      },
    });
  };

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
        const ns = stripWarehousingNode(resolveNodesForListOrder(record));
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
                    ns.map(n => ({ name: n.name, unitPrice: n.unitPrice })) // 传递所有工序单价
                  )}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  title={`点击查看 ${nodeName} 详情`}
                >
                  <LiquidProgressLottie
                    progress={percent}
                    size={60}
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
                  <div style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#1f2937',
                    letterSpacing: '0.3px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <span>{nodeName}</span>
                    <span style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: percent >= 100 ? '#059669' : '#6b7280',
                    }}>({completedQty}/{nodeQty})</span>
                  </div>
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
              {
                key: 'detail',
                label: '明细',
                title: '明细',
                icon: <EyeOutlined />,
                onClick: () => openDetail(record),
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

  const detailNodeCards = useMemo(() => {
    const order = activeOrder;
    if (!order) return null;
    const frozen = isOrderFrozenByStatus(order);
    const pct = clampPercent(Number(order.productionProgress) || 0);
    const effectivePct = frozen ? 100 : pct;
    const currentIdx = getNodeIndexFromProgress(nodes, effectivePct);
    const canEditWorkflow = isSupervisorOrAbove && !nodeWorkflowSaving && !nodeWorkflowLocked && !isOrderFrozenByStatus(order);
    const canReorderWorkflow = false;
    const totalUnitPrice = nodes.reduce((sum, n) => sum + (Number(n.unitPrice) || 0), 0);
    const orderQty = Number(order.orderQuantity) || 0;
    const totalOrderCost = totalUnitPrice * orderQty;
    const cardWidth = Math.round((screens.md ? 260 : 240) * 0.6);
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card size="small" styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <Space wrap size={16}>
              <Text>
                单件工价合计：<Text strong>¥{totalUnitPrice.toFixed(2)}</Text>
              </Text>
              <Text>
                订单工价合计：<Text strong>¥{totalOrderCost.toFixed(2)}</Text>
              </Text>
              <Text type="secondary">（订单数量：{orderQty}）</Text>
            </Space>
            <Text strong style={{ fontSize: 14 }}>进度节点</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>进度模板：</Text>
                <Select
                  allowClear
                  size="small"
                  style={{ width: 180 }}
                  placeholder="选择进度模板"
                  value={progressTemplateId}
                  onChange={(v) => setProgressTemplateId(v)}
                  options={progressTemplates.map((t) => ({ value: String(t.id || ''), label: t.templateName }))}
                  disabled={templateApplying || processPriceApplying || nodeWorkflowSaving || !isSupervisorOrAbove || nodeWorkflowLocked || isOrderFrozenByStatus(order)}
                />
                <Button size="small" onClick={applyProgressTemplateToOrder} loading={templateApplying} disabled={processPriceApplying || nodeWorkflowSaving || !isSupervisorOrAbove || nodeWorkflowLocked || isOrderFrozenByStatus(order) || !progressTemplateId}>
                  导入节点
                </Button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Text type="secondary" style={{ fontSize: 13 }}>工序单价：</Text>
                <Select
                  allowClear
                  size="small"
                  style={{ width: 180 }}
                  placeholder="选择工序单价模板"
                  value={processPriceTemplateId}
                  onChange={(v) => setProcessPriceTemplateId(v)}
                  options={processPriceTemplates.map((t) => ({ value: String(t.id || ''), label: t.templateName }))}
                  disabled={templateApplying || processPriceApplying || nodeWorkflowSaving || !isSupervisorOrAbove || nodeWorkflowLocked || isOrderFrozenByStatus(order)}
                />
                <Button size="small" onClick={applyProcessPriceTemplateToOrder} loading={processPriceApplying} disabled={templateApplying || nodeWorkflowSaving || !isSupervisorOrAbove || nodeWorkflowLocked || isOrderFrozenByStatus(order) || !processPriceTemplateId}>
                  导入单价
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <div>
          <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
            <div className="mpb-detailCards">
              {nodes.map((n, idx) => {
                const stat = nodeStats.statsByName[n.name] || { done: 0, total: nodeStats.totalQty, remaining: nodeStats.totalQty, percent: 0 };
                const percent = clampPercent(stat.percent);
                const isDone = frozen || idx < currentIdx || effectivePct >= 100;
                const isCurrent = !frozen && idx === currentIdx && effectivePct > 0 && effectivePct < 100;
                const fillPct = isDone ? 100 : percent;
                const isDragging = draggingNodeId === String(n.id);
                const isDragOver = !!draggingNodeId && draggingNodeId !== String(n.id) && dragOverNodeId === String(n.id);
                return (
                  <div
                    key={n.id}
                    className={`mpb-detailCard mpb-pop${canReorderWorkflow ? ' mpb-draggable' : ''}${isDragging ? ' mpb-dragging' : ''}${isDragOver ? ' mpb-dragOver' : ''}${isDone ? ' mpb-detailDone' : ''}${isCurrent ? ' mpb-detailCurrent' : ''}${frozen ? ' mpb-detailFrozen' : ''}`}
                    style={{ width: cardWidth, ['--p' as Record<string, unknown>]: `${fillPct}%` }}
                    title={`${n.name} ${stat.done}/${stat.total} · 剩 ${stat.remaining} · ${percent.toFixed(0)}%`}
                    onDragOver={(e) => {
                      if (!canReorderWorkflow) return;
                      if (!draggingNodeId) return;
                      if (String(n.id) === String(draggingNodeId)) return;
                      e.preventDefault();
                      setDragOverNodeId(String(n.id));
                    }}
                    onDragLeave={() => {
                      setDragOverNodeId((prev) => (prev === String(n.id) ? null : prev));
                    }}
                    onDrop={(e) => {
                      if (!canReorderWorkflow) return;
                      e.preventDefault();
                      const fromId = String(draggingNodeId || e.dataTransfer.getData('text/plain') || '').trim();
                      reorderNodeBefore(fromId, String(n.id));
                      setDraggingNodeId(null);
                      setDragOverNodeId(null);
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div
                        className="mpb-detailTrack"
                        style={{ ['--p' as Record<string, unknown>]: `${fillPct}%`, flex: 1 }}
                        draggable={canReorderWorkflow}
                        onDragStart={(e) => {
                          if (!canReorderWorkflow) return;
                          e.dataTransfer.setData('text/plain', String(n.id));
                          e.dataTransfer.effectAllowed = 'move';
                          setDraggingNodeId(String(n.id));
                        }}
                        onDragEnd={() => {
                          setDraggingNodeId(null);
                          setDragOverNodeId(null);
                        }}
                      >
                        <div className="mpb-detailFill" />
                        <div className="mpb-detailBarText">
                          <span className="mpb-detailBarLeft">{n.name}</span>
                          <span className="mpb-detailBarRight">
                            {`${stat.done}/${stat.total} · ${percent.toFixed(0)}%`}
                          </span>
                        </div>
                      </div>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="删除" disabled={!canEditWorkflow} onClick={() => removeNode(n.id)} style={{ flexShrink: 0 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }, [activeOrder, dragOverNodeId, draggingNodeId, isSupervisorOrAbove, nodeStats, nodeWorkflowLocked, nodeWorkflowSaving, nodes, screens.md]);

  const autoOpenDetailOnceRef = useRef(false);

  useEffect(() => {
    if (!embedded) return;
    if (autoOpenDetailOnceRef.current) return;
    if (detailOpen) return;
    if (!String(queryParams.orderNo || '').trim()) return;
    if (!orders.length) return;
    autoOpenDetailOnceRef.current = true;
    openDetail(orders[0]);
  }, [detailOpen, embedded, openDetail, orders, queryParams.orderNo]);

  const pageContent = (
    <div className="production-progress-detail-page">
      {embedded ? (
        <>
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  style={{ width: 180 }}
                  allowClear
                  value={queryParams.orderNo}
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, page: 1, orderNo: e.target.value }))}
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  style={{ width: 180 }}
                  allowClear
                  value={queryParams.styleNo}
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, page: 1, styleNo: e.target.value }))}
                />
              </Form.Item>
              <Form.Item label="下单时间">
                <UnifiedRangePicker value={dateRange as Record<string, unknown>} onChange={(v) => setDateRange(v as Record<string, unknown>)} />
              </Form.Item>
              <Form.Item className="filter-actions">
                <Button
                  onClick={() => {
                    setQueryParams({ page: 1, pageSize: queryParams.pageSize });
                    setDateRange(null);
                  }}
                >
                  重置
                </Button>
              </Form.Item>
            </Form>
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
                { label: '数量', key: 'orderQuantity', render: (val: unknown) => {
                  const qty = Number(val) || 0;
                  return qty > 0 ? `${qty} 件` : '-';
                }},
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const prices = record.progressNodeUnitPrices || [];
                  if (prices.length === 0) return 0;
                  const completedCount = prices.filter((p: { completedQuantity?: number; quantity?: number }) =>
                    (p.completedQuantity || 0) >= (p.quantity || 0)
                  ).length;
                  return Math.round((completedCount / prices.length) * 100);
                },
                getStatus: (record: ProductionOrder) => {
                  const shipDate = record.expectedShipDate;
                  if (!shipDate) return 'normal';
                  const now = new Date();
                  const delivery = new Date(shipDate);
                  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays < 0) return 'danger';
                  if (diffDays <= 3) return 'warning';
                  return 'normal';
                },
                show: true,
                type: 'liquid', // 液体波浪进度条
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'scan',
                  icon: <ScanOutlined />,
                  label: '扫码记录',
                  onClick: () => handleViewScanHistory(record),
                },
                {
                  key: 'view',
                  icon: <EyeOutlined />,
                  label: '查看详情',
                  onClick: () => handleViewDetail(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: '快速编辑',
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
            <Form layout="inline" size="small">
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  style={{ width: 180 }}
                  allowClear
                  value={queryParams.orderNo}
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, page: 1, orderNo: e.target.value }))}
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  style={{ width: 180 }}
                  allowClear
                  value={queryParams.styleNo}
                  onChange={(e) => setQueryParams((prev) => ({ ...prev, page: 1, styleNo: e.target.value }))}
                />
              </Form.Item>
              <Form.Item label="下单时间">
                <UnifiedRangePicker value={dateRange as Record<string, unknown>} onChange={(v) => setDateRange(v as Record<string, unknown>)} />
              </Form.Item>
              <Form.Item className="filter-actions">
                <Button
                  onClick={() => {
                    setQueryParams({ page: 1, pageSize: queryParams.pageSize });
                    setDateRange(null);
                  }}
                >
                  重置
                </Button>
              </Form.Item>
            </Form>
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
                { label: '数量', key: 'orderQuantity', render: (val: unknown) => {
                  const qty = Number(val) || 0;
                  return qty > 0 ? `${qty} 件` : '-';
                }},
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const prices = record.progressNodeUnitPrices || [];
                  if (prices.length === 0) return 0;
                  const completedCount = prices.filter((p: { completedQuantity?: number; quantity?: number }) =>
                    (p.completedQuantity || 0) >= (p.quantity || 0)
                  ).length;
                  return Math.round((completedCount / prices.length) * 100);
                },
                getStatus: (record: ProductionOrder) => {
                  const shipDate = record.expectedShipDate;
                  if (!shipDate) return 'normal';
                  const now = new Date();
                  const delivery = new Date(shipDate);
                  const diffDays = Math.ceil((delivery.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                  if (diffDays < 0) return 'danger';
                  if (diffDays <= 3) return 'warning';
                  return 'normal';
                },
                show: true,
                type: 'liquid', // 液体波浪进度条
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'scan',
                  icon: <ScanOutlined />,
                  label: '扫码记录',
                  onClick: () => handleViewScanHistory(record),
                },
                {
                  key: 'view',
                  icon: <EyeOutlined />,
                  label: '查看详情',
                  onClick: () => handleViewDetail(record),
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: '快速编辑',
                  onClick: () => handleQuickEdit(record),
                },
              ].filter(Boolean)}
            />
          )}
        </Card>
      )}

      <ResizableModal
        open={detailOpen}
        onCancel={closeDetail}
        footer={
          <div className="modal-footer-actions">
            <Button onClick={closeDetail}>关闭</Button>
          </div>
        }
        width={modalWidth}
        initialHeight={modalInitialHeight}
        scaleWithViewport
        destroyOnHidden
        title={
          screens.md ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, paddingRight: 40 }}>
              <div />
              <div style={{ fontWeight: 600, textAlign: 'center' }}>{activeOrder ? `订单明细：${activeOrder.orderNo}` : '订单明细'}</div>
              <div style={{ justifySelf: 'end' }}>
                {activeOrder ? (
                  <Space size={4}>
                    <Button type="link" size="small" icon={<ScanOutlined />} title="登记" aria-label="登记" onClick={() => openScan(activeOrder)} />
                    {isSupervisorOrAbove ? (
                      <Button type="link" size="small" icon={<RollbackOutlined />} title="回流" aria-label="回流" onClick={() => void openRollback(activeOrder)} />
                    ) : null}
                  </Space>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontWeight: 600 }}>{activeOrder ? `订单明细：${activeOrder.orderNo}` : '订单明细'}</div>
              {activeOrder ? (
                <Space wrap>
                  <Button type="link" size="small" icon={<ScanOutlined />} title="登记" aria-label="登记" onClick={() => openScan(activeOrder)} />
                  {isSupervisorOrAbove ? (
                    <Button type="link" size="small" icon={<RollbackOutlined />} title="回流" aria-label="回流" onClick={() => void openRollback(activeOrder)} />
                  ) : null}
                </Space>
              ) : null}
            </div>
          )
        }
      >
        {activeOrder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Card size="small" styles={{ body: { padding: 12 } }}>
              <ProductionOrderHeader
                order={activeOrder}
                color={String(activeOrder?.color || '').trim()}
                coverSize={160}
                qrSize={120}
              />
              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gridTemplateColumns: screens.lg ? 'repeat(4, minmax(0, 1fr))' : screens.md ? 'repeat(2, minmax(0, 1fr))' : '1fr',
                  columnGap: 16,
                  rowGap: 10,
                  alignItems: 'start',
                }}
              >
                <div>
                  <Text type="secondary">订单数量</Text>
                  <div style={{ fontWeight: 600 }}>{Number(activeOrder.orderQuantity) || 0}</div>
                </div>
                <div>
                  <Text type="secondary">完成数量</Text>
                  <div style={{ fontWeight: 600 }}>{Number(activeOrder.completedQuantity) || 0}</div>
                </div>
                <div>
                  <Text type="secondary">物料到位率</Text>
                  <div style={{ fontWeight: 600 }}>{clampPercent(Number(activeOrder.materialArrivalRate) || 0)}%</div>
                </div>
                <div>
                  <Text type="secondary">生产进度</Text>
                  <div style={{ fontWeight: 600 }}>{clampPercent(Number(activeOrder.productionProgress) || 0)}%</div>
                </div>

                <div>
                  <Text type="secondary">下单时间</Text>
                  <div>{formatTime(activeOrder.createTime)}</div>
                </div>
                <div>
                  <Text type="secondary">订单交期</Text>
                  <div>{formatTime(getOrderShipTime(activeOrder))}</div>
                </div>
                <div>
                  <Text type="secondary">计划开始</Text>
                  <div>{formatTime(activeOrder.plannedStartDate)}</div>
                </div>
                <div>
                  <Text type="secondary">计划交期</Text>
                  <div>{formatTime(activeOrder.plannedEndDate)}</div>
                </div>

                <div>
                  <Text type="secondary">状态</Text>
                  <div>
                    {(() => {
                      const map: unknown = {
                        pending: { color: 'default', label: '待开始' },
                        production: { color: 'success', label: '生产中' },
                        completed: { color: 'default', label: '已完成' },
                        delayed: { color: 'warning', label: '延期' },
                      };
                      const value: unknown = (activeOrder as Record<string, unknown>).status;
                      const t = map[value] || { color: 'default', label: '未知' };
                      return <Tag color={t.color}>{t.label}</Tag>;
                    })()}
                  </div>
                </div>
                <div>
                  <Text type="secondary">加工厂</Text>
                  <div>{activeOrder.factoryName || '-'}</div>
                </div>
                <div>
                  <Text type="secondary">实际开始</Text>
                  <div>{formatTime(activeOrder.actualStartDate)}</div>
                </div>
                <div>
                  <Text type="secondary">实际完成</Text>
                  <div>{formatTime(activeOrder.actualEndDate)}</div>
                </div>
              </div>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, alignItems: 'start' }}>
              <Card
                title={
                  <div className="mpb-nodeHeaderRow">
                    <div className="mpb-nodeHeaderActions" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start', width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                        {nodeWorkflowLocked ? (
                          <Tag color="default">已锁定</Tag>
                        ) : (
                          <Tag color={nodeWorkflowDirty ? 'warning' : 'default'}>{nodeWorkflowDirty ? '可编辑（未锁定）' : '可编辑'}</Tag>
                        )}
                        <Button size="small" type="primary" onClick={saveNodeWorkflow} loading={nodeWorkflowSaving} disabled={nodeWorkflowSaving || !isSupervisorOrAbove || nodeWorkflowLocked || isOrderFrozenByStatus(activeOrder)}>
                          保存并锁定
                        </Button>
                      </div>
                    </div>
                  </div>
                }
                size="small"
              >
                {detailNodeCards}

              </Card>
            </div>
          </div>
        )}
      </ResizableModal>

      <ResizableModal
        title="登记"
        open={scanOpen}
        onCancel={closeScan}
        onOk={submitScan}
        confirmLoading={scanSubmitting}
        okText="提交"
        cancelText="关闭"
        width={modalWidth}
        initialHeight={modalInitialHeight}
        tableDensity="dense"
        tablePaddingX={4}
        tablePaddingY={2}
        minFontSize={11}
        maxFontSize={13}
        scaleWithViewport
      >
        <Form form={scanForm} layout="vertical">
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 10 }}
            title={(
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div>同一菲号在同一进度环节只能登记一次；重复提交会提示“已扫码更新/忽略”。</div>
                <div>计价工序用于单价/金额结算；同一菲号同一进度环节仅保留一个计价工序（后续修改会覆盖）。</div>
                <div>每次登记都会记录当前登录人员与时间（当前：{String(user?.name || '-')}）。</div>
              </div>
            )}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <Text type="secondary">扫码登记（可从扎号列表选择）</Text>
          </div>

          <Collapse
            size="small"
            activeKey={scanBundlesExpanded ? ['bundles'] : []}
            onChange={(keys) => {
              const list = Array.isArray(keys) ? keys : [keys];
              setScanBundlesExpanded(list.map((k) => String(k)).includes('bundles'));
            }}
            style={{ marginBottom: 8 }}
            items={[
              {
                key: 'bundles',
                label: (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div>裁剪扎号明细（菲号）</div>
                    <Space size={8}>
                      <Text type="secondary">共 {cuttingBundles.length} 扎</Text>
                      <Text type="secondary">合计 {bundleSummary.totalQty}</Text>
                      {matchedBundle ? <Tag color="success">已匹配：{matchedBundle.bundleNo}</Tag> : null}
                    </Space>
                  </div>
                ),
                children: scanBundlesExpanded ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: screens.md ? '1fr 1fr' : '1fr', gap: 12 }}>
                      <div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {bundleSummary.sizeRows.length ? (
                            bundleSummary.sizeRows.map((r) => (
                              <Tag key={r.size} color="default">
                                {r.size}：{r.qty}
                              </Tag>
                            ))
                          ) : (
                            <Text type="secondary">暂无扎号数据</Text>
                          )}
                        </div>
                      </div>
                      <div>
                        <Select
                          showSearch
                          allowClear
                          optionFilterProp="label"
                          placeholder={cuttingBundlesLoading ? '加载中...' : '选择扎号可自动带出码数/数量'}
                          loading={cuttingBundlesLoading}
                          value={matchedBundle ? String(matchedBundle.qrCode || '') : undefined}
                          onChange={(v) => {
                            const code = String(v || '').trim();
                            const b = cuttingBundles.find((x) => String(x.qrCode || '').trim() === code);
                            setBundleSelectedQr(code);
                            const pickedQty = Number(b?.quantity);
                            scanForm.setFieldsValue({
                              scanCode: code || '',
                              color: b?.color || '',
                              size: b?.size || '',
                              quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                            });
                            setTimeout(() => scanInputRef.current?.focus?.(), 0);
                          }}
                          options={cuttingBundles.map((b) => ({
                            value: String(b.qrCode || ''),
                            label: `扎号 ${b.bundleNo}｜码数 ${String(b.size || '-')}｜颜色 ${String(b.color || '-')}｜数量 ${Number(b.quantity) || 0}`,
                            disabled: isBundleCompletedForSelectedNode(b),
                          }))}
                        />
                      </div>
                    </div>

                    <div style={{ maxHeight: screens.lg ? 440 : 320, overflowY: 'auto' }}>
                      <ResizableTable
                        rowKey={(r: Record<string, unknown>) => String(r.qrCode || r.id || r.bundleNo)}
                        size="small"
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                        minColumnWidth={50}
                        defaultColumnWidth={80}
                        rowSelection={{
                          type: 'radio',
                          selectedRowKeys: matchedBundle ? [String(matchedBundle.qrCode || '')] : [],
                          getCheckboxProps: (r: Record<string, unknown>) => ({ disabled: Boolean(r?.completed) }),
                          onChange: (_keys: React.Key[], rows: unknown[]) => {
                            const r = rows?.[0];
                            const code = String(r?.qrCode || '').trim();
                            if (!code) return;
                            setBundleSelectedQr(code);
                            const pickedQty = Number(r?.quantity);
                            scanForm.setFieldsValue({
                              scanCode: code,
                              color: r?.color || '',
                              size: r?.size || '',
                              quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                            });
                            setTimeout(() => scanInputRef.current?.focus?.(), 0);
                          },
                        }}
                        onRow={(r: Record<string, unknown>) => ({
                          onClick: () => {
                            if (r?.completed) return;
                            const code = String(r?.qrCode || '').trim();
                            if (!code) return;
                            setBundleSelectedQr(code);
                            const pickedQty = Number(r?.quantity);
                            scanForm.setFieldsValue({
                              scanCode: code,
                              color: r?.color || '',
                              size: r?.size || '',
                              quantity: Number.isFinite(pickedQty) && pickedQty > 0 ? pickedQty : undefined,
                            });
                            setTimeout(() => scanInputRef.current?.focus?.(), 0);
                          },
                        })}
                        dataSource={cuttingBundles.map((b) => {
                          const qr = String(b.qrCode || '').trim();
                          const total = Number(b.quantity) || 0;
                          const done = Number(bundleDoneByQrForSelectedNode[qr]) || 0;
                          const remaining = Math.max(0, total - done);
                          const completed = total > 0 && done >= total;
                          const meta = (bundleMetaByQrForSelectedNode as Record<string, unknown>)?.[qr] || {};
                          return {
                            ...b,
                            done,
                            remaining,
                            completed,
                            operatorId: meta.operatorId || '-',
                            operatorIds: Array.isArray(meta.operatorIds) ? meta.operatorIds : [],
                            receiveTime: meta.receiveTime || '',
                            completeTime: meta.completeTime || '',
                          } as Record<string, unknown>;
                        })}
                        columns={[
                          { title: '菲号', dataIndex: 'bundleNo', key: 'bundleNo', width: 70 },
                          { title: '码数', dataIndex: 'size', key: 'size', width: 70, render: (v) => v || '-' },
                          { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v) => v || '-' },
                          { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 70, render: (v) => Number(v) || 0 },
                          {
                            title: '完成度',
                            key: 'doneRate',
                            width: 110,
                            render: (_: any, r: any) => {
                              const total = Number(r?.quantity) || 0;
                              const done = Number(r?.done) || 0;
                              return (
                                <span>
                                  {done} / {total}
                                </span>
                              );
                            },
                          },
                          {
                            title: '状态',
                            dataIndex: 'completed',
                            key: 'completed',
                            width: 64,
                            render: (v: unknown) => (v
                              ? <Tag color="success" style={{ marginInlineEnd: 0, paddingInline: 2, lineHeight: '16px', fontSize: 'var(--font-size-xs)' }}>已完成</Tag>
                              : <Tag style={{ marginInlineEnd: 0, paddingInline: 2, lineHeight: '16px', fontSize: 'var(--font-size-xs)' }}>未完成</Tag>),
                          },
                          {
                            title: '生产人员ID',
                            dataIndex: 'operatorId',
                            key: 'operatorId',
                            width: 120,
                            render: (_: any, r: any) => {
                              const ids = Array.isArray(r?.operatorIds) ? (r.operatorIds as string[]) : [];
                              const title = ids.length ? ids.join(', ') : String(r?.operatorId || '-');
                              const text = String(r?.operatorId || '-');
                              return (
                                <Tooltip title={title} placement="topLeft">
                                  <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {text}
                                  </span>
                                </Tooltip>
                              );
                            },
                          },
                          {
                            title: '领取时间',
                            dataIndex: 'receiveTime',
                            key: 'receiveTime',
                            width: 100,
                            render: (v: unknown) => formatTimeCompact(v),
                          },
                          {
                            title: '完成时间',
                            dataIndex: 'completeTime',
                            key: 'completeTime',
                            width: 100,
                            render: (v: unknown) => formatTimeCompact(v),
                          },
                        ]}
                      />
                    </div>
                  </div>
                ) : null,
              },
            ]}
          />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.lg ? '1.1fr 0.9fr 2fr' : screens.md ? '1fr 1fr' : '1fr',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <Form.Item label="订单号" name="orderNo" style={{ marginBottom: 8 }}>
              <Input disabled />
            </Form.Item>
            <div style={{ marginBottom: 8 }}>
              <div style={{ marginBottom: 8, fontSize: '14px', color: 'rgba(0, 0, 0, 0.88)' }}>类型</div>
              <Input value="生产" disabled />
            </div>
            <Form.Item name="scanType" hidden>
              <Input />
            </Form.Item>
            <Form.Item
              label="扫码内容（二维码）"
              name="scanCode"
              rules={[{ required: true, message: '请扫码输入' }]}
              style={{ marginBottom: 8 }}
            >
              <Input
                ref={scanInputRef}
                placeholder="请扫码输入（或从扎号列表选择）"
              />
            </Form.Item>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.lg ? '1fr 1fr' : '1fr',
              gap: 12,
              alignItems: 'end',
            }}
          >
            <Form.Item label="进度节点" name="progressStage" rules={[{ required: true, message: '请选择节点' }]} style={{ marginBottom: 0 }}>
              <Select
                showSearch
                options={nodes.map((n, idx) => ({ value: n.name, label: n.name, disabled: idx < currentNodeIdx }))}
                placeholder="请选择节点"
                disabled
              />
            </Form.Item>
            <Form.Item
              label="计价工序"
              name="processName"
              style={{ marginBottom: 0 }}
            >
              <Select
                showSearch
                allowClear
                loading={pricingProcessLoading}
                placeholder={pricingProcessLoading ? '加载中...' : pricingProcesses.length ? '选择计价小工序（可不选）' : '无工序单价（可不选）'}
                disabled={!pricingProcessLoading && pricingProcesses.length === 0}
                options={[...pricingProcesses]
                  .sort((a: any, b: any) => (Number(a?.sortOrder) || 0) - (Number(b?.sortOrder) || 0))
                  .map((p: any) => ({
                    value: String(p?.processName || '').trim(),
                    label: String(p?.processName || '').trim(),
                  }))
                  .filter((x) => x.value)}
                onChange={(v) => {
                  const name = String(v || '').trim();
                  if (!name) {
                    scanForm.setFieldsValue({ unitPrice: scanForm.getFieldValue('baseUnitPrice') });
                    return;
                  }
                  const picked = pricingProcesses.find((p) => String((p as Record<string, unknown>)?.processName || '').trim() === name);
                  const price = Number((picked as Record<string, unknown>)?.price);
                  if (Number.isFinite(price) && price >= 0) {
                    scanForm.setFieldsValue({ unitPrice: price });
                    return;
                  }
                  scanForm.setFieldsValue({ unitPrice: scanForm.getFieldValue('baseUnitPrice') });
                }}
              />
            </Form.Item>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: screens.lg ? 'repeat(4, 1fr)' : screens.md ? '1fr 1fr' : '1fr',
              gap: 12,
              alignItems: 'end',
              marginTop: 8,
            }}
          >
            <Form.Item label="颜色" name="color" style={{ marginBottom: 0 }}>
              <Input placeholder="可选" />
            </Form.Item>
            <Form.Item label="码数" name="size" style={{ marginBottom: 0 }}>
              <Input placeholder="可选" />
            </Form.Item>
            <Form.Item label="数量" name="quantity" style={{ marginBottom: 0 }}>
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="单价" name="unitPrice" style={{ marginBottom: 0 }}>
              <InputNumber min={0} precision={2} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="processCode" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="baseUnitPrice" hidden>
            <Input />
          </Form.Item>
        </Form>
      </ResizableModal>

      <Modal
        title="扫码确认"
        open={scanConfirmVisible}
        onCancel={() => closeScanConfirm()}
        footer={[
          <Button key="cancel" onClick={() => closeScanConfirm()} disabled={scanConfirmLoading}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={submitConfirmedScan} loading={scanConfirmLoading}>
            领取
          </Button>,
        ]}
      >
        <div style={{ marginBottom: 8, color: '#6b7280' }}>请在 {scanConfirmRemain} 秒内完成操作</div>
        {scanConfirmDetail && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div>二维码：{scanConfirmDetail.scanCode || '-'}</div>
            <div>数量：{scanConfirmDetail.quantity || '-'}</div>
            <div>环节：{scanConfirmDetail.progressStage || scanConfirmDetail.processName || '-'}</div>
            <div>工序：{scanConfirmDetail.processName || '-'}</div>
            <div>单价：{scanConfirmDetail.unitPrice ?? '-'}</div>
            <div>订单号：{scanConfirmDetail.orderNo || '-'}</div>
            <div>款号：{scanConfirmDetail.styleNo || '-'}</div>
            <div>颜色：{scanConfirmDetail.color || '-'}</div>
            <div>尺码：{scanConfirmDetail.size || '-'}</div>
          </div>
        )}
      </Modal>

      <ResizableModal
        title="回流"
        open={rollbackOpen}
        centered
        onCancel={closeRollback}
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
        confirmLoading={rollbackSubmitting}
        okText="确认"
        cancelText="取消"
        width={modalWidth}
        scaleWithViewport
      >
        <Form form={rollbackForm} layout="vertical">
          <Form.Item label="回流方式" style={{ marginBottom: 8 }}>
            <Segmented
              value={rollbackMode}
              options={[
                { label: '退回上一步', value: 'step' },
                { label: '按扎号回退入库', value: 'bundle' },
              ]}
              onChange={(v) => {
                const next = v as Record<string, unknown>;
                setRollbackMode(next);
                rollbackForm.resetFields();
                if (next === 'bundle' && rollbackOrder) {
                  void loadRollbackBundles(rollbackOrder);
                }
              }}
            />
          </Form.Item>

          {rollbackMode === 'step' ? (
            <>
              <div style={{ marginBottom: 8 }}>
                <Text type="secondary">
                  目标：{rollbackStepMeta?.nextProcessName ? `退回到「${rollbackStepMeta.nextProcessName}」` : '-'}
                </Text>
              </div>
              <Form.Item label="问题点（必填）" name="stepRemark" rules={[{ required: true, message: '请填写问题点' }]}>
                <Input.TextArea placeholder="请输入问题点（必填）" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item label="选择扎号" name="selectedQr" rules={[{ required: true, message: '请选择扎号' }]}>
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder={rollbackBundlesLoading ? '加载中...' : '请选择扎号'}
                  loading={rollbackBundlesLoading}
                  options={rollbackBundles.map((b) => ({
                    value: String(b.qrCode || ''),
                    label: `扎号 ${b.bundleNo}｜码数 ${String(b.size || '-')}｜颜色 ${String(b.color || '-')}｜数量 ${Number(b.quantity) || 0}`,
                  }))}
                  onChange={(v) => {
                    const code = String(v || '').trim();
                    const b = rollbackBundles.find((x) => String(x.qrCode || '').trim() === code);
                    rollbackForm.setFieldsValue({
                      scannedQr: code,
                      color: b?.color || '',
                      size: b?.size || '',
                      quantity: Number(b?.quantity) || 0,
                      rollbackQuantity: Number(b?.quantity) || 0,
                    });
                  }}
                />
              </Form.Item>

              <Form.Item label="扎号二维码（必须扫码）" name="scannedQr" rules={[{ required: true, message: '请扫码输入扎号二维码' }]}>
                <Input placeholder="选择扎号后自动带出" disabled />
              </Form.Item>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
                <Form.Item label="颜色" name="color">
                  <Input disabled />
                </Form.Item>
                <Form.Item label="码数" name="size">
                  <Input disabled />
                </Form.Item>
                <Form.Item label="扎号数量" name="quantity">
                  <InputNumber style={{ width: '100%' }} disabled />
                </Form.Item>
                <Form.Item label="回退数量" name="rollbackQuantity">
                  <InputNumber style={{ width: '100%' }} disabled />
                </Form.Item>
              </div>

              <Form.Item label="问题点（必填）" name="remark" rules={[{ required: true, message: '请填写问题点' }]}>
                <Input.TextArea placeholder="请输入问题点（必填）" autoSize={{ minRows: 3, maxRows: 6 }} />
              </Form.Item>
            </>
          )}
        </Form>
      </ResizableModal>

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
