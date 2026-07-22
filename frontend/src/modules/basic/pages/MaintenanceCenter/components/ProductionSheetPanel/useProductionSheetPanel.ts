import { useMemo, useState, useEffect, useCallback } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { getErrorMessage } from '../../../TemplateCenter/utils/templateUtils';
import { readPageSize } from '@/utils/pageSizeStore';
import { isAdminUser as isAdminUserFn, useUser } from '@/utils/AuthContext';
import { buildProductionSheetHtml } from '../../../DataCenter/buildProductionSheetHtml';

interface DataCenterStats {
  styleCount: number;
  materialCount: number;
  productionCount: number;
}

interface ProductionRequirementsSaveResult {
  id: number;
  styleNo?: string;
  description?: string;
  descriptionLocked?: number;
  descriptionReturnComment?: string | null;
  updateBy?: string;
  updateTime?: string;
}

interface UseProductionSheetPanelOptions {
  styleNo?: string;
  onSaved?: () => void;
}

export const useProductionSheetPanel = ({ styleNo, onSaved }: UseProductionSheetPanelOptions) => {
  const { message } = App.useApp();
  const { user } = useUser();

  const [stats, setStats] = useState<DataCenterStats>({ styleCount: 0, materialCount: 0, productionCount: 0 });
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({ page: 1, pageSize: readPageSize(10), onlyCompleted: true, ...(styleNo ? { styleNoExact: styleNo } : {}) });
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StyleInfo | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);
  const [cancelLocking, setCancelLocking] = useState(false);

  const [returnDescVisible, setReturnDescVisible] = useState(false);
  const [returnDescRecord, setReturnDescRecord] = useState<StyleInfo | null>(null);
  const [returnDescSaving, setReturnDescSaving] = useState(false);
  const [returnDescForm] = Form.useForm();

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState<StyleInfo | null>(null);

  const isAdminUser = useMemo(() => isAdminUserFn(user), [user]);
  const isFactoryUser = useMemo(() => !!user?.factoryId, [user]);
  const canManage = isAdminUser || isFactoryUser;
  const directRow = styleNo ? (styles.find(s => s.styleNo === styleNo) ?? null) : null;
  const directLocked = Number((directRow as any)?.descriptionLocked) === 1;
  const directProcessing = !directLocked && !!String((directRow as any)?.descriptionReturnComment || '').trim();

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get<{ code: number; data: DataCenterStats }>('/data-center/stats');
      if (res.code === 200 && res.data) setStats(res.data);
    } catch { /* silent */ }
  }, []);

  const fetchStyles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: any[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) { setStyles(response.data.records || []); setTotal(response.data.total || 0); }
      else { message.error(response.message || '获取列表失败'); }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '获取列表失败'); }
    finally { setLoading(false); }
  }, [queryParams, message]);

  const openEditModal = useCallback((record: StyleInfo) => {
    setEditingRecord(record);
    editForm.setFieldsValue({ description: (record as any).description || '' });
    setEditModalVisible(true);
  }, [editForm]);

  const handleEditSave = useCallback(async () => {
    const targetRecord = styleNo ? directRow : editingRecord;
    if (!targetRecord) return;
    try {
      setEditSaving(true);
      const values = await editForm.validateFields();
      const res = await api.put<{ code: number; message: string; data?: ProductionRequirementsSaveResult }>(`/style/info/${targetRecord.id}/production-requirements`, {
        description: values.description,
      });
      if (res.code === 200 && Number(res.data?.descriptionLocked) === 1) {
        setEditModalVisible(false);
        editForm.resetFields();
        await fetchStyles();
        onSaved?.();
        message.success('保存成功');
      } else {
        message.error(res.message || '保存后状态未锁定，请刷新后重试');
      }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '保存失败'); }
    finally { setEditSaving(false); }
  }, [styleNo, directRow, editingRecord, editForm, fetchStyles, onSaved, message]);

  const handleReturnDescSave = useCallback(async () => {
    const targetRecord = styleNo ? directRow : returnDescRecord;
    if (!targetRecord) return;
    try {
      setReturnDescSaving(true);
      const values = await returnDescForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(`/style/info/${targetRecord.id}/production-requirements/rollback`, { reason: values.reason });
      if (res.code === 200) { message.success('已退回制单信息'); setReturnDescVisible(false); returnDescForm.resetFields(); fetchStyles(); }
      else { message.error(res.message || '退回失败'); }
    } catch (e: unknown) { message.error(e instanceof Error ? e.message : '退回失败'); }
    finally { setReturnDescSaving(false); }
  }, [styleNo, directRow, returnDescRecord, returnDescForm, fetchStyles, message]);

  const downloadFile = (fileName: string, content: string, mime = 'text/html') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const downloadProductionSheet = useCallback(async (style: StyleInfo) => {
    try {
      const res = await api.get<{ code: number; data: any }>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      if (res.code === 200 && res.data) {
        const html = buildProductionSheetHtml(res.data, user?.tenantName);
        downloadFile(`${style.styleNo}_制单.html`, html);
      } else { message.error('获取制单数据失败'); }
    } catch { message.error('获取制单数据失败'); }
  }, [user?.tenantName, message]);

  const handleCancelEdit = useCallback(async () => {
    if (!directRow?.id) return;
    setCancelLocking(true);
    try {
      await api.post(`/style/info/${directRow.id}/production-requirements/lock`);
      await fetchStyles();
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '取消修改失败'));
    } finally {
      setCancelLocking(false);
    }
  }, [directRow, fetchStyles, message]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    setQueryParams(prev => {
      const next = styleNo || undefined;
      if (prev.styleNo === next) return prev;
      return { ...prev, styleNo: next, page: 1 };
    });
  }, [styleNo]);
  useEffect(() => { fetchStyles(); }, [queryParams, fetchStyles]);

  useEffect(() => {
    if (styleNo && directRow && !directLocked) {
      editForm.setFieldsValue({ description: (directRow as any).description || '' });
    }
  }, [directLocked, directRow, editForm, styleNo]);

  return {
    stats,
    queryParams,
    setQueryParams,
    styles,
    total,
    loading,
    editModalVisible,
    setEditModalVisible,
    editingRecord,
    editForm,
    editSaving,
    cancelLocking,
    returnDescVisible,
    setReturnDescVisible,
    returnDescRecord,
    setReturnDescRecord,
    returnDescSaving,
    returnDescForm,
    detailModalVisible,
    setDetailModalVisible,
    detailRecord,
    setDetailRecord,
    canManage,
    directRow,
    directLocked,
    directProcessing,
    fetchStyles,
    openEditModal,
    handleEditSave,
    handleReturnDescSave,
    downloadProductionSheet,
    handleCancelEdit,
  };
};
