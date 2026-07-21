import React from 'react';
import { Button, Collapse, Space, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialSpecWidth, getMaterialTypeCategory } from '@/utils/materialType';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import {
  getStatusConfig,
  formatMaterialQuantity,
  formatMaterialQuantityWithUnit,
  formatReferenceKilograms,
  subtractMaterialQuantity,
} from '../../../utils';
import { normalizeStatus } from '../PurchaseDetailView.helpers';

interface PurchaseDetailCollapseProps {
  detailPurchases: MaterialPurchaseType[];
  isMobile: boolean;
  stockMap: Record<string, number>;
  isSupervisorOrAbove: boolean;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onCancelReceive?: (record: MaterialPurchaseType) => void;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
  onArrival: (record: MaterialPurchaseType) => void;
  onCancelTarget: (record: MaterialPurchaseType) => void;
}

// 详情模式的 Collapse 折叠面板（按面料/里料/辅料分组）
const PurchaseDetailCollapse: React.FC<PurchaseDetailCollapseProps> = ({
  detailPurchases,
  isMobile,
  stockMap,
  isSupervisorOrAbove,
  isOrderFrozenForRecord,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  onCancelReceive,
  onWarehousePick,
  onArrival,
  onCancelTarget,
}) => {
  const sections = ([
    { key: 'fabric', title: '面料' },
    { key: 'lining', title: '里料' },
    { key: 'accessory', title: '辅料' },
  ] as const)
    .map((sec) => {
      const data = detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === sec.key);
      return { ...sec, data };
    })
    .filter((x) => x.data.length > 0);

  const items = sections.map((sec) => ({
    key: sec.key,
    label: `${sec.title}（${sec.data.length}）`,
    children: (
      <ResizableTable<MaterialPurchaseType>
        rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
        dataSource={sec.data}
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content' }}
        emptyDescription="暂无数据"
        rowClassName={(record: MaterialPurchaseType) => {
          const isConfirmed = Number(record?.returnConfirmed || 0) === 1;
          return isConfirmed ? 'row-confirmed-disabled' : '';
        }}
        columns={[
          {
            title: '物料类型',
            dataIndex: 'materialType',
            key: 'materialType',
            width: 110,
            render: (v: unknown) => <MaterialTypeTag value={v} />,
          },
          { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: unknown) => v || '-' },
          { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
          { title: '规格/幅宽', key: 'specWidth', width: 140, ellipsis: true, render: (_: unknown, r: MaterialPurchaseType) => formatMaterialSpecWidth(r.specifications, r.fabricWidth) },
          { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: unknown) => v || '-' },
          { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: unknown) => formatMaterialQuantity(v) },
          { title: '参考公斤数', key: 'referenceKilograms', width: 120, align: 'right' as const, render: (_: unknown, r: MaterialPurchaseType) => formatReferenceKilograms(r.purchaseQuantity, r.conversionRate, r.unit) },
          { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const,
            render: (v: unknown, r: MaterialPurchaseType) => {
              const qty = Number(v ?? 0);
              const purchased = Number(r.purchaseQuantity ?? 0);
              const canArrive = purchased > qty && ['received', 'partial', 'partial_arrival'].includes(normalizeStatus(r.status));
              return (
                <span
                  style={{
                    color: canArrive ? 'var(--color-primary)' : undefined,
                    cursor: canArrive ? 'pointer' : undefined,
                    textDecoration: canArrive ? 'underline' : undefined,
                  }}
                  title={canArrive ? '点击到货入库' : undefined}
                  onClick={() => {
                    if (!canArrive) return;
                    onArrival(r);
                  }}
                >
                  {formatMaterialQuantity(v)}
                </span>
              );
            },
          },
          {
            title: '待到数量',
            key: 'remainingQuantity',
            width: 100,
            align: 'right' as const,
            render: (_: any, r: MaterialPurchaseType) => {
              const remaining = subtractMaterialQuantity(r?.purchaseQuantity, r?.arrivedQuantity);
              return formatMaterialQuantityWithUnit(remaining, r.unit);
            },
          },
          {
            title: '仓库库存',
            key: 'warehouseStock',
            width: 90,
            align: 'right' as const,
            render: (_: unknown, r: MaterialPurchaseType) => {
              const stock = stockMap[String(r.id)];
              if (stock == null) return <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
              const hasStock = stock > 0;
              return (
                <span
                  style={{
                    color: hasStock ? 'var(--color-primary)' : 'var(--color-text-quaternary)',
                    cursor: hasStock ? 'pointer' : undefined,
                    textDecoration: hasStock ? 'underline' : undefined,
                  }}
                  title={hasStock ? '点击出库领取' : undefined}
                  onClick={() => {
                    if (hasStock && onWarehousePick) {
                      const remaining = Math.max(0, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0));
                      const pickQty = remaining > 0 ? Math.min(stock, remaining) : Math.min(stock, Number(r.purchaseQuantity || 0));
                      onWarehousePick(r, pickQty);
                    }
                  }}
                >
                  {stock}{r.unit ? ` ${r.unit}` : ''}
                </span>
              );
            },
          },
          {
            title: '单价',
            dataIndex: 'unitPrice',
            key: 'unitPrice',
            width: 110,
            align: 'right' as const,
            render: (v: unknown) => {
              const n = Number(v);
              return Number.isFinite(n) ? formatMoney(n) : '-';
            },
          },
          {
            title: '金额',
            dataIndex: 'totalAmount',
            key: 'totalAmount',
            width: 120,
            align: 'right' as const,
            render: (v: any, r: any) => {
              const qty = Number(r?.arrivedQuantity ?? 0);
              const price = Number(r?.unitPrice);
              if (Number.isFinite(qty) && Number.isFinite(price)) return formatMoney(qty * price);
              const n = Number(v);
              return Number.isFinite(n) ? formatMoney(n) : '-';
            },
          },
          {
            title: '供应商',
            dataIndex: 'supplierName',
            key: 'supplierName',
            width: 140,
            ellipsis: true,
            render: (_: unknown, record: MaterialPurchaseType) => (
              <SupplierNameTooltip
                name={record.supplierName}
                contactPerson={(record as any).supplierContactPerson}
                contactPhone={(record as any).supplierContactPhone}
              />
            ),
          },
          {
            title: '状态',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (status: MaterialPurchaseType['status']) => {
              const { text, color } = getStatusConfig(status);
              return <Tag color={color}>{text}</Tag>;
            },
          },
          {
            title: '回料时间',
            dataIndex: 'returnConfirmTime',
            key: 'returnConfirmTime',
            width: 160,
            render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(v) || '-') : '-'),
          },
          { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true, render: (v: unknown) => v || '-' },
          {
            title: '操作',
            key: 'confirm',
            width: 280,
            render: (_: any, record: MaterialPurchaseType) => {
              const frozen = isOrderFrozenForRecord(record);
              const status = normalizeStatus(record.status);
              const stock = stockMap[String(record.id)];
              const hasStock = stock != null && stock > 0;
              const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
              const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
              const canArrival = ['received', 'partial', 'partial_arrival'].includes(status) && !frozen;
              const canCancelReceive = !isPending && !['completed', 'cancelled'].includes(status) && !frozen;
              return (
                <Space size={4} wrap>
                  {isWarehousePending ? (
                    <Tag color="blue">待仓库出库</Tag>
                  ) : (
                    <Button
                      type="link"
                      disabled={frozen || status !== MATERIAL_PURCHASE_STATUS.PENDING || Number(record?.returnConfirmed || 0) === 1}
                      onClick={() => {
                        if (hasStock && onWarehousePick) {
                          const remaining = Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                          const pickQty = remaining > 0 ? Math.min(stock, remaining) : Math.min(stock, Number(record.purchaseQuantity || 0));
                          onWarehousePick(record, pickQty);
                        } else {
                          onReceive(record);
                        }
                      }}
                    >
                      {hasStock ? '出库领取' : '采购'}
                    </Button>
                  )}
                  {canArrival && (
                    <Button
                      type="link"
                      disabled={Number(record?.returnConfirmed || 0) === 1}
                      onClick={() => onArrival(record)}
                    >
                      到货入库
                    </Button>
                  )}
                  <Button
                    type="link"
                    disabled={frozen || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED) || Number(record?.returnConfirmed || 0) === 1}
                    onClick={() => onConfirmReturn(record)}
                  >
                    {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
                  </Button>
                  {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
                    <Button
                      type="link"
                      disabled={!isSupervisorOrAbove}
                      onClick={() => onReturnReset(record)}
                    >
                      退回
                    </Button>
                  )}
                  {canCancelReceive && (
                    <Button
                      type="link"
                      danger
                      onClick={() => {
                        if (onCancelReceive) {
                          onCancelReceive(record);
                        } else {
                          onCancelTarget(record);
                        }
                      }}
                    >
                      取消领取
                    </Button>
                  )}
                  <Button
                    type="link"
                    disabled={frozen || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED) || Number(record?.returnConfirmed || 0) === 1}
                    onClick={() => onQualityIssue(record)}
                  >
                    品质异常
                  </Button>
                </Space>
              );
            },
          },
        ]}
      />
    ),
  }));

  if (!items.length) return null;

  return (
    <Collapse
      collapsible="icon"
      defaultActiveKey={sections.map(s => s.key)}
      items={items}
    />
  );
};

export default PurchaseDetailCollapse;
