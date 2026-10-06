import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback, type Dispatch, type SetStateAction } from 'react';
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
  setData: Dispatch<SetStateAction<StyleBom[]>>;
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
        // D-702：`|| 1` 会把 0 也强转成 1，使用户填的 0/未填状态被改写。
          // 改为「有值才取，无值保持 0」，与新增行默认值一致。
          conversionRate: Number(row.conversionRate ?? 0) || 0,
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
        conversionRate: Number(record.conversionRate ?? 0) || 0,
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
          // D-702：默认 0 而非 1。原先写死 1 会让新增行看起来"已填换算率"，
          // 但 1 既不是用户填的真实值，也无法在「非公斤物料不换算」的规则下被显示出来
          // （bomUsageColumns 只在 unit=公斤 且 patternUnit=米 时才显示换算值），
          // 结果是：数据表里 72 行 conversion_rate=1 全是默认值，界面上却全是「-」，
          // 让人误以为"填了不出现"。0 与同组的 usageAmount / lossRate 语义一致（未填=0）。
          conversionRate: 0,
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
    // D-213：旧行值必须从 data 全量重建——保存后 fetchBom 会 form.resetFields() 清空 store，
    // 此时 allValues 为空对象，仅靠它回填会导致旧行输入框全部失绑显示空白
    form.setFieldsValue({
      ...buildFormValues(syncedData),
      ...newFormValues,
    });
    setEditingKey('');
    setTableEditable(true);
  }, [activeColors, activeSizes, buildFormValues, buildSizeSpecMap, buildSizeUsageMap, data, form, locked, message, setData, setEditingKey, setTableEditable, sortBomRows, styleId]);

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
