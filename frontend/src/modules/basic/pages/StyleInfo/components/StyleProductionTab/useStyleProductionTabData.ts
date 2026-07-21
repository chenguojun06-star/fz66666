import { useState, useRef } from 'react';
import { Form } from 'antd';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import { message } from '@/utils/antdStatic';
import { useUser } from '@/utils/AuthContext';
import { buildProductionSheetHtml } from '../../../DataCenter/buildProductionSheetHtml';
import { downloadHtmlFile } from './helpers';
import type { StyleProductionTabProps } from './types';

export function useStyleProductionTabData(props: StyleProductionTabProps) {
  const {
    styleId,
    productionReqRows,
    productionReqEditable,
    onProductionReqChange,
    onRefresh,
    sampleReviewStatus,
    sampleReviewComment,
  } = props;

  const { user } = useUser();

  // ---- 样衣审核 Modal ----
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm] = Form.useForm();

  // ---- 工艺单 OCR Modal ----
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');

  // 直接读取原文，不做任何合并 / 过滤 / trim
  const allRequirements = String(productionReqRows[0] ?? '');

  const openReviewModal = () => {
    reviewForm.setFieldsValue({
      reviewStatus: sampleReviewStatus || undefined,
      reviewComment: sampleReviewComment || '',
    });
    setReviewModalVisible(true);
  };

  const handleReviewSave = async () => {
    try {
      const values = await reviewForm.validateFields();
      setReviewSaving(true);
      const res = await api.post<{ code: number; message: string }>(`/style/info/${styleId}/sample-review`, {
        reviewStatus: values.reviewStatus,
        reviewComment: values.reviewComment || null,
      });
      if (res.code === 200) {
        message.success('审核记录已保存');
        setReviewModalVisible(false);
        onRefresh?.();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      // form validation error, ignore
    } finally {
      setReviewSaving(false);
    }
  };

  const fetchProductionSheetPayload = async () => {
    try {
      const res = await api.get<{ code: number; message: string; data: any }>('/data-center/production-sheet', { params: { styleId } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return null;
      }
      return res.data;
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '获取生产制单失败');
      return null;
    }
  };

  const buildWorkorderHtml = (payload: any) => {
    if (!productionReqEditable) return buildProductionSheetHtml(payload, user?.tenantName);
    // 直接取用户原文，不做任何 trim / 过滤
    const desc = String(productionReqRows[0] ?? '');
    const next = {
      ...(payload || {}),
      style: {
        ...((payload || {})?.style || {}),
        description: desc,
      },
    };
    return buildProductionSheetHtml(next, user?.tenantName);
  };

  const downloadWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const styleNo = String((payload as any)?.style?.styleNo || '').trim() || String(styleId);
    const html = buildWorkorderHtml(payload);
    downloadHtmlFile(`生产制单-${styleNo}.html`, html);
    message.success('已下载生产制单');
  };

  const printWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const html = buildWorkorderHtml(payload);
    const success = safePrint(html, '生产制单');
    if (!success) {
      message.error('打印失败，请重试');
    }
  };

  const handleOcrOpen = () => {
    setOcrModalOpen(true);
    setOcrFile(null);
    setOcrText('');
    setOcrError('');
  };

  const handleOcrRecognize = async () => {
    if (!ocrFile) return;
    setOcrLoading(true);
    setOcrText('');
    setOcrError('');
    try {
      const formData = new FormData();
      formData.append('file', ocrFile);
      const res = await api.post<{ code: number; message: string; data: { rawText: string } }>(
        `/style/info/${styleId}/recognize-requirement`,
        formData
      );
      if (res.code !== 200) {
        setOcrError(res.message || 'AI识别失败');
      } else {
        setOcrText(res.data?.rawText || '');
      }
    } catch (e: unknown) {
      setOcrError(e instanceof Error ? e.message : 'AI识别失败，请重试');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrAppend = () => {
    const joined = allRequirements ? allRequirements + '\n' + ocrText : ocrText;
    onProductionReqChange(0, joined);
    setOcrModalOpen(false);
    setOcrFile(null);
    setOcrText('');
  };

  const handleOcrReplace = () => {
    onProductionReqChange(0, ocrText);
    setOcrModalOpen(false);
    setOcrFile(null);
    setOcrText('');
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 整段文本存 index 0，不拆行、不限行数、不修改任何内容
    onProductionReqChange(0, e.target.value);
  };

  const closeOcrModal = () => setOcrModalOpen(false);
  const closeReviewModal = () => setReviewModalVisible(false);

  // OCR 文件选择/移除（用于 OcrModal 子组件）
  const handleOcrFileSelect = (f: File | null) => {
    if (f) {
      setOcrFile(f);
      setOcrText('');
      setOcrError('');
    }
  };

  const handleOcrFileRemove = () => {
    setOcrFile(null);
    setOcrText('');
  };

  return {
    // 数据
    allRequirements,
    // 样衣审核
    reviewModalVisible,
    reviewSaving,
    reviewForm,
    openReviewModal,
    handleReviewSave,
    closeReviewModal,
    // 生产制单
    downloadWorkorder,
    printWorkorder,
    // OCR
    ocrModalOpen,
    ocrFile,
    ocrFileInputRef,
    ocrLoading,
    ocrText,
    ocrError,
    handleOcrOpen,
    handleOcrRecognize,
    handleOcrAppend,
    handleOcrReplace,
    closeOcrModal,
    handleOcrFileSelect,
    handleOcrFileRemove,
    // textarea
    handleTextChange,
  };
}
