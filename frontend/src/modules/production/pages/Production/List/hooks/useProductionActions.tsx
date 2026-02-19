import { useState } from 'react';
import { Input } from 'antd';
import { ProductionOrder } from '@/types/production';
import api, { isApiSuccess, isOrderFrozenByStatus } from '@/utils/api';
import { productionOrderApi } from '@/services/production/productionApi';
import dayjs from 'dayjs';
import { safeString, getCloseMinRequired, buildOrdersCsv, downloadTextFile } from '../utils';

interface UseProductionActionsOptions {
  message: any;
  modal: any;
  isSupervisorOrAbove: boolean;
  fetchProductionList: () => void;
}

/**
 * 订单操作 Hook
 * 管理关单、报废、快速编辑、备注、CSV 导出等操作
 */
export function useProductionActions({
  message,
  modal,
  isSupervisorOrAbove,
  fetchProductionList,
}: UseProductionActionsOptions) {
  // 快速编辑状态
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 跟单员备注状态
  const [remarkPopoverId, setRemarkPopoverId] = useState<string | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);

  /** 保存跟单员备注 */
  const handleRemarkSave = async (orderId: string) => {
    setRemarkSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: orderId,
        remarks: remarkText.trim(),
      });
      message.success('备注已保存');
      setRemarkPopoverId(null);
      setRemarkText('');
      await fetchProductionList();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '保存失败');
    } finally {
      setRemarkSaving(false);
    }
  };

  /** 快速编辑保存 */
  const handleQuickEditSave = async (
    values: { remarks: string; expectedShipDate: string | null },
    editData: ProductionOrder | null,
    closeModal: () => void,
  ) => {
    setQuickEditSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: editData?.id,
        ...values,
      });
      message.success('保存成功');
      closeModal();
      await fetchProductionList();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '保存失败');
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

    // 使用闭包变量捕获备注（消除 window 全局变量）
    let closeRemark = '';

    modal.confirm({
      title: `确认关单：${safeString((order as any)?.orderNo)}`,
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
        const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
          '/production/order/close',
          { id: orderId, sourceModule: 'myOrders', remark: closeRemark || undefined }
        );
        if (!isApiSuccess(result)) {
          const msg = typeof result === 'object' && result !== null && 'message' in result
            ? String((result as any).message) || '关单失败'
            : '关单失败';
          throw new Error(msg);
        }
        message.success('关单成功');
        fetchProductionList();
      },
    });
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
      message.error('订单已完成，无法报废');
      return;
    }

    let remark = '';
    modal.confirm({
      title: `确认报废：${safeString((order as any)?.orderNo)}`,
      okText: '确认报废',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>报废原因</div>
          <Input.TextArea
            placeholder="请输入报废原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
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
            ? String((result as any).message) || '报废失败'
            : '报废失败';
          throw new Error(msg);
        }
        message.success('报废成功');
        fetchProductionList();
      },
    });
  };

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
    handleScrapOrder,
    exportSelected,
  };
}
