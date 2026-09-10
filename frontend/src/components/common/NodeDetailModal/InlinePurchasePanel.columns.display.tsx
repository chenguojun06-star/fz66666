import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { formatMoney } from '@/utils/format';
import {
  formatMaterialQuantity,
  formatReferenceKilograms,
  getStatusConfig,
} from '@/modules/production/pages/Production/MaterialPurchase/utils';
import type { MaterialPurchase } from '@/types/production';
import { normalizeStatus } from './InlinePurchasePanel.helpers';
import { getPurchaseMissingFields } from './utils';
import type { DisplayColumnHandlers } from './InlinePurchasePanel.columns.shared';

export const buildDisplayColumns = (handlers: DisplayColumnHandlers): ColumnsType<MaterialPurchase> => {
  const {
    handleReceive,
    handleInbound,
    handleConfirmReturn,
    handleReturnReset,
    handleCancelReceive,
    handleWarehousePick,
    handleQualityIssue,
    stockMap,
  } = handlers;
  return [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: unknown) => <MaterialTypeTag value={v} />,
    },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 110, render: (v: unknown) => v || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: unknown) => {
        const c = String(v || '').trim();
        return c || <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
      },
    },
    {
      title: '规格/幅宽',
      key: 'specWidth',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => {
        const spec = String(r.specifications || '').trim();
        const w = String((r as any).fabricWidth || '').trim();
        if (spec && w) return `${spec} / ${w}`;
        return spec || w || '-';
      },
    },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, render: (v: unknown) => v || '-' },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => formatMaterialQuantity(v),
    },
    {
      title: '参考公斤数',
      key: 'referenceKilograms',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => formatReferenceKilograms(r.purchaseQuantity, (r as any).conversionRate, r.unit),
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, r: MaterialPurchase) => {
        const qty = Number(v ?? 0);
        const purchased = Number(r.purchaseQuantity ?? 0);
        // D-360b 状态机收紧：仅已领取（已领取/部分到货）且未回料确认的行可点击追加到货
        const st = normalizeStatus(r.status);
        const canReceive = purchased > qty
          && (st === MATERIAL_PURCHASE_STATUS.RECEIVED || st === MATERIAL_PURCHASE_STATUS.PARTIAL)
          && Number(r?.returnConfirmed || 0) !== 1;
        return (
          <span
            style={{
              color: canReceive ? 'var(--color-primary)' : undefined,
              cursor: canReceive ? 'pointer' : undefined,
              textDecoration: canReceive ? 'underline' : undefined,
            }}
            title={canReceive ? '点击追加到货' : undefined}
            onClick={() => { if (canReceive) handleReceive(r); }}
          >
            {formatMaterialQuantity(v)}
          </span>
        );
      },
    },
    {
      title: '仓库库存',
      key: 'warehouseStock',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
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
              if (hasStock) {
                const safeStock = Number.isFinite(stock) ? Math.floor(stock as number) : 0;
                const remaining = Math.max(0, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0));
                const requiredQty = remaining > 0
                  ? Math.floor(remaining)
                  : (Number.isFinite(Number(r.purchaseQuantity)) && Number(r.purchaseQuantity) > 0
                      ? Math.floor(Number(r.purchaseQuantity))
                      : safeStock);
                const pickQty = Math.min(safeStock, requiredQty);
                if (pickQty > 0) {
                  handleWarehousePick(r, pickQty);
                }
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
      width: 100,
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
      width: 110,
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
      width: 130,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchase) => (
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
      render: (status: MaterialPurchase['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '回料时间',
      dataIndex: 'returnConfirmTime',
      key: 'returnConfirmTime',
      width: 140,
      render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (String(v || '').slice(0, 16).replace('T', ' ') || '-') : '-'),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = normalizeStatus(record.status);
        const stock = stockMap[String(record.id)];
        const hasStock = stock != null && stock > 0;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
        const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
        const isReceived = status === MATERIAL_PURCHASE_STATUS.RECEIVED;
        const isPartial = status === MATERIAL_PURCHASE_STATUS.PARTIAL;
        const isCompleted = status === MATERIAL_PURCHASE_STATUS.COMPLETED;
        const isCancelled = status === MATERIAL_PURCHASE_STATUS.CANCELLED;
        const isReturnConfirmed = Number(record?.returnConfirmed || 0) === 1;
        // 行级完整性：只禁用本体信息缺失的行（供应商缺失不禁用）
        const rowMissing = getPurchaseMissingFields(record);
        const isPostReceive = isReceived || isPartial || isCompleted;

        const actions: RowAction[] = [
          ...(isWarehousePending ? [{ key: 'warehouse-pending', label: '待仓库出库', title: '等待仓库出库', disabled: true } as RowAction] : []),
          ...(!isWarehousePending && isPending ? [{
            key: 'receive',
            label: hasStock ? '出库领取' : (rowMissing.length > 0 ? `领取（缺${rowMissing.join('、')}）` : '领取'),
            title: hasStock ? '从仓库库存出库领取' : (rowMissing.length > 0 ? `该行缺少：${rowMissing.join('、')}，请先编辑补全` : '领取并登记到货数量'),
            disabled: rowMissing.length > 0 && !hasStock,
            primary: true,
            onClick: () => {
              if (hasStock) {
                const safeStock = Number.isFinite(stock) ? Math.floor(stock as number) : 0;
                const remaining = Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                const requiredQty = remaining > 0
                  ? Math.floor(remaining)
                  : (Number.isFinite(Number(record.purchaseQuantity)) && Number(record.purchaseQuantity) > 0
                      ? Math.floor(Number(record.purchaseQuantity))
                      : safeStock);
                const pickQty = Math.min(safeStock, requiredQty);
                if (pickQty > 0) {
                  handleWarehousePick(record, pickQty);
                }
              } else {
                handleReceive(record);
              }
            },
          }] : []),
          // D-360b 状态机收紧：登记(追加)到货仅在领取后可用，未领取不允许到货登记
          ...((isReceived || isPartial) && !isReturnConfirmed ? [{ key: 'inbound', label: '追加到货', title: '登记追加到货数量并入库', onClick: () => handleInbound(record) }] : []),
          ...(!isPending && !isCancelled ? [{
            key: 'return-confirm',
            label: isReturnConfirmed ? '追加回料' : '回料确认',
            title: isReturnConfirmed ? '已回料确认，可追加回料' : '确认物料已回料到仓库',
            disabled: !isPostReceive,
            onClick: () => handleConfirmReturn(record),
          }] : []),
          ...(isReturnConfirmed ? [{ key: 'return-reset', label: '退回', title: '退回已确认的回料', danger: true, onClick: () => handleReturnReset(record) }] : []),
          ...(!isPending && !isCompleted && !isCancelled && !isReturnConfirmed ? [{ key: 'cancel-receive', label: '撤回领取', title: '撤回已领取的采购，恢复为待处理', danger: true, onClick: () => handleCancelReceive(record) }] : []),
          // D-360b 状态机收紧：品质异常仅在领取后可登记
          ...(isPostReceive && !isReturnConfirmed ? [{ key: 'quality-issue', label: '品质异常', title: '登记物料品质问题', onClick: () => handleQualityIssue(record) }] : []),
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];
};
