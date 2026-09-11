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
    setReceiveVisible(true);
  }, [message, receiveForm]);

  /**
   * D-366b：领取只认领任务，不再提交数量。
   * 旧实现把弹窗里的「本次到货数量」当 quantity 提交，而后端 /purchase/receive 的 quantity
   * 语义是「修改采购数量」(D-104) —— 界面与后端做的不是一回事。
   * 到货改为独立动作：「登记到货」（useInboundModal），到货时必须选去向。
   */
  const handleReceive = useCallback(async () => {
    if (!receiveRecord) return;
    try {
      setReceiveLoading(true);
      const receiverName = getOperatorName(user);
      const response = await postReceive({
        purchaseId: receiveRecord.id,
        receiverId: user?.id || '',
        receiverName,
      });
      if (response.code === 200) {
        message.success('领取成功，到货后请点「登记到货」');
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
