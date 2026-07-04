import { useState, useCallback, useMemo } from 'react';
import api, { type ApiResult } from '@/utils/api';

export interface UniversalStock {
  id: number;
  tenantId: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  totalWarehoused: number;
  totalOutstock: number;
  pendingOrders: number;
  availableStock: number;
  safeStock: number;
  bufferStock: number;
  onWayProduction: number;
  lastSyncTime: string;
}

export interface StockAlert {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  warehouse: string | null;
  alertType: string;
  currentStock: number;
  safeStock: number;
  message: string;
  isResolved: boolean;
  createTime: string;
}

export interface PurchaseSuggestion {
  id: number;
  styleId: number;
  skuId: number;
  skuCode: string | null;
  styleNo: string | null;
  suggestQuantity: number;
  urgencyLevel: string;
  reason: string;
  sales30d: number;
  availableStock: number;
  onWayStock: number;
  onWayProduction: number;
  status: number;
  /** 建议类型：PURCHASE=采购 / PRODUCTION=生产（AI 补货顾问） */
  suggestionType?: string;
  /** 关联生产订单ID（转生产后回填） */
  productionOrderId?: number | null;
  /** AI 置信度 0-100 */
  aiConfidence?: number | null;
  /** AI 推理过程 */
  aiReason?: string | null;
  createTime: string;
}

export interface WarehouseAllocation {
  id: number;
  orderId: number;
  orderNo: string;
  skuCode: string;
  warehouse: string;
  allocatedQuantity: number;
  allocationType: string;
  /** Phase 2: 分配综合得分 0-100 */
  score?: number | null;
  /** Phase 2: 分配原因 */
  reason?: string | null;
  /** Phase 2: 预估到货时效（天） */
  estimatedDays?: number | null;
  createTime: string;
}

export interface OrderSplit {
  id: number;
  originalOrderId: number;
  originalOrderNo: string;
  splitOrderNo: string;
  skuCode: string;
  warehouse: string;
  splitQuantity: number;
  splitReason: string;
  /** Phase 2: 拆单类型 PARTIAL_STOCK/BY_WAREHOUSE/BY_SKU/PRESALE/ADDRESS */
  splitType?: string;
  status: number;
  createTime: string;
}

// ==================== Phase 2: 订单深加工 ====================

export interface MergeOrderItem {
  orderId: number;
  orderNo: string;
  skuCode: string;
  quantity: number;
  totalAmount: number;
}

export interface MergeGroup {
  receiverName: string;
  receiverPhone: string;
  platform: string;
  orderCount: number;
  totalQuantity: number;
  orders: MergeOrderItem[];
}

export interface MergeResult {
  successCount: number;
  failedOrderIds: number[];
  trackingNo: string;
  totalCount: number;
}

export interface GiftRule {
  id?: number;
  tenantId?: number;
  ruleName: string;
  giftSkuCode: string;
  giftQuantity: number;
  triggerType: 'AMOUNT' | 'QUANTITY' | 'PLATFORM';
  triggerValue?: number;
  triggerPlatform?: string;
  startTime?: string;
  endTime?: string;
  enabled: number;
  deleteFlag?: number;
  createTime?: string;
  updateTime?: string;
}

export interface GiftMatch {
  ruleId: number;
  ruleName: string;
  giftSkuCode: string;
  giftQuantity: number;
  triggerType: string;
  reason: string;
}

// ==================== Phase 3: 物流异常 + 账单对账 ====================

export interface LogisticsAnomaly {
  id: number;
  tenantId?: number;
  orderId: number;
  orderNo: string;
  trackingNo?: string | null;
  expressCompany?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
  anomalyType: string;
  severity: string;
  daysSinceUpdate?: number;
  lastTrackDesc?: string | null;
  lastTrackTime?: string | null;
  aiAdvice?: string | null;
  aiConfidence?: number | null;
  handledStatus: number;
  handledBy?: string | null;
  handledTime?: string | null;
  handledRemark?: string | null;
  createTime?: string;
}

export interface PlatformBill {
  id: number;
  tenantId?: number;
  platform: string;
  shopName?: string | null;
  billPeriod: string;
  billNo?: string | null;
  platformOrderNo: string;
  localRevenueId?: number | null;
  localRevenueNo?: string | null;
  platformAmount: number;
  localAmount: number;
  diffAmount: number;
  diffType: string;
  aiAnalysis?: string | null;
  aiConfidence?: number | null;
  handledStatus: number;
  handledBy?: string | null;
  handledTime?: string | null;
  fetchedTime?: string | null;
  createTime?: string;
}

export interface ReconcileResult {
  billPeriod: string;
  totalBills: number;
  matched: number;
  mismatched: number;
  missingLocal: number;
  newBills: number;
}

export function useEcStock() {
  const [stockList, setStockList] = useState<UniversalStock[]>([]);
  const [alerts, setAlerts] = useState<StockAlert[]>([]);
  const [suggestions, setSuggestions] = useState<PurchaseSuggestion[]>([]);
  const [allocations, setAllocations] = useState<WarehouseAllocation[]>([]);
  const [splits, setSplits] = useState<OrderSplit[]>([]);
  const [mergeGroups, setMergeGroups] = useState<MergeGroup[]>([]);
  const [giftRules, setGiftRules] = useState<GiftRule[]>([]);
  const [anomalies, setAnomalies] = useState<LogisticsAnomaly[]>([]);
  const [bills, setBills] = useState<PlatformBill[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<UniversalStock[]>>('/ec/stock/list');
      setStockList(res?.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchLowStock = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApiResult<UniversalStock[]>>('/ec/stock/low-stock');
      setStockList(res?.data ?? []);
    } finally { setLoading(false); }
  }, []);

  const fetchAlerts = useCallback(async (unresolvedOnly = true) => {
    try {
      const res = await api.get<ApiResult<StockAlert[]>>(`/ec/stock/alerts?unresolvedOnly=${unresolvedOnly}`);
      setAlerts(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchSuggestions = useCallback(async (pendingOnly = true) => {
    try {
      const res = await api.get<ApiResult<PurchaseSuggestion[]>>(`/ec/stock/suggestions?pendingOnly=${pendingOnly}`);
      setSuggestions(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchAllocations = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<WarehouseAllocation[]>>('/ec/stock/allocations');
      setAllocations(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const fetchSplits = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<OrderSplit[]>>('/ec/stock/splits');
      setSplits(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  const syncAll = useCallback(async () => {
    await api.post('/ec/stock/sync');
    await fetchStock();
  }, [fetchStock]);

  const generateSuggestions = useCallback(async () => {
    await api.post('/ec/stock/suggestions/generate');
    await fetchSuggestions();
  }, [fetchSuggestions]);

  /** AI 补货顾问扫描：扫描预警生成 AI 建议 */
  const aiScanSuggestions = useCallback(async () => {
    const res = await api.post<ApiResult<{ created: number }>>('/ec/stock/suggestions/ai-scan');
    await fetchSuggestions();
    return res?.data?.created ?? 0;
  }, [fetchSuggestions]);

  const approveSuggestion = useCallback(async (id: number) => {
    const res = await api.post<ApiResult<{ message?: string; productionOrderId?: string; suggestionType?: string }>>(`/ec/stock/suggestions/${id}/approve`);
    await fetchSuggestions();
    return res?.data;
  }, [fetchSuggestions]);

  const rejectSuggestion = useCallback(async (id: number) => {
    await api.post(`/ec/stock/suggestions/${id}/reject`);
    await fetchSuggestions();
  }, [fetchSuggestions]);

  const resolveAlert = useCallback(async (id: number) => {
    await api.post(`/ec/stock/alerts/${id}/resolve`);
    await fetchAlerts();
  }, [fetchAlerts]);

  const updateSafeStock = useCallback(async (skuId: number, safeStock: number) => {
    await api.put('/ec/stock/safe-stock', { skuId, safeStock });
    await fetchStock();
  }, [fetchStock]);

  // ==================== Phase 2: 订单深加工 ====================

  /** 查询合单候选组 */
  const fetchMergeCandidates = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<MergeGroup[]>>('/ecommerce/merge-candidates');
      setMergeGroups(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  /** 合单发货 */
  const mergeOutbound = useCallback(async (orderIds: number[], trackingNo: string, expressCompany: string) => {
    const res = await api.post<ApiResult<MergeResult>>('/ecommerce/merge-outbound',
      { orderIds, trackingNo, expressCompany });
    await fetchMergeCandidates();
    return res?.data;
  }, [fetchMergeCandidates]);

  /** 查询赠品规则 */
  const fetchGiftRules = useCallback(async () => {
    try {
      const res = await api.get<ApiResult<GiftRule[]>>('/ecommerce/gift-rules');
      setGiftRules(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  /** 保存赠品规则 */
  const saveGiftRule = useCallback(async (rule: GiftRule) => {
    await api.post('/ecommerce/gift-rules', rule);
    await fetchGiftRules();
  }, [fetchGiftRules]);

  /** 删除赠品规则 */
  const deleteGiftRule = useCallback(async (id: number) => {
    await api.delete(`/ecommerce/gift-rules/${id}`);
    await fetchGiftRules();
  }, [fetchGiftRules]);

  /** 匹配赠品 */
  const matchGifts = useCallback(async (orderAmount?: number, orderQuantity?: number, platformCode?: string) => {
    const res = await api.post<ApiResult<GiftMatch[]>>('/ecommerce/gift-rules/match',
      { orderAmount, orderQuantity, platformCode });
    return res?.data ?? [];
  }, []);

  // ==================== Phase 3: 物流异常 + 账单对账 ====================

  /** 查询物流异常列表 */
  const fetchAnomalies = useCallback(async (unhandledOnly = true) => {
    try {
      const res = await api.get<ApiResult<LogisticsAnomaly[]>>(
        `/ecommerce/logistics/anomalies?unhandledOnly=${unhandledOnly}`);
      setAnomalies(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  /** 扫描物流异常 */
  const scanAnomalies = useCallback(async () => {
    const res = await api.post<ApiResult<number>>('/ecommerce/logistics/anomaly-scan');
    await fetchAnomalies();
    return res?.data ?? 0;
  }, [fetchAnomalies]);

  /** 处理物流异常 */
  const handleAnomaly = useCallback(async (id: number, remark?: string) => {
    await api.post(`/ecommerce/logistics/anomalies/${id}/handle`, { remark });
    await fetchAnomalies();
  }, [fetchAnomalies]);

  /** 忽略物流异常 */
  const ignoreAnomaly = useCallback(async (id: number, remark?: string) => {
    await api.post(`/ecommerce/logistics/anomalies/${id}/ignore`, { remark });
    await fetchAnomalies();
  }, [fetchAnomalies]);

  /** 查询账单列表 */
  const fetchBills = useCallback(async (pendingOnly = true, billPeriod?: string) => {
    try {
      const periodParam = billPeriod ? `&billPeriod=${encodeURIComponent(billPeriod)}` : '';
      const res = await api.get<ApiResult<PlatformBill[]>>(
        `/ecommerce/bills?pendingOnly=${pendingOnly}${periodParam}`);
      setBills(res?.data ?? []);
    } catch { /* handled */ }
  }, []);

  /** 触发账单对账 */
  const reconcileBills = useCallback(async (platform?: string, billPeriod?: string) => {
    const res = await api.post<ApiResult<ReconcileResult>>('/ecommerce/bill/reconcile',
      { platform, billPeriod });
    await fetchBills(false);
    return res?.data;
  }, [fetchBills]);

  /** 处理账单差异 */
  const handleBill = useCallback(async (id: number, status: number, remark?: string) => {
    await api.post(`/ecommerce/bills/${id}/handle`, { status, remark });
    await fetchBills(false);
  }, [fetchBills]);

  return useMemo(() => ({
    stockList, alerts, suggestions, allocations, splits, mergeGroups, giftRules,
    anomalies, bills, loading,
    fetchStock, fetchLowStock, fetchAlerts, fetchSuggestions,
    fetchAllocations, fetchSplits, syncAll, generateSuggestions, aiScanSuggestions,
    approveSuggestion, rejectSuggestion, resolveAlert, updateSafeStock,
    fetchMergeCandidates, mergeOutbound, fetchGiftRules, saveGiftRule, deleteGiftRule, matchGifts,
    fetchAnomalies, scanAnomalies, handleAnomaly, ignoreAnomaly,
    reconcileBills, fetchBills, handleBill,
  }), [stockList, alerts, suggestions, allocations, splits, mergeGroups, giftRules,
    anomalies, bills, loading,
    fetchStock, fetchLowStock, fetchAlerts, fetchSuggestions,
    fetchAllocations, fetchSplits, syncAll, generateSuggestions, aiScanSuggestions,
    approveSuggestion, rejectSuggestion, resolveAlert, updateSafeStock,
    fetchMergeCandidates, mergeOutbound, fetchGiftRules, saveGiftRule, deleteGiftRule, matchGifts,
    fetchAnomalies, scanAnomalies, handleAnomaly, ignoreAnomaly,
    reconcileBills, fetchBills, handleBill]);
}
