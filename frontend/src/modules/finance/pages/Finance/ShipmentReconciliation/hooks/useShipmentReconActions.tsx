import React, { useState } from 'react';
import { message, Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { ShipmentReconciliation } from '@/types/finance';
import shipmentReconciliationApi from '@/services/finance/shipmentReconciliationApi';
import { shipmentReconStatusTransitions } from './useShipmentReconColumns';
import { isSupervisorOrAboveUser } from '@/utils/AuthContext';

export const useShipmentReconActions = (
  fetchList: () => void,
  user: any,
) => {
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const canPerformAction = (action: string) => {
    const permissions = user?.permissions || [];
    if (isSupervisorOrAboveUser(user)) return true;
    switch (action) {
      case 'approve': return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      case 'reject': return isSupervisorOrAboveUser(user);
      case 'return': return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      default: return true;
    }
  };

  /** 单条状态变更 */
  const handleStatusUpdate = async (record: ShipmentReconciliation, newStatus: string) => {
    const id = String(record.id || '').trim();
    if (!id) return;
    const currentStatus = String(record.status || '').trim();
    const allowed = shipmentReconStatusTransitions[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      message.error(`不允许从「${currentStatus}」变更为「${newStatus}」`);
      return;
    }
    setActionSubmitting(true);
    try {
      const res = await shipmentReconciliationApi.updateStatus(id, newStatus);
      if ((res as any)?.code === 200) {
        message.success('状态更新成功');
        fetchList();
      } else {
        message.error((res as any)?.message || '状态更新失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '状态更新失败');
    } finally {
      setActionSubmitting(false);
    }
  };

  /** 批量状态变更（前端循环调用单条API） */
  const handleBatchStatusUpdate = async (
    records: ShipmentReconciliation[],
    newStatus: string,
    successText: string,
  ) => {
    if (!records.length) return;
    setActionSubmitting(true);
    try {
      const settled = await Promise.allSettled(
        records.map((r) => shipmentReconciliationApi.updateStatus(String(r.id), newStatus)),
      );
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as any)?.code === 200).length;
      const failed = records.length - okCount;
      if (okCount <= 0) { message.error('操作失败：所有记录状态更新均未成功'); return; }
      message.success(`${successText}：${okCount} 条成功${failed > 0 ? `，${failed} 条失败` : ''}`);
      fetchList();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActionSubmitting(false);
    }
  };

  /** 退回上一步 */
  const handleReturn = (record: ShipmentReconciliation) => {
    const id = String(record.id || '').trim();
    if (!id) return;
    Modal.confirm({
      width: '30vw',
      title: '确认退回上一步？',
      icon: <ExclamationCircleOutlined />,
      content: `对账单号：${record.reconciliationNo}`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        setActionSubmitting(true);
        try {
          const res = await shipmentReconciliationApi.returnToPrevious(id);
          if ((res as any)?.code === 200) {
            message.success('退回成功');
            fetchList();
          } else {
            message.error((res as any)?.message || '退回失败');
          }
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '退回失败');
        } finally {
          setActionSubmitting(false);
        }
      },
    });
  };

  /** 删除 */
  const handleDelete = (record: ShipmentReconciliation) => {
    const id = String(record.id || '').trim();
    if (!id) return;
    Modal.confirm({
      width: '30vw',
      title: '确认删除该对账记录？',
      icon: <ExclamationCircleOutlined />,
      content: `对账单号：${record.reconciliationNo}`,
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setActionSubmitting(true);
        try {
          const res = await shipmentReconciliationApi.deleteById(id);
          if ((res as any)?.code === 200) {
            message.success('删除成功');
            fetchList();
          } else {
            message.error((res as any)?.message || '删除失败');
          }
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '删除失败');
        } finally {
          setActionSubmitting(false);
        }
      },
    });
  };

  /** 回填对账数据 */
  const handleBackfill = () => {
    Modal.confirm({
      width: '30vw',
      title: '确认回填对账数据？',
      icon: <ExclamationCircleOutlined />,
      content: '将根据已出库订单自动生成对账记录，已有记录不会覆盖。',
      okText: '确认回填',
      cancelText: '取消',
      onOk: async () => {
        setActionSubmitting(true);
        try {
          const res = await shipmentReconciliationApi.backfill();
          if ((res as any)?.code === 200) {
            message.success('回填成功');
            fetchList();
          } else {
            message.error((res as any)?.message || '回填失败');
          }
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '回填失败');
        } finally {
          setActionSubmitting(false);
        }
      },
    });
  };

  return {
    actionSubmitting,
    canPerformAction,
    handleStatusUpdate,
    handleBatchStatusUpdate,
    handleReturn,
    handleDelete,
    handleBackfill,
  };
};
