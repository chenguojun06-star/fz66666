import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Form, InputNumber, Space, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const inlineLabelTextStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
};

const inlineValueTextStyle: React.CSSProperties = {
  fontSize: 'var(--font-size-sm)',
  fontWeight: 600,
};

export interface SizeRatioRow {
  key: string;
  size: string;
  ratio: number;
}

export interface BundleInputRow {
  skuNo: string;
  color: string;
  size: string;
  quantity: number;
}

interface CuttingRatioPanelProps {
  /** 来自订单的颜色 */
  entryColorText: string;
  /** 来自订单的尺码列表（预填） */
  entrySizeItems: Array<{ size: string; quantity: number }>;
  /** 订单总件数（预填） */
  defaultTotalQty: number;
  /** 纸样按码用量（m/件），来自 BOM sizeUsageMap */
  sizeUsageMap?: Record<string, number>;
  /** 主面料已到货量（m），预填到货量输入框 */
  arrivedFabricM?: number;
  /** 是否正在生成 */
  generating: boolean;
  /** 是否禁用（已生成菲号 / 锁定） */
  disabled: boolean;
  /** 确认 → 写入 bundlesInput 并触发生成 */
  onConfirm: (rows: BundleInputRow[]) => void;
  /** 清空回调 */
  onClear: () => void;
}

let _keySeq = 0;
const nextKey = () => String(++_keySeq);

const CuttingRatioPanel: React.FC<CuttingRatioPanelProps> = ({
  entryColorText,
  entrySizeItems,
  defaultTotalQty,
  sizeUsageMap,
  arrivedFabricM,
  generating,
  disabled,
  onConfirm,
  onClear,
}) => {
  const buildInitialRows = useCallback(
    (items: Array<{ size: string; quantity: number }>): SizeRatioRow[] => {
      if (items.length > 0) {
        return items.map((x) => ({ key: nextKey(), size: x.size, ratio: 1 }));
      }
      return [{ key: nextKey(), size: '', ratio: 1 }];
    },
    []
  );

  const [ratioRows, setRatioRows] = useState<SizeRatioRow[]>(() => buildInitialRows(entrySizeItems));
  const [totalQty, setTotalQty] = useState<number>(defaultTotalQty || 0);
  const [arrivedInput, setArrivedInput] = useState<number | null>(null);
  /** 每扎件数上限（可选）：有值时各码独立拆扎 */
  const [piecesPerBundle, setPiecesPerBundle] = useState<number | null>(null);

  const hasUsageMap = Boolean(sizeUsageMap && Object.keys(sizeUsageMap).length > 0);

  // 订单尺码数据加载后同步
  useEffect(() => {
    if (entrySizeItems.length > 0) {
      setRatioRows(buildInitialRows(entrySizeItems));
    }
  }, [entrySizeItems.map((x) => x.size).join(',')]);

  useEffect(() => {
    if (defaultTotalQty > 0) setTotalQty(defaultTotalQty);
  }, [defaultTotalQty]);

  // 主面料到货量：仅在首次预填
  useEffect(() => {
    if (arrivedFabricM != null && arrivedFabricM > 0) {
      setArrivedInput((prev) => prev ?? arrivedFabricM);
    }
  }, [arrivedFabricM]);

  // ── 计算（单一路径，无模式切换） ─────────────────────────────────────────
  const { totalRatio, bundles, actualTotal, sizeQtyMap, consumedFabric } = useMemo(() => {
    const totalRatio = ratioRows.reduce((s, r) => s + (Number(r.ratio) || 0), 0);

    // 配比轮次 = ceil(订单件数 / 总配比)
    const baseCount = totalRatio > 0 && totalQty > 0 ? Math.ceil(totalQty / totalRatio) : 0;

    const sizeQtyMap: Record<string, number> = {};
    for (const r of ratioRows) {
      sizeQtyMap[r.key] = (Number(r.ratio) || 0) * baseCount;
    }

    // 扎数：有每扎件数限制时各码独立拆扎求和，否则等于配比轮次
    const bundles = (piecesPerBundle && piecesPerBundle > 0)
      ? ratioRows.reduce((sum, r) => {
          const qty = sizeQtyMap[r.key] || 0;
          return sum + (qty > 0 ? Math.ceil(qty / piecesPerBundle) : 0);
        }, 0)
      : baseCount;

    const actualTotal = Object.values(sizeQtyMap).reduce((s, v) => s + v, 0);

    // 预计消耗面料 = 各码件数 × 纸样用量
    const consumedFabric = (hasUsageMap && sizeUsageMap)
      ? ratioRows.reduce((sum, r) => sum + (sizeQtyMap[r.key] || 0) * (sizeUsageMap[r.size] || 0), 0)
      : 0;

    return { totalRatio, bundles, actualTotal, sizeQtyMap, consumedFabric };
  }, [ratioRows, totalQty, piecesPerBundle, sizeUsageMap, hasUsageMap]);

  // ── 行操作 ────────────────────────────────────────────────────────────────
  const handleAddRow = () => {
    setRatioRows((prev) => [...prev, { key: nextKey(), size: '', ratio: 1 }]);
  };

  const handleRemoveRow = (key: string) => {
    setRatioRows((prev) => prev.filter((r) => r.key !== key));
  };

  const handleChangeSize = (key: string, val: string) => {
    setRatioRows((prev) => prev.map((r) => (r.key === key ? { ...r, size: val } : r)));
  };

  const handleChangeRatio = (key: string, val: number | null) => {
    setRatioRows((prev) => prev.map((r) => (r.key === key ? { ...r, ratio: val ?? 0 } : r)));
  };

  // ── 确认生成 ─────────────────────────────────────────────────────────────
  const handleConfirm = () => {
    const color = String(entryColorText || '').trim();
    const rows: BundleInputRow[] = [];
    for (const r of ratioRows) {
      const size = r.size.trim();
      const qty = sizeQtyMap[r.key] || 0;
      if (!size || !(Number(r.ratio) || 0) || qty <= 0) continue;
      if (piecesPerBundle && piecesPerBundle > 0) {
        // 单码独立拆扎：每个菲号只有同一个码，上限 piecesPerBundle 件
        let remaining = qty;
        while (remaining > 0) {
          const bundleQty = Math.min(remaining, piecesPerBundle);
          rows.push({ skuNo: '', color, size, quantity: bundleQty });
          remaining -= bundleQty;
        }
      } else {
        // 无件数限制：每码一个菲号，单码
        rows.push({ skuNo: '', color, size, quantity: qty });
      }
    }
    onConfirm(rows);
  };

  // ── 表格列 ────────────────────────────────────────────────────────────────
  const columns: ColumnsType<SizeRatioRow> = [
    {
      title: '尺码',
      dataIndex: 'size',
      width: 100,
      render: (_, record) => (
        <input
          style={{
            border: '1px solid #d9d9d9',
            borderRadius: 6,
            padding: '4px 8px',
            width: '100%',
            fontSize: 13,
            outline: 'none',
            background: disabled ? '#f5f5f5' : '#fff',
          }}
          value={record.size}
          placeholder="如 S / M / L"
          disabled={disabled}
          onChange={(e) => handleChangeSize(record.key, e.target.value)}
        />
      ),
    },
    ...(hasUsageMap ? [{
      title: '纸样用量(m/件)',
      key: 'patternUsage',
      width: 120,
      render: (_: unknown, record: SizeRatioRow) => {
        const usage = sizeUsageMap?.[record.size];
        return usage != null
          ? <Text type="secondary">{Number(usage).toFixed(2)}</Text>
          : <Text style={{ color: '#ccc' }}>-</Text>;
      },
    } as ColumnsType<SizeRatioRow>[number]] : []),
    {
      title: '配比',
      dataIndex: 'ratio',
      width: 100,
      render: (_, record) => (
        <InputNumber
          min={0}
          max={999}
          style={{ width: '100%' }}
          value={record.ratio}
          disabled={disabled}
          onChange={(val) => handleChangeRatio(record.key, val)}
        />
      ),
    },
    {
      title: '裁剪件数',
      key: 'qty',
      width: 120,
      render: (_, record) => {
        const qty = sizeQtyMap[record.key] || 0;
        if (piecesPerBundle && piecesPerBundle > 0 && qty > 0) {
          const sizeBundles = Math.ceil(qty / piecesPerBundle);
          return (
            <Text strong style={{ color: '#1677ff' }}>
              {qty} 件
              <Text type="secondary" style={{ fontSize: 'var(--font-size-sm)', marginLeft: 4 }}>
                · {sizeBundles} 扎
              </Text>
            </Text>
          );
        }
        return (
          <Text strong style={{ color: qty > 0 ? '#1677ff' : '#999' }}>
            {qty} 件
          </Text>
        );
      },
    },
    {
      title: '',
      key: 'del',
      width: 44,
      render: (_, record) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={disabled || ratioRows.length <= 1}
          onClick={() => handleRemoveRow(record.key)}
        />
      ),
    },
  ];

  const valid = ratioRows.some((r) => r.size.trim() && (Number(r.ratio) || 0) > 0) && bundles > 0;

  return (
    <div style={{ marginBottom: 16 }}>
      {/* 输入区：颜色 + 三个固定输入框横排 */}
      <Space style={{ marginBottom: 10 }} wrap align="center">
        <span>
          <Text type="secondary" style={inlineLabelTextStyle}>颜色：</Text>
          <Text style={inlineValueTextStyle}>{entryColorText || '-'}</Text>
        </span>
        <span style={{ marginLeft: 8 }}>
          <Text type="secondary" style={inlineLabelTextStyle}>已确认可裁面料：</Text>
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
          <Text type="secondary" style={inlineLabelTextStyle}>m</Text>
        </span>
        <span style={{ marginLeft: 8 }}>
          <Text type="secondary" style={inlineLabelTextStyle}>下单数量：</Text>
          <InputNumber
            min={1}
            max={999999}
            value={totalQty}
            disabled={disabled}
            onChange={(val) => setTotalQty(val ?? 0)}
            style={{ width: 110, marginLeft: 4, marginRight: 4 }}
          />
          <Text type="secondary" style={inlineLabelTextStyle}>件</Text>
        </span>
        <span style={{ marginLeft: 8 }}>
          <Text type="secondary" style={inlineLabelTextStyle}>每扎件数：</Text>
          <InputNumber
            min={1}
            max={9999}
            value={piecesPerBundle}
            disabled={disabled}
            onChange={(val) => setPiecesPerBundle(val)}
            style={{ width: 90, marginLeft: 4, marginRight: 4 }}
            placeholder="如 25/30"
          />
          <Text type="secondary" style={inlineLabelTextStyle}>件/扎</Text>
        </span>
        {/* 面料消耗参考（有到货量时才显示） */}
        {consumedFabric > 0 && arrivedInput && arrivedInput > 0 && (
          <Text style={{ fontSize: 'var(--font-size-sm)', color: consumedFabric > arrivedInput ? '#ff4d4f' : '#52c41a' }}>
            预计消耗 {consumedFabric.toFixed(2)} m / 已确认 {arrivedInput} m
            {consumedFabric > arrivedInput && '（仅作提示，支持分批裁剪）'}
          </Text>
        )}
      </Space>

      {/* 配比表格 */}
      <Table<SizeRatioRow>
        size="small"
        pagination={false}
        dataSource={ratioRows}
        columns={columns}
        rowKey="key"
        style={{ marginBottom: 8 }}
      />

      {/* 添加尺码 */}
      {!disabled && (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={handleAddRow}
          style={{ marginBottom: 12, width: '100%' }}
        >
          添加尺码
        </Button>
      )}

      {/* 汇总栏 */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag>总配比：{totalRatio}</Tag>
        <Tag color="blue">
          扎数：{bundles} 扎
          {piecesPerBundle && piecesPerBundle > 0 && (
            <span style={{ marginLeft: 4, fontSize: 'var(--font-size-sm)' }}>（每扎≤{piecesPerBundle} 件）</span>
          )}
        </Tag>
        <Tag color={actualTotal > 0 ? 'green' : 'default'}>
          实际总裁剪：{actualTotal} 件
          {actualTotal > 0 && actualTotal !== totalQty && (
            <span style={{ marginLeft: 4, fontSize: 'var(--font-size-sm)' }}>
              （订单 {totalQty} 件 → 进位后 {actualTotal} 件）
            </span>
          )}
        </Tag>
        {consumedFabric > 0 && (!arrivedInput || arrivedInput <= 0) && (
          <Tag color="purple">
            预计消耗面料：{consumedFabric.toFixed(2)} m
          </Tag>
        )}
      </Space>

      {/* 操作按钮 */}
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
