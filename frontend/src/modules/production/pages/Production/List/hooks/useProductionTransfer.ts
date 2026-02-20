import { useState } from 'react';
import { ProductionOrder } from '@/types/production';
import api from '@/utils/api';

interface TransferUser {
  id: string;
  name: string;
  username: string;
}

interface TransferFactory {
  id: string;
  factoryCode: string;
  factoryName: string;
  contactPerson?: string;
  contactPhone?: string;
}

interface UseProductionTransferOptions {
  message: any; // antd message instance
}

/**
 * 转单功能 Hook
 * 管理转单弹窗的所有状态和操作
 * 支持：转人员（同租户内部用户）、转工厂（同租户内部工厂）
 * 备注时间戳由后端自动植入，前端无需处理
 */
export function useProductionTransfer({ message }: UseProductionTransferOptions) {
  // 转单弹窗状态
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferRecord, setTransferRecord] = useState<ProductionOrder | null>(null);
  const [transferSubmitting, setTransferSubmitting] = useState(false);

  // 转单类型：'user'=转人员，'factory'=转工厂
  const [transferType, setTransferType] = useState<'user' | 'factory'>('user');

  // --- 转人员 ---
  const [transferUserId, setTransferUserId] = useState<string | undefined>(undefined);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferUsers, setTransferUsers] = useState<TransferUser[]>([]);
  const [transferSearching, setTransferSearching] = useState(false);

  // --- 转工厂 ---
  const [transferFactoryId, setTransferFactoryId] = useState<string | undefined>(undefined);
  const [transferFactoryMessage, setTransferFactoryMessage] = useState('');
  const [transferFactories, setTransferFactories] = useState<TransferFactory[]>([]);
  const [transferFactorySearching, setTransferFactorySearching] = useState(false);

  // 菲号与工序选择（两种类型共用）
  const [transferBundles, setTransferBundles] = useState<any[]>([]);
  const [transferBundlesLoading, setTransferBundlesLoading] = useState(false);
  const [transferSelectedBundleIds, setTransferSelectedBundleIds] = useState<string[]>([]);
  const [transferProcesses, setTransferProcesses] = useState<any[]>([]);
  const [transferProcessesLoading, setTransferProcessesLoading] = useState(false);
  const [transferSelectedProcessCodes, setTransferSelectedProcessCodes] = useState<string[]>([]);

  /** 搜索可转单用户（仅限同租户系统内部用户） */
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
      if (result?.code === 200 && Array.isArray(result.data?.records)) {
        setTransferUsers(result.data.records.map((u: any) => ({
          id: String(u.id),
          name: u.name || u.realName || u.username,
          username: u.username || '',
        })));
      } else if (Array.isArray(result.data)) {
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

  /** 搜索可转工厂（仅限同租户系统内部工厂） */
  const searchTransferFactories = async (keyword: string) => {
    setTransferFactorySearching(true);
    try {
      const result = await api.get('/production/order/transfer/search-factories', {
        params: { keyword: keyword || '' }
      }) as any;
      const records = result?.data?.records || result?.data || [];
      if (Array.isArray(records)) {
        setTransferFactories(records.map((f: any) => ({
          id: String(f.id),
          factoryCode: f.factoryCode || '',
          factoryName: f.factoryName || '',
          contactPerson: f.contactPerson || '',
          contactPhone: f.contactPhone || '',
        })));
      }
    } catch {
      // ignore
    } finally {
      setTransferFactorySearching(false);
    }
  };

  /** 打开转单弹窗 */
  const handleTransferOrder = (order: ProductionOrder) => {
    setTransferRecord(order);
    setTransferType('user');
    // 清空人员转单状态
    setTransferUserId(undefined);
    setTransferMessage('');
    setTransferUsers([]);
    // 清空工厂转单状态
    setTransferFactoryId(undefined);
    setTransferFactoryMessage('');
    setTransferFactories([]);
    // 清空菲号/工序选择
    setTransferSelectedBundleIds([]);
    setTransferSelectedProcessCodes([]);
    setTransferBundles([]);
    setTransferProcesses([]);
    setTransferModalVisible(true);

    // 预加载工厂列表（显示全部启用工厂，无需输入触发）
    searchTransferFactories('');

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

  /** 提交转单（人员或工厂，时间戳由后端自动植入备注） */
  const submitTransfer = async () => {
    if (!transferRecord) return;

    if (transferType === 'user') {
      if (!transferUserId) {
        message.warning('请选择转单目标人员');
        return;
      }
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
    } else {
      // 转工厂
      if (!transferFactoryId) {
        message.warning('请选择目标工厂');
        return;
      }
      setTransferSubmitting(true);
      try {
        const result = await api.post('/production/order/transfer/create-to-factory', {
          orderId: (transferRecord as any).id,
          toFactoryId: transferFactoryId,
          message: transferFactoryMessage.trim() || '',
          bundleIds: transferSelectedBundleIds.length > 0 ? transferSelectedBundleIds.join(',') : null,
          processCodes: transferSelectedProcessCodes.length > 0 ? transferSelectedProcessCodes.join(',') : null,
        }) as any;
        if (result?.code === 200) {
          message.success('转工厂申请已发送');
          setTransferModalVisible(false);
          setTransferRecord(null);
        } else {
          message.error(result?.message || '转工厂失败');
        }
      } catch (error: any) {
        message.error(error?.message || '转工厂失败');
      } finally {
        setTransferSubmitting(false);
      }
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
    transferType,
    setTransferType,
    // 转人员
    transferUserId,
    setTransferUserId,
    transferMessage,
    setTransferMessage,
    transferUsers,
    transferSearching,
    // 转工厂
    transferFactoryId,
    setTransferFactoryId,
    transferFactoryMessage,
    setTransferFactoryMessage,
    transferFactories,
    transferFactorySearching,
    // 公共
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
    searchTransferFactories,
    handleTransferOrder,
    submitTransfer,
    closeTransferModal,
  };
}
