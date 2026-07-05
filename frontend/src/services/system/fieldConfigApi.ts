import api from '@/utils/api';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

export interface FieldConfigSaveRequest {
  bizType: string;
  platform?: string;
  fields: FieldConfigItem[];
}

interface ApiResult<T> { code: number; data: T; message?: string; }

export const fieldConfigApi = {
  list: (bizType: string, platform: string = 'pc', includeDisabled: boolean = false) =>
    api.get<ApiResult<FieldConfigItem[]>>('/system/field-config', {
      params: { bizType, platform, includeDisabled },
    }),

  saveBatch: (data: FieldConfigSaveRequest) =>
    api.put<ApiResult<FieldConfigItem[]>>('/system/field-config', data),

  delete: (bizType: string, fieldKey: string) =>
    api.delete<ApiResult<void>>('/system/field-config', { params: { bizType, fieldKey } }),
};

export const BIZ_TYPE_OPTIONS = [
  { label: '款式', value: 'style' },
  { label: '订单', value: 'order' },
  { label: '生产单', value: 'production' },
  { label: '扫码记录', value: 'scan' },
  { label: '客户', value: 'customer' },
  { label: '供应商', value: 'supplier' },
];

export const FIELD_TYPE_OPTIONS = [
  { label: '单行文本', value: 'text' },
  { label: '数字', value: 'number' },
  { label: '日期', value: 'date' },
  { label: '下拉选择', value: 'select' },
  { label: '多选', value: 'multiselect' },
  { label: '多行文本', value: 'textarea' },
  { label: '开关', value: 'switch' },
];

export const WIDGET_OPTIONS = [
  { label: '输入框', value: 'input' },
  { label: '数字输入', value: 'inputnumber' },
  { label: '日期选择器', value: 'datepicker' },
  { label: '下拉选择', value: 'select' },
  { label: '开关', value: 'switch' },
  { label: '文本域', value: 'textarea' },
];
