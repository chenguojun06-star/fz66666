import { useState, useEffect, useCallback, useRef } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import type { ProductSku } from '@/types/style';
import type { SkuMode, EditingData, StyleSkuTabProps } from './types';
import { nextTempId, getRowKey, buildAddMenuItems } from './helpers';
import { confirmAction } from '@/utils/confirm';
import type { MenuProps } from 'antd';

export const useStyleSkuTabData = ({
  styleId,
  styleNo,
  skc: initialSkc,
  skuMode: initialMode,
  useSkuPrefix: initialUseSkuPrefix,
  onModeChange,
  onRefresh,
  refreshTrigger = 0,
}: StyleSkuTabProps) => {
  const { message } = App.useApp();
  const messageRef = useRef(message);
  messageRef.current = message;

  const [skuMode, setSkuMode] = useState<SkuMode>(initialMode || 'AUTO');
  const [skcValue, setSkcValue] = useState(initialSkc || '');
  const [useSkuPrefix, setUseSkuPrefix] = useState(initialUseSkuPrefix ? Boolean(initialUseSkuPrefix) : false);
  const [skus, setSkus] = useState<ProductSku[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingData, setEditingData] = useState<EditingData>({});
  const [deletedIds, setDeletedIds] = useState<number[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [skcEditing, setSkcEditing] = useState(false);
  const [skcSaving, setSkcSaving] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackForm] = Form.useForm();
  const [colorImageMode, setColorImageMode] = useState(false);

  const fetchSkus = useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: ProductSku[] }>('/style/sku/search', { styleId });
      if (res.code === 200 && res.data) {
        setSkus(res.data);
        setEditingData({});
        setDeletedIds([]);
        setHasChanges(false);
        setIsEditing(false);
        setSkcEditing(false);
      }
    } catch {
      messageRef.current.error('获取SKU列表失败');
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  useEffect(() => { fetchSkus(); }, [fetchSkus]);
  useEffect(() => { if (refreshTrigger > 0) fetchSkus(); }, [refreshTrigger, fetchSkus]);
  useEffect(() => { if (initialMode) setSkuMode(initialMode); }, [initialMode]);
  useEffect(() => { if (initialSkc) setSkcValue(initialSkc); }, [initialSkc]);
  useEffect(() => { if (initialUseSkuPrefix !== undefined) setUseSkuPrefix(Boolean(initialUseSkuPrefix)); }, [initialUseSkuPrefix]);

  const handleUseSkuPrefixChange = async (checked: boolean) => {
    try {
      setUseSkuPrefix(checked);
      const res = await api.put(`/style/info/${styleId}/use-sku-prefix`, { useSkuPrefix: checked ? 1 : 0 });
      if (res.code === 200) {
        messageRef.current.success('操作成功');
        void fetchSkus();
        onRefresh?.();
      } else {
        messageRef.current.error(res.message || '操作失败');
      }
    } catch {
      messageRef.current.error('操作失败');
    }
  };

  const doToggleMode = async (newMode: SkuMode) => {
    try {
      const res = await api.put(`/style/sku/mode/${styleId}`, { skuMode: newMode });
      if (res.code === 200) {
        setSkuMode(newMode);
        onModeChange?.(newMode);
        messageRef.current.success(`已切换为${newMode === 'AUTO' ? '自动生成' : '手动编辑'}模式`);
        if (newMode === 'AUTO') fetchSkus();
      } else {
        messageRef.current.error(res.message || '切换模式失败');
      }
    } catch {
      messageRef.current.error('切换模式失败');
    }
  };

  const handleModeToggle = async (checked: boolean) => {
    const newMode = checked ? 'MANUAL' : 'AUTO';
    if (newMode === 'AUTO') {
      confirmAction('确认切换为自动生成模式？', '切换后，所有手动编辑的SKU编码将被重置为自动生成的编码，此操作不可撤销。', () => doToggleMode(newMode), { okText: '确认切换' });
    } else {
      doToggleMode(newMode);
    }
  };

  const handleFieldChange = (rowKey: number | string, field: string, value: any) => {
    setEditingData(prev => ({ ...prev, [rowKey]: { ...prev[rowKey], [field]: value } }));
    setHasChanges(true);
  };

  const handleSaveSkc = async () => {
    if (!skcValue || !skcValue.trim()) {
      messageRef.current.error('SKC不能为空');
      return;
    }
    setSkcSaving(true);
    try {
      const res = await api.put(`/style/sku/skc/${styleId}`, { skc: skcValue.trim() });
      if (res.code === 200) {
        messageRef.current.success('SKC修改成功，已同步到关联的生产订单');
        setSkcEditing(false);
        onRefresh?.();
      } else {
        messageRef.current.error(res.message || 'SKC修改失败');
      }
    } catch {
      messageRef.current.error('SKC修改失败');
    } finally {
      setSkcSaving(false);
    }
  };

  const handleSave = async () => {
    if (!hasChanges && deletedIds.length === 0) {
      messageRef.current.info('没有需要保存的修改');
      return;
    }
    setSaving(true);
    try {
      const updatedSkus = skus.map(sku => {
        const key = sku.id ?? (sku as any)._tempKey;
        const merged = { ...sku, ...(editingData[key] || {}) };
        const { _tempKey, ...rest } = merged as any;
        return rest;
      });
      const res = await api.put(`/style/sku/batch/${styleId}`, {
        skuList: updatedSkus,
        deletedIds: deletedIds.length > 0 ? deletedIds : undefined,
      });
      if (res.code === 200) {
        messageRef.current.success('保存成功');
        setEditingData({});
        setDeletedIds([]);
        setHasChanges(false);
        setIsEditing(false);
        fetchSkus();
        onRefresh?.();
      } else {
        messageRef.current.error(res.message || '保存失败');
      }
    } catch {
      messageRef.current.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncToProduction = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/style/sku/sync-to-production/${styleId}`);
      if (res.code === 200) {
        messageRef.current.success('SKU已同步到大货订单');
        fetchSkus();
      } else {
        messageRef.current.error(res.message || '同步失败');
      }
    } catch {
      messageRef.current.error('同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const addRows = (count: number, autoGenerate: boolean = true) => {
    const newSkus: (ProductSku & { _tempKey: number })[] = [];
    for (let i = 0; i < count; i++) {
      newSkus.push({
        skuCode: autoGenerate ? (useSkuPrefix ? `SKU${styleNo}` : styleNo) : '',
        color: '',
        size: '',
        status: 'ENABLED',
        skuMode,
        manuallyEdited: skuMode === 'MANUAL' ? 1 : 0,
        _tempKey: nextTempId(),
      } as any);
    }
    setSkus(prev => [...prev, ...newSkus]);
    setHasChanges(true);
    if (count > 1) messageRef.current.success(`已添加${count}行`);
  };

  const addMenuItems: MenuProps['items'] = buildAddMenuItems(addRows);

  const handleDeleteRow = (rowKey: number | string) => {
    const skuToDelete = skus.find(s => (s.id ?? (s as any)._tempKey) === rowKey);
    if (skuToDelete?.id) setDeletedIds(prev => [...prev, skuToDelete.id!]);
    setSkus(prev => prev.filter(s => (s.id ?? (s as any)._tempKey) !== rowKey));
    setEditingData(prev => { const next = { ...prev }; delete next[rowKey]; return next; });
    setHasChanges(true);
  };

  const handleCancelEdit = () => {
    setRollbackOpen(true);
  };

  const handleRollbackOk = async (values: { remark: string }) => {
    const remark = (values.remark || '').trim();
    if (remark) {
      try {
        await api.put(`/style/sku/rollback-remark/${styleId}`, { remark });
      } catch {
        messageRef.current.warning('退回备注保存失败，但编辑已退回');
      }
    }
    setIsEditing(false);
    setEditingData({});
    setDeletedIds([]);
    setHasChanges(false);
    setRollbackOpen(false);
    rollbackForm.resetFields();
    fetchSkus();
  };

  const getCellValue = (sku: ProductSku, field: string) => {
    const key = sku.id ?? (sku as any)._tempKey;
    if (editingData[key] && field in editingData[key]) return (editingData[key] as any)[field];
    return (sku as any)[field];
  };

  const isManual = skuMode === 'MANUAL';
  const canEdit = isEditing && isManual;

  return {
    // state
    styleId,
    styleNo,
    skuMode,
    skcValue,
    useSkuPrefix,
    skus,
    loading,
    saving,
    syncing,
    editingData,
    deletedIds,
    hasChanges,
    isEditing,
    skcEditing,
    skcSaving,
    rollbackOpen,
    rollbackForm,
    colorImageMode,
    initialSkc,
    // derived
    isManual,
    canEdit,
    addMenuItems,
    // setters
    setSkcValue,
    setSkcEditing,
    setIsEditing,
    setRollbackOpen,
    setColorImageMode,
    // handlers
    fetchSkus,
    handleModeToggle,
    handleUseSkuPrefixChange,
    handleSaveSkc,
    handleSave,
    handleSyncToProduction,
    handleDeleteRow,
    handleCancelEdit,
    handleRollbackOk,
    handleFieldChange,
    getCellValue,
    getRowKey,
    onRefresh,
  };
};

export type UseStyleSkuTabDataReturn = ReturnType<typeof useStyleSkuTabData>;
