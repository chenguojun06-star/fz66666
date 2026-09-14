import React from 'react';
import { Form, Input, InputNumber, Select, Space, Button, Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { useViewport } from '@/utils/useViewport';
import { ProcessImageCell, ProcessAttachmentCell, NewRowImageUpload, NewRowAttachmentUpload } from './ProcessUploadCells';
import type { AttachmentFile } from './ProcessUploadCells';
import { NEW_ROW_KEY, statusOptions } from './useSecondaryProcessActions';
import type { SecondaryProcess } from './useSecondaryProcessActions';

const { Option } = Select;

interface ColumnContext {
  isEditing: (record: SecondaryProcess) => boolean;
  editingExtraValues: Record<string, any>;
  setEditingExtraValues: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  handleEdit: (record: SecondaryProcess) => void;
  handleDelete: (record: SecondaryProcess) => void;
  calculateTotalPrice: () => void;
  form: any;
  readOnly: boolean;
}

export function useSecondaryProcessColumns(ctx: ColumnContext) {
  const { isMobile } = useViewport();

  return [
    {
      title: '图片',
      key: 'images',
      width: 80,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (ctx.isEditing(record) && String(record.id) === NEW_ROW_KEY) {
          const pendingImgs = (ctx.editingExtraValues.pendingImages as string[]) || [];
          return (
            <NewRowImageUpload
              value={pendingImgs}
              onChange={(urls) => ctx.setEditingExtraValues(prev => ({ ...prev, pendingImages: urls }))}
            />
          );
        }
        return <ProcessImageCell record={record} readOnly={ctx.readOnly} />;
      },
    },
    {
      title: '工艺名称',
      dataIndex: 'processName',
      key: 'processName',
      width: 150,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="processName" className="u-m-0" rules={[{ required: true, message: '请输入工艺名称' }]}>
          <DictAutoComplete dictType="process_name" autoCollect placeholder="工艺名称" className="u-w-full" />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '工艺描述',
      dataIndex: 'description',
      key: 'description',
      width: 160,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="description" className="u-m-0">
          <DictAutoComplete dictType="process_description" autoCollect placeholder="工艺描述" className="u-w-full" />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 90,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="quantity" className="u-m-0" rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} controls={false} className="u-w-full" onChange={ctx.calculateTotalPrice} />
        </Form.Item>
      ) : toNumberSafe(value).toLocaleString(),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 110,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="unitPrice" className="u-m-0" rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} precision={2} prefix="¥" controls={false} className="u-w-full" onChange={ctx.calculateTotalPrice} />
        </Form.Item>
      ) : `¥${toNumberSafe(value).toFixed(2)}`,
    },
    {
      title: '总价',
      dataIndex: 'totalPrice',
      key: 'totalPrice',
      width: 110,
      align: 'right',
      render: (value: number, record: SecondaryProcess) => {
        if (ctx.isEditing(record)) {
          return (
            <Form.Item name="totalPrice" className="u-m-0">
              <InputNumber disabled precision={2} prefix="¥" controls={false} className="u-w-full" />
            </Form.Item>
          );
        }
        const total = record.totalPrice !== undefined
          ? toNumberSafe(record.totalPrice)
          : toNumberSafe(record.quantity || 0) * toNumberSafe(record.unitPrice || 0);
        return (
          <span className="u-fw-600" style={{ color: 'var(--primary-color)' }}>
            {formatMoney(total)}
          </span>
        );
      },
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 140,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="factoryName" className="u-m-0">
          <SupplierSelect
            placeholder="选择加工厂"
            onChange={(_value: any, option: any) => {
              if (option) {
                ctx.setEditingExtraValues(prev => ({
                  ...prev,
                  factoryId: option.id,
                  factoryContactPerson: option.supplierContactPerson,
                  factoryContactPhone: option.supplierContactPhone,
                }));
              }
            }}
          />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string, record: SecondaryProcess) => {
        if (ctx.isEditing(record)) {
          return (
            <Form.Item name="status" className="u-m-0" rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="状态" className="u-w-full">
                {statusOptions.map(opt => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            </Form.Item>
          );
        }
        const option = statusOptions.find(opt => opt.value === value);
        return option ? <Tag color={option.color}>{option.label}</Tag> : <Tag>{value || '-'}</Tag>;
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (text: string, record: SecondaryProcess) => ctx.isEditing(record) ? (
        <Form.Item name="remark" className="u-m-0">
          <Input.TextArea placeholder="备注" rows={2} />
        </Form.Item>
      ) : (text || '-'),
    },
    {
      title: '附件',
      key: 'attachments',
      width: 60,
      align: 'center' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (ctx.isEditing(record) && String(record.id) === NEW_ROW_KEY) {
          const pendingAtts = (ctx.editingExtraValues.pendingAttachments as AttachmentFile[]) || [];
          return (
            <NewRowAttachmentUpload
              value={pendingAtts}
              onChange={(files) => ctx.setEditingExtraValues(prev => ({ ...prev, pendingAttachments: files }))}
            />
          );
        }
        return <ProcessAttachmentCell record={record} readOnly={ctx.readOnly} />;
      },
    },
    {
      title: '领取人',
      dataIndex: 'assignee',
      key: 'assignee',
      width: 100,
      ellipsis: true,
      render: (text: string) => text || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 140,
      render: (text: string) => formatDateTime(text) || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 140,
      render: (text: string) => formatDateTime(text) || '-',
    },
    ...(!ctx.readOnly ? [{
      title: '操作',
      key: 'action',
      width: 140,
      fixed: isMobile ? undefined : 'right' as const,
      render: (_: any, record: SecondaryProcess) => {
        if (ctx.isEditing(record)) {
          return (
            <Space>
              <Button type="link" onClick={ctx.handleSave} className="u-p-04px">
                保存
              </Button>
              <Button type="link" onClick={ctx.handleCancel} className="u-p-04px">
                取消
              </Button>
            </Space>
          );
        }
        return (
          <RowActions
            actions={[
              { key: 'edit', label: '编辑', onClick: () => ctx.handleEdit(record) },
              { key: 'delete', label: '删除', danger: true, onClick: () => ctx.handleDelete(record) },
            ]}
          />
        );
      },
    }] : []),
  ];
}
