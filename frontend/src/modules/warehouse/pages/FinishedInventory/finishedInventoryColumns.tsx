import React, { useState, useCallback } from 'react';
import { Tag, InputNumber, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SalesForecastResponse, SizeCurveResponse } from '@/services/intelligence/intelligenceTypes';

// SKU明细接口
export interface SKUDetail {
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  costPrice?: number;
  salesPrice?: number;
  outboundQty?: number;
  selected?: boolean;
}

export interface FinishedInventory {
  id: string;
  orderId?: string;
  orderNo: string;
  factoryName?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderBizType?: string;
  parentOrgUnitId?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  styleId?: string;
  styleNo: string;
  styleName: string;
  styleImage?: string;
  color: string;
  size: string;
  sku: string;
  availableQty: number;
  lockedQty: number;
  defectQty: number;
  warehouseLocation: string;
  lastInboundDate: string;
  qualityInspectionNo?: string;
  lastInboundBy?: string;
  lastInboundQty?: number;
  lastOutboundDate?: string;
  lastOutstockNo?: string;
  lastOutboundBy?: string;
  totalInboundQty?: number;
  costPrice?: number;
  salesPrice?: number;
  colors?: string[];
  sizes?: string[];
}

export function getMainColumns(handlers: {
  handleOutbound: (record: FinishedInventory) => void;
  handleViewInboundHistory: (record: FinishedInventory) => void;
}): ColumnsType<FinishedInventory> {
  return [
    {
      title: '图片',
      dataIndex: 'styleImage',
      width: 72,
      align: 'center',
      render: (_, record) => (
        <StyleCoverThumb
          src={record.styleImage || null}
          styleNo={record.styleNo}
          size={48}
          borderRadius={4}
        />
      ),
    },
    {
      title: '成品信息',
      width: 220,
      align: 'left' as const,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, lineHeight: 1.5, textAlign: 'left' }}>
          <StyleNoForecastHover styleNo={record.styleNo} />
          <div style={{ fontSize: 13, color: 'var(--neutral-text)', fontWeight: 500 }}>{record.styleName || '-'}</div>
          <div style={{ fontSize: 12, color: 'var(--neutral-text-secondary)' }}>
            工厂: {record.factoryName || '-'}
          </div>
        </div>
      ),
    },
    {
      title: '颜色 & 尺码',
      width: 180,
      render: (_, record) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {record.colors && record.colors.length > 0 ? (
              record.colors.map((c, i) => <Tag key={i} color="blue" style={{ margin: 0 }}>{c}</Tag>)
            ) : (
              <Tag color="blue" style={{ margin: 0 }}>{record.color}</Tag>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
            {record.sizes && record.sizes.length > 0 ? (
              record.sizes.map((s, i) => <Tag key={i} style={{ margin: 0, background: '#f0f0f0', border: '1px solid #d9d9d9' }}>{s}</Tag>)
            ) : (
              <Tag style={{ margin: 0, background: '#f0f0f0', border: '1px solid #d9d9d9' }}>{record.size}</Tag>
            )}
          </div>
        </div>
      ),
    },
    {
      title: '库存状态',
      width: 260,
      render: (_, record) => (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          width: '100%'
        }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>可用</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-success)' }}>
              {record.availableQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>锁定</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--color-warning)' }}>
              {record.lockedQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>次品</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: record.defectQty > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
              {record.defectQty.toLocaleString()}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>件</div>
          </div>
        </div>
      ),
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      width: 90,
      align: 'center' as const,
      render: (v: number | null) => v != null
        ? <span style={{ fontSize: 14, fontWeight: 700, color: '#cf1322' }}>¥{Number(v).toFixed(2)}</span>
        : <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>,
    },
    {
      title: '入库',
      width: 190,
      render: (_, record) => (
        <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--neutral-text)' }}>
          <div>{record.lastInboundDate ? String(record.lastInboundDate).slice(0, 16).replace('T', ' ') : '-'}</div>
          <div>数量: <strong style={{ color: 'var(--color-success)' }}>{record.lastInboundQty ?? '-'}</strong> 件</div>
          <div>操作人: <strong>{record.lastInboundBy || '-'}</strong></div>
          <div style={{ color: 'var(--neutral-text-secondary)' }}>库位: {record.warehouseLocation || '-'}</div>
        </div>
      ),
    },
    {
      title: '出库',
      width: 190,
      render: (_, record) => (
        <div style={{ fontSize: 13, lineHeight: 2, color: 'var(--neutral-text)' }}>
          <div>{record.lastOutboundDate ? String(record.lastOutboundDate).slice(0, 16).replace('T', ' ') : '-'}</div>
          <div>单号: <strong style={{ color: 'var(--primary-color)' }}>{record.lastOutstockNo || '-'}</strong></div>
          <div>出库人: <strong>{record.lastOutboundBy || '-'}</strong></div>
        </div>
      ),
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'outbound',
              label: '出库',
              primary: true,
              onClick: () => handlers.handleOutbound(record)
            },
            {
              key: 'history',
              label: '入库记录',
              onClick: () => handlers.handleViewInboundHistory(record)
            }
          ]}
        />
      ),
    },
  ];
}

function StyleNoForecastHover({ styleNo }: { styleNo: string }) {
  const [forecast, setForecast] = useState<SalesForecastResponse | null>(null);
  const [sizeCurve, setSizeCurve] = useState<SizeCurveResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchForecast = useCallback(async () => {
    if (!styleNo || forecast) return;
    setLoading(true);
    try {
      const [fRes, sRes] = await Promise.all([
        intelligenceApi.getSalesForecast(styleNo),
        intelligenceApi.getSizeCurve(styleNo),
      ]);
      setForecast((fRes as any)?.data ?? fRes);
      setSizeCurve((sRes as any)?.data ?? sRes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [styleNo, forecast]);

  const sizeEntries = sizeCurve?.sizeCurve ? Object.entries(sizeCurve.sizeCurve) : [];

  return (
    <Tooltip
      title={
        loading ? (
          '加载中...'
        ) : forecast ? (
          <div style={{ fontSize: 12, lineHeight: 1.8, minWidth: 160 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>销量预测（{forecast.horizonMonths}个月）</div>
            <div>预测: <b>{forecast.predictedQty}</b> 件</div>
            <div>乐观: {forecast.optimistic} / 悲观: {forecast.pessimistic}</div>
            <div>置信度: {forecast.confidence}%</div>
            {sizeEntries.length > 0 && (
              <>
                <div style={{ fontWeight: 600, marginTop: 6, marginBottom: 4 }}>尺码曲线</div>
                {sizeEntries.map(([size, pct]) => (
                  <div key={size} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{size}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
                <div style={{ color: '#999', marginTop: 2 }}>样本 {sizeCurve!.sampleCount} 条，置信 {sizeCurve!.confidence}%</div>
              </>
            )}
          </div>
        ) : (
          '悬停查看预测'
        )
      }
      onOpenChange={(open) => {
        if (open) fetchForecast();
      }}
    >
      <span style={{ color: 'var(--primary-color)', fontWeight: 600, cursor: 'pointer' }}>
        {styleNo}
      </span>
    </Tooltip>
  );
}

export function getSkuColumns(handlers: {
  handleSKUQtyChange: (index: number, val: number | null) => void;
}): ColumnsType<SKUDetail> {
  return [
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      align: 'center',
      render: (color: string) => (
        <Tag color="blue">{color}</Tag>
      ),
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
      align: 'center',
      render: (size: string) => (
        <Tag color="green">{size}</Tag>
      ),
    },
    {
      title: 'SKU编码',
      dataIndex: 'sku',
      key: 'sku',
      width: 180,
    },
    {
      title: '仓库位置',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      align: 'center',
    },
    {
      title: '可用库存',
      dataIndex: 'availableQty',
      key: 'availableQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '锁定库存',
      dataIndex: 'lockedQty',
      key: 'lockedQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '次品库存',
      dataIndex: 'defectQty',
      key: 'defectQty',
      width: 100,
      align: 'center',
      render: (qty: number) => (
        <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{qty}</span>
      ),
    },
    {
      title: '成本价',
      dataIndex: 'costPrice',
      key: 'costPrice',
      width: 90,
      align: 'center',
      render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '单价',
      dataIndex: 'salesPrice',
      key: 'salesPrice',
      width: 90,
      align: 'center',
      render: (v: number) => v != null ? `¥${v.toFixed(2)}` : '-',
    },
    {
      title: '出库数量',
      dataIndex: 'outboundQty',
      key: 'outboundQty',
      width: 120,
      align: 'center',
      render: (value: number, record: SKUDetail, index: number) => (
        <InputNumber
          min={0}
          max={record.availableQty}
          value={value}
          onChange={(val) => handlers.handleSKUQtyChange(index, val)}
          style={{ width: '100%' }}
          placeholder="0"
        />
      ),
    },
  ];
}
