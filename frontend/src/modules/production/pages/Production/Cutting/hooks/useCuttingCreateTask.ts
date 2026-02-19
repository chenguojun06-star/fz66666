import { useState, useCallback } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import type { CuttingBundleRow } from './useCuttingBundles';

interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
}

export interface ProcessUnitPrice {
  processName: string;
  unitPrice: number | null;
  processCode?: string;
}

interface UseCuttingCreateTaskOptions {
  message: any;
  navigate: (path: string) => void;
  fetchTasks: () => Promise<void> | void;
}

/**
 * 新建裁剪任务 Hook
 * 管理创建弹窗、款号搜索、自定义裁剪单
 */
export function useCuttingCreateTask({ message, navigate, fetchTasks }: UseCuttingCreateTaskOptions) {
  const { user } = useAuth();

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createOrderNo, setCreateOrderNo] = useState('');
  const [createStyleOptions, setCreateStyleOptions] = useState<StyleOption[]>([]);
  const [createStyleLoading, setCreateStyleLoading] = useState(false);
  const [createStyleNo, setCreateStyleNo] = useState<string>('');
  const [createStyleName, setCreateStyleName] = useState<string>('');
  const [createBundles, setCreateBundles] = useState<CuttingBundleRow[]>([{ color: '', size: '', quantity: 0 }]);

  // 工序进度单价
  const [createProcessPrices, setCreateProcessPrices] = useState<ProcessUnitPrice[]>([]);
  const [processPricesLoading, setProcessPricesLoading] = useState(false);

  const fetchStyleInfoOptions = async (keyword?: string) => {
    setCreateStyleLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: Array<{ id: string; styleNo: string; styleName: string }> } }>('/style/info/list', {
        params: { page: 1, pageSize: 20, styleNo: String(keyword || '').trim() },
      });
      if (res.code === 200) {
        const records = (res.data?.records || []) as Array<Record<string, unknown>>;
        setCreateStyleOptions(
          records
            .map((r) => ({
              id: r?.id as string | number,
              styleNo: String(r?.styleNo || '').trim(),
              styleName: String(r?.styleName || '').trim(),
            }))
            .filter((x) => x.styleNo)
        );
      }
    } catch {
      // Intentionally empty
    } finally {
      setCreateStyleLoading(false);
    }
  };

  /** 根据款号加载工序进度单价（反推大货生产单价用） */
  const fetchProcessUnitPrices = useCallback(async (styleNo: string) => {
    const sn = String(styleNo || '').trim();
    if (!sn) { setCreateProcessPrices([]); return; }
    setProcessPricesLoading(true);
    try {
      const res = await templateLibraryApi.progressNodeUnitPrices(sn);
      if (res.code === 200 && Array.isArray(res.data)) {
        const prices: ProcessUnitPrice[] = (res.data as Array<Record<string, unknown>>)
          .map((item) => ({
            processName: String(item.processName || item.process_name || '').trim(),
            unitPrice: item.unitPrice != null ? Number(item.unitPrice)
              : item.unit_price != null ? Number(item.unit_price) : null,
            processCode: String(item.processCode || item.process_code || '').trim() || undefined,
          }))
          .filter((x) => x.processName);
        setCreateProcessPrices(prices);
      } else {
        setCreateProcessPrices([]);
      }
    } catch {
      setCreateProcessPrices([]);
    } finally {
      setProcessPricesLoading(false);
    }
  }, []);

  /** 款号选择/输入变更时同步款名并拉取工序单价 */
  const handleStyleNoChange = (value: string) => {
    const sn = String(value || '').trim();
    setCreateStyleNo(sn);
    const hit = createStyleOptions.find((x) => x.styleNo === sn);
    setCreateStyleName(String(hit?.styleName || '').trim());
    if (sn) fetchProcessUnitPrices(sn);
    else setCreateProcessPrices([]);
  };

  const openCreateTask = () => {
    setCreateOrderNo('');
    setCreateStyleNo('');
    setCreateStyleName('');
    setCreateBundles([{ color: '', size: '', quantity: 0 }]);
    setCreateProcessPrices([]);
    setCreateTaskOpen(true);
    fetchStyleInfoOptions('');
  };

  const handleCreateBundleChange = (index: number, key: keyof CuttingBundleRow, value: any) => {
    setCreateBundles((prev) => {
      const next = prev.slice();
      next[index] = { ...next[index], [key]: value } as CuttingBundleRow;
      return next;
    });
  };

  const handleCreateBundleAdd = () => {
    setCreateBundles((prev) => [...prev, { color: '', size: '', quantity: 0 }]);
  };

  const handleCreateBundleRemove = (index: number) => {
    setCreateBundles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitCreateTask = async () => {
    const styleNo = String(createStyleNo || '').trim();
    if (!styleNo) {
      message.error('请选择款号');
      return;
    }
    const validItems = createBundles
      .map((x) => ({
        color: String(x.color || '').trim(),
        size: String(x.size || '').trim(),
        quantity: Number(x.quantity || 0) || 0,
      }))
      .filter((x) => x.quantity > 0);
    if (!validItems.length) {
      message.error('请至少录入一行有效的颜色/尺码/数量');
      return;
    }
    const invalid = validItems.find((x) => !x.color || !x.size);
    if (invalid) {
      message.error('颜色/尺码不能为空');
      return;
    }

    setCreateTaskSubmitting(true);
    try {
      const res = await api.post<{ code: number; message: string; data?: Record<string, unknown> }>('/production/cutting-task/custom/create', {
        orderNo: String(createOrderNo || '').trim() || undefined,
        styleNo,
        receiverId: user?.id,
        receiverName: (user as unknown as any)?.name,
        bundles: validItems,
        // 附带工序进度单价，后端可反推大货生产单价
        processUnitPrices: createProcessPrices.length > 0 ? createProcessPrices : undefined,
      });
      if (res.code === 200) {
        message.success('新建裁剪任务成功');
        setCreateTaskOpen(false);
        fetchTasks();
        const on = String((res as any).data && (res.data as any)?.productionOrderNo || '').trim();
        if (on) {
          navigate(`/production/cutting/task/${encodeURIComponent(on)}`);
        }
      } else {
        message.error(res.message || '新建失败');
      }
    } catch {
      message.error('新建失败');
    } finally {
      setCreateTaskSubmitting(false);
    }
  };

  return {
    createTaskOpen, setCreateTaskOpen,
    createTaskSubmitting,
    createOrderNo, setCreateOrderNo,
    createStyleOptions, createStyleLoading, createStyleNo, setCreateStyleNo,
    createStyleName, setCreateStyleName,
    createBundles,
    createProcessPrices, processPricesLoading,
    fetchStyleInfoOptions,
    fetchProcessUnitPrices,
    handleStyleNoChange,
    openCreateTask,
    handleCreateBundleChange, handleCreateBundleAdd, handleCreateBundleRemove,
    handleSubmitCreateTask,
  };
}

export type { StyleOption };
