import { App, Form, Modal } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, useEffect, useState } from 'react';
import { StyleBom, TemplateLibrary } from '@/types/style';
import api from '@/utils/api';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import useStyleBomActions from './useStyleBomActions';
import { useBomColumns } from './useBomColumns';
import useStyleBomData from './useStyleBomData';
import useStyleBomEditing from './useStyleBomEditing';
import useStyleBomMaterials, { type StyleBomMaterialTab } from './useStyleBomMaterials';
import useStyleBomMutations from './useStyleBomMutations';
import {
  buildSizeSpecMap as buildSizeSpecMapHelper,
  buildSizeUsageMap as buildSizeUsageMapHelper,
  calcTotalPrice as calcTotalPriceHelper,
  extractSpecLength as extractSpecLengthHelper,
  isTempId as isTempIdHelper,
  mapDbTypeToBomType as mapDbTypeToBomTypeHelper,
  normalizeUniqueValues as normalizeUniqueValuesHelper,
  parseNumberMap as parseNumberMapHelper,
  resolvePatternUnit as resolvePatternUnitHelper,
  sortBomRows as sortBomRowsHelper,
} from '../styleBom/helpers';

export interface UseStyleBomTabDataOptions {
  styleId: string | number;
  readOnly?: boolean;
  onCartAdded?: () => void;
  sizeColorConfig?: {
    sizes?: string[];
    colors?: string[];
    matrixRows?: Array<{ color: string; quantities: number[]; imageUrl?: string }>;
  };
}

export interface BomRecognizedItem {
  id: string;
  materialName: string;
  materialCode?: string;
  specification?: string;
  usageAmount?: number;
  partName?: string;
  subPartName?: string;
}

export interface UseStyleBomTabDataResult {
  // 派生
  activeSizes: string[];
  activeColors: string[];
  locked: boolean;
  isSupervisorOrAbove: boolean;
  // state
  editingKey: string;
  tableEditable: boolean;
  bomTemplateId: string | undefined;
  checkingStock: boolean;
  // form
  form: FormInstance;
  // data
  data: StyleBom[];
  loading: boolean;
  bomTemplates: TemplateLibrary[];
  templateLoading: boolean;
  // material modal
  materialCreateForm: FormInstance;
  materialModalOpen: boolean;
  materialTab: StyleBomMaterialTab;
  materialKeyword: string;
  materialLoading: boolean;
  materialList: Record<string, unknown>[];
  materialTotal: number;
  materialPage: number;
  materialPageSize: number;
  // setters
  setMaterialModalOpen: (open: boolean) => void;
  setMaterialTab: (tab: StyleBomMaterialTab) => void;
  setMaterialKeyword: (keyword: string) => void;
  setBomTemplateId: (id: string | undefined) => void;
  // data fetchers
  fetchBomTemplates: (sourceStyleNo?: string) => Promise<void>;
  fetchMaterials: (page: number, keyword?: string, pageSizeOverride?: number) => Promise<void>;
  // material handlers
  handleMaterialPageChange: (page: number, pageSize: number) => void;
  handleUseMaterial: (record: Record<string, unknown>) => Promise<void>;
  handleCreateMaterial: (values: Record<string, unknown>) => Promise<void>;
  // editing
  enterTableEdit: (rows?: StyleBom[]) => void;
  exitTableEdit: () => Promise<void>;
  saveAll: () => Promise<void>;
  handleAddRows: (count?: number) => void;
  // mutations
  applyBomTemplate: (mode: unknown) => Promise<void>;
  // actions
  handleGeneratePurchase: () => Promise<void> | void;
  handleCheckStock: () => Promise<void> | void;
  handleApplyPickup: (record: StyleBom) => Promise<void> | void;
  handleDelete: (id: string | number) => Promise<void>;
  handleAddToPurchaseCart: () => Promise<void> | void;
  handleAddCartWithCallback: () => Promise<void>;
  handleBomRecognized: (items: BomRecognizedItem[]) => void;
  // columns
  columns: ReturnType<typeof useBomColumns>;
  // 状态控制栏完成前回调
  onBeforeComplete: () => Promise<boolean>;
}

export const useStyleBomTabData = ({
  styleId,
  readOnly,
  onCartAdded,
  sizeColorConfig,
}: UseStyleBomTabDataOptions): UseStyleBomTabDataResult => {
  const { user } = useUser();
  const { message } = App.useApp();
  const [editingKey, setEditingKey] = useState('');
  const [tableEditable, setTableEditable] = useState(false);
  const [form] = Form.useForm();
  const [bomTemplateId, setBomTemplateId] = useState<string | undefined>(undefined);
  const [checkingStock, setCheckingStock] = useState(false);

  const activeSizes = normalizeUniqueValuesHelper(sizeColorConfig?.sizes);
  const activeColors = normalizeUniqueValuesHelper(sizeColorConfig?.colors);

  const parseNumberMap = useCallback((value?: string) => parseNumberMapHelper(value), []);
  const extractSpecLength = useCallback((value?: string) => extractSpecLengthHelper(value), []);
  const buildSizeUsageMap = useCallback(
    (usageAmount: number, existing?: string) => buildSizeUsageMapHelper(activeSizes, usageAmount, existing),
    [activeSizes]
  );
  const buildSizeSpecMap = useCallback(
    (specification?: string, existing?: string) => buildSizeSpecMapHelper(activeSizes, extractSpecLength, specification, existing),
    [activeSizes, extractSpecLength]
  );

  const locked = Boolean(readOnly);
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);

  const {
    data,
    setData,
    loading,
    setLoading,
    bomTemplates,
    templateLoading,
    currentStyleNo,
    fetchBom,
    fetchBomTemplates,
    fetchCurrentStyleNo,
  } = useStyleBomData({
    styleId,
    form,
    sortBomRows: sortBomRowsHelper,
    onAfterFetchBom: () => {
      setEditingKey('');
    },
  });

  const fillRowFromMaterial = useCallback(
    async (rid: string, material: Record<string, unknown>) => {
      const rowId = String(rid || '').trim();
      if (!rowId) return;
      const m = material || {};
      const patch: Record<string, unknown> = {
        materialCode: String(m.materialCode || '').trim(),
        materialName: String(m.materialName || '').trim(),
        fabricComposition: String(m.fabricComposition || '').trim(),
        fabricWeight: String(m.fabricWeight || '').trim(),
        unit: String(m.unit || '').trim(),
        patternUnit: String(m.patternUnit || m.unit || '').trim(),
        conversionRate: Number(m.conversionRate ?? 1) || 1,
        supplier: String(m.supplierName || '').trim(),
        specification: String(m.specifications ?? m.specification ?? '').trim(),
        unitPrice: Number(m.unitPrice) || 0,
        materialType: mapDbTypeToBomTypeHelper(m.materialType),
        // 自动从面辅料资料带出图片（面辅料资料 image 字段，包装成 JSON 数组）
        imageUrls: m.image ? JSON.stringify([String(m.image).trim()]) : undefined,
      };
      const materialColor = String(m.color ?? m.materialColor ?? '').trim();
      if (materialColor) {
        patch.color = materialColor;
      }
      patch.sizeSpecMap = buildSizeSpecMap(String(patch.specification || ''), m.sizeSpecMap as string | undefined);
      const current = (form.getFieldValue(rowId) || {}) as Record<string, unknown>;
      const merged = { ...current, ...patch };
      merged.totalPrice = calcTotalPriceHelper(merged as Partial<StyleBom>);
      form.setFieldsValue({ [rowId]: merged });
      setData((prev) =>
        sortBomRowsHelper(
          (Array.isArray(prev) ? prev : []).map((it: StyleBom) => {
            if (String(it?.id) !== rowId) return it;
            return { ...it, ...merged } as StyleBom;
          })
        )
      );

      // 自动检查该物料的库存状态
      try {
        const materialCode = String(m.materialCode || '').trim();
        const color = String(merged.color || '').trim();

        if (materialCode) {
          // 使用MaterialStockService查询库存（与后端StyleBomService相同逻辑）
          const res = await api.get<{ code: number; data: { records: any[] } }>(
            '/production/material/stock/list',
            { params: {
              materialCode,
              color: color || undefined,  // 如果颜色为空，不传参数
              page: 1,
              pageSize: 1
            } }
          );

          if (res.code === 200 && res.data?.records?.length > 0) {
            const stock = res.data.records[0];
            const availableQty = Number(stock.quantity || 0) - Number(stock.lockedQuantity || 0);
            const usageAmount = Number(merged.usageAmount || 0);
            const requiredQty = Math.ceil(usageAmount);

            const stockStatus = availableQty >= requiredQty ? 'sufficient' : availableQty > 0 ? 'insufficient' : 'none';
            const requiredPurchase = Math.max(0, requiredQty - availableQty);

            // 更新data数组中的对应行
            setData(prev => sortBomRowsHelper(
              prev.map(item =>
                String(item.id) === rowId ? {
                  ...item,
                  ...merged,
                  stockStatus,
                  availableStock: availableQty,
                  requiredPurchase,
                } as StyleBom : item
              )
            ));

            const statusText = stockStatus === 'sufficient' ? '库存充足' : stockStatus === 'insufficient' ? '库存不足' : '无库存';
            message.success(`${materialCode} 库存检查完成：${statusText}（可用：${availableQty}）`);
          } else {
            // 无库存记录
            const usageAmount = Number(merged.usageAmount || 0);
            const requiredQty = Math.ceil(usageAmount);

            setData(prev => sortBomRowsHelper(
              prev.map(item =>
                String(item.id) === rowId ? {
                  ...item,
                  ...merged,
                  stockStatus: 'none',
                  availableStock: 0,
                  requiredPurchase: requiredQty,
                } as StyleBom : item
              )
            ));

            message.warning(`${materialCode} 无库存记录`);
          }
        }
      } catch {
        message.error('库存检查失败，请稍后重试');
      }
    },
    [buildSizeSpecMap, form, message, setData]
  );

  const {
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
    setMaterialTargetRowId,
    fetchMaterials,
    handleMaterialPageChange,
    handleUseMaterial,
    handleCreateMaterial,
  } = useStyleBomMaterials({
    currentStyleNo,
    fillRowFromMaterial,
  });

  useEffect(() => {
    fetchBom();
    fetchCurrentStyleNo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId]);

  useEffect(() => {
    fetchBomTemplates('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!locked) return;
    if (editingKey) setEditingKey('');
    if (tableEditable) setTableEditable(false);
  }, [editingKey, locked, tableEditable]);

  const {
    isEditing,
    rowName,
    enterTableEdit,
    exitTableEdit,
    edit,
    cancel,
    handleAddRows,
  } = useStyleBomEditing({
    locked,
    styleId,
    editingKey,
    data,
    form,
    activeSizes,
    activeColors,
    setData,
    setEditingKey,
    setTableEditable,
    fetchBom,
    sortBomRows: sortBomRowsHelper,
    parseNumberMap,
    buildSizeUsageMap,
    buildSizeSpecMap,
    isTempId: isTempIdHelper,
  });

  const {
    save,
    saveAll,
    applyBomTemplate,
  } = useStyleBomMutations({
    locked,
    styleId,
    data,
    bomTemplateId,
    form,
    activeSizes,
    setLoading,
    setEditingKey,
    setTableEditable,
    setBomTemplateId,
    fetchBom,
    enterTableEdit,
    rowName,
    parseNumberMap,
    extractSpecLength,
    calcTotalPrice: calcTotalPriceHelper,
    resolvePatternUnit: resolvePatternUnitHelper,
    isTempId: isTempIdHelper,
  });

  const {
    handleGeneratePurchase,
    handleCheckStock,
    handleApplyPickup,
    handleDelete,
    handleAddToPurchaseCart,
  } = useStyleBomActions({
    locked,
    styleId,
    currentStyleNo,
    data,
    tableEditable,
    user,
    form,
    setLoading,
    setCheckingStock,
    setData,
    fetchBom,
    isTempId: isTempIdHelper,
    sortBomRows: sortBomRowsHelper,
  });

  const handleAddCartWithCallback = useCallback(async () => {
    await handleAddToPurchaseCart();
    onCartAdded?.();
  }, [handleAddToPurchaseCart, onCartAdded]);

  const handleBomRecognized = useCallback((items: BomRecognizedItem[]) => {
    if (!Array.isArray(items) || items.length === 0) return;
    items.forEach((it, idx) => {
      const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
      // 部位兜底：AI未识别到部位时默认"整件"
      const partName = (it.partName || '').trim() || '整件';
      // 子部位：AI未识别到则为空字符串（表示主部位整件使用）
      const subPartName = (it.subPartName || '').trim();
      const patch: Partial<StyleBom> & Record<string, unknown> = {
        id: rowId,
        materialName: it.materialName,
        materialCode: it.materialCode,
        specification: it.specification,
        usageAmount: it.usageAmount,
        partName,
        subPartName,
      };
      form.setFieldsValue({ [rowId]: patch });
    });
    setData((prev) => {
      const next = [...(Array.isArray(prev) ? prev : [])];
      items.forEach((it, idx) => {
        const rowId = `tmp_ai_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`;
        const partName = (it.partName || '').trim() || '整件';
        const subPartName = (it.subPartName || '').trim();
        next.push({
          id: rowId,
          materialName: it.materialName,
          materialCode: it.materialCode,
          specification: it.specification,
          usageAmount: it.usageAmount,
          partName,
          subPartName,
        } as StyleBom);
      });
      return sortBomRowsHelper(next);
    });
  }, [form, setData]);

  // 列定义
  const columns = useBomColumns({
    locked,
    tableEditable,
    editingKey,
    data,
    form,
    isEditing,
    rowName,
    save,
    cancel,
    edit,
    handleDelete,
    isTempId: isTempIdHelper,
    fetchMaterials,
    materialCreateForm,
    calcTotalPrice: calcTotalPriceHelper,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup: handleApplyPickup,
    activeSizes,
  });

  const onBeforeComplete = useCallback(async () => {
    if (!data || data.length === 0) {
      message.error('请先配置BOM物料');
      return false;
    }
    if (tableEditable) {
      message.error('请先点击"保存全部"保存单价数据，再完成BOM配置');
      return false;
    }
    const hasZeroPrices = data.some(item => !Number(item.unitPrice));
    if (hasZeroPrices) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Modal.confirm({
          width: '30vw',
          title: '部分单价为0',
          content: '存在单价为0的BOM物料，确认仍然完成BOM配置？',
          okText: '确认完成',
          cancelText: '返回填写',
          onOk: () => resolve(true),
          onCancel: () => resolve(false),
        });
      });
      if (!confirmed) return false;
    }
    // 标记完成前自动同步BOM到物料数据库（尽力而为，重复自动过滤）
    try {
      await api.post(`/style/bom/${styleId}/sync-material-database`);
    } catch {
      // 尽力而为：同步失败不阻断完成操作
    }
    return true;
  }, [data, message, styleId, tableEditable]);

  return {
    activeSizes,
    activeColors,
    locked,
    isSupervisorOrAbove,
    editingKey,
    tableEditable,
    bomTemplateId,
    checkingStock,
    form,
    data,
    loading,
    bomTemplates,
    templateLoading,
    materialCreateForm,
    materialModalOpen,
    materialTab,
    materialKeyword,
    materialLoading,
    materialList,
    materialTotal,
    materialPage,
    materialPageSize,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialKeyword,
    setBomTemplateId,
    fetchBomTemplates,
    fetchMaterials,
    handleMaterialPageChange,
    handleUseMaterial,
    handleCreateMaterial,
    enterTableEdit,
    exitTableEdit,
    saveAll,
    handleAddRows,
    applyBomTemplate,
    handleGeneratePurchase,
    handleCheckStock,
    handleApplyPickup,
    handleDelete,
    handleAddToPurchaseCart,
    handleAddCartWithCallback,
    handleBomRecognized,
    columns,
    onBeforeComplete,
  };
};

export default useStyleBomTabData;
