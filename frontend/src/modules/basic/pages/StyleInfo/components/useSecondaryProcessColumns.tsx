import { Form, Input, InputNumber, Select, Space, Button, Tag } from 'antd';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
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
        <Form.Item name="processName" style={{ margin: 0 }} rules={[{ required: true, message: '请输入工艺名称' }]}>
          <DictAutoComplete dictType="process_name" autoCollect placeholder="工艺名称" style={{ width: '100%' }} />
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
        <Form.Item name="description" style={{ margin: 0 }}>
          <DictAutoComplete dictType="process_description" autoCollect placeholder="工艺描述" style={{ width: '100%' }} />
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
        <Form.Item name="quantity" style={{ margin: 0 }} rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} style={{ width: '100%' }} onChange={ctx.calculateTotalPrice} />
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
        <Form.Item name="unitPrice" style={{ margin: 0 }} rules={[{ required: true, message: '请输入' }]}>
          <InputNumber min={0} precision={2} prefix="¥" style={{ width: '100%' }} onChange={ctx.calculateTotalPrice} />
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
            <Form.Item name="totalPrice" style={{ margin: 0 }}>
              <InputNumber disabled precision={2} prefix="¥" style={{ width: '100%' }} />
            </Form.Item>
          );
        }
        const total = record.totalPrice !== undefined
          ? toNumberSafe(record.totalPrice)
          : toNumberSafe(record.quantity || 0) * toNumberSafe(record.unitPrice || 0);
        return (
          <span style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            ¥{total.toFixed(2)}
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
        <Form.Item name="factoryName" style={{ margin: 0 }}>
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
            <Form.Item name="status" style={{ margin: 0 }} rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="状态" style={{ width: '100%' }}>
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
        <Form.Item name="remark" style={{ margin: 0 }}>
          <Input placeholder="备注" />
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
              <Button type="link" size="small" onClick={ctx.handleSave} style={{ padding: '0 4px' }}>
                保存
              </Button>
              <Button type="link" size="small" onClick={ctx.handleCancel} style={{ padding: '0 4px' }}>
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
