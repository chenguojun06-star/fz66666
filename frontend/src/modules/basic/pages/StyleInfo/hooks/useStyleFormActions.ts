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
  const { message, modal } = App.useApp();
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

  const styleNoTaken = async (styleNo: string): Promise<boolean> => {
    try {
      const checkRes = await api.get<{ code: number; data: { records: any[] } }>('/style/info/list', {
        params: { styleNo, page: 1, pageSize: 1 }
      });
      return checkRes.code === 200 && (checkRes.data?.records?.length ?? 0) > 0;
    } catch {
      return false;
    }
  };

  /**
   * D-215：款号撞号不再静默加后缀——先弹窗提示用户"返回修改"或确认"自动加后缀"。
   * 返回 null 表示用户选择返回修改，保存流程中止。
   */
  const ensureUniqueStyleNo = async (initialStyleNo: string): Promise<string | null> => {
    if (!(await styleNoTaken(initialStyleNo))) {
      return initialStyleNo;
    }
    return new Promise((resolve) => {
      modal.confirm({
        title: '款号已存在',
        content: `款号 ${initialStyleNo} 已被其他款式使用，可返回修改，或确认后自动加后缀保存（如 ${initialStyleNo}-1）`,
        okText: '自动加后缀保存',
        cancelText: '返回修改',
        onOk: async () => {
          let suffix = 1;
          while (await styleNoTaken(`${initialStyleNo}-${suffix}`)) {
            suffix += 1;
          }
          const finalStyleNo = `${initialStyleNo}-${suffix}`;
          message.info(`已自动调整为 ${finalStyleNo}`);
          resolve(finalStyleNo);
        },
        onCancel: () => resolve(null),
      });
    });
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
        // D-215：编辑允许修改款式编码，撞号先在前端拦截提示（后端也会兜底校验）
        const nextStyleNo = (normalizedValues.styleNo || '').trim();
        if (nextStyleNo && nextStyleNo !== currentStyle.styleNo && (await styleNoTaken(nextStyleNo))) {
          message.error(`款号 ${nextStyleNo} 已被其他款式使用，请修改款号`);
          return false;
        }
        const payload: Record<string, any> = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.completedTime;
        delete payload.pushedToOrder;
        delete payload.pushedToOrderTime;
        delete payload.description;
        // remark 与 customer 已迁移至 BasicInfoSection 维护，保留提交
        res = await api.put('/style/info', normalizePayload(payload));
      } else {
        let styleNo = normalizedValues.styleNo?.trim() || '';
        if (!styleNo) {
          styleNo = await generateStyleNo();
        }
        const finalStyleNo = await ensureUniqueStyleNo(styleNo);
        if (!finalStyleNo) {
          // 用户选择"返回修改"，中止保存（saving 状态由 finally 复位）
          return false;
        }
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
          // D-253:编辑保存后同样上传封面/主图区的待上传图片。
          // 此前仅在新建分支上传，编辑时更换封面/主图(进入 pendingImages)保存后图片丢失
          if (pendingImages.length > 0 || pendingColorImages.length > 0) {
            try {
              const { standaloneImages, colorUploads } = separateStandaloneAndColorImages(
                pendingImages,
                pendingColorImages
              );
              const styleNoStr = String(currentStyle.styleNo || normalizedValues.styleNo || '').trim();
              const successCount = await uploadStyleImages(String(currentStyle.id), styleNoStr, standaloneImages, colorUploads);
              if (successCount > 0) {
                message.success(`成功上传 ${successCount} 张图片`);
              }
            } catch (error: unknown) {
              message.error(error instanceof Error ? error.message : '图片上传失败');
            }
          }
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
        // 同步警告透传展示：部分资料同步失败不影响推送主流程，但不提示会让用户下单时才发现资料缺失
        const warnings: string[] = Array.isArray(res.data?.syncWarnings) ? res.data.syncWarnings : [];
        if (warnings.length > 0) {
          message.warning(`推送成功，但 ${warnings.length} 项资料同步失败：${warnings.join('；')}`);
        } else {
          message.success('推送成功！请前往"商品下单"页面创建订单');
        }
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
