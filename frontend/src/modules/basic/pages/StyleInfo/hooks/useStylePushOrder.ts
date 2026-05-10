import { useState } from 'react';
import { Form } from 'antd';
import type { SmartErrorInfo } from '@/smart/core/types';

interface UseStylePushOrderOptions {
  handlePushToOrderDirect: (priceType?: string, remark?: string, targets?: string[]) => Promise<boolean | void>;
  reportSmartError: (title: string, reason?: string, code?: string) => void;
  showSmartErrorNotice: boolean;
  setSmartError: React.Dispatch<React.SetStateAction<SmartErrorInfo | null>>;
}

export function useStylePushOrder({ handlePushToOrderDirect, reportSmartError, showSmartErrorNotice, setSmartError }: UseStylePushOrderOptions) {
  const [pushToOrderModalVisible, setPushToOrderModalVisible] = useState(false);
  const [pushToOrderForm] = Form.useForm();
  const [pushToOrderSaving, setPushToOrderSaving] = useState(false);
  const [pushToOrderTargets, setPushToOrderTargets] = useState<string[]>([
    'bom',
    'pattern',
    'size',
    'process',
    'production',
    'secondary',
    'sizePrice',
    'sku',
  ]);

  const handlePushToOrder = () => {
    setPushToOrderModalVisible(true);
  };

  const submitPushToOrder = async () => {
    try {
      const values = await pushToOrderForm.validateFields();
      setPushToOrderSaving(true);

      await handlePushToOrderDirect(values.priceType, values.remark, pushToOrderTargets);

      setPushToOrderModalVisible(false);
      pushToOrderForm.resetFields();
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      reportSmartError('推送到下单失败', (error as any)?.message || '服务返回异常，请稍后重试', 'STYLE_PUSH_TO_ORDER_FAILED');
      console.error('推送失败:', error);
    } finally {
      setPushToOrderSaving(false);
    }
  };

  return {
    pushToOrderModalVisible,
    setPushToOrderModalVisible,
    pushToOrderForm,
    pushToOrderSaving,
    pushToOrderTargets,
    setPushToOrderTargets,
    handlePushToOrder,
    submitPushToOrder,
  };
}
