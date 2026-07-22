import { useCallback, useEffect, useState } from 'react';
import { Form, message as antdMessage } from 'antd';
import api from '@/utils/api';
import type {
  ColorCard,
  ColorCardItem,
  ColorCardListParams,
  ImageUploadFile,
  PageResult,
  RecognizedColorInfo,
  ApiResult,
} from './types';
import { uploadImage, getCoverImageUrl } from './utils';
import { useColorCardItems } from './useColorCardItems';
import { useColorCardPreview } from './useColorCardPreview';

export function useColorCardData() {
  const [dataList, setDataList] = useState<ColorCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [materialType, setMaterialType] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [currentCard, setCurrentCard] = useState<ColorCard | null>(null);
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [coverImageFiles, setCoverImageFiles] = useState<ImageUploadFile[]>([]);

  const [recognizeVisible, setRecognizeVisible] = useState(false);
  const [recognizeImage, setRecognizeImage] = useState<string>('');
  const [recognizing, setRecognizing] = useState(false);

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

  const itemsHook = useColorCardItems({ onSaved: fetchList });
  const previewHook = useColorCardPreview({ onGenerated: fetchList });

  const openCreateDialog = async () => {
    setCurrentCard(null);
    form.resetFields();
    setCoverImageFiles([]);
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
      if (coverImageFiles.length > 0) {
        values.image = getCoverImageUrl(coverImageFiles);
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

  const openRecognize = (card: ColorCard) => {
    itemsHook.setCurrentCardId(card.id);
    itemsHook.setCurrentCardName(card.colorCardName);
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
          if (!itemsHook.itemVisible) {
            itemsHook.setCurrentItems([]);
          }
          const newItem: ColorCardItem = {
            colorNo: itemsHook.nextColorNoRef.current || 'C001',
            colorName,
            unitPrice: data?.unitPrice?.numberValue,
            image: data?.imageUrl || '',
            remark: data?.aiHint || '',
          };
          itemsHook.setCurrentItems(prev => [...prev, newItem]);
          itemsHook.setItemVisible(true);
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

  return {
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
    itemVisible: itemsHook.itemVisible,
    setItemVisible: itemsHook.setItemVisible,
    currentItems: itemsHook.currentItems,
    currentCardId: itemsHook.currentCardId,
    setCurrentCardId: itemsHook.setCurrentCardId,
    currentCardName: itemsHook.currentCardName,
    nextColorNoRef: itemsHook.nextColorNoRef,
    openItemsDialog: itemsHook.openItemsDialog,
    addEmptyItem: itemsHook.addEmptyItem,
    updateItem: itemsHook.updateItem,
    removeItem: itemsHook.removeItem,
    saveItems: itemsHook.saveItems,
    recognizeVisible,
    setRecognizeVisible,
    recognizeImage,
    setRecognizeImage,
    recognizing,
    openRecognize,
    onPickImage,
    runRecognition,
    previewVisible: previewHook.previewVisible,
    setPreviewVisible: previewHook.setPreviewVisible,
    previewCard: previewHook.previewCard,
    previewItems: previewHook.previewItems,
    selectedItems: previewHook.selectedItems,
    setSelectedItems: previewHook.setSelectedItems,
    openPreview: previewHook.openPreview,
    confirmGenerate: previewHook.confirmGenerate,
    toggleSelect: previewHook.toggleSelect,
  };
}
