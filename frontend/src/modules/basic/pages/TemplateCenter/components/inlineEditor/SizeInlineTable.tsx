import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Button, Input, Select, Space, Popconfirm, Modal } from 'antd';
import { DeleteOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { sortSizeNames } from '@/utils/api';
import type { SizeTableData, SizeTablePart } from '../../utils/templateUtils';

interface SizeInlineTableProps {
  value: SizeTableData;
  onChange: (next: SizeTableData) => void;
  readOnly?: boolean;
  compact?: boolean;
}

type SizeTablePartRow = SizeTablePart & { __rowKey: string };

const BASE_SIZE_RAW = [
  'XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '80', '90', '100', '110', '120', '130', '140', '150', '160', '170', '180', '190', '200',
];

const BASE_SIZE_OPTIONS = sortSizeNames(BASE_SIZE_RAW).map((s) => ({ value: s, label: s }));

const SizeInlineTable: React.FC<SizeInlineTableProps> = ({ value, onChange, readOnly = false, compact = false }) => {
  const [editingSizeHeader, setEditingSizeHeader] = useState<string | null>(null);
  const [sizeHeaderDraft, setSizeHeaderDraft] = useState('');
  const [sizeOptions, setSizeOptions] = useState(BASE_SIZE_OPTIONS);
  const sizeHeaderInputRef = useRef<any>(null);
  const sortedRef = useRef(false);

  const sortedSizes = useMemo(() => sortSizeNames(value.sizes), [value.sizes]);

  if (!sortedRef.current && sortedSizes.join(',') !== value.sizes.join(',')) {
    sortedRef.current = true;
    onChange({ ...value, sizes: sortedSizes });
  }

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

  const handleAddSizes = useCallback((newSizes: string[]) => {
    const additions = newSizes.filter((s) => s && !value.sizes.includes(s));
    if (!additions.length) return;
    const nextSizes = sortSizeNames([...value.sizes, ...additions]);
    const nextParts = value.parts.map((part) => ({
      ...part,
      values: { ...(part.values || {}), ...additions.reduce((acc, s) => ({ ...acc, [s]: '' }), {} as Record<string, string>) },
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
    if (value.sizes.includes(newName) && newName !== oldSize) {
      Modal.warning({ title: `尺码"${newName}"已存在` });
      setEditingSizeHeader(null);
      return;
    }
    const nextSizes = sortSizeNames(value.sizes.map((s) => (s === oldSize ? newName : s)));
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

  const ensureSizeOption = useCallback((name: string) => {
    setSizeOptions((prev) => {
      if (prev.some((opt) => opt.value === name)) return prev;
      return [...prev, { value: name, label: name }];
    });
  }, []);

  const columns = useMemo(() => {
    const cols: any[] = [
      {
        title: '部位',
        dataIndex: 'partName',
        width: compact ? 120 : 140,
        render: (text: string, _: SizeTablePart, index?: number) => (
          <Input
            value={text || ''}
            placeholder="如：胸围"
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
            value={text || ''}
            placeholder="如：平量"
            disabled={readOnly}
            onChange={(e) => updatePart(index ?? 0, { measureMethod: e.target.value })}
          />
        ),
      },
    ];

    value.sizes.forEach((size) => {
      cols.push({
        title: (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
            {editingSizeHeader === size ? (
              <Input
                ref={sizeHeaderInputRef}
                value={sizeHeaderDraft}
                onChange={(e) => setSizeHeaderDraft(e.target.value)}
                onPressEnter={() => handleSizeHeaderConfirm(size)}
                onBlur={() => handleSizeHeaderConfirm(size)}
                style={{ width: 80, textAlign: 'center' }}
                autoFocus
              />
            ) : (
              <span
                style={{
                  cursor: readOnly ? 'default' : 'pointer',
                  fontWeight: 500,
                  borderBottom: readOnly ? 'none' : '1px dashed var(--color-border-antd)',
                  paddingBottom: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                onClick={() => {
                  if (readOnly) return;
                  setEditingSizeHeader(size);
                  setSizeHeaderDraft(size);
                  setTimeout(() => sizeHeaderInputRef.current?.focus(), 0);
                }}
              >
                {size}
                {!readOnly && <EditOutlined style={{ fontSize: 11, opacity: 0.45 }} />}
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
        width: compact ? 80 : 100,
        render: (_: unknown, record: SizeTablePart, index?: number) => (
          <Input
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
      width: compact ? 70 : 90,
      render: (text: string, _: SizeTablePart, index?: number) => (
        <Input
          value={String(text || '')}
          placeholder="如：0.5"
          disabled={readOnly}
          onChange={(e) => updatePart(index ?? 0, { tolerance: e.target.value })}
        />
      ),
    });

    if (!readOnly) {
      cols.push({
        title: '操作',
        key: 'actions',
        width: 64,
        resizable: false,
        render: (_: unknown, __: SizeTablePart, index?: number) => (
          <Popconfirm title="删除此部位行？" onConfirm={() => handleRemovePart(index ?? 0)} okText="删除" cancelText="取消">
            <Button type="text" danger icon={<DeleteOutlined />} disabled={value.parts.length <= 1} />
          </Popconfirm>
        ),
      });
    }

    return cols;
  }, [value, readOnly, editingSizeHeader, sizeHeaderDraft, compact, updatePart, updateCell, handleRemoveSize, handleRemovePart, handleSizeHeaderConfirm]);

  const availableSizeOptions = useMemo(
    () => sizeOptions.filter((opt) => !value.sizes.includes(opt.value)),
    [sizeOptions, value.sizes]
  );

  return (
    <div>
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <Button icon={<PlusOutlined />} onClick={handleAddPart}>新增部位</Button>
            <Select
              mode="tags"
              showSearch
              placeholder="输入或选择尺码，回车添加"
              style={{ minWidth: 220 }}
              options={availableSizeOptions}
              value={[]}
              onChange={(values) => {
                if (!values.length) return;
                const newSizes = (values as string[]).filter((v) => !value.sizes.includes(v));
                if (newSizes.length) handleAddSizes(newSizes);
              }}
              filterOption={(input, option) =>
                String(option?.value || '').toLowerCase().includes(String(input || '').toLowerCase())
              }
              onSearch={(searchValue) => {
                const trimmed = searchValue && searchValue.trim();
                if (trimmed && !sizeOptions.some((opt) => opt.value === trimmed)) {
                  ensureSizeOption(trimmed);
                }
              }}
              tokenSeparators={[',', '，']}
            />
        </div>
      )}
      <ResizableTable
        bordered
        autoScrollY={false}
        pagination={false}
        reorderableColumns={false}
        scroll={{ x: compact ? 336 + value.sizes.length * 80 : 'max-content' }}
        rowKey="__rowKey"
        columns={columns}
        dataSource={tableData}
      />
    </div>
  );
};

export default SizeInlineTable;
