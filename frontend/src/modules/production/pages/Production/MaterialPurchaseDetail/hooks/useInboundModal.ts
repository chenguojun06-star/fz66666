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
  /** 登记到货提交中（D-366b） */
  inboundLoading: boolean;
  /** 打开登记到货弹窗；opts.backfill=true 走存量补录（不重复累加到货数，只增库存） */
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
  const [inboundLoading, setInboundLoading] = useState(false);

  const openInbound = useCallback((record: MaterialPurchase, opts?: { backfill?: boolean; defaultQty?: number }) => {
    setInboundRecord(record);
    const backfill = Boolean(opts?.backfill);
    setBackfillMode(backfill);
    // D-370：默认带出「当前需求数」= 采购数量 - 已到货数量（用户可改，但不能是 0）
    // 按整数约束归一：待到货 0.32 直接回填会低于 min 导致一打开就校验失败
    const defaultQty = backfill
      ? (opts?.defaultQty != null ? opts.defaultQty : 0)
      : Math.max(1, Math.round(Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0)));
    inboundForm.setFieldsValue({
      arrivedQuantity: defaultQty,
      // D-366b：默认去向=入库到物料仓库
      movementAction: 'inbound',
      warehouseLocation: '',
      remark: '',
    });
    setInboundVisible(true);
  }, [inboundForm]);

  /**
   * D-366b：登记到货（用户拍板：到货 + 去向一次做完）
   * - 入库到物料仓库 → confirm-arrival（写到货量 + 生成入库单 + 增库存 + 对账回流）
   * - 直采使用      → confirm-complete(movementAction=direct_use)：只记采购直用流水，库存不动
   * - 存量补录(backfill) → 保持原逻辑，不重复累加到货量
   */
  const doInbound = useCallback(async () => {
    if (!inboundRecord) return;
    try {
      setInboundLoading(true);
      const values = await inboundForm.validateFields();
      const operatorName = getOperatorName(user);
      const movementAction = backfillMode ? 'inbound' : (values.movementAction || 'inbound');

      let url: string;
      let payload: Record<string, unknown>;
      let successText: string;

      if (backfillMode) {
        url = '/production/material/inbound/backfill';
        payload = {
          purchaseId: inboundRecord.id,
          quantity: values.arrivedQuantity,
          operatorId: user?.id || '',
          operatorName,
          warehouseLocation: values.warehouseLocation,
          remark: values.remark,
        };
        successText = '补录入库成功，库存已更新并同步对账';
      } else if (movementAction === 'direct_use') {
        // 直采使用：不进仓库、库存不变，只记一条采购直用流水
        url = '/production/purchase/confirm-complete';
        payload = {
          purchaseId: inboundRecord.id,
          movementAction: 'direct_use',
          movementQuantity: values.arrivedQuantity,
          receiverName: operatorName,
          remark: values.remark,
        };
        successText = '已登记到货（直采使用），并记入采购直用流水';
      } else {
        url = '/production/material/inbound/confirm-arrival';
        payload = {
          purchaseId: inboundRecord.id,
          arrivedQuantity: values.arrivedQuantity,
          operatorId: user?.id || '',
          operatorName,
          warehouseLocation: values.warehouseLocation,
          remark: values.remark,
        };
        successText = '到货入库成功，库存已更新';
      }

      const res = await api.post<ApiResult<unknown>>(url, payload);
      if (res.code === 200) {
        message.success(successText);
        setBackfillMode(false);
        setInboundVisible(false);
        inboundForm.resetFields();
        await loadData();
      } else {
        message.error(res.message || '登记到货失败');
      }
    } catch (error: unknown) {
      handleFormSubmitError(error, message, '登记到货失败');
    } finally {
      setInboundLoading(false);
    }
  }, [inboundRecord, inboundForm, backfillMode, user, message, loadData]);

  return {
    inboundForm,
    inboundVisible,
    setInboundVisible,
    inboundRecord,
    inboundLoading,
    openInbound,
    doInbound,
  };
}
