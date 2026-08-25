import React, { useMemo, useState } from 'react';
import { Button, Card, Empty, InputNumber, Select, Space } from 'antd';
import type { CuttingCreateTaskState } from '../hooks';

interface Props {
  createTask: CuttingCreateTaskState;
}

const normalizeKey = (v: unknown) => String(v || '').trim().toLowerCase();
const uniq = (arr: string[]) => Array.from(new Set(arr.filter(Boolean)));

/**
 * 下单明细卡片（D-123 重构）：与正常下单（MultiColorOrderEditor）同一套矩阵交互——
 * 颜色/码数用 Select 标签选择，矩阵为「颜色行 × 码数列」，数量框无加减号，
 * 含行小计/码数合计/全部铺量。数据仍写入 createOrderLines，提交链路零改动。
 */
const OrderLinesCard: React.FC<Props> = ({ createTask }) => {
  const lines = createTask.createOrderLines;
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [quickFillQty, setQuickFillQty] = useState(1);

  const totalQuantity = useMemo(
    () => lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    [lines]
  );

  const colorOptions = useMemo(() => uniq(lines.map((l) => String(l.color || '').trim())).map((v) => ({ label: v, value: v })), [lines]);
  const sizeOptions = useMemo(() => uniq(lines.map((l) => String(l.size || '').trim())).map((v) => ({ label: v, value: v })), [lines]);

  const matrixRows = useMemo(
    () => selectedColors.map((color) => ({
      key: color,
      color,
      total: lines
        .filter((l) => normalizeKey(l.color) === normalizeKey(color))
        .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    })),
    [lines, selectedColors]
  );

  const sizeTotals = useMemo(() => {
    return selectedSizes.reduce<Record<string, number>>((acc, size) => {
      acc[size] = lines
        .filter((l) => normalizeKey(l.size) === normalizeKey(size))
        .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
      return acc;
    }, {});
  }, [lines, selectedSizes]);

  const buildLines = (colors: string[], sizes: string[]) => {
    const out: { color: string; size: string; quantity: number | null }[] = [];
    for (const c of colors) {
      for (const s of sizes) {
        const matched = lines.find((l) => normalizeKey(l.color) === normalizeKey(c) && normalizeKey(l.size) === normalizeKey(s));
        out.push({ color: c, size: s, quantity: matched ? (matched.quantity ?? null) : null });
      }
    }
    return out;
  };

  const syncSelection = (colors: string[], sizes: string[]) => {
    const nextColors = uniq(colors);
    const nextSizes = uniq(sizes);
    setSelectedColors(nextColors);
    setSelectedSizes(nextSizes);
    createTask.setCreateOrderLines(buildLines(nextColors, nextSizes));
  };

  const updateMatrixQty = (color: string, size: string, quantity: number) => {
    const normalizedQty = Math.max(0, Number(quantity) || 0);
    createTask.setCreateOrderLines((prev) => {
      const idx = prev.findIndex((l) => normalizeKey(l.color) === normalizeKey(color) && normalizeKey(l.size) === normalizeKey(size));
      if (idx >= 0) {
        if (normalizedQty <= 0) return prev.filter((_, i) => i !== idx);
        return prev.map((l, i) => (i === idx ? { ...l, quantity: normalizedQty } : l));
      }
      if (normalizedQty <= 0) return prev;
      return [...prev, { color, size, quantity: normalizedQty }];
    });
  };

  const applyQuickFill = () => {
    const qty = Math.max(1, Number(quickFillQty) || 1);
    createTask.setCreateOrderLines((prev) => prev.map((l) => ({ ...l, quantity: qty })));
  };

  return (
    <Card style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ color: 'rgba(0,0,0,0.85)', fontWeight: 50 }}>下单明细</span>
        <div style={{ color: 'var(--neutral-text-light)' }}>
          总数量：<span style={{ fontWeight: 600 }}>{totalQuantity}</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
        <Select
          mode="tags"
          placeholder="选择或输入下单颜色"
          value={selectedColors}
          options={colorOptions}
          onChange={(values) => syncSelection(values as string[], selectedSizes)}
          maxTagCount="responsive"
        />
        <Select
          mode="tags"
          placeholder="选择或输入下单码数"
          value={selectedSizes}
          options={sizeOptions}
          onChange={(values) => syncSelection(selectedColors, values as string[])}
          maxTagCount="responsive"
        />
      </div>

      <Space size={8} style={{ marginBottom: 12 }} wrap>
        <Button onClick={() => syncSelection([], [])}>清空</Button>
        <InputNumber
          min={1}
          value={quickFillQty}
          onChange={(value) => setQuickFillQty(Math.max(1, Number(value) || 1))}
          style={{ width: 90 }}
          controls={false}
        />
        <Button type="primary" ghost onClick={applyQuickFill}>全部铺量</Button>
      </Space>

      {!selectedColors.length || !selectedSizes.length ? (
        <div style={{ border: '1px dashed var(--color-border-antd)', borderRadius: 8, padding: '24px 12px', background: 'var(--color-bg-container)' }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="先选颜色和码数，再在矩阵中填数量" />
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
                  <td style={{ padding: '6px 6px', borderBottom: '1px solid var(--color-bg-subtle)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.color}</td>
                  {selectedSizes.map((size) => {
                    const matched = lines.find((l) => normalizeKey(l.color) === normalizeKey(row.color) && normalizeKey(l.size) === normalizeKey(size));
                    return (
                      <td key={`${row.key}-${size}`} style={{ padding: 2, borderBottom: '1px solid var(--color-bg-subtle)' }}>
                        <InputNumber
                          min={0}
                          value={matched?.quantity || 0}
                          style={{ width: '100%' }}
                          controls={false}
                          onChange={(value) => updateMatrixQty(row.color, size, Number(value) || 0)}
                        />
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px 6px', borderBottom: '1px solid var(--color-bg-subtle)', textAlign: 'center', fontWeight: 600 }}>{row.total}</td>
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
      {createTask.createStyleName ? (
        <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createTask.createStyleName}</div>
      ) : null}
    </Card>
  );
};

export default OrderLinesCard;
