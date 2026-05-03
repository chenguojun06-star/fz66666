import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, InputNumber, Space, Tag, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;

export interface BundleInputRow {
  skuNo: string;
  color: string;
  size: string;
  quantity: number;
}

interface CuttingRatioPanelProps {
  entryColorText: string;
  entrySizeItems: Array<{ size: string; quantity: number }>;
  entryOrderLines: Array<{ color: string; size: string; quantity: number; skuNo?: string }>;
  defaultTotalQty: number;
  sizeUsageMap?: Record<string, number>;
  fabricUsageRows?: Array<{ materialName: string; materialType: string; sizeUsageMap: Record<string, number> }>;
  arrivedFabricM?: number;
  generating: boolean;
  disabled: boolean;
  onConfirm: (rows: BundleInputRow[]) => void;
  onClear: () => void;
  existingCutQtyByKey?: Record<string, number>;
}

interface BundleRow {
  key: string;
  color: string;
  size: string;
  quantity: number;    // 订单数量
  cuttingQty: number;  // 实际裁剪数量（含损耗加放）
  bundles: number;
  remainder: number;
  bundleDisplay: string;
  skuNo: string;
}

const CuttingRatioPanel: React.FC<CuttingRatioPanelProps> = ({
  entryOrderLines,
  sizeUsageMap,
  fabricUsageRows,
  generating,
  disabled,
  onConfirm,
  onClear,
  existingCutQtyByKey,
}) => {
  const [bundleSize, setBundleSize] = useState<number | null>(null);
  const [excessRate, setExcessRate] = useState<number>(0);
  const [lastBundleOverrides, setLastBundleOverrides] = useState<Record<string, number>>({});

  useEffect(() => { setLastBundleOverrides({}); }, [bundleSize, excessRate]);

  const handleLastBundleChange = (key: string, val: number | null) => {
    setLastBundleOverrides(prev => ({ ...prev, [key]: val ?? 1 }));
  };

  const tableRows = useMemo<BundleRow[]>(() => {
    if (!entryOrderLines?.length) return [];
    return entryOrderLines.map((line, idx) => {
      const orderQty = Number(line.quantity) || 0;
      const rate = excessRate > 0 ? excessRate : 0;
      // 基础裁剪数 = 订单数 × (1 + 损耗率)，向上取整
      const baseCuttingQty = rate > 0 ? Math.ceil(orderQty * (1 + rate / 100)) : orderQty;
      const bs = bundleSize && bundleSize > 0 ? bundleSize : 0;
      const bundles = baseCuttingQty > 0 && bs > 0 ? Math.ceil(baseCuttingQty / bs) : 0;
      const remainder = baseCuttingQty % bs;
      const key = `${line.color}-${line.size}-${idx}`;

      // 用户修改末扎数量后，裁剪总数联动更新
      const defaultLastQty = remainder > 0 ? remainder : bs;
      const lastQty = lastBundleOverrides[key] ?? defaultLastQty;
      const cuttingQty = bundles > 1
        ? (bundles - 1) * bs + lastQty
        : bundles === 1 ? lastQty : 0;

      let bundleDisplay: string;
      if (bundles === 0) {
        bundleDisplay = '-';
      } else if (bundles === 1) {
        bundleDisplay = `1×${lastQty}件（1 扎）`;
      } else {
        bundleDisplay = `${bundles - 1}×${bs} + 1×${lastQty}件（${bundles} 扎）`;
      }

      return {
        key,
        color: line.color,
        size: line.size,
        quantity: orderQty,
        cuttingQty,
        bundles,
        remainder,
        bundleDisplay,
        skuNo: line.skuNo || '',
      };
    });
  }, [entryOrderLines, bundleSize, excessRate, lastBundleOverrides]);

  const { totalQty, totalCuttingQty, totalBundles } = useMemo(
    () =>
      tableRows.reduce(
        (acc, row) => ({
          totalQty: acc.totalQty + row.quantity,
          totalCuttingQty: acc.totalCuttingQty + row.cuttingQty,
          totalBundles: acc.totalBundles + row.bundles,
        }),
        { totalQty: 0, totalCuttingQty: 0, totalBundles: 0 },
      ),
    [tableRows],
  );

  const valid = tableRows.some((r) => r.quantity > 0 && r.bundles > 0);

  const handleConfirm = () => {
    const bs = bundleSize && bundleSize > 0 ? bundleSize : 0;
    const rows: BundleInputRow[] = [];
    for (const row of tableRows) {
      if (row.quantity <= 0 || row.bundles <= 0) continue;
      const defaultLastQty = row.remainder > 0 ? row.remainder : bs;
      const lastQty = lastBundleOverrides[row.key] ?? defaultLastQty;
      for (let i = 0; i < row.bundles; i++) {
        const isLast = i === row.bundles - 1;
        const qty = isLast ? lastQty : bs;
        rows.push({ skuNo: row.skuNo, color: row.color, size: row.size, quantity: qty });
      }
    }
    onConfirm(rows);
  };

  const columns: ColumnsType<BundleRow> = [
    { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
    {
      title: '单件码数用量',
      key: 'sizeUsage',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, row: BundleRow) => {
        const val = sizeUsageMap?.[row.size];
        return val != null ? <Text>{val} m</Text> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: '下单数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      render: (val: number) => <Text>{val} 件</Text>,
    },
    {
      title: '裁剪数量',
      dataIndex: 'cuttingQty',
      key: 'cuttingQty',
      width: 120,
      render: (val: number, row: BundleRow) =>
        val !== row.quantity ? (
          <Text style={{ color: '#d46b08', fontWeight: 500 }}>{val} 件</Text>
        ) : (
          <Text>{val} 件</Text>
        ),
    },
    {
      title: '剩余裁剪数量',
      key: 'remainingCutQty',
      width: 130,
      render: (_: unknown, row: BundleRow) => {
        const alreadyCut = (existingCutQtyByKey ?? {})[`${row.color}-${row.size}`] ?? 0;
        const remaining = row.quantity - alreadyCut;
        return (
          <Text style={{ color: remaining < 0 ? '#cf1322' : remaining === 0 ? '#999' : '#389e0d' }}>
            {remaining} 件
          </Text>
        );
      },
    },
    {
      title: '分扎数',
      dataIndex: 'bundleDisplay',
      key: 'bundleDisplay',
      width: 320,
      render: (_val: string, record: BundleRow) => {
        if (record.bundles === 0) return <Text>-</Text>;
        const bs = bundleSize && bundleSize > 0 ? bundleSize : 0;
        const defaultLastQty = record.remainder > 0 ? record.remainder : bs;
        const lastQty = lastBundleOverrides[record.key] ?? defaultLastQty;
        const prefix = record.bundles > 1 ? `${record.bundles - 1}×${bs} + ` : '';
        return (
          <Space size={2} align="center">
            <Text style={{ color: '#1677ff', fontWeight: 500 }}>{prefix}1×</Text>
            <InputNumber
              min={1}
              max={9999}
              precision={0}
              size="small"
              value={lastQty}
              disabled={disabled}
              onChange={(v) => handleLastBundleChange(record.key, v)}
              style={{ width: 64 }}
            />
            <Text style={{ color: '#1677ff', fontWeight: 500 }}>件（{record.bundles} 扎）</Text>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '0 0 8px' }}>
      {!entryOrderLines?.length && (
        <div style={{
          padding: '24px 0',
          textAlign: 'center',
          color: 'var(--neutral-text-light, #8c8c8c)',
          fontSize: 13,
        }}>
          订单明细中无颜色/尺码数据，请先在订单中维护颜色尺码信息，或手动录入后生成菲号
        </div>
      )}
      {entryOrderLines?.length > 0 && (
      <>
      <Space align="center" wrap style={{ marginBottom: 16 }}>
        <Text strong>每扎件数：</Text>
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={bundleSize}
          disabled={disabled}
          placeholder="输入每扎件数"
          onChange={(val) => setBundleSize(val ?? null)}
          style={{ width: 90 }}
        />
        <Text type="secondary">件/扎</Text>
        <Text strong style={{ marginLeft: 12 }}>损耗加放：</Text>
        <InputNumber
          min={0}
          max={30}
          precision={1}
          value={excessRate}
          disabled={disabled}
          onChange={(val) => setExcessRate(val ?? 0)}
          style={{ width: 80 }}
          suffix="%"
        />
      </Space>

      <ResizableTable<BundleRow>
        dataSource={tableRows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        scroll={{ x: 'max-content' }}
        style={{ marginBottom: 12 }}
        locale={{ emptyText: '暂无尺码数据，请先选择裁剪任务' }}
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">总下单：{totalQty} 件</Tag>
        {excessRate > 0 && <Tag color="orange">总裁剪：{totalCuttingQty} 件</Tag>}
        <Tag color="purple">总扎数：{totalBundles} 扎</Tag>
      </Space>

      {fabricUsageRows && fabricUsageRows.length > 1 && (
        <div style={{ marginBottom: 12, padding: '6px 10px', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 6, fontSize: 12 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, color: '#333' }}>面料用量参考</div>
          {fabricUsageRows.map((row, idx) => {
            const sizes = Object.entries(row.sizeUsageMap);
            if (sizes.length === 0) return null;
            const totalM = tableRows.reduce((sum, r) => {
              const usage = row.sizeUsageMap[r.size] || 0;
              return sum + usage * r.cuttingQty;
            }, 0);
            return (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, color: '#666' }}>
                <span style={{ minWidth: 80, fontWeight: 500, color: '#333' }}>{row.materialName}</span>
                <span>约 {totalM > 0 ? totalM.toFixed(1) : '-'} m</span>
                <span style={{ color: '#999' }}>（{sizes.map(([s, v]) => `${s}:${v}m`).join(' ')}）</span>
              </div>
            );
          })}
        </div>
      )}

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
      </>
      )}
    </div>
  );
};

export default CuttingRatioPanel;
