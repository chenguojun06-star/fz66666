import { App } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { useCallback } from 'react';
import type { StyleBom } from '@/types/style';
import api from '@/utils/api';

interface UseStyleBomMutationsOptions {
  locked: boolean;
  styleId: string | number;
  data: StyleBom[];
  bomTemplateId?: string;
  form: FormInstance;
  activeSizes: string[];
  setLoading: (loading: boolean) => void;
  setEditingKey: (key: string) => void;
  setTableEditable: (editable: boolean) => void;
  setBomTemplateId: (value?: string) => void;
  fetchBom: () => Promise<StyleBom[]>;
  enterTableEdit: (rows?: StyleBom[]) => void;
  rowName: (id: string | number, field: string) => any;
  parseNumberMap: (value?: string) => Record<string, number>;
  extractSpecLength: (value?: string) => number;
  calcTotalPrice: (item: Partial<StyleBom>) => number;
  resolvePatternUnit: (bom: StyleBom) => string;
  isTempId: (id: unknown) => boolean;
}

const useStyleBomMutations = ({
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
  calcTotalPrice,
  resolvePatternUnit,
  isTempId,
}: UseStyleBomMutationsOptions) => {
  const { message } = App.useApp();

  const buildRequiredPaths = useCallback((ids: string[]) => ids.flatMap((id) => ([
    rowName(id, 'materialCode'),
    rowName(id, 'materialName'),
    rowName(id, 'unit'),
    rowName(id, 'supplier'),
    rowName(id, 'usageAmount'),
    rowName(id, 'unitPrice'),
  ])), [rowName]);

  const showValidationError = useCallback((errInfo: any) => {
    const fields = errInfo?.errorFields;
    const first = Array.isArray(fields) ? fields[0] : null;
    const content = first?.errors?.[0] || '请完善必填项后再保存';
    message.error({ content, key: 'table-validate', duration: 2 });
    if (first?.name) {
      try {
        form.scrollToField(first.name, { block: 'center' });
      } catch {
        // 忽略错误
      }
    }
  }, [form, message]);

  const buildPersistedItem = useCallback((item: StyleBom, row: Record<string, any>) => {
    const nextItem: Record<string, any> = { ...item, ...row, groupName: '' };
    const conversionRate = Number(row?.conversionRate ?? nextItem.conversionRate ?? 1) || 1;
    const rawSizeUsageMap = activeSizes.length
      ? Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeUsageMapObject?.[size] ?? item.usageAmount ?? nextItem.usageAmount ?? 0)]))
      : parseNumberMap(item.patternSizeUsageMap || item.sizeUsageMap);

    nextItem.patternUnit = resolvePatternUnit(nextItem as StyleBom);
    nextItem.conversionRate = conversionRate;
    nextItem.patternSizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.patternSizeUsageMap;
    nextItem.sizeUsageMap = activeSizes.length ? JSON.stringify(rawSizeUsageMap) : item.sizeUsageMap;
    nextItem.sizeSpecMap = activeSizes.length
      ? JSON.stringify(Object.fromEntries(activeSizes.map((size) => [size, Number(row?.sizeSpecMapObject?.[size] ?? extractSpecLength(nextItem.specification) ?? 0)])))
      : item.sizeSpecMap;

    delete nextItem.sizeUsageMapObject;
    delete nextItem.sizeSpecMapObject;
    nextItem.totalPrice = calcTotalPrice(nextItem as StyleBom);
    return nextItem;
  }, [activeSizes, calcTotalPrice, extractSpecLength, parseNumberMap, resolvePatternUnit]);

  const persistItem = useCallback(async (item: StyleBom, row: Record<string, any>) => {
    const nextItem = buildPersistedItem(item, row);

    if (isTempId(item.id)) {
      const { id: _id, ...payload } = nextItem;
      return api.post('/style/bom', payload);
    }

    return api.put('/style/bom', nextItem);
  }, [buildPersistedItem, isTempId]);

  const save = useCallback(async (key: string) => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }

    try {
      await form.validateFields(buildRequiredPaths([key]));
      const row = (form.getFieldValue(String(key)) || {}) as Record<string, any>;
      const target = data.find((item) => String(item.id) === key);
      if (!target) return;

      const result = await persistItem(target, row) as Record<string, unknown>;
      if (result.code === 200 && result.data) {
        message.success('保存成功');
        setEditingKey('');
        void fetchBom();
        return;
      }

      message.error(String(result.message || '保存失败'));
    } catch (errInfo: unknown) {
      if (typeof errInfo === 'object' && errInfo !== null && 'errorFields' in errInfo) {
        showValidationError(errInfo);
      }
    }
  }, [buildRequiredPaths, data, fetchBom, form, locked, message, persistItem, setEditingKey, showValidationError]);

  const applyBomTemplate = useCallback(async (mode: 'overwrite' | 'append' = 'overwrite') => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }
    if (!bomTemplateId) {
      message.error('请选择模板');
      return;
    }

    const sid = Number(styleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('styleId不合法');
      return;
    }

    setLoading(true);
    try {
      const result = await api.post<{ code: number; message: string; data: boolean }>('/template-library/apply-to-style', {
        templateId: bomTemplateId,
        targetStyleId: sid,
        mode,
      });

      if (result.code !== 200) {
        message.error(String(result.message || '导入失败'));
        return;
      }

      message.success(mode === 'append' ? '已追加导入BOM模板' : '已覆盖导入BOM模板');
      setBomTemplateId(undefined);
      const next = await fetchBom();
      if (Array.isArray(next) && next.length) {
        enterTableEdit(next);
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '导入失败');
    } finally {
      setLoading(false);
    }
  }, [bomTemplateId, enterTableEdit, fetchBom, locked, message, setBomTemplateId, setLoading, styleId]);

  const saveAll = useCallback(async () => {
    if (locked) {
      message.error('已完成，无法操作');
      return;
    }

    try {
      const ids = data.map((item) => String(item.id)).filter(Boolean);
      await form.validateFields(buildRequiredPaths(ids));
      const allValues = form.getFieldsValue() || {};

      setLoading(true);
      for (const item of data) {
        const key = String(item.id);
        const row = (allValues?.[key] || {}) as Record<string, any>;
        const result = await persistItem(item, row) as Record<string, unknown>;
        if (result.code !== 200) {
          message.error(String(result.message || '保存失败'));
          return;
        }
      }

      message.success('保存成功');
      setTableEditable(false);
      await fetchBom();
    } catch (errInfo: unknown) {
      if (typeof errInfo === 'object' && errInfo !== null && 'errorFields' in errInfo) {
        showValidationError(errInfo);
      }
    } finally {
      setLoading(false);
    }
  }, [buildRequiredPaths, data, fetchBom, form, locked, message, persistItem, setLoading, setTableEditable, showValidationError]);

  return {
    save,
    saveAll,
    applyBomTemplate,
  };
};

export default useStyleBomMutations;
