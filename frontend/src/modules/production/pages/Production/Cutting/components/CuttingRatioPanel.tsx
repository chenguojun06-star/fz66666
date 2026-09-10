import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, InputNumber, Space, Tag, Tooltip, Typography } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
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
  /** D-335 加床次增量模式：只生成用户填写的"本次新增"数量，不自动带出整单 */
  incrementMode?: boolean;
  /** D-335 已生成菲号的每码合计（color-size → 件数），增量模式下展示参考 */
  existingBundleQtyBySize?: Record<string, number>;
}

interface BundleRow {
  key: string;
  color: string;
  size: string;
  quantity: number;    // 订单数量
  incrementInput: number; // D-335 增量模式下用户填的"本次新增"件数
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
  incrementMode = false,
  existingBundleQtyBySize,
}) => {
  const [bundleSize, setBundleSize] = useState<number | null>(null);
  const [excessRate, setExcessRate] = useState<number>(0);
  const [lastBundleOverrides, setLastBundleOverrides] = useState<Record<string, number>>({});
  // D-335 增量模式：每行"本次新增"件数（默认 0，只生成填了的行）
  const [incrementQty, setIncrementQty] = useState<Record<string, number>>({});

  useEffect(() => { setLastBundleOverrides({}); }, [bundleSize, excessRate]);

  const handleLastBundleChange = (key: string, val: number | null) => {
    setLastBundleOverrides(prev => ({ ...prev, [key]: val ?? 1 }));
  };

  const handleIncrementChange = (key: string, val: number | null) => {
    setIncrementQty(prev => ({ ...prev, [key]: Math.max(0, val ?? 0) }));
  };

  const tableRows = useMemo<BundleRow[]>(() => {
    if (!entryOrderLines?.length) return [];
    return entryOrderLines.map((line, idx) => {
      const orderQty = Number(line.quantity) || 0;
      const key = `${line.color}-${line.size}-${idx}`;
      // D-335 增量模式：分扎按"本次新增"计算（默认 0），损耗加放不适用
      const incrementInput = incrementMode ? Math.max(0, Number(incrementQty[key] ?? 0)) : 0;
      const baseQty = incrementMode ? incrementInput : orderQty;
      const rate = incrementMode ? 0 : (excessRate > 0 ? excessRate : 0);
      // 基础裁剪数 = 基数 × (1 + 损耗率)，向上取整
      const baseCuttingQty = rate > 0 ? Math.ceil(baseQty * (1 + rate / 100)) : baseQty;
      const bs = bundleSize && bundleSize > 0 ? bundleSize : 0;
      const bundles = baseCuttingQty > 0 && bs > 0 ? Math.ceil(baseCuttingQty / bs) : 0;
      const remainder = baseCuttingQty % bs;

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
        incrementInput,
        cuttingQty,
        bundles,
        remainder,
        bundleDisplay,
        skuNo: line.skuNo || '',
      };
    });
  }, [entryOrderLines, bundleSize, excessRate, lastBundleOverrides, incrementMode, incrementQty]);

  const { totalQty, totalAlreadyCut, totalCuttingQty, totalBundles } = useMemo(
    () =>
      tableRows.reduce(
        (acc, row) => {
          const alreadyCut = (existingCutQtyByKey ?? {})[`${row.color}-${row.size}`] ?? 0;
          return {
            totalQty: acc.totalQty + row.quantity,
            totalAlreadyCut: acc.totalAlreadyCut + alreadyCut,
            totalCuttingQty: acc.totalCuttingQty + row.cuttingQty,
            totalBundles: acc.totalBundles + row.bundles,
          };
        },
        { totalQty: 0, totalAlreadyCut: 0, totalCuttingQty: 0, totalBundles: 0 },
      ),
    [tableRows, existingCutQtyByKey],
  );

  // D-335 增量模式：只看"本次新增"是否有值；正常模式：看订单数量
  const valid = incrementMode
    ? tableRows.some((r) => r.incrementInput > 0 && r.bundles > 0)
    : tableRows.some((r) => r.quantity > 0 && r.bundles > 0);

  const handleConfirm = () => {
    const bs = bundleSize && bundleSize > 0 ? bundleSize : 0;
    const rows: BundleInputRow[] = [];
    for (const row of tableRows) {
      // 增量模式只提交用户填写的"本次新增"，其余码数不下发
      const effectiveQty = incrementMode ? row.incrementInput : row.quantity;
      if (effectiveQty <= 0 || row.bundles <= 0) continue;
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
    // D-335 增量模式专属：本次新增 + 已生成参考
    ...(incrementMode ? [
      {
        title: '已生成菲号',
        key: 'generatedQty',
        width: 110,
        align: 'right' as const,
        render: (_: unknown, row: BundleRow) => {
          const val = (existingBundleQtyBySize ?? {})[`${row.color}-${row.size}`] ?? 0;
          return <Text type="secondary">{val} 件</Text>;
        },
      },
      {
        title: '本次新增(件)',
        key: 'incrementInput',
        width: 130,
        render: (_: unknown, row: BundleRow) => (
          <InputNumber
            min={0}
            max={9999}
            precision={0}
            value={row.incrementInput}
            controls={false}
            disabled={disabled}
            onChange={(v) => handleIncrementChange(row.key, v)}
            style={{ width: 90 }}
          />
        ),
      },
    ] : []),
    {
      title: '已裁剪',
      key: 'alreadyCutQty',
      width: 100,
      align: 'right' as const,
      render: (_: unknown, row: BundleRow) => {
        const alreadyCut = (existingCutQtyByKey ?? {})[`${row.color}-${row.size}`] ?? 0;
        return (
          <Text style={{ color: alreadyCut > 0 ? 'var(--color-primary)' : 'var(--color-text-tertiary)', fontWeight: alreadyCut > 0 ? 500 : 400 }}>
            {alreadyCut} 件
          </Text>
        );
      },
    },
    {
      title: '剩余裁剪数量',
      key: 'remainingCutQty',
      width: 130,
      align: 'right' as const,
      render: (_: unknown, row: BundleRow) => {
        const alreadyCut = (existingCutQtyByKey ?? {})[`${row.color}-${row.size}`] ?? 0;
        const remaining = row.quantity - alreadyCut;
        return (
          <Text style={{ color: remaining < 0 ? 'var(--color-error)' : remaining === 0 ? 'var(--color-text-tertiary)' : 'var(--color-success)' }}>
            {remaining} 件
          </Text>
        );
      },
    },
    {
      title: '本次裁剪',
      dataIndex: 'cuttingQty',
      key: 'cuttingQty',
      width: 110,
      render: (val: number, row: BundleRow) =>
        val !== row.quantity ? (
          <Text style={{ color: 'var(--color-warning-deep)', fontWeight: 500 }}>{val} 件</Text>
        ) : (
          <Text>{val} 件</Text>
        ),
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
            <Text style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{prefix}1×</Text>
            <InputNumber
              min={1}
              max={9999}
              precision={0}
              value={lastQty}
              controls={false}
              disabled={disabled}
              onChange={(v) => handleLastBundleChange(record.key, v)}
              style={{ width: 64 }}
            />
            <Text style={{ color: 'var(--color-primary)', fontWeight: 500 }}>件（{record.bundles} 扎）</Text>
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
          color: 'var(--neutral-text-light, var(--color-text-muted))',
          fontSize: 14,
        }}>
          订单明细中无颜色/尺码数据，请先在订单中维护颜色尺码信息，或手动录入后生成菲号
        </div>
      )}
      {entryOrderLines?.length > 0 && (
      <>
      <Space align="center" wrap style={{ marginBottom: 16 }}>
        <Text strong style={{ fontSize: 15 }}>一键生成</Text>
        <Tooltip title="按订单颜色/尺码自动分扎：每扎件数决定扎数，损耗加放按百分比增加裁剪数量">
          <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary)', cursor: 'help' }} />
        </Tooltip>
        <Text strong style={{ fontSize: 15, marginLeft: 8 }}>每扎件数：</Text>
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
        <Text strong style={{ fontSize: 15, marginLeft: 12 }}>损耗加放：</Text>
        <InputNumber
          min={0}
          max={30}
          precision={1}
          value={excessRate}
          disabled={disabled || incrementMode}
          onChange={(val) => setExcessRate(val ?? 0)}
          style={{ width: 80 }}
          suffix="%"
        />
      </Space>

      <ResizableTable<BundleRow>
        dataSource={tableRows}
        columns={columns}
        pagination={false}
        bordered
        // 与菲号明细表一致：禁用限高填充，表格按内容自然撑开平铺，不内部滚动
        disableFillScrollY
        size="middle"
        scroll={{ x: 'max-content' }}
        style={{ marginBottom: 12, fontSize: 15 }}
        locale={{ emptyText: '暂无尺码数据，请先选择裁剪任务' }}
      />

      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">总下单：{totalQty} 件</Tag>
        {totalAlreadyCut > 0 && <Tag color="blue">已裁剪：{totalAlreadyCut} 件</Tag>}
        <Tag color={totalQty - totalAlreadyCut > 0 ? 'cyan' : 'default'}>剩余：{totalQty - totalAlreadyCut} 件</Tag>
        {excessRate > 0 && <Tag color="orange">本次裁剪：{totalCuttingQty} 件</Tag>}
        <Tag color="purple">总扎数：{totalBundles} 扎</Tag>
      </Space>

      {fabricUsageRows && fabricUsageRows.length > 1 && (
        <div style={{ marginBottom: 12, padding: '6px 10px', background: 'var(--color-bg-container)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 14 }}>
          <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--color-text-primary)' }}>面料用量参考</div>
          {fabricUsageRows.map((row, idx) => {
            const sizes = Object.entries(row.sizeUsageMap);
            if (sizes.length === 0) return null;
            const totalM = tableRows.reduce((sum, r) => {
              const usage = row.sizeUsageMap[r.size] || 0;
              return sum + usage * r.cuttingQty;
            }, 0);
            return (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2, color: 'var(--color-text-secondary)' }}>
                <span style={{ minWidth: 80, fontWeight: 500, color: 'var(--color-text-primary)' }}>{row.materialName}</span>
                <span>约 {totalM > 0 ? totalM.toFixed(1) : '-'} m</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>（{sizes.map(([s, v]) => `${s}:${v}m`).join(' ')}）</span>
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
