import { useState, useEffect, useCallback } from 'react';
import { App, Form } from 'antd';
import api, { toNumberSafe, isApiSuccess } from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';

export const NEW_ROW_KEY = '__new__';

export const getCurrentDateTimeText = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
};

export interface SecondaryProcess {
  id?: number | string;
  styleId?: number | string;
  processType?: string;
  processName?: string;
  description?: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
  factoryName?: string;
  factoryId?: string;
  factoryContactPerson?: string;
  factoryContactPhone?: string;
  assignee?: string;
  completedTime?: string;
  status?: string;
  createdAt?: string;
  remark?: string;
  images?: string;
  attachments?: string;
}

export const statusOptions = [
  { value: 'pending', label: '待处理', color: 'default' },
  { value: 'processing', label: '处理中', color: 'processing' },
  { value: 'completed', label: '已完成', color: 'success' },
  { value: 'cancelled', label: '已取消', color: 'error' },
];

export function useSecondaryProcessActions(
  styleId: number | string,
  styleNo?: string,
  readOnly?: boolean,
  secondaryAssignee?: string,
  secondaryStartTime?: string,
  secondaryCompletedTime?: string,
  sampleQuantity?: number,
  onRefresh?: () => void,
) {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [dataSource, setDataSource] = useState<SecondaryProcess[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingExtraValues, setEditingExtraValues] = useState<Record<string, any>>({});
  const [form] = Form.useForm();
  const currentOperatorName = String(user?.name || user?.username || secondaryAssignee || '').trim();

  const isEditing = useCallback((record: SecondaryProcess) => String(record.id) === editingKey, [editingKey]);

  const notStarted = !secondaryStartTime && !secondaryCompletedTime;

  const fetchData = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.get(`/style/secondary-process/list?styleId=${styleId}`, {
        validateStatus: (status: number) => status < 500,
      });
      if (res && isApiSuccess(res)) {
        setDataSource((res?.data ?? []) as SecondaryProcess[]);
      } else {
        setDataSource([]);
      }
    } catch {
      setDataSource([]);
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSkipSecondary = useCallback(async () => {
    if (notStarted) {
      message.warning('请先点击「开始二次工艺」按钮后再进行操作');
      return;
    }
    try {
      await api.post(`/style/info/${styleId}/stage-action?stage=secondary&action=skip`);
      message.success('已标记为无二次工艺');
      onRefresh?.();
    } catch {
      message.error('操作失败');
    }
  }, [notStarted, styleId, message, onRefresh]);

  const handleAdd = useCallback(() => {
    if (editingKey) {
      message.warning('请先保存或取消当前编辑');
      return;
    }
    const newRow: SecondaryProcess = {
      id: NEW_ROW_KEY,
      processType: '二次工艺',
      status: 'pending',
      quantity: sampleQuantity || 0,
    };
    setDataSource(prev => [newRow, ...prev]);
    setEditingKey(NEW_ROW_KEY);
    form.setFieldsValue({
      processType: '二次工艺',
      status: 'pending',
      quantity: sampleQuantity || 0,
      processName: undefined,
      description: undefined,
      unitPrice: undefined,
      totalPrice: undefined,
      factoryName: undefined,
      remark: undefined,
    });
    setEditingExtraValues({
      factoryId: undefined,
      factoryContactPerson: undefined,
      factoryContactPhone: undefined,
      assignee: currentOperatorName || undefined,
      completedTime: undefined,
      pendingImages: [],
      pendingAttachments: [],
    });
  }, [editingKey, sampleQuantity, form, currentOperatorName, message]);

  const handleEdit = useCallback((record: SecondaryProcess) => {
    if (editingKey) {
      message.warning('请先保存或取消当前编辑');
      return;
    }
    setEditingKey(String(record.id));
    form.setFieldsValue({
      processType: record.processType || '二次工艺',
      processName: record.processName,
      description: record.description,
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      totalPrice: record.quantity && record.unitPrice
        ? toNumberSafe(record.quantity) * toNumberSafe(record.unitPrice)
        : 0,
      factoryName: record.factoryName,
      status: record.status || 'pending',
      remark: record.remark,
    });
    setEditingExtraValues({
      factoryId: record.factoryId,
      factoryContactPerson: record.factoryContactPerson,
      factoryContactPhone: record.factoryContactPhone,
      assignee: record.assignee || currentOperatorName,
      completedTime: record.completedTime,
    });
  }, [editingKey, form, currentOperatorName, message]);

  const handleCancel = useCallback(() => {
    if (editingKey === NEW_ROW_KEY) {
      setDataSource(prev => prev.filter(r => String(r.id) !== NEW_ROW_KEY));
    }
    setEditingKey(null);
    form.resetFields();
  }, [editingKey, form]);

  const handleDelete = useCallback((record: SecondaryProcess) => {
    modal.confirm({
      width: '30vw',
      title: '确认删除',
      content: `确定要删除工艺"${record.processName}"吗？`,
      onOk: async () => {
        try {
          await api.delete(`/style/secondary-process/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (error: unknown) {
          message.error(error instanceof Error ? error.message : '删除失败，请重试');
        }
      }
    });
  }, [modal, message, fetchData]);

  const handleSave = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const normalizedStatus = String(values.status || 'pending').trim().toLowerCase();
      const assignee = String(editingExtraValues.assignee || currentOperatorName || '').trim() || undefined;
      const completedTime = normalizedStatus === 'completed'
        ? String(editingExtraValues.completedTime || '').trim() || getCurrentDateTimeText()
        : null;
      const data = {
        ...values,
        ...editingExtraValues,
        styleId,
        assignee,
        completedTime,
      };

      if (editingKey && editingKey !== NEW_ROW_KEY) {
        await api.put(`/style/secondary-process/${editingKey}`, data);
        message.success('更新成功');
      } else {
        const { pendingImages, pendingAttachments, ...restData } = data as any;
        const postData = {
          ...restData,
          processType: restData.processType || form.getFieldValue('processType') || '二次工艺',
          images: JSON.stringify(pendingImages || []),
          attachments: JSON.stringify(pendingAttachments || []),
        };
        await api.post('/style/secondary-process', postData);
        message.success('新建成功');
      }

      setEditingKey(null);
      fetchData();
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error('请检查表单输入');
      } else {
        message.error(error instanceof Error ? error.message : '保存失败，请重试');
      }
    }
  }, [form, editingExtraValues, currentOperatorName, styleId, editingKey, message, fetchData]);

  const calculateTotalPrice = useCallback(() => {
    const quantity = form.getFieldValue('quantity') || 0;
    const unitPrice = form.getFieldValue('unitPrice') || 0;
    const total = toNumberSafe(quantity) * toNumberSafe(unitPrice);
    form.setFieldValue('totalPrice', Number(total.toFixed(2)));
  }, [form]);

  return {
    dataSource, loading, editingKey, editingExtraValues, setEditingExtraValues,
    form, isEditing, notStarted, statusOptions,
    fetchData, handleSkipSecondary, handleAdd, handleEdit, handleCancel,
    handleDelete, handleSave, calculateTotalPrice,
  };
}
