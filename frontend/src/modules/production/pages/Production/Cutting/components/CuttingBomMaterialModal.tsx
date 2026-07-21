import React from 'react';
import { Button, Form, Image, Input, InputNumber, Select, Tabs } from 'antd';
import type { FormInstance } from 'antd/es/form';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import { formatMoney } from '@/utils/format';

interface CuttingBomMaterialModalProps {
  open: boolean;
  materialTab: 'select' | 'create';
  onTabChange: (tab: 'select' | 'create') => void;
  materialKeyword: string;
  onKeywordChange: (keyword: string) => void;
  onSearch: () => void;
  materialLoading: boolean;
  materialList: Record<string, unknown>[];
  materialTotal: number;
  materialPage: number;
  materialPageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  materialCreateForm: FormInstance;
  onUseMaterial: (record: Record<string, unknown>) => Promise<void> | void;
  onCreateMaterial: (values: Record<string, unknown>) => Promise<void> | void;
  onClose: () => void;
}

const CuttingBomMaterialModal: React.FC<CuttingBomMaterialModalProps> = ({
  open,
  materialTab,
  onTabChange,
  materialKeyword,
  onKeywordChange,
  onSearch,
  materialLoading,
  materialList,
  materialTotal,
  materialPage,
  materialPageSize,
  onPageChange,
  materialCreateForm,
  onUseMaterial,
  onCreateMaterial,
  onClose,
}) => (
  <ResizableModal
    title="面辅料选择"
    open={open}
    onCancel={onClose}
    footer={null}
    width="85vw"
    destroyOnHidden
  >
    <Tabs
      activeKey={materialTab}
      onChange={(key) => onTabChange(key as 'select' | 'create')}
      items={[
        {
          key: 'select',
          label: '选择已有',
          children: (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <Input
                  value={materialKeyword}
                  onChange={(e) => onKeywordChange(e.target.value)}
                  onPressEnter={onSearch}
                  placeholder="输入物料编码/名称"
                  allowClear
                />
                <Button onClick={onSearch} loading={materialLoading}>搜索</Button>
              </div>
              <ResizableTable
                storageKey="cutting-bom-material-select"
                emptyDescription="暂无物料数据"
                loading={materialLoading}
                dataSource={materialList}
                rowKey={(record: Record<string, unknown>) => String(record.id || record.materialCode || '')}
                pagination={{
                  current: materialPage,
                  pageSize: materialPageSize,
                  total: materialTotal,
                  showTotal: (total) => `共 ${total} 条`,
                  onChange: onPageChange,
                  showSizeChanger: true,
                  pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                }}
                onRow={(record) => ({
                  onDoubleClick: async () => {
                    await onUseMaterial(record as Record<string, unknown>);
                  },
                })}
                columns={[
                  {
                    title: '图片',
                    dataIndex: 'image',
                    width: 80,
                    render: (value: unknown) => {
                      const raw = String(value || '').trim();
                      if (!raw) return null;
                      const url = getFullAuthedFileUrl(raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`);
                      return (
                        <Image
                          src={url}
                          width={40}
                          height={40}
                          style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }}
                          preview={{ src: url }}
                        />
                      );
                    },
                  },
                  { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
                  { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
                  {
                    title: '成分',
                    dataIndex: 'fabricComposition',
                    key: 'fabricComposition',
                    width: 140,
                    ellipsis: true,
                    render: (value: unknown) => String(value || '').trim() || '-',
                  },
                  {
                    title: '克重',
                    dataIndex: 'fabricWeight',
                    key: 'fabricWeight',
                    width: 90,
                    render: (value: unknown) => String(value || '').trim() || '-',
                  },
                  {
                    title: '物料类型',
                    dataIndex: 'materialType',
                    width: 90,
                    render: (value: unknown) => getMaterialTypeLabel(value),
                  },
                  { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
                  { title: '规格/幅宽', dataIndex: 'specifications', width: 120, ellipsis: true },
                  { title: '单位', dataIndex: 'unit', width: 70 },
                  {
                    title: '供应商',
                    dataIndex: 'supplierName',
                    width: 140,
                    ellipsis: true,
                    render: (_: unknown, record: Record<string, unknown>) => (
                      <SupplierNameTooltip
                        name={record.supplierName}
                        contactPerson={record.supplierContactPerson}
                        contactPhone={record.supplierContactPhone}
                      />
                    ),
                  },
                  {
                    title: '单价',
                    dataIndex: 'unitPrice',
                    width: 90,
                    render: (value: unknown) => formatMoney(Number(value || 0)),
                  },
                  {
                    title: '操作',
                    dataIndex: 'operation',
                    width: 90,
                    render: (_: unknown, record: Record<string, unknown>) => (
                      <RowActions
                        maxInline={1}
                        actions={[
                          {
                            key: 'use',
                            label: '选用',
                            title: '选用',
                            onClick: async () => { await onUseMaterial(record); },
                            primary: true,
                          },
                        ]}
                      />
                    ),
                  },
                ]}
              />
            </div>
          ),
        },
        {
          key: 'create',
          label: '新建并使用',
          children: (
            <Form form={materialCreateForm} layout="vertical" onFinish={onCreateMaterial}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
                  <Input />
                </Form.Item>
                <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
                  <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" />
                </Form.Item>
                <Form.Item name="supplierId" hidden><Input /></Form.Item>
                <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
                <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
                <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
                  <SupplierSelect
                    placeholder="选择供应商"
                    onChange={(_value, option) => {
                      const selectedOption = Array.isArray(option) ? option[0] : option;
                      if (selectedOption) {
                        materialCreateForm.setFieldsValue({
                          supplierId: selectedOption.id,
                          supplierContactPerson: selectedOption.supplierContactPerson,
                          supplierContactPhone: selectedOption.supplierContactPhone,
                        });
                      }
                    }}
                  />
                </Form.Item>
                <Form.Item name="materialType" label="物料类型" initialValue="accessory">
                  <Select
                    options={[
                      { value: 'fabric', label: 'fabric' },
                      { value: 'lining', label: 'lining' },
                      { value: 'accessory', label: 'accessory' },
                    ]}
                  />
                </Form.Item>
                <Form.Item name="color" label="颜色">
                  <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" />
                </Form.Item>
                <Form.Item name="specifications" label="规格">
                  <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" />
                </Form.Item>
                <Form.Item name="fabricComposition" label="成分">
                  <Input placeholder="如：100%棉" />
                </Form.Item>
                <Form.Item name="fabricWeight" label="克重">
                  <Input placeholder="如：220g" />
                </Form.Item>
                <Form.Item name="unitPrice" label="单价" initialValue={0}>
                  <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="¥" />
                </Form.Item>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea rows={3} placeholder="请输入备注" />
                </Form.Item>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={onClose}>取消</Button>
                <Button type="primary" htmlType="submit">创建并填入</Button>
              </div>
            </Form>
          ),
        },
      ]}
    />
  </ResizableModal>
);

export default CuttingBomMaterialModal;
