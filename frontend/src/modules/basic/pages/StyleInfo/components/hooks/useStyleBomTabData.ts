import { App, Form } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, useEffect, useState } from 'react';
import { StyleBom, TemplateLibrary } from '@/types/style';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import useStyleBomActions from './useStyleBomActions';
import { useBomColumns } from './useBomColumns';
import useStyleBomData from './useStyleBomData';
import useStyleBomEditing from './useStyleBomEditing';
import useStyleBomMaterials, { type StyleBomMaterialTab } from './useStyleBomMaterials';
import useStyleBomMutations from './useStyleBomMutations';
import useBomMaterialFill from './useBomMaterialFill';
import useBomCompletionHandlers from './useBomCompletionHandlers';
import {
  buildSizeSpecMap as buildSizeSpecMapHelper,
  buildSizeUsageMap as buildSizeUsageMapHelper,
  calcTotalPrice as calcTotalPriceHelper,
  extractSpecLength as extractSpecLengthHelper,
  isTempId as isTempIdHelper,
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

  const { fillRowFromMaterial } = useBomMaterialFill({
    form,
    setData,
    message,
    buildSizeSpecMap,
  });

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

  const {
    handleAddCartWithCallback,
    handleBomRecognized,
    onBeforeComplete,
  } = useBomCompletionHandlers({
    form,
    setData,
    message,
    data,
    styleId,
    tableEditable,
    handleAddToPurchaseCart,
    onCartAdded,
  });

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
