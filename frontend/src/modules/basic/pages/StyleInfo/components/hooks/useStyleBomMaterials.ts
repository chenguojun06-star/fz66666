import { App, Form } from 'antd';
import { useCallback, useState } from 'react';
import api from '@/utils/api';
import {
  DEFAULT_PAGE_SIZE,
  buildPageSizeStorageKey,
  readPageSizeByKey,
  savePageSizeByKey,
} from '@/utils/pageSizeStore';

const MATERIAL_SELECT_STORAGE_KEY = 'style-bom-material-select';
const MATERIAL_SELECT_PAGE_SIZE_KEY = buildPageSizeStorageKey(MATERIAL_SELECT_STORAGE_KEY);

export type StyleBomMaterialTab = 'select' | 'create';

interface UseStyleBomMaterialsOptions {
  currentStyleNo: string;
  fillRowFromMaterial: (rowId: string, material: Record<string, unknown>) => Promise<void> | void;
}

const useStyleBomMaterials = ({
  currentStyleNo,
  fillRowFromMaterial,
}: UseStyleBomMaterialsOptions) => {
  const { message } = App.useApp();
  const [materialCreateForm] = Form.useForm();
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTab, setMaterialTab] = useState<StyleBomMaterialTab>('select');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(() => readPageSizeByKey(MATERIAL_SELECT_PAGE_SIZE_KEY, DEFAULT_PAGE_SIZE));
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialTargetRowId, setMaterialTargetRowId] = useState('');

  const fetchMaterials = useCallback(async (page: number, keyword?: string, pageSizeOverride?: number) => {
    const p = Number(page) || 1;
    const kw = String(keyword ?? '').trim();
    const nextPageSize = pageSizeOverride ?? materialPageSize;
    setMaterialLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: Record<string, unknown>[]; total: number } }>('/material/database/list', {
        params: {
          page: p,
          pageSize: nextPageSize,
          materialCode: kw,
          materialName: kw,
        },
      });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const records = Array.isArray((result.data as any)?.records) ? (result.data as any).records : [];
        setMaterialList(records);
        setMaterialTotal(Number((result.data as any)?.total) || 0);
        setMaterialPage(p);
      }
    } catch {
      // 忽略错误
    } finally {
      setMaterialLoading(false);
    }
  }, [materialPageSize]);

  const handleMaterialPageChange = useCallback((page: number, pageSize: number) => {
    if (pageSize !== materialPageSize) {
      savePageSizeByKey(MATERIAL_SELECT_PAGE_SIZE_KEY, pageSize);
      setMaterialPageSize(pageSize);
      void fetchMaterials(1, materialKeyword, pageSize);
      return;
    }
    void fetchMaterials(page, materialKeyword);
  }, [fetchMaterials, materialKeyword, materialPageSize]);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    if (!materialTargetRowId) {
      message.error('请选择目标BOM行');
      return;
    }
    await fillRowFromMaterial(materialTargetRowId, record);
    setMaterialModalOpen(false);
  }, [fillRowFromMaterial, materialTargetRowId, message]);

  const handleCreateMaterial = useCallback(async (values: Record<string, unknown>) => {
    try {
      const localColor = String(values.color || '').trim();
      const payload: Record<string, unknown> = {
        materialCode: String(values.materialCode || '').trim(),
        materialName: String(values.materialName || '').trim(),
        unit: String(values.unit || '').trim(),
        supplierName: String(values.supplierName || '').trim(),
        materialType: String(values.materialType || 'accessory').trim(),
        specifications: String(values.specifications || '').trim(),
        fabricComposition: String(values.fabricComposition || '').trim(),
        fabricWeight: String(values.fabricWeight || '').trim(),
        unitPrice: Number(values.unitPrice) || 0,
        remark: String(values.remark || '').trim(),
        styleNo: String(currentStyleNo || '').trim(),
      };
      const res = await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload);
      const result = res as Record<string, unknown>;
      if (result.code !== 200 || result.data !== true) {
        message.error(String(result.message || '创建失败'));
        return;
      }
      message.success('已创建面辅料');
      await handleUseMaterial({ ...payload, color: localColor });
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '创建失败');
    }
  }, [currentStyleNo, handleUseMaterial, message]);

  return {
    materialCreateForm,
    materialModalOpen,
    setMaterialModalOpen,
    materialTab,
    setMaterialTab,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    materialKeyword,
    setMaterialKeyword,
    materialTargetRowId,
    setMaterialTargetRowId,
    fetchMaterials,
    handleMaterialPageChange,
    handleUseMaterial,
    handleCreateMaterial,
  };
};

export default useStyleBomMaterials;
