import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Upload } from 'antd';
import api, { toNumberSafe, isApiSuccess, getApiMessage } from '@/utils/api';

const DEFAULT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL'];
const norm = (v: unknown) => String(v || '').trim();

interface StyleProcessRow {
  id: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  machineType: string;
  difficulty?: string;
  standardTime: number;
  price: number;
  sortOrder: number;
  sizePrices?: Record<string, number>;
  sizePriceTouched?: Record<string, boolean>;
}

type MatchedScope = 'style' | 'order' | 'empty';

const buildRowsFromContent = (content: any, fallbackSizes: string[] = DEFAULT_SIZES): { rows: StyleProcessRow[]; sizes: string[] } => {
  const rawSteps = Array.isArray(content?.steps) ? content.steps : [];
  const rawSizes = Array.isArray(content?.sizes)
    ? content.sizes.map((item: unknown) => String(item || '').trim().toUpperCase()).filter(Boolean)
    : [];
  const sizes = (rawSizes.length ? rawSizes : fallbackSizes).slice().sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a.localeCompare(b);
  });

  const rows: StyleProcessRow[] = rawSteps.map((item: any, index: number) => {
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      const sizePrice = toNumberSafe(item?.sizePrices?.[size]);
      const basePrice = toNumberSafe(item?.unitPrice ?? item?.price);
      sizePrices[size] = sizePrice || basePrice;
      sizePriceTouched[size] = item?.sizePrices?.[size] != null;
    });

    return {
      id: item?.processCode || `loaded-${index}`,
      processCode: String(item?.processCode || String(index + 1).padStart(2, '0')),
      processName: String(item?.processName || item?.name || ''),
      progressStage: String(item?.progressStage || '车缝'),
      machineType: String(item?.machineType || ''),
      difficulty: String(item?.difficulty || ''),
      standardTime: toNumberSafe(item?.standardTime),
      price: toNumberSafe(item?.unitPrice ?? item?.price),
      sortOrder: index + 1,
      sizePrices,
      sizePriceTouched,
    };
  });

  return { rows, sizes };
};

export default function useProcessPriceActions(open: boolean, initialStyleNo?: string) {
  const { message } = App.useApp();

  const [matchedScope, setMatchedScope] = useState<MatchedScope>('empty');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [styleInputVal, setStyleInputVal] = useState('');
  const [styleNoOptions, setStyleNoOptions] = useState<{ value: string; label: string }[]>([]);
  const [_styleNoLoading, setStyleNoLoading] = useState(false);
  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const styleNoSeq = useRef(0);
  const styleNoTimer = useRef<number | undefined>(undefined);

  const [data, setData] = useState<StyleProcessRow[]>([]);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sizes, setSizes] = useState<string[]>([...DEFAULT_SIZES]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [newSizeName, setNewSizeName] = useState('');
  const [addSizePopoverOpen, setAddSizePopoverOpen] = useState(false);
  const snapshotRef = useRef<StyleProcessRow[] | null>(null);

  const resetEditingState = useCallback(() => {
    setEditMode(false);
    snapshotRef.current = null;
  }, []);

  const fetchStyleNoOptions = useCallback(async (keyword: string) => {
    const seq = (styleNoSeq.current += 1);
    setStyleNoLoading(true);
    try {
      const res = await api.get<any>('/template-library/process-price-style-options', {
        params: { keyword: keyword.trim() },
      });
      if (seq !== styleNoSeq.current) return;
      const records: any[] = Array.isArray(res?.data) ? res.data : [];
      setStyleNoOptions(
        records
          .map((record: any) => {
            const styleNo = String(record?.styleNo || '').trim();
            const styleName = String(record?.styleName || '').trim();
            return { value: styleNo, label: styleName ? `${styleNo}（${styleName}）` : styleNo };
          })
          .filter((record: any) => record.value)
      );
    } catch {
      // ignore
    } finally {
      if (seq === styleNoSeq.current) setStyleNoLoading(false);
    }
  }, []);

  const scheduleStyleSearch = useCallback((keyword: string) => {
    if (styleNoTimer.current) window.clearTimeout(styleNoTimer.current);
    styleNoTimer.current = window.setTimeout(() => fetchStyleNoOptions(keyword), 250);
  }, [fetchStyleNoOptions]);

  const loadTemplate = useCallback(async (styleNo?: string) => {
    setLoadingTemplate(true);
    setTemplateId(null);
    setMatchedScope('empty');
    setData([]);
    setSizes([...DEFAULT_SIZES]);
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
      setSizes(nextSizes.length ? nextSizes : [...DEFAULT_SIZES]);
      setImageUrls(Array.isArray(payload?.content?.images) ? payload.content.images.filter((item: unknown) => String(item || '').trim()) : []);
    } catch {
      message.error('加载工序单价模板失败');
    } finally {
      setLoadingTemplate(false);
    }
  }, [resetEditingState, message]);

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
      setSizes([...DEFAULT_SIZES]);
      setImageUrls([]);
      setTemplateId(null);
      setMatchedScope('empty');
    }
  }, [open]);

  const handleUploadImage = useCallback(async (file: File) => {
    if (!selectedStyleNo.trim()) {
      message.error('请先输入款号');
      return Upload.LIST_IGNORE;
    }
    if (imageUrls.length >= 4) {
      message.warning('最多上传4张图片');
      return Upload.LIST_IGNORE;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (res.code !== 200 || !res.data) {
        message.error(res.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      setImageUrls((prev) => [...prev, res.data].slice(0, 4));
      message.success('图片已上传，保存后生效');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setImageUploading(false);
    }
    return Upload.LIST_IGNORE;
  }, [selectedStyleNo, imageUrls.length, message]);

  const handleSelectStyle = useCallback((styleNo: string) => {
    const nextStyleNo = String(styleNo || '').trim();
    setSelectedStyleNo(nextStyleNo);
    setStyleInputVal(nextStyleNo);
    if (nextStyleNo) loadTemplate(nextStyleNo);
  }, [loadTemplate]);

  const enterEdit = useCallback(() => {
    if (editMode) return;
    snapshotRef.current = JSON.parse(JSON.stringify(data));
    setEditMode(true);
  }, [editMode, data]);

  const exitEdit = useCallback(() => {
    if (snapshotRef.current) {
      setData(snapshotRef.current);
    }
    resetEditingState();
  }, [resetEditingState]);

  const handleAdd = useCallback(() => {
    if (!editMode) enterEdit();
    const maxSort = data.length ? Math.max(...data.map((item) => toNumberSafe(item.sortOrder))) : 0;
    const nextSort = maxSort + 1;
    const sizePrices: Record<string, number> = {};
    const sizePriceTouched: Record<string, boolean> = {};
    sizes.forEach((size) => {
      sizePrices[size] = 0;
      sizePriceTouched[size] = false;
    });
    setData((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        processCode: String(nextSort).padStart(2, '0'),
        processName: '',
        progressStage: '车缝',
        machineType: '',
        difficulty: '',
        standardTime: 0,
        price: 0,
        sortOrder: nextSort,
        sizePrices,
        sizePriceTouched,
      },
    ]);
  }, [editMode, enterEdit, data, sizes]);

  const handleDelete = useCallback((id: string | number) => {
    if (!editMode) enterEdit();
    setData((prev) => prev
      .filter((item) => item.id !== id)
      .map((item, index) => ({
        ...item,
        sortOrder: index + 1,
        processCode: String(index + 1).padStart(2, '0'),
      }))
    );
  }, [editMode, enterEdit]);

  const updateField = useCallback((id: string | number, field: keyof StyleProcessRow, value: any) => {
    setData((prev) => prev.map((row) => {
      if (row.id !== id) return row;
      if (field !== 'price') {
        return { ...row, [field]: value };
      }
      const nextPrice = toNumberSafe(value);
      const oldPrice = toNumberSafe(row.price);
      const nextSizePrices = { ...(row.sizePrices || {}) };
      const touched = row.sizePriceTouched || {};
      sizes.forEach((size) => {
        const current = toNumberSafe(nextSizePrices[size]);
        if (!touched[size] || current === oldPrice) {
          nextSizePrices[size] = nextPrice;
        }
      });
      return { ...row, price: nextPrice, sizePrices: nextSizePrices };
    }));
  }, [sizes]);

  const updateSizePrice = useCallback((id: string | number, size: string, value: number) => {
    setData((prev) => prev.map((row) => row.id !== id ? row : {
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [size]: value },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [size]: true },
    }));
  }, []);

  const handleAddSize = useCallback(() => {
    const trimmed = newSizeName.trim().toUpperCase();
    if (!trimmed) {
      message.warning('请输入尺码');
      return;
    }
    if (sizes.includes(trimmed)) {
      message.warning('该尺码已存在');
      return;
    }
    setSizes((prev) => [...prev, trimmed]);
    setData((prev) => prev.map((row) => ({
      ...row,
      sizePrices: { ...(row.sizePrices || {}), [trimmed]: toNumberSafe(row.price) },
      sizePriceTouched: { ...(row.sizePriceTouched || {}), [trimmed]: false },
    })));
    setNewSizeName('');
    message.success(`已添加尺码: ${trimmed}`);
  }, [newSizeName, sizes, message]);

  const handleRemoveSize = useCallback((size: string) => {
    setSizes((prev) => prev.filter((item) => item !== size));
    setData((prev) => prev.map((row) => {
      const { [size]: _removedPrice, ...nextSizePrices } = row.sizePrices || {};
      const { [size]: _removedTouched, ...nextTouched } = row.sizePriceTouched || {};
      return { ...row, sizePrices: nextSizePrices, sizePriceTouched: nextTouched };
    }));
  }, []);

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
    setSizes([...DEFAULT_SIZES]);
    setImageUrls([]);
    resetEditingState();
  }, [resetEditingState]);

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
