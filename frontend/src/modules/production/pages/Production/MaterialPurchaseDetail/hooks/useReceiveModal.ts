import { useState, useCallback } from 'react';
import { Form, App } from 'antd';
import type { MaterialPurchase } from '@/types/production';
import { useUser } from '@/utils/AuthContext';
import { postReceive, isPurchaseRowComplete, getPurchaseMissingFields } from './types';
import { getOperatorName, handleFormSubmitError } from './utils';

export interface UseReceiveModalReturn {
  receiveForm: ReturnType<typeof Form.useForm>[0];
  receiveVisible: boolean;
  setReceiveVisible: React.Dispatch<React.SetStateAction<boolean>>;
  receiveRecord: MaterialPurchase | null;
  receiveLoading: boolean;
  openReceive: (record: MaterialPurchase) => void;
  handleReceive: () => Promise<void>;
}

interface UseReceiveModalParams {
  loadData: () => Promise<void>;
}

export function useReceiveModal(params: UseReceiveModalParams): UseReceiveModalReturn {
  const { loadData } = params;
  const { user } = useUser();
  const { message } = App.useApp();

  const [receiveVisible, setReceiveVisible] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<MaterialPurchase | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveForm] = Form.useForm();

  const openReceive = useCallback((record: MaterialPurchase) => {
    // 修复：行级判断替代整单拦截（旧行为：任一行缺供应商 → 全单无法领取）
    if (!isPurchaseRowComplete(record)) {
      const missing = getPurchaseMissingFields(record);
      message.warning(`该物料缺少：${missing.join('、')}，请先编辑补全`);
      return;
    }
    setReceiveRecord(record);
    receiveForm.resetFields();
    receiveForm.setFieldsValue({ quantity: record.purchaseQuantity });
    setReceiveVisible(true);
  }, [message, receiveForm]);

  const handleReceive = useCallback(async () => {
    if (!receiveRecord) return;
    try {
      setReceiveLoading(true);
      const values = await receiveForm.validateFields();
      const receiverName = getOperatorName(user);
      const response = await postReceive({
        purchaseId: receiveRecord.id,
        quantity: values.quantity,
        receiverId: user?.id || '',
        receiverName,
      });
      if (response.code === 200) {
        message.success('采购/到货成功');
        setReceiveVisible(false);
        receiveForm.resetFields();
        await loadData();
      } else {
        message.error(response.message || '操作失败');
      }
    } catch (error: unknown) {
      handleFormSubmitError(error, message, '操作失败');
    } finally {
      setReceiveLoading(false);
    }
  }, [receiveRecord, receiveForm, user, message, loadData]);

  return {
    receiveForm,
    receiveVisible,
    setReceiveVisible,
    receiveRecord,
    receiveLoading,
    openReceive,
    handleReceive,
  };
}
