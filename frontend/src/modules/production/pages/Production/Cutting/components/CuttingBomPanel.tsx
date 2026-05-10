import React, { useCallback, useState } from 'react';
import { Button, Card, Form, Image, Input, InputNumber, Select, Space, Tabs } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import type { CuttingBomRow } from '../hooks/useCuttingBom';

interface CuttingBomPanelProps {
  bomList: CuttingBomRow[];
  bomLoading: boolean;
  bomEditing: boolean;
  bomSaving: boolean;
  canEdit: boolean;
  isBundled: boolean;
  materialModalOpen: boolean;
  onSetEditing: (v: boolean) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onUpdateRow: (id: string, field: string, value: any) => void;
  onSave: () => void;
  onDelete: (id: string) => void;
  onOpenMaterialModal: (rowId: string) => void;
  onUseMaterial: (record: Record<string, unknown>) => Promise<void> | void;
  onCreateMaterial: (values: Record<string, unknown>) => Promise<void> | void;
  onSetMaterialModalOpen: (v: boolean) => void;
}

const CuttingBomPanel: React.FC<CuttingBomPanelProps> = ({
  bomList,
  bomLoading,
  bomEditing,
  bomSaving,
  canEdit,
  isBundled,
  materialModalOpen,
  onSetEditing,
  onAddRow,
  onRemoveRow,
  onUpdateRow,
  onSave,
  onDelete,
  onOpenMaterialModal,
  onUseMaterial,
  onCreateMaterial,
  onSetMaterialModalOpen,
}) => {
  const [materialTab, setMaterialTab] = useState<'select' | 'create'>('select');
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);
  const [materialCreateForm] = Form.useForm();

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await apiGetMaterialList(materialKeyword, materialPage, materialPageSize);
      if (res.code === 200) {
        setMaterialList(res.data?.records || []);
        setMaterialTotal(res.data?.total || 0);
      }
    } catch { /* ignore */ }
    finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  React.useEffect(() => {
    if (materialModalOpen) {
      handleSearchMaterial();
    }
  }, [materialModalOpen, materialPage, materialPageSize]);

  const columns = [
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
            size="small"
            onChange={(e) => onUpdateRow(record.id!, 'materialCode', e.target.value)}
            onClick={() => onOpenMaterialModal(record.id!)}
            placeholder="点击选用"
            readOnly
            style={{ cursor: 'pointer' }}
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
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
            size="small"
            min={0}
            precision={2}
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
            size="small"
            min={0}
            max={100}
            precision={1}
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
            size="small"
            min={0}
            precision={2}
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
            size="small"
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
                          onClick: () => onDelete(record.id!),
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

  return (
    <Card
      size="small"
      title="面辅料信息"
      className="cutting-entry-purchase-card"
      style={{ marginTop: 12 }}
      loading={bomLoading}
      extra={
        canEdit ? (
          <Space>
            {bomEditing ? (
              <>
                <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={onAddRow}>
                  添加物料
                </Button>
                <Button size="small" type="primary" loading={bomSaving} onClick={onSave}>
                  保存
                </Button>
                <Button size="small" onClick={() => onSetEditing(false)}>
                  取消
                </Button>
              </>
            ) : (
              <Button size="small" type="primary" onClick={() => onSetEditing(true)}>
                编辑
              </Button>
            )}
          </Space>
        ) : isBundled ? (
          <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>裁剪已完成，不可修改</span>
        ) : null
      }
    >
      {bomList.length === 0 && !bomEditing ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--color-text-quaternary)' }}>
          暂无面辅料信息
          {canEdit && (
            <Button type="link" size="small" onClick={() => { onAddRow(); onSetEditing(true); }}>
              添加面辅料
            </Button>
          )}
        </div>
      ) : (
        <ResizableTable
          storageKey="cutting-bom-table"
          columns={columns as any}
          dataSource={bomList}
          rowKey={(r: CuttingBomRow) => r.id || `${r.materialCode}-${r.materialName}`}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      )}

      <CuttingBomMaterialModal
        open={materialModalOpen}
        materialTab={materialTab}
        onTabChange={setMaterialTab}
        materialKeyword={materialKeyword}
        onKeywordChange={setMaterialKeyword}
        onSearch={handleSearchMaterial}
        materialLoading={materialLoading}
        materialList={materialList}
        materialTotal={materialTotal}
        materialPage={materialPage}
        materialPageSize={materialPageSize}
        onPageChange={(page, pageSize) => { setMaterialPage(page); setMaterialPageSize(pageSize); }}
        materialCreateForm={materialCreateForm}
        onUseMaterial={onUseMaterial}
        onCreateMaterial={onCreateMaterial}
        onClose={() => onSetMaterialModalOpen(false)}
      />
    </Card>
  );
};

async function apiGetMaterialList(keyword: string, page: number, pageSize: number) {
  const { default: api } = await import('@/utils/api');
  return api.get('/material/database/list', {
    params: { keyword, page, pageSize, status: 'completed' },
  });
}

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
    width="60vw"
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
                size="small"
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
                    render: (value: unknown) => `¥${Number(value || 0).toFixed(2)}`,
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
                  <Input />
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

export default CuttingBomPanel;
