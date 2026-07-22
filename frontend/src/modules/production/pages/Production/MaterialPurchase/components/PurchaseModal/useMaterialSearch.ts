import { useState, useEffect, useCallback } from 'react';
import api from '@/utils/api';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { fillRowFromMaterialData } from './utils';

interface UseMaterialSearchParams {
  editableData: MaterialPurchaseType[];
  setEditableData: React.Dispatch<React.SetStateAction<MaterialPurchaseType[]>>;
}

export const useMaterialSearch = ({ editableData, setEditableData }: UseMaterialSearchParams) => {
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: {
          keyword: materialKeyword,
          page: materialPage,
          pageSize: materialPageSize,
          status: 'completed',
        },
      });
      if ((res as any)?.code === 200) {
        setMaterialList((res as any).data?.records || []);
        setMaterialTotal((res as any).data?.total || 0);
      }
    } catch (e) {
      console.error('[PurchaseDetailView] 加载物料列表失败:', e);
    } finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  useEffect(() => {
    if (materialModalOpen) handleSearchMaterial();
  }, [materialModalOpen, materialPage, materialPageSize, handleSearchMaterial]);

  const openMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, []);

  const fillRowFromMaterial = useCallback(
    (rowId: string, record: Record<string, unknown>) => {
      setEditableData((prev) =>
        prev.map((r) => {
          if (r.id !== rowId) return r;
          return fillRowFromMaterialData(r, record);
        })
      );
    },
    [setEditableData]
  );

  const handleUseMaterial = useCallback(
    async (record: Record<string, unknown>) => {
      if (!materialTargetRowId) return;
      fillRowFromMaterial(materialTargetRowId, record);
      setMaterialModalOpen(false);
    },
    [materialTargetRowId, fillRowFromMaterial]
  );

  return {
    materialModalOpen,
    materialTargetRowId,
    materialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    setMaterialModalOpen,
    setMaterialKeyword,
    setMaterialPage,
    setMaterialPageSize,
    openMaterialModal,
    handleUseMaterial,
    handleSearchMaterial,
  };
};
