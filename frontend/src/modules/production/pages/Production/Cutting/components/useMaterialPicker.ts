import React, { useCallback, useState } from 'react';
import { Form } from 'antd';

export async function apiGetMaterialList(keyword: string, page: number, pageSize: number) {
  const { default: api } = await import('@/utils/api');
  return api.get('/material/database/list', {
    params: { keyword, page, pageSize, status: 'completed' },
  });
}

/**
 * 物料选择器状态管理（从 CuttingBomPanel 抽离，保持原逻辑不变）
 * - 包含物料搜索、分页、tab 切换、新建表单
 * - materialModalOpen 由外部传入（受控）
 */
export function useMaterialPicker(materialModalOpen: boolean) {
  const [materialTab, setMaterialTab] = useState<'select' | 'create'>('select');
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);
  const [materialCreateForm] = Form.useForm();

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await apiGetMaterialList(materialKeyword, materialPage, materialPageSize);
      if (res.code === 200) {
        setMaterialList(res.data?.records || []);
        setMaterialTotal(res.data?.total || 0);
      }
    } catch { /* ignore */ }
    finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  React.useEffect(() => {
    if (materialModalOpen) {
      handleSearchMaterial();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialModalOpen, materialPage, materialPageSize]);

  return {
    materialTab,
    setMaterialTab,
    materialKeyword,
    setMaterialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    setMaterialPage,
    materialPageSize,
    setMaterialPageSize,
    materialCreateForm,
    handleSearchMaterial,
  };
}
