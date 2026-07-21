import { useCallback } from 'react';
import type { FormInstance } from 'antd';
import type { MessageInstance } from 'antd/es/message/interface';
import api from '@/utils/api';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { normalizeStatus } from '../InlinePurchasePanel.helpers';
import type { UserInfo } from '@/utils/AuthContext';
import type { MaterialPurchase } from '@/types/production';

/**
 * 采购到货/入库/取消/出库相关 actions 子 hook
 * - 仅做结构拆分，业务逻辑/参数/API 路径保持原样
 */
export interface UsePurchaseReceiveActionsParams {
  message: MessageInstance;
  user?: UserInfo | null;
  purchases: MaterialPurchase[];
  loadData: () => Promise<void>;
  receiveModalRecord: MaterialPurchase | null;
  setReceiveModalRecord: React.Dispatch<React.SetStateAction<MaterialPurchase | null>>;
  receiveModalVisible: boolean;
  setReceiveModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  receiveForm: FormInstance;
  inboundModalRecord: MaterialPurchase | null;
  setInboundModalRecord: React.Dispatch<React.SetStateAction<MaterialPurchase | null>>;
  inboundModalVisible: boolean;
  setInboundModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  inboundForm: FormInstance;
  actionLoading: boolean;
  setActionLoading: React.Dispatch<React.SetStateAction<boolean>>;
}

export const usePurchaseReceiveActions = (params: UsePurchaseReceiveActionsParams) => {
  const {
    message,
    user,
    purchases,
    loadData,
    receiveModalRecord,
    setReceiveModalRecord,
    setReceiveModalVisible,
    receiveForm,
    setInboundModalRecord,
    inboundForm,
    setInboundModalVisible,
    actionLoading,
    setActionLoading,
  } = params;

  const handleReceive = useCallback(async (record: MaterialPurchase) => {
    setReceiveModalRecord(record);
    receiveForm.setFieldsValue({ quantity: Number(record.purchaseQuantity || 0) });
    setReceiveModalVisible(true);
  }, [setReceiveModalRecord, receiveForm, setReceiveModalVisible]);

  const doReceive = useCallback(async () => {
    try {
      const values = await receiveForm.validateFields();
      const record = receiveModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const receiverId = String(user?.id || '').trim();
      const receiverName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
        purchaseId,
        receiverId,
        receiverName,
        arrivedQuantity: values.quantity,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 到货确认成功`);
        setReceiveModalVisible(false);
        loadData();
      } else {
        message.error(res?.message || '到货确认失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // form validation
      message.error((e as Error)?.message || '到货确认失败');
    }
  }, [receiveModalRecord, receiveForm, user, message, loadData, setReceiveModalVisible]);

  // 到货入库：将物料入库到仓库库存
  const handleInbound = useCallback(async (record: MaterialPurchase) => {
    setInboundModalRecord(record);
    const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
    inboundForm.setFieldsValue({ arrivedQuantity: maxQty });
    setInboundModalVisible(true);
  }, [setInboundModalRecord, inboundForm, setInboundModalVisible]);

  const doInbound = useCallback(async () => {
    try {
      const values = await inboundForm.validateFields();
      const record = params.inboundModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const operatorId = String(user?.id || '').trim();
      const operatorName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/material/inbound/confirm-arrival', {
        purchaseId,
        arrivedQuantity: values.arrivedQuantity,
        operatorId,
        operatorName,
        warehouseLocation: values.warehouseLocation,
        remark: values.remark,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 到货入库成功，库存已更新`);
        setInboundModalVisible(false);
        inboundForm.resetFields();
        loadData();
      } else {
        message.error(res?.message || '到货入库失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // form validation
      message.error((e as Error)?.message || '到货入库失败');
    }
  }, [params.inboundModalRecord, inboundForm, user, message, loadData, setInboundModalVisible]);

  const handleReceiveAll = useCallback(async () => {
    if (actionLoading) return; // 防重入
    const pendingItems = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING);
    if (pendingItems.length === 0) {
      message.info('没有待采购的物料');
      return;
    }
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    if (!receiverId && !receiverName) {
      message.error('领取人信息缺失，请重新登录');
      return;
    }
    setActionLoading(true);
    try {
      const purchaseIds = pendingItems.map(p => String(p.id || '')).filter(Boolean);
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-receive', {
        purchaseIds,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`已批量领取 ${pendingItems.length} 项物料`);
        loadData();
      } else {
        message.error(res?.message || '批量领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '批量领取失败');
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, purchases, user, message, loadData, setActionLoading]);

  const handleCancelReceive = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/cancel-receive', {
        purchaseId,
        reason: '手动取消领取',
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已取消领取`);
        loadData();
      } else {
        message.error(res?.message || '取消领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '取消领取失败');
    }
  }, [message, loadData]);

  const handleWarehousePick = useCallback(async (record: MaterialPurchase, pickQty: number) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    const safePickQty = Number.isFinite(pickQty) ? Math.floor(pickQty) : 0;
    if (safePickQty <= 0) {
      message.error('领取数量无效，请检查库存数据');
      return;
    }
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
        purchaseId,
        pickQty: safePickQty,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已提交出库申请`);
        loadData();
      } else {
        message.error(res?.message || '出库领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '出库领取失败');
    }
  }, [user, message, loadData]);

  return {
    handleReceive,
    doReceive,
    handleInbound,
    doInbound,
    handleReceiveAll,
    handleCancelReceive,
    handleWarehousePick,
  };
};

export default usePurchaseReceiveActions;
