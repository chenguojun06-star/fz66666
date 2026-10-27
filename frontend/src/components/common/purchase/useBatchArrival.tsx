import { useCallback } from 'react';
import { Form, Input, InputNumber, Modal, message } from 'antd';
import api from '@/utils/api';
import {
  getBatchActionDisabledReason,
  isBatchArrivalRegistrableRow,
  type BatchActionRow,
} from './PurchaseActionBar';

/** 批量登记到货的行（在统一判定字段基础上带展示信息） */
export interface BatchArrivalRow extends BatchActionRow {
  materialName?: string;
  materialCode?: string;
  color?: string;
  unit?: string;
}

interface UseBatchArrivalOptions<T extends BatchArrivalRow> {
  /** 当前登录用户（写入入库操作人） */
  user?: { id?: string | number; name?: string; username?: string } | null;
  /** 额外过滤（如订单已冻结），默认全部通过 */
  filterRow?: (row: T) => boolean;
  /** 入库成功后的刷新回调 */
  onSuccess?: () => void;
}

/**
 * 批量登记到货（列表页 / 物料详情页 / 订单采购节点弹窗共用一套）。
 *
 * 为什么需要它：单行「登记到货」早已存在，但批量菜单里没有对应入口，
 * 导致「批量领取后必须逐行点开才能继续」的断链（用户反馈的核心问题）。
 *
 * 口径与单行严格一致（见 isBatchArrivalRegistrableRow）：
 *   已领取状态（received/partial/partial_arrival）+ 未回料确认 + 尚未到齐。
 * 提交走 POST /production/material/inbound/batch-confirm-arrival，
 * 后端逐条独立事务，单条失败不影响其余条目。
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

    form.setFieldsValue({
      items: targets.map((r) => ({
        purchaseId: String(r.id || ''),
        arrivedQuantity: Math.max(0.01, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0)),
      })),
    });

    Modal.confirm({
      title: `批量登记到货（${targets.length} 项）`,
      width: '46vw',
      content: (
        <div>
          <p style={{ marginTop: 0 }}>请确认每项本次到货数量，提交后自动生成入库单并更新库存：</p>
          <div className="u-ov-auto" style={{ maxHeight: 320 }}>
            <Form form={form} layout="vertical" preserve={false}>
              {targets.map((r, idx) => (
                <div
                  key={String(r.id || idx)}
                  style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)' }}
                >
                  <div className="u-fs-13" style={{ color: 'var(--color-text-primary)' }}>
                    {r.materialName || r.materialCode}{r.color ? ` · ${r.color}` : ''}
                  </div>
                  <div className="u-fs-12 u-mb-4" style={{ color: 'var(--color-text-secondary)' }}>
                    采购 {Number(r.purchaseQuantity || 0)}{r.unit || ''} · 已到 {Number(r.arrivedQuantity || 0)}{r.unit || ''}
                  </div>
                  <Form.Item name={['items', idx, 'purchaseId']} hidden style={{ margin: 0 }}>
                    <Input />
                  </Form.Item>
                  <Form.Item
                    name={['items', idx, 'arrivedQuantity']}
                    style={{ margin: 0 }}
                    rules={[
                      { required: true, message: '请输入本次到货数量' },
                      {
                        validator: async (_, v) => {
                          const n = Number(v);
                          if (!Number.isFinite(n)) throw new Error('请输入数字');
                          if (n <= 0) throw new Error('到货数量必须大于0');
                          const remain = Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0);
                          if (remain > 0 && n > remain) throw new Error(`不能超过待收数量 ${remain}`);
                        },
                      },
                    ]}
                  >
                    <InputNumber
                      min={0.01}
                      step={0.01}
                      precision={2}
                      style={{ width: 200 }}
                      addonAfter={r.unit || undefined}
                    />
                  </Form.Item>
                </div>
              ))}
            </Form>
          </div>
        </div>
      ),
      okText: '确认入库',
      cancelText: '取消',
      onOk: async () => {
        try {
          const values = await form.validateFields();
          const items = (values.items || [])
            .map((it: any) => ({
              purchaseId: String(it?.purchaseId || '').trim(),
              arrivedQuantity: Number(it?.arrivedQuantity),
            }))
            .filter((it: any) => it.purchaseId && Number.isFinite(it.arrivedQuantity));
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
            operatorId: String(user?.id || ''),
            operatorName: String(user?.name || user?.username || ''),
          });
          if (res.code === 200) {
            const { successCount = 0, failCount = 0, errors = [] } = res.data || {};
            if (failCount > 0) {
              message.warning(`登记到货完成：成功 ${successCount} 项，失败 ${failCount} 项（${errors[0] || ''}）`);
            } else {
              message.success(`已登记到货 ${successCount} 项，库存已更新`);
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
