import { useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';

export const useTemplateActions = (onRefresh: (opts?: { page?: number }) => void) => {
  const { message } = App.useApp();

  const [rollbackTarget, setRollbackTarget] = useState<TemplateLibrary | null>(null);
  const [rollbackLoading, setRollbackLoading] = useState(false);
  const [pendingDeleteTemplate, setPendingDeleteTemplate] = useState<TemplateLibrary | null>(null);
  const [deleteTemplateLoading, setDeleteTemplateLoading] = useState(false);

  const handleRollback = (row: TemplateLibrary, isAdminUser: boolean, isFactoryUser: boolean) => {
    if (!row?.id) return;
    if (!isAdminUser && !isFactoryUser) {
      message.error('仅管理员可退回修改');
      return;
    }
    setRollbackTarget(row);
  };

  const handleRollbackConfirm = async (reason: string) => {
    if (!rollbackTarget?.id) return;
    setRollbackLoading(true);
    try {
      const res = await api.post<{ code: number; message: string }>(`/template-library/${rollbackTarget.id}/rollback`, { reason });
      if (res.code !== 200) {
        message.error(res.message || '退回失败');
        return;
      }
      message.success('已退回，可修改');
      setRollbackTarget(null);
      onRefresh({ page: 1 });
    } finally {
      setRollbackLoading(false);
    }
  };

  const handleDelete = (row: TemplateLibrary) => {
    if (!row?.id) return;
    setPendingDeleteTemplate(row);
  };

  const handleDeleteConfirm = async (reason: string) => {
    if (!pendingDeleteTemplate?.id) return;
    setDeleteTemplateLoading(true);
    try {
      const res = await api.delete<{ code: number; message: string }>(`/template-library/${pendingDeleteTemplate.id}`, {
        params: { reason },
      });
      if (res.code !== 200) {
        message.error(res.message || '删除失败');
        return;
      }
      message.success('已删除');
      setPendingDeleteTemplate(null);
      onRefresh({ page: 1 });
    } catch (e: unknown) {
      const msg = e instanceof Error
        ? e.message
        : (typeof e === 'object' && e !== null && 'message' in e ? String((e as { message?: unknown }).message || '') : '');
      message.error(msg || '删除失败');
    } finally {
      setDeleteTemplateLoading(false);
    }
  };

  return {
    rollbackTarget,
    rollbackLoading,
    pendingDeleteTemplate,
    deleteTemplateLoading,
    handleRollback,
    handleRollbackConfirm,
    handleDelete,
    handleDeleteConfirm,
    setRollbackTarget,
    setPendingDeleteTemplate,
  };
};
