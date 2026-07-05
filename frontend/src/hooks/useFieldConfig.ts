import { useEffect, useState, useCallback } from 'react';
import api from '@/utils/api';

/**
 * 字段配置 Hook
 * 拉取当前租户某业务对象的字段配置（已按用户角色过滤）
 */

export type FieldConfigItem = {
  id?: number;
  bizType: string;
  fieldKey: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multiselect' | 'textarea' | 'switch';
  optionsJson?: string | null;
  validationsJson?: string | null;
  pcWidget?: string | null;
  h5Widget?: string | null;
  mpWidget?: string | null;
  pcColSpan?: number;
  h5ColSpan?: number;
  sortOrder?: number;
  isSystem?: number;
  enabled?: number;
  visibleRoles?: string | null;
  editableRoles?: string | null;
  remark?: string | null;
};

type UseFieldConfigOptions = {
  bizType: string;
  platform?: 'pc' | 'h5' | 'mp';
  enabled?: boolean;
  /** 是否包含禁用字段（字段配置管理页面用），默认 false */
  includeDisabled?: boolean;
};

export function useFieldConfig({ bizType, platform = 'pc', enabled = true, includeDisabled = false }: UseFieldConfigOptions) {
  const [fields, setFields] = useState<FieldConfigItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFields = useCallback(async () => {
    if (!enabled || !bizType) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: FieldConfigItem[] }>(
        '/system/field-config',
        { params: { bizType, platform, includeDisabled } }
      );
      if (res?.code === 200 && Array.isArray(res.data)) {
        setFields(res.data);
      }
    } catch (e) {
      // 静默失败，不影响主流程
      console.warn('[useFieldConfig] 拉取字段配置失败', e);
    } finally {
      setLoading(false);
    }
  }, [bizType, platform, enabled, includeDisabled]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  return { fields, loading, refresh: fetchFields };
}
