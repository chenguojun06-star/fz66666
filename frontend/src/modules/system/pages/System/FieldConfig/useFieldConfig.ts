import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Form, message } from 'antd';
import { fieldConfigApi, BIZ_TYPE_OPTIONS } from '@/services/system/fieldConfigApi';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { parseValidations, parseOptions, mapTypeToWidget } from './utils';

export function useFieldConfig() {
  const [searchParams] = useSearchParams();
  const initialBiz = (searchParams.get('bizType') || 'style') as string;
  const [bizType, setBizType] = useState<string>(
    BIZ_TYPE_OPTIONS.some(o => o.value === initialBiz) ? initialBiz : 'style'
  );
  const [rows, setRows] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<FieldConfigItem | null>(null);
  const [form] = Form.useForm();
  const [previewForm] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const [dirty, setDirty] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fieldConfigApi.list(bizType, 'pc', true);
      if (res?.code === 200 && Array.isArray(res.data)) {
        setRows(res.data);
        setDirty(false);
      }
    } catch (e) {
      message.error('加载字段配置失败');
    } finally {
      setLoading(false);
    }
  }, [bizType]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleToggleEnabled = useCallback((row: FieldConfigItem, enabled: boolean) => {
    setRows(prev => prev.map(r =>
      r.fieldKey === row.fieldKey ? { ...r, enabled: enabled ? 1 : 0 } : r
    ));
    setDirty(true);
  }, []);

  const handleSortChange = useCallback((row: FieldConfigItem, delta: number) => {
    setRows(prev => {
      const idx = prev.findIndex(r => r.fieldKey === row.fieldKey);
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      next.forEach((r, i) => r.sortOrder = i);
      return next;
    });
    setDirty(true);
  }, []);

  const handleEdit = useCallback((row: FieldConfigItem) => {
    setEditing(row);
    const validations = parseValidations(row.validationsJson);
    const options = parseOptions(row.optionsJson);
    form.setFieldsValue({
      label: row.label,
      fieldType: row.fieldType,
      optionsText: options.map(o => o.label).join('\n'),
      required: !!validations.required,
      pcColSpan: row.pcColSpan || 24,
      listWidth: row.sortOrder,
      remark: row.remark || '',
    });
    setEditOpen(true);
  }, [form]);

  const handleAdd = useCallback(() => {
    setRows(prev => {
      setEditing({
        bizType,
        fieldKey: '',
        label: '',
        fieldType: 'text',
        isSystem: 0,
        enabled: 1,
        sortOrder: prev.length,
        pcColSpan: 24,
      });
      return prev;
    });
    form.resetFields();
    form.setFieldsValue({ fieldType: 'text', required: false, pcColSpan: 24 });
    setEditOpen(true);
  }, [bizType, form]);

  const handleEditSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      const fieldKey = editing?.fieldKey || '';

      const optionsArr = (values.optionsText || '')
        .split('\n')
        .map((s: string) => s.trim())
        .filter((s: string) => s.length > 0);

      const optionsJson = (values.fieldType === 'select' || values.fieldType === 'multiselect') && optionsArr.length > 0
        ? JSON.stringify(optionsArr)
        : null;

      const validationsJson = JSON.stringify({
        required: !!values.required,
      });

      const newField: FieldConfigItem = {
        id: editing?.id,
        bizType,
        fieldKey,
        label: values.label,
        fieldType: values.fieldType,
        optionsJson,
        validationsJson,
        pcWidget: mapTypeToWidget(values.fieldType),
        h5Widget: mapTypeToWidget(values.fieldType),
        mpWidget: mapTypeToWidget(values.fieldType),
        pcColSpan: values.pcColSpan || 24,
        h5ColSpan: 24,
        sortOrder: editing?.sortOrder ?? rows.length,
        isSystem: editing?.isSystem ?? 0,
        enabled: editing?.enabled ?? 1,
        remark: values.remark || null,
      };

      setRows(prev => editing?.fieldKey
        ? prev.map(r => r.fieldKey === editing.fieldKey ? newField : r)
        : [...prev, newField]
      );
      setDirty(true);
      setEditOpen(false);
      message.success('已更新，点击「保存全部」后生效');
    } catch (e) {
      // 校验失败
    }
  }, [editing, bizType, form, rows.length]);

  const handleDelete = useCallback(async (row: FieldConfigItem) => {
    try {
      const res = await fieldConfigApi.delete(bizType, row.fieldKey);
      if (res?.code === 200) {
        message.success('已删除');
        fetchList();
      } else {
        message.error(res?.message || '删除失败');
      }
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    }
  }, [bizType, fetchList]);

  const handleSaveAll = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fieldConfigApi.saveBatch({
        bizType,
        platform: 'pc',
        fields: rows.map((r, i) => ({
          ...r,
          sortOrder: r.sortOrder ?? i,
          pcColSpan: r.pcColSpan ?? 24,
          h5ColSpan: r.h5ColSpan ?? 24,
        })),
      });
      if (res?.code === 200) {
        message.success('保存成功，配置已生效');
        setRows(res.data || rows);
        setDirty(false);
      } else {
        message.error(res?.message || '保存失败');
      }
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [bizType, rows]);

  const enabledFields = useMemo(() => rows.filter(r => r.enabled !== 0), [rows]);
  const customFields = useMemo(() => rows.filter(r => r.isSystem === 0), [rows]);

  const previewRecord = useMemo(() => {
    const rec: Record<string, unknown> = { id: 1, createTime: new Date().toISOString() };
    enabledFields.forEach(f => {
      if (f.fieldKey in rec) return;
      switch (f.fieldType) {
        case 'text':
        case 'textarea':
          rec[f.fieldKey] = `${f.label}示例值`;
          break;
        case 'number':
          rec[f.fieldKey] = 100;
          break;
        case 'date':
          rec[f.fieldKey] = '2026-07-04';
          break;
        case 'select':
          rec[f.fieldKey] = parseOptions(f.optionsJson)[0]?.label || '选项A';
          break;
        case 'multiselect':
          rec[f.fieldKey] = parseOptions(f.optionsJson).slice(0, 2).map(o => o.label);
          break;
        case 'switch':
          rec[f.fieldKey] = true;
          break;
      }
    });
    return rec;
  }, [enabledFields]);

  return {
    bizType,
    setBizType,
    rows,
    loading,
    editOpen,
    setEditOpen,
    editing,
    form,
    previewForm,
    saving,
    activeTab,
    setActiveTab,
    dirty,
    handleToggleEnabled,
    handleSortChange,
    handleEdit,
    handleAdd,
    handleEditSubmit,
    handleDelete,
    handleSaveAll,
    enabledFields,
    customFields,
    previewRecord,
  };
}
