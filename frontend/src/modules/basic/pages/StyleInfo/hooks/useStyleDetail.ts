import { useState, useEffect, useRef } from 'react';
import { Form, App } from 'antd';
import { useSearchParams } from 'react-router-dom';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import dayjs from 'dayjs';
import { normalizeCategoryQuery, normalizeSeasonQuery } from '@/utils/styleCategory';

/**
 * 款式详情数据管理 Hook
 * 负责详情加载、表单同步、Tab切换
 */
export const useStyleDetail = (styleId?: string) => {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();

  const [loading, setLoading] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<StyleInfo | null>(null);
  const [activeTabKey, setActiveTabKey] = useState('1');
  const [editLocked, setEditLocked] = useState(false);

  const lastEmptyHintTabKeyRef = useRef<string | null>(null);

  const isNewPage = styleId === 'new';
  const isDetailPage = Boolean(styleId) && !isNewPage;
  const isEditorOpen = isNewPage || isDetailPage;

  // 从URL查询参数获取Tab
  const tabKeyFromQuery = (() => {
    const tab = (searchParams.get('tab') || '').toLowerCase();
    if (tab === 'bom') return '2';
    if (tab === 'quotation') return '5';
    if (tab === 'attachment' || tab === 'file' || tab === 'files') return '6';
    if (tab === 'pattern' || tab === 'size' || tab === 'process') return '7';
    if (tab === 'sample') return '8';
    return null;
  })();

  /**
   * 加载款式详情
   */
  const fetchDetail = async (id: string) => {
    if (!id || id === 'new') return;

    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleInfo; message?: string }>(`/style/info/${id}`);
      if (res.code === 200 && res.data) {
        setCurrentStyle(res.data);
        setEditLocked(Boolean(res.data.id)); // 加载后默认锁定
        return res.data;
      }
      message.error(res.message || '获取样衣详情失败');
      return null;
    } catch (error) {
      message.error('获取样衣详情失败');
      return null;
    } finally {
      setLoading(false);
    }
  };

  /**
   * 重置表单和状态
   */
  const resetForm = () => {
    setCurrentStyle(null);
    form.resetFields();
    setEditLocked(false);
    setActiveTabKey('1');
  };

  // 加载详情（当styleId变化时）
  useEffect(() => {
    if (!styleId) return;

    if (isNewPage) {
      // 新建页面：重置表单
      resetForm();
      return;
    }

    // 详情页：加载数据
    fetchDetail(styleId);
    setActiveTabKey(tabKeyFromQuery || '1');
  }, [styleId, tabKeyFromQuery, isNewPage]);

  // 当详情数据变化时，同步到表单
  useEffect(() => {
    if (!isEditorOpen || !currentStyle) return;

    const nextValues: Record<string, any> = { ...currentStyle };
    const rawCreateTime = nextValues.createTime;
    const rawDeliveryDate = nextValues.deliveryDate;

    nextValues.category = normalizeCategoryQuery(nextValues.category);
    nextValues.season = normalizeSeasonQuery(nextValues.season);

    // 转换日期字段为 dayjs 对象
    nextValues.createTime = rawCreateTime ? dayjs(rawCreateTime) : undefined;
    nextValues.deliveryDate = rawDeliveryDate ? dayjs(rawDeliveryDate) : undefined;

    form.setFieldsValue(nextValues);
  }, [currentStyle, form, isEditorOpen]);

  // URL Tab参数变化时切换
  useEffect(() => {
    if (!tabKeyFromQuery || !isEditorOpen) return;
    setActiveTabKey(tabKeyFromQuery);
  }, [tabKeyFromQuery, isEditorOpen]);

  return {
    // 状态
    loading,
    currentStyle,
    setCurrentStyle,
    activeTabKey,
    setActiveTabKey,
    editLocked,
    setEditLocked,
    lastEmptyHintTabKeyRef,

    // 表单
    form,

    // 方法
    fetchDetail,
    resetForm,

    // 标志
    isNewPage,
    isDetailPage,
    isEditorOpen,
  };
};
