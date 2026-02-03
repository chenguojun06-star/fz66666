/**
 * useOrderActions Hook
 * 管理生产订单的增删改查操作
 */
import { App } from 'antd';
import { productionOrderApi } from '@/services/production/productionApi';
import api, { isApiSuccess, isOrderFrozenByStatus } from '@/utils/api';
import { ProductionOrder } from '@/types/production';

const safeString = (value: any, defaultValue: string = '-') => {
  const str = String(value || '').trim();
  return str || defaultValue;
};

export const useOrderActions = (onSuccess?: () => void) => {
  const { message, modal } = App.useApp();

  // 快速编辑保存
  const handleQuickEditSave = async (
    orderId: string | undefined,
    values: { remarks: string; expectedShipDate: string | null }
  ) => {
    try {
      await productionOrderApi.quickEdit({
        id: orderId,
        ...values,
      });
      message.success('保存成功');
      onSuccess?.();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '保存失败');
      throw error;
    }
  };

  // 计算关单最小数量
  const getCloseMinRequired = (cuttingQuantity: number) => {
    const cq = Number(cuttingQuantity ?? 0);
    if (!Number.isFinite(cq) || cq <= 0) return 0;
    return Math.ceil(cq * 0.9);
  };

  // 关单
  const handleCloseOrder = (order: ProductionOrder) => {
    const orderId = safeString((order as Record<string, unknown>)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as Record<string, unknown>)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as Record<string, unknown>)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as Record<string, unknown>)?.warehousingQualifiedQuantity ?? 0) || 0;

    if ((order as Record<string, unknown>)?.status === 'completed') {
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

    modal.confirm({
      title: `确认关单：${safeString((order as Record<string, unknown>)?.orderNo)}`,
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
        </div>
      ),
      onOk: async () => {
        const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
          '/production/order/close',
          { id: orderId, sourceModule: 'myOrders' }
        );
        if (!isApiSuccess(result)) {
          const msg = typeof result === 'object' && result !== null && 'message' in result
            ? String(result.message) || '关单失败'
            : '关单失败';
          throw new Error(msg);
        }
        message.success('关单成功');
        onSuccess?.();
      },
    });
  };

  // 报废订单
  const handleScrapOrder = (order: ProductionOrder, isSupervisorOrAbove: boolean) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限报废');
      return;
    }

    const orderId = safeString((order as Record<string, unknown>)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法报废');
      return;
    }

    if (isOrderFrozenByStatus(order)) {
      message.error('订单已完成，无法报废');
      return;
    }

    let remark = '';
    modal.confirm({
      title: `确认报废：${safeString((order as Record<string, unknown>)?.orderNo)}`,
      okText: '确认报废',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>报废原因</div>
          <textarea
            placeholder="请输入报废原因"
            style={{ width: '100%', minHeight: 80, padding: 8, fontSize: "var(--font-size-base)" }}
            maxLength={200}
            onChange={(e) => {
              remark = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      onOk: async () => {
        const opRemark = String(remark || '').trim();
        if (!opRemark) {
          message.error('请输入报废原因');
          return Promise.reject(new Error('请输入报废原因'));
        }

        const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
          '/production/order/scrap',
          { id: orderId, remark: opRemark }
        );

        if (!isApiSuccess(result)) {
          const msg = typeof result === 'object' && result !== null && 'message' in result
            ? String(result.message) || '报废失败'
            : '报废失败';
          throw new Error(msg);
        }

        message.success('报废成功');
        onSuccess?.();
      },
    });
  };

  return {
    handleQuickEditSave,
    handleCloseOrder,
    handleScrapOrder,
  };
};

export default useOrderActions;
