/**
 * 默认开票信息弹窗
 * 维护租户默认发票信息，每次申请发票时自动填充
 */
import React from 'react';
import { Form, Input } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

interface Props {
  open: boolean;
  form: FormInstance;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

const InvoiceInfoModal: React.FC<Props> = ({ open, form, submitting, onClose, onSubmit }) => {
  return (
    <ResizableModal
      title="默认开票信息"
      open={open}
      onOk={onSubmit}
      onCancel={onClose}
      okText="保存"
      width="40vw"
      confirmLoading={submitting}
    >
      <div style={{ marginBottom: 12, color: 'var(--text-secondary)' }}>
        设置后，每次申请发票时会自动填充以下信息
      </div>
      <Form form={form} layout="vertical">
        <Form.Item name="invoiceTitle" label="发票抬头">
          <Input placeholder="公司全称" />
        </Form.Item>
        <Form.Item name="invoiceTaxNo" label="纳税人识别号">
          <Input placeholder="统一社会信用代码" />
        </Form.Item>
        <Form.Item name="invoiceBankName" label="开户银行">
          <Input placeholder="开户银行名称" />
        </Form.Item>
        <Form.Item name="invoiceBankAccount" label="银行账号">
          <Input placeholder="对公账号" />
        </Form.Item>
        <Form.Item name="invoiceAddress" label="注册地址">
          <Input placeholder="营业执照注册地址" />
        </Form.Item>
        <Form.Item name="invoicePhone" label="注册电话">
          <Input placeholder="公司电话" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default InvoiceInfoModal;
