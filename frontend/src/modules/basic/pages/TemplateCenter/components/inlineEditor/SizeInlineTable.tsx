import React, { useMemo } from 'react';
import { Button, Input, Space, Popconfirm } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import type { SizeTableData, SizeTablePart } from '../../utils/templateUtils';

interface SizeInlineTableProps {
  value: SizeTableData;
  onChange: (next: SizeTableData) => void;
  readOnly?: boolean;
  compact?: boolean;
}

type SizeTablePartRow = SizeTablePart & {
  __rowKey: string;
};

const SizeInlineTable: React.FC<SizeInlineTableProps> = ({ value, onChange, readOnly = false, compact = false }) => {
  const tableData = useMemo<SizeTablePartRow[]>(() => value.parts.map((part, index) => ({
    ...part,
    __rowKey: `size-part-${index}`,
  })), [value.parts]);

  const updatePart = (index: number, updates: Partial<SizeTablePart>) => {
    const nextParts = [...value.parts];
    const current = nextParts[index];
    if (!current) return;
    nextParts[index] = { ...current, ...updates };
    onChange({ ...value, parts: nextParts });
  };

  const updateCell = (partIndex: number, size: string, nextValue: string) => {
    const current = value.parts[partIndex];
    if (!current) return;
    updatePart(partIndex, {
      values: {
        ...(current.values || {}),
        [size]: nextValue,
      },
    });
  };

  const handleAddPart = () => {
    const nextPart: SizeTablePart = {
      partName: '',
      measureMethod: '',
      tolerance: '',
      values: value.sizes.reduce((acc, size) => ({ ...acc, [size]: '' }), {} as Record<string, string>),
    };
    onChange({ ...value, parts: [...value.parts, nextPart] });
  };

  const handleRemovePart = (index: number) => {
    const nextParts = value.parts.filter((_, i) => i !== index);
    onChange({ ...value, parts: nextParts });
  };

  const handleAddSize = () => {
    const nextSize = `SIZE_${value.sizes.length + 1}`;
    const nextSizes = [...value.sizes, nextSize];
    const nextParts = value.parts.map((part) => ({
      ...part,
      values: {
        ...(part.values || {}),
        [nextSize]: '',
      },
    }));
    onChange({ ...value, sizes: nextSizes, parts: nextParts });
  };

  const handleRemoveSize = (size: string) => {
    const nextSizes = value.sizes.filter((s) => s !== size);
    const nextParts = value.parts.map((part) => {
      const nextValues = { ...(part.values || {}) };
      delete nextValues[size];
      return { ...part, values: nextValues };
    });
    onChange({ ...value, sizes: nextSizes, parts: nextParts });
  };

  const columns = useMemo<ColumnsType<SizeTablePart>>(() => {
    const baseColumns: ColumnsType<SizeTablePart> = [
      {
        title: '部位',
        dataIndex: 'partName',
        width: compact ? 132 : 160,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            size="small"
            value={text || ''}
            disabled={readOnly}
            onChange={(event) => updatePart(index ?? 0, { partName: event.target.value })}
            style={{ border: 'none', fontSize: compact ? 12 : undefined }}
          />
        ),
      },
      {
        title: '测量方式',
        dataIndex: 'measureMethod',
        width: compact ? 120 : 140,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            size="small"
            value={text || ''}
            disabled={readOnly}
            onChange={(event) => updatePart(index ?? 0, { measureMethod: event.target.value })}
            style={{ border: 'none', fontSize: compact ? 12 : undefined }}
          />
        ),
      },
      {
        title: '公差',
        dataIndex: 'tolerance',
        width: compact ? 84 : 100,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            size="small"
            value={String(text || '')}
            disabled={readOnly}
            onChange={(event) => updatePart(index ?? 0, { tolerance: event.target.value })}
            style={{ border: 'none', fontSize: compact ? 12 : undefined }}
          />
        ),
      },
    ];

    const sizeColumns: ColumnsType<SizeTablePart> = value.sizes.map((size) => ({
      title: (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Input
            size="small"
            value={size}
            disabled={readOnly}
            onChange={(event) => {
              const nextSizeName = event.target.value;
              const nextSizes = value.sizes.map((current) => (current === size ? nextSizeName : current));
              const nextParts = value.parts.map((part) => {
                const currentValue = part.values?.[size] || '';
                const nextValues = { ...(part.values || {}) };
                delete nextValues[size];
                nextValues[nextSizeName] = currentValue;
                return { ...part, values: nextValues };
              });
              onChange({ ...value, sizes: nextSizes, parts: nextParts });
            }}
            style={{ border: 'none', background: 'transparent', textAlign: 'center', width: 50 }}
          />
          {!readOnly && value.sizes.length > 1 && (
            <Popconfirm title="删除此尺码列？" onConfirm={() => handleRemoveSize(size)} okText="删除" cancelText="取消">
              <DeleteOutlined style={{ color: 'var(--color-text-quaternary, #bfbfbf)', cursor: 'pointer', fontSize: 12 }} />
            </Popconfirm>
          )}
        </div>
      ),
      dataIndex: ['values', size],
      width: compact ? 82 : 100,
      render: (_: unknown, record: SizeTablePart, index?: number) => (
        <Input
          size="small"
          value={record.values?.[size] || ''}
          disabled={readOnly}
          onChange={(event) => updateCell(index ?? 0, size, event.target.value)}
          style={{ border: 'none', fontSize: compact ? 12 : undefined }}
        />
      ),
    }));

    if (!readOnly) {
      baseColumns.push({
        title: '',
        key: '__actions',
        width: 40,
        render: (_: unknown, __: SizeTablePart, index?: number) => (
          value.parts.length > 1 ? (
            <Popconfirm title="删除此部位行？" onConfirm={() => handleRemovePart(index ?? 0)} okText="删除" cancelText="取消">
              <DeleteOutlined style={{ color: 'var(--color-text-quaternary, #bfbfbf)', cursor: 'pointer' }} />
            </Popconfirm>
          ) : null
        ),
      });
    }

    return [...baseColumns, ...sizeColumns];
  }, [value, readOnly]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: compact ? 8 : 12 }}>
        {readOnly ? null : (
          <Space size={compact ? 6 : 8}>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddPart}>新增部位</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddSize}>新增尺码</Button>
          </Space>
        )}
      </div>
      <ResizableTable
        storageKey="maintenance-inline-size-editor"
        size="small"
        bordered
        autoScrollY={false}
        pagination={false}
        scroll={{ x: compact ? 336 + value.sizes.length * 82 : 'max-content' }}
        rowKey="__rowKey"
        columns={columns}
        dataSource={tableData}
      />
    </div>
  );
};

export default SizeInlineTable;
