import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback } from 'react';
import type { StyleBom } from '@/types/style';
import { normalizeMaterialType } from '@/utils/materialType';
import type { MaterialType } from './useBomColumns';

interface UseStyleBomEditingOptions {
  locked: boolean;
  styleId: string | number;
  editingKey: string;
  data: StyleBom[];
  form: FormInstance;
  activeSizes: string[];
  activeColors: string[];
  setData: React.Dispatch<React.SetStateAction<StyleBom[]>>;
  setEditingKey: (key: string) => void;
  setTableEditable: (editable: boolean) => void;
  fetchBom: () => Promise<StyleBom[]>;
  sortBomRows: (rows: StyleBom[]) => StyleBom[];
  parseNumberMap: (value?: string) => Record<string, number>;
  buildSizeUsageMap: (usageAmount: number, existing?: string) => string;
  buildSizeSpecMap: (specification?: string, existing?: string) => string;
  isTempId: (id: unknown) => boolean;
}

const useStyleBomEditing = ({
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
  sortBomRows,
  parseNumberMap,
  buildSizeUsageMap,
  buildSizeSpecMap,
  isTempId,
}: UseStyleBomEditingOptions) => {
  const { message } = App.useApp();

  const isEditing = useCallback((record: StyleBom) => String(record.id) === editingKey, [editingKey]);

  const rowName = useCallback((id: string | number, field: string) => [String(id), field], []);

  const buildFormValues = useCallback((rows: StyleBom[]) => {
    const next: Record<string, unknown> = {};
    for (const row of Array.isArray(rows) ? rows : []) {
      const rowId = String(row?.id ?? '');
      if (!rowId) continue;
      next[rowId] = {
        ...row,
        materialType: normalizeMaterialType<MaterialType>((row as Record<string, unknown>).materialType),
        sizeUsageMapObject: parseNumberMap(row.patternSizeUsageMap || row.sizeUsageMap),
        sizeSpecMapObject: parseNumberMap(row.sizeSpecMap),
        patternUnit: String(row.patternUnit || row.unit || '').trim(),
        conversionRate: Number(row.conversionRate ?? 1) || 1,
      };
    }
    return next;
  }, [parseNumberMap]);

  const enterTableEdit = useCallback((rows?: StyleBom[]) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const list = Array.isArray(rows) ? rows : data;
    setEditingKey('');
    setTableEditable(true);
    form.setFieldsValue(buildFormValues(list));
  }, [buildFormValues, data, form, locked, message, setEditingKey, setTableEditable]);

  const exitTableEdit = useCallback(async () => {
    setEditingKey('');
    setTableEditable(false);
    await fetchBom();
  }, [fetchBom, setEditingKey, setTableEditable]);

  const edit = useCallback((record: StyleBom) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    const rowId = String(record.id || '');
    form.setFieldsValue({
      [rowId]: {
        ...record,
        materialType: normalizeMaterialType<MaterialType>((record as Record<string, unknown>).materialType),
        sizeUsageMapObject: parseNumberMap(record.patternSizeUsageMap || record.sizeUsageMap),
        sizeSpecMapObject: parseNumberMap(record.sizeSpecMap),
        patternUnit: String(record.patternUnit || record.unit || '').trim(),
        conversionRate: Number(record.conversionRate ?? 1) || 1,
      },
    });
    setEditingKey(rowId);
  }, [form, locked, message, parseNumberMap, setEditingKey]);

  const cancel = useCallback(() => {
    if (editingKey && isTempId(editingKey)) {
      setData((prev) => prev.filter((item) => String(item.id) !== editingKey));
    }
    setEditingKey('');
  }, [editingKey, isTempId, setData, setEditingKey]);

  const handleAddRows = useCallback((count: number = 1) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }

    const allValues = form.getFieldsValue() || {};
    const syncedData = data.map((item) => {
      const key = String(item.id);
      const row = allValues[key] || {};
      return { ...item, ...row };
    });

    const newRows: StyleBom[] = [];
    const newFormValues: Record<string, StyleBom> = {};

    for (let index = 0; index < count; index += 1) {
      const newId = `tmp_${Date.now()}_${index}`;
      const newBom: StyleBom = {
        id: newId,
        styleId,
        materialType: 'fabricA',
        groupName: '',
        materialCode: '',
        materialName: '',
        color: activeColors.length === 1 ? activeColors[0] : '',
        specification: '',
        size: activeSizes.join('/'),
        sizeUsageMap: buildSizeUsageMap(0),
        patternSizeUsageMap: buildSizeUsageMap(0),
        sizeSpecMap: buildSizeSpecMap(''),
        unit: '',
        patternUnit: '',
        conversionRate: 1,
        usageAmount: 0,
        lossRate: 0,
        unitPrice: 0,
        totalPrice: 0,
        supplier: '',
      };
      newRows.push(newBom);
      newFormValues[String(newId)] = { ...newBom };
    }

    setData(sortBomRows([...syncedData, ...newRows]));
    form.setFieldsValue({
      ...allValues,
      ...newFormValues,
    });
    setEditingKey('');
    setTableEditable(true);
  }, [activeColors, activeSizes, buildSizeSpecMap, buildSizeUsageMap, data, form, locked, message, setData, setEditingKey, setTableEditable, sortBomRows, styleId]);

  return {
    isEditing,
    rowName,
    enterTableEdit,
    exitTableEdit,
    edit,
    cancel,
    handleAddRows,
  };
};

export default useStyleBomEditing;
