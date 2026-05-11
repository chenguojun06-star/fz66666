import React from 'react';
import { useState } from 'react';
import { message, Modal } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import type { MaterialReconType } from '@/types/finance';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import { getMaterialReconStatusConfig, materialReconStatusTransitions } from '@/constants/finance';
import { isSupervisorOrAboveUser } from '@/utils/AuthContext';

export const useMaterialReconActions = (
  reconciliationList: MaterialReconType[],
  selectedRowKeys: React.Key[],
  fetchList: () => void,
  user: any,
) => {
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [pendingRejectIds, setPendingRejectIds] = useState<string[] | null>(null);
  const [rejectIdsLoading, setRejectIdsLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const statusTransitions = materialReconStatusTransitions;

  const canPerformAction = (action: string) => {
    const permissions = user?.permissions || [];
    if (isSupervisorOrAboveUser(user)) return true;
    switch (action) {
      case 'approve': return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      case 'reject': return isSupervisorOrAboveUser(user);
      case 'pay': return permissions.includes('FINANCE_RECON_AUDIT') || permissions.includes('all');
      default: return true;
    }
  };

  const updateStatusBatch = async (pairs: Array<{ id: string; status: string }>, successText: string) => {
    const normalized = pairs.map((p) => ({ id: String(p.id || '').trim(), status: String(p.status || '').trim() })).filter((p) => p.id && p.status);
    if (!normalized.length) return;
    const invalidTransitions = normalized.filter(p => {
      const record = reconciliationList.find(r => String(r.id) === p.id);
      if (!record) return true;
      const currentStatus = String(record.status || '').trim();
      const allowedTargets = statusTransitions[currentStatus] || [];
      return !allowedTargets.includes(p.status);
    });
    if (invalidTransitions.length) { message.error('存在不允许的状态转换，请检查后重试'); return; }
    setApprovalSubmitting(true);
    try {
      const settled = await Promise.allSettled(normalized.map((p) => materialReconciliationApi.updateMaterialReconciliationStatus(p.id, p.status)));
      const okCount = settled.filter((r) => r.status === 'fulfilled' && (r.value as any)?.code === 200).length;
      const _failedIds = settled
        .map((r, i) => r.status === 'rejected' ? normalized[i].id : null)
        .filter((id): id is string => id != null);
      const failed = normalized.length - okCount;
      if (okCount <= 0) { message.error('操作失败：所有记录状态更新均未成功'); return; }
      message.success(`${successText}：${okCount} 条成功${failed > 0 ? `，${failed} 条失败` : ''}`);
      fetchList();
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '操作失败'); }
    finally { setApprovalSubmitting(false); }
  };

  const batchApprove = async () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'pending' || r.status === 'verified');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量审批状态为"待核实/已核实"的对账单');
    await updateStatusBatch(eligible.map((r) => ({ id: String(r.id || ''), status: 'approved' })), '审批成功');
  };

  const batchReject = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String(r.id)));
    const eligible = picked.filter((r) => r.status === 'pending' || r.status === 'verified' || r.status === 'approved');
    if (!eligible.length) return;
    if (eligible.length !== picked.length) message.warning('仅可批量驳回状态为"待核实/已核实/已审批"的对账单');
    openRejectModal(eligible.map((r) => String(r.id || '')));
  };

  const openRejectModal = (ids: string[]) => setPendingRejectIds(ids);

  const handleRejectConfirm = async (_reason: string) => {
    if (!pendingRejectIds?.length) return;
    setRejectIdsLoading(true);
    try {
      const pairs = pendingRejectIds.map((id) => ({ id, status: 'rejected' }));
      await updateStatusBatch(pairs, '驳回成功');
      setPendingRejectIds(null);
    } finally { setRejectIdsLoading(false); }
  };

  const handleSingleStatusUpdate = (record: MaterialReconType, newStatus: string) => {
    const cfg = getMaterialReconStatusConfig(newStatus);
    const label = cfg?.text || newStatus;
    Modal.confirm({
      width: '30vw', title: `确认将此对账单状态改为「${label}」？`, icon: <ExclamationCircleOutlined />,
      content: `对账单号：${record.reconciliationNo}`,
      okText: '确认', cancelText: '取消',
      onOk: () => updateStatusBatch([{ id: String(record.id), status: newStatus }], `状态已更新为「${label}」`),
    });
  };

  return {
    approvalSubmitting, pendingRejectIds, rejectIdsLoading, submitLoading,
    canPerformAction, updateStatusBatch, batchApprove, batchReject,
    openRejectModal, handleRejectConfirm, handleSingleStatusUpdate, setSubmitLoading,
  };
};
