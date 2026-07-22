import { useState, useCallback } from 'react';
import type { ChangeEvent } from 'react';
import api from '@/utils/api';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { Message } from './types';
import type { PurchaseDocCardData } from './AgentCards';
import { extractOrderNo, isPurchaseDocFile, shouldAutoInbound, shouldAutoArrival } from './helpers';
import { isImageFile, validateFile, buildImageContextText } from './helpers';

interface UseFileAttachmentOptions {
  inputValue: string;
  setInputValue: (value: string) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  handleSend: (text?: string) => Promise<void> | void;
  speak: (text: string) => void;
  startStream: (contextualText: string, text: string, reportType?: 'daily' | 'weekly' | 'monthly', imageUrl?: string) => void;
  user: unknown;
}

export function useFileAttachment(options: UseFileAttachmentOptions) {
  const { inputValue, setInputValue, setMessages, handleSend, speak, startStream, user } = options;
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleFileSelect = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateFile(file);
    if (!validation.valid) {
      alert(validation.error);
      return;
    }
    setAttachedFile(file);

    if (isImageFile(file)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPreviewImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPreviewImage(null);
    }

    e.target.value = '';
  }, []);

  const handleCancelPreview = useCallback(() => {
    setAttachedFile(null);
    setPreviewImage(null);
  }, []);

  const handleSendWithAttachment = useCallback(async () => {
    if (!attachedFile) {
      void handleSend();
      return;
    }
    const question = inputValue.trim();
    setUploadingFile(true);

    if (isImageFile(attachedFile)) {
      const userMsgText = question
        ? `📷 我上传了一张图片\n${question}`
        : '📷 我上传了一张图片，请帮我分析';

      const userMessageId = `u-${Date.now()}`;
      const localPreviewUrl = previewImage || undefined;
      setMessages(prev => [...prev, {
        id: userMessageId,
        role: 'user' as const,
        text: userMsgText,
        imageUrl: localPreviewUrl,
      }]);
      setInputValue('');
      const fileToUpload = attachedFile;
      setAttachedFile(null);
      setPreviewImage(null);

      try {
        const formData = new FormData();
        formData.append('file', fileToUpload);
        const uploadResp = await api.post<{ code: number; data: string; message?: string }>(
          '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
        );

        let serverImageUrl = '';
        if (uploadResp.code === 200 && uploadResp.data) {
          serverImageUrl = String(uploadResp.data);
        } else {
          console.warn('[小云AI] 图片上传失败，将用本地base64预览发送');
          serverImageUrl = localPreviewUrl || '';
        }

        const factoryId = (user as any)?.factoryId;
        const factoryName = (user as any)?.factoryName;
        const contextualText = buildImageContextText(
          question,
          factoryId,
          factoryName,
          !!serverImageUrl,
        );

        setUploadingFile(false);
        startStream(contextualText, question || '图片分析', undefined, serverImageUrl);

        setTimeout(() => {
          if (serverImageUrl && serverImageUrl.startsWith('http')) {
            setMessages(prev => prev.map(m => m.id === userMessageId
              ? { ...m, imageUrl: serverImageUrl } : m));
          }
        }, 1000);
      } catch {
        setUploadingFile(false);
        setMessages(prev => [...prev, { id: `err-${Date.now()}`, role: 'ai' as const, text: `❌ 图片上传失败，请稍后重试。` }]);
      }
      return;
    }

    const userMsgText = question ? `📎 ${attachedFile.name}\n${question}` : `📎 ${attachedFile.name}`;
    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user' as const, text: userMsgText }]);
    setInputValue('');
    const fileToUpload = attachedFile;
    setAttachedFile(null);
    try {
      if (isPurchaseDocFile(fileToUpload)) {
        const orderNo = extractOrderNo(question);
        const recognized = await intelligenceApi.recognizePurchaseDoc(fileToUpload, orderNo);
        const autoMode = shouldAutoInbound(question) ? 'inbound' : shouldAutoArrival(question) ? 'arrival' : null;
        let purchaseDocCard = recognized as PurchaseDocCardData;
        if (autoMode) {
          purchaseDocCard = await intelligenceApi.autoExecutePurchaseDoc({
            docId: String((recognized as Record<string, unknown>).docId || ''),
            orderNo,
            warehouseLocation: autoMode === 'inbound' ? '默认仓' : undefined,
            confirmInbound: autoMode === 'inbound',
          }) as PurchaseDocCardData;
        }
        const aiText = autoMode
          ? `我已经按采购单据识别结果执行了${autoMode === 'inbound' ? '到货并入库' : '自动到货'}，你可以在下面查看匹配和执行情况。`
          : '我已经识别了这张采购单据，你可以先查看匹配结果，也可以继续让我直接自动到货或到货入库。';
        setUploadingFile(false);
        setMessages(prev => [...prev, { id: `a-doc-${Date.now()}`, role: 'ai' as const, text: aiText, purchaseDocCard }]);
        speak(aiText);
        return;
      }
      const result = await intelligenceApi.uploadAnalyze(fileToUpload);
      setUploadingFile(false);
      await handleSend(`${question || '请帮我分析这个文件'}\n\n${result.parsedContent}`);
    } catch {
      setUploadingFile(false);
      await handleSend(question || '文件上传失败，请直接描述需求');
    }
  }, [attachedFile, previewImage, inputValue, handleSend, speak, startStream, user, setInputValue, setMessages]);

  return {
    attachedFile,
    setAttachedFile,
    uploadingFile,
    previewImage,
    setPreviewImage,
    handleFileSelect,
    handleCancelPreview,
    handleSendWithAttachment,
  };
}
