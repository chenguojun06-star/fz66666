import React from 'react';
import { Button, Input, InputNumber, Select, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import RowActions from '@/components/common/RowActions';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { formatMoney } from '@/utils/format';
import {
  formatMaterialQuantity,
  formatReferenceKilograms,
  getStatusConfig,
} from '@/modules/production/pages/Production/MaterialPurchase/utils';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_TYPE_OPTIONS, normalizeStatus } from './InlinePurchasePanel.helpers';

export interface EditColumnHandlers {
  handleUpdateRow: (rowId: string, field: string, value: any) => void;
  handleOpenMaterialModal: (rowId: string) => void;
  handleRemoveRow: (rowId: string) => void;
  orderColors: string[];
}

export interface DisplayColumnHandlers {
  handleReceive: (record: MaterialPurchase) => void;
  handleInbound: (record: MaterialPurchase) => void;
  handleConfirmReturn: (record: MaterialPurchase) => void;
  handleReturnReset: (record: MaterialPurchase) => void;
  handleCancelReceive: (record: MaterialPurchase) => void;
  handleWarehousePick: (record: MaterialPurchase, pickQty: number) => void;
  handleQualityIssue: (record: MaterialPurchase) => void;
  stockMap: Record<string, number>;
  bomIncomplete: boolean;
}

const rid = (r: MaterialPurchase) => String(r.id || '');

export const buildEditColumns = (handlers: EditColumnHandlers): ColumnsType<MaterialPurchase> => {
  const { handleUpdateRow, handleOpenMaterialModal, handleRemoveRow, orderColors } = handlers;
  return [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 110,
      render: (v: unknown, r: MaterialPurchase) => (
        <Select
          value={String(v || 'fabricA')}
          options={MATERIAL_TYPE_OPTIONS}
          onChange={(val) => handleUpdateRow(rid(r), 'materialType', val)}
          style={{ width: '100%' }}
          size="small"
        />
      ),
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 130,
      render: (v: unknown, r: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          onChange={(e) => handleUpdateRow(rid(r), 'materialCode', e.target.value)}
          placeholder="输入编码"
          size="small"
          suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleOpenMaterialModal(rid(r)); }}>选用</span>}
        />
      ),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 160,
      ellipsis: true,
      render: (v: unknown, r: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          onChange={(e) => handleUpdateRow(rid(r), 'materialName', e.target.value)}
          placeholder="物料名称"
          size="small"
        />
      ),
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 120,
      ellipsis: true,
      render: (v: unknown, r: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          onChange={(e) => handleUpdateRow(rid(r), 'fabricComposition', e.target.value)}
          placeholder="成分"
          size="small"
        />
      ),
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 80,
      render: (v: unknown, r: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          onChange={(e) => handleUpdateRow(rid(r), 'fabricWeight', e.target.value)}
          placeholder="克重"
          size="small"
        />
      ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      render: (v: unknown, r: MaterialPurchase) =>
        orderColors.length > 1 ? (
          <Select
            value={String(v || '') || undefined}
            options={orderColors.filter(Boolean).map(c => ({ label: c, value: c }))}
            onChange={(val) => handleUpdateRow(rid(r), 'color', val)}
            placeholder="颜色"
            allowClear
            style={{ width: '100%' }}
            size="small"
          />
        ) : (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'color', e.target.value)}
            placeholder="颜色"
            size="small"
          />
        ),
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 100,
      render: (v: unknown, r: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          onChange={(e) => handleUpdateRow(rid(r), 'specifications', e.target.value)}
          placeholder="规格"
          size="small"
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
      render: (v: unknown, r: MaterialPurchase) => (
        <DictAutoComplete
          dictType="material_unit"
          value={String(v || '')}
          onChange={(val: string) => handleUpdateRow(rid(r), 'unit', val)}
          placeholder="单位"
          style={{ width: '100%' }}
          size="small"
        />
      ),
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, r: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(rid(r), 'purchaseQuantity', val ?? 0)}
          size="small"
        />
      ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, r: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          min={0}
          precision={2}
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(rid(r), 'unitPrice', val ?? 0)}
          size="small"
          addonAfter="元"
        />
      ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
      render: (v: unknown, r: MaterialPurchase) => (
        <SupplierSelect
          value={String(v || '')}
          placeholder="供应商"
          style={{ width: '100%' }}
          onChange={(_val: string, option: any) => {
            handleUpdateRow(rid(r), 'supplierName', _val);
            const sel = Array.isArray(option) ? option[0] : option;
            if (sel) {
              handleUpdateRow(rid(r), 'supplierId', sel.id || '');
              handleUpdateRow(rid(r), 'supplierContactPerson', sel.supplierContactPerson || '');
              handleUpdateRow(rid(r), 'supplierContactPhone', sel.supplierContactPhone || '');
            }
          }}
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, r: MaterialPurchase) => (
        <RowActions
          maxInline={2}
          actions={[
            {
              key: 'select',
              label: '选用',
              title: '从物料资料选用',
              onClick: () => handleOpenMaterialModal(rid(r)),
            },
            {
              key: 'delete',
              label: '删除',
              title: '删除',
              danger: true as const,
              onClick: () => handleRemoveRow(rid(r)),
            },
          ]}
        />
      ),
    },
  ];
};

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
    bomIncomplete,
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
        const canReceive = purchased > qty;
        return (
          <span
            style={{
              color: canReceive ? 'var(--color-primary)' : undefined,
              cursor: canReceive ? 'pointer' : undefined,
              textDecoration: canReceive ? 'underline' : undefined,
            }}
            title={canReceive ? '点击到货入库' : undefined}
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
      width: 220,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = normalizeStatus(record.status);
        const stock = stockMap[String(record.id)];
        const hasStock = stock != null && stock > 0;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
        return (
          <Space size={4}>
            {isWarehousePending ? (
              <Tag color="blue">待仓库出库</Tag>
            ) : (
              <Button
                type="link"
                size="small"
                disabled={status !== MATERIAL_PURCHASE_STATUS.PENDING || (bomIncomplete && !hasStock)}
                onClick={() => {
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
                }}
              >
                {hasStock ? '出库领取' : (bomIncomplete ? '采购（信息不全）' : '采购')}
              </Button>
            )}
            {/* 到货入库按钮：将物料入库到仓库库存 */}
            {status === MATERIAL_PURCHASE_STATUS.PENDING && (
              <Button
                type="link"
                size="small"
                onClick={() => handleInbound(record)}
              >
                到货入库
              </Button>
            )}
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleQualityIssue(record)}
            >
              品质异常
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleConfirmReturn(record)}
            >
              {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
            </Button>
            {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
              <Button
                type="link"
                size="small"
                onClick={() => handleReturnReset(record)}
              >
                退回
              </Button>
            )}
            {status !== MATERIAL_PURCHASE_STATUS.PENDING && status !== MATERIAL_PURCHASE_STATUS.COMPLETED && status !== MATERIAL_PURCHASE_STATUS.CANCELLED && Number(record?.returnConfirmed || 0) !== 1 && (
              <Button
                type="link"
                size="small"
                danger
                onClick={() => handleCancelReceive(record)}
              >
                取消领取
              </Button>
            )}
          </Space>
        );
      },
    },
  ];
};
