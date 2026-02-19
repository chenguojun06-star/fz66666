import React from 'react';
import { useCallback } from 'react';
import { Input } from 'antd';
import type { ProductionOrder } from '@/types/production';

type UseCloseOrderParams = {
  isSupervisorOrAbove: boolean;
  message: { error: (msg: string) => void; info: (msg: string) => void; warning: (msg: string) => void; success: (msg: string) => void };
  Modal: { confirm: (options: any) => void };
  productionOrderApi: { close: (orderId: string, source: string, remark?: string) => Promise<unknown> };
  fetchOrders: () => Promise<void>;
  fetchOrderDetail: (orderId: string) => Promise<ProductionOrder | null>;
  setActiveOrder: (order: ProductionOrder | null) => void;
  activeOrderId?: string | number | null;
  getCloseMinRequired: (cuttingQuantity: number) => number;
};

export const useCloseOrder = ({
  isSupervisorOrAbove,
  message,
  Modal,
  productionOrderApi,
  fetchOrders,
  fetchOrderDetail,
  setActiveOrder,
  activeOrderId,
  getCloseMinRequired,
}: UseCloseOrderParams) => {
  return useCallback((order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限关单');
      return;
    }

    const orderId = String((order as any)?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as any)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as any)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as any)?.warehousingQualifiedQuantity ?? 0) || 0;

    if ((order as any)?.status === 'completed') {
      message.info('该订单已完成，无需关单');
      return;
    }

    if (minRequired <= 0) {
      message.warning('裁剪数量异常，无法关单');
      return;
    }

    if (warehousingQualified < minRequired) {
      message.warning(`关单条件未满足：合格入库${warehousingQualified}/${minRequired}（裁剪${cuttingQty}，允许差异10%）`);
      return;
    }

    // 使用闭包变量捕获备注
    let closeRemark = '';

    Modal.confirm({
      title: `确认关单：${String((order as any)?.orderNo || '').trim() || '-'}`,
      okText: '确认关单',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div>订单数量：{orderQty}</div>
          <div>关单阈值（裁剪数90%）：{minRequired}</div>
          <div>当前裁剪数：{cuttingQty}</div>
          <div>当前合格入库：{warehousingQualified}</div>
          <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 4, color: '#666' }}>关闭原因（可选，将记录到操作日志）：</div>
            <Input.TextArea
              rows={2}
              placeholder="请输入关闭原因..."
              onChange={(e) => { closeRemark = e.target.value; }}
              style={{ width: '100%' }}
            />
          </div>
        </div>
      ),
      onOk: async () => {
        const result = await productionOrderApi.close(orderId, 'productionProgress', closeRemark || undefined);
        if ((result as any)?.code !== 200) {
          throw new Error((result as any)?.message || '关单失败');
        }
        message.success('关单成功');
        await fetchOrders();
        if (String(activeOrderId || '').trim() === orderId) {
          const detail = await fetchOrderDetail(orderId);
          if (detail) {
            setActiveOrder(detail);
          }
        }
      },
    });
  }, [
    isSupervisorOrAbove,
    message,
    Modal,
    productionOrderApi,
    fetchOrders,
    fetchOrderDetail,
    setActiveOrder,
    activeOrderId,
    getCloseMinRequired,
  ]);
};
