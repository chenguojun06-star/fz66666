import React, { useMemo, useState } from 'react';
import { Space, Tag, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { useColumnSettings, ColumnSettingsModal } from '@/components/common/ColumnSettings';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { ColumnOption } from '@/components/common/ColumnSettings';
import { formatDateTime } from '@/utils/datetime';

/**
 * SchemaTable - 根据后端字段配置动态渲染列表
 * 包装 ResizableTable，提供列显隐/列顺序持久化能力
 *
 * 用法：
 *   <SchemaTable
 *     pageKey="style-list"
 *     bizType="style"
 *     fields={fieldConfigs}
 *     customColumns={customColumns}  // 自定义渲染列（如操作列、图片列）
 *     dataSource={data}
 *     rowKey="id"
 *   />
 */

type SchemaTableProps<T extends object> = {
  pageKey: string;
  bizType?: string;
  /** 后端字段配置（用于生成基础列） */
  fields: FieldConfigItem[];
  /** 自定义列（追加到字段列后，如操作列/图片列，不参与显隐配置） */
  customColumns?: any[];
  /** 默认隐藏的列（首次访问时这些列不显示） */
  defaultHidden?: string[];
  /** 启用列设置弹窗（默认 true） */
  enableColumnSettings?: boolean;
  /** 列设置按钮位置：outside(表外右上，默认) / toolbar(工具栏插槽) / none */
  settingsPosition?: 'outside' | 'toolbar' | 'none';
  /** 从数据行中读取指定字段值的解析函数（支持 extJson） */
  getFieldValue?: (record: T, fieldKey: string) => unknown;
  dataSource: T[];
  rowKey: string | ((record: T) => string);
} & Omit<React.ComponentProps<typeof ResizableTable<T>>, 'columns' | 'dataSource' | 'rowKey'>;

/** 从记录中读取字段值，优先读 record 上的直接字段，不存在则从 extJson 解析 */
function defaultGetFieldValue<T extends object>(record: T, fieldKey: string): unknown {
  const rec = record as Record<string, unknown>;
  if (fieldKey in rec && rec[fieldKey] !== undefined && rec[fieldKey] !== null) {
    return rec[fieldKey];
  }
  const extJson = rec.extJson;
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

/** 按字段类型渲染单元格值 */
function renderCellValue(value: unknown, fieldType?: string): React.ReactNode {
  if (value === undefined || value === null || value === '') return '-';
  switch (fieldType) {
    case 'select': {
      const str = String(value);
      return <Tag>{str}</Tag>;
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

function SchemaTable<T extends object>(props: SchemaTableProps<T>) {
  const {
    pageKey,
    bizType = 'common',
    fields,
    customColumns = [],
    defaultHidden = [],
    enableColumnSettings = true,
    settingsPosition = 'outside',
    getFieldValue = defaultGetFieldValue,
    dataSource,
    rowKey,
    ...rest
  } = props;

  const [settingsOpen, setSettingsOpen] = useState(false);

  const fieldColumns: ColumnOption[] = useMemo(
    () => fields
      .filter(f => f.enabled !== 0)
      .map(f => ({ key: f.fieldKey, label: f.label })),
    [fields]
  );

  const allColumns: ColumnOption[] = useMemo(
    () => [...fieldColumns, ...customColumns.map((c: any) => ({ key: c.dataIndex || c.key, label: c.title || '' }))],
    [fieldColumns, customColumns]
  );

  const defaultVisible = useMemo(() => {
    const map: Record<string, boolean> = {};
    allColumns.forEach(c => { map[c.key] = !defaultHidden.includes(c.key); });
    return map;
  }, [allColumns, defaultHidden]);

  const {
    visibleColumns,
    setVisible,
    reset,
    columnOptions,
    orderedVisibleColumns,
  } = useColumnSettings({
    pageKey,
    bizType,
    allColumns: fieldColumns,
    defaultVisible,
  });

  const finalColumns = useMemo(() => {
    const cols: any[] = [];
    orderedVisibleColumns.forEach(colOpt => {
      const fieldConfig = fields.find(f => f.fieldKey === colOpt.key);
      if (!fieldConfig) return;
      cols.push({
        title: colOpt.label,
        dataIndex: colOpt.key,
        key: colOpt.key,
        ellipsis: true,
        render: (_: unknown, record: T) => {
          const val = getFieldValue(record, colOpt.key);
          return renderCellValue(val, fieldConfig.fieldType);
        },
      });
    });
    customColumns.forEach(c => {
      const key = c.dataIndex || c.key;
      if (visibleColumns[key] !== false) cols.push(c);
    });
    return cols;
  }, [orderedVisibleColumns, fields, customColumns, visibleColumns, getFieldValue]);

  const settingsTrigger = (
    <Tooltip title="选择要显示的列">
      <a onClick={() => setSettingsOpen(true)} style={{ fontSize: 13 }}>
        <SettingOutlined /> 列设置
      </a>
    </Tooltip>
  );

  return (
    <>
      {enableColumnSettings && settingsPosition === 'outside' && (
        <div style={{ marginBottom: 8, textAlign: 'right' }}>
          {settingsTrigger}
        </div>
      )}
      <ResizableTable<T>
        columns={finalColumns}
        dataSource={dataSource}
        rowKey={rowKey}
        {...rest}
      />
      {enableColumnSettings && (
        <ColumnSettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          columnOptions={columnOptions}
          visibleColumns={visibleColumns}
          onToggle={setVisible}
          onReset={reset}
        />
      )}
    </>
  );
}

export default SchemaTable;
