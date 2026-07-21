/**
 * usePurchaseConfirmCompleteActions — 确认完成（批量）
 * 从 usePurchaseActions 拆分而来，保持 API 路径/参数签名/返回值结构不变
 */
import { useState } from 'react';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { normalizeStatus, postConfirmComplete } from './purchaseActionsHelpers';

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

  const confirmComplete = async () => {
    const targets = detailPurchases.filter((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
    if (!targets.length) { message.info('没有待确认完成的采购任务'); return; }
    const orderKey = String(targets[0]?.orderId || targets[0]?.orderNo || '').trim();
    if (orderKey) { const ok = await ensureOrderUnlocked(orderKey); if (!ok) return; }
    // 提前取出 orderNo/styleNo，finally 块也需要用到
    const orderNo = String(targets[0]?.orderNo || '').trim();
    const styleNo = String(targets[0]?.styleNo || '').trim();
    try {
      setConfirmCompleteSubmitting(true);
      for (const t of targets) {
        await postConfirmComplete({ purchaseId: String(t.id) });
      }
      message.success('确认完成成功');
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
    confirmCompleteSubmitting,
  };
}
