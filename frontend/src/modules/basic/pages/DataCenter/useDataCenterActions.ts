import { useEffect, useState, useCallback } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { StyleInfo, StyleQueryParams } from '@/types/style';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { readPageSize } from '@/utils/pageSizeStore';
import { buildProductionSheetHtml } from './buildProductionSheetHtml';

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

export const normalizeUploadFileList = (event: any) => {
  if (Array.isArray(event)) return event;
  return event?.fileList || [];
};

export function useDataCenterActions() {
  const { message } = App.useApp();

  const [stats, setStats] = useState<DataCenterStats>({
    styleCount: 0,
    materialCount: 0,
    productionCount: 0,
  });

  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: readPageSize(10),
    onlyCompleted: true,
  });
  const [styleNoInput, setStyleNoInput] = useState('');
  const debouncedStyleNo = useDebouncedValue(styleNoInput, 300);
  useEffect(() => {
    if (debouncedStyleNo !== (queryParams.styleNo || '')) {
      setQueryParams(prev => ({ ...prev, styleNo: debouncedStyleNo, page: 1 }));
    }
  }, [debouncedStyleNo, queryParams.styleNo]);

  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<StyleInfo | null>(null);
  const [editForm] = Form.useForm();
  const [editSaving, setEditSaving] = useState(false);

  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [detailRecord, setDetailRecord] = useState<StyleInfo | null>(null);

  const [patternRevisionModalVisible, setPatternRevisionModalVisible] = useState(false);
  const [patternRevisionRecord, setPatternRevisionRecord] = useState<StyleInfo | null>(null);
  const [patternRevisionForm] = Form.useForm();
  const [patternRevisionSaving, setPatternRevisionSaving] = useState(false);

  const [returnDescModalVisible, setReturnDescModalVisible] = useState(false);
  const [returnDescRecord, setReturnDescRecord] = useState<StyleInfo | null>(null);
  const [returnDescSaving, setReturnDescSaving] = useState(false);
  const [returnDescForm] = Form.useForm();

  const [returnPatternModalVisible, setReturnPatternModalVisible] = useState(false);
  const [returnPatternRecord, setReturnPatternRecord] = useState<StyleInfo | null>(null);
  const [returnPatternSaving, setReturnPatternSaving] = useState(false);
  const [returnPatternForm] = Form.useForm();

  const fetchStats = useCallback(async () => {
    try {
      const response = await api.get<{ code: number; message: string; data: unknown }>('/data-center/stats');
      if (response.code === 200) {
        const d = response.data || {};
        setStats({
          styleCount: (d as any).styleCount ?? 0,
          materialCount: (d as any).materialCount ?? 0,
          productionCount: (d as any).productionCount ?? 0,
        });
      }
    } catch { /* API may not exist yet */ }
  }, []);

  const fetchStyles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message: string; data: { records: any[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setStyles(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取款号列表失败');
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '获取款号列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, message]);

  const downloadFile = useCallback((fileName: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const downloadProductionSheet = useCallback(async (style: StyleInfo) => {
    try {
      const res = await api.get<{ code: number; message: string; data: unknown }>('/data-center/production-sheet', { params: { styleNo: style.styleNo } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return;
      }
      const html = buildProductionSheetHtml(res.data);
      downloadFile(`生产制单-${style.styleNo}.html`, html, 'text/html;charset=utf-8');
      message.success('已下载生产制单');
    } catch (e: unknown) {
      message.error((e as any)?.message || '下载失败');
    }
  }, [message, downloadFile]);

  const openEditModal = useCallback((record: StyleInfo) => {
    setEditingRecord(record);
    editForm.setFieldsValue({ description: record.description || '' });
    setEditModalVisible(true);
  }, [editForm]);

  const handleEditSave = useCallback(async () => {
    if (!editingRecord) return;
    try {
      setEditSaving(true);
      const values = await editForm.validateFields();
      const res = await api.put<{ code: number; message: string; data?: ProductionRequirementsSaveResult }>(`/style/info/${editingRecord.id}/production-requirements`, {
        description: values.description,
      });
      if (res.code === 200 && Number(res.data?.descriptionLocked) === 1) {
        setEditModalVisible(false);
        await fetchStyles();
        message.success('保存成功');
      } else {
        message.error(res.message || '保存后状态未锁定，请刷新后重试');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setEditSaving(false);
    }
  }, [editingRecord, editForm, fetchStyles, message]);

  const handleReturnDescSave = useCallback(async () => {
    if (!returnDescRecord) return;
    try {
      setReturnDescSaving(true);
      const values = await returnDescForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(
        `/style/info/${returnDescRecord.id}/production-requirements/rollback`,
        { reason: values.reason },
      );
      if (res.code === 200) {
        message.success('已退回，用户可重新编辑生产制单');
        setReturnDescModalVisible(false);
        returnDescForm.resetFields();
        fetchStyles();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '退回失败');
    } finally {
      setReturnDescSaving(false);
    }
  }, [returnDescRecord, returnDescForm, fetchStyles, message]);

  const handleReturnPatternSave = useCallback(async () => {
    if (!returnPatternRecord) return;
    try {
      setReturnPatternSaving(true);
      const values = await returnPatternForm.validateFields();
      const res = await api.post<{ code: number; message: string }>(
        `/style/info/${returnPatternRecord.id}/pattern-revision/rollback`,
        { reason: values.reason },
      );
      if (res.code === 200) {
        message.success('已退回，用户可重新提交纸样修改');
        setReturnPatternModalVisible(false);
        returnPatternForm.resetFields();
        fetchStyles();
      } else {
        message.error(res.message || '退回失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '退回失败');
    } finally {
      setReturnPatternSaving(false);
    }
  }, [returnPatternRecord, returnPatternForm, fetchStyles, message]);

  const openDetailModal = useCallback((record: StyleInfo) => {
    setDetailRecord(record);
    setDetailModalVisible(true);
  }, []);

  const openPatternRevisionModal = useCallback((record: StyleInfo) => {
    setPatternRevisionRecord(record);
    patternRevisionForm.setFieldsValue({
      styleNo: record.styleNo,
      revisionType: 'MINOR',
      revisionReason: '',
      revisionDate: undefined,
    });
    setPatternRevisionModalVisible(true);
  }, [patternRevisionForm]);

  const handlePatternRevisionSave = useCallback(async () => {
    if (!patternRevisionRecord) return;
    try {
      setPatternRevisionSaving(true);
      const values = await patternRevisionForm.validateFields();
      const patternFileList = Array.isArray(values.patternFile) ? values.patternFile : [];
      if (patternFileList.length > 0) {
        const file = patternFileList[0]?.originFileObj;
        if (file) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('styleId', String(patternRevisionRecord.id));
          formData.append('styleNo', patternRevisionRecord.styleNo);
          formData.append('type', 'pattern');
          const uploadRes = await api.post<{ code: number; message: string }>('/style/attachment/upload-pattern', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
          if (uploadRes.code !== 200) {
            message.error(uploadRes.message || '文件上传失败');
            setPatternRevisionSaving(false);
            return;
          }
        }
      }
      const data = {
        styleId: patternRevisionRecord.id,
        styleNo: values.styleNo,
        revisionType: values.revisionType,
        revisionReason: values.revisionReason,
        revisionContent: values.revisionReason,
        revisionDate: values.revisionDate?.format('YYYY-MM-DD'),
        patternMakerName: values.patternMakerName,
        expectedCompleteDate: values.expectedCompleteDate?.format('YYYY-MM-DD'),
        remark: values.remark,
      };
      const res = await api.post<{ code: number; message: string }>('/pattern-revision', data);
      if (res.code === 200) {
        message.success('纸样修改记录已保存');
        setPatternRevisionModalVisible(false);
        patternRevisionForm.resetFields();
        fetchStyles();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (e: unknown) {
      message.error((e as any)?.message || '保存失败');
    } finally {
      setPatternRevisionSaving(false);
    }
  }, [patternRevisionRecord, patternRevisionForm, fetchStyles, message]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchStyles(); }, [queryParams, fetchStyles]);

  return {
    stats, queryParams, setQueryParams, styleNoInput, setStyleNoInput,
    styles, total, loading, fetchStyles,
    editModalVisible, setEditModalVisible, editingRecord, editForm, editSaving, openEditModal, handleEditSave,
    detailModalVisible, setDetailModalVisible, detailRecord, openDetailModal,
    patternRevisionModalVisible, setPatternRevisionModalVisible, patternRevisionRecord, patternRevisionForm, patternRevisionSaving, openPatternRevisionModal, handlePatternRevisionSave,
    returnDescModalVisible, setReturnDescModalVisible, returnDescRecord, setReturnDescRecord, returnDescForm, returnDescSaving, handleReturnDescSave,
    returnPatternModalVisible, setReturnPatternModalVisible, returnPatternRecord, setReturnPatternRecord, returnPatternForm, returnPatternSaving, handleReturnPatternSave,
    downloadProductionSheet,
  };
}
