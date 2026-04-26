import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleBom } from '@/types/style';
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
  bundleLabel?: string;
  bedNo?: number; // 床号（裁剪批次编号）
  bedSubNo?: number; // 子床次编号（同一订单追加时递增，null 表示首次）
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

type EntryOrderLine = {
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
};

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
  const BUNDLES_PAGE_SIZE_KEY = 'Cutting.bundlesPageSize';
  const [queryParams, setQueryParams] = useState<CuttingQueryParams>(() => {
    try {
      const raw = window.localStorage.getItem(BUNDLES_PAGE_SIZE_KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return { page: 1, pageSize: n };
      }
    } catch { /* ignore */ }
    return { page: 1, pageSize: 20 };
  });
  const [listLoading, setListLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CuttingBundleRow[]>([]);
  const [total, setTotal] = useState(0);
  // 全量颜色-尺码已裁件数映射（用于计算剩余裁剪量，不受分页影响）
  const [allBundlesQtyMap, setAllBundlesQtyMap] = useState<Record<string, number>>({});

  // 菲号选择
  const [selectedBundleRowKeys, setSelectedBundleRowKeys] = useState<React.Key[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<CuttingBundleRow[]>([]);

  // 面辅料采购
  const [entryPurchaseLoading, setEntryPurchaseLoading] = useState(false);
  const [entryPurchases, setEntryPurchases] = useState<MaterialPurchase[]>([]);
  const entryPurchaseReqSeq = useRef(0);

  // 纸样用量（来自款式 BOM sizeUsageMap，按码 m/件）
  const [entrySizeUsageMap, setEntrySizeUsageMap] = useState<Record<string, number>>({});
  const [entryFabricUsageRows, setEntryFabricUsageRows] = useState<Array<{ materialName: string; materialType: string; sizeUsageMap: Record<string, number> }>>([]);
  const entryBomReqSeq = useRef(0);

  // 订单明细
  const [entryOrderDetailLoading, setEntryOrderDetailLoading] = useState(false);
  const [entryColorText, setEntryColorText] = useState('');
  const [entrySizeItems, setEntrySizeItems] = useState<Array<{ size: string; quantity: number }>>([]);
  const [entryOrderLines, setEntryOrderLines] = useState<EntryOrderLine[]>([]);

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
        const records = res.data.records || [];
        setDataSource(records);
        setTotal(res.data.total || 0);
        if (records.length > 0) {
          setImportLocked(true);
        }
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
  // overrideRows: 可选入参，用于绕过 React setState 异步问题（CuttingRatioPanel 点确认时直接传入最新行数据，
  // 避免依赖 setBundlesInput 后的下一次 render 闭包，否则会读到旧的初始 bundlesInput 导致误报「请至少录入一行有效的颜色/尺码/数量」）
  const handleGenerate = async (overrideRows?: CuttingBundleRow[]) => {
    if (generateLoading) return;
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

    const sourceRows = overrideRows && overrideRows.length > 0 ? overrideRows : bundlesInput;
    const validItems = sourceRows
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

    setGenerateLoading(true);
    modal.confirm({
      width: '30vw',
      title: '确认保存并生成二维码？',
      content: '确认后将保存裁剪单并生成二维码，保存成功后才可批量打印。',
      okText: '确认保存',
      cancelText: '取消',
      onCancel: () => setGenerateLoading(false),
      onOk: async () => {
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
            setImportLocked(true);
          } else {
            message.error(res.message || '生成失败');
          }
        } catch (err: unknown) {
          const respMsg = typeof err === 'object' && err !== null && 'response' in err ? String((err as Record<string, any>).response?.data?.message || '') : '';
          message.error(respMsg || (err instanceof Error ? err.message : '生成失败'));
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
  // 持久化菲号列表 pageSize
  useEffect(() => {
    try { window.localStorage.setItem(BUNDLES_PAGE_SIZE_KEY, String(queryParams.pageSize)); } catch { /* ignore */ }
  }, [queryParams.pageSize]);

  const queryParamsKey = JSON.stringify(queryParams);
  useEffect(() => {
    fetchBundles();
  }, [queryParamsKey, activeTask?.productionOrderNo]);

  // 全量菲号汇总：用 /summary 端点（全量聚合，无分页 500 上限限制）计算剩余裁剪量
  useEffect(() => {
    const orderNo = activeTask?.productionOrderNo;
    if (!orderNo) { setAllBundlesQtyMap({}); return; }
    let cancelled = false;
    void api.get<{ code: number; data: { tasks: Array<{ color: string; size: string; quantity: number }> } }>('/production/cutting/summary', {
      params: { orderNo },
    }).then((res) => {
      if (cancelled) return;
      if (res.code === 200) {
        const map: Record<string, number> = {};
        (res.data?.tasks || []).forEach((task) => {
          const k = `${String(task.color || '').trim()}-${String(task.size || '').trim()}`;
          map[k] = (map[k] || 0) + Number(task.quantity || 0);
        });
        setAllBundlesQtyMap(map);
      } else {
        setAllBundlesQtyMap({});
      }
    }).catch(() => { if (!cancelled) setAllBundlesQtyMap({}); });
    return () => { cancelled = true; };
  }, [activeTask?.productionOrderNo, total]);

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

  // 加载款式 BOM 纸样用量（sizeUsageMap）
  useEffect(() => {
    if (!isEntryPage) return;
    const styleRef = String((activeTask as unknown as any)?.styleId || '').trim();
    const styleNo = String((activeTask as unknown as any)?.styleNo || '').trim();
    const seq = (entryBomReqSeq.current += 1);
    const bomQuery = styleRef
      ? (/^\d+$/.test(styleRef) ? `styleId=${styleRef}` : `styleNo=${encodeURIComponent(styleRef)}`)
      : (styleNo ? `styleNo=${encodeURIComponent(styleNo)}` : '');
    if (!bomQuery) { setEntrySizeUsageMap({}); return; }
    void api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?${bomQuery}`)
      .then((res) => {
        if (seq !== entryBomReqSeq.current) return;
        if (res.code !== 200) { setEntrySizeUsageMap({}); setEntryFabricUsageRows([]); return; }
        const boms = res.data || [];
        const fabricBom = boms.find(
          (b) => String(b?.materialType || '').startsWith('fabric') && b?.sizeUsageMap
        );
        if (!fabricBom?.sizeUsageMap) { setEntrySizeUsageMap({}); } else {
          try {
            const raw = typeof fabricBom.sizeUsageMap === 'string'
              ? JSON.parse(fabricBom.sizeUsageMap as string)
              : fabricBom.sizeUsageMap;
            const clean: Record<string, number> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
              const n = Number(v);
              if (!isNaN(n) && n > 0) clean[k] = n;
            }
            setEntrySizeUsageMap(clean);
          } catch {
            setEntrySizeUsageMap({});
          }
        }
        const fabricRows: Array<{ materialName: string; materialType: string; sizeUsageMap: Record<string, number> }> = [];
        for (const b of boms) {
          if (!b?.sizeUsageMap) continue;
          const mt = String(b?.materialType || '').trim();
          if (!mt.startsWith('fabric') && !mt.includes('rib') && !mt.includes('螺纹') && !mt.includes('罗纹')) continue;
          try {
            const raw = typeof b.sizeUsageMap === 'string' ? JSON.parse(b.sizeUsageMap as string) : b.sizeUsageMap;
            const clean: Record<string, number> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
              const n = Number(v);
              if (!isNaN(n) && n > 0) clean[k] = n;
            }
            if (Object.keys(clean).length > 0) {
              fabricRows.push({
                materialName: String(b?.materialName || b?.materialCode || mt),
                materialType: mt,
                sizeUsageMap: clean,
              });
            }
          } catch { /* skip */ }
        }
        setEntryFabricUsageRows(fabricRows);
      })
      .catch(() => { if (seq === entryBomReqSeq.current) { setEntrySizeUsageMap({}); setEntryFabricUsageRows([]); } });
  }, [isEntryPage, (activeTask as unknown as any)?.styleId]);

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
    const detailKey = String(
      orderId
      || (activeTask as unknown as any)?.productionOrderId
      || (activeTask as unknown as any)?.productionOrderNo
      || ''
    ).trim();
    if (!detailKey) {
      setEntryOrderDetailLoading(false);
      setEntryColorText('');
      setEntrySizeItems([]);
      setEntryOrderLines([]);
      return;
    }

    let cancelled = false;
    setEntryOrderDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchProductionOrderDetail(detailKey, { acceptAnyData: false });
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
        const uniqueColors = Array.from(
          new Set(lines.map((x: any) => String(x?.color || '').trim()).filter(Boolean))
        );
        const derivedColor = uniqueColors.length ? uniqueColors.join(' / ') : String((detail as any)?.color || '').trim();
        setEntryColorText(derivedColor);
        setEntryOrderLines(lines.map((line) => ({
          color: String(line?.color || '').trim(),
          size: String(line?.size || '').trim(),
          quantity: Number(line?.quantity || 0) || 0,
          skuNo: String(line?.skuNo || '').trim(),
        })));

        const sizeMap = new Map<string, number>();
        for (const l of lines) {
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
        setEntryOrderLines([]);
      } finally {
        if (!cancelled) setEntryOrderDetailLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isEntryPage, orderId, activeTask?.id, (activeTask as unknown as any)?.productionOrderId, (activeTask as unknown as any)?.productionOrderNo]);

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

  const handleAddBed = () => {
    setImportLocked(false);
  };

  return {
    // refs
    editSectionRef,
    // 菲号输入
    bundlesInput, setBundlesInput, importLocked, setImportLocked, generateLoading,
    handleAddRow, handleRemoveRow, handleChangeRow, handleGenerate, handleAutoImport, handleAddBed,
    // 菲号列表
    queryParams, setQueryParams, listLoading, dataSource, total,
    fetchBundles, allBundlesQtyMap,
    // 菲号选择
    selectedBundleRowKeys, setSelectedBundleRowKeys,
    selectedBundles, setSelectedBundles,
    clearBundleSelection,
    // 面辅料采购
    entryPurchaseLoading, entryPurchases,
    // 订单明细
    entryOrderDetailLoading, entryColorText, entrySizeItems, entryOrderLines,
    // 纸样用量
    entrySizeUsageMap,
    entryFabricUsageRows,
    entryMainFabricArrived: entryPurchases
      .filter((p: any) => String((p as any)?.materialType || '').startsWith('fabric'))
      .reduce((sum: number, p: any) => sum + (Number((p as any)?.returnConfirmed || 0) === 1
        ? (Number((p as any)?.returnQuantity) || 0)
        : 0), 0),
  };
}

export type { CuttingBundleRow, CuttingQueryParams };
