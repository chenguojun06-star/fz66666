import React from 'react';
import { Tag, Space, Button, Tooltip, InputNumber, Badge, Typography, Popover } from 'antd';
import {
  CarOutlined, CheckCircleOutlined, DeploymentUnitOutlined, EditOutlined, EyeOutlined,
  LinkOutlined, RollbackOutlined, SaveOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { getPlatformTag } from '@/utils/platform';
import { styleImageColumn, styleNoColumn } from '@/components/common/styleImageColumns';
import type { StyleImageMap, SkuBriefMap } from '@/hooks/useStyleCoverImages';
import { STATUS_MAP, WH_MAP } from './helpers';
import ProductionProgressHoverCard from '@/components/common/ProductionProgressHoverCard';
import type { EcOrder, Sku } from './types';
import type { EditRow } from './hooks/usePricingData';

const { Text } = Typography;

export interface OrdersColumnsArgs {
  styleImageMap: StyleImageMap;
  /** skuCode → 款号/颜色/尺码（后端权威解析；不要再用 skuCode.split('-') 猜） */
  briefBySku: SkuBriefMap;
  onViewDetail: (r: EcOrder) => void;
  onLink: (r: EcOrder) => void;
  onOutbound: (r: EcOrder) => void;
  onInitReturn?: (r: EcOrder) => void;
}

export function buildOrdersColumns(args: OrdersColumnsArgs): ColumnsType<EcOrder> {
  const { styleImageMap, briefBySku, onViewDetail, onLink, onOutbound, onInitReturn } = args;
  // D-532：组合套装订单——款号/款式图列对套装行改显组合编码+套装图标（briefBySku 查不到组合）
  const baseStyleNo = styleNoColumn<EcOrder>({ briefBySku, skuCode: r => r.skuCode })[0];
  const baseStyleImg = styleImageColumn<EcOrder>({ imageMap: styleImageMap, skuCode: r => r.skuCode })[0];
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
          <div className="u-fs-14 u-fw-600">{v || r.orderNo}</div>
          {v && <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>内部 {r.orderNo}</div>}
        </div>
      ),
    },
    {
      ...baseStyleNo,
      title: '款号 / 套装',
      render: (v: unknown, r: EcOrder, i: number) => r.comboCode
        ? <Tag color="geekblue" style={{ margin: 0 }}>套装 {r.comboCode}</Tag>
        : baseStyleNo.render?.(v, r, i),
    },
    {
      ...baseStyleImg,
      render: (v: unknown, r: EcOrder, i: number) => r.comboCode
        ? (
          <div style={{ width: 40, height: 40, borderRadius: 6, background: 'var(--color-bg-page)', border: '1px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <DeploymentUnitOutlined style={{ fontSize: 20, color: 'var(--color-primary)' }} />
          </div>
        )
        : baseStyleImg.render?.(v, r, i),
    },
    {
      title: '商品 / 买家', width: 190,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div className="u-fs-14">
            {r.comboCode && <Tag color="geekblue" style={{ margin: '0 4px 0 0' }}>套装</Tag>}
            {r.productName || '-'} <Text type="secondary">×{r.quantity}</Text>
          </div>
          {r.skuCode && <div className="u-fs-14" style={{ color: r.comboCode ? 'var(--color-primary)' : 'var(--color-success)' }}>{r.comboCode ? '组合编码 ' : 'SKU '}{r.skuCode}</div>}
          <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          {r.unitPrice ? <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>单价 ¥{r.unitPrice} × {r.quantity}</div> : null}
          <div className="u-fw-600" style={{ color: 'var(--color-warning)' }}>实付 ¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div className="u-fs-14" style={{ color: 'var(--color-text-quaternary)' }}>运费 ¥{r.freight}</div> : null}
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
        ? (
          <Popover
            placement="right"
            mouseEnterDelay={0.3}
            content={
              <div style={{ width: 260 }}>
                <ProductionProgressHoverCard productionOrderNo={v} />
              </div>
            }
          >
            <Tag color="blue" icon={<CheckCircleOutlined />} style={{ cursor: 'help' }}>{v}</Tag>
          </Popover>
        )
        : <Tag color="orange" style={{ cursor: 'pointer' }}>待处理</Tag>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v
        ? <div>
            <div className="u-fs-14" style={{ color: 'var(--color-text-muted)' }}>{r.expressCompany}</div>
            <div className="u-fs-14">{v}</div>
          </div>
        : <Text type="secondary">-</Text>,
    },
    {
      title: '下单时间', dataIndex: 'createTime', width: 100,
      render: v => <span className="u-fs-14">{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 160, fixed: 'right',
      render: (_: unknown, r: EcOrder) => (
        <Space size={4}>
          <Tooltip title="查看详情">
            <Button type="text" icon={<EyeOutlined />} onClick={() => onViewDetail(r)} />
          </Tooltip>
          <Tooltip title={r.comboCode ? '套装订单无需关联生产单' : (r.productionOrderNo ? '已关联' : '关联排产')}>
            <Button type="text" icon={<LinkOutlined />}
              disabled={!!r.productionOrderNo || !!r.comboCode}
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
  imageMap: StyleImageMap;
  onEdit: (r: Sku) => void;
  onCancelEdit: () => void;
  onSave: (r: Sku) => void;
  onCostChange: (val: number | null) => void;
  onSalesChange: (val: number | null) => void;
}

export function buildPricingColumns(args: PricingColumnsArgs): ColumnsType<Sku> {
  const { editRow, saving, imageMap, onEdit, onCancelEdit, onSave, onCostChange, onSalesChange } = args;
  return [
    styleImageColumn<Sku>({ imageMap, styleNo: r => r.styleNo, skuCode: r => r.skuCode }),
    { title: '款式号', dataIndex: 'styleNo', width: 130, render: v => <Text strong>{v}</Text> },
    { title: '颜色',   dataIndex: 'color',   width: 80 },
    { title: '尺码',   dataIndex: 'size',    width: 70 },
    {
      title: '商品编码', dataIndex: 'skuCode', width: 190,
      render: v => <Text style={{ fontSize: 15, color: 'var(--color-success)' }}>{v}</Text>,
    },
    {
      title: '库存', dataIndex: 'stockQuantity', width: 70,
      render: v => <Badge count={v} showZero color={v > 0 ? 'var(--color-success)' : 'var(--color-text-quaternary)'} />,
    },
    {
      title: '成本价 (¥)', dataIndex: 'costPrice', width: 140,
      render: (v, r) => editRow?.id === r.id
        ? <InputNumber value={editRow.costPrice ?? undefined} min={0} precision={2}
            style={{ width: 110 }}
            onChange={onCostChange} />
        : <Text style={{ color: 'var(--color-text-muted)' }}>{v != null ? `¥${v}` : <Text type="secondary">—</Text>}</Text>,
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
