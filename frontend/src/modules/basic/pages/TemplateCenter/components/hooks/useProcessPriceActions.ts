import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from 'antd';
import api, { isApiSuccess, getApiMessage, sortSizeNames, toNumberSafe } from '@/utils/api';
import { useStyleNoSearch } from './useStyleNoSearch';
import { useProcessEditor } from './useProcessEditor';
import { buildRowsFromContent, FALLBACK_SIZES, norm, MatchedScope, StyleProcessRow } from './utils';

export default function useProcessPriceActions(open: boolean, initialStyleNo?: string) {
  const { message } = App.useApp();

  const [matchedScope, setMatchedScope] = useState<MatchedScope>('empty');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const dictSizesLoadedRef = useRef(false);

  const styleSearch = useStyleNoSearch();
  const {
    styleInputVal, styleNoOptions, selectedStyleNo,
    setStyleInputVal, setSelectedStyleNo, fetchStyleNoOptions, scheduleStyleSearch,
  } = styleSearch;

  const editor = useProcessEditor();
  const {
    data, editMode, sizes, newSizeName, addSizePopoverOpen,
    setData, setSizes, setNewSizeName, setAddSizePopoverOpen,
    resetEditingState, enterEdit, exitEdit, handleAdd, handleDelete,
    updateField, updateSizePrice, handleAddSize, handleRemoveSize,
  } = editor;

  useEffect(() => {
    if (dictSizesLoadedRef.current) return;
    dictSizesLoadedRef.current = true;
    api.get<any>('/system/dict/list', { params: { dictType: 'size', page: 1, pageSize: 200 } })
      .then((res: any) => {
        const records = res?.data?.records || (Array.isArray(res?.data) ? res.data : []);
        const labels = records.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        if (labels.length) setSizes(sortSizeNames(labels));
      })
      .catch((err) => console.error('加载尺码字典失败:', err));
  }, [setSizes]);

  const loadTemplate = useCallback(async (styleNo?: string) => {
    setLoadingTemplate(true);
    setTemplateId(null);
    setMatchedScope('empty');
    setData([]);
    setSizes([...FALLBACK_SIZES]);
    setImageUrls([]);
    resetEditingState();
    try {
      const res = await api.get<any>('/template-library/process-price-template', {
        params: { styleNo: String(styleNo || '').trim() },
      });
      const payload = res?.data ?? {};
      const { rows, sizes: nextSizes } = buildRowsFromContent(payload?.content ?? {});
      setTemplateId(payload?.templateId || null);
      setMatchedScope((payload?.matchedScope as MatchedScope) || 'empty');
      setData(rows);
      setSizes(nextSizes.length ? nextSizes : [...FALLBACK_SIZES]);
      setImageUrls(Array.isArray(payload?.content?.images) ? payload.content.images.filter((item: unknown) => String(item || '').trim()) : []);
    } catch {
      message.error('加载工序单价模板失败');
    } finally {
      setLoadingTemplate(false);
    }
  }, [resetEditingState, message, setData, setSizes]);

  useEffect(() => {
    if (!open) return;
    fetchStyleNoOptions('');
    const sn = String(initialStyleNo || '').trim();
    if (sn) {
      setStyleInputVal(sn);
      setSelectedStyleNo(sn);
      loadTemplate(sn);
    } else {
      setStyleInputVal('');
      setSelectedStyleNo('');
      setData([]);
      setSizes([...FALLBACK_SIZES]);
      setImageUrls([]);
      setTemplateId(null);
      setMatchedScope('empty');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleUploadImage = useCallback(async (file: File) => {
    if (!selectedStyleNo.trim()) {
      message.error('请先输入款号');
      return;
    }
    if (imageUrls.length >= 4) {
      message.warning('最多上传4张图片');
      return;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (res.code !== 200 || !res.data) {
        message.error(res.message || '上传失败');
        return;
      }
      setImageUrls((prev) => [...prev, res.data].slice(0, 4));
      message.success('图片已上传，保存后生效');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setImageUploading(false);
    }
  }, [selectedStyleNo, imageUrls.length, message]);

  const handleSelectStyle = useCallback((styleNo: string) => {
    const nextStyleNo = String(styleNo || '').trim();
    setSelectedStyleNo(nextStyleNo);
    setStyleInputVal(nextStyleNo);
    if (nextStyleNo) loadTemplate(nextStyleNo);
  }, [loadTemplate, setSelectedStyleNo, setStyleInputVal]);

  const saveAll = useCallback(async (): Promise<boolean> => {
    if (!selectedStyleNo.trim()) {
      message.error('请先输入要配置的款号');
      return false;
    }
    const rows = data.map((row, index) => ({
      ...row,
      sortOrder: index + 1,
      processCode: String(index + 1).padStart(2, '0'),
    }));
    if (!rows.length) {
      message.error('请先添加进度节点');
      return false;
    }
    const invalid = rows.find((row) => !norm(row.processName));
    if (invalid) {
      message.error('请完善必填项：工序名称');
      return false;
    }

    setSaving(true);
    try {
      const payload = {
        styleNo: selectedStyleNo.trim(),
        templateContent: {
          sizes,
          images: imageUrls,
          steps: rows.map((row) => ({
            processCode: norm(row.processCode),
            processName: norm(row.processName),
            progressStage: norm(row.progressStage) || '车缝',
            machineType: norm(row.machineType),
            difficulty: norm(row.difficulty),
            standardTime: toNumberSafe(row.standardTime),
            unitPrice: toNumberSafe(row.price),
            sizePrices: sizes.reduce((acc, size) => {
              acc[size] = toNumberSafe(row.sizePrices?.[size] ?? row.price);
              return acc;
            }, {} as Record<string, number>),
          })),
        },
      };
      const res = await api.post<any>('/template-library/process-price-template', payload);
      if (!isApiSuccess(res)) {
        message.error(getApiMessage(res, '保存失败'));
        return false;
      }
      resetEditingState();
      await loadTemplate(selectedStyleNo.trim());
      message.success('款号工序单价已保存');
      return true;
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '保存失败');
      return false;
    } finally {
      setSaving(false);
    }
  }, [selectedStyleNo, data, sizes, imageUrls, resetEditingState, loadTemplate, message]);

  const syncToOrders = useCallback(async (): Promise<boolean> => {
    setSyncing(true);
    try {
      const res = await api.post<any>('/template-library/sync-process-prices', {
        styleNo: selectedStyleNo.trim(),
      });
      if (!isApiSuccess(res)) {
        message.error(getApiMessage(res, '同步失败'));
        return false;
      }
      const result = (res?.data || {}) as Record<string, unknown>;
      message.success(
        `${result.scopeLabel || '同步完成'}：${result.totalOrders || 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个订单工价节点`
      );
      return true;
    } catch {
      message.error('同步失败');
      return false;
    } finally {
      setSyncing(false);
    }
  }, [selectedStyleNo, message]);

  const handleSaveAndSync = useCallback(async (): Promise<boolean> => {
    const saved = await saveAll();
    if (!saved) return false;
    return await syncToOrders();
  }, [saveAll, syncToOrders]);

  const handleClose = useCallback(() => {
    setMatchedScope('empty');
    setTemplateId(null);
    setStyleInputVal('');
    setSelectedStyleNo('');
    setData([]);
    setSizes([...FALLBACK_SIZES]);
    setImageUrls([]);
    resetEditingState();
  }, [resetEditingState, setStyleInputVal, setSelectedStyleNo, setData, setSizes]);

  const isBusy = saving || syncing || loadingTemplate;
  const readyForScope = Boolean(selectedStyleNo.trim());

  return {
    matchedScope, templateId, styleInputVal, styleNoOptions, selectedStyleNo,
    data, loadingTemplate, editMode, saving, syncing, sizes, imageUrls,
    imageUploading, newSizeName, addSizePopoverOpen, isBusy, readyForScope,
    setStyleInputVal, setSelectedStyleNo, setTemplateId, setMatchedScope,
    setSizes, setImageUrls, setNewSizeName, setAddSizePopoverOpen,
    scheduleStyleSearch, handleSelectStyle, handleUploadImage,
    enterEdit, exitEdit, handleAdd, handleDelete,
    updateField, updateSizePrice, handleAddSize, handleRemoveSize,
    saveAll, syncToOrders, saveAndSync: handleSaveAndSync, handleClose, loadTemplate,
  };
}

export type { StyleProcessRow, MatchedScope };
