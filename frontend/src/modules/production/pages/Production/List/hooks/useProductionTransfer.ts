import { useState } from 'react';
import { ProductionOrder } from '@/types/production';
import api from '@/utils/api';

interface TransferUser {
  id: string;
  name: string;
  username: string;
}

interface UseProductionTransferOptions {
  message: any; // antd message instance
}

/**
 * 转单功能 Hook
 * 管理转单弹窗的所有状态和操作
 */
export function useProductionTransfer({ message }: UseProductionTransferOptions) {
  // 转单弹窗状态
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferRecord, setTransferRecord] = useState<ProductionOrder | null>(null);
  const [transferUserId, setTransferUserId] = useState<string | undefined>(undefined);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferUsers, setTransferUsers] = useState<TransferUser[]>([]);
  const [transferSearching, setTransferSearching] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // 菲号与工序选择
  const [transferBundles, setTransferBundles] = useState<any[]>([]);
  const [transferBundlesLoading, setTransferBundlesLoading] = useState(false);
  const [transferSelectedBundleIds, setTransferSelectedBundleIds] = useState<string[]>([]);
  const [transferProcesses, setTransferProcesses] = useState<any[]>([]);
  const [transferProcessesLoading, setTransferProcessesLoading] = useState(false);
  const [transferSelectedProcessCodes, setTransferSelectedProcessCodes] = useState<string[]>([]);

  /** 搜索可转单用户 */
  const searchTransferUsers = async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setTransferUsers([]);
      return;
    }
    setTransferSearching(true);
    try {
      const result = await api.get('/production/order/transfer/search-users', {
        params: { keyword }
      }) as any;
      if (result?.code === 200 && Array.isArray(result.data)) {
        setTransferUsers(result.data.map((u: any) => ({
          id: String(u.id),
          name: u.name || u.realName || u.username,
          username: u.username || '',
        })));
      }
    } catch {
      // ignore
    } finally {
      setTransferSearching(false);
    }
  };

  /** 打开转单弹窗 */
  const handleTransferOrder = (order: ProductionOrder) => {
    setTransferRecord(order);
    setTransferUserId(undefined);
    setTransferMessage('');
    setTransferUsers([]);
    setTransferSelectedBundleIds([]);
    setTransferSelectedProcessCodes([]);
    setTransferBundles([]);
    setTransferProcesses([]);
    setTransferModalVisible(true);

    // 加载菲号列表
    setTransferBundlesLoading(true);
    api.get('/production/cutting/list', {
      params: {
        orderNo: (order as any).orderNo,
        orderId: (order as any).id,
        page: 1,
        pageSize: 999
      }
    })
      .then((res: any) => {
        const records = res?.data?.records || res?.records || res?.data || [];
        setTransferBundles(records);
      })
      .catch((err) => {
        console.error('[转单] 加载菲号失败:', err);
        setTransferBundles([]);
      })
      .finally(() => setTransferBundlesLoading(false));

    // 加载工序列表
    const orderProcesses = (order as any).progressNodeUnitPrices || [];
    if (Array.isArray(orderProcesses) && orderProcesses.length > 0) {
      const processes = orderProcesses.map((p: any) => ({
        processCode: p.processCode || p.code || p.id,
        processName: p.name || p.processName || '',
        unitPrice: Number(p.unitPrice || p.price || 0),
        progressStage: p.progressStage || p.stage || '',
      }));
      setTransferProcesses(processes);
    } else {
      if ((order as any).styleId) {
        setTransferProcessesLoading(true);
        api.get('/style/process/list', { params: { styleId: (order as any).styleId } })
          .then((res: any) => {
            const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
            const processes = list.map((p: any) => ({
              processCode: p.processCode || p.code || p.id,
              processName: p.processName || p.name || '',
              unitPrice: Number(p.unitPrice || p.price || 0),
              progressStage: p.progressStage || p.stage || '',
            }));
            setTransferProcesses(processes);
          })
          .catch(() => setTransferProcesses([]))
          .finally(() => setTransferProcessesLoading(false));
      }
    }
  };

  /** 提交转单 */
  const submitTransfer = async () => {
    if (!transferUserId) {
      message.warning('请选择转单目标人员');
      return;
    }
    if (!transferRecord) return;
    setTransferSubmitting(true);
    try {
      const result = await api.post('/production/order/transfer/create', {
        orderId: (transferRecord as any).id,
        toUserId: transferUserId,
        message: transferMessage.trim() || '',
        bundleIds: transferSelectedBundleIds.length > 0 ? transferSelectedBundleIds.join(',') : null,
        processCodes: transferSelectedProcessCodes.length > 0 ? transferSelectedProcessCodes.join(',') : null,
      }) as any;
      if (result?.code === 200) {
        message.success('转单申请已发送');
        setTransferModalVisible(false);
        setTransferRecord(null);
      } else {
        message.error(result?.message || '转单失败');
      }
    } catch (error: any) {
      message.error(error?.message || '转单失败');
    } finally {
      setTransferSubmitting(false);
    }
  };

  /** 关闭转单弹窗 */
  const closeTransferModal = () => {
    setTransferModalVisible(false);
    setTransferRecord(null);
  };

  return {
    // 状态
    transferModalVisible,
    transferRecord,
    transferUserId,
    setTransferUserId,
    transferMessage,
    setTransferMessage,
    transferUsers,
    transferSearching,
    transferSubmitting,
    transferBundles,
    transferBundlesLoading,
    transferSelectedBundleIds,
    setTransferSelectedBundleIds,
    transferProcesses,
    transferProcessesLoading,
    transferSelectedProcessCodes,
    setTransferSelectedProcessCodes,
    // 操作
    searchTransferUsers,
    handleTransferOrder,
    submitTransfer,
    closeTransferModal,
  };
}
