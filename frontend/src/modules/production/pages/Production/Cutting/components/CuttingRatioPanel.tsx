import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, InputNumber, Space, Tag, Typography, Tooltip, Select } from 'antd';
import { DeleteOutlined, PlusOutlined, QuestionCircleOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface BundleInputRow {
  skuNo: string;
  color: string;
  size: string;
  quantity: number;
}

interface ColorSizeRatioRow {
  key: string;
  color: string;
  sizes: Record<string, { ratio: number; cuttingQty: number; orderQty: number; usage?: number }>;
}

interface CuttingRatioPanelProps {
  entryColorText: string;
  entrySizeItems: Array<{ size: string; quantity: number }>;
  entryOrderLines: Array<{ color: string; size: string; quantity: number; skuNo?: string }>;
  defaultTotalQty: number;
  sizeUsageMap?: Record<string, number>;
  arrivedFabricM?: number;
  generating: boolean;
  disabled: boolean;
  onConfirm: (rows: BundleInputRow[]) => void;
  onClear: () => void;
}

let _keySeq = 0;
const nextKey = () => String(++_keySeq);

const CuttingRatioPanel: React.FC<CuttingRatioPanelProps> = ({
  entryColorText,
  entrySizeItems,
  entryOrderLines,
  defaultTotalQty,
  sizeUsageMap,
  arrivedFabricM,
  generating,
  disabled,
  onConfirm,
  onClear,
}) => {
  const [colorRows, setColorRows] = useState<ColorSizeRatioRow[]>([]);
  const [allSizes, setAllSizes] = useState<string[]>([]);
  const [arrivedInput, setArrivedInput] = useState<number | null>(null);

  const hasUsageMap = Boolean(sizeUsageMap && Object.keys(sizeUsageMap).length > 0);

  const buildInitialData = useCallback((lines: Array<{ color: string; size: string; quantity: number }>) => {
    if (lines.length === 0) {
      return { rows: [{ key: nextKey(), color: '', sizes: {} }], sizes: [] };
    }

    const colorMap = new Map<string, Record<string, { ratio: number; cuttingQty: number; orderQty: number; usage?: number }>>();
    const sizeSet = new Set<string>();

    for (const line of lines) {
      const color = line.color || '';
      const size = line.size || '';
      const qty = line.quantity || 0;

      sizeSet.add(size);

      if (!colorMap.has(color)) {
        colorMap.set(color, {});
      }
      const sizes = colorMap.get(color)!;
      sizes[size] = { ratio: 1, cuttingQty: qty, orderQty: qty };
    }

    const rows: ColorSizeRatioRow[] = Array.from(colorMap.entries()).map(([color, sizes]) => ({
      key: nextKey(),
      color,
      sizes,
    }));

    const sortedSizes = Array.from(sizeSet).sort((a, b) => {
      const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL'];
      const aIdx = sizeOrder.indexOf(a.toUpperCase());
      const bIdx = sizeOrder.indexOf(b.toUpperCase());
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return a.localeCompare(b, 'zh-CN', { numeric: true });
    });

    return { rows, sizes: sortedSizes };
  }, []);

  useEffect(() => {
    if (entryOrderLines.length > 0) {
      const { rows, sizes } = buildInitialData(entryOrderLines);
      setColorRows(rows);
      setAllSizes(sizes);
    }
  }, [entryOrderLines.map((x) => `${x.color}-${x.size}`).join(',')]);

  useEffect(() => {
    if (arrivedFabricM != null && arrivedFabricM > 0) {
      setArrivedInput((prev) => prev ?? arrivedFabricM);
    }
  }, [arrivedFabricM]);

  const handleRatioChange = (rowKey: string, size: string, ratio: number) => {
    setColorRows((prev) => prev.map((row) => {
      if (row.key !== rowKey) return row;
      const sizeData = row.sizes[size] || { orderQty: 0, cuttingQty: 0 };
      const newRatio = Math.max(0, ratio || 0);
      return {
        ...row,
        sizes: {
          ...row.sizes,
          [size]: { ...sizeData, ratio: newRatio },
        },
      };
    }));
  };

  const handleCuttingQtyChange = (rowKey: string, size: string, qty: number) => {
    setColorRows((prev) => prev.map((row) => {
      if (row.key !== rowKey) return row;
      const sizeData = row.sizes[size] || { orderQty: 0, ratio: 0 };
      const newQty = Math.max(0, qty || 0);
      return {
        ...row,
        sizes: {
          ...row.sizes,
          [size]: { ...sizeData, cuttingQty: newQty },
        },
      };
    }));
  };

  const handleColorChange = (rowKey: string, color: string) => {
    setColorRows((prev) => prev.map((row) => {
      if (row.key !== rowKey) return row;
      return { ...row, color };
    }));
  };

  const handleAddColor = () => {
    setColorRows((prev) => [...prev, { key: nextKey(), color: '', sizes: {} }]);
  };

  const handleRemoveColor = (rowKey: string) => {
    setColorRows((prev) => prev.filter((row) => row.key !== rowKey));
  };

  const { totalCuttingQty, totalBundles, consumedFabric, colorSummaries } = useMemo(() => {
    let totalCuttingQty = 0;
    let totalBundles = 0;
    let consumedFabric = 0;
    const summaries: Record<string, { orderQty: number; cuttingQty: number; bundleCount: number }> = {};

    for (const row of colorRows) {
      const color = row.color || '未知颜色';
      if (!summaries[color]) {
        summaries[color] = { orderQty: 0, cuttingQty: 0, bundleCount: 0 };
      }

      for (const size of allSizes) {
        const sizeData = row.sizes[size];
        if (!sizeData) continue;

        const bundleQty = sizeData.cuttingQty || 0;
        const orderQty = sizeData.orderQty || 0;
        const bundleCount = sizeData.ratio || 0;
        const totalQty = bundleQty * bundleCount;

        totalCuttingQty += totalQty;
        summaries[color].orderQty += orderQty;
        summaries[color].cuttingQty += totalQty;
        totalBundles += bundleCount;
        summaries[color].bundleCount += bundleCount;
      }
    }

    return { totalCuttingQty, totalBundles, consumedFabric, colorSummaries: summaries };
  }, [colorRows, allSizes, sizeUsageMap, hasUsageMap]);

  const handleConfirm = () => {
    const rows: BundleInputRow[] = [];
    for (const row of colorRows) {
      const color = String(row.color || '').trim();
      if (!color) continue;

      for (const size of allSizes) {
        const sizeData = row.sizes[size];
        if (!sizeData) continue;

        const bundleQty = sizeData.cuttingQty || 0;
        const bundleCount = sizeData.ratio || 0;
        if (bundleQty <= 0 || bundleCount <= 0) continue;

        for (let i = 0; i < bundleCount; i++) {
          rows.push({ skuNo: '', color, size, quantity: bundleQty });
        }
      }
    }
    onConfirm(rows);
  };

  const valid = colorRows.some((row) => {
    if (!row.color) return false;
    return allSizes.some((size) => (row.sizes[size]?.cuttingQty || 0) > 0);
  });

  const availableColors = useMemo(() => {
    const colors = new Set(entryOrderLines.map((x) => x.color).filter(Boolean));
    return Array.from(colors);
  }, [entryOrderLines]);

  return (
    <div style={{ marginBottom: 16 }}>
      <Space style={{ marginBottom: 10 }} wrap align="center">
        <span>
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>已确认可裁面料：</Text>
          <InputNumber
            min={0}
            max={999999}
            precision={2}
            value={arrivedInput}
            disabled={disabled}
            onChange={(val) => setArrivedInput(val)}
            style={{ width: 120, marginLeft: 4, marginRight: 4 }}
            placeholder="可裁米数"
          />
          <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)' }}>m</Text>
        </span>
        {consumedFabric > 0 && arrivedInput && arrivedInput > 0 && (
          <Text style={{ fontSize: 'var(--font-size-sm)', color: consumedFabric > arrivedInput ? '#ff4d4f' : '#52c41a' }}>
            预计消耗 {consumedFabric.toFixed(2)} m / 已确认 {arrivedInput} m
            {consumedFabric > arrivedInput && '（仅作提示，支持分批裁剪）'}
          </Text>
        )}
      </Space>

      <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
        📋 按颜色+尺码分配裁剪数量
        <Tooltip title={
          <div>
            <div><b>填写说明：</b></div>
            <div>• 配比 = 扎数（分成几扎）</div>
            <div>• 件数 = 每扎的件数</div>
            <div>• 总件数 = 配比 × 件数</div>
            <div style={{ marginTop: 8 }}><b>示例：</b></div>
            <div>• 配比2，件数25 → 2扎，每扎25件，共50件</div>
            <div>• 配比3，件数10 → 3扎，每扎10件，共30件</div>
          </div>
        }>
          <QuestionCircleOutlined style={{ marginLeft: 4, color: '#999' }} />
        </Tooltip>
      </div>

      <div style={{ overflow: 'auto', border: '1px solid #f0f0f0', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: allSizes.length * 170 + 260 }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={{ padding: '10px 12px', borderBottom: '2px solid #f0f0f0', textAlign: 'center', width: 100, fontWeight: 600 }}>颜色</th>
              {allSizes.map((size) => (
                <th key={size} style={{ padding: '10px 6px', borderBottom: '2px solid #f0f0f0', textAlign: 'center', fontWeight: 600, minWidth: 170 }}>
                  {size}
                </th>
              ))}
              <th style={{ padding: '10px 12px', borderBottom: '2px solid #f0f0f0', textAlign: 'center', width: 80, fontWeight: 600, background: '#e6f7ff' }}>小计</th>
              <th style={{ padding: '10px 8px', borderBottom: '2px solid #f0f0f0', textAlign: 'center', width: 90, fontWeight: 600 }}>
                <Tooltip title={`扎数 = 配比\n总件数 = 配比 × 每扎件数`}>
                  <span>扎数 <QuestionCircleOutlined style={{ marginLeft: 2, color: '#999', fontSize: 11 }} /></span>
                </Tooltip>
              </th>
              <th style={{ padding: '10px 4px', borderBottom: '2px solid #f0f0f0', width: 44 }}></th>
            </tr>
          </thead>
          <tbody>
            {colorRows.map((row) => {
              const rowTotal = allSizes.reduce((sum, size) => {
                const data = row.sizes[size];
                return sum + ((data?.cuttingQty || 0) * (data?.ratio || 0));
              }, 0);
              const rowBundles = allSizes.reduce((sum, size) => sum + (row.sizes[size]?.ratio || 0), 0);

              return (
                <tr key={row.key}>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f5f5f5', textAlign: 'center' }}>
                    <Select
                      value={row.color || undefined}
                      onChange={(val) => handleColorChange(row.key, val)}
                      placeholder="颜色"
                      disabled={disabled}
                      style={{ width: '100%' }}
                      size="small"
                      showSearch
                      allowClear
                      options={availableColors.map((c) => ({ label: c, value: c }))}
                    />
                  </td>
                  {allSizes.map((size) => {
                    const sizeData = row.sizes[size] || { ratio: 0, cuttingQty: 0, orderQty: 0 };
                    const usage = sizeUsageMap?.[size];
                    return (
                      <td key={size} style={{ padding: '8px 6px', borderBottom: '1px solid #f5f5f5', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>用量</span>
                            <span style={{ fontSize: 13, color: '#262626', fontWeight: 500, minWidth: 45 }}>
                              {usage != null ? `${Number(usage).toFixed(2)}m` : '-'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>配比</span>
                            <InputNumber
                              min={0}
                              max={99}
                              step={1}
                              precision={0}
                              size="small"
                              style={{ width: 45 }}
                              value={sizeData.ratio}
                              disabled={disabled}
                              onChange={(val) => handleRatioChange(row.key, size, val || 0)}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>每扎</span>
                            <InputNumber
                              min={0}
                              max={99999}
                              size="small"
                              style={{ width: 50 }}
                              value={sizeData.cuttingQty}
                              disabled={disabled}
                              onChange={(val) => handleCuttingQtyChange(row.key, size, val || 0)}
                            />
                            <span style={{ fontSize: 12, color: '#8c8c8c' }}>件</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#1677ff', fontWeight: 500, marginLeft: 2 }}>
                            下单{sizeData.orderQty || 0}件
                          </div>
                        </div>
                      </td>
                    );
                  })}
                  <td style={{ padding: '8px', borderBottom: '1px solid #f5f5f5', textAlign: 'center', background: '#e6f7ff', fontWeight: 600 }}>
                    {rowTotal}
                  </td>
                  <td style={{ padding: '8px', borderBottom: '1px solid #f5f5f5', textAlign: 'center', fontWeight: 500, color: '#1677ff' }}>
                    {rowBundles} 扎
                  </td>
                  <td style={{ padding: '4px', borderBottom: '1px solid #f5f5f5', textAlign: 'center' }}>
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      disabled={disabled || colorRows.length <= 1}
                      onClick={() => handleRemoveColor(row.key)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!disabled && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddColor}
          style={{ marginTop: 8, width: '100%' }}
        >
          添加颜色
        </Button>
      )}

      <Space wrap style={{ marginTop: 12, marginBottom: 12 }}>
        {Object.entries(colorSummaries).map(([color, data]) => (
          <Tag key={color} color="blue" style={{ marginBottom: 4 }}>
            {color}: {data.cuttingQty}/{data.orderQty} 件 · {data.bundleCount} 扎
          </Tag>
        ))}
        <Tag color="green">总裁剪：{totalCuttingQty} 件</Tag>
        <Tag color="purple">总扎数：{totalBundles} 扎</Tag>
        {consumedFabric > 0 && (!arrivedInput || arrivedInput <= 0) && (
          <Tag color="orange">预计消耗面料：{consumedFabric.toFixed(2)} m</Tag>
        )}
      </Space>

      <Form.Item style={{ marginBottom: 0 }}>
        <Space>
          <Button
            type="primary"
            loading={generating}
            disabled={!valid || disabled}
            onClick={handleConfirm}
          >
            确认 → 生成菲号
          </Button>
          <Button disabled={disabled} onClick={onClear}>
            清空
          </Button>
        </Space>
      </Form.Item>
    </div>
  );
};

export default CuttingRatioPanel;
