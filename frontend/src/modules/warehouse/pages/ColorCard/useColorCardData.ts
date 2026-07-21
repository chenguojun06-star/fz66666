import { useCallback, useEffect, useRef, useState } from 'react';
import { Form, message as antdMessage } from 'antd';
import api from '@/utils/api';
import type {
  ApiResult,
  ColorCard,
  ColorCardDetail,
  ColorCardItem,
  ColorCardListParams,
  ImageUploadFile,
  PageResult,
  RecognizedColorInfo,
} from './types';

// ===== 色卡本页面所有状态与业务逻辑（从 index.tsx 抽取） =====
export function useColorCardData() {
  const [dataList, setDataList] = useState<ColorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  // ===== 色卡本弹窗 =====
  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<ColorCard | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [coverImageFiles, setCoverImageFiles] = useState<ImageUploadFile[]>([]);

  // ===== 颜色管理弹窗 =====
  const [itemVisible, setItemVisible] = useState(false);
  const [currentItems, setCurrentItems] = useState<ColorCardItem[]>([]);
  const [currentCardId, setCurrentCardId] = useState<string>('');
  const [currentCardName, setCurrentCardName] = useState<string>('');

  // ===== 拍照识别 =====
  const [recognizeVisible, setRecognizeVisible] = useState(false);
  const [recognizeImage, setRecognizeImage] = useState<string>('');
  const [recognizing, setRecognizing] = useState(false);

  // ===== 生成物料预览 =====
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewCard, setPreviewCard] = useState<ColorCard | null>(null);
  const [previewItems, setPreviewItems] = useState<ColorCardItem[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());

  // ===== 颜色编号递增 =====
  const nextColorNoRef = useRef<string>('');

  // ===== 上传图片 =====
  const uploadImage = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post<{ code: number; data: string }>(
      '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    if (res.code !== 200 || !res.data) throw new Error('上传失败');
    return res.data;
  }, []);

  // ===== 列表加载 =====
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params: ColorCardListParams = { keyword, page, pageSize };
      if (materialType) params.materialType = materialType;
      const res = await api.get<ApiResult<PageResult<ColorCard>>>(
        '/color-card/list', { params },
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

  // ===== 色卡本 CRUD =====

  const openCreateDialog = async () => {
    setCurrentCard(null);
    form.resetFields();
    setCoverImageFiles([]);
    // 自动生成编号
    try {
      const res = await api.get<{ code: number; data: string }>('/color-card/generate-code');
      if (res.code === 200 && res.data) {
        form.setFieldsValue({ colorCardCode: res.data, materialType: 'fabric' });
      }
    } catch (e) { console.error('[ColorCard] 生成编号失败:', e); }
    setDialogVisible(true);
  };

  const openEditDialog = (card: ColorCard) => {
    setCurrentCard(card);
    setCoverImageFiles(card.image ? [{ url: card.image }] : []);
    form.setFieldsValue({
      colorCardCode: card.colorCardCode,
      colorCardName: card.colorCardName,
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
      image: card.image,
      remark: card.remark,
    });
    setDialogVisible(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      // 获取封面图片URL
      if (coverImageFiles.length > 0) {
        values.image = coverImageFiles[0]?.url || '';
      }
      if (currentCard?.id) {
        await api.put('/color-card', { id: currentCard.id, ...values });
        antdMessage.success('更新成功');
      } else {
        await api.post('/color-card', values);
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
      await api.delete(`/color-card/${id}`);
      antdMessage.success('删除成功');
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '删除失败');
    }
  };

  // ===== 颜色管理 =====

  const openItemsDialog = async (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    try {
      const res = await api.get<ApiResult<ColorCardDetail>>(`/color-card/${card.id}`);
      if (res.code === 200) {
        const items = res.data?.items || [];
        setCurrentItems(items);
        // 计算下一个颜色编号
        if (items.length > 0) {
          const maxSeq = items.reduce((max, item) => {
            const m = item.colorNo?.match(/^C(\d+)$/);
            const seq = m ? parseInt(m[1]) : 0;
            return seq > max ? seq : max;
          }, 0);
          nextColorNoRef.current = 'C' + String(maxSeq + 1).padStart(3, '0');
        } else {
          nextColorNoRef.current = 'C001';
        }
      } else {
        setCurrentItems([]);
        nextColorNoRef.current = 'C001';
      }
    } catch {
      setCurrentItems([]);
      nextColorNoRef.current = 'C001';
    }
    setItemVisible(true);
  };

  const addEmptyItem = async () => {
    // 自动获取下一个颜色编号
    if (!nextColorNoRef.current) {
      try {
        const res = await api.get<{ code: number; data: string }>(
          `/color-card/${currentCardId}/generate-color-no`,
        );
        if (res.code === 200) nextColorNoRef.current = res.data;
      } catch {
        nextColorNoRef.current = 'C' + String(currentItems.length + 1).padStart(3, '0');
      }
    }
    const next: ColorCardItem = {
      colorNo: nextColorNoRef.current,
      colorName: '',
      unitPrice: undefined,
      image: '',
      remark: '',
      sortOrder: currentItems.length,
    };
    setCurrentItems([...currentItems, next]);
    // 递增编号
    const m = nextColorNoRef.current.match(/^C(\d+)$/);
    if (m) {
      nextColorNoRef.current = 'C' + String(parseInt(m[1]) + 1).padStart(3, '0');
    }
  };

  const updateItem = (idx: number, field: keyof ColorCardItem, value: string | number | undefined | null) => {
    const next = [...currentItems];
    next[idx] = { ...next[idx], [field]: value ?? undefined };
    setCurrentItems(next);
  };

  const removeItem = (idx: number) => {
    const next = [...currentItems];
    next.splice(idx, 1);
    setCurrentItems(next);
  };

  const saveItems = async () => {
    if (!currentCardId) return;
    const validItems = currentItems.filter(it => it.colorNo || it.colorName);
    if (validItems.length === 0) {
      antdMessage.warning('至少填写一条颜色');
      return;
    }
    try {
      await api.post(`/color-card/${currentCardId}/items/batch`, { items: validItems });
      antdMessage.success(`已保存 ${validItems.length} 条颜色`);
      setItemVisible(false);
      fetchList();
    } catch (err: any) {
      antdMessage.error(err?.message || '保存失败');
    }
  };

  // ===== 拍照识别 =====

  const openRecognize = (card: ColorCard) => {
    setCurrentCardId(card.id);
    setCurrentCardName(card.colorCardName);
    setRecognizeImage('');
    setRecognizeVisible(true);
  };

  const onPickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const url = await uploadImage(file);
        setRecognizeImage(url);
      } catch {
        antdMessage.warning('上传失败');
      }
    };
    reader.readAsDataURL(file);
  };

  const runRecognition = async () => {
    if (!recognizeImage) {
      antdMessage.warning('请先上传色卡图片');
      return;
    }
    setRecognizing(true);
    try {
      const res = await api.post<ApiResult<RecognizedColorInfo>>(
        '/material/database/recognize-color-card', { imageUrl: recognizeImage },
      );
      if (res.code === 200 && res.data && res.data.success) {
        const data = res.data;
        const colorName = data?.color?.textValue || data?.color?.rawText || '';
        if (colorName) {
          antdMessage.success(`识别到颜色：${colorName}`);
          setRecognizeVisible(false);
          // 自动添加识别到的颜色
          if (!itemVisible) {
            setCurrentItems([]);
          }
          const newItem: ColorCardItem = {
            colorNo: nextColorNoRef.current || 'C001',
            colorName,
            unitPrice: data?.unitPrice?.numberValue,
            image: data?.imageUrl || '',
            remark: data?.aiHint || '',
          };
          setCurrentItems(prev => [...prev, newItem]);
          setItemVisible(true);
        } else {
          antdMessage.info('未识别到明确的颜色信息，请手动添加');
        }
      } else {
        antdMessage.warning(res.data?.errorMessage || '识别失败');
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '识别失败');
    } finally {
      setRecognizing(false);
    }
  };

  // ===== 生成物料预览 =====

  const openPreview = async (card: ColorCard) => {
    setPreviewCard(card);
    try {
      const res = await api.get<ApiResult<ColorCardDetail>>(`/color-card/${card.id}`);
      if (res.code === 200) {
        const items = res.data?.items || [];
        setPreviewItems(items);
        // 默认全选
        setSelectedItems(new Set(items.map((_, i) => i)));
      } else {
        setPreviewItems([]);
      }
    } catch {
      setPreviewItems([]);
    }
    setPreviewVisible(true);
  };

  const confirmGenerate = async () => {
    if (!previewCard || selectedItems.size === 0) {
      antdMessage.warning('请选择要生成的颜色');
      return;
    }
    try {
      const itemsToGenerate = selectedItems.size === previewItems.length
        ? null  // null 表示全部
        : previewItems.filter((_, i) => selectedItems.has(i));
      const res = await api.post<{ code: number; data: string[]; message?: string }>(
        `/color-card/${previewCard.id}/generate-materials`, { items: itemsToGenerate },
      );
      if (res.code === 200) {
        antdMessage.success(`成功生成 ${res.data.length} 条物料记录`);
        setPreviewVisible(false);
        fetchList();
      }
    } catch (err: any) {
      antdMessage.error(err?.message || '生成失败');
    }
  };

  const toggleSelect = (idx: number) => {
    const next = new Set(selectedItems);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSelectedItems(next);
  };

  return {
    // 列表
    dataList,
    loading,
    keyword,
    setKeyword,
    materialType,
    setMaterialType,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    fetchList,
    // 色卡本弹窗
    dialogVisible,
    setDialogVisible,
    currentCard,
    form,
    submitting,
    coverImageFiles,
    setCoverImageFiles,
    openCreateDialog,
    openEditDialog,
    handleSave,
    handleDelete,
    uploadImage,
    // 颜色管理弹窗
    itemVisible,
    setItemVisible,
    currentItems,
    currentCardId,
    setCurrentCardId,
    currentCardName,
    nextColorNoRef,
    openItemsDialog,
    addEmptyItem,
    updateItem,
    removeItem,
    saveItems,
    // 拍照识别
    recognizeVisible,
    setRecognizeVisible,
    recognizeImage,
    setRecognizeImage,
    recognizing,
    openRecognize,
    onPickImage,
    runRecognition,
    // 生成物料预览
    previewVisible,
    setPreviewVisible,
    previewCard,
    previewItems,
    selectedItems,
    setSelectedItems,
    openPreview,
    confirmGenerate,
    toggleSelect,
  };
}
