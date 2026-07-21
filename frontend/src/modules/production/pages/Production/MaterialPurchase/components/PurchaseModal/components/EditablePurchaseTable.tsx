import React from 'react';
import { Button, Input, InputNumber, Select } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { MATERIAL_TYPE_OPTIONS } from '../PurchaseDetailView.helpers';

const { Option } = Select;

interface EditablePurchaseTableProps {
  dataSource: MaterialPurchaseType[];
  isMobile: boolean;
  isMultiColor: boolean;
  orderColors: string[];
  onAddRow: () => void;
  onUpdateRow: (rowId: string, field: string, value: any) => void;
  onRemoveRow: (rowId: string) => void;
  onOpenMaterialModal: (rowId: string) => void;
}

// 编辑模式的采购明细表格（行内编辑）
const EditablePurchaseTable: React.FC<EditablePurchaseTableProps> = ({
  dataSource,
  isMobile,
  isMultiColor,
  orderColors,
  onAddRow,
  onUpdateRow,
  onRemoveRow,
  onOpenMaterialModal,
}) => {
  return (
    <>
      <div style={{ marginBottom: 8, textAlign: 'right' }}>
        <Button type="dashed" icon={<PlusOutlined />} onClick={onAddRow}>
          添加物料
        </Button>
      </div>
      <ResizableTable<MaterialPurchaseType>
        rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
        dataSource={dataSource}
        pagination={false}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 'max-content' }}
        emptyDescription="暂无采购明细"
        columns={[
          {
            title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 110,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Select
                value={String(v || 'fabricA')}
                size="small"
                style={{ width: '100%' }}
                onChange={(val) => onUpdateRow(record.id!, 'materialType', val)}
              >
                {MATERIAL_TYPE_OPTIONS.map(opt => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            ),
          },
          {
            title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Input
                value={String(v || '')}
                size="small"
                onChange={(e) => onUpdateRow(record.id!, 'materialCode', e.target.value)}
                placeholder="输入编码"
                suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onOpenMaterialModal(record.id!); }}>选用</span>}
              />
            ),
          },
          {
            title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 140, ellipsis: true,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Input
                value={String(v || '')}
                size="small"
                onChange={(e) => onUpdateRow(record.id!, 'materialName', e.target.value)}
                placeholder="物料名称"
              />
            ),
          },
          {
            title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 100, ellipsis: true,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Input
                value={String(v || '')}
                size="small"
                onChange={(e) => onUpdateRow(record.id!, 'fabricComposition', e.target.value)}
                placeholder="成分"
              />
            ),
          },
          {
            title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 80,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Input
                value={String(v || '')}
                size="small"
                onChange={(e) => onUpdateRow(record.id!, 'fabricWeight', e.target.value)}
                placeholder="克重"
              />
            ),
          },
          {
            title: '颜色', dataIndex: 'color', key: 'color', width: 90,
            render: (v: unknown, record: MaterialPurchaseType) =>
              isMultiColor ? (
                <Select
                  value={String(v || '')}
                  size="small"
                  style={{ width: '100%' }}
                  placeholder="选择颜色"
                  allowClear
                  onChange={(val) => onUpdateRow(record.id!, 'color', val)}
                  options={orderColors.map(c => ({ label: c, value: c }))}
                />
              ) : (
                <Input
                  value={String(v || '')}
                  size="small"
                  onChange={(e) => onUpdateRow(record.id!, 'color', e.target.value)}
                  placeholder="颜色"
                />
              ),
          },
          {
            title: '码数', dataIndex: 'size', key: 'size', width: 90,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <DictAutoComplete
                dictType="size"
                value={String(v || '')}
                onChange={(val: string) => onUpdateRow(record.id!, 'size', val)}
                placeholder="码数"
                size="small"
                style={{ width: '100%' }}
              />
            ),
          },
          {
            title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <Input
                value={String(v || '')}
                size="small"
                onChange={(e) => onUpdateRow(record.id!, 'specifications', e.target.value)}
                placeholder="规格"
              />
            ),
          },
          {
            title: '单位', dataIndex: 'unit', key: 'unit', width: 80,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <DictAutoComplete
                dictType="material_unit"
                value={String(v || '')}
                onChange={(val: string) => onUpdateRow(record.id!, 'unit', val)}
                placeholder="单位"
                size="small"
                style={{ width: '100%' }}
              />
            ),
          },
          {
            title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 90, align: 'right' as const,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <InputNumber
                value={Number(v || 0)}
                size="small"
                min={0}
                style={{ width: '100%' }}
                onChange={(val) => onUpdateRow(record.id!, 'purchaseQuantity', val ?? 0)}
              />
            ),
          },
          {
            title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <InputNumber
                value={Number(v || 0)}
                size="small"
                min={0}
                precision={2}
                style={{ width: '100%' }}
                prefix="¥"
                onChange={(val) => onUpdateRow(record.id!, 'unitPrice', val ?? 0)}
              />
            ),
          },
          {
            title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true,
            render: (v: unknown, record: MaterialPurchaseType) => (
              <SupplierSelect
                value={String(v || '')}
                placeholder="供应商"
                size="small"
                style={{ width: '100%' }}
                onChange={(_val: string, option: any) => {
                  onUpdateRow(record.id!, 'supplierName', _val);
                  const sel = Array.isArray(option) ? option[0] : option;
                  if (sel) {
                    onUpdateRow(record.id!, 'supplierId' as any, (sel as any).id || '');
                  }
                }}
              />
            ),
          },
          {
            title: '操作', key: 'action', width: 100, fixed: 'right' as const,
            render: (_: unknown, record: MaterialPurchaseType) => (
              <RowActions
                maxInline={2}
                actions={[
                  { key: 'select', label: '选用', title: '从面辅料资料选用', onClick: () => onOpenMaterialModal(record.id!) },
                  { key: 'delete', label: '删除', title: '删除此行', danger: true, onClick: () => onRemoveRow(record.id!) },
                ]}
              />
            ),
          },
        ] as any}
      />
    </>
  );
};

export default EditablePurchaseTable;
