import React, { useMemo } from 'react';
import { Button, Input, Space } from 'antd';
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
          style={{ border: 'none', background: 'transparent', textAlign: 'center' }}
        />
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

    return [...baseColumns, ...sizeColumns];
  }, [value]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: compact ? 8 : 12 }}>
        {readOnly ? null : (
          <Space size={compact ? 6 : 8}>
            <Button size="small" onClick={handleAddPart}>新增部位</Button>
            <Button size="small" onClick={handleAddSize}>新增尺码</Button>
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
