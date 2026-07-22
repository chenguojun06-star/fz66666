import React, { useMemo } from 'react';
import { Descriptions, Tag } from 'antd';
import type { DescriptionsProps } from 'antd';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { formatDateTime } from '@/utils/datetime';

/**
 * SchemaDescriptions - 根据字段配置动态渲染详情描述列表
 * 包装 AntD Descriptions，支持从 extJson 读取自定义字段值
 *
 * 用法：
 *   <SchemaDescriptions
 *     fields={fieldConfigs}
 *     data={record}
 *     column={2}
 *     title="基本信息"
 *   />
 */

export type SchemaDescriptionsProps = {
  /** 字段配置 */
  fields: FieldConfigItem[];
  /** 数据记录 */
  data: Record<string, unknown>;
  /** 列数，默认 2 */
  column?: number;
  /** 标题 */
  title?: React.ReactNode;
  /** 额外内容 */
  extra?: React.ReactNode;
  /** 自定义渲染映射 { fieldKey: (value, record) => ReactNode } */
  renderMap?: Record<string, (value: unknown, record: Record<string, unknown>) => React.ReactNode>;
  /** 是否只显示 enabled 的字段，默认 true */
  filterEnabled?: boolean;
  /** 布局 */
  layout?: DescriptionsProps['layout'];
  /** 大小 */
  size?: DescriptionsProps['size'];
  className?: string;
};

function getFieldValue(record: Record<string, unknown>, fieldKey: string): unknown {
  if (fieldKey in record && record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }
  const extJson = record.extJson;
  if (extJson && typeof extJson === 'string') {
    try {
      const obj = JSON.parse(extJson);
      if (fieldKey in obj) return obj[fieldKey];
    } catch { /* ignore */ }
  } else if (extJson && typeof extJson === 'object') {
    const obj = extJson as Record<string, unknown>;
    if (fieldKey in obj) return obj[fieldKey];
  }
  return undefined;
}

function renderValue(
  value: unknown,
  fieldType?: string,
  _optionsJson?: string | null
): React.ReactNode {
  if (value === undefined || value === null || value === '') return '-';

  switch (fieldType) {
    case 'select': {
      const str = String(value);
      return <Tag>{str}</Tag>;
    }
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
      if (arr.length === 0) return '-';
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {arr.map((v: string | number, i: number) => (
            <Tag key={i}>{String(v)}</Tag>
          ))}
        </div>
      );
    }
    case 'date':
    case 'datetime':
      return formatDateTime(value);
    case 'number':
    case 'inputnumber':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    case 'boolean':
    case 'switch':
      return value ? <Tag color="success">是</Tag> : <Tag>否</Tag>;
    case 'textarea':
    case 'text':
    default:
      return String(value);
  }
}

export const SchemaDescriptions: React.FC<SchemaDescriptionsProps> = ({
  fields,
  data,
  column = 2,
  title,
  extra,
  renderMap,
  filterEnabled = true,
  layout = 'horizontal',
  size = 'default',
  className,
}) => {
  const visibleFields = useMemo(() => {
    let list = fields;
    if (filterEnabled) {
      list = list.filter(f => f.enabled !== 0);
    }
    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [fields, filterEnabled]);

  const items = useMemo(() => {
    return visibleFields.map(field => {
      const value = getFieldValue(data, field.fieldKey);
      const customRender = renderMap?.[field.fieldKey];
      const content = customRender
        ? customRender(value, data)
        : renderValue(value, field.fieldType, field.optionsJson);
      return {
        key: field.fieldKey,
        label: field.label,
        children: content,
      };
    });
  }, [visibleFields, data, renderMap]);

  if (visibleFields.length === 0) return null;

  return (
    <Descriptions
      title={title}
      extra={extra}
      column={column}
      bordered
      layout={layout}
      size={size}
      className={className}
      items={items}
    />
  );
};

export default SchemaDescriptions;
