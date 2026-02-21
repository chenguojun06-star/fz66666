import { useState } from 'react';
import dayjs from 'dayjs';
import { productionOrderApi } from '@/services/production/productionApi';

interface UseRemarkModalOptions {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  fetchOrders: () => Promise<void>;
}

/**
 * 备注异常弹窗状态 + 保存逻辑
 */
export const useRemarkModal = ({ message, fetchOrders }: UseRemarkModalOptions) => {
  const [remarkPopoverId, setRemarkPopoverId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  const handleRemarkSave = async (orderId: string) => {
    setRemarkSaving(true);
    try {
      const ts = dayjs().format('MM-DD HH:mm');
      const finalText = remarkText.trim() ? `[${ts}] ${remarkText.trim()}` : '';
      await productionOrderApi.quickEdit({ id: orderId, remarks: finalText });
      message.success('备注已保存');
      setRemarkPopoverId(null);
      setRemarkText('');
      await fetchOrders();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败');
    } finally {
      setRemarkSaving(false);
    }
  };

  return {
    remarkPopoverId,
    remarkText,
    remarkSaving,
    setRemarkPopoverId,
    setRemarkText,
    handleRemarkSave,
  };
};
