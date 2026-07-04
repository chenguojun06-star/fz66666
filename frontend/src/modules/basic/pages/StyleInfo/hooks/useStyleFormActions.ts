import { useState } from 'react';
import { App, FormInstance } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import { formatDateTimeSecond } from '@/utils/datetime';
import { normalizeCategoryQuery, normalizeSeasonQuery } from '@/utils/styleCategory';
import dayjs from 'dayjs';
import { collectExtValues } from '@/components/common/SchemaForm/ExtFieldsSection';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

interface UseStyleFormActionsProps {
  form: FormInstance;
  currentStyle: StyleInfo | null;
  setCurrentStyle: (style: StyleInfo | null) => void;
  fetchDetail: (id: string) => void;
  setEditLocked: (locked: boolean) => void;
  isNewPage: boolean;
  customFields: FieldConfigItem[];
  // 颜色码数配置
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
  customFields,
  sizeColorConfig,
  pendingImages = [],
  pendingColorImages = [],
}: UseStyleFormActionsProps) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const isSameFile = (left: File, right: File) => (
    left.name === right.name
    && left.size === right.size
    && left.lastModified === right.lastModified
  );

  const [saving, setSaving] = useState(false);
  const [completingSample, setCompletingSample] = useState(false);
  const [pushingToOrder, setPushingToOrder] = useState(false);

  /**
   * 后端为 Long 类型的字段集合。
   * 前端某些组件可能把 String 类型的 ID 误填到这些字段中，
   * 提交时会导致 Jackson 反序列化 400。
   * 这里在提交前过滤掉无法解析为整数的字符串值。
   * 注：customerId 已改为 String 类型以匹配 Customer.id（UUID），不在此列。
   */
  const LONG_TYPE_FIELDS = new Set([
    'tenantId', 'factoryId', 'orderId', 'styleId', 'id',
  ]);

  /**
   * 规范化提交到后端的字段值：
   * - 日期/时间字段（dayjs/Date）→ yyyy-MM-dd HH:mm:ss 字符串
   * - 空字符串 → null（避免 Jackson 将 "" 解析为 Integer/LocalDateTime 失败）
   * - 布尔/字符串/数字保持原值
   */
  const normalizePayload = (obj: Record<string, any>): Record<string, any> => {
    const result: Record<string, any> = {};
    const isDateLike = (v: any): boolean =>
      v !== null && v !== undefined && (
        v instanceof Date ||
        (typeof v === 'object' && typeof v.toDate === 'function') || // dayjs/moment
        (typeof v === 'object' && v.$d instanceof Date) // dayjs internal
      );

    for (const key of Object.keys(obj)) {
      const raw = obj[key];
      if (raw === undefined) continue;

      // 1) dayjs/Date → yyyy-MM-dd HH:mm:ss
      if (isDateLike(raw)) {
        try {
          result[key] = formatDateTimeSecond(raw);
        } catch {
          result[key] = null;
        }
        continue;
      }

      // 2) 空字符串 → null（后端 Integer/LocalDateTime 都不能解析 ""）
      if (typeof raw === 'string' && raw.trim() === '') {
        result[key] = null;
        continue;
      }

      // 2.5) 后端 Long 类型字段：前端可能误传 String 哈希（如 Customer.id 是 String，
      //      但 StyleInfo.customerId 是 Long），过滤掉无法解析为整数的值
      if (typeof raw === 'string' && LONG_TYPE_FIELDS.has(key)) {
        const trimmed = raw.trim();
        if (!/^\d+$/.test(trimmed)) {
          result[key] = null;
          continue;
        }
        result[key] = Number(trimmed);
        continue;
      }

      // 3) 嵌套对象 / 数组：递归规范化（但跳过 Blob/File 等二进制对象）
      if (raw !== null && typeof raw === 'object' && !(raw instanceof File) && !(raw instanceof Blob)) {
        if (Array.isArray(raw)) {
          result[key] = raw.map((item) =>
            item !== null && typeof item === 'object' ? normalizePayload(item as Record<string, any>) : item
          );
        } else {
          result[key] = normalizePayload(raw);
        }
        continue;
      }

      result[key] = raw;
    }
    return result;
  };

  /**
   * 保存基础信息
   */
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      // 计算样衣数量总和（先校验）
      const totalQuantity = (sizeColorConfig.matrixRows?.length
        ? sizeColorConfig.matrixRows.reduce((sum, row) => sum + (row.quantities || []).reduce((subtotal, qty) => subtotal + Number(qty || 0), 0), 0)
        : sizeColorConfig.quantities.reduce((sum, qty) => sum + (qty || 0), 0));

      // 校验：样衣数量必须至少1件
      if (totalQuantity <= 0) {
        message.error('请至少填写1件样衣数量');
        return false;
      }

      setSaving(true);

      const normalizedValues: Record<string, any> = { ...values };

      delete normalizedValues.createTime;
      delete normalizedValues.completedTime;
      delete normalizedValues.pushedToOrder;
      delete normalizedValues.pushedToOrderTime;
      delete normalizedValues.remark; // 后端 StyleInfo 无此字段
      delete normalizedValues.customer; // 后端用 customerId，不识别 customer，避免发送未知属性

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
      if (!String(normalizedValues.patternNo || '').trim()) {
        normalizedValues.patternNo = `ZYH${dayjs().format('YYYYMMDDHHmmss')}`;
      }
        normalizedValues.category = normalizeCategoryQuery(normalizedValues.category);
        normalizedValues.season = normalizeSeasonQuery(normalizedValues.season);

      // 提取第一个有效颜色作为样衣生产的颜色字段
      const firstColor = sizeColorConfig.matrixRows?.find((row) => row.color && row.color.trim())?.color
        || sizeColorConfig.colors.find(c => c && c.trim());
      if (firstColor) {
        normalizedValues.color = firstColor.trim();
      }
      const selectedSizes = sizeColorConfig.sizes
        .map((size) => String(size || '').trim())
        .filter(Boolean);
      if (selectedSizes.length) {
        normalizedValues.size = selectedSizes.join('/');
      }

      // 设置样衣数量
      normalizedValues.sampleQuantity = totalQuantity;

      // 收集扩展字段
      normalizedValues.extJson = collectExtValues(form, customFields, { extJson: currentStyle?.extJson });

      let res;
      if (currentStyle?.id) {
        // 更新
        const payload: Record<string, any> = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.completedTime;
        delete payload.pushedToOrder;
        delete payload.pushedToOrderTime;
        delete payload.description;
        delete payload.remark; // 后端 StyleInfo 无此字段
        delete payload.customer; // 后端用 customerId
        res = await api.put('/style/info', normalizePayload(payload));
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

        res = await api.post('/style/info', normalizePayload(normalizedValues));
      }

      if (res.code === 200) {
        message.success(currentStyle?.id ? '更新成功' : '创建成功');

        // 保存成功后锁定表单
        setEditLocked(true);

        // 如果是新建页面，保存后上传待上传的图片，然后跳转到详情页
        if (isNewPage && res.data?.id) {
          const newId = String(res.data.id);

          // 上传待上传的图片
          if (pendingImages.length > 0 || pendingColorImages.length > 0) {
            try {
              const standaloneImages = pendingImages.filter((file) =>
                !pendingColorImages.some((item) => isSameFile(item.file, file))
              );
              const uploadPromises = standaloneImages.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('styleId', newId);
                formData.append('styleNo', String(normalizedValues.styleNo || '').trim());
                return api.post('/style/attachment/upload', formData, { timeout: 60000 } as any);
              });
              const colorUploadPromises = pendingColorImages.map(async ({ color, file }) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('styleId', newId);
                formData.append('styleNo', String(normalizedValues.styleNo || '').trim());
                formData.append('bizType', `color_image::${String(color || '').trim()}`);
                return api.post('/style/attachment/upload', formData, { timeout: 60000 } as any);
              });
              const uploadResults = await Promise.all([...uploadPromises, ...colorUploadPromises]);
              const successCount = uploadResults.filter((r: any) => r.code === 200).length;
              if (successCount > 0) {
                message.success(`成功上传 ${successCount} 张图片`);
              }
            } catch (error: unknown) {
              message.error(error instanceof Error ? error.message : '图片上传失败');
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
        // 后端 400 时携带具体字段提示，直接展示给用户便于排查
        message.error(res.message || '保存失败');
        return false;
      }
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'errorFields' in error) {
        message.error('请完善表单信息');
      } else {
        // axios 错误：优先展示后端返回的 message（包含字段定位提示）
        const axiosErr = typeof error === 'object' && error !== null && 'response' in error ? (error as any).response?.data?.message : null;
        message.error(axiosErr || (error instanceof Error ? error.message : '保存失败'));
      }
      return false;
    } finally {
      setSaving(false);
    }
  };

  /**
   * 标记样衣开发完成
   */
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
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '推送失败');
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
