import React, { useMemo } from 'react';
import { Table, Space, Button, Switch, Tag, Typography } from 'antd';
import {
  UpOutlined, DownOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { FIELD_TYPE_OPTIONS } from '@/services/system/fieldConfigApi';
import { Popconfirm } from 'antd';
import { parseValidations } from './utils';

const { Text } = Typography;

interface FieldListTabProps {
  rows: FieldConfigItem[];
  loading: boolean;
  onToggleEnabled: (row: FieldConfigItem, enabled: boolean) => void;
  onSortChange: (row: FieldConfigItem, delta: number) => void;
  onEdit: (row: FieldConfigItem) => void;
  onDelete: (row: FieldConfigItem) => void;
}

const FieldListTab: React.FC<FieldListTabProps> = ({
  rows,
  loading,
  onToggleEnabled,
  onSortChange,
  onEdit,
  onDelete,
}) => {
  const columns = useMemo(() => [
    {
      title: '排序',
      dataIndex: 'sortOrder',
      width: 80,
      fixed: 'left' as const,
      render: (_: any, row: FieldConfigItem) => (
        <Space size={2} direction="vertical">
          <Button
            type="text"
            size="small"
            icon={<UpOutlined />}
            disabled={rows.findIndex(r => r.fieldKey === row.fieldKey) === 0}
            onClick={() => onSortChange(row, -1)}
          />
          <Button
            type="text"
            size="small"
            icon={<DownOutlined />}
            disabled={rows.findIndex(r => r.fieldKey === row.fieldKey) === rows.length - 1}
            onClick={() => onSortChange(row, 1)}
          />
        </Space>
      ),
    },
    { title: '字段名', dataIndex: 'label', width: 160, ellipsis: true },
    {
      title: '类型',
      dataIndex: 'fieldType',
      width: 100,
      render: (v: string) => FIELD_TYPE_OPTIONS.find(t => t.value === v)?.label || v,
    },
    {
      title: '系统字段',
      dataIndex: 'isSystem',
      width: 90,
      render: (v: number) => v === 1 ? <Tag color="blue">系统</Tag> : <Tag>自定义</Tag>,
    },
    {
      title: '必填',
      dataIndex: 'validationsJson',
      width: 70,
      render: (v: string | null | undefined) => {
        const p = parseValidations(v);
        return p.required ? <Tag color="red">是</Tag> : <Tag>否</Tag>;
      },
    },
    {
      title: '显示',
      dataIndex: 'enabled',
      width: 70,
      render: (v: number, row: FieldConfigItem) => (
        <Switch
          size="small"
          checked={v !== 0}
          onChange={(checked) => onToggleEnabled(row, checked)}
        />
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      fixed: 'right' as const,
      render: (_: any, row: FieldConfigItem) => (
        <Space size={4}>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => onEdit(row)}>编辑</Button>
          {row.isSystem !== 1 && (
            <Popconfirm title="确认删除该自定义字段？" onConfirm={() => onDelete(row)}>
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ], [rows, onToggleEnabled, onSortChange, onEdit, onDelete]);

  return (
    <>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        配置业务对象的字段显示/隐藏/排序/标签。系统字段不可删除，但可调整显示名和显隐。
        共 {rows.length} 个字段（系统 {rows.filter(r => r.isSystem === 1).length} / 自定义 {rows.filter(r => r.isSystem === 0).length}）
      </Text>
      <Table
        rowKey="fieldKey"
        columns={columns}
        dataSource={rows}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 1000, y: 520 }}
      />
    </>
  );
};

export default FieldListTab;
