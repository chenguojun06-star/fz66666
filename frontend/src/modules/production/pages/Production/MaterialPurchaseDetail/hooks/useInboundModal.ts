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
  /** 打开入库弹窗；opts.backfill=true 走存量补录（不重复累加到货数，只增库存） */
  openInbound: (record: MaterialPurchase, opts?: { backfill?: boolean; defaultQty?: number }) => void;
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
  const [backfillMode, setBackfillMode] = useState(false);

  const openInbound = useCallback((record: MaterialPurchase, opts?: { backfill?: boolean; defaultQty?: number }) => {
    setInboundRecord(record);
    const backfill = Boolean(opts?.backfill);
    setBackfillMode(backfill);
    const defaultQty = backfill
      ? (opts?.defaultQty != null ? opts.defaultQty : 0)
      : Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
    inboundForm.setFieldsValue({ arrivedQuantity: defaultQty, warehouseLocation: '', remark: '' });
    setInboundVisible(true);
  }, [inboundForm]);

  const doInbound = useCallback(async () => {
    if (!inboundRecord) return;
    try {
      const values = await inboundForm.validateFields();
      const operatorName = getOperatorName(user);
      // D-360h：已完成/回料确认行走存量补录（不重复累加到货数，只增库存+流水+对账回流）
      const url = backfillMode ? '/production/material/inbound/backfill' : '/production/material/inbound/confirm-arrival';
      const payload = backfillMode
        ? {
            purchaseId: inboundRecord.id,
            quantity: values.arrivedQuantity,
            operatorId: user?.id || '',
            operatorName,
            warehouseLocation: values.warehouseLocation,
            remark: values.remark,
          }
        : {
            purchaseId: inboundRecord.id,
            arrivedQuantity: values.arrivedQuantity,
            operatorId: user?.id || '',
            operatorName,
            warehouseLocation: values.warehouseLocation,
            remark: values.remark,
          };
      const res = await api.post<ApiResult<unknown>>(url, payload);
      if (res.code === 200) {
        message.success(backfillMode ? '补录入库成功，库存已更新并同步对账' : '到货入库成功，库存已更新');
        setBackfillMode(false);
        setInboundVisible(false);
        inboundForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '到货入库失败');
      }
    } catch (error: unknown) {
      handleFormSubmitError(error, message, '到货入库失败');
    }
  }, [inboundRecord, inboundForm, backfillMode, user, message, loadData]);

  return {
    inboundForm,
    inboundVisible,
    setInboundVisible,
    inboundRecord,
    openInbound,
    doInbound,
  };
}
