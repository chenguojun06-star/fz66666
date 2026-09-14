/**
 * 申请发票弹窗
 * 展示当前账单摘要 + 发票信息表单（抬头/税号/银行/地址等）
 */
import React from 'react';
import { Form, Input, Descriptions } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';

interface Props {
  open: boolean;
  currentBill: any;
  form: FormInstance;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

const InvoiceModal: React.FC<Props> = ({ open, currentBill, form, submitting, onClose, onSubmit }) => {
  return (
    <ResizableModal
      title="申请发票"
      open={open}
      onOk={onSubmit}
      onCancel={onClose}
      okText="提交申请"
      width="40vw"
      confirmLoading={submitting}
    >
      {currentBill && (
        <Descriptions column={2} style={{ marginBottom: 16 }}>
          <Descriptions.Item label="账单编号">{currentBill.billingNo}</Descriptions.Item>
          <Descriptions.Item label="金额">{formatMoney(currentBill.totalAmount)}</Descriptions.Item>
        </Descriptions>
      )}
      <Form form={form} layout="vertical">
        <Form.Item name="invoiceTitle" label="发票抬头" rules={[{ required: true, message: '请输入发票抬头' }]}>
          <Input placeholder="公司全称" />
        </Form.Item>
        <Form.Item name="invoiceTaxNo" label="纳税人识别号" rules={[{ required: true, message: '请输入纳税人识别号' }]}>
          <Input placeholder="统一社会信用代码" />
        </Form.Item>
        <Form.Item name="invoiceBankName" label="开户银行">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="invoiceBankAccount" label="银行账号">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="invoiceAddress" label="注册地址">
          <Input placeholder="选填" />
        </Form.Item>
        <Form.Item name="invoicePhone" label="注册电话">
          <Input placeholder="选填" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default InvoiceModal;
