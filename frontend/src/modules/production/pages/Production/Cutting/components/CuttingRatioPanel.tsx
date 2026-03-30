import React, { useMemo, useState } from 'react';
import { Button, Form, InputNumber, Space, Table, Tag, Typography } from 'antd';
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
  arrivedFabricM?: number;
  generating: boolean;
  disabled: boolean;
  onConfirm: (rows: BundleInputRow[]) => void;
  onClear: () => void;
}

interface BundleRow {
  key: string;
  color: string;
  size: string;
  quantity: number;
  bundles: number;
  remainder: number;
  bundleDisplay: string;
  skuNo: string;
}

const CuttingRatioPanel: React.FC<CuttingRatioPanelProps> = ({
  entryOrderLines,
  generating,
  disabled,
  onConfirm,
  onClear,
}) => {
  const [bundleSize, setBundleSize] = useState<number>(20);

  const tableRows = useMemo<BundleRow[]>(() => {
    if (!entryOrderLines?.length) return [];
    return entryOrderLines.map((line, idx) => {
      const qty = Number(line.quantity) || 0;
      const bs = bundleSize > 0 ? bundleSize : 20;
      const bundles = qty > 0 ? Math.ceil(qty / bs) : 0;
      const remainder = qty % bs;

      let bundleDisplay: string;
      if (bundles === 0) {
        bundleDisplay = '-';
      } else if (remainder === 0) {
        bundleDisplay = `${bundles} 扎`;
      } else if (bundles === 1) {
        bundleDisplay = `1×${qty}件（1 扎）`;
      } else {
        bundleDisplay = `${bundles - 1}×${bs} + 1×${remainder}件（${bundles} 扎）`;
      }

      return {
        key: `${line.color}-${line.size}-${idx}`,
        color: line.color,
        size: line.size,
        quantity: qty,
        bundles,
        remainder,
        bundleDisplay,
        skuNo: line.skuNo || '',
      };
    });
  }, [entryOrderLines, bundleSize]);

  const { totalQty, totalBundles } = useMemo(
    () =>
      tableRows.reduce(
        (acc, row) => ({
          totalQty: acc.totalQty + row.quantity,
          totalBundles: acc.totalBundles + row.bundles,
        }),
        { totalQty: 0, totalBundles: 0 },
      ),
    [tableRows],
  );

  const valid = tableRows.some((r) => r.quantity > 0 && r.bundles > 0);

  const handleConfirm = () => {
    const bs = bundleSize > 0 ? bundleSize : 20;
    const rows: BundleInputRow[] = [];
    for (const row of tableRows) {
      if (row.quantity <= 0 || row.bundles <= 0) continue;
      for (let i = 0; i < row.bundles; i++) {
        const isLast = i === row.bundles - 1;
        const qty = isLast && row.remainder > 0 ? row.remainder : bs;
        rows.push({ skuNo: row.skuNo, color: row.color, size: row.size, quantity: qty });
      }
    }
    onConfirm(rows);
  };

  const columns: ColumnsType<BundleRow> = [
    { title: '颜色', dataIndex: 'color', key: 'color', width: 100 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80 },
    {
      title: '下单数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 110,
      render: (val: number) => <Text>{val} 件</Text>,
    },
    {
      title: '分扎数',
      dataIndex: 'bundleDisplay',
      key: 'bundleDisplay',
      render: (val: string) => (
        <Text style={{ color: '#1677ff', fontWeight: 500 }}>{val}</Text>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 0 8px' }}>
      <Space align="center" style={{ marginBottom: 16 }}>
        <Text strong>每扎件数：</Text>
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={bundleSize}
          disabled={disabled}
          onChange={(val) => setBundleSize(val || 20)}
          style={{ width: 90 }}
        />
        <Text type="secondary">件/扎（系统按此自动拆分菲号）</Text>
      </Space>

      <Table<BundleRow>
        dataSource={tableRows}
        columns={columns}
        pagination={false}
        size="small"
        bordered
        style={{ marginBottom: 12 }}
        locale={{ emptyText: '暂无尺码数据，请先选择裁剪任务' }}
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">总下单：{totalQty} 件</Tag>
        <Tag color="purple">总扎数：{totalBundles} 扎</Tag>
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
