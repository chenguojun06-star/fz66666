import { useState } from 'react';
import { App, FormInstance } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import {
  normalizePayload,
  calculateTotalQuantity,
  buildNormalizedValues,
  separateStandaloneAndColorImages,
  buildColorImageBizType,
} from './utils';

interface UseStyleFormActionsProps {
  form: FormInstance;
  currentStyle: StyleInfo | null;
  setCurrentStyle: (style: StyleInfo | null) => void;
  fetchDetail: (id: string) => void;
  setEditLocked: (locked: boolean) => void;
  isNewPage: boolean;
  customFields: FieldConfigItem[];
  sizeColorConfig: {
    sizes: string[];
    colors: string[];
    quantities: number[];
    commonSizes: string[];
    commonColors: string[];
    matrixRows?: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  };
  pendingImages?: File[];
  pendingColorImages?: Array<{ color: string; file: File }>;
}

export const useStyleFormActions = ({
  form,
  currentStyle,
  setCurrentStyle: _setCurrentStyle,
  fetchDetail,
  setEditLocked,
  isNewPage,
  customFields,
  sizeColorConfig,
  pendingImages = [],
  pendingColorImages = [],
}: UseStyleFormActionsProps) => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [completingSample, setCompletingSample] = useState(false);
  const [pushingToOrder, setPushingToOrder] = useState(false);

  const uploadStyleImages = async (
    styleId: string,
    styleNo: string,
    images: File[],
    colorImages: Array<{ color: string; file: File }>
  ): Promise<number> => {
    const uploadPromises = images.map(async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('styleId', styleId);
      formData.append('styleNo', styleNo);
      return api.post('/style/attachment/upload', formData, { timeout: 60000 } as any);
    });
    const colorUploadPromises = colorImages.map(async ({ color, file }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('styleId', styleId);
      formData.append('styleNo', styleNo);
      formData.append('bizType', buildColorImageBizType(color));
      return api.post('/style/attachment/upload', formData, { timeout: 60000 } as any);
    });
    const uploadResults = await Promise.all([...uploadPromises, ...colorUploadPromises]);
    return uploadResults.filter((r: any) => r.code === 200).length;
  };

  const ensureUniqueStyleNo = async (initialStyleNo: string): Promise<string> => {
    let finalStyleNo = initialStyleNo;
    let suffix = 1;
    let isDuplicate = true;

    while (isDuplicate) {
      try {
        const checkRes = await api.get<{ code: number; data: { records: any[] } }>('/style/info/list', {
          params: { styleNo: finalStyleNo, page: 1, pageSize: 1 }
        });

        if (checkRes.code === 200 && checkRes.data?.records && checkRes.data.records.length > 0) {
          finalStyleNo = `${initialStyleNo}-${suffix}`;
          suffix++;
        } else {
          isDuplicate = false;
        }
      } catch {
        isDuplicate = false;
      }
    }

    if (finalStyleNo !== initialStyleNo) {
      message.info(`款号 ${initialStyleNo} 已存在，自动调整为 ${finalStyleNo}`);
    }
    return finalStyleNo;
  };

  const generateStyleNo = async (): Promise<string> => {
    try {
      const serialRes = await api.get<{ code: number; data: string }>('/system/serial/generate', {
        params: { ruleCode: 'STYLE_NO' }
      });
      if (serialRes.code === 200 && serialRes.data) {
        return serialRes.data;
      }
    } catch {
      // fall through to default
    }
    return 'ST' + Date.now();
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      const totalQuantity = calculateTotalQuantity(sizeColorConfig);
      if (totalQuantity <= 0) {
        message.error('请至少填写1件样衣数量');
        return false;
      }

      setSaving(true);

      const normalizedValues = buildNormalizedValues({
        values,
        sizeColorConfig,
        customFields,
        form,
        currentStyleExtJson: currentStyle?.extJson,
      });

      let res;
      if (currentStyle?.id) {
        const payload: Record<string, any> = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.completedTime;
        delete payload.pushedToOrder;
        delete payload.pushedToOrderTime;
        delete payload.description;
        delete payload.remark;
        delete payload.customer;
        res = await api.put('/style/info', normalizePayload(payload));
      } else {
        let styleNo = normalizedValues.styleNo?.trim() || '';
        if (!styleNo) {
          styleNo = await generateStyleNo();
        }
        const finalStyleNo = await ensureUniqueStyleNo(styleNo);
        normalizedValues.styleNo = finalStyleNo;

        res = await api.post('/style/info', normalizePayload(normalizedValues));
      }

      if (res.code === 200) {
        message.success(currentStyle?.id ? '更新成功' : '创建成功');
        setEditLocked(true);

        if (isNewPage && res.data?.id) {
          const newId = String(res.data.id);
          const styleNoStr = String(normalizedValues.styleNo || '').trim();

          if (pendingImages.length > 0 || pendingColorImages.length > 0) {
            try {
              const { standaloneImages, colorUploads } = separateStandaloneAndColorImages(
                pendingImages,
                pendingColorImages
              );
              const successCount = await uploadStyleImages(newId, styleNoStr, standaloneImages, colorUploads);
              if (successCount > 0) {
                message.success(`成功上传 ${successCount} 张图片`);
              }
            } catch (error: unknown) {
              message.error(error instanceof Error ? error.message : '图片上传失败');
            }
          }

          navigate(`/style-info/${newId}`);
        } else if (currentStyle?.id) {
          fetchDetail(String(currentStyle.id));
        }

        return true;
      } else {
        message.error(res.message || '保存失败');
        return false;
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error('请完善表单信息');
      } else {
        const axiosErr = typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : null;
        message.error(axiosErr || (error instanceof Error ? error.message : '保存失败'));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteSample = async () => {
    if (!currentStyle?.id) return;

    setCompletingSample(true);
    try {
      const res = await api.post(`/style/info/${currentStyle.id}/stage-action?stage=sample&action=complete`, null, { timeout: 30000 });
      if (res.code === 200) {
        message.success('样衣开发已完成，可继续进行审核与入库');
        fetchDetail(String(currentStyle.id));
        return true;
      } else {
        message.error(res.message || '操作失败');
        return false;
      }
    } catch (error: unknown) {
      const errMsg = typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : (error instanceof Error ? error.message : '操作失败');
      message.error(errMsg);
      return false;
    } finally {
      setCompletingSample(false);
    }
  };

  const handlePushToOrder = async (priceType: string, remark?: string, targetTypes?: string[]) => {
    if (!currentStyle?.id) {
      message.error('请先保存样衣信息');
      return false;
    }

    setPushingToOrder(true);
    try {
      const res = await api.post<{ code: number; message: string; data: any }>(
        '/order-management/create-from-style',
        {
          styleId: currentStyle.id,
          priceType,
          remark,
          targetTypes: Array.isArray(targetTypes) ? targetTypes : [],
        }
      );

      if (res.code === 200) {
        message.success('推送成功！请前往"下单管理"页面创建订单');
        fetchDetail(String(currentStyle.id));
        return true;
      } else {
        message.error(res.message || '推送失败');
        return false;
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '推送失败');
      return false;
    } finally {
      setPushingToOrder(false);
    }
  };

  const handleUnlock = () => {
    setEditLocked(false);
  };

  const handleBackToList = () => {
    navigate('/style-info');
  };

  return {
    saving,
    completingSample,
    pushingToOrder,
    handleSave,
    handleCompleteSample,
    handlePushToOrder,
    handleUnlock,
    handleBackToList,
  };
};
