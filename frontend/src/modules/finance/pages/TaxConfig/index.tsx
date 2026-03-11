import React, { useCallback, useEffect, useState } from 'react';
import {
  App, Button, Card, DatePicker, Form, Input, InputNumber,
  Select, Space, Switch, Tag, Popconfirm,
} from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import {
  taxConfigApi,
  TAX_TYPES,
  type TaxConfig,
} from '@/services/finance/taxConfigApi';

const typeLabel = (val: string) => TAX_TYPES.find(t => t.value === val)?.label || val;

const TaxConfigPage: React.FC = () => {
  const { message } = App.useApp();
  const [list, setList] = useState<TaxConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<TaxConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await taxConfigApi.getList({});
      if (res.code === 200 && res.data) {
        const records: TaxConfig[] = res.data.records || res.data || [];
        setList(records);
      }
    } catch (err: any) {
      message.error(`加载税率列表失败: ${err?.message || '请检查网络'}`);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleCreate = () => {
    setEditingRecord(null);
    form.resetFields();
    form.setFieldsValue({ enabled: true });
    setFormOpen(true);
  };

  const handleEdit = (record: TaxConfig) => {
    setEditingRecord(record);
    form.setFieldsValue({
      ...record,
      effectiveDate: record.effectiveDate ? dayjs(record.effectiveDate) : undefined,
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const data = {
        ...values,
        effectiveDate: values.effectiveDate?.format('YYYY-MM-DD'),
      };
      if (editingRecord?.id) {
        await taxConfigApi.update({ ...data, id: editingRecord.id });
        message.success('更新成功');
      } else {
        await taxConfigApi.create(data);
        message.success('创建成功');
      }
      setFormOpen(false);
      fetchList();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(`保存失败: ${err?.message || '请重试'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await taxConfigApi.delete(id);
      message.success('删除成功');
      fetchList();
    } catch (err: any) {
      message.error(`删除失败: ${err?.message || '请重试'}`);
    }
  };

  const columns: ColumnsType<TaxConfig> = [
    { title: '税种名称', dataIndex: 'taxName', width: 160 },
    { title: '税种类型', dataIndex: 'taxType', width: 120, render: typeLabel },
    {
      title: '税率', dataIndex: 'taxRate', width: 100,
      render: (v: number) => `${(v || 0).toFixed(2)}%`,
    },
    { title: '说明', dataIndex: 'description', width: 200, ellipsis: true },
    { title: '生效日期', dataIndex: 'effectiveDate', width: 120 },
    {
      title: '状态', dataIndex: 'enabled', width: 80,
      render: (v: boolean) => v ? <Tag color="green">启用</Tag> : <Tag color="default">停用</Tag>,
    },
    { title: '更新时间', dataIndex: 'updateTime', width: 160, render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right',
      render: (_: unknown, record: TaxConfig) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(record.id!)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Layout>
      <Card
        title="税率配置"
        extra={<Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>新增税率</Button>}
      >
        <ResizableTable
          columns={columns}
          dataSource={list}
          rowKey="id"
          loading={loading}
          scroll={{ x: 900 }}
          pagination={false}
        />
      </Card>

      <ResizableModal
        open={formOpen}
        title={editingRecord ? '编辑税率' : '新增税率'}
        onCancel={() => setFormOpen(false)}
        onOk={handleSubmit}
        confirmLoading={submitting}
        defaultWidth="40vw"
        defaultHeight="50vh"
      >
        <Form form={form} layout="vertical">
          <ModalFieldRow label="税种名称">
            <Form.Item name="taxName" rules={[{ required: true, message: '请输入税种名称' }]} noStyle>
              <Input placeholder="如：增值税13%" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税种类型">
            <Form.Item name="taxType" rules={[{ required: true, message: '请选择税种类型' }]} noStyle>
              <Select options={TAX_TYPES.map(t => ({ value: t.value, label: t.label }))} placeholder="请选择" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="税率(%)">
            <Form.Item name="taxRate" rules={[{ required: true, message: '请输入税率' }]} noStyle>
              <InputNumber style={{ width: '100%' }} min={0} max={100} precision={4} placeholder="如 13.00" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="生效日期">
            <Form.Item name="effectiveDate" noStyle>
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="说明">
            <Form.Item name="description" noStyle>
              <Input.TextArea rows={2} placeholder="税种说明" />
            </Form.Item>
          </ModalFieldRow>
          <ModalFieldRow label="是否启用">
            <Form.Item name="enabled" valuePropName="checked" noStyle>
              <Switch checkedChildren="启用" unCheckedChildren="停用" />
            </Form.Item>
          </ModalFieldRow>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default TaxConfigPage;
