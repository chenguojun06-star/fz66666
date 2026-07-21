import { useCallback, useState } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import type { MaterialColorCard, MaterialColorCardItem } from './types';

// ===== 供应商色卡相关状态与业务逻辑（从 index.tsx 抽取）=====
export function useMaterialColorCard() {
  const { message } = App.useApp();

  // ===== 卡片视图数据 =====
  const [cardDataList, setCardDataList] = useState<MaterialColorCard[]>([]);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardPage, setCardPage] = useState(1);
  const [cardPageSize] = useState(12);
  const [cardTotal, setCardTotal] = useState(0);
  const [cardKeyword, setCardKeyword] = useState('');
  const [cardMaterialType, setCardMaterialType] = useState('');

  // 物料管理弹窗
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<MaterialColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');
  const [currentCard, setCurrentCard] = useState<MaterialColorCard | null>(null);

  // 母卡新建/编辑弹窗
  const [cardDialogVisible, setCardDialogVisible] = useState(false);
  const [cardForm] = Form.useForm();
  const [coverImageFiles, setCoverImageFiles] = useState<any[]>([]);

  const fetchCardList = useCallback(async () => {
    setCardLoading(true);
    try {
      const params: any = { keyword: cardKeyword, page: cardPage, pageSize: cardPageSize };
      if (cardMaterialType) params.materialType = cardMaterialType;
      const res = await api.get<{ code: number; data: any; message?: string }>(
        '/material-color-card/list', { params },
      );
      if (res.code === 200) {
        setCardDataList(res.data?.records || []);
        setCardTotal(res.data?.total || 0);
      }
    } catch (err: any) {
      // 表格不存在时静默（迁移未跑）
    } finally {
      setCardLoading(false);
    }
  }, [cardKeyword, cardMaterialType, cardPage, cardPageSize]);

  const openCardItemsDialog = useCallback(async (card: MaterialColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.cardName);
    setCurrentCard(card);
    try {
      const res = await api.get<{ code: number; data: any }>(`/material-color-card/${card.id}`);
      if (res.code === 200) setCurrentItems(res.data?.items || []);
      else setCurrentItems([]);
    } catch { setCurrentItems([]); }
    setItemVisible(true);
  }, []);

  const addEmptyCardItem = useCallback(() => {
    setCurrentItems((prev) => [...prev, {
      materialCode: '', materialName: '', materialType: currentCard?.materialType || 'fabric',
      unitPrice: undefined, image: '', remark: '',
    }]);
  }, [currentCard?.materialType]);

  const updateCardItem = useCallback((idx: number, field: keyof MaterialColorCardItem, value: any) => {
    setCurrentItems((prev) => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      return next;
    });
  }, []);

  const removeCardItem = useCallback((idx: number) => {
    setCurrentItems((prev) => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
    });
  }, []);

  const saveCardItems = useCallback(async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter((it) => it.materialName);
    if (validItems.length === 0) { message.warning('至少填写一条物料'); return; }
    try {
      await api.post(`/material-color-card/${currentCardId}/items/batch`, { items: validItems });
      message.success(`已保存 ${validItems.length} 条物料`);
      setItemVisible(false);
      fetchCardList();
    } catch (err: any) { message.error(err?.message || '保存失败'); }
  }, [currentCardId, currentItems, message, fetchCardList]);

  const handleGenerateCardMaterials = useCallback(async (card: MaterialColorCard) => {
    try {
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/material-color-card/${card.id}/generate-materials`,
      );
      if (res.code === 200) message.success(`成功生成 ${res.data.length} 条物料到物料资料`);
    } catch (err: any) { message.error(err?.message || '生成失败'); }
  }, [message]);

  const openCardEditDialog = useCallback((card: MaterialColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.coverImage ? [{ url: card.coverImage }] : []);
    cardForm.setFieldsValue({
      cardCode: card.cardCode, cardName: card.cardName, materialType: card.materialType || 'fabric',
      fabricWidth: card.fabricWidth, specifications: card.specifications, fabricWeight: card.fabricWeight,
      fabricComposition: card.fabricComposition, unit: card.unit,
      supplierId: card.supplierId, supplierName: card.supplierName,
      supplierContactPerson: card.supplierContactPerson, supplierContactPhone: card.supplierContactPhone,
      remark: card.remark,
    });
    setCardDialogVisible(true);
  }, [cardForm]);

  const openCardCreateDialog = useCallback(async () => {
    setCurrentCard(null);
    cardForm.resetFields();
    setCoverImageFiles([]);
    try {
      const res = await api.get<{ code: number; data: string }>('/material-color-card/generate-code');
      if (res.code === 200 && res.data) cardForm.setFieldsValue({ cardCode: res.data, materialType: 'fabric' });
    } catch (e) { console.error('[MaterialDatabase] 生成色卡编号失败:', e); }
    setCardDialogVisible(true);
  }, [cardForm]);

  const handleCardSave = useCallback(async () => {
    try {
      const values = await cardForm.validateFields();
      if (coverImageFiles.length > 0) values.coverImage = (coverImageFiles[0] as any)?.url || '';
      if (currentCard?.id) {
        await api.put('/material-color-card', { id: currentCard.id, ...values });
        message.success('更新成功');
      } else {
        await api.post('/material-color-card', values);
        message.success('创建成功');
      }
      setCardDialogVisible(false);
      fetchCardList();
    } catch (err: any) { if (!err?.errorFields) message.error(err?.message || '保存失败'); }
  }, [cardForm, coverImageFiles, currentCard?.id, message, fetchCardList]);

  const handleCardDelete = useCallback(async (id: string) => {
    try { await api.delete(`/material-color-card/${id}`); message.success('删除成功'); fetchCardList(); }
    catch (err: any) { message.error(err?.message || '删除失败'); }
  }, [message, fetchCardList]);

  const uploadCardImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ code: number; data: string }>(
      '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    if (res.code !== 200 || !res.data) throw new Error('上传失败');
    return res.data;
  }, []);

  return {
    // 卡片视图数据
    cardDataList,
    cardLoading,
    cardPage,
    cardPageSize,
    cardTotal,
    cardKeyword,
    cardMaterialType,
    setCardKeyword,
    setCardMaterialType,
    setCardPage,
    fetchCardList,
    // 物料管理弹窗
    itemVisible,
    setItemVisible,
    currentItems,
    currentCardId,
    currentCardName,
    currentCard,
    openCardItemsDialog,
    addEmptyCardItem,
    updateCardItem,
    removeCardItem,
    saveCardItems,
    handleGenerateCardMaterials,
    // 母卡新建/编辑弹窗
    cardDialogVisible,
    setCardDialogVisible,
    cardForm,
    coverImageFiles,
    setCoverImageFiles,
    openCardEditDialog,
    openCardCreateDialog,
    handleCardSave,
    handleCardDelete,
    uploadCardImage,
  };
}
