import React from 'react';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import { safeString } from '../../utils';

interface OrderConfirmModalsProps {
  pendingCloseOrder: any;
  closeOrderLoading: boolean;
  confirmCloseOrder: (reason: string) => void;
  cancelCloseOrder: () => void;
  pendingScrapOrder: any;
  scrapOrderLoading: boolean;
  confirmScrapOrder: (reason: string) => void;
  cancelScrapOrder: () => void;
}

const OrderConfirmModals: React.FC<OrderConfirmModalsProps> = ({
  pendingCloseOrder,
  closeOrderLoading,
  confirmCloseOrder,
  cancelCloseOrder,
  pendingScrapOrder,
  scrapOrderLoading,
  confirmScrapOrder,
  cancelScrapOrder,
}) => {
  return (
    <>
      <RejectReasonModal
        open={!!pendingCloseOrder}
        title={pendingCloseOrder?.isSpecial ? '特需关单确认' : `确认关单：${safeString((pendingCloseOrder?.order as any)?.orderNo)}`}
        description={pendingCloseOrder ? (
          <div>
            {pendingCloseOrder.isSpecial && (
              <div style={{ color: 'var(--color-warning)', marginBottom: 8 }}>
                ⚠️ 该订单未满足关单条件（合格入库 {pendingCloseOrder.warehousingQualified}/{pendingCloseOrder.minRequired}），特需关单不可撤销，请填写原因。
              </div>
            )}
            <div>订单数量：{pendingCloseOrder.orderQty}</div>
            <div>关单阈值（裁剪数90%）：{pendingCloseOrder.minRequired}</div>
            <div>当前裁剪数：{pendingCloseOrder.cuttingQty}</div>
            <div>当前合格入库：{pendingCloseOrder.warehousingQualified}</div>
            <div style={{ marginTop: 8 }}>关单后订单状态将变为"已完成"，并自动生成对账记录。</div>
          </div>
        ) : null}
        fieldLabel={pendingCloseOrder?.isSpecial ? '特需原因' : '关闭原因'}
        placeholder={pendingCloseOrder?.isSpecial ? '请说明特需关单具体原因（必填）' : undefined}
        required={!!pendingCloseOrder?.isSpecial}
        okDanger={false}
        okText={pendingCloseOrder?.isSpecial ? '确认特需关单' : '确认关单'}
        loading={closeOrderLoading}
        onOk={confirmCloseOrder}
        onCancel={cancelCloseOrder}
      />
      <RejectReasonModal
        open={!!pendingScrapOrder}
        title={`确认报废：${safeString((pendingScrapOrder as any)?.orderNo)}`}
        fieldLabel="报废原因"
        required
        okDanger
        okText="确认报废"
        loading={scrapOrderLoading}
        onOk={confirmScrapOrder}
        onCancel={cancelScrapOrder}
      />
    </>
  );
};

export default OrderConfirmModals;
