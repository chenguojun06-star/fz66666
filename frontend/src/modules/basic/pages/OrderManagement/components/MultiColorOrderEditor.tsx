import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, InputNumber, Select, Space, Tag } from 'antd';
import api from '@/utils/api';
import type { OrderLine } from '../types';

interface MultiColorOrderEditorProps {
  styleId: string | number | null;
  availableColors: string[];
  availableSizes: string[];
  orderLines: OrderLine[];
  totalQuantity: number;
  isMobile: boolean;
  onChange: (lines: OrderLine[]) => void;
}

interface FullAvailabilityResponse {
  code: number;
  data: {
    matrix?: Record<string, Record<string, Record<string, number>>>;
    summary?: {
      totalInProduction?: number;
      totalStock?: number;
      totalPendingSales?: number;
    };
    colors?: string[];
    sizes?: string[];
  };
}

interface AvailabilityInfo {
  inProduction: number;
  stock: number;
  pendingSales: number;
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
  styleId,
  availableColors,
  availableSizes,
  orderLines,
  totalQuantity,
  isMobile,
  onChange,
}) => {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [quickFillQty, setQuickFillQty] = useState<number>(1);
  const [availabilityMatrix, setAvailabilityMatrix] = useState<Record<string, Record<string, AvailabilityInfo>>>({});
  const [summary, setSummary] = useState<{ inProduction: number; stock: number; pendingSales: number } | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);

  // 查询综合可用性（在途+库存+欠数）
  useEffect(() => {
    if (!styleId) {
      setAvailabilityMatrix({});
      setSummary(null);
      return;
    }
    let cancelled = false;
    setAvailabilityLoading(true);
    api.get<FullAvailabilityResponse>(`/order-management/full-availability`, {
      params: { styleId: String(styleId) },
    }).then((res) => {
      if (cancelled) return;
      if (res.code === 200 && res.data) {
        // 对 matrix 做 key 归一化（颜色/尺码大小写、空格差异）
        const normalized: Record<string, Record<string, AvailabilityInfo>> = {};
        const rawMatrix = res.data.matrix || {};
        Object.entries(rawMatrix).forEach(([color, sizes]) => {
          const ck = normalizeKey(color);
          normalized[ck] = normalized[ck] || {};
          Object.entries(sizes).forEach(([size, info]) => {
            const sk = normalizeKey(size);
            normalized[ck][sk] = normalized[ck][sk] || { inProduction: 0, stock: 0, pendingSales: 0 };
            const rawInfo = info as Record<string, number>;
            normalized[ck][sk].inProduction += rawInfo.inProduction || 0;
            normalized[ck][sk].stock += rawInfo.stock || 0;
            normalized[ck][sk].pendingSales += rawInfo.pendingSales || 0;
          });
        });
        setAvailabilityMatrix(normalized);
        const s = res.data.summary || {};
        setSummary({
          inProduction: s.totalInProduction || 0,
          stock: s.totalStock || 0,
          pendingSales: s.totalPendingSales || 0,
        });
      }
    }).catch(() => {
      if (cancelled) return;
      setAvailabilityMatrix({});
      setSummary(null);
    }).finally(() => {
      if (!cancelled) setAvailabilityLoading(false);
    });
    return () => { cancelled = true; };
  }, [styleId]);

  const getAvailability = (color: string, size: string): AvailabilityInfo => {
    const byColor = availabilityMatrix[normalizeKey(color)];
    if (!byColor) return { inProduction: 0, stock: 0, pendingSales: 0 };
    return byColor[normalizeKey(size)] || { inProduction: 0, stock: 0, pendingSales: 0 };
  };
  const optionSignature = useMemo(
    () => `${availableColors.map((item) => normalizeKey(item)).join('|')}::${availableSizes.map((item) => normalizeKey(item)).join('|')}`,
    [availableColors, availableSizes],
  );
  const optionSignatureRef = useRef(optionSignature);

  useEffect(() => {
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
  }, [optionSignature, orderLines]);

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
    if (colors.length === 0 || sizes.length === 0) {
      onChange([]);
      return;
    }
    const newLines = buildLinesFromSelection(colors, sizes, orderLines);
    onChange(newLines);
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
<Tag style={{ marginInlineEnd: 0, color: '#1677ff', background: '#e6f4ff', borderColor: '#91caff' }}>开发色 {availableColors.length}</Tag>
              <Tag style={{ marginInlineEnd: 0, color: '#1677ff', background: '#e6f4ff', borderColor: '#91caff' }}>开发码 {availableSizes.length}</Tag>
              <Tag style={{ marginInlineEnd: 0, color: '#1677ff', background: '#e6f4ff', borderColor: '#91caff' }}>已选 {selectedColors.length} 色 / {selectedSizes.length} 码</Tag>
              <Tag style={{ marginInlineEnd: 0, color: '#1677ff', background: '#e6f4ff', borderColor: '#91caff' }}>组合 {orderLines.length}</Tag>
        </div>
        <div style={{ color: 'var(--neutral-text-light)' }}>
          总数量：<span style={{ fontWeight: 600 }}>{totalQuantity}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, color: 'var(--color-text-tertiary)' }}>
        <span>开发颜色：{availableColors.join(' / ') || '-'}</span>
        <span>可手动加色</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <Select
          mode="tags"
          placeholder="选择或输入下单颜色"
          value={selectedColors}
          options={availableColors.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(uniq(values as string[]), selectedSizes)}
          maxTagCount="responsive"
        />
        <Select
          mode="tags"
          placeholder="选择或输入下单码数"
          value={selectedSizes}
          options={availableSizes.map((value) => ({ label: value, value }))}
          onChange={(values) => syncSelection(selectedColors, uniq(values as string[]))}
          maxTagCount="responsive"
        />
      </div>

      <Space size={8} style={{ marginBottom: 12 }}>
        <Button onClick={() => syncSelection(availableColors, selectedSizes)}>全选颜色</Button>
        <Button onClick={() => syncSelection(selectedColors, availableSizes)}>全选码数</Button>
        <Button onClick={() => syncSelection([], [])}>清空</Button>
        <InputNumber id="quickFillQty" min={1} value={quickFillQty} onChange={(value) => setQuickFillQty(Math.max(1, Number(value) || 1))} />
        <Button type="primary" ghost onClick={() => applyQuickFill(quickFillQty)}>全部铺量</Button>
      </Space>

      {(summary && (summary.inProduction > 0 || summary.stock > 0 || summary.pendingSales > 0)) || availabilityLoading ? (
        <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 6, background: summary && (summary.inProduction > 0 || summary.pendingSales > 0) ? '#fff7e6' : 'var(--color-bg-container)', border: `1px solid ${summary && (summary.inProduction > 0 || summary.pendingSales > 0) ? '#ffd591' : 'var(--color-border-light)'}`, color: '#d46b08' }}>
          {availabilityLoading ? (
            <span>正在查询该款式的在途、库存、销售欠数...</span>
          ) : summary ? (
            <span>
              ⚠️ 该款式当前：
              {summary.inProduction > 0 && <strong style={{ fontSize: 15 }}>在途 {summary.inProduction}</strong>}
              {summary.stock > 0 && <strong style={{ fontSize: 15, marginLeft: 8 }}>库存 {summary.stock}</strong>}
              {summary.pendingSales > 0 && <strong style={{ fontSize: 15, marginLeft: 8, color: '#cf1322' }}>欠数 {summary.pendingSales}</strong>}
              ，请合理安排本次下单数量
            </span>
          ) : null}
        </div>
      ) : null}

      {!selectedColors.length || !selectedSizes.length ? (
        <div style={{ border: '1px dashed var(--color-border-antd)', borderRadius: 8, padding: '24px 12px', background: 'var(--color-bg-container)' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先选颜色和码数" />
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 8, overflow: 'auto', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: '15%' }}>颜色</th>
                {selectedSizes.map((size) => (
                  <th key={size} style={{ textAlign: 'center', padding: '8px 2px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: `${70 / selectedSizes.length}%` }}>{size}</th>
                ))}
                <th style={{ textAlign: 'center', padding: '8px 4px', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-container)', width: '15%' }}>小计</th>
              </tr>
            </thead>
            <tbody>
              {matrixRows.map((row) => (
                <tr key={row.key}>
                  <td style={{ padding: '6px 6px', borderBottom: '1px solid #f5f5f5', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.color}</td>
                  {selectedSizes.map((size) => {
                    const matched = orderLines.find((line) => buildComboKey(line.color, line.size) === buildComboKey(row.color, size));
                    const avail = getAvailability(row.color, size);
                    const hasInfo = avail.inProduction > 0 || avail.stock > 0 || avail.pendingSales > 0;
                    return (
                      <td key={`${row.key}-${size}`} style={{ padding: 2, borderBottom: '1px solid #f5f5f5' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <InputNumber
                            min={0}
                            value={matched?.quantity || 0}
                            style={{ width: '100%' }}
                            controls={false}
                           
                            onChange={(value) => updateMatrixQty(row.color, size, Number(value) || 0)}
                          />
                          {hasInfo ? (
                            <div style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.4, display: 'flex', gap: 4, justifyContent: 'center' }}>
                              {avail.inProduction > 0 && <span style={{ color: '#d46b08' }}>在途{avail.inProduction}</span>}
                              {avail.stock > 0 && <span style={{ color: '#52c41a' }}>库存{avail.stock}</span>}
                              {avail.pendingSales > 0 && <span style={{ color: '#cf1322' }}>欠{avail.pendingSales}</span>}
                            </div>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px 6px', borderBottom: '1px solid #f5f5f5', textAlign: 'center', fontWeight: 600 }}>{row.total}</td>
                </tr>
              ))}
              <tr>
                <td style={{ padding: '6px 6px', background: 'var(--color-bg-container)', fontWeight: 700 }}>码数合计</td>
                {selectedSizes.map((size) => (
                  <td key={`total-${size}`} style={{ padding: '6px 2px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 700 }}>
                    {sizeTotals[size] || 0}
                  </td>
                ))}
                <td style={{ padding: '6px 6px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 700 }}>{totalQuantity}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MultiColorOrderEditor;
