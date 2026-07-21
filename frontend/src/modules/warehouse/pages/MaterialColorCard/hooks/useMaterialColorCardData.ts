import { useCallback, useEffect, useState } from 'react';
import { Form, message as antdMessage } from 'antd';
import api from '@/utils/api';
import type { MaterialColorCard, MaterialColorCardItem } from '../types';

export const useMaterialColorCardData = () => {
  const [dataList, setDataList] = useState<MaterialColorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
  const [total, setTotal] = useState(0);

  // 母卡新建/编辑弹窗
  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<MaterialColorCard | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [coverImageFiles, setCoverImageFiles] = useState<any[]>([]);

  // 查看颜色详情弹窗
  const [colorDetailVisible, setColorDetailVisible] = useState(false);
  const [colorDetailItem, setColorDetailItem] = useState<MaterialColorCardItem | null>(null);
  const [colorDetailParent, setColorDetailParent] = useState<MaterialColorCard | null>(null);

  // 物料管理弹窗
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<MaterialColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');

  // ==================== 列表加载 ====================
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { keyword, page, pageSize };
      if (materialType) params.materialType = materialType;
      const res = await api.get<{ code: number; data: any; message?: string }>(
        '/material-color-card/list', { params },
      );
      if (res.code === 200) {
        setDataList(res.data?.records || []);
        setTotal(res.data?.total || 0);
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, materialType, page, pageSize]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 打开颜色详情（合并母卡+颜色信息）
  const openColorDetail = (card: MaterialColorCard, item: MaterialColorCardItem) => {
    setColorDetailParent(card);
    setColorDetailItem(item);
    setColorDetailVisible(true);
  };

  // ==================== 母卡 CRUD ====================
  const openCreateDialog = async () => {
    setCurrentCard(null);
    form.resetFields();
    setCoverImageFiles([]);
    try {
      const res = await api.get<{ code: number; data: string }>('/material-color-card/generate-code');
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ cardCode: res.data, materialType: 'fabric' });
      }
    } catch (e) { console.error('[MaterialColorCard] 生成编号失败:', e); }
    setDialogVisible(true);
  };

  const openEditDialog = (card: MaterialColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.coverImage ? [{ url: card.coverImage }] : []);
    form.setFieldsValue({
      cardCode: card.cardCode,
      cardName: card.cardName,
      materialType: card.materialType || 'fabric',
      fabricWidth: card.fabricWidth,
      specifications: card.specifications,
      fabricWeight: card.fabricWeight,
      fabricComposition: card.fabricComposition,
      unit: card.unit,
      supplierId: card.supplierId,
      supplierName: card.supplierName,
      supplierContactPerson: card.supplierContactPerson,
      supplierContactPhone: card.supplierContactPhone,
      coverImage: card.coverImage,
      remark: card.remark,
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      if (coverImageFiles.length > 0) {
        values.coverImage = (coverImageFiles[0] as any)?.url || '';
      }
      if (currentCard?.id) {
        await api.put('/material-color-card', { id: currentCard.id, ...values });
        antdMessage.success('更新成功');
      } else {
        await api.post('/material-color-card', values);
        antdMessage.success('创建成功');
      }
      setDialogVisible(false);
      fetchList();
    } catch (err: any) {
      if (err?.errorFields) return;
      antdMessage.error(err?.message || '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/material-color-card/${id}`);
      antdMessage.success('删除成功');
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '删除失败');
    }
  };

  // ==================== 物料条目管理 ====================
  const openItemsDialog = async (card: MaterialColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.cardName);
    setColorDetailParent(card);
    try {
      const res = await api.get<{ code: number; data: any }>(`/material-color-card/${card.id}`);
      if (res.code === 200) {
        setCurrentItems(res.data?.items || []);
      } else {
        setCurrentItems([]);
      }
    } catch {
      setCurrentItems([]);
    }
    setItemVisible(true);
  };

  const addEmptyItem = () => {
    const next: MaterialColorCardItem = {
      materialCode: '',
      materialName: '',
      materialType: currentCard?.materialType || 'fabric',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
  };

  const updateItem = (idx: number, field: keyof MaterialColorCardItem, value: any) => {
    const next = [...currentItems];
    (next[idx] as any)[field] = value;
    setCurrentItems(next);
  };

  const removeItem = (idx: number) => {
    const next = [...currentItems];
    next.splice(idx, 1);
    setCurrentItems(next);
  };

  const saveItems = async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter((it) => it.materialName);
    if (validItems.length === 0) {
      antdMessage.warning('至少填写一条物料');
      return;
    }
    try {
      await api.post(`/material-color-card/${currentCardId}/items/batch`, { items: validItems });
      antdMessage.success(`已保存 ${validItems.length} 条物料`);
      setItemVisible(false);
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '保存失败');
    }
  };

  // ==================== 生成物料到物料库 ====================
  const handleGenerateMaterials = async (card: MaterialColorCard) => {
    try {
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/material-color-card/${card.id}/generate-materials`,
      );
      if (res.code === 200) {
        antdMessage.success(`成功生成 ${res.data.length} 条物料到物料资料`);
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '生成失败');
    }
  };

  return {
    // 列表
    dataList, loading, keyword, setKeyword,
    materialType, setMaterialType,
    page, setPage, pageSize, setPageSize, total,
    fetchList,
    // 母卡编辑
    dialogVisible, setDialogVisible,
    currentCard, form, submitting, coverImageFiles, setCoverImageFiles,
    openCreateDialog, openEditDialog, handleSave, handleDelete,
    // 颜色详情
    colorDetailVisible, setColorDetailVisible,
    colorDetailItem, colorDetailParent,
    openColorDetail,
    // 物料管理
    itemVisible, setItemVisible,
    currentItems, currentCardName,
    openItemsDialog, addEmptyItem, updateItem, removeItem, saveItems,
    // 生成物料
    handleGenerateMaterials,
  };
};
