import React, { useMemo } from 'react';
import { Form, Input, InputNumber, DatePicker, Select, Switch, Row, Col } from 'antd';
import dayjs from 'dayjs';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';

/**
 * SchemaForm - 根据后端字段配置动态渲染表单
 * 支持 7 种 widget：input/inputnumber/datepicker/select/switch/textarea/...
 *
 * 用法：
 *   <SchemaForm form={form} fields={fieldConfigs} initialValues={record} />
 */

type SchemaFormProps = {
  form: any;
  fields: FieldConfigItem[];
  initialValues?: Record<string, unknown>;
  layout?: 'horizontal' | 'vertical' | 'inline';
  disabled?: boolean;
  onValuesChange?: (changed: Record<string, unknown>, all: Record<string, unknown>) => void;
};

/** 解析校验规则 JSON */
function parseValidations(json?: string | null) {
  if (!json) return {};
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}

/** 解析 select 选项 */
function parseOptions(json?: string | null): { label: string; value: string }[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item: any) => {
      if (typeof item === 'string') return { label: item, value: item };
      return { label: item.label ?? item.value ?? String(item), value: item.value ?? item.label ?? String(item) };
    });
  } catch {
    return [];
  }
}

const WidgetRenderer: React.FC<{
  field: FieldConfigItem;
  disabled?: boolean;
}> = ({ field, disabled }) => {
  const widget = field.pcWidget || mapTypeToWidget(field.fieldType);
  const validations = parseValidations(field.validationsJson);
  const rules: any[] = [];
  if (validations.required) rules.push({ required: true, message: `${field.label}必填` });
  if (validations.pattern) rules.push({ pattern: new RegExp(validations.pattern), message: `${field.label}格式不正确` });

  const colSpan = field.pcColSpan && field.pcColSpan > 0 ? field.pcColSpan : 24;

  switch (widget) {
    case 'input':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={field.fieldKey} rules={rules}>
            <Input disabled={disabled} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
    case 'inputnumber':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={field.fieldKey} rules={rules}>
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
            name={field.fieldKey}
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
          <Form.Item label={field.label} name={field.fieldKey} rules={rules}>
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
          <Form.Item label={field.label} name={field.fieldKey} valuePropName="checked">
            <Switch disabled={disabled} />
          </Form.Item>
        </Col>
      );
    case 'textarea':
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={field.fieldKey} rules={rules}>
            <Input.TextArea disabled={disabled} rows={3} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
    default:
      return (
        <Col span={colSpan}>
          <Form.Item label={field.label} name={field.fieldKey} rules={rules}>
            <Input disabled={disabled} placeholder={`请输入${field.label}`} />
          </Form.Item>
        </Col>
      );
  }
};

/** 字段类型 → 默认 widget 映射（pcWidget 缺省时使用） */
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

export const SchemaForm: React.FC<SchemaFormProps> = ({
  form,
  fields,
  initialValues,
  layout = 'horizontal',
  disabled,
  onValuesChange,
}) => {
  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [fields]
  );

  return (
    <Form
      form={form}
      layout={layout}
      initialValues={initialValues}
      onValuesChange={onValuesChange}
      preserve={false}
    >
      <Row gutter={16}>
        {sortedFields.map(field => (
          <WidgetRenderer key={field.fieldKey} field={field} disabled={disabled} />
        ))}
      </Row>
    </Form>
  );
};
