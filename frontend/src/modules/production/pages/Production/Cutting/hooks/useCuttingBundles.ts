import React, { useEffect, useRef, useState } from 'react';
import { useUser } from '@/utils/AuthContext';
import api, { fetchProductionOrderDetail, parseProductionOrderLines, compareSizeAsc } from '@/utils/api';
import {
  splitQuantity,
  type CuttingBundleRow,
  type CuttingQueryParams,
  type UseCuttingBundlesOptions,
} from './cuttingBundlesHelpers';
import { useCuttingBundleList } from './useCuttingBundleList';
import { useCuttingEntryDetail } from './useCuttingEntryDetail';

/**
 * 裁剪菲号管理 Hook
 * 管理菲号列表、生成、自动导入、面辅料采购
 */
export function useCuttingBundles({
  message, modal, activeTask, orderId, isEntryPage,
  ensureOrderUnlockedById, syncActiveTaskByOrderNo,
}: UseCuttingBundlesOptions) {
  useUser();
  const editSectionRef = useRef<HTMLDivElement | null>(null);

  // 菲号输入
  const [bundlesInput, setBundlesInput] = useState<CuttingBundleRow[]>([{ skuNo: '', color: '', size: '', quantity: 0 }]);
  const [importLocked, setImportLocked] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);

  // 菲号选择
  const [selectedBundleRowKeys, setSelectedBundleRowKeys] = useState<React.Key[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<CuttingBundleRow[]>([]);

  // 菲号列表（子 hook）
  const list = useCuttingBundleList({
    message,
    activeTask,
    onBundlesLoaded: (hasRecords) => {
      if (hasRecords) setImportLocked(true);
    },
  });

  // 订单详情 + 采购 + BOM（子 hook）
  const entry = useCuttingEntryDetail({
    activeTask,
    orderId,
    isEntryPage,
  });

  const clearBundleSelection = () => {
    setSelectedBundleRowKeys([]);
    setSelectedBundles([]);
  };

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
            await Promise.all([list.fetchBundles(), syncActiveTaskByOrderNo(activeTask.productionOrderNo)]);
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

  const handleAddBed = () => {
    setImportLocked(false);
  };

  // 滚动到编辑区域
  useEffect(() => {
    if (!activeTask) return;
    setTimeout(() => {
      editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    handleAddRow, handleRemoveRow, handleChangeRow, handleGenerate, handleAutoImport, handleAddBed,
    // 菲号列表
    queryParams: list.queryParams, setQueryParams: list.setQueryParams,
    listLoading: list.listLoading, dataSource: list.dataSource, total: list.total,
    fetchBundles: list.fetchBundles, allBundlesQtyMap: list.allBundlesQtyMap,
    // 菲号选择
    selectedBundleRowKeys, setSelectedBundleRowKeys,
    selectedBundles, setSelectedBundles,
    clearBundleSelection,
    // 面辅料采购
    entryPurchaseLoading: entry.entryPurchaseLoading,
    entryPurchases: entry.entryPurchases,
    // 订单明细
    entryOrderDetailLoading: entry.entryOrderDetailLoading,
    entryColorText: entry.entryColorText,
    entrySizeItems: entry.entrySizeItems,
    entryOrderLines: entry.entryOrderLines,
    // 纸样用量
    entrySizeUsageMap: entry.entrySizeUsageMap,
    entryFabricUsageRows: entry.entryFabricUsageRows,
    entryMainFabricArrived: entry.entryPurchases
      .filter((p: any) => String((p as any)?.materialType || '').startsWith('fabric'))
      .reduce((sum: number, p: any) => sum + (Number((p as any)?.returnConfirmed || 0) === 1
        ? (Number((p as any)?.returnQuantity) || 0)
        : 0), 0),
  };
}

export type { CuttingBundleRow, CuttingQueryParams };
