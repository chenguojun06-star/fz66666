import { useCallback } from 'react';
import { Form, Modal, message } from 'antd';
import api from '@/utils/api';
import {
  getBatchActionDisabledReason,
  isBatchArrivalRegistrableRow,
} from './PurchaseActionBar';
import BatchArrivalFormBody, { type BatchArrivalRow } from './BatchArrivalFormBody';

export type { BatchArrivalRow };

interface UseBatchArrivalOptions<T extends BatchArrivalRow> {
  /** 当前登录用户（写入入库操作人） */
  user?: { id?: string | number; name?: string; username?: string } | null;
  /** 额外过滤（如订单已冻结），默认全部通过 */
  filterRow?: (row: T) => boolean;
  /** 登记成功后的刷新回调 */
  onSuccess?: () => void;
}

/**
 * 批量登记到货（列表页 / 物料详情页 / 订单采购节点弹窗共用一套）。
 *
 * D-890：与单条「登记到货」完全同口径——每行可选到货去向
 * 「入库到物料仓库」（自动生成入库单并更新库存）或「直采使用（不进仓库）」
 * （完成采购并记采购直用流水）；任一行入库时需选仓库+库位。
 * 表单体见 BatchArrivalFormBody（与单条 InboundModal 同范式）。
 *
 * 提交走 POST /production/material/inbound/batch-confirm-arrival（items 带
 * per-item movementAction），后端逐条独立事务，单条失败不影响其余条目。
 */
export const useBatchArrival = <T extends BatchArrivalRow>({
  user,
  filterRow,
  onSuccess,
}: UseBatchArrivalOptions<T>) => {
  const [form] = Form.useForm();

  const openBatchArrival = useCallback((rows: T[]) => {
    const pass = (r: T) => (filterRow ? filterRow(r) : true);
    const targets = (rows || []).filter((r) => pass(r) && isBatchArrivalRegistrableRow(r));
    if (!targets.length) {
      const active = (rows || []).filter(pass);
      message.info(active.length
        ? (getBatchActionDisabledReason(active, 'arrivalRegister') || '没有可登记到货的采购任务')
        : '所选采购任务已锁定，无法批量操作');
      return;
    }

    // D-894：去向默认沿用用户上一次的选择（与确认完成弹窗同一记忆键），不再每次从「入库」开始
    const lastAction = localStorage.getItem('purchase.confirmComplete.lastMovementAction');
    const defaultAction = lastAction === 'direct_use' ? 'direct_use' : 'inbound';
    form.setFieldsValue({
      items: targets.map((r) => ({
        purchaseId: String(r.id || ''),
        arrivedQuantity: Math.max(0.01, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0)),
        movementAction: defaultAction,
      })),
      warehouseLocation: '',
      remark: '',
    });

    Modal.confirm({
      title: `批量登记到货（${targets.length} 项）`,
      // D-891：加宽弹窗——行内要放物料信息 + 去向 + 数量，52vw 布局太挤
      width: 860,
      content: <BatchArrivalFormBody form={form} rows={targets} />,
      okText: '确认登记',
      cancelText: '取消',
      onOk: async () => {
        try {
          const values = await form.validateFields();
          const items = (values.items || [])
            .map((it: { purchaseId?: string; arrivedQuantity?: number; movementAction?: string }) => ({
              purchaseId: String(it?.purchaseId || '').trim(),
              arrivedQuantity: Number(it?.arrivedQuantity),
              movementAction: it?.movementAction === 'direct_use' ? 'direct_use' : 'inbound',
            }))
            .filter((it) => it.purchaseId && Number.isFinite(it.arrivedQuantity));
          if (!items.length) {
            message.error('没有可登记到货的采购任务');
            return false;
          }
          const res = await api.post<{
            code: number;
            message?: string;
            data?: { successCount?: number; failCount?: number; errors?: string[] };
          }>('/production/material/inbound/batch-confirm-arrival', {
            items,
            warehouseLocation: values.warehouseLocation || '',
            operatorId: String(user?.id || ''),
            operatorName: String(user?.name || user?.username || ''),
            remark: values.remark || '',
          });
          if (res.code === 200) {
            const { successCount = 0, failCount = 0, errors = [] } = res.data || {};
            const hasDirect = items.some((it) => it.movementAction === 'direct_use');
            if (failCount > 0) {
              message.warning(`登记到货完成：成功 ${successCount} 项，失败 ${failCount} 项（${errors[0] || ''}）`);
            } else {
              message.success(`已登记到货 ${successCount} 项${hasDirect ? '（直采使用已记直用流水）' : '，库存已更新'}`);
            }
            onSuccess?.();
            return true;
          }
          message.error(res.message || '批量登记到货失败');
          return false;
        } catch (e) {
          if (e && typeof e === 'object' && 'errorFields' in e) return false;
          message.error((e as Error)?.message || '批量登记到货失败');
          return false;
        }
      },
    });
  }, [form, user, filterRow, onSuccess]);

  return { openBatchArrival };
};

export default useBatchArrival;
