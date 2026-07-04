import { useMemo } from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { formatDateTime } from '@/utils/datetime';

/**
 * useExtColumns - 为现有表格追加自定义字段列
 *
 * 适用于已有复杂列定义的表格（如款式列表），不想全量替换为 SchemaTable，
 * 只需把返回的 extColumns 追加到现有 columns 数组末尾即可。
 *
 * 用法：
 *   const { extColumns, fieldConfigs } = useExtColumns({ bizType: 'style', pageKey: 'style-list' });
 *   const columns = [...originalColumns, ...extColumns];
 *
 * 自定义字段值从 record.extJson 中解析（字符串 JSON）
 */

type UseExtColumnsOptions = {
  /** 业务对象类型 */
  bizType: string;
  /** 平台 */
  platform?: 'pc' | 'h5' | 'mp';
  /** 是否启用，默认 true */
  enabled?: boolean;
};

/** 从 record 中读取字段值（支持 extJson） */
export function getFieldValue(record: any, fieldKey: string): unknown {
  if (record && fieldKey in record && record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }
  const extJson = record?.extJson;
  if (extJson && typeof extJson === 'string') {
    try {
      const obj = JSON.parse(extJson);
      if (fieldKey in obj) return obj[fieldKey];
    } catch { /* ignore */ }
  } else if (extJson && typeof extJson === 'object') {
    if (fieldKey in extJson) return (extJson as Record<string, unknown>)[fieldKey];
  }
  return undefined;
}

/** 按字段类型渲染单元格 */
export function renderCellValue(value: unknown, fieldType?: string): React.ReactNode {
  if (value === undefined || value === null || value === '') return '-';
  switch (fieldType) {
    case 'select':
      return <Tag>{String(value)}</Tag>;
    case 'multiselect': {
      const arr = Array.isArray(value) ? value : String(value).split(',').filter(Boolean);
      if (arr.length === 0) return '-';
      return (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          {arr.map((v: string | number, i: number) => <Tag key={i}>{String(v)}</Tag>)}
        </span>
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
    default:
      return String(value);
  }
}

export function useExtColumns<T extends object = Record<string, unknown>>({
  bizType,
  platform = 'pc',
  enabled = true,
}: UseExtColumnsOptions) {
  const { fields, loading } = useFieldConfig({ bizType, platform, enabled });

  const extColumns = useMemo<ColumnsType<T>>(() => {
    if (!fields || fields.length === 0) return [];

    const customFields = fields
      .filter(f => f.isSystem === 0 && f.enabled !== 0)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    return customFields.map(field => ({
      title: field.label,
      key: `ext_${field.fieldKey}`,
      dataIndex: 'extJson',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: T) => {
        const value = getFieldValue(record, field.fieldKey);
        return renderCellValue(value, field.fieldType);
      },
    }));
  }, [fields]);

  return { extColumns, fieldConfigs: fields, loading };
}

export default useExtColumns;
