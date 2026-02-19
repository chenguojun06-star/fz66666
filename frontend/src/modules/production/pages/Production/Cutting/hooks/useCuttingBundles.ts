import React, { useEffect, useMemo, useRef, useState } from 'react';
import api, { compareSizeAsc, fetchProductionOrderDetail, parseProductionOrderLines } from '@/utils/api';
import { useSync } from '@/utils/syncManager';
import { useAuth } from '@/utils/AuthContext';
import type { CuttingTask, MaterialPurchase } from '@/types/production';
import { getMaterialTypeSortKey } from '@/utils/materialType';

interface CuttingBundleRow {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleNo?: string;
  skuNo?: string;
  color: string;
  size: string;
  quantity: number;
  bundleNo?: number;
  bedNo?: number; // 床号（裁剪批次编号）
  qrCode?: string;
  status?: string;
  creatorId?: string; // 创建人ID
  creatorName?: string; // 创建人姓名
  operatorId?: string; // 操作人ID（最后操作人）
  operatorName?: string; // 操作人姓名（最后操作人）
}

interface CuttingQueryParams {
  page: number;
  pageSize: number;
}

interface UseCuttingBundlesOptions {
  message: any;
  modal: any;
  activeTask: CuttingTask | null;
  orderId: string;
  isEntryPage: boolean;
  ensureOrderUnlockedById: (id: any) => Promise<boolean>;
  syncActiveTaskByOrderNo: (orderNo: string) => Promise<CuttingTask | null>;
}

/**
 * 裁剪菲号管理 Hook
 * 管理菲号列表、生成、自动导入、面辅料采购
 */
export function useCuttingBundles({
  message, modal, activeTask, orderId, isEntryPage,
  ensureOrderUnlockedById, syncActiveTaskByOrderNo,
}: UseCuttingBundlesOptions) {
  useAuth();
  const editSectionRef = useRef<HTMLDivElement | null>(null);

  // 菲号输入
  const [bundlesInput, setBundlesInput] = useState<CuttingBundleRow[]>([{ skuNo: '', color: '', size: '', quantity: 0 }]);
  const [importLocked, setImportLocked] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  // 菲号列表
  const [queryParams, setQueryParams] = useState<CuttingQueryParams>({ page: 1, pageSize: 10 });
  const [listLoading, setListLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CuttingBundleRow[]>([]);
  const [total, setTotal] = useState(0);

  // 菲号选择
  const [selectedBundleRowKeys, setSelectedBundleRowKeys] = useState<React.Key[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<CuttingBundleRow[]>([]);

  // 面辅料采购
  const [entryPurchaseLoading, setEntryPurchaseLoading] = useState(false);
  const [entryPurchases, setEntryPurchases] = useState<MaterialPurchase[]>([]);
  const entryPurchaseReqSeq = useRef(0);

  // 订单明细
  const [entryOrderDetailLoading, setEntryOrderDetailLoading] = useState(false);
  const [entryColorText, setEntryColorText] = useState('');
  const [entrySizeItems, setEntrySizeItems] = useState<Array<{ size: string; quantity: number }>>([]);

  const activeOrderNo = useMemo(() => String((activeTask as unknown as any)?.productionOrderNo ?? '').trim(), [activeTask]);

  const clearBundleSelection = () => {
    setSelectedBundleRowKeys([]);
    setSelectedBundles([]);
  };

  const splitQuantity = (totalQty: number, perBundle = 20) => {
    const qty = Math.max(0, Number(totalQty) || 0);
    const per = Math.max(1, Number(perBundle) || 20);
    const out: number[] = [];
    let remain = qty;
    while (remain > 0) {
      out.push(Math.min(per, remain));
      remain -= per;
    }
    return out;
  };

  // 获取菲号列表
  const fetchBundles = async () => {
    if (!activeTask?.productionOrderNo) {
      setDataSource([]);
      setTotal(0);
      return;
    }
    setListLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { ...queryParams, orderNo: activeTask.productionOrderNo },
      });
      if (res.code === 200) {
        setDataSource(res.data.records || []);
        setTotal(res.data.total || 0);
      } else {
        message.error(res.message || '获取裁剪列表失败');
      }
    } catch {
      message.error('获取裁剪列表失败');
    } finally {
      setListLoading(false);
    }
  };

  // 排序后的采购列表
  async function fetchSortedPurchasesByOrderNo(orderNo: string) {
    const no = String(orderNo || '').trim();
    if (!no) return [] as MaterialPurchase[];
    try {
      const res = await api.get<{ code: number; data: { records: MaterialPurchase[] } }>('/production/purchase/list', {
        params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' },
      });
      if (res.code !== 200) return [] as MaterialPurchase[];
      const records = (res.data?.records || []) as MaterialPurchase[];
      const sorted = [...records].sort((a: any, b: any) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        const ca = String(a?.materialCode || '');
        const cb = String(b?.materialCode || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
      return sorted as unknown as MaterialPurchase[];
    } catch {
      return [] as MaterialPurchase[];
    }
  }

  // 行操作
  const handleAddRow = () => {
    setBundlesInput(prev => ([...prev, { skuNo: '', color: '', size: '', quantity: 0 }]));
  };

  const handleRemoveRow = (index: number) => {
    setBundlesInput(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeRow = (index: number, key: keyof CuttingBundleRow, value: any) => {
    setBundlesInput(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value } as CuttingBundleRow;
      return next;
    });
  };

  // 生成菲号
  const handleGenerate = async () => {
    let resolvedOrderId = orderId;
    if (!activeTask) {
      message.error('请先在上方裁剪任务中领取任务');
      return;
    }
    if (!resolvedOrderId) {
      message.error('未匹配到生产订单ID');
      return;
    }
    if (!(await ensureOrderUnlockedById(resolvedOrderId))) return;

    const validItems = bundlesInput
      .map((x) => ({
        color: String(x.color || '').trim(),
        size: String(x.size || '').trim(),
        quantity: Number(x.quantity || 0) || 0,
      }))
      .filter(item => item.quantity > 0);
    if (!validItems.length) {
      message.error('请至少录入一行有效的颜色/尺码/数量');
      return;
    }
    const invalid = validItems.find((x) => !x.color || !x.size);
    if (invalid) {
      message.error('颜色/尺码不能为空');
      return;
    }

    modal.confirm({
      title: '确认保存并生成二维码？',
      content: '确认后将保存裁剪单并生成二维码，保存成功后才可批量打印。',
      okText: '确认保存',
      cancelText: '取消',
      onOk: async () => {
        setGenerateLoading(true);
        try {
          const payload = {
            orderId: resolvedOrderId,
            bundles: validItems.map(item => ({
              color: item.color,
              size: item.size,
              quantity: item.quantity,
            })),
          };
          const res = await api.post<{ code: number; message: string }>('/production/cutting/receive', payload);
          if (res.code === 200) {
            message.success('保存并生成成功');
            clearBundleSelection();
            await fetchBundles();
            await syncActiveTaskByOrderNo(activeTask.productionOrderNo);
          } else {
            message.error(res.message || '生成失败');
          }
        } catch {
          message.error('生成失败');
        } finally {
          setGenerateLoading(false);
        }
      },
    });
  };

  // 自动导入
  const handleAutoImport = async () => {
    if (!activeTask) {
      message.error('请先在上方裁剪任务中领取任务');
      return;
    }
    const oid = String(orderId || activeTask.productionOrderNo || '').trim();
    if (!oid) {
      message.error('未匹配到生产订单号');
      return;
    }
    if (!(await ensureOrderUnlockedById(oid))) return;

    const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: false });
    if (!detail) {
      message.error('获取订单明细失败');
      return;
    }

    const lines = parseProductionOrderLines(detail).slice();
    lines.sort((a: any, b: any) => {
      const ca = String(a?.color || '').trim();
      const cb = String(b?.color || '').trim();
      if (ca && cb) {
        const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
        if (byColor !== 0) return byColor;
      }
      return compareSizeAsc(String(a?.size || ''), String(b?.size || ''));
    });
    const next: CuttingBundleRow[] = [];
    for (const l of lines) {
      const color = String(l.color || '').trim();
      const size = String(l.size || '').trim();
      const quantity = Number(l.quantity || 0) || 0;
      if (!color || !size || quantity <= 0) continue;
      const chunks = splitQuantity(quantity, 20);
      const skuNo = String(l.skuNo || '').trim();
      for (const q of chunks) {
        next.push({ skuNo, color, size, quantity: q });
      }
    }

    if (!next.length) {
      const fallbackQty = Number((detail as any)?.orderQuantity ?? activeTask.orderQuantity ?? 0) || 0;
      const fallbackColor = String((detail as any)?.color ?? activeTask.color ?? '').trim();
      const fallbackSize = String((detail as any)?.size ?? activeTask.size ?? '').trim();
      const fallbackOrderNo = String((detail as any)?.orderNo ?? activeTask.productionOrderNo ?? '').trim();
      const fallbackStyleNo = String((detail as any)?.styleNo ?? activeTask.styleNo ?? '').trim();
      const fallbackSkuNo = fallbackOrderNo && fallbackStyleNo && fallbackColor && fallbackSize
        ? `SKU-${fallbackOrderNo}-${fallbackStyleNo}-${fallbackColor}-${fallbackSize}`
        : '';
      if (!fallbackQty || !fallbackColor || !fallbackSize) {
        message.error('订单明细未包含颜色/尺码/数量');
        return;
      }
      const chunks = splitQuantity(fallbackQty, 20);
      for (const q of chunks) {
        next.push({ skuNo: fallbackSkuNo, color: fallbackColor, size: fallbackSize, quantity: q });
      }
    }

    setBundlesInput(next);
    setImportLocked(true);
    message.success('已按20件/扎自动生成推荐');
  };

  // Effects
  useEffect(() => {
    fetchBundles();
  }, [queryParams, activeTask?.productionOrderNo]);

  // 实时同步：裁剪批次数据
  useSync(
    'cutting-bundles',
    async () => {
      if (!activeTask?.productionOrderNo) return null;
      try {
        const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
          params: { ...queryParams, orderNo: activeTask.productionOrderNo }
        });
        if (res.code === 200) return { records: res.data.records || [], total: res.data.total || 0 };
        return null;
      } catch { return null; }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setDataSource(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 30000,
      enabled: !listLoading && Boolean(activeTask?.productionOrderNo),
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 裁剪批次同步错误', error)
    }
  );

  // 加载面辅料采购
  useEffect(() => {
    if (!isEntryPage) return;
    const no = activeOrderNo;
    const seq = (entryPurchaseReqSeq.current += 1);
    if (!no) {
      setEntryPurchases([]);
      setEntryPurchaseLoading(false);
      return;
    }
    setEntryPurchaseLoading(true);
    setEntryPurchases([]);
    fetchSortedPurchasesByOrderNo(no)
      .then((list) => { if (seq === entryPurchaseReqSeq.current) setEntryPurchases(list); })
      .finally(() => { if (seq === entryPurchaseReqSeq.current) setEntryPurchaseLoading(false); });
  }, [isEntryPage, activeOrderNo]);

  // 加载订单明细
  useEffect(() => {
    if (!isEntryPage) return;
    const oid = String(orderId || (activeTask as unknown as any)?.productionOrderId || '').trim();
    if (!oid) {
      setEntryOrderDetailLoading(false);
      setEntryColorText('');
      setEntrySizeItems([]);
      return;
    }

    let cancelled = false;
    setEntryOrderDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: false });
        if (cancelled) return;
        const lines = detail ? parseProductionOrderLines(detail).slice() : [];
        lines.sort((a: any, b: any) => {
          const ca = String(a?.color || '').trim();
          const cb = String(b?.color || '').trim();
          if (ca && cb) {
            const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
            if (byColor !== 0) return byColor;
          }
          return compareSizeAsc(String(a?.size || ''), String(b?.size || ''));
        });
        const activeColor = String((activeTask as unknown as any)?.color || '').trim();
        const uniqueColors = Array.from(
          new Set(lines.map((x: any) => String(x?.color || '').trim()).filter(Boolean))
        );
        const derivedColor = uniqueColors.length ? uniqueColors.join(' / ') : String((detail as any)?.color || '').trim();
        setEntryColorText(activeColor || derivedColor);

        const filtered = activeColor
          ? lines.filter((x: any) => String(x?.color || '').trim() === activeColor)
          : lines;
        const sizeMap = new Map<string, number>();
        for (const l of filtered) {
          const size = String((l as any)?.size || '').trim();
          if (!size) continue;
          const qty = Number((l as any)?.quantity ?? 0) || 0;
          sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
        }
        const items = Array.from(sizeMap.entries())
          .map(([size, quantity]) => ({ size, quantity }))
          .sort((a, b) => compareSizeAsc(a.size, b.size));
        setEntrySizeItems(items);
      } catch {
        if (cancelled) return;
        setEntryColorText('');
        setEntrySizeItems([]);
      } finally {
        if (!cancelled) setEntryOrderDetailLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isEntryPage, orderId, activeTask?.id, (activeTask as unknown as any)?.color]);

  // 滚动到编辑区域
  useEffect(() => {
    if (!activeTask) return;
    setTimeout(() => {
      editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [activeTask?.id]);

  // 活动任务变更时重置打印状态
  useEffect(() => {
    clearBundleSelection();
  }, [activeTask?.id]);

  return {
    // refs
    editSectionRef,
    // 菲号输入
    bundlesInput, setBundlesInput, importLocked, setImportLocked, generateLoading,
    handleAddRow, handleRemoveRow, handleChangeRow, handleGenerate, handleAutoImport,
    // 菲号列表
    queryParams, setQueryParams, listLoading, dataSource, total,
    fetchBundles,
    // 菲号选择
    selectedBundleRowKeys, setSelectedBundleRowKeys,
    selectedBundles, setSelectedBundles,
    clearBundleSelection,
    // 面辅料采购
    entryPurchaseLoading, entryPurchases,
    // 订单明细
    entryOrderDetailLoading, entryColorText, entrySizeItems,
  };
}

export type { CuttingBundleRow, CuttingQueryParams };
