import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AutoComplete, Button, Empty, InputNumber, Select, Space, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { OrderLine } from '../types';

interface MultiColorOrderEditorProps {
  availableColors: string[];
  availableSizes: string[];
  orderLines: OrderLine[];
  totalQuantity: number;
  isMobile: boolean;
  onChange: (lines: OrderLine[]) => void;
}

const normalizeKey = (value: unknown) => String(value || '').trim().toLowerCase();

const uniq = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    if (!text) continue;
    const key = normalizeKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
};

const buildComboKey = (color: string, size: string) => `${normalizeKey(color)}__${normalizeKey(size)}`;

const buildLinesFromSelection = (colors: string[], sizes: string[], previousLines: OrderLine[]) => {
  if (!colors.length || !sizes.length) return [] as OrderLine[];
  const aggregated = new Map<string, OrderLine>();
  previousLines.forEach((line, index) => {
    const key = buildComboKey(line.color, line.size);
    const prev = aggregated.get(key);
    if (prev) {
      prev.quantity += Number(line.quantity) || 0;
      return;
    }
    aggregated.set(key, {
      id: String(line.id || `${Date.now()}-${index}`),
      color: String(line.color || '').trim(),
      size: String(line.size || '').trim(),
      quantity: Number(line.quantity) || 1,
    });
  });

  return colors.flatMap((color, colorIndex) => sizes.map((size, sizeIndex) => {
    const key = buildComboKey(color, size);
    const matched = aggregated.get(key);
    return matched || {
      id: `${Date.now()}-${colorIndex}-${sizeIndex}`,
      color,
      size,
      quantity: 1,
    };
  }));
};

const MultiColorOrderEditor: React.FC<MultiColorOrderEditorProps> = ({
  availableColors,
  availableSizes,
  orderLines,
  totalQuantity,
  isMobile,
  onChange,
}) => {
  const hasStructuredOptions = availableColors.length > 0 && availableSizes.length > 0;
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [quickFillQty, setQuickFillQty] = useState<number>(1);
  const optionSignature = useMemo(
    () => `${availableColors.map((item) => normalizeKey(item)).join('|')}::${availableSizes.map((item) => normalizeKey(item)).join('|')}`,
    [availableColors, availableSizes],
  );
  const optionSignatureRef = useRef(optionSignature);

  useEffect(() => {
    if (!hasStructuredOptions) return;
    const nextColors = uniq(orderLines.map((line) => line.color).filter(Boolean));
    const nextSizes = uniq(orderLines.map((line) => line.size).filter(Boolean));
    if (nextColors.length || nextSizes.length) {
      setSelectedColors(nextColors);
      setSelectedSizes(nextSizes);
      optionSignatureRef.current = optionSignature;
      return;
    }
    if (optionSignatureRef.current !== optionSignature) {
      optionSignatureRef.current = optionSignature;
      setSelectedColors([]);
      setSelectedSizes([]);
    }
  }, [hasStructuredOptions, optionSignature, orderLines]);

  const matrixRows = useMemo(() => {
    return selectedColors.map((color) => ({
      key: color,
      color,
      total: orderLines
        .filter((line) => normalizeKey(line.color) === normalizeKey(color))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0),
    }));
  }, [orderLines, selectedColors]);

  const sizeTotals = useMemo(() => {
    return selectedSizes.reduce<Record<string, number>>((acc, size) => {
      acc[size] = orderLines
        .filter((line) => normalizeKey(line.size) === normalizeKey(size))
        .reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
      return acc;
    }, {});
  }, [orderLines, selectedSizes]);

  const syncSelection = (colors: string[], sizes: string[]) => {
    setSelectedColors(colors);
    setSelectedSizes(sizes);
    const allowedKeys = new Set(colors.flatMap((color) => sizes.map((size) => buildComboKey(color, size))));
    onChange(orderLines.filter((line) => allowedKeys.has(buildComboKey(line.color, line.size))));
  };

  const updateMatrixQty = (color: string, size: string, quantity: number) => {
    const normalizedQty = Math.max(0, Number(quantity) || 0);
    const targetKey = buildComboKey(color, size);
    const matched = orderLines.find((line) => buildComboKey(line.color, line.size) === targetKey);
    if (matched) {
      if (normalizedQty <= 0) {
        onChange(orderLines.filter((line) => buildComboKey(line.color, line.size) !== targetKey));
        return;
      }
      onChange(orderLines.map((line) => (
        buildComboKey(line.color, line.size) === targetKey
          ? { ...line, quantity: normalizedQty }
          : line
      )));
      return;
    }
    if (normalizedQty <= 0) return;
    onChange([
      ...orderLines,
      { id: `${Date.now()}-${Math.random()}`, color, size, quantity: normalizedQty },
    ]);
  };

  const applyQuickFill = (quantity: number) => {
    const normalizedQty = Math.max(1, Number(quantity) || 1);
    onChange(buildLinesFromSelection(selectedColors, selectedSizes, orderLines).map((line) => ({
      ...line,
      quantity: normalizedQty,
    })));
  };

  const addManualLine = () => {
    onChange([
      ...orderLines,
      {
        id: `${Date.now()}-${Math.random()}`,
        color: availableColors[0] || '',
        size: availableSizes[0] || '',
        quantity: 1,
      },
    ]);
  };

  const updateManualLine = (id: string, patch: Partial<OrderLine>) => {
    onChange(orderLines.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  };

  const removeManualLine = (id: string) => {
    onChange(orderLines.filter((line) => line.id !== id));
  };

  if (!hasStructuredOptions) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ color: 'var(--neutral-text-light)' }}>
            总数量：<span style={{ fontWeight: 600 }}>{totalQuantity}</span>
          </div>
          <Button onClick={addManualLine}>新增明细</Button>
        </div>
        <ResizableTable
          rowKey={(row) => row.id}
          dataSource={orderLines}
          pagination={false}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
          columns={[
            {
              title: '颜色',
              key: 'color',
              width: isMobile ? 160 : 220,
              render: (_: unknown, record: OrderLine) => (
                <AutoComplete
                  value={record.color}
                  options={availableColors.map((value) => ({ value }))}
                  style={{ width: '100%' }}
                  onChange={(value) => updateManualLine(record.id, { color: String(value || '') })}
                  placeholder="颜色"
                />
              ),
            },
            {
              title: '码数',
              key: 'size',
              width: isMobile ? 160 : 220,
              render: (_: unknown, record: OrderLine) => (
                <AutoComplete
                  value={record.size}
                  options={availableSizes.map((value) => ({ value }))}
                  style={{ width: '100%' }}
                  onChange={(value) => updateManualLine(record.id, { size: String(value || '') })}
                  placeholder="码数"
                />
              ),
            },
            {
              title: '数量',
              key: 'quantity',
              width: isMobile ? 120 : 160,
              render: (_: unknown, record: OrderLine) => (
                <InputNumber
                  min={1}
                  style={{ width: '100%' }}
                  value={record.quantity}
                  onChange={(value) => updateManualLine(record.id, { quantity: Number(value) || 1 })}
                />
              ),
            },
            {
              title: '操作',
              key: 'action',
              width: isMobile ? 90 : 120,
              render: (_: unknown, record: OrderLine) => (
                <RowActions
                  actions={[
                    {
                      key: 'delete',
                      label: '删除',
                      danger: true,
                      disabled: orderLines.length <= 1,
                      onClick: () => removeManualLine(record.id),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Tag color="blue" style={{ marginInlineEnd: 0 }}>开发色 {availableColors.length}</Tag>
          <Tag color="purple" style={{ marginInlineEnd: 0 }}>开发码 {availableSizes.length}</Tag>
          <Tag color="gold" style={{ marginInlineEnd: 0 }}>已选 {selectedColors.length} 色 / {selectedSizes.length} 码</Tag>
          <Tag color="green" style={{ marginInlineEnd: 0 }}>组合 {orderLines.length}</Tag>
        </div>
        <div style={{ color: 'var(--neutral-text-light)' }}>
          总数量：<span style={{ fontWeight: 600 }}>{totalQuantity}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, color: '#8c8c8c', fontSize: 12 }}>
        <span>开发颜色：{availableColors.join(' / ') || '-'}</span>
        <span>可手动加色</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Select
          mode="tags"
          placeholder="选择下单颜色"
          value={selectedColors}
          options={availableColors.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(uniq(values as string[]), selectedSizes)}
          maxTagCount="responsive"
        />
        <Select
          mode="multiple"
          placeholder="选择下单码数"
          value={selectedSizes}
          options={availableSizes.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(selectedColors, uniq(values as string[]))}
          maxTagCount="responsive"
        />
      </div>

      <Space size={8} style={{ marginBottom: 12 }}>
        <Button size="small" onClick={() => syncSelection(availableColors, selectedSizes)}>全选颜色</Button>
        <Button size="small" onClick={() => syncSelection(selectedColors, availableSizes)}>全选码数</Button>
        <Button size="small" onClick={() => syncSelection([], [])}>清空</Button>
        <InputNumber min={1} size="small" value={quickFillQty} onChange={(value) => setQuickFillQty(Math.max(1, Number(value) || 1))} />
        <Button size="small" type="primary" ghost onClick={() => applyQuickFill(quickFillQty)}>全部铺量</Button>
      </Space>

      {!selectedColors.length || !selectedSizes.length ? (
        <div style={{ border: '1px dashed #d9d9d9', borderRadius: 8, padding: '24px 12px', background: '#fafafa' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先选颜色和码数" />
        </div>
      ) : (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 420, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', minWidth: 120 }}>颜色</th>
                {selectedSizes.map((size) => (
                  <th key={size} style={{ textAlign: 'center', padding: '10px 8px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', minWidth: 110 }}>{size}</th>
                ))}
                <th style={{ textAlign: 'center', padding: '10px 12px', borderBottom: '1px solid #f0f0f0', background: '#fafafa', minWidth: 90 }}>小计</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f5', fontWeight: 600 }}>{row.color}</td>
                  {selectedSizes.map((size) => {
                    const matched = orderLines.find((line) => buildComboKey(line.color, line.size) === buildComboKey(row.color, size));
                    return (
                      <td key={`${row.key}-${size}`} style={{ padding: 8, borderBottom: '1px solid #f5f5f5' }}>
                        <InputNumber
                          min={0}
                          value={matched?.quantity || 0}
                          style={{ width: '100%' }}
                          onChange={(value) => updateMatrixQty(row.color, size, Number(value) || 0)}
                        />
                      </td>
                    );
                  })}
                  <td style={{ padding: '10px 12px', borderBottom: '1px solid #f5f5f5', textAlign: 'center', fontWeight: 600 }}>{row.total}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '10px 12px', background: '#fafafa', fontWeight: 700 }}>码数合计</td>
                {selectedSizes.map((size) => (
                  <td key={`total-${size}`} style={{ padding: '10px 8px', background: '#fafafa', textAlign: 'center', fontWeight: 700 }}>
                    {sizeTotals[size] || 0}
                  </td>
                ))}
                <td style={{ padding: '10px 12px', background: '#fafafa', textAlign: 'center', fontWeight: 700 }}>{totalQuantity}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MultiColorOrderEditor;
