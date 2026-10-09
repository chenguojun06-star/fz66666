/**
 * usePurchaseConfirmCompleteActions — 确认完成（批量）+ 物料去向选择
 * D-321b: 确认完成时可选"入库到仓库/直接使用/暂不登记"，出入库动作写入物料仓储流水。
 */
import { useState } from 'react';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { isConfirmCompleteRow, getBatchActionDisabledReason } from '@/components/common/purchase/PurchaseActionBar';
import { postConfirmComplete } from './purchaseActionsHelpers';

export type MovementAction = 'inbound' | 'direct_use' | 'none';

export interface ConfirmCompleteOptions {
  movementAction: MovementAction;
  /** 仅单张采购单时可编辑数量；批量按各单采购量全额处理 */
  movementQuantity?: number;
  warehouseLocation?: string;
  receiverName?: string;
}

interface UsePurchaseConfirmCompleteActionsOptions {
  message: any;
  detailPurchases: MaterialPurchaseType[];
  fetchMaterialPurchaseList: () => Promise<void>;
  loadDetailByOrderNo: (orderNo: string) => Promise<void>;
  loadDetailByStyleNo: (styleNo: string, purchaseNo?: string) => Promise<void>;
  ensureOrderUnlocked: (orderKey: any) => Promise<boolean>;
}

export function usePurchaseConfirmCompleteActions({
  message,
  detailPurchases,
  fetchMaterialPurchaseList,
  loadDetailByOrderNo,
  loadDetailByStyleNo,
  ensureOrderUnlocked,
}: UsePurchaseConfirmCompleteActionsOptions) {
  const [confirmCompleteSubmitting, setConfirmCompleteSubmitting] = useState(false);
  const [confirmCompleteModalOpen, setConfirmCompleteModalOpen] = useState(false);
  // 外部指定的目标集（如采购管理列表页选中行）；null 时回落到详情页 detailPurchases 口径
  const [overrideTargets, setOverrideTargets] = useState<MaterialPurchaseType[] | null>(null);

  // D-664b：目标口径统一 D-368 业务事实（非取消、未完成、已到货），与按钮禁用判定同源
  const confirmCompleteTargets = overrideTargets ?? detailPurchases.filter(isConfirmCompleteRow);

  /** 点击"确认完成"按钮：先弹物料去向选择，不再直接提交 */
  const confirmComplete = () => {
    if (!confirmCompleteTargets.length) {
      message.info(getBatchActionDisabledReason(detailPurchases, 'confirmComplete') || '没有待确认完成的采购任务');
      return;
    }
    setConfirmCompleteModalOpen(true);
  };

  /** 按指定行打开确认完成弹窗（采购管理列表页选中行批量完成，与详情页同一弹窗） */
  const confirmCompleteFrom = (targets: MaterialPurchaseType[]) => {
    const list = targets.filter((t) => String(t?.id || '').trim() && isConfirmCompleteRow(t));
    if (!list.length) {
      message.info(getBatchActionDisabledReason(targets, 'confirmComplete') || '选中行中没有待确认完成的采购任务');
      return;
    }
    setOverrideTargets(list);
    setConfirmCompleteModalOpen(true);
  };

  const closeConfirmCompleteModal = () => {
    if (confirmCompleteSubmitting) return;
    setConfirmCompleteModalOpen(false);
    setOverrideTargets(null);
  };

  const submitConfirmComplete = async (options: ConfirmCompleteOptions) => {
    const targets = confirmCompleteTargets;
    if (!targets.length) {
      message.info(getBatchActionDisabledReason(detailPurchases, 'confirmComplete') || '没有待确认完成的采购任务');
      return;
    }
    const orderKey = String(targets[0]?.orderId || targets[0]?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    // 提前取出 orderNo/styleNo，finally 块也需要用到
    const orderNo = String(targets[0]?.orderNo || '').trim();
    const styleNo = String(targets[0]?.styleNo || '').trim();
    try {
      setConfirmCompleteSubmitting(true);
      for (const t of targets) {
        await postConfirmComplete({
          purchaseId: String(t.id),
          ...(options.movementAction !== 'none' ? {
            movementAction: options.movementAction,
            // 批量时不传数量——后端按各单剩余可入库量全额处理；单张才带用户编辑值
            ...(targets.length === 1 && options.movementQuantity ? { movementQuantity: options.movementQuantity } : {}),
            ...(options.movementAction === 'inbound' && options.warehouseLocation ? { warehouseLocation: options.warehouseLocation } : {}),
            ...(options.movementAction === 'direct_use' && options.receiverName ? { receiverName: options.receiverName } : {}),
          } : {}),
        });
      }
      const actionText = options.movementAction === 'inbound' ? '，已登记入库'
        : options.movementAction === 'direct_use' ? '，已记采购直用流水' : '';
      message.success(`确认完成成功${actionText}`);
      setConfirmCompleteModalOpen(false);
      setOverrideTargets(null);
      await fetchMaterialPurchaseList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '确认完成失败');
    } finally {
      // 无论成功或失败都刷新详情，确保按钮状态反映服务器真实状态，
      // 防止 stale detailPurchases 导致按钮在状态已 completed 时仍可点击重复提交。
      // 先刷新再解除 loading，避免数据未更新时按钮闪现可点状态。
      if (orderNo && orderNo !== '-') { await loadDetailByOrderNo(orderNo); }
      else if (styleNo) { await loadDetailByStyleNo(styleNo); }
      setConfirmCompleteSubmitting(false);
    }
  };

  return {
    confirmComplete,
    confirmCompleteFrom,
    confirmCompleteSubmitting,
    confirmCompleteModalOpen,
    closeConfirmCompleteModal,
    submitConfirmComplete,
    confirmCompleteTargets,
  };
}
