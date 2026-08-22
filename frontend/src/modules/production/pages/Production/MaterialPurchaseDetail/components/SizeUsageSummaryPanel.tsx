import React, { useEffect, useMemo, useState } from 'react';
import { Card, Tag, Empty } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { getMaterialTypeLabel } from '@/utils/materialType';

interface SizeUsageItem {
  materialCode?: string;
  materialName?: string;
  materialType?: string;
  unit?: string;
  lossRate?: number;
  usageAmount?: number;
  sizeUsages?: Record<string, number>;
  requiredQty?: number;
  purchasedQty?: number;
  diffQty?: number;
}

interface SizeUsageDetailData {
  orderNo?: string;
  styleNo?: string;
  totalQuantity?: number;
  sizeQuantities?: Record<string, number>;
  colorQuantities?: Record<string, number>;
  items?: SizeUsageItem[];
}

interface Props {
  orderId?: string | number;
  /** 采购数据（引用变化时重新加载，编辑保存/收货后自动刷新联动） */
  purchaseList?: unknown[];
}

const fmtQty = (v: unknown): string => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  // 整数显示不带小数，小数保留最多2位
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
};

/**
 * 码数用量明细与汇总（联动采购数据）
 *
 * 展示：
 * 1. 顶部：订单码数×下单数量汇总
 * 2. 明细表：各物料的码数单件用量（动态列）、需求总量（含损耗）、已采购量、差额与吻合状态
 */
const SizeUsageSummaryPanel: React.FC<Props> = ({ orderId, purchaseList }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SizeUsageDetailData | null>(null);

  useEffect(() => {
    if (!orderId) {
      setData(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await api.get<{ code: number; data: SizeUsageDetailData }>(
          '/production/purchase/size-usage-detail',
          { params: { orderId } },
        );
        if (!cancelled && res?.code === 200) {
          setData(res.data || null);
        }
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [orderId, purchaseList]);

  /** 动态码数列：订单码数 ∪ BOM 各码用量键（保持订单码数顺序在前） */
  const sizeColumns = useMemo(() => {
    const orderSizes = Object.keys(data?.sizeQuantities || {});
    const usageSizes = new Set<string>();
    (data?.items || []).forEach((it) => {
      Object.keys(it.sizeUsages || {}).forEach((s) => usageSizes.add(s));
    });
    const extra = [...usageSizes].filter((s) => !orderSizes.includes(s));
    return [...orderSizes, ...extra];
  }, [data]);

  const columns = useMemo(() => {
    const base = [
      {
        title: '物料类型',
        dataIndex: 'materialType',
        width: 90,
        render: (v: string) => (v ? getMaterialTypeLabel(v) : '-'),
      },
      {
        title: '物料编码',
        dataIndex: 'materialCode',
        width: 130,
        render: (v: string) => v || '-',
      },
      {
        title: '物料名称',
        dataIndex: 'materialName',
        width: 180,
        ellipsis: true,
      },
      {
        title: '单位',
        dataIndex: 'unit',
        width: 60,
        render: (v: string) => v || '-',
      },
      {
        title: '单件用量',
        dataIndex: 'usageAmount',
        width: 90,
        render: (v: number, row: SizeUsageItem) =>
          row.sizeUsages && Object.keys(row.sizeUsages).length > 0
            ? <span style={{ color: 'var(--color-text-quaternary)' }}>分码</span>
            : fmtQty(v),
      },
      {
        title: '损耗率',
        dataIndex: 'lossRate',
        width: 80,
        render: (v: number) => (Number(v) > 0 ? `${fmtQty(v)}%` : '-'),
      },
    ];

    const dynamicSizeCols = sizeColumns.map((size) => ({
      title: size,
      key: `size_${size}`,
      width: 90,
      render: (_: unknown, row: SizeUsageItem) => {
        const usage = row.sizeUsages?.[size];
        const qty = data?.sizeQuantities?.[size];
        if (usage == null && qty == null) return '-';
        if (usage == null) return '-';
        const text = fmtQty(usage);
        // 该码无下单数量时灰色展示
        return qty == null ? (
          <span style={{ color: 'var(--color-text-quaternary)' }}>{text}</span>
        ) : (
          text
        );
      },
    }));

    const summary = [
      {
        title: '需求总量(含损耗)',
        dataIndex: 'requiredQty',
        width: 130,
        render: (v: number, row: SizeUsageItem) =>
          `${fmtQty(v)} ${row.unit || ''}`.trim(),
      },
      {
        title: '已采购量',
        dataIndex: 'purchasedQty',
        width: 110,
        render: (v: number, row: SizeUsageItem) =>
          `${fmtQty(v)} ${row.unit || ''}`.trim(),
      },
      {
        title: '差额',
        dataIndex: 'diffQty',
        width: 110,
        render: (v: number, row: SizeUsageItem) => {
          const n = Number(v);
          if (!Number.isFinite(n) || n === 0) {
            return <Tag color="success">吻合</Tag>;
          }
          return (
            <Tag color={n > 0 ? 'orange' : 'red'}>
              {n > 0 ? `多${fmtQty(n)}` : `缺${fmtQty(Math.abs(n))}`} {row.unit || ''}
            </Tag>
          );
        },
      },
    ];

    return [...base, ...dynamicSizeCols, ...summary] as any;
  }, [sizeColumns, data]);

  const items = data?.items || [];

  if (!orderId) return null;

  return (
    <Card
      title="码数用量明细与汇总"
      loading={loading}
      size="small"
      style={{ marginBottom: 16 }}
      extra={
        data?.totalQuantity != null ? (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            总下单 {data.totalQuantity} 件
          </span>
        ) : null
      }
    >
      {items.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="该款式未配置BOM用量，无法计算码数需求明细"
          style={{ padding: '16px 0' }}
        />
      ) : (
        <>
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>下单码数：</span>
            {Object.entries(data?.sizeQuantities || {}).map(([size, qty]) => (
              <Tag key={size}>
                {size} × {qty}
              </Tag>
            ))}
            {Object.keys(data?.sizeQuantities || {}).length === 0 && (
              <span style={{ color: 'var(--color-text-quaternary)', fontSize: 'var(--font-size-xs)' }}>无</span>
            )}
          </div>
          <ResizableTable
            storageKey="size-usage-summary-table"
            columns={columns}
            dataSource={items}
            rowKey={(r: SizeUsageItem) => `${r.materialCode || ''}-${r.materialName || ''}`}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
          />
          <div style={{ marginTop: 8, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-quaternary)' }}>
            需求总量 = Σ(单件用量 × 该码下单数量) × (1 + 损耗率)，与采购需求生成口径一致；分码用量未配置时按统一单件用量计算。
          </div>
        </>
      )}
    </Card>
  );
};

export default SizeUsageSummaryPanel;
