import React from 'react';
import { Input, InputNumber, Select } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import RowActions from '@/components/common/RowActions';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_TYPE_OPTIONS } from './InlinePurchasePanel.helpers';
import type { EditColumnHandlers } from './InlinePurchasePanel.columns.shared';
import { rid } from './InlinePurchasePanel.columns.shared';

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
