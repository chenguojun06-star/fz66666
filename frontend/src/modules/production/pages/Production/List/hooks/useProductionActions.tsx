import { useState } from 'react';
import { ProductionOrder } from '@/types/production';
import api, { isApiSuccess, isOrderFrozenByStatus } from '@/utils/api';
import { productionOrderApi } from '@/services/production/productionApi';
import dayjs from 'dayjs';
import { safeString, getCloseMinRequired, buildOrdersCsv, downloadTextFile } from '../utils';

interface UseProductionActionsOptions {
  message: any;
  isSupervisorOrAbove: boolean;
  fetchProductionList: () => void;
}

/** Rich state for close-order confirm dialog */
export interface PendingCloseOrder {
  order: ProductionOrder;
  orderQty: number;
  minRequired: number;
  cuttingQty: number;
  warehousingQualified: number;
  isSpecial?: boolean;
}

/**
 * 订单操作 Hook
 * 管理关单、报废、快速编辑、备注、CSV 导出等操作
 */
export function useProductionActions({
  message,
  isSupervisorOrAbove,
  fetchProductionList,
}: UseProductionActionsOptions) {
  // 关单确认状态
  const [pendingCloseOrder, setPendingCloseOrder] = useState<PendingCloseOrder | null>(null);
  const [closeOrderLoading, setCloseOrderLoading] = useState(false);
  // 报废确认状态
  const [pendingScrapOrder, setPendingScrapOrder] = useState<ProductionOrder | null>(null);
  const [scrapOrderLoading, setScrapOrderLoading] = useState(false);
  // 快速编辑状态
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [remarkPopoverId, setRemarkPopoverId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  /** 保存跟单员备注（自动前置时间戳）*/
  const handleRemarkSave = async (orderId: string) => {
    setRemarkSaving(true);
    try {
      const ts = dayjs().format('MM-DD HH:mm');
      const finalText = remarkText.trim() ? `[${ts}] ${remarkText.trim()}` : '';
      await productionOrderApi.quickEdit({
        id: orderId,
        remarks: finalText,
      });
      message.success('备注已保存');
      setRemarkPopoverId(null);
      setRemarkText('');
      await fetchProductionList();
    } catch (err: unknown) {
      const respMsg = typeof err === 'object' && err !== null && 'response' in err
        ? String((err as any).response?.data?.message || '') : '';
      message.error(respMsg || (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setRemarkSaving(false);
    }
  };

  /** 快速编辑保存 */
  const handleQuickEditSave = async (
    values: { remarks: string; expectedShipDate: string | null; urgencyLevel?: string },
    editData: ProductionOrder | null,
    closeModal: () => void,
  ) => {
    setQuickEditSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: editData?.id,
        ...values,
        urgencyLevel: values.urgencyLevel || 'normal',
      });
      message.success('保存成功');
      closeModal();
      await fetchProductionList();
    } catch (error: unknown) {
      const respMsg = typeof error === 'object' && error !== null && 'response' in error
        ? String((error as any).response?.data?.message || '') : '';
      message.error(respMsg || (error instanceof Error ? error.message : '保存失败'));
      throw error;
    } finally {
      setQuickEditSaving(false);
    }
  };

  /** 关单操作 */
  const handleCloseOrder = (order: ProductionOrder) => {
    const orderId = safeString((order as any)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as any)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as any)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as any)?.warehousingQualifiedQuantity ?? 0) || 0;

    const normalizedStatus = String((order as any)?.status || '').trim().toLowerCase();
    if (normalizedStatus === 'scrapped') {
      message.info('该订单已报废，无需关单');
      return;
    }

    if ((order as any)?.status === 'completed') {
      message.info('该订单已完成，无需关单');
      return;
    }

    if (isOrderFrozenByStatus(order)) {
      message.info('该订单已终态，无需关单');
      return;
    }

    if (minRequired <= 0 || warehousingQualified < minRequired) {
      // 未满足关单条件 → 特需关单路径，必须填写原因
      setPendingCloseOrder({ order, orderQty, minRequired, cuttingQty, warehousingQualified, isSpecial: true });
      return;
    }

    setPendingCloseOrder({ order, orderQty, minRequired, cuttingQty, warehousingQualified, isSpecial: false });
  };

  /** 报废操作 */
  const handleScrapOrder = (order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限报废');
      return;
    }
    const orderId = safeString((order as any)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法报废');
      return;
    }
    if (isOrderFrozenByStatus(order)) {
      const normalizedStatus = String((order as any)?.status || '').trim().toLowerCase();
      if (normalizedStatus === 'scrapped') {
        message.error('订单已报废，无需重复报废');
      } else {
        message.error('订单已关单或完成，无法报废');
      }
      return;
    }

    setPendingScrapOrder(order);
  };

  const confirmCloseOrder = async (remark: string) => {
    if (!pendingCloseOrder) return;
    setCloseOrderLoading(true);
    try {
      const orderId = safeString((pendingCloseOrder.order as any)?.id, '');
      const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
        '/production/order/close',
        { id: orderId, sourceModule: 'myOrders', remark: remark || undefined, specialClose: !!pendingCloseOrder?.isSpecial }
      );
      if (!isApiSuccess(result)) {
        const msg = typeof result === 'object' && result !== null && 'message' in result
          ? String((result as any).message) || '关单失败' : '关单失败';
        throw new Error(msg);
      }
      message.success('关单成功');
      setPendingCloseOrder(null);
      fetchProductionList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '关单失败');
    } finally {
      setCloseOrderLoading(false);
    }
  };
  const cancelCloseOrder = () => setPendingCloseOrder(null);

  const confirmScrapOrder = async (reason: string) => {
    if (!pendingScrapOrder) return;
    setScrapOrderLoading(true);
    try {
      const orderId = safeString((pendingScrapOrder as any)?.id, '');
      const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
        '/production/order/scrap',
        { id: orderId, remark: reason }
      );
      if (!isApiSuccess(result)) {
        const msg = typeof result === 'object' && result !== null && 'message' in result
          ? String((result as any).message) || '报废失败' : '报废失败';
        throw new Error(msg);
      }
      message.success('报废成功');
      setPendingScrapOrder(null);
      fetchProductionList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '报废失败');
    } finally {
      setScrapOrderLoading(false);
    }
  };
  const cancelScrapOrder = () => setPendingScrapOrder(null);

  /** 导出已选订单为 CSV */
  const exportSelected = (selectedRows: ProductionOrder[]) => {
    if (!selectedRows.length) {
      message.warning('请先勾选要导出的订单');
      return;
    }
    const csv = buildOrdersCsv(selectedRows);
    const filename = `我的订单_勾选_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
    downloadTextFile(filename, csv);
  };

  return {
    // 快速编辑
    quickEditSaving,
    handleQuickEditSave,
    // 备注
    remarkPopoverId,
    setRemarkPopoverId,
    remarkText,
    setRemarkText,
    remarkSaving,
    handleRemarkSave,
    // 订单操作
    handleCloseOrder,
    pendingCloseOrder,
    closeOrderLoading,
    confirmCloseOrder,
    cancelCloseOrder,
    handleScrapOrder,
    pendingScrapOrder,
    scrapOrderLoading,
    confirmScrapOrder,
    cancelScrapOrder,
    exportSelected,
  };
}
