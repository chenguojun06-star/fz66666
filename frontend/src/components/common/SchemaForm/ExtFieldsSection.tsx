import React, { useMemo } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Switch, Row, Col } from 'antd';
import type { FormInstance } from 'antd/es/form';
import dayjs from 'dayjs';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

/**
 * ExtFieldsSection - 自定义字段区块（嵌入已有 Form 中使用）
 * 只渲染 Form.Item 字段，不包外层 Form
 * 用于在业务表单中追加"扩展字段"section
 *
 * 用法：
 *   <Form form={form}>
 *     ...标准字段...
 *     <ExtFieldsSection fields={customFields} />
 *   </Form>
 *
 * extJson 读写约定：
 * - 读：父组件在 form.setFieldsValue 时，把 extJson 展开到顶层
 * - 写：父组件在提交时，把自定义字段收集回 extJson 字符串
 */

type ExtFieldsSectionProps = {
  /** 自定义字段配置（通常是 is_system=0 的字段，或全部 enabled 字段） */
  fields: FieldConfigItem[];
  /** 是否禁用 */
  disabled?: boolean;
  /** 布局列数（默认2列，即每列 span=12） */
  colSpan?: number;
  /** 字段名前缀（如 ext_，默认无前缀） */
  namePrefix?: string;
};

function parseValidations(json?: string | null) {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}

function parseOptions(json?: string | null): { label: string; value: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return { label: item, value: item };
      return { label: item.label ?? item.value ?? String(item), value: item.value ?? item.label ?? String(item) };
    });
  } catch { return []; }
}

function mapTypeToWidget(fieldType: string): string {
  switch (fieldType) {
    case 'number': return 'inputnumber';
    case 'date': return 'datepicker';
    case 'select': return 'select';
    case 'multiselect': return 'select';
    case 'switch': return 'switch';
    case 'textarea': return 'textarea';
    default: return 'input';
  }
}

/** 展开 extJson 到顶层，供 Form.setFieldsValue 使用 */
export function flattenExtJson(extJson?: string | Record<string, unknown> | null): Record<string, unknown> {
  if (!extJson) return {};
  if (typeof extJson === 'string') {
    try { return JSON.parse(extJson) || {}; } catch { return {}; }
  }
  if (typeof extJson === 'object') return extJson;
  return {};
}

/** 收集自定义字段的值并序列化为 extJson 字符串 */
export function collectExtValues(
  form: FormInstance,
  customFields: FieldConfigItem[],
  baseValues: Record<string, unknown> = {}
): string {
  const allValues = form.getFieldsValue();
  const ext: Record<string, unknown> = {};
  customFields.forEach(f => {
    const key = f.fieldKey;
    if (key in allValues) {
      ext[key] = allValues[key];
    }
  });
  // 合并已有 extJson 中的其他字段
  const existing = flattenExtJson(baseValues.extJson as string | undefined);
  const merged = { ...existing, ...ext };
  return JSON.stringify(merged);
}

const FieldWidget: React.FC<{
  field: FieldConfigItem;
  disabled?: boolean;
  colSpan: number;
  namePrefix: string;
}> = ({ field, disabled, colSpan, namePrefix }) => {
  const widget = field.pcWidget || mapTypeToWidget(field.fieldType);
  const validations = parseValidations(field.validationsJson);
  const rules: any[] = [];
  if (validations.required) rules.push({ required: true, message: `${field.label}必填` });
  if (validations.pattern) rules.push({ pattern: new RegExp(validations.pattern), message: `${field.label}格式不正确` });

  const name = namePrefix ? `${namePrefix}${field.fieldKey}` : field.fieldKey;

  switch (widget) {
    case 'input':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} rules={rules}>
            <Input disabled={disabled} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
    case 'inputnumber':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} rules={rules}>
            <InputNumber
              disabled={disabled}
              style={{ width: '100%' }}
              min={validations.min}
              max={validations.max}
              placeholder={`请输入${field.label}`}
            />
          </Form.Item>
        </Col>
      );
    case 'datepicker':
      return (
        <Col span={colSpan}>
          <Form.Item
            label={field.label}
            name={name}
            rules={rules}
            getValueProps={(v) => ({ value: v ? dayjs(v) : undefined })}
            normalize={(v) => (v ? (v as dayjs.Dayjs).format('YYYY-MM-DD') : undefined)}
          >
            <DatePicker disabled={disabled} style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      );
    case 'select':
    case 'multiselect': {
      const isMulti = widget === 'multiselect' || field.fieldType === 'multiselect';
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} rules={rules}>
            <Select
              disabled={disabled}
              mode={isMulti ? 'multiple' : undefined}
              options={parseOptions(field.optionsJson)}
              placeholder={`请选择${field.label}`}
              allowClear
            />
          </Form.Item>
        </Col>
      );
    }
    case 'switch':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} valuePropName="checked">
            <Switch disabled={disabled} />
          </Form.Item>
        </Col>
      );
    case 'textarea':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} rules={rules}>
            <Input.TextArea disabled={disabled} rows={3} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
    default:
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={name} rules={rules}>
            <Input disabled={disabled} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
  }
};

export const ExtFieldsSection: React.FC<ExtFieldsSectionProps> = ({
  fields,
  disabled = false,
  colSpan = 12,
  namePrefix = '',
}) => {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [fields]
  );

  if (sortedFields.length === 0) return null;

  return (
    <Row gutter={16}>
      {sortedFields.map(field => (
        <FieldWidget
          key={field.fieldKey}
          field={field}
          disabled={disabled}
          colSpan={colSpan}
          namePrefix={namePrefix}
        />
      ))}
    </Row>
  );
};

export default ExtFieldsSection;
