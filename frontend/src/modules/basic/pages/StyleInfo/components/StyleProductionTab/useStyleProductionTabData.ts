import { useState, useRef, useCallback } from 'react';
import { Form } from 'antd';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import { message } from '@/utils/antdStatic';
import { useUser } from '@/utils/AuthContext';
import { buildProductionSheetHtml } from '../../../DataCenter/buildProductionSheetHtml';
import { downloadHtmlFile } from './helpers';
import type { StyleProductionTabProps } from './types';

/** 工艺制单图片附件 bizType（存 t_style_attachment，与一般款式图隔离） */
const SHEET_IMAGE_BIZ = 'workorder';
/** 制单图片上限 */
const SHEET_IMAGE_MAX = 9;

/**
 * AI 工艺单识别文本清洗（D-263，与后端 StyleDocOcrOrchestrator.cleanRecognizedText 同口径）：
 * 工艺单常以 HTML 源码形态截图，识别结果会夹带 <div>/<span>/<h3> 标签与行号痕迹。
 * - 块级标签与 <br> → 换行；其余标签剥除；HTML 实体解码
 * - 行首行号痕迹剥除（纯数字行丢弃；"15 整件..." → "整件..."；3 位以上数字视为正文保留）
 */
const cleanOcrRawText = (raw: string): string => {
  if (!raw) return raw;
  let t = raw
    .replace(/<\/?(?:div|p|li|ul|ol|tr|h[1-6]|section|article|table)\b[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
  t = t
    .split(/\r\n|\r|\n/)
    .filter((line, _, arr) => {
      const trimmed = line.trim();
      // 纯数字行丢弃（源码视图行号残留，仅保留空行判别）
      return !(trimmed && /^\d{1,3}$/.test(trimmed));
    })
    .map((line) => {
      const trimmed = line.trim();
      if (/^\d{1,2}\s+.*[\u4e00-\u9fa5]/.test(trimmed)) {
        return trimmed.replace(/^\d{1,2}\s+/, '');
      }
      return trimmed;
    })
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return t;
};

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

  // ---- 工艺制单图片（编辑器内嵌式：粘贴/拖拽上传到附件库 bizType=workorder，URL 内嵌 description） ----
  const [sheetUploading, setSheetUploading] = useState(false);

  /** 上传一张制单图片到附件库，返回 URL（数量上限由编辑器粘贴处校验） */
  const uploadSheetImage = useCallback(async (file: File): Promise<string> => {
    if (!styleId) throw new Error('请先保存基础信息');
    setSheetUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('styleId', String(styleId));
      formData.append('bizType', SHEET_IMAGE_BIZ);
      const res = await api.post<{ code: number; data: { fileUrl?: string } | string; message?: string }>(
        '/style/attachment/upload', formData, { timeout: 60000 }
      );
      if (res.code !== 200) throw new Error(res.message || '上传失败');
      const url = typeof res.data === 'string' ? res.data : res.data?.fileUrl;
      if (!url) throw new Error('上传失败');
      return url;
    } finally {
      setSheetUploading(false);
    }
  }, [styleId]);

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
    // 制单图片注入 payload（打印/下载同源，与详情页一致）
    const next = {
      ...(payload || {}),
      style: {
        ...((payload || {})?.style || {}),
        ...(productionReqEditable ? { description: String(productionReqRows[0] ?? '') } : {}),
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
        // D-263：老后端/异常识别结果可能夹带 HTML 标签与行号痕迹，展示前统一清洗
        setOcrText(cleanOcrRawText(res.data?.rawText || ''));
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

  const handleContentChange = (html: string) => {
    // 编辑器内容（含内嵌图片的轻量 HTML）整段存 index 0
    onProductionReqChange(0, html);
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
    // 工艺制单图片（编辑器内嵌式）
    sheetImageMax: SHEET_IMAGE_MAX,
    sheetUploading,
    uploadSheetImage,
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
    // 编辑器
    handleContentChange,
  };
}
