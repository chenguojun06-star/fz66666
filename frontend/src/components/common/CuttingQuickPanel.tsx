import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, InputNumber, Space, Table, Tag, Typography } from 'antd';
import { ScissorOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { productionCuttingApi, materialPurchaseApi } from '@/services/production/productionApi';
import { parseProductionOrderLines } from '@/utils/api';

const { Text } = Typography;

interface BundleRecord {
  id: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  status?: string;
}

interface CuttingQuickPanelProps {
  orderId: string;
  orderNo: string;
  visible: boolean;
  bundles: BundleRecord[];
  orderDetail?: Record<string, unknown> | null;
  onDataChanged?: () => void;
}

interface BundleRow {
  key: string;
  color: string;
  size: string;
  quantity: number;
  cuttingQty: number;
  bundles: number;
  remainder: number;
  bundleDisplay: string;
  skuNo: string;
}

interface FabricInfo { materialName: string; arrivedQuantity: number }

const CuttingQuickPanel: React.FC<CuttingQuickPanelProps> = ({
  orderId, orderNo, visible, bundles, orderDetail, onDataChanged,
}) => {
  const { message } = App.useApp();
  const [generating, setGenerating] = useState(false);
  const [bundleSize, setBundleSize] = useState<number>(20);
  const [excessRate, setExcessRate] = useState<number>(0);
  const [lastBundleOverrides, setLastBundleOverrides] = useState<Record<string, number>>({});
  const [fabrics, setFabrics] = useState<FabricInfo[]>([]);

  useEffect(() => { setLastBundleOverrides({}); }, [bundleSize, excessRate]);

  // 加载面辅料到货信息
  useEffect(() => {
    if (!visible || !orderNo) return;
    materialPurchaseApi.listByOrderNo(orderNo).then(res => {
      const raw = res?.data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.records ?? []);
      const arr: FabricInfo[] = list.map((r: any) => ({
        materialName: r.materialName || r.material_name || '-',
        arrivedQuantity: Number(r.arrivedQuantity ?? r.arrived_quantity ?? 0),
      }));
      setFabrics(arr.filter(f => f.arrivedQuantity > 0));
    }).catch(() => { /* 非关键 */ });
  }, [visible, orderNo]);

  // 从订单详情解析颜色/尺码/数量
  const entryOrderLines = useMemo(
    () => parseProductionOrderLines(orderDetail),
    [orderDetail],
  );

  // 已有菲号按 颜色-尺码 汇总已裁数量
  const existingCutQtyByKey = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of bundles) {
      const k = `${b.color || ''}-${b.size || ''}`;
      map[k] = (map[k] || 0) + (b.quantity || 0);
    }
    return map;
  }, [bundles]);

  const handleLastBundleChange = (key: string, val: number | null) => {
    setLastBundleOverrides(prev => ({ ...prev, [key]: val ?? 1 }));
  };

  // 核心：裁剪比例计算（移植自 CuttingRatioPanel）
  const tableRows = useMemo<BundleRow[]>(() => {
    if (!entryOrderLines?.length) return [];
    return entryOrderLines.map((line, idx) => {
      const orderQty = Number(line.quantity) || 0;
      const rate = excessRate > 0 ? excessRate : 0;
      const baseCuttingQty = rate > 0 ? Math.ceil(orderQty * (1 + rate / 100)) : orderQty;
      const bs = bundleSize > 0 ? bundleSize : 20;
      const bCount = baseCuttingQty > 0 ? Math.ceil(baseCuttingQty / bs) : 0;
      const remainder = baseCuttingQty % bs;
      const key = `${line.color}-${line.size}-${idx}`;

      const defaultLastQty = remainder > 0 ? remainder : bs;
      const lastQty = lastBundleOverrides[key] ?? defaultLastQty;
      const cuttingQty = bCount > 1
        ? (bCount - 1) * bs + lastQty
        : bCount === 1 ? lastQty : 0;

      let bundleDisplay: string;
      if (bCount === 0) {
        bundleDisplay = '-';
      } else if (bCount === 1) {
        bundleDisplay = `1×${lastQty}件（1 扎）`;
      } else {
        bundleDisplay = `${bCount - 1}×${bs} + 1×${lastQty}件（${bCount} 扎）`;
      }

      return { key, color: line.color, size: line.size, quantity: orderQty, cuttingQty, bundles: bCount, remainder, bundleDisplay, skuNo: line.skuNo || '' };
    });
  }, [entryOrderLines, bundleSize, excessRate, lastBundleOverrides]);

  const { totalQty, totalCuttingQty, totalBundles } = useMemo(
    () => tableRows.reduce(
      (acc, row) => ({ totalQty: acc.totalQty + row.quantity, totalCuttingQty: acc.totalCuttingQty + row.cuttingQty, totalBundles: acc.totalBundles + row.bundles }),
      { totalQty: 0, totalCuttingQty: 0, totalBundles: 0 },
    ),
    [tableRows],
  );

  const valid = tableRows.some(r => r.quantity > 0 && r.bundles > 0);

  const handleGenerate = useCallback(async () => {
    const bs = bundleSize > 0 ? bundleSize : 20;
    const rows: { skuNo: string; color: string; size: string; quantity: number }[] = [];
    for (const row of tableRows) {
      if (row.quantity <= 0 || row.bundles <= 0) continue;
      const defaultLastQty = row.remainder > 0 ? row.remainder : bs;
      const lastQty = lastBundleOverrides[row.key] ?? defaultLastQty;
      for (let i = 0; i < row.bundles; i++) {
        const isLast = i === row.bundles - 1;
        rows.push({ skuNo: row.skuNo, color: row.color, size: row.size, quantity: isLast ? lastQty : bs });
      }
    }
    if (rows.length === 0) { message.warning('无有效裁剪数据'); return; }
    setGenerating(true);
    try {
      await productionCuttingApi.generateBundles({ orderId, bundles: rows });
      message.success(`已生成 ${rows.length} 个菲号`);
      onDataChanged?.();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '生成菲号失败');
    } finally {
      setGenerating(false);
    }
  }, [orderId, tableRows, bundleSize, lastBundleOverrides, message, onDataChanged]);

  // 已有菲号按 颜色+尺码 分组
  const grouped = bundles.reduce<Record<string, { count: number; totalQty: number }>>((acc, b) => {
    const k = `${b.color || '-'}/${b.size || '-'}`;
    if (!acc[k]) acc[k] = { count: 0, totalQty: 0 };
    acc[k].count += 1;
    acc[k].totalQty += (b.quantity || 0);
    return acc;
  }, {});

  const columns: ColumnsType<BundleRow> = [
    { title: '颜色', dataIndex: 'color', key: 'color', width: 90 },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
    { title: '下单数量', dataIndex: 'quantity', key: 'quantity', width: 90, render: (v: number) => <Text>{v} 件</Text> },
    {
      title: '裁剪数量', dataIndex: 'cuttingQty', key: 'cuttingQty', width: 90,
      render: (v: number, row: BundleRow) => v !== row.quantity
        ? <Text style={{ color: '#d46b08', fontWeight: 500 }}>{v} 件</Text>
        : <Text>{v} 件</Text>,
    },
    {
      title: '剩余裁剪', key: 'remainingCutQty', width: 90,
      render: (_: unknown, row: BundleRow) => {
        const alreadyCut = existingCutQtyByKey[`${row.color}-${row.size}`] ?? 0;
        const remaining = row.quantity - alreadyCut;
        return <Text style={{ color: remaining < 0 ? '#cf1322' : remaining === 0 ? '#999' : '#389e0d' }}>{remaining} 件</Text>;
      },
    },
    {
      title: '分扎数', key: 'bundleDisplay', width: 260,
      render: (_: unknown, record: BundleRow) => {
        if (record.bundles === 0) return <Text>-</Text>;
        const bs = bundleSize > 0 ? bundleSize : 20;
        const defaultLastQty = record.remainder > 0 ? record.remainder : bs;
        const lastQty = lastBundleOverrides[record.key] ?? defaultLastQty;
        const prefix = record.bundles > 1 ? `${record.bundles - 1}×${bs} + ` : '';
        return (
          <Space size={2} align="center">
            <Text style={{ color: '#1677ff', fontWeight: 500 }}>{prefix}1×</Text>
            <InputNumber min={1} max={9999} precision={0} size="small" value={lastQty}
              onChange={v => handleLastBundleChange(record.key, v)} style={{ width: 60 }} />
            <Text style={{ color: '#1677ff', fontWeight: 500 }}>件（{record.bundles} 扎）</Text>
          </Space>
        );
      },
    },
  ];

  return (
    <div>
      {/* 顶部：面辅料到货信息 */}
      {fabrics.length > 0 && (
        <Space wrap size={[8, 4]} style={{ marginBottom: 12 }}>
          {fabrics.map((f, i) => (
            <Tag key={i} color="blue">{f.materialName}：到货 {f.arrivedQuantity}</Tag>
          ))}
        </Space>
      )}

      {/* 已有菲号 */}
      {bundles.length > 0 && (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: '#f6ffed', borderRadius: 6 }}>
          <Text strong>已生成菲号 </Text><Tag color="green">{bundles.length} 扎</Tag>
          <div style={{ marginTop: 4 }}>
            <Space wrap size={[8, 4]}>
              {Object.entries(grouped).map(([k, v]) => (
                <Tag key={k}>{k}：{v.count}扎 / {v.totalQty}件</Tag>
              ))}
            </Space>
          </div>
        </div>
      )}

      {/* 裁剪比例参数 */}
      {entryOrderLines.length > 0 ? (
        <>
          <Space align="center" wrap style={{ marginBottom: 12 }}>
            <Text strong>每扎件数：</Text>
            <InputNumber min={1} max={9999} precision={0} value={bundleSize}
              onChange={v => setBundleSize(v || 20)} style={{ width: 80 }} />
            <Text type="secondary">件/扎</Text>
            <Text strong style={{ marginLeft: 8 }}>损耗加放：</Text>
            <InputNumber min={0} max={30} precision={1} value={excessRate}
              onChange={v => setExcessRate(v ?? 0)} style={{ width: 72 }} addonAfter="%" />
          </Space>

          <Table<BundleRow>
            dataSource={tableRows} columns={columns} rowKey="key"
            pagination={false} size="small" bordered
            style={{ marginBottom: 8 }}
            locale={{ emptyText: '暂无尺码数据' }}
          />

          <Space wrap style={{ marginBottom: 8 }}>
            <Tag color="green">总下单：{totalQty} 件</Tag>
            {excessRate > 0 && <Tag color="orange">总裁剪：{totalCuttingQty} 件</Tag>}
            <Tag color="purple">总扎数：{totalBundles} 扎</Tag>
          </Space>

          <div style={{ textAlign: 'right' }}>
            <Button type="primary" icon={<ScissorOutlined />} loading={generating}
              disabled={!valid} onClick={handleGenerate}>
              确认 → 生成菲号
            </Button>
          </div>
        </>
      ) : (
        <Alert type="info" showIcon message="暂无订单尺码数据，请先在订单中填写颜色/尺码/数量明细" />
      )}
    </div>
  );
};

export default CuttingQuickPanel;
