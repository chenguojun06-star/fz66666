import { useState, useCallback } from 'react';
import { Form, App } from 'antd';
import type { MaterialPurchase } from '@/types/production';
import { useUser } from '@/utils/AuthContext';
import { postReturnConfirm } from './types';
import { getOperatorName, handleFormSubmitError } from './utils';

export interface UseReturnConfirmModalReturn {
  returnConfirmForm: ReturnType<typeof Form.useForm>[0];
  returnConfirmVisible: boolean;
  setReturnConfirmVisible: React.Dispatch<React.SetStateAction<boolean>>;
  returnConfirmRecord: MaterialPurchase | null;
  returnConfirmLoading: boolean;
  handleReturnConfirm: (record: MaterialPurchase) => void;
  doReturnConfirm: () => Promise<void>;
}

interface UseReturnConfirmModalParams {
  loadData: () => Promise<void>;
}

export function useReturnConfirmModal(params: UseReturnConfirmModalParams): UseReturnConfirmModalReturn {
  const { loadData } = params;
  const { user } = useUser();
  const { message } = App.useApp();

  const [returnConfirmVisible, setReturnConfirmVisible] = useState(false);
  const [returnConfirmRecord, setReturnConfirmRecord] = useState<MaterialPurchase | null>(null);
  const [returnConfirmLoading, setReturnConfirmLoading] = useState(false);
  const [returnConfirmForm] = Form.useForm();

  const handleReturnConfirm = useCallback((record: MaterialPurchase) => {
    setReturnConfirmRecord(record);
    returnConfirmForm.resetFields();
    returnConfirmForm.setFieldsValue({
      quantity: Number(record.arrivedQuantity || record.purchaseQuantity || 0),
    });
    setReturnConfirmVisible(true);
  }, [returnConfirmForm]);

  const doReturnConfirm = useCallback(async () => {
    if (!returnConfirmRecord) return;
    try {
      setReturnConfirmLoading(true);
      const values = await returnConfirmForm.validateFields();
      const confirmerName = getOperatorName(user);
      const res = await postReturnConfirm({
        purchaseId: returnConfirmRecord.id,
        confirmerName,
        returnQuantity: values.quantity,
      });
      if (res.code === 200) {
        message.success('回料确认成功');
        setReturnConfirmVisible(false);
        returnConfirmForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '回料确认失败');
      }
    } catch (error: unknown) {
      handleFormSubmitError(error, message, '回料确认失败');
    } finally {
      setReturnConfirmLoading(false);
    }
  }, [returnConfirmRecord, returnConfirmForm, user, message, loadData]);

  return {
    returnConfirmForm,
    returnConfirmVisible,
    setReturnConfirmVisible,
    returnConfirmRecord,
    returnConfirmLoading,
    handleReturnConfirm,
    doReturnConfirm,
  };
}
