import React from 'react';
import { Input } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import type { BillingRecord } from '@/services/tenantService';

export interface IssueInvoiceModalProps {
  bill: BillingRecord | null;
  invoiceNoValue: string;
  loading: boolean;
  onInvoiceNoChange: (value: string) => void;
  onOk: () => void;
  onCancel: () => void;
}

const IssueInvoiceModal: React.FC<IssueInvoiceModalProps> = ({
  bill,
  invoiceNoValue,
  loading,
  onInvoiceNoChange,
  onOk,
  onCancel,
}) => {
  return (
    <SmallModal
      open={!!bill}
      title={`确认开票 - ${bill?.billingNo || ''}`}
      onOk={onOk}
      onCancel={onCancel}
      okText="确认开票"
      confirmLoading={loading}
    >
      <p>租户：{bill?.tenantName}，金额：¥{bill?.totalAmount}</p>
      <p>抬头：{(bill as any)?.invoiceTitle || '—'}</p>
      <p>税号：{(bill as any)?.invoiceTaxNo || '—'}</p>
      <Input
        placeholder="请输入发票号码"
        value={invoiceNoValue}
        onChange={(e) => onInvoiceNoChange(e.target.value)}
        style={{ marginTop: 8 }}
      />
    </SmallModal>
  );
};

export default IssueInvoiceModal;
