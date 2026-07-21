import React from 'react';
import { Input, InputNumber } from 'antd';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { confirmDelete } from '@/utils/confirm';
import { getMaterialTypeLabel } from '@/utils/materialType';
import type { CuttingBomRow } from '../hooks/useCuttingBom';

interface BuildCuttingBomColumnsParams {
  bomEditing: boolean;
  canEdit: boolean;
  onUpdateRow: (id: string, field: string, value: any) => void;
  onOpenMaterialModal: (rowId: string) => void;
  onSetEditing: (v: boolean) => void;
  onDelete: (id: string) => void;
}

/**
 * 裁剪 BOM 表格列定义
 * 从 CuttingBomPanel 抽离，保持原渲染逻辑不变
 */
export function buildCuttingBomColumns({
  bomEditing,
  canEdit,
  onUpdateRow,
  onOpenMaterialModal,
  onSetEditing,
  onDelete,
}: BuildCuttingBomColumnsParams) {
  return [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: unknown) => getMaterialTypeLabel(v),
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 130,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}
            onChange={(e) => onUpdateRow(record.id!, 'materialCode', e.target.value)}
            placeholder="输入编码"
            suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onOpenMaterialModal(record.id!); }}>选用</span>}
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 160,
      ellipsis: true,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}

            onChange={(e) => onUpdateRow(record.id!, 'materialName', e.target.value)}
            placeholder="物料名称"
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 120,
      ellipsis: true,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}

            onChange={(e) => onUpdateRow(record.id!, 'fabricComposition', e.target.value)}
            placeholder="成分"
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 80,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}

            onChange={(e) => onUpdateRow(record.id!, 'fabricWeight', e.target.value)}
            placeholder="克重"
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}

            onChange={(e) => onUpdateRow(record.id!, 'color', e.target.value)}
            placeholder="颜色"
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '码数',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <DictAutoComplete
            dictType="size"
            value={String(v || '')}
            onChange={(val: string) => onUpdateRow(record.id!, 'size', val)}
            placeholder="码数"

            style={{ width: '100%' }}
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '规格',
      dataIndex: 'specification',
      key: 'specification',
      width: 100,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <Input
            value={String(v || '')}

            onChange={(e) => onUpdateRow(record.id!, 'specification', e.target.value)}
            placeholder="规格"
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 70,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <DictAutoComplete
            dictType="material_unit"
            value={String(v || '')}
            onChange={(val: string) => onUpdateRow(record.id!, 'unit', val)}
            placeholder="单位"

            style={{ width: '100%' }}
          />
        ) : (
          String(v || '').trim() || '-'
        ),
    },
    {
      title: '用量',
      dataIndex: 'usageAmount',
      key: 'usageAmount',
      width: 80,
      align: 'right' as const,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <InputNumber
            value={Number(v || 0)}

            min={0}
            precision={2}
            controls={false}
            style={{ width: '100%' }}
            onChange={(val) => onUpdateRow(record.id!, 'usageAmount', val ?? 0)}
          />
        ) : (
          Number(v || 0)
        ),
    },
    {
      title: '损耗率%',
      dataIndex: 'lossRate',
      key: 'lossRate',
      width: 80,
      align: 'right' as const,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <InputNumber
            value={Number(v || 0)}

            min={0}
            max={100}
            precision={1}
            controls={false}
            style={{ width: '100%' }}
            onChange={(val) => onUpdateRow(record.id!, 'lossRate', val ?? 0)}
          />
        ) : (
          `${Number(v || 0)}%`
        ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 90,
      align: 'right' as const,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <InputNumber
            value={Number(v || 0)}

            min={0}
            precision={2}
            controls={false}
            style={{ width: '100%' }}
            prefix="¥"
            onChange={(val) => onUpdateRow(record.id!, 'unitPrice', val ?? 0)}
          />
        ) : (
          `¥${Number(v || 0).toFixed(2)}`
        ),
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
      render: (v: unknown, record: CuttingBomRow) =>
        bomEditing ? (
          <SupplierSelect
            value={String(v || '')}
            placeholder="供应商"

            style={{ width: '100%' }}
            onChange={(_val: string, option: any) => {
              onUpdateRow(record.id!, 'supplierName', _val);
              const sel = Array.isArray(option) ? option[0] : option;
              if (sel) {
                onUpdateRow(record.id!, 'supplierId', sel.id || '');
                onUpdateRow(record.id!, 'supplierContactPerson', sel.supplierContactPerson || '');
                onUpdateRow(record.id!, 'supplierContactPhone', sel.supplierContactPhone || '');
              }
            }}
          />
        ) : (
          <SupplierNameTooltip
            name={String(v || '')}
            contactPerson={record.supplierContactPerson}
            contactPhone={record.supplierContactPhone}
          />
        ),
    },
    ...(canEdit
      ? [
          {
            title: '操作',
            key: 'action',
            width: bomEditing ? 120 : 80,
            render: (_: unknown, record: CuttingBomRow) => (
              <RowActions
                maxInline={2}
                actions={[
                  ...(bomEditing
                    ? [
                        {
                          key: 'select',
                          label: '选用',
                          title: '从物料资料选用',
                          onClick: () => onOpenMaterialModal(record.id!),
                        },
                        {
                          key: 'delete',
                          label: '删除',
                          title: '删除',
                          danger: true as const,
                          onClick: () => confirmDelete('该BOM记录', async () => onDelete(record.id!), { content: '删除后不可恢复，确认删除该BOM记录？' }),
                        },
                      ]
                    : [
                        {
                          key: 'edit',
                          label: '编辑',
                          title: '编辑',
                          onClick: () => onSetEditing(true),
                        },
                      ]),
                ]}
              />
            ),
          },
        ]
      : []),
  ];
}
