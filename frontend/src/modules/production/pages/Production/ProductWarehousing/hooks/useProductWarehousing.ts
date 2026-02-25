import { useState, useMemo, useEffect, useCallback } from 'react';
import { Form, message } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import api, { useProductionOrderFrozenCache } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import {
  ProductWarehousing as WarehousingType,
  WarehousingQueryParams,
} from '@/types/production';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CuttingBundleRow,
} from '../types';


// 质检入库统计数据类型
export interface WarehousingStats {
  totalCount: number;
  totalOrders: number;
  totalQuantity: number;
  todayCount: number;
  todayOrders: number;
  todayQuantity: number;
  pendingQcBundles: number;
  pendingQcQuantity: number;
  pendingPackagingBundles: number;
  pendingPackagingQuantity: number;
  pendingWarehouseBundles: number;
  pendingWarehouseQuantity: number;
}

const defaultStats: WarehousingStats = {
  totalCount: 0,
  totalOrders: 0,
  totalQuantity: 0,
  todayCount: 0,
  todayOrders: 0,
  todayQuantity: 0,
  pendingQcBundles: 0,
  pendingQcQuantity: 0,
  pendingPackagingBundles: 0,
  pendingPackagingQuantity: 0,
  pendingWarehouseBundles: 0,
  pendingWarehouseQuantity: 0,
};

// 状态筛选类型
export type StatusFilter = 'all' | 'pendingQc' | 'pendingPackaging' | 'pendingWarehouse' | 'completed';

// 待处理菲号行数据
export interface PendingBundleRow {
  bundleId: string;
  bundleNo: number;
  qrCode: string;
  color: string;
  size: string;
  quantity: number;
  orderId: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  styleCover: string;
  status: string;
}

export const useProductWarehousing = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [form] = Form.useForm();

  // State
  const [loading, setLoading] = useState(false);
  const [warehousingList, setWarehousingList] = useState<WarehousingType[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<WarehousingQueryParams>({
    page: 1,
    pageSize: 10,
  });

  // 状态筛选
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pendingBundles, setPendingBundles] = useState<PendingBundleRow[]>([]);
  const [pendingBundlesLoading, setPendingBundlesLoading] = useState(false);

  // 统计卡片
  const [warehousingStats, setWarehousingStats] = useState<WarehousingStats>(defaultStats);

  const [visible, setVisible] = useState(false); // New/Edit Modal
  const [currentWarehousing, setCurrentWarehousing] = useState<WarehousingType | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const [warehousingModalOpen, setWarehousingModalOpen] = useState(false); // Simple Warehousing Modal
  const [warehousingModalLoading, setWarehousingModalLoading] = useState(false);
  const [warehousingModalOrderId, setWarehousingModalOrderId] = useState<string>('');
  const [warehousingModalWarehousingNo, setWarehousingModalWarehousingNo] = useState<string>('');
  const [warehousingModalOrderNo, setWarehousingModalOrderNo] = useState<string>('');
  const [warehousingModalWarehouse, setWarehousingModalWarehouse] = useState<string>('');
  const [warehousingModalStyleNo, setWarehousingModalStyleNo] = useState<string>('');
  const [warehousingModalColor, setWarehousingModalColor] = useState<string>('');
  const [warehousingModalSize, setWarehousingModalSize] = useState<string>('');
  const [warehousingModalQuantity, setWarehousingModalQuantity] = useState<number>(0);

  const [independentDetailOpen, setIndependentDetailOpen] = useState(false);
  const [independentDetailWarehousingNo, setIndependentDetailWarehousingNo] = useState<string>('');
  const [independentDetailSummary, setIndependentDetailSummary] = useState<WarehousingType | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Form/Data State
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);

  // Derived State
  const frozenOrderIds = useMemo(() => {
    return Array.from(new Set(warehousingList.map((r: any) => String(r?.orderId || '').trim()).filter(Boolean)));
  }, [warehousingList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'statusOrStock', acceptAnyData: true });

  // Actions
  const fetchWarehousingStats = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: WarehousingStats }>('/production/warehousing/stats');
      if (res.code === 200 && res.data) {
        setWarehousingStats(res.data);
      }
    } catch {
      // 静默失败
    }
  }, []);

  // 获取待处理菲号列表
  const fetchPendingBundles = useCallback(async (status: string) => {
    setPendingBundlesLoading(true);
    try {
      const res = await api.get<{ code: number; data: PendingBundleRow[] }>('/production/warehousing/pending-bundles', {
        params: { status },
      });
      if (res.code === 200 && res.data) {
        setPendingBundles(res.data);
      } else {
        setPendingBundles([]);
      }
    } catch {
      setPendingBundles([]);
    } finally {
      setPendingBundlesLoading(false);
    }
  }, []);

  // 切换状态筛选
  const handleStatusFilterChange = useCallback((newFilter: StatusFilter) => {
    setStatusFilter(newFilter);
    if (newFilter === 'all' || newFilter === 'completed') {
      setPendingBundles([]);
      fetchWarehousingList();
    } else {
      fetchPendingBundles(newFilter);
    }
  }, []);

  // 跳转到质检详情页
  const navigateToInspect = useCallback((orderId: string, bundleId?: string) => {
    const params = new URLSearchParams();
    if (bundleId) params.set('bundleId', bundleId);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  }, [navigate]);

  const fetchWarehousingList = async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
      if (response.code === 200) {
        setWarehousingList(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error((response as any).message || '获取质检入库列表失败');
      }
    } catch (error) {
      message.error('获取质检入库列表失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchBundlesByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) {
      setBundles([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      if (res.code === 200) {
        setBundles((res.data?.records || []) as CuttingBundleRow[]);
      } else {
        setBundles([]);
      }
    } catch {
      setBundles([]);
    }
  };

  const openDialog = (warehousing?: WarehousingType) => {
    setCurrentWarehousing(warehousing || null);
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentWarehousing(null);
  };

  const openWarehousingModal = (record: WarehousingType) => {
    const oid = String((record as any)?.orderId || '').trim();
    const whNo = String((record as any)?.warehousingNo || '').trim();
    const on = String((record as any)?.orderNo || '').trim();
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    setWarehousingModalOrderId(oid);
    setWarehousingModalWarehousingNo(whNo);
    setWarehousingModalOrderNo(on);
    setWarehousingModalWarehouse('');
    setWarehousingModalStyleNo(String(record?.styleNo || '').trim());
    setWarehousingModalColor(String(record?.color || '').trim());
    setWarehousingModalSize(String(record?.size || '').trim());
    setWarehousingModalQuantity(Number(record?.warehousingQuantity || 0));
    setWarehousingModalOpen(true);
  };

  const closeWarehousingModal = () => {
    setWarehousingModalOpen(false);
    setWarehousingModalLoading(false);
    setWarehousingModalOrderId('');
    setWarehousingModalWarehousingNo('');
    setWarehousingModalOrderNo('');
    setWarehousingModalWarehouse('');
    setWarehousingModalStyleNo('');
    setWarehousingModalColor('');
    setWarehousingModalSize('');
    setWarehousingModalQuantity(0);
  };

  const submitWarehousing = async () => {
    const oid = String(warehousingModalOrderId || '').trim();
    const whNo = String(warehousingModalWarehousingNo || '').trim();
    const warehouse = String(warehousingModalWarehouse || '').trim();
    if (!warehouse) {
      message.error('请选择仓库');
      return;
    }
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    if (oid && !(await ensureOrderUnlockedById(oid))) return;

    try {
      setWarehousingModalLoading(true);
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number }; message?: string }>('/production/warehousing/list', {
        params: {
          page: 1,
          pageSize: 10000,
          ...(whNo ? { warehousingNo: whNo } : {}),
          ...(!whNo && oid ? { orderId: oid } : {}),
        },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取质检记录失败');
        return;
      }
      const records = (res.data?.records || []) as WarehousingType[];
      const targets = records.filter((r) => {
        const qs = String((r as any)?.qualityStatus || '').trim().toLowerCase();
        const qualified = !qs || qs === 'qualified';
        const q = Number((r as any)?.qualifiedQuantity || 0) || 0;
        return qualified && q > 0;
      });

      if (!targets.length) {
        message.info('该订单暂无可入库的合格质检记录');
        return;
      }

      const concurrency = 5;
      const queue = targets.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const r = queue.shift();
          if (!r) continue;
          await api.put<{ code: number; message: string; data: boolean }>('/production/warehousing', { id: (r as any)?.id, warehouse });
        }
      });
      await Promise.all(workers);

      message.success('入库完成');
      closeWarehousingModal();
      fetchWarehousingList();
    } catch (e: any) {
      message.error(e.message || '入库失败');
    } finally {
      setWarehousingModalLoading(false);
    }
  };

  const openIndependentDetailPopup = (record: WarehousingType) => {
    const whNo = String((record as any)?.warehousingNo || '').trim();
    if (!whNo) {
      message.warning('质检入库号为空');
      return;
    }
    setIndependentDetailWarehousingNo(whNo);
    setIndependentDetailSummary(record);
    setIndependentDetailOpen(true);
  };

  const closeIndependentDetailPopup = () => {
    setIndependentDetailOpen(false);
    setIndependentDetailWarehousingNo('');
    setIndependentDetailSummary(null);
  };

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById[orderId] || false;
  };

  // Sync logic
  useSync(
    'product-warehousing-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error) {
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setWarehousingList(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 30000,
      enabled: !loading && !visible && !warehousingModalOpen && !independentDetailOpen,
      pauseOnHidden: true,
      onError: (error) => {
        console.error('[实时同步] 质检入库数据同步错误', error);
      }
    }
  );

  // Effects
  useEffect(() => {
    fetchWarehousingList();
    fetchWarehousingStats();
  }, [queryParams]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        styleNo: styleNo || prev.styleNo,
        orderNo: orderNo || prev.orderNo,
      }));
    }
  }, [location.search]);

  return {
    // State
    loading,
    warehousingList,
    total,
    queryParams,
    setQueryParams,
    visible,
    setVisible,
    currentWarehousing,
    form,
    submitLoading,
    setSubmitLoading,

    // Stats
    warehousingStats,
    fetchWarehousingStats,

    // Status Filter
    statusFilter,
    setStatusFilter,
    handleStatusFilterChange,
    pendingBundles,
    pendingBundlesLoading,
    fetchPendingBundles,
    navigateToInspect,

    // Modal State
    warehousingModalOpen,
    setWarehousingModalOpen,
    warehousingModalLoading,
    setWarehousingModalLoading,
    warehousingModalOrderId,
    setWarehousingModalOrderId,
    warehousingModalWarehousingNo,
    setWarehousingModalWarehousingNo,
    warehousingModalOrderNo,
    setWarehousingModalOrderNo,
    warehousingModalWarehouse,
    setWarehousingModalWarehouse,
    warehousingModalStyleNo,
    warehousingModalColor,
    warehousingModalSize,
    warehousingModalQuantity,

    independentDetailOpen,
    setIndependentDetailOpen,
    independentDetailWarehousingNo,
    setIndependentDetailWarehousingNo,
    independentDetailSummary,
    setIndependentDetailSummary,

    previewOpen,
    setPreviewOpen,
    previewUrl,
    setPreviewUrl,
    previewTitle,
    setPreviewTitle,

    // Form/Data State
    bundles,
    setBundles,
    unqualifiedFileList,
    setUnqualifiedFileList,

    // Actions
    fetchWarehousingList,
    fetchBundlesByOrderNo,
    openDialog,
    closeDialog,
    openWarehousingModal,
    closeWarehousingModal,
    submitWarehousing,
    openIndependentDetailPopup,
    closeIndependentDetailPopup,
    ensureOrderUnlockedById,
    isOrderFrozenById,
  };
};
