import React from 'react';
import { Tag, Space, Button, Tooltip, Image, InputNumber, Badge, Typography } from 'antd';
import {
  CarOutlined, CheckCircleOutlined, EditOutlined, EyeOutlined,
  LinkOutlined, RollbackOutlined, SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getPlatformTag } from '@/utils/platform';
import { STATUS_MAP, WH_MAP } from './helpers';
import type { EcOrder, Sku } from './types';
import type { EditRow } from './hooks/usePricingData';

const { Text } = Typography;

export interface OrdersColumnsArgs {
  styleImageMap: Record<string, string>;
  onViewDetail: (r: EcOrder) => void;
  onLink: (r: EcOrder) => void;
  onOutbound: (r: EcOrder) => void;
  onInitReturn?: (r: EcOrder) => void;
}

export function buildOrdersColumns(args: OrdersColumnsArgs): ColumnsType<EcOrder> {
  const { styleImageMap, onViewDetail, onLink, onOutbound, onInitReturn } = args;
  return [
    {
      title: '平台', dataIndex: 'sourcePlatformCode', width: 88,
      render: (code: string) => {
        const t = getPlatformTag(code);
        return <Tag color={t.color}>{t.label}</Tag>;
      },
    },
    {
      title: '订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v || r.orderNo}</div>
          {v && <div style={{ fontSize: 14, color: '#888' }}>内部 {r.orderNo}</div>}
        </div>
      ),
    },
    {
      title: '款号', width: 110,
      render: (_: unknown, r: EcOrder) => {
        const styleNo = (r.skuCode || '').split('-')[0];
        return styleNo
          ? <Text strong style={{ fontSize: 14, fontFamily: 'monospace' }}>{styleNo}</Text>
          : <Text type="secondary">-</Text>;
      },
    },
    {
      title: '款式图', width: 68, align: 'center' as const,
      render: (_: unknown, r: EcOrder) => {
        const styleNo = (r.skuCode || '').split('-')[0];
        const imgUrl = styleNo ? styleImageMap[styleNo] : undefined;
        return imgUrl
          ? <Image
              src={getFullAuthedFileUrl(imgUrl)}
              width={44} height={44}
              style={{ objectFit: 'cover', borderRadius: 4 }}
              preview={{ cover: <EyeOutlined style={{ fontSize: 12 }} /> }}
            />
          : <div style={{
              width: 44, height: 44, background: 'var(--color-bg-subtle)', borderRadius: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: 'var(--color-text-quaternary)',
            }}></div>;
      },
    },
    {
      title: '商品 / 买家', width: 190,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div style={{ fontSize: 14 }}>{r.productName || '-'} <Text type="secondary">×{r.quantity}</Text></div>
          {r.skuCode && <div style={{ fontSize: 14, color: 'var(--color-success)' }}>SKU {r.skuCode}</div>}
          <div style={{ fontSize: 14, color: '#888' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          {r.unitPrice ? <div style={{ fontSize: 14, color: '#888' }}>单价 ¥{r.unitPrice} × {r.quantity}</div> : null}
          <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>实付 ¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div style={{ fontSize: 14, color: '#aaa' }}>运费 ¥{r.freight}</div> : null}
        </div>
      ),
    },
    {
      title: '订单状态', dataIndex: 'status', width: 82,
      render: v => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '仓库状态', dataIndex: 'warehouseStatus', width: 82,
      render: v => <Tag color={WH_MAP[v]?.color}>{WH_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '关联生产单', dataIndex: 'productionOrderNo', width: 140,
      render: v => v
        ? <Tag color="blue" icon={<CheckCircleOutlined />}>{v}</Tag>
        : <Tag color="orange" style={{ cursor: 'pointer' }}>待处理</Tag>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v
        ? <div>
            <div style={{ fontSize: 14, color: '#888' }}>{r.expressCompany}</div>
            <div style={{ fontSize: 14 }}>{v}</div>
          </div>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '下单时间', dataIndex: 'createTime', width: 100,
      render: v => <span style={{ fontSize: 14 }}>{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_: unknown, r: EcOrder) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button type="text" icon={<EyeOutlined />} onClick={() => onViewDetail(r)} />
          </Tooltip>
          <Tooltip title={r.productionOrderNo ? '已关联' : '关联排产'}>
            <Button type="text" icon={<LinkOutlined />}
              disabled={!!r.productionOrderNo}
              onClick={() => onLink(r)} />
          </Tooltip>
          {(r.warehouseStatus ?? 0) < 2 && (
            <Tooltip title="现货直接出库">
              <Button type="text" icon={<CarOutlined />}
                onClick={() => onOutbound(r)} />
            </Tooltip>
          )}
          {onInitReturn && r.productionOrderId && (
            <Tooltip title="发起退货">
              <Button type="text" icon={<RollbackOutlined />}
                onClick={() => onInitReturn(r)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];
}

export interface PricingColumnsArgs {
  editRow: EditRow | null;
  saving: boolean;
  onEdit: (r: Sku) => void;
  onCancelEdit: () => void;
  onSave: (r: Sku) => void;
  onCostChange: (val: number | null) => void;
  onSalesChange: (val: number | null) => void;
}

export function buildPricingColumns(args: PricingColumnsArgs): ColumnsType<Sku> {
  const { editRow, saving, onEdit, onCancelEdit, onSave, onCostChange, onSalesChange } = args;
  return [
    { title: '款式号', dataIndex: 'styleNo', width: 130, render: v => <Text strong>{v}</Text> },
    { title: '颜色',   dataIndex: 'color',   width: 80 },
    { title: '尺码',   dataIndex: 'size',    width: 70 },
    {
      title: 'SKU编码', dataIndex: 'skuCode', width: 190,
      render: v => <Text style={{ fontSize: 14, color: 'var(--color-success)' }}>{v}</Text>,
    },
    {
      title: '库存', dataIndex: 'stockQuantity', width: 70,
      render: v => <Badge count={v} showZero color={v > 0 ? 'var(--color-success)' : '#aaa'} />,
    },
    {
      title: '成本价 (¥)', dataIndex: 'costPrice', width: 140,
      render: (v, r) => editRow?.id === r.id
        ? <InputNumber value={editRow.costPrice ?? undefined} min={0} precision={2}
            style={{ width: 110 }}
            onChange={onCostChange} />
        : <Text style={{ color: '#888' }}>{v != null ? `¥${v}` : <Text type="secondary">—</Text>}</Text>,
    },
    {
      title: '单价 (¥)', dataIndex: 'salesPrice', width: 140,
      render: (v, r) => editRow?.id === r.id
        ? <InputNumber value={editRow.salesPrice ?? undefined} min={0} precision={2}
            style={{ width: 110 }}
            onChange={onSalesChange} />
        : <Text style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{v != null ? `¥${v}` : <Text type="secondary">—</Text>}</Text>,
    },
    {
      title: '毛利率', width: 80,
      render: (_: unknown, r: Sku) => {
        if (!r.costPrice || !r.salesPrice) return <Text type="secondary">-</Text>;
        const rate = ((r.salesPrice - r.costPrice) / r.salesPrice * 100);
        return <Tag color={rate >= 40 ? 'green' : rate >= 20 ? 'orange' : 'red'}>{rate.toFixed(1)}%</Tag>;
      },
    },
    {
      title: '操作', width: 110, fixed: 'right',
      render: (_: unknown, r: Sku) => editRow?.id === r.id
        ? (
          <Space size={4}>
            <Button type="primary" icon={<SaveOutlined />} loading={saving}
              onClick={() => onSave(r)}>保存</Button>
            <Button onClick={onCancelEdit}>取消</Button>
          </Space>
        )
        : (
          <Button icon={<EditOutlined />}
            onClick={() => onEdit(r)}>
            定价
          </Button>
        ),
    },
  ];
}
