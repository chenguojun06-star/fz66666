import React from 'react';
import { Form, Input, Button, Select, InputNumber, Tag, Modal, Space } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { StyleBom } from '@/types/style';
import RowActions from '@/components/common/RowActions';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';
import { getMaterialTypeLabel } from '@/utils/materialType';

export type MaterialType = NonNullable<StyleBom['materialType']>;

export const materialTypeOptions = [
  { value: 'fabricA', label: '面料A' },
  { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' },
  { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' },
  { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' },
  { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' },
  { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
] as const satisfies ReadonlyArray<{ value: MaterialType; label: string }>;

interface UseBomColumnsProps {
  locked: boolean;
  tableEditable: boolean;
  editingKey: string;
  data: StyleBom[];
  form: FormInstance;
  isEditing: (record: StyleBom) => boolean;
  rowName: (id: unknown, field: string) => string[];
  save: (key: string) => Promise<void>;
  cancel: () => void;
  edit: (record: StyleBom) => void;
  handleDelete: (id: unknown) => void;
  fetchMaterials: (page: number, keyword?: string) => Promise<void>;
  materialCreateForm: FormInstance;
  calcTotalPrice: (item: Partial<StyleBom>) => number;
  isSupervisorOrAbove: boolean;
  setMaterialKeyword: (v: string) => void;
  setMaterialModalOpen: (v: boolean) => void;
  setMaterialTab: (v: 'select' | 'create') => void;
  setMaterialTargetRowId: (v: string) => void;
}

export function useBomColumns({
  locked,
  tableEditable,
  editingKey,
  data,
  form,
  isEditing,
  rowName,
  save,
  cancel,
  edit,
  handleDelete,
  fetchMaterials,
  materialCreateForm,
  calcTotalPrice,
  isSupervisorOrAbove,
  setMaterialKeyword,
  setMaterialModalOpen,
  setMaterialTab,
  setMaterialTargetRowId,
}: UseBomColumnsProps) {
  const columns = [
    {
      title: '面料辅料类型',
      dataIndex: 'materialType',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const label = getMaterialTypeLabel(text);
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialType')} style={{ margin: 0 }}>
              <Select
                options={materialTypeOptions as any}
                style={{ width: '100%' }}
              />
            </Form.Item>
          );
        }
        return label;
      }
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <div style={{ display: 'flex', gap: 4 }}>
              <Form.Item name={rowName(record.id, 'materialCode')} style={{ margin: 0, flex: 1 }} rules={[{ required: true, message: '必填' }]}>
                <Input placeholder="输入编码或点击选择→" />
              </Form.Item>
              <Button
                size="small"
                onClick={() => {
                  setMaterialTargetRowId(String(record.id));
                  setMaterialTab('select');
                  setMaterialKeyword('');
                  setMaterialModalOpen(true);
                  materialCreateForm.resetFields();
                  fetchMaterials(1, '');
                }}
                style={{ flexShrink: 0 }}
              >
                选择
              </Button>
            </div>
          );
        }
        return text;
      }
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 140,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'materialName')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <Input />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '颜色',
      dataIndex: 'color',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'color')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '规格(cm)',
      dataIndex: 'specification',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'specification')} style={{ margin: 0 }}>
              <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      width: 120,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'usageAmount')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} step={0.01} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        // 用量异常检测：与同类型面料的平均用量对比，偏差>20%时标警告
        const sameTypeRows = data.filter(r => r.materialType === record.materialType && typeof r.usageAmount === 'number' && r.usageAmount > 0);
        const anomalyEl = (() => {
          if (sameTypeRows.length < 2 || !text || text <= 0) return null;
          const avg = sameTypeRows.reduce((s, r) => s + r.usageAmount, 0) / sameTypeRows.length;
          const deviation = Math.abs(text - avg) / avg;
          if (deviation <= 0.2) return null;
          const pct = Math.round(deviation * 100);
          const isHigh = text > avg;
          return (
            <span title={`同类面料平均用量 ${avg.toFixed(2)}，偏差 ${pct}%`}
              style={{ marginLeft: 6, color: '#fa8c16', cursor: 'help', fontSize: 12 }}>
              ⚠️{isHigh ? `+${pct}%` : `-${pct}%`}
            </span>
          );
        })();
        return <span>{text}{anomalyEl}</span>;
      }
    },
    {
      title: '损耗率(%)',
      dataIndex: 'lossRate',
      width: 100,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'lossRate')} style={{ margin: 0 }}>
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `${text}%`;
      }
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 110,
      editable: true,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unitPrice')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <InputNumber min={0} step={0.01} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        return `¥${Number(text || 0).toFixed(2)}`;
      }
    },
    {
      title: '小计',
      dataIndex: 'totalPrice',
      width: 110,
      render: (text: number, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          const rid = String(record.id);
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prev, next) =>
                JSON.stringify(prev?.[rid]) !== JSON.stringify(next?.[rid])
              }
            >
              {() => {
                const row = form.getFieldValue(rid) || {};
                const base = { ...record, ...row };
                const value = calcTotalPrice(base);
                return `¥${Number(value || 0).toFixed(2)}`;
              }}
            </Form.Item>
          );
        }

        const value = Number.isFinite(Number(text)) ? Number(text) : calcTotalPrice(record);
        return `¥${Number(value || 0).toFixed(2)}`;
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <Form.Item name={rowName(record.id, 'unit')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
              <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" />
            </Form.Item>
          );
        }
        return text;
      }
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        if (!locked && (tableEditable || isEditing(record))) {
          return (
            <>
              <Form.Item name={rowName(record.id, 'supplierId')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplierContactPerson')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplierContactPhone')} hidden>
                <Input />
              </Form.Item>
              <Form.Item name={rowName(record.id, 'supplier')} style={{ margin: 0 }} rules={[{ required: true, message: '必填' }]}>
                <SupplierSelect
                  placeholder="选择供应商"
                  onChange={(value, option) => {
                    if (option) {
                      form.setFieldsValue({
                        [rowName(record.id, 'supplierId') as any]: option.id,
                        [rowName(record.id, 'supplierContactPerson') as any]: option.supplierContactPerson,
                        [rowName(record.id, 'supplierContactPhone') as any]: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </>
          );
        }
        return text;
      }
    },
    {
      title: '库存状态',
      dataIndex: 'stockStatus',
      width: 110,
      render: (status: string, record: StyleBom) => {
        if (!status) {
          return <Tag color="default">未检查</Tag>;
        }

        const statusConfig: Record<string, { color: string; text: string }> = {
          sufficient: { color: 'success', text: '库存充足' },
          insufficient: { color: 'warning', text: '库存不足' },
          none: { color: 'error', text: '无库存' },
          unchecked: { color: 'default', text: '未检查' },
        };

        const config = statusConfig[status] || { color: 'default', text: '未知' };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Tag color={config.color}>{config.text}</Tag>
            {status === 'insufficient' || status === 'none' ? (
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--color-danger)' }}>
                需采购: {record.requiredPurchase || 0}
              </span>
            ) : null}
            {status === 'sufficient' && record.availableStock !== undefined ? (
              <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--color-success)' }}>
                可用: {record.availableStock}
              </span>
            ) : null}
          </div>
        );
      }
    },
    {
      title: '操作',
      dataIndex: 'operation',
      width: 110,
      resizable: false,
      render: (_: unknown, record: StyleBom) => {
        if (locked) {
          return (
            <Space>
              <Tag color="default">已完成</Tag>
              <span style={{ color: 'var(--neutral-text-lighter)' }}>无法操作</span>
            </Space>
          );
        }
        if (tableEditable) {
          return (
            <RowActions
              maxInline={1}
              actions={[
                {
                  key: 'delete',
                  label: '删除',
                  title: '删除',
                  danger: true,
                  onClick: () => {
                    Modal.confirm({
                      title: '确定删除?',
                      onOk: () => handleDelete(record.id!),
                    });
                  },
                },
              ]}
            />
          );
        }

        if (!isSupervisorOrAbove) {
          return null;
        }

        const editable = isEditing(record);
        return editable ? (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'save',
                label: '保存',
                title: '保存',
                onClick: () => save(String(record.id!)),
                primary: true,
              },
              {
                key: 'cancel',
                label: '取消',
                title: '取消',
                onClick: () => {
                  Modal.confirm({
                    title: '确定取消?',
                    onOk: cancel,
                  });
                },
              },
            ]}
          />
        ) : (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: '编辑',
                disabled: editingKey !== '',
                onClick: () => edit(record),
                primary: true,
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true,
                disabled: editingKey !== '',
                onClick: () => {
                  Modal.confirm({
                    title: '确定删除?',
                    onOk: () => handleDelete(record.id!),
                  });
                },
              },
            ]}
          />
        );
      },
    },
  ];

  return columns;
}
