import { useCallback, useEffect, useRef, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { sortSizeNames } from '@/utils/api';
import type { TemplateLibrary } from '@/types/style';
import {
  convertStyleSizeListToTable,
  getErrorMessage,
  hasErrorFields,
  isProcessTableData,
  normalizeProcessSteps,
  type ProcessStepRow,
  type ProcessTableData,
} from '../../../utils/templateUtils';
import { parseTemplateContent } from './helpers';

export interface UseTemplateInlineEditorDataParams {
  row: TemplateLibrary;
  onSaved: () => Promise<void> | void;
}

export interface UseTemplateInlineEditorDataReturn {
  form: ReturnType<typeof Form.useForm>[0];
  saving: boolean;
  imageUploading: boolean;
  editTableData: unknown;
  setEditTableData: (next: unknown) => void;
  showSizePrices: boolean;
  setShowSizePrices: (next: boolean) => void;
  templateSizes: string[];
  newSizeName: string;
  setNewSizeName: (next: string) => void;
  imageUrls: string[];
  handleUploadImage: (file: File) => Promise<void>;
  addSize: () => void;
  removeSize: (size: string) => void;
  handleSave: () => Promise<void>;
  handleRemoveImage: (url: string) => void;
}

export const useTemplateInlineEditorData = ({
  row,
  onSaved,
}: UseTemplateInlineEditorDataParams): UseTemplateInlineEditorDataReturn => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [editTableData, setEditTableData] = useState<unknown>(null);
  const [showSizePrices, setShowSizePrices] = useState(false);
  const [templateSizes, setTemplateSizes] = useState<string[]>([]);
  const [newSizeName, setNewSizeName] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const dictSizesRef = useRef<string[]>(sortSizeNames(['XS', 'S', 'M', 'L', 'XL', 'XXL']));

  useEffect(() => {
    api.get<any>('/system/dict/list', { params: { dictType: 'size', page: 1, pageSize: 200 } })
      .then((res: any) => {
        const records = res?.data?.records || (Array.isArray(res?.data) ? res.data : []);
        const labels = records.filter((item: any) => item.dictLabel).map((item: any) => item.dictLabel);
        if (labels.length) dictSizesRef.current = sortSizeNames(labels);
      })
      .catch((err) => console.error('加载尺码字典失败:', err));
  }, []);

  useEffect(() => {
    form.setFieldsValue({
      templateName: row.templateName,
      templateKey: row.templateKey,
      sourceStyleNo: row.sourceStyleNo || undefined,
    });

    const normalizedType = String(row.templateType || '').trim().toLowerCase();
    const parsedContent = parseTemplateContent(row.templateContent);

    if (!parsedContent) {
      setEditTableData(null);
      setShowSizePrices(false);
      setTemplateSizes(sortSizeNames(dictSizesRef.current));
      setImageUrls([]);
      return;
    }

    let nextContent = parsedContent;
    if ((normalizedType === 'process' || normalizedType === 'process_price') && Array.isArray(nextContent)) {
      nextContent = { steps: normalizeProcessSteps(nextContent as ProcessStepRow[]) };
    }
    if ((normalizedType === 'process' || normalizedType === 'process_price') && isProcessTableData(nextContent)) {
      nextContent = { ...nextContent, steps: normalizeProcessSteps(nextContent.steps) };
    }
    if (normalizedType === 'size' && Array.isArray(nextContent)) {
      nextContent = convertStyleSizeListToTable(nextContent as Array<Record<string, unknown>>);
    }

    setEditTableData(nextContent);

    if (isProcessTableData(nextContent) && Array.isArray(nextContent.sizes)) {
      setTemplateSizes(sortSizeNames(nextContent.sizes));
      setShowSizePrices(nextContent.sizes.length > 0);
    } else {
      setTemplateSizes(sortSizeNames(dictSizesRef.current));
      setShowSizePrices(false);
    }

    if (
      normalizedType === 'process_price' &&
      nextContent &&
      typeof nextContent === 'object' &&
      Array.isArray((nextContent as { images?: unknown[] }).images)
    ) {
      setImageUrls(
        ((nextContent as { images?: unknown[] }).images || [])
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      );
    } else {
      setImageUrls([]);
    }
  }, [form, row]);

  const buildProcessContent = useCallback(() => {
    if (!isProcessTableData(editTableData)) return null;
    const normalizedSteps = normalizeProcessSteps(editTableData.steps).map((step) => {
      const unitPrice = Number(step.unitPrice ?? step.price ?? 0) || 0;
      const nextStep: ProcessStepRow = {
        processCode: String(step.processCode || '').trim(),
        processName: String(step.processName || '').trim(),
        progressStage: String(step.progressStage || '').trim(),
        machineType: String(step.machineType || '').trim(),
        difficulty: String(step.difficulty || '').trim(),
        standardTime: Number(step.standardTime || 0) || 0,
        unitPrice,
      };
      if (showSizePrices && templateSizes.length > 0) {
        nextStep.sizePrices = templateSizes.reduce((acc, size) => {
          acc[size] = Number(step.sizePrices?.[size] ?? unitPrice) || 0;
          return acc;
        }, {} as Record<string, number>);
      }
      return nextStep;
    });

    const nextContent: ProcessTableData & { images?: string[] } = { steps: normalizedSteps };
    if (showSizePrices && templateSizes.length > 0) {
      nextContent.sizes = templateSizes;
    }
    if (String(row.templateType || '').trim().toLowerCase() === 'process_price' && imageUrls.length > 0) {
      nextContent.images = imageUrls;
    }
    return nextContent;
  }, [editTableData, imageUrls, row.templateType, showSizePrices, templateSizes]);

  const promptProcessSave = async () => {
    return new Promise<boolean>((resolve) => {
      modal.confirm({
        width: '30vw',
        title: '工序单价自动同步提醒',
        content: (
          <div>
            <p style={{ marginBottom: 12 }}>保存工序单价后，系统会同步更新未完成订单的工序单价。</p>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-tertiary)' }}>通常 1 到 3 秒内完成。</p>
          </div>
        ),
        okText: '确认保存',
        cancelText: '取消',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  };

  const promptSyncProcessPriceOrders = async (styleNo: string) => {
    const shouldSync = await new Promise<boolean>((resolve) => {
      modal.confirm({
        width: '30vw',
        title: '独立工序单价已保存',
        content: (
          <div>
            <p style={{ marginBottom: 8 }}>是否同步到该款号已有的未完成生产订单？</p>
            <p style={{ margin: 0, color: 'var(--color-text-tertiary)', fontSize: 14 }}>款号：{styleNo}</p>
          </div>
        ),
        okText: '保存并同步',
        cancelText: '仅保存',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

    if (!shouldSync) {
      message.success('更新成功');
      return;
    }

    const response = await api.post<{ code: number; data?: Record<string, unknown>; message?: string }>('/template-library/sync-process-prices', {
      styleNo,
    });
    if (response.code !== 200) {
      message.warning(response.message || '模板已保存，但同步订单失败');
      return;
    }

    const result = response.data || {};
    message.success(
      `${result.scopeLabel || '同步完成'}：${result.totalOrders || 0} 个订单，更新 ${result.totalSynced || 0} 条跟踪单价，刷新 ${result.workflowUpdatedNodes || 0} 个订单工价节点`
    );
  };

  const handleUploadImage = async (file: File) => {
    if (imageUrls.length >= 4) {
      message.warning('最多上传4张图片');
      return;
    }
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await api.post<{ code: number; data: string; message?: string }>('/common/upload', formData);
      if (response.code !== 200 || !response.data) {
        message.error(response.message || '上传失败');
        return;
      }
      setImageUrls((prev) => [...prev, response.data].slice(0, 4));
      message.success('图片已上传，保存后生效');
    } catch (error: unknown) {
      message.error(getErrorMessage(error, '上传失败'));
    } finally {
      setImageUploading(false);
    }
  };

  const addSize = () => {
    const nextSize = newSizeName.trim().toUpperCase();
    if (!nextSize || templateSizes.includes(nextSize) || !isProcessTableData(editTableData)) return;
    const nextSizes = sortSizeNames([...templateSizes, nextSize]);
    const nextSteps = editTableData.steps.map((step) => ({
      ...step,
      sizePrices: {
        ...(step.sizePrices || {}),
        [nextSize]: step.unitPrice ?? step.price ?? 0,
      },
    }));
    setTemplateSizes(nextSizes);
    setEditTableData({ ...editTableData, sizes: nextSizes, steps: nextSteps });
    setNewSizeName('');
  };

  const removeSize = (size: string) => {
    if (!isProcessTableData(editTableData)) return;
    const nextSizes = templateSizes.filter((item) => item !== size);
    const nextSteps = editTableData.steps.map((step) => {
      const nextSizePrices = { ...(step.sizePrices || {}) };
      delete nextSizePrices[size];
      return { ...step, sizePrices: nextSizePrices };
    });
    setTemplateSizes(nextSizes);
    setEditTableData({ ...editTableData, sizes: nextSizes, steps: nextSteps });
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const templateName = String(values.templateName || row.templateName || '').trim();
      const templateKey = String(values.templateKey || row.templateKey || '').trim();
      const sourceStyleNo = String(values.sourceStyleNo || row.sourceStyleNo || '').trim();
      const normalizedType = String(row.templateType || '').trim().toLowerCase();

      if (!templateName) {
        message.error('请输入模板名称');
        return;
      }
      if (!editTableData) {
        message.error('模板内容无效');
        return;
      }

      let templateContent = '';
      if (normalizedType === 'process' || normalizedType === 'process_price') {
        const nextContent = buildProcessContent();
        if (!nextContent) {
          message.error('模板内容无效');
          return;
        }
        templateContent = JSON.stringify(nextContent);
      } else {
        templateContent = JSON.stringify(editTableData);
      }

      if (normalizedType === 'process') {
        const confirmed = await promptProcessSave();
        if (!confirmed) return;
      }

      setSaving(true);

      if (normalizedType === 'process_price') {
        if (!sourceStyleNo) {
          message.error('独立工序单价模板必须绑定来源款号');
          return;
        }
        const nextContent = buildProcessContent();
        if (!nextContent) {
          message.error('模板内容无效');
          return;
        }
        const response = await api.post<{ code: number; message?: string }>('/template-library/process-price-template', {
          styleNo: sourceStyleNo,
          templateName,
          templateContent: nextContent,
        });
        if (response.code !== 200) {
          message.error(response.message || '更新失败');
          return;
        }
        await onSaved();
        await promptSyncProcessPriceOrders(sourceStyleNo);
        return;
      }

      const isNew = !row.id;
      const payload = {
        templateName,
        templateKey: templateKey || null,
        templateType: row.templateType,
        sourceStyleNo: sourceStyleNo || null,
        templateContent,
      };
      const response = isNew
        ? await api.post<{ code: number; message?: string }>('/template-library', payload)
        : await api.put<{ code: number; message?: string }>(`/template-library/${row.id}`, { id: row.id, ...payload });
      if (response.code !== 200) {
        message.error(response.message || (isNew ? '创建失败' : '更新失败'));
        return;
      }

      message.success(isNew ? '创建成功' : '更新成功');
      await onSaved();
    } catch (error: unknown) {
      if (hasErrorFields(error)) return;
      message.error(getErrorMessage(error, '更新失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = (url: string) => {
    setImageUrls((prev) => prev.filter((item) => item !== url));
  };

  return {
    form,
    saving,
    imageUploading,
    editTableData,
    setEditTableData,
    showSizePrices,
    setShowSizePrices,
    templateSizes,
    newSizeName,
    setNewSizeName,
    imageUrls,
    handleUploadImage,
    addSize,
    removeSize,
    handleSave,
    handleRemoveImage,
  };
};
