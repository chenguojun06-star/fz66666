import type { FormInstance } from 'antd/es/form';
import { StyleBom } from '@/types/style';
import { useBomEditorHelpers } from './bomCellEditors';
import type { BomEditorContext } from './bomCellEditors';
import type { BomColumnsContext } from './bomColumnsHelpers';
import { buildBasicColumns } from './bomBasicColumns';
import { buildUsageColumns } from './bomUsageColumns';
import { buildPriceColumns } from './bomPriceColumns';
import { buildStatusActionColumns } from './bomStatusActionColumns';


interface UseBomColumnsProps {
  locked: boolean;
  tableEditable: boolean;
  editingKey: string;
  data: StyleBom[];
  form: FormInstance;
  isEditing: (record: StyleBom) => boolean;
  rowName: (id: unknown, field: string) => string[];
  save: (key: string) => Promise<void>;
  cancel: () => void;
  edit: (record: StyleBom) => void;
  handleDelete: (id: unknown) => void;
  isTempId: (id: unknown) => boolean;
  fetchMaterials: (page: number, keyword?: string) => Promise<void>;
  materialCreateForm: FormInstance;
  calcTotalPrice: (item: Partial<StyleBom>) => number;
  isSupervisorOrAbove: boolean;
  setMaterialKeyword: (v: string) => void;
  setMaterialModalOpen: (v: boolean) => void;
  setMaterialTab: (v: 'select' | 'create') => void;
  setMaterialTargetRowId: (v: string) => void;
  onApplyPickup?: (record: StyleBom) => void;
  activeSizes?: string[];
}

export function useBomColumns({
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
  isTempId,
  fetchMaterials,
  materialCreateForm: _materialCreateForm,
  calcTotalPrice,
  isSupervisorOrAbove,
  setMaterialKeyword,
  setMaterialModalOpen,
  setMaterialTab,
  setMaterialTargetRowId,
  onApplyPickup,
  activeSizes = [],
}: UseBomColumnsProps) {
  const editorCtx: BomEditorContext = {
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
    isTempId,
    fetchMaterials,
    calcTotalPrice,
    isSupervisorOrAbove,
    setMaterialKeyword,
    setMaterialModalOpen,
    setMaterialTab,
    setMaterialTargetRowId,
    onApplyPickup,
    activeSizes,
  };
  const editors = useBomEditorHelpers(editorCtx);

  // 列构建上下文：editor 输入 + editor 输出
  const columnsCtx: BomColumnsContext = {
    ...editorCtx,
    ...editors,
  };

  const columns = [
    ...buildBasicColumns(columnsCtx),
    ...buildUsageColumns(columnsCtx),
    ...buildPriceColumns(columnsCtx),
    ...buildStatusActionColumns(columnsCtx),
  ];

  return columns;
}
