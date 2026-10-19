import api, { unwrapApiData } from '@/utils/api';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

export interface FieldConfigSaveRequest {
  bizType: string;
  platform?: string;
  fields: FieldConfigItem[];
}

export const fieldConfigApi = {
  list: async (bizType: string, platform: string = 'pc', includeDisabled: boolean = false) =>
    unwrapApiData<FieldConfigItem[]>(await api.get('/system/field-config', {
      params: { bizType, platform, includeDisabled },
    }), '字段配置请求失败'),

  saveBatch: async (data: FieldConfigSaveRequest) =>
    unwrapApiData<FieldConfigItem[]>(await api.put('/system/field-config', data), '字段配置请求失败'),

  delete: async (bizType: string, fieldKey: string) =>
    unwrapApiData<void>(await api.delete('/system/field-config', { params: { bizType, fieldKey } }), '字段配置请求失败'),
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
