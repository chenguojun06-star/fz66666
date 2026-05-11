import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Input, Space, Popconfirm, Table } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { SizeTableData, SizeTablePart } from '../../utils/templateUtils';

interface SizeInlineTableProps {
  value: SizeTableData;
  onChange: (next: SizeTableData) => void;
  readOnly?: boolean;
  compact?: boolean;
}

type SizeTablePartRow = SizeTablePart & { __rowKey: string };

const SizeInlineTable: React.FC<SizeInlineTableProps> = ({ value, onChange, readOnly = false, compact = false }) => {
  const [editingSizeHeader, setEditingSizeHeader] = useState<string | null>(null);
  const [sizeHeaderDraft, setSizeHeaderDraft] = useState('');
  const sizeHeaderInputRef = useRef<any>(null);

  const tableData = useMemo<SizeTablePartRow[]>(
    () => value.parts.map((part, index) => ({ ...part, __rowKey: `size-part-${index}` })),
    [value.parts]
  );

  const updatePart = useCallback((index: number, updates: Partial<SizeTablePart>) => {
    const nextParts = [...value.parts];
    const current = nextParts[index];
    if (!current) return;
    nextParts[index] = { ...current, ...updates };
    onChange({ ...value, parts: nextParts });
  }, [value, onChange]);

  const updateCell = useCallback((partIndex: number, size: string, nextValue: string) => {
    const current = value.parts[partIndex];
    if (!current) return;
    updatePart(partIndex, { values: { ...(current.values || {}), [size]: nextValue } });
  }, [value.parts, updatePart]);

  const handleAddPart = useCallback(() => {
    const nextPart: SizeTablePart = {
      partName: '',
      measureMethod: '',
      tolerance: '',
      values: value.sizes.reduce((acc, size) => ({ ...acc, [size]: '' }), {} as Record<string, string>),
    };
    onChange({ ...value, parts: [...value.parts, nextPart] });
  }, [value, onChange]);

  const handleRemovePart = useCallback((index: number) => {
    onChange({ ...value, parts: value.parts.filter((_, i) => i !== index) });
  }, [value, onChange]);

  const handleAddSize = useCallback(() => {
    const nextSize = `新尺码`;
    const nextSizes = [...value.sizes, nextSize];
    const nextParts = value.parts.map((part) => ({
      ...part,
      values: { ...(part.values || {}), [nextSize]: '' },
    }));
    onChange({ ...value, sizes: nextSizes, parts: nextParts });
  }, [value, onChange]);

  const handleRemoveSize = useCallback((size: string) => {
    const nextSizes = value.sizes.filter((s) => s !== size);
    const nextParts = value.parts.map((part) => {
      const nextValues = { ...(part.values || {}) };
      delete nextValues[size];
      return { ...part, values: nextValues };
    });
    onChange({ ...value, sizes: nextSizes, parts: nextParts });
  }, [value, onChange]);

  const handleSizeHeaderConfirm = useCallback((oldSize: string) => {
    const newName = sizeHeaderDraft.trim() || oldSize;
    if (newName === oldSize) { setEditingSizeHeader(null); return; }
    const nextSizes = value.sizes.map((s) => (s === oldSize ? newName : s));
    const nextParts = value.parts.map((part) => {
      const val = part.values?.[oldSize] || '';
      const nextValues = { ...(part.values || {}) };
      delete nextValues[oldSize];
      nextValues[newName] = val;
      return { ...part, values: nextValues };
    });
    onChange({ ...value, sizes: nextSizes, parts: nextParts });
    setEditingSizeHeader(null);
  }, [value, onChange, sizeHeaderDraft]);

  const columns = useMemo<ColumnsType<SizeTablePart>>(() => {
    const cols: ColumnsType<SizeTablePart> = [
      {
        title: '部位',
        dataIndex: 'partName',
        width: compact ? 120 : 140,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            size="small"
            variant="borderless"
            value={text || ''}
            disabled={readOnly}
            onChange={(e) => updatePart(index ?? 0, { partName: e.target.value })}
          />
        ),
      },
      {
        title: '测量方式',
        dataIndex: 'measureMethod',
        width: compact ? 100 : 120,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            size="small"
            variant="borderless"
            value={text || ''}
            disabled={readOnly}
            onChange={(e) => updatePart(index ?? 0, { measureMethod: e.target.value })}
          />
        ),
      },
    ];

    value.sizes.forEach((size) => {
      cols.push({
        title: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            {editingSizeHeader === size ? (
              <Input
                ref={sizeHeaderInputRef}
                size="small"
                value={sizeHeaderDraft}
                onChange={(e) => setSizeHeaderDraft(e.target.value)}
                onPressEnter={() => handleSizeHeaderConfirm(size)}
                onBlur={() => handleSizeHeaderConfirm(size)}
                style={{ width: 70, textAlign: 'center' }}
                autoFocus
              />
            ) : (
              <span
                style={{ cursor: readOnly ? 'default' : 'pointer', fontWeight: 500 }}
                onClick={() => {
                  if (readOnly) return;
                  setEditingSizeHeader(size);
                  setSizeHeaderDraft(size);
                  setTimeout(() => sizeHeaderInputRef.current?.focus(), 0);
                }}
              >
                {size}
              </span>
            )}
            {!readOnly && value.sizes.length > 1 && (
              <Popconfirm title="删除此尺码列？" onConfirm={() => handleRemoveSize(size)} okText="删除" cancelText="取消">
                <DeleteOutlined style={{ color: '#ff4d4f', cursor: 'pointer', fontSize: 13 }} />
              </Popconfirm>
            )}
          </div>
        ),
        dataIndex: ['values', size],
        width: compact ? 80 : 90,
        render: (_: unknown, record: SizeTablePart, index?: number) => (
          <Input
            size="small"
            variant="borderless"
            value={record.values?.[size] || ''}
            disabled={readOnly}
            onChange={(e) => updateCell(index ?? 0, size, e.target.value)}
          />
        ),
      });
    });

    cols.push({
      title: '公差',
      dataIndex: 'tolerance',
      width: compact ? 70 : 80,
      render: (text: string, _: SizeTablePart, index?: number) => (
        <Input
          size="small"
          variant="borderless"
          value={String(text || '')}
          disabled={readOnly}
          onChange={(e) => updatePart(index ?? 0, { tolerance: e.target.value })}
        />
      ),
    });

    if (!readOnly) {
      cols.push({
        title: '',
        key: '__actions',
        width: 48,
        render: (_: unknown, __: SizeTablePart, index?: number) => (
          value.parts.length > 1 ? (
            <Popconfirm title="删除此部位行？" onConfirm={() => handleRemovePart(index ?? 0)} okText="删除" cancelText="取消">
              <Button type="text" danger size="small" icon={<DeleteOutlined />} />
            </Popconfirm>
          ) : null
        ),
      });
    }

    return cols;
  }, [value, readOnly, editingSizeHeader, sizeHeaderDraft, compact, updatePart, updateCell, handleRemoveSize, handleRemovePart, handleSizeHeaderConfirm]);

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Space size={8}>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddPart}>新增部位</Button>
            <Button size="small" icon={<PlusOutlined />} onClick={handleAddSize}>新增尺码</Button>
          </Space>
        </div>
      )}
      <Table
        size="small"
        bordered
        pagination={false}
        scroll={{ x: compact ? 336 + value.sizes.length * 80 : 'max-content' }}
        rowKey="__rowKey"
        columns={columns}
        dataSource={tableData}
      />
    </div>
  );
};

export default SizeInlineTable;
