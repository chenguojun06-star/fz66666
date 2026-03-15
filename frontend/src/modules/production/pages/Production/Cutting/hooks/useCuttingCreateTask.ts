import { useState } from 'react';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';

interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
}

export interface CuttingCreateOrderLine {
  color: string;
  size: string;
  quantity: number | null;
}

const createEmptyOrderLine = (): CuttingCreateOrderLine => ({
  color: '',
  size: '',
  quantity: null,
});

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
  useAuth();

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createOrderDate, setCreateOrderDate] = useState('');
  const [createDeliveryDate, setCreateDeliveryDate] = useState('');
  const [createOrderLines, setCreateOrderLines] = useState<CuttingCreateOrderLine[]>([createEmptyOrderLine()]);
  const [createStyleOptions, setCreateStyleOptions] = useState<StyleOption[]>([]);
  const [createStyleLoading, setCreateStyleLoading] = useState(false);
  const [createStyleNo, setCreateStyleNo] = useState<string>('');
  const [createStyleName, setCreateStyleName] = useState<string>('');

  const fetchStyleInfoOptions = async (keyword?: string) => {
    setCreateStyleLoading(true);
    try {
      const res = await api.get<{ code: number; data: Array<{ styleNo: string; styleName?: string }> }>('/template-library/process-price-style-options', {
        params: { keyword: String(keyword || '').trim() },
      });
      if (res.code === 200) {
        const records = Array.isArray(res.data) ? res.data : [];
        setCreateStyleOptions(
          records
            .map((r) => ({
              id: String(r?.styleNo || '').trim(),
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

  /** 款号选择/输入变更时同步款名 */
  const handleStyleNoChange = (value: string) => {
    const sn = String(value || '').trim();
    setCreateStyleNo(sn);
    const hit = createStyleOptions.find((x) => x.styleNo === sn);
    setCreateStyleName(String(hit?.styleName || '').trim());
  };

  const openCreateTask = () => {
    setCreateOrderDate('');
    setCreateDeliveryDate('');
    setCreateOrderLines([createEmptyOrderLine()]);
    setCreateStyleNo('');
    setCreateStyleName('');
    setCreateTaskOpen(true);
    fetchStyleInfoOptions('');
  };

  const updateCreateOrderLine = (index: number, field: keyof CuttingCreateOrderLine, value: string | number | null) => {
    setCreateOrderLines((prev) => prev.map((line, idx) => {
      if (idx !== index) return line;
      return {
        ...line,
        [field]: field === 'quantity' ? (typeof value === 'number' ? value : null) : String(value || ''),
      };
    }));
  };

  const addCreateOrderLine = () => {
    setCreateOrderLines((prev) => [...prev, createEmptyOrderLine()]);
  };

  const removeCreateOrderLine = (index: number) => {
    setCreateOrderLines((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleSubmitCreateTask = async () => {
    const styleNo = String(createStyleNo || '').trim();
    const orderLines = createOrderLines
      .map((line) => ({
        color: String(line.color || '').trim(),
        size: String(line.size || '').trim(),
        quantity: Number(line.quantity || 0),
      }))
      .filter((line) => line.color || line.size || line.quantity > 0);
    if (!styleNo) {
      message.error('请输入或选择款号');
      return;
    }
    if (orderLines.length === 0) {
      message.error('请至少填写一行颜色、尺码、数量');
      return;
    }
    const invalidLineIndex = orderLines.findIndex((line) => !line.color || !line.size || !Number.isFinite(line.quantity) || line.quantity <= 0);
    if (invalidLineIndex >= 0) {
      message.error(`第 ${invalidLineIndex + 1} 行请完整填写颜色、尺码、数量`);
      return;
    }

    setCreateTaskSubmitting(true);
    try {
      const res = await api.post<{ code: number; message: string; data?: Record<string, unknown> }>('/production/cutting-task/custom/create', {
        styleNo,
        orderDate: String(createOrderDate || '').trim() || undefined,
        deliveryDate: String(createDeliveryDate || '').trim() || undefined,
        orderLines,
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
    createOrderDate, setCreateOrderDate,
    createDeliveryDate, setCreateDeliveryDate,
    createOrderLines, setCreateOrderLines,
    updateCreateOrderLine,
    addCreateOrderLine,
    removeCreateOrderLine,
    createStyleOptions, createStyleLoading, createStyleNo, setCreateStyleNo,
    createStyleName, setCreateStyleName,
    fetchStyleInfoOptions,
    handleStyleNoChange,
    openCreateTask,
    handleSubmitCreateTask,
  };
}

export type { StyleOption };
export type CuttingCreateTaskState = ReturnType<typeof useCuttingCreateTask>;
