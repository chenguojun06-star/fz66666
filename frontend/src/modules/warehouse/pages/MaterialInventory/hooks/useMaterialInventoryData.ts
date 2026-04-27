import { useState, useEffect } from 'react';
import { useModal } from '@/hooks';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import { message } from '@/utils/antdStatic';
import type { MaterialInventory } from '../types';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import { useMaterialInventoryList } from './useMaterialInventoryList';
import { useMaterialAlerts } from './useMaterialAlerts';
import { useInstructionManager } from './useInstructionManager';
import { usePendingPickings } from './usePendingPickings';
import { useInboundFlow } from './useInboundFlow';
import { useOutboundContext } from './useOutboundContext';
import { useOutboundActions } from './useOutboundActions';

export type { MaterialBatchDetail } from './useOutboundActions';
export type { PendingPicking } from './usePendingPickings';

export function useMaterialInventoryData() {
  // ── 列表 + 搜索 + 统计 ──────────────────────────────────
  const listHook = useMaterialInventoryList();
  const { user, fetchData } = listHook;

  // ── 库存预警 ─────────────────────────────────────────────
  const alertHook = useMaterialAlerts();

  // ── 派料指令 ─────────────────────────────────────────────
  const instruction = useInstructionManager({ alertList: alertHook.alertList, user });

  // ── 详情 & 打印 弹窗 ──────────────────────────────────────
  const detailModal = useModal<MaterialInventory>();
  const printModal = useModal<MaterialOutboundPrintPayload>();
  const openPrintModal = (payload: MaterialOutboundPrintPayload) => printModal.open(payload);

  // ── 出入库流水（详情弹窗用） ──────────────────────────────
  const [txLoading, setTxLoading] = useState(false);
  const [txList, setTxList] = useState<Array<{
    type: string; typeLabel: string; operationTime: string | null;
    quantity: number; operatorName: string; warehouseLocation: string; remark: string;
  }>>([]);
  useEffect(() => {
    if (!detailModal.visible || !detailModal.data?.materialCode) { setTxList([]); return; }
    setTxLoading(true);
    materialInventoryApi.listTransactions(detailModal.data.materialCode)
      .then((res) => setTxList(Array.isArray(res) ? res : (res?.data ?? [])))
      .catch(() => message.error('加载出入库记录失败'))
      .finally(() => setTxLoading(false));
  }, [detailModal.visible, detailModal.data?.materialCode]);

  // ── 安全库存调整 ──────────────────────────────────────────
  const [safetyStockVisible, setSafetyStockVisible] = useState(false);
  const [safetyStockTarget, setSafetyStockTarget] = useState<MaterialInventory | null>(null);
  const [safetyStockValue, setSafetyStockValue] = useState<number>(100);
  const [safetyStockSubmitting, setSafetyStockSubmitting] = useState(false);

  const handleEditSafetyStock = (record: MaterialInventory) => {
    setSafetyStockTarget(record);
    setSafetyStockValue(record.safetyStock || 100);
    setSafetyStockVisible(true);
  };

  const handleSafetyStockSave = async () => {
    if (!safetyStockTarget) return;
    setSafetyStockSubmitting(true);
    try {
      const res = await materialInventoryApi.updateSafetyStock({
        stockId: safetyStockTarget.id, safetyStock: safetyStockValue,
      });
      if (res.code === 200) {
        message.success('安全库存已更新');
        setSafetyStockVisible(false);
        void listHook.fetchData();
        void alertHook.fetchAlerts();
      } else { message.error('更新失败'); }
    } catch { message.error('更新安全库存失败'); }
    finally { setSafetyStockSubmitting(false); }
  };

  const handleViewDetail = (record: MaterialInventory) => detailModal.open(record);

  // ── 待出库领料单 ──────────────────────────────────────────
  const pendingHook = usePendingPickings({ user, fetchData, openPrintModal });

  // ── 入库 ─────────────────────────────────────────────────
  const inboundHook = useInboundFlow({ user, fetchData, openPrintModal });

  // ── 出库（上下文 + 操作分离） ──────────────────────────────
  const outboundCtx = useOutboundContext();
  const outboundActions = useOutboundActions({
    user, fetchData, openPrintModal,
    outboundForm: outboundCtx.outboundForm,
    factoryOptions: outboundCtx.factoryOptions,
    loadFactories: outboundCtx.loadFactories,
    setOutboundOrderOptions: outboundCtx.setOutboundOrderOptions,
    autoMatchOutboundContext: outboundCtx.autoMatchOutboundContext,
    receiverOptions: instruction.receiverOptions,
    loadReceivers: instruction.loadReceivers,
  });

  return {
    ...listHook,
    ...alertHook,
    ...instruction,
    ...pendingHook,
    ...inboundHook,
    ...outboundCtx,
    ...outboundActions,
    detailModal,
    printModal,
    openPrintModal,
    txLoading,
    txList,
    safetyStockVisible, setSafetyStockVisible,
    safetyStockTarget, safetyStockValue, setSafetyStockValue,
    safetyStockSubmitting,
    handleEditSafetyStock,
    handleSafetyStockSave,
    handleViewDetail,
  };
}
