import React, { useEffect, useState } from 'react';
import { Col, Form, Input, Row, Select } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { customerApi, type Customer } from '@/services/crm/customerApi';
import { message } from '@/utils/antdStatic';
import { CUSTOMER_LEVEL_OPTIONS, CUSTOMER_FORM_STATUS_OPTIONS } from '../helpers';

interface CustomerFormModalProps {
  open: boolean;
  editData: Customer | null;
  onClose: () => void;
  onSuccess: () => void;
}

// 新建/编辑客户表单弹窗
const CustomerFormModal: React.FC<CustomerFormModalProps> = ({ open, editData, onClose, onSuccess }) => {
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue(editData ?? { status: 'ACTIVE', customerLevel: 'NORMAL' });
    } else {
      form.resetFields();
    }
  }, [open, editData, form]);

  const handleOk = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editData?.id) {
        await customerApi.update(editData.id, values);
        message.success('更新成功');
      } else {
        await customerApi.create(values);
        message.success('新建成功');
      }
      onSuccess();
      onClose();
    } catch {
      message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResizableModal
      title={editData?.id ? '编辑客户' : '新建客户'}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={saving}
      width="40vw"
      destroyOnHidden
    >
      <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="companyName" label="公司名称" rules={[{ required: true, message: '请输入公司名称' }]}>
              <Input placeholder="请输入客户公司名称" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="customerLevel" label="客户等级">
              <Select options={CUSTOMER_LEVEL_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contactPerson" label="联系人">
              <Input placeholder="对接人姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="contactPhone" label="联系电话">
              <Input placeholder="手机号或座机" />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="contactEmail" label="邮箱">
              <Input placeholder="电子邮箱" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="industry" label="所属行业">
              <Input placeholder="如：服装、家纺" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="address" label="地址">
          <Input placeholder="公司地址" />
        </Form.Item>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item name="source" label="客户来源">
              <Input placeholder="如：转介绍、展会、网络" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item name="status" label="状态">
              <Select options={CUSTOMER_FORM_STATUS_OPTIONS} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} placeholder="其他备注信息" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default CustomerFormModal;
