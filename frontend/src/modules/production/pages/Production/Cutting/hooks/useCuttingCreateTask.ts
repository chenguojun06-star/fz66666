import { useState } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import type { CuttingBundleRow } from './useCuttingBundles';

interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
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

  const openCreateTask = () => {
    setCreateOrderNo('');
    setCreateStyleNo('');
    setCreateStyleName('');
    setCreateBundles([{ color: '', size: '', quantity: 0 }]);
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
    fetchStyleInfoOptions,
    openCreateTask,
    handleCreateBundleChange, handleCreateBundleAdd, handleCreateBundleRemove,
    handleSubmitCreateTask,
  };
}

export type { StyleOption };
