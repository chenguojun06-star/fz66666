/**
 * usePurchaseList — 采购列表状态：列表数据/排序/统计卡片/冻结判断/实时同步
 * ~155 lines (target ≤ 200)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSync } from '@/utils/syncManager';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import type { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams } from '@/types/production';
import { DEFAULT_PAGE_SIZE } from '@/constants/business';
import { PURCHASE_QUERY_STORAGE_KEY, type MaterialPurchaseTabKey } from '../types';
import type { SmartErrorInfo } from '@/smart/core/types';

type PurchaseStats = {
  totalCount: number; totalQuantity: number;
  pendingCount: number; receivedCount: number;
  partialCount: number; completedCount: number;
  cancelledCount: number; overdueCount: number;
};
const EMPTY_STATS: PurchaseStats = {
  totalCount: 0, totalQuantity: 0, pendingCount: 0, receivedCount: 0,
  partialCount: 0, completedCount: 0, cancelledCount: 0, overdueCount: 0,
};

interface UsePurchaseListOptions {
  message: any;
  setSmartError: (e: SmartErrorInfo | null) => void;
  showSmartErrorNotice: boolean;
  activeTabKey: MaterialPurchaseTabKey;
  locationSearch: string;
  dialogVisible?: boolean;
}

export function usePurchaseList({
  message, setSmartError, showSmartErrorNotice,
  activeTabKey, locationSearch, dialogVisible = false,
}: UsePurchaseListOptions) {
  const [purchaseList, setPurchaseList] = useState<MaterialPurchaseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [purchaseSortField, setPurchaseSortField] = useState('createTime');
  const [purchaseSortOrder, setPurchaseSortOrder] = useState<'asc' | 'desc'>('desc');
  const [purchaseStats, setPurchaseStats] = useState<PurchaseStats>(EMPTY_STATS);
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'pending' | 'received' | 'partial' | 'completed' | 'overdue'>('all');

  const [queryParams, setQueryParams] = useState<MaterialQueryParams>(() => {
    const base: MaterialQueryParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(PURCHASE_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as any).page);
      const pageSize = Number((parsed as any).pageSize);
      return {
        ...base, ...(parsed as any),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
      };
    } catch { return base; }
  });

  // sessionStorage 同步
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { sessionStorage.setItem(PURCHASE_QUERY_STORAGE_KEY, JSON.stringify(queryParams)); } catch { /**/ }
  }, [queryParams]);

  // URL 参数 → queryParams（如从订单页跳转携带 orderNo）
  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const orderNo = (params.get('orderNo') || '').trim();
    if (orderNo) setQueryParams(prev => ({ ...prev, page: 1, orderNo }));
  }, [locationSearch]);

  // 订单冻结判断
  const frozenOrderIds = useMemo(
    () => Array.from(new Set(purchaseList.map(r => String(r.orderNo || '').trim()).filter(Boolean))),
    [purchaseList],
  );
  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'status', acceptAnyData: true });

  const ensureOrderUnlocked = async (orderId: any) =>
    await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));

  const isOrderFrozenForRecord = (record?: Record<string, unknown> | null) => {
    if (!record) return false;
    if (String(record?.status || '').trim().toLowerCase() === 'completed') return true;
    const sourceType = String(record?.sourceType || '').trim();
    const orderNo = String(record?.orderNo || '').trim();
    if (sourceType === 'sample' || !orderNo || orderNo === '-') return false;
    const orderId = String(record?.orderId || record?.id || '').trim();
    return orderFrozen.isFrozenById[orderNo] || orderFrozen.isFrozenById[orderId] || false;
  };

  const filterOutMissingOrders = useCallback(async (records: MaterialPurchaseType[]) => records, []);

  const fetchPurchaseStats = useCallback(async () => {
    try {
      const fp: Record<string, string> = {};
      if (queryParams.materialType) fp.materialType = queryParams.materialType;
      if (queryParams.sourceType) fp.sourceType = queryParams.sourceType;
      if (queryParams.orderNo) fp.orderNo = queryParams.orderNo;
      const res = await api.get<{ code: number; data: PurchaseStats }>('/production/purchase/stats', { params: fp });
      if (res.code === 200 && res.data) setPurchaseStats(res.data);
    } catch (err) { console.error('获取采购统计失败', err); }
  }, [queryParams.materialType, queryParams.sourceType, queryParams.orderNo]);

  const fetchMaterialPurchaseList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; message?: string; data: { records: MaterialPurchaseType[]; total: number } }>(
        '/production/purchase/list', { params: queryParams },
      );
      if (res.code === 200) {
        const records = res.data.records || [];
        const filtered = await filterOutMissingOrders(records);
        const removed = records.length - filtered.length;
        setPurchaseList(filtered);
        setTotal(Math.max(Number(res.data.total || 0) - Math.max(removed, 0), 0));
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        if (showSmartErrorNotice) setSmartError({ title: '物料采购列表加载失败', reason: res.message || '服务返回异常', code: 'MATERIAL_PURCHASE_LIST_FAILED' });
        message.error(res.message || '获取物料采购列表失败');
      }
    } catch (error) {
      if (showSmartErrorNotice) setSmartError({ title: '物料采购列表加载失败', reason: (error as Error)?.message || '网络异常', code: 'MATERIAL_PURCHASE_LIST_EXCEPTION' });
      message.error('获取物料采购列表失败');
    } finally { setLoading(false); }
  }, [filterOutMissingOrders, queryParams, showSmartErrorNotice, setSmartError, message]);

  const handleSort = (field: string, order: 'asc' | 'desc') => { setSortField(field); setSortOrder(order); };
  const handlePurchaseSort = (field: string, order: 'asc' | 'desc') => { setPurchaseSortField(field); setPurchaseSortOrder(order); };

  const handleStatClick = (type: 'all' | 'pending' | 'received' | 'partial' | 'completed' | 'overdue') => {
    setActiveStatFilter(type);
    setQueryParams(prev => ({ ...prev, status: (type === 'all' || type === 'overdue') ? '' : type, page: 1 }));
  };

  const sortedPurchaseList = useMemo(() => {
    const sorted = [...purchaseList];
    sorted.sort((a: any, b: any) => {
      if (sortField === 'createTime' || sortField === 'returnConfirmTime') {
        const at = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bt = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortOrder === 'desc' ? bt - at : at - bt;
      }
      return 0;
    });
    return sorted;
  }, [purchaseList, sortField, sortOrder]);

  const overdueCount = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return sortedPurchaseList.filter((r: any) => {
      const s = String(r.status || '').toLowerCase();
      if (s === 'completed' || s === 'cancelled') return false;
      const exp = r.expectedArrivalDate || r.expectedShipDate;
      return exp ? new Date(exp) < today : false;
    }).length;
  }, [sortedPurchaseList]);

  // 同步搜索栏 status → 统计卡片高亮
  useEffect(() => {
    const s = (queryParams.status || '').trim().toLowerCase();
    if (!s || s === 'cancelled') setActiveStatFilter('all');
    else if (['pending', 'received', 'partial', 'completed'].includes(s)) setActiveStatFilter(s as any);
    else setActiveStatFilter('all');
  }, [queryParams.status]);

  // 列表加载
  useEffect(() => {
    if (activeTabKey === 'purchase') fetchMaterialPurchaseList();
  }, [activeTabKey, fetchMaterialPurchaseList, queryParams]);

  useEffect(() => {
    if (activeTabKey === 'purchase') fetchPurchaseStats();
  }, [activeTabKey, fetchPurchaseStats]);

  // 实时同步（30s 轮询）
  useSync(
    'material-purchase-list',
    async () => {
      try {
        const res = await api.get<{ code: number; data: { records: MaterialPurchaseType[]; total: number } }>(
          '/production/purchase/list', { params: queryParams },
        );
        if (res.code !== 200) return null;
        const raw = Array.isArray(res.data?.records) ? res.data.records : [];
        const filtered = await filterOutMissingOrders(raw);
        const removed = raw.length - filtered.length;
        return { records: filtered, total: Math.max(Number(res.data?.total || 0) - Math.max(removed, 0), 0) };
      } catch (err) { console.error('[实时同步] 获取物料采购列表失败', err); return null; }
    },
    (newData) => {
      if (newData) { setPurchaseList(newData.records); setTotal(newData.total); fetchPurchaseStats(); }
    },
    { interval: 30000, enabled: !loading && activeTabKey === 'purchase' && !dialogVisible, pauseOnHidden: true,
      onError: (err) => console.error('[实时同步] 物料采购数据同步错误', err) },
  );

  return {
    purchaseList, loading, total,
    queryParams, setQueryParams,
    sortField, sortOrder, purchaseSortField, purchaseSortOrder,
    sortedPurchaseList, overdueCount,
    purchaseStats, activeStatFilter,
    fetchMaterialPurchaseList, fetchPurchaseStats,
    handleSort, handlePurchaseSort, handleStatClick,
    ensureOrderUnlocked, isOrderFrozenForRecord,
  };
}
