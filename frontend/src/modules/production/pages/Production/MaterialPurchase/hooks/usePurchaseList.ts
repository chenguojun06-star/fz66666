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
import { usePersistentSort } from '@/hooks/usePersistentSort';

const getPurchaseQueryStorage = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
};

type PurchaseStats = {
  totalCount: number; totalQuantity: number;
  pendingCount: number; pendingQuantity: number;
  receivedCount: number; receivedQuantity: number;
  partialCount: number; partialQuantity: number;
  completedCount: number; completedQuantity: number;
  cancelledCount: number; overdueCount: number;
};
const EMPTY_STATS: PurchaseStats = {
  totalCount: 0, totalQuantity: 0,
  pendingCount: 0, pendingQuantity: 0,
  receivedCount: 0, receivedQuantity: 0,
  partialCount: 0, partialQuantity: 0,
  completedCount: 0, completedQuantity: 0,
  cancelledCount: 0, overdueCount: 0,
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
  const {
    sortField,
    sortOrder,
    handleSort,
  } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'material-purchase-list',
    defaultField: 'createTime',
    defaultOrder: 'desc',
  });
  const {
    sortField: purchaseSortField,
    sortOrder: purchaseSortOrder,
    handleSort: handlePurchaseSort,
  } = usePersistentSort<string, 'asc' | 'desc'>({
    storageKey: 'material-purchase-dialog',
    defaultField: 'createTime',
    defaultOrder: 'desc',
  });
  const [purchaseStats, setPurchaseStats] = useState<PurchaseStats>(EMPTY_STATS);
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'pending' | 'received' | 'partial' | 'completed' | 'overdue'>('all');
  const [showAllPurchases, setShowAllPurchases] = useState(false);

  const [queryParams, setQueryParams] = useState<MaterialQueryParams>(() => {
    const base: MaterialQueryParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
    if (typeof window === 'undefined') return base;
    try {
      const storage = getPurchaseQueryStorage();
      const raw = storage?.getItem(PURCHASE_QUERY_STORAGE_KEY) || window.sessionStorage.getItem(PURCHASE_QUERY_STORAGE_KEY);
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

  // 本地持久化，同步兼容旧 sessionStorage 缓存并清理旧键
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      getPurchaseQueryStorage()?.setItem(PURCHASE_QUERY_STORAGE_KEY, JSON.stringify(queryParams));
      window.sessionStorage.removeItem(PURCHASE_QUERY_STORAGE_KEY);
    } catch { /**/ }
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

  const handleStatClick = (type: 'all' | 'pending' | 'received' | 'partial' | 'completed' | 'overdue') => {
    setActiveStatFilter(type);
    setShowAllPurchases(type === 'all');
    setQueryParams(prev => ({ ...prev, status: (type === 'all' || type === 'overdue') ? '' : type, page: 1 }));
  };

  const sortedPurchaseList = useMemo(() => {
    let list = [...purchaseList];
    if (!showAllPurchases && !queryParams.status) {
      list = list.filter((r: any) => {
        const s = String(r.status || '').trim().toLowerCase();
        return s !== 'completed' && s !== 'cancelled';
      });
    }
    list.sort((a: any, b: any) => {
      const aStatus = String(a.status || '').trim().toLowerCase();
      const bStatus = String(b.status || '').trim().toLowerCase();
      const aCancelled = aStatus === 'cancelled' ? 2 : aStatus === 'completed' ? 1 : 0;
      const bCancelled = bStatus === 'cancelled' ? 2 : bStatus === 'completed' ? 1 : 0;
      if (aCancelled !== bCancelled) return aCancelled - bCancelled;
      if (sortField === 'createTime' || sortField === 'returnConfirmTime') {
        const at = a[sortField] ? new Date(a[sortField]).getTime() : 0;
        const bt = b[sortField] ? new Date(b[sortField]).getTime() : 0;
        return sortOrder === 'desc' ? bt - at : at - bt;
      }
      return 0;
    });
    return list;
  }, [purchaseList, sortField, sortOrder, showAllPurchases, queryParams.status]);

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
  // 注意：依赖里不放 fetchMaterialPurchaseList，因为它的 useCallback 依赖 message
  // （来自 antd message.useMessage()），该引用可能每次渲染都变，会导致无限循环。
  // 只依赖 activeTabKey + queryParams（触发重新 fetch 的数据字段），
  // fetchMaterialPurchaseList 内部会读到最新的闭包变量。
  useEffect(() => {
    if (activeTabKey === 'purchase') fetchMaterialPurchaseList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey, queryParams]);

  useEffect(() => {
    if (activeTabKey === 'purchase') fetchPurchaseStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabKey, queryParams]);

  // 实时同步（30s 轮询）
  // 关键修复 2026-08-02：
  // 1) 用 JSON.stringify(queryParams + activeTabKey + dialogVisible) 做 fetchSig，
  //    只在查询真的变了时让 useSync 重置 lastData，
  //    防止"查询没变只是闭包引用变 → lastData 清空 → 每次 onDataChange 触发 setState → 重渲染 → 下轮 lastData 又空 → 无限循环刷新"
  // 2) syncFetchFn 不吞 HTTP / 业务异常：让 error throw 出去，错误闸门 maxErrors 才真正生效。
  //    （之前 return null → 被当"成功"，即使后端全 500 也永远轮询不停止）
  const syncFetchFn = useCallback(async () => {
    const res = await api.get<{ code: number; message?: string; data: { records: MaterialPurchaseType[]; total: number } }>(
      '/production/purchase/list', { params: queryParams },
    );
    if (res.code !== 200) {
      throw new Error(res.message || '获取物料采购列表失败');
    }
    const raw = Array.isArray(res.data?.records) ? res.data.records : [];
    const filtered = await filterOutMissingOrders(raw);
    const removed = raw.length - filtered.length;
    return { records: filtered, total: Math.max(Number(res.data?.total || 0) - Math.max(removed, 0), 0) };
  }, [queryParams, filterOutMissingOrders]);

  const syncOnDataChange = useCallback((newData: { records: MaterialPurchaseType[]; total: number } | null, oldData: { records: MaterialPurchaseType[]; total: number } | null) => {
    if (!newData) return;
    // ★ 关键修复1：首次同步（oldData===null）不触发 setState，因为初始 useEffect 已经加载过一次。
    // 如果首次就 setState → 重渲染 → 下面的 syncEnabled 原来写了 !loading → 如果之前的 fetchMaterialPurchaseList
    // 刚好 setLoading(true) 时这里被 startSync 又立即执行一次，会导致 loading→syncEnabled 抖动，
    // 停了又启、启了又执行 fetch，造成狂打 API 的"无限刷新"观感。
    if (oldData === null) return;
    setPurchaseList(newData.records);
    setTotal(newData.total);
    void fetchPurchaseStats();
  }, [fetchPurchaseStats]);

  const syncOnError = useCallback((err: Error) => {
    if (showSmartErrorNotice) {
      setSmartError({
        title: '物料采购实时同步失败（已暂停，刷新页面后重试）',
        reason: err?.message || '网络异常',
        code: 'MATERIAL_PURCHASE_SYNC_FAILED',
      });
    }
    console.warn('[实时同步] 物料采购数据同步失败（累计达阈值后会自动停止轮询）：', err);
  }, [showSmartErrorNotice, setSmartError]);

  // ★ 关键修复2：syncEnabled 不要带 !loading。
  // 原来的逻辑：初始 fetchMaterialPurchaseList() 把 loading 设 true → syncEnabled=false → stopSync →
  // fetchMaterialPurchaseList 结束时 loading=false → syncEnabled=true → startSync 又立即跑一次 fetch →
  // onDataChange 又 setState → 重渲染 → 进入恶性循环（特别是数据本身相等但 ref/obj 不同的情况下）。
  // 同步任务与手动加载应当相互独立：轮询只是"后台增量同步"，不要被 loading 启停打断。
  const syncEnabled = activeTabKey === 'purchase' && !dialogVisible;
  const fetchSig = useMemo(
    () => JSON.stringify({ activeTabKey, dialogVisible, queryParams }),
    [activeTabKey, dialogVisible, queryParams],
  );

  useSync(
    'material-purchase-list',
    syncFetchFn,
    syncOnDataChange,
    {
      interval: 30000,
      enabled: syncEnabled,
      pauseOnHidden: true,
      onError: syncOnError,
      maxErrors: 3,
      fetchSig,
    },
  );

  const handleDeleteOrphan = useCallback(async (record: MaterialPurchaseType) => {
    try {
      const res = await api.delete<{ code: number; message?: string }>(`/production/purchase/${record.id}`);
      if ((res as { code: number }).code === 200) {
        message.success('孤儿采购单已删除');
        await fetchMaterialPurchaseList();
      } else {
        message.error((res as { message?: string }).message || '删除失败');
      }
    } catch {
      message.error('删除失败，请重试');
    }
  }, [fetchMaterialPurchaseList, message]);

  return {
    purchaseList, loading, total,
    queryParams, setQueryParams,
    sortField, sortOrder, purchaseSortField, purchaseSortOrder,
    sortedPurchaseList, overdueCount,
    purchaseStats, activeStatFilter,
    showAllPurchases, setShowAllPurchases,
    fetchMaterialPurchaseList, fetchPurchaseStats,
    handleSort, handlePurchaseSort, handleStatClick,
    ensureOrderUnlocked, isOrderFrozenForRecord,
    handleDeleteOrphan,
  };
}
