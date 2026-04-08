import { useState, useCallback } from 'react';
import { App, Form } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';
import type { OrganizationUnit } from '@/types/system';

export type DialogMode = 'create' | 'edit';

export function useOrganizationModals(
  loadData: () => Promise<void>,
) {
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('create');
  const [currentRecord, setCurrentRecord] = useState<OrganizationUnit | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const openCreate = useCallback((parent?: OrganizationUnit) => {
    setDialogMode('create');
    setCurrentRecord(parent || null);
    form.setFieldsValue({
      unitName: '',
      parentId: parent?.id ? String(parent.id) : undefined,
      ownerType: parent?.ownerType || 'NONE',
      sortOrder: 0,
    });
    setDialogOpen(true);
  }, [form]);

  const openEdit = useCallback((record: OrganizationUnit) => {
    setDialogMode('edit');
    setCurrentRecord(record);
    form.setFieldsValue({
      id: record.id ? String(record.id) : undefined,
      unitName: record.unitName,
      parentId: record.parentId ? String(record.parentId) : undefined,
      ownerType: record.ownerType || 'NONE',
      sortOrder: record.sortOrder || 0,
    });
    setDialogOpen(true);
  }, [form]);

  const closeDialog = useCallback(() => {
    setDialogOpen(false);
    setCurrentRecord(null);
    form.resetFields();
  }, [form]);

  const handleSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const payload = { ...values, nodeType: 'DEPARTMENT', status: 'active' };
      if (dialogMode === 'edit') {
        await organizationApi.update(payload);
      } else {
        await organizationApi.create(payload);
      }
      message.success(dialogMode === 'edit' ? '部门更新成功' : '部门创建成功');
      closeDialog();
      await loadData();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) return; // Form validation failed
      message.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSubmitLoading(false);
    }
  }, [form, dialogMode, loadData, message, closeDialog]);

  return {
    form,
    dialogOpen,
    dialogMode,
    currentRecord,
    submitLoading,
    openCreate,
    openEdit,
    closeDialog,
    handleSubmit,
  };
}
