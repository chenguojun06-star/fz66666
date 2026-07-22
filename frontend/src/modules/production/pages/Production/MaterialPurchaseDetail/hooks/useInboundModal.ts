import { useState, useCallback } from 'react';
import { Form, App } from 'antd';
import api from '@/utils/api';
import type { MaterialPurchase } from '@/types/production';
import { useUser } from '@/utils/AuthContext';
import type { ApiResult } from './types';
import { getOperatorName, handleFormSubmitError } from './utils';

export interface UseInboundModalReturn {
  inboundForm: ReturnType<typeof Form.useForm>[0];
  inboundVisible: boolean;
  setInboundVisible: React.Dispatch<React.SetStateAction<boolean>>;
  inboundRecord: MaterialPurchase | null;
  openInbound: (record: MaterialPurchase) => void;
  doInbound: () => Promise<void>;
}

interface UseInboundModalParams {
  loadData: () => Promise<void>;
}

export function useInboundModal(params: UseInboundModalParams): UseInboundModalReturn {
  const { loadData } = params;
  const { user } = useUser();
  const { message } = App.useApp();

  const [inboundVisible, setInboundVisible] = useState(false);
  const [inboundRecord, setInboundRecord] = useState<MaterialPurchase | null>(null);
  const [inboundForm] = Form.useForm();

  const openInbound = useCallback((record: MaterialPurchase) => {
    setInboundRecord(record);
    const maxQty = Math.max(
      0.01,
      Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0)
    );
    inboundForm.setFieldsValue({ arrivedQuantity: maxQty });
    setInboundVisible(true);
  }, [inboundForm]);

  const doInbound = useCallback(async () => {
    if (!inboundRecord) return;
    try {
      const values = await inboundForm.validateFields();
      const operatorName = getOperatorName(user);
      const res = await api.post<ApiResult<unknown>>(
        '/production/material/inbound/confirm-arrival',
        {
          purchaseId: inboundRecord.id,
          arrivedQuantity: values.arrivedQuantity,
          operatorId: user?.id || '',
          operatorName,
          warehouseLocation: values.warehouseLocation,
          remark: values.remark,
        }
      );
      if (res.code === 200) {
        message.success('到货入库成功，库存已更新');
        setInboundVisible(false);
        inboundForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '到货入库失败');
      }
    } catch (error: unknown) {
      handleFormSubmitError(error, message, '到货入库失败');
    }
  }, [inboundRecord, inboundForm, user, message, loadData]);

  return {
    inboundForm,
    inboundVisible,
    setInboundVisible,
    inboundRecord,
    openInbound,
    doInbound,
  };
}
