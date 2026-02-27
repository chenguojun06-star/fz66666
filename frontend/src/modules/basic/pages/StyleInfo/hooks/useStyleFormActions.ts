import { useState } from 'react';
import { App, FormInstance } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { formatDateTimeSecond } from '@/utils/datetime';
import { normalizeCategoryQuery, normalizeSeasonQuery } from '@/utils/styleCategory';

interface UseStyleFormActionsProps {
  form: FormInstance;
  currentStyle: StyleInfo | null;
  setCurrentStyle: (style: StyleInfo | null) => void;
  fetchDetail: (id: string) => void;
  setEditLocked: (locked: boolean) => void;
  isNewPage: boolean;
  // 颜色码数配置
  sizeColorConfig: {
    sizes: [string, string, string, string, string];
    colors: [string, string, string, string, string];
    quantities: [number, number, number, number, number];
    commonSizes: string[];
    commonColors: string[];
  };
  pendingImages?: File[];
}

/**
 * 款式表单操作 Hook
 * 负责保存、完成样衣、推送到订单等操作
 */
export const useStyleFormActions = ({
  form,
  currentStyle,
  setCurrentStyle: _setCurrentStyle,
  fetchDetail,
  setEditLocked,
  isNewPage,
  sizeColorConfig,
  pendingImages = []
}: UseStyleFormActionsProps) => {
  const { message } = App.useApp();
  const navigate = useNavigate();

  const [saving, setSaving] = useState(false);
  const [completingSample, setCompletingSample] = useState(false);
  const [pushingToOrder, setPushingToOrder] = useState(false);

  /**
   * 保存基础信息
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      const normalizedValues: Record<string, any> = { ...values };

      // 处理 createTime 字段
      const ct = normalizedValues.createTime;
      if (ct) {
        const formatted = formatDateTimeSecond(ct);
        if (formatted && formatted !== '-') {
          normalizedValues.createTime = formatted;
        } else {
          delete normalizedValues.createTime;
        }
      } else {
        delete normalizedValues.createTime;
      }

      // 处理 deliveryDate 字段
      const dd = normalizedValues.deliveryDate;
      if (dd) {
        const formatted = formatDateTimeSecond(dd);
        if (formatted && formatted !== '-') {
          normalizedValues.deliveryDate = formatted;
        }
      }

      // 添加颜色码数配置数据
      normalizedValues.sizeColorConfig = JSON.stringify(sizeColorConfig);
        normalizedValues.category = normalizeCategoryQuery(normalizedValues.category);
        normalizedValues.season = normalizeSeasonQuery(normalizedValues.season);

      // 提取第一个有效颜色作为样衣生产的颜色字段
      const firstColor = sizeColorConfig.colors.find(c => c && c.trim());
      if (firstColor) {
        normalizedValues.color = firstColor.trim();
      }

      // 计算样衣数量总和
      const totalQuantity = sizeColorConfig.quantities.reduce((sum, qty) => sum + (qty || 0), 0);
      if (totalQuantity > 0) {
        normalizedValues.sampleQuantity = totalQuantity;
      }

      let res;
      if (currentStyle?.id) {
        // 更新
        const payload: Record<string, any> = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.description;
        res = await api.put('/style/info', payload);
      } else {
        // 新建：自动生成款号（如果未填写）
        let styleNo = normalizedValues.styleNo?.trim() || '';
        if (!styleNo) {
          const serialRes = await api.get<{ code: number; data: string }>('/system/serial/generate', {
            params: { ruleCode: 'STYLE_NO' }
          });
          styleNo = serialRes.code === 200 && serialRes.data
            ? serialRes.data
            : 'ST' + Date.now();
        }

        // 检查款号是否重复
        let finalStyleNo = styleNo;
        let suffix = 1;
        let isDuplicate = true;

        while (isDuplicate) {
          try {
            const checkRes = await api.get<{ code: number; data: { records: any[] } }>('/style/info/list', {
              params: { styleNo: finalStyleNo, page: 1, pageSize: 1 }
            });

            if (checkRes.code === 200 && checkRes.data?.records && checkRes.data.records.length > 0) {
              finalStyleNo = `${styleNo}-${suffix}`;
              suffix++;
            } else {
              isDuplicate = false;
            }
          } catch {
            isDuplicate = false;
          }
        }

        normalizedValues.styleNo = finalStyleNo;
        if (finalStyleNo !== styleNo) {
          message.info(`款号 ${styleNo} 已存在，自动调整为 ${finalStyleNo}`);
        }

        res = await api.post('/style/info', normalizedValues);
      }

      if (res.code === 200) {
        message.success(currentStyle?.id ? '更新成功' : '创建成功');

        // 保存成功后锁定表单
        setEditLocked(true);

        // 如果是新建页面，保存后上传待上传的图片，然后跳转到详情页
        if (isNewPage && res.data?.id) {
          const newId = String(res.data.id);

          // 上传待上传的图片
          if (pendingImages.length > 0) {
            try {
              const uploadPromises = pendingImages.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('styleId', newId);
                return api.post('/style/attachment/upload', formData);
              });
              const uploadResults = await Promise.all(uploadPromises);
              const successCount = uploadResults.filter((r: any) => r.code === 200).length;
              if (successCount > 0) {
                message.success(`成功上传 ${successCount} 张图片`);
              }
            } catch (error) {
              message.error('图片上传失败');
            }
          }

          // 跳转到详情页
          navigate(`/style-info/${newId}`);
        } else if (currentStyle?.id) {
          // 更新成功，刷新详情
          fetchDetail(String(currentStyle.id));
        }

        return true;
      } else {
        message.error(res.message || '保存失败');
        return false;
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善表单信息');
      } else {
        message.error(error?.message || '保存失败');
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * 样衣完成
   */
  const handleCompleteSample = async () => {
    if (!currentStyle?.id) return;

    // 检查样衣生产模块是否已完成
    const productionCompletedTime = (currentStyle as any)?.productionCompletedTime;
    if (!productionCompletedTime) {
      message.warning('请先完成样衣生产后再进行样衣完成操作');
      return;
    }

    setCompletingSample(true);
    try {
      const res = await api.post(`/style/info/${currentStyle.id}/sample/complete`, null, { timeout: 30000 });
      if (res.code === 200) {
        message.success('样衣开发已完成');
        fetchDetail(String(currentStyle.id));
        return true;
      } else {
        message.error(res.message || '操作失败');
        return false;
      }
    } catch (error: any) {
      const errMsg = error?.response?.data?.message || error?.message || '操作失败';
      message.error(errMsg);
      return false;
    } finally {
      setCompletingSample(false);
    }
  };

  /**
   * 推送到下单管理
   */
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
          priceType, // 'process' 或 'sizePrice'
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
    } catch (error: any) {
      message.error(error?.message || '推送失败');
      return false;
    } finally {
      setPushingToOrder(false);
    }
  };

  /**
   * 解锁编辑
   */
  const handleUnlock = () => {
    setEditLocked(false);
  };

  /**
   * 返回列表
   */
  const handleBackToList = () => {
    navigate('/style-info');
  };

  return {
    // 状态
    saving,
    completingSample,
    pushingToOrder,

    // 操作
    handleSave,
    handleCompleteSample,
    handlePushToOrder,
    handleUnlock,
    handleBackToList,
  };
};
