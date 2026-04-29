import React, { useState, useEffect, useCallback } from 'react';
import { Button, Space, Tag, Alert, Form, Input, Select, InputNumber, Popconfirm, DatePicker } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import { ModalFieldRow } from '@/components/common/ModalContentLayout';
import taxConfigApi from '@/services/finance/taxConfigApi';
import { message } from '@/utils/antdStatic';

const TaxConfigTab: React.FC = () => {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await taxConfigApi.list();
      setList(Array.isArray(data) ? data : []);
    } catch { message.error('加载税率配置失败'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    if (!formOpen) { form.resetFields(); return; }
    if (!editRecord) return;
    form.setFieldsValue({
      ...editRecord,
      taxRate: editRecord.taxRate != null ? +(editRecord.taxRate * 100).toFixed(2) : undefined,
      effectiveDate: editRecord.effectiveDate ? dayjs(editRecord.effectiveDate) : undefined,
      expiryDate: editRecord.expiryDate ? dayjs(editRecord.expiryDate) : undefined,
    });
  }, [editRecord, form, formOpen]);

  const handleSave = async (vals: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...vals,
        taxRate: vals.taxRate / 100,
        effectiveDate: vals.effectiveDate ? dayjs(vals.effectiveDate).format('YYYY-MM-DD') : undefined,
        expiryDate: vals.expiryDate ? dayjs(vals.expiryDate).format('YYYY-MM-DD') : undefined,
      };
      if (editRecord?.id) await taxConfigApi.update({ ...editRecord, ...payload });
      else await taxConfigApi.create(payload);
      message.success('保存成功');
      setFormOpen(false);
      fetchList();
    } catch { message.error('保存失败'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await taxConfigApi.remove(id);
      message.success('已删除');
      fetchList();
    } catch { message.error('删除失败'); }
  };

  const columns = [
    { title: '税种名称', dataIndex: 'taxName', width: 150 },
    { title: '税种代码', dataIndex: 'taxCode', width: 120 },
    { title: '税率(%)', dataIndex: 'taxRate', width: 100, render: (v: number) => v != null ? `${(v * 100).toFixed(2)}%` : '-' },
    { title: '默认', dataIndex: 'isDefault', width: 80, render: (v: number) => v === 1 ? <Tag color="blue">默认</Tag> : '-' },
    { title: '生效日期', dataIndex: 'effectiveDate', width: 110, render: (v: string) => v || '-' },
    { title: '失效日期', dataIndex: 'expiryDate', width: 110, render: (v: string) => v || '长期有效' },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : 'default'}>{v === 'ACTIVE' ? '启用' : '停用'}</Tag> },
    {
      title: '操作', width: 120,
      render: (_: any, r: any) => (
        <Space>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => { setEditRecord(r); setFormOpen(true); }}>编辑</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        title="税率配置会参与真实税额计算"
        description="发票台账默认 VAT 税额来自这里的默认税率；建议至少维护默认 VAT、附加税等常用税码，并标清生效时间。"
      />
      <div style={{ marginBottom: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditRecord(null); setFormOpen(true); }}>新增税率</Button>
      </div>
      <ResizableTable storageKey="finance-tax-config" rowKey="id" columns={columns} dataSource={list} loading={loading} size="small" scroll={{ x: 'max-content' }} pagination={false} />
      <ResizableModal
        title={editRecord ? '编辑税率' : '新增税率'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        defaultWidth="40vw"
        defaultHeight="40vh"
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>取消</Button>,
          <Button key="ok" type="primary" loading={submitting} onClick={() => form.validateFields().then(handleSave).catch(() => {})}>保存</Button>,
        ]}
      >
        <Form form={form} layout="vertical" style={{ padding: '16px 0' }}>
          <ModalFieldRow label="税种名称"><Form.Item name="taxName" noStyle rules={[{ required: true }]}><Input /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="税种代码"><Form.Item name="taxCode" noStyle rules={[{ required: true }]}><Input placeholder="如 VAT_6 / INCOME_25" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="税率(%)"><Form.Item name="taxRate" noStyle rules={[{ required: true }]}><InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="默认税率"><Form.Item name="isDefault" noStyle initialValue={0}><Select options={[{ value: 1, label: '是' }, { value: 0, label: '否' }]} /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="生效日期"><Form.Item name="effectiveDate" noStyle><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="失效日期"><Form.Item name="expiryDate" noStyle><DatePicker style={{ width: '100%' }} format="YYYY-MM-DD" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="描述"><Form.Item name="description" noStyle><Input placeholder="如：适用一般纳税人" /></Form.Item></ModalFieldRow>
          <ModalFieldRow label="状态"><Form.Item name="status" noStyle initialValue="ACTIVE"><Select options={[{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '停用' }]} /></Form.Item></ModalFieldRow>
        </Form>
      </ResizableModal>
    </>
  );
};

export default TaxConfigTab;
