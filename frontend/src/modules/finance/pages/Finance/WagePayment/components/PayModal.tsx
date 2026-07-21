import React from 'react';
import {
  Button,
  Card,
  Descriptions,
  Form,
  Image,
  Input,
  InputNumber,
  Select,
  Space,
  Tag,
} from 'antd';
import { DollarOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import {
  PAYMENT_METHOD_OPTIONS,
  OWNER_TYPE_OPTIONS,
  BIZ_TYPE_MAP,
  BIZ_TYPE_OPTIONS,
} from '@/services/finance/wagePaymentApi';
import { methodIconMap, accountTypeIconMap } from '../hooks/usePaymentColumns';

interface PayModalProps {
  payModalOpen: boolean;
  setPayModalOpen: (open: boolean) => void;
  currentPayable: any;
  payForm: any;
  paySubmitting: boolean;
  payeeSearching: boolean;
  payeeOptions: any[];
  selectedMethod: string;
  selectedAccount: any;
  handlePaySubmit: () => void;
  handlePayeeTypeChange: (v: any) => void;
  handlePayeeSearch: (v: string) => void;
  handlePayeeSelect: (v: any) => void;
  handleMethodSelect: (v: string) => void;
  openAccountModal: (ownerType: string, ownerId: string, ownerName: string) => void;
}

const PayModal: React.FC<PayModalProps> = ({
  payModalOpen,
  setPayModalOpen,
  currentPayable,
  payForm,
  paySubmitting,
  payeeSearching,
  payeeOptions,
  selectedMethod,
  selectedAccount,
  handlePaySubmit,
  handlePayeeTypeChange,
  handlePayeeSearch,
  handlePayeeSelect,
  handleMethodSelect,
  openAccountModal,
}) => {
  return (
    <ResizableModal
      open={payModalOpen}
      title={currentPayable
        ? `付款 — ${BIZ_TYPE_MAP[currentPayable.bizType]?.text ?? ''} · ${currentPayable.bizNo}`
        : '手动发起支付'
      }
      onCancel={() => setPayModalOpen(false)}
      width="40vw"
      centered
      footer={
        <Space>
          <Button onClick={() => setPayModalOpen(false)}>取消</Button>
          <Button type="primary" loading={paySubmitting} onClick={handlePaySubmit} icon={<DollarOutlined />}>
            确认支付
          </Button>
        </Space>
      }
    >
      <div style={{ padding: '0 8px' }}>
        {/* 业务信息提示 */}
        {currentPayable && (
          <Card style={{ marginBottom: 16, background: '#f6ffed', border: '1px solid #b7eb8f' }}>
            <Descriptions column={2}>
              <Descriptions.Item label="业务类型">
                <Tag color={BIZ_TYPE_MAP[currentPayable.bizType]?.color}>
                  {BIZ_TYPE_MAP[currentPayable.bizType]?.text}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="单据编号">{currentPayable.bizNo}</Descriptions.Item>
              <Descriptions.Item label="收款方">{currentPayable.payeeName}</Descriptions.Item>
              <Descriptions.Item label="应付金额">
                <span style={{ fontWeight: 600, color: 'var(--color-error)' }}>{formatMoney(currentPayable.amount)}</span>
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}

        <Form form={payForm} layout="vertical" requiredMark="optional">
          {!currentPayable && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item label="收款方类型" name="payeeType" rules={[{ required: true, message: '请选择收款方类型' }]}>
                  <Select options={OWNER_TYPE_OPTIONS} onChange={handlePayeeTypeChange} placeholder="选择员工或工厂" />
                </Form.Item>
                <Form.Item label="收款方" name="payeeId" rules={[{ required: true, message: '请搜索选择收款方' }]}>
                  <Select
                    showSearch
                    filterOption={false}
                    onSearch={handlePayeeSearch}
                    onChange={handlePayeeSelect}
                    loading={payeeSearching}
                    placeholder="输入姓名/工厂名搜索"
                    notFoundContent={payeeSearching ? '搜索中...' : '无匹配结果'}
                  >
                    {payeeOptions.map(p => (
                      <Select.Option key={p.id} value={p.id}>
                        <span>{p.name}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8, fontSize: 14 }}>[{p.label}]{p.phone ? ` ${p.phone}` : ''}</span>
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>
              </div>
              <Form.Item name="payeeName" hidden><Input /></Form.Item>
              <Form.Item label="业务类型" name="bizType">
                <Select allowClear placeholder="可选">
                  {BIZ_TYPE_OPTIONS.filter(o => o.value).map(o => (
                    <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </>
          )}

          <Form.Item label="支付金额" name="amount" rules={[{ required: true, message: '请输入支付金额' }]}>
            <InputNumber prefix="¥" min={0.01} precision={2} style={{ width: '100%' }} placeholder="支付金额" />
          </Form.Item>

          <Form.Item name="paymentMethod" hidden><Input /></Form.Item>
          {/* 支付方式选择卡片 */}
          <Form.Item label="选择支付方式" required>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {PAYMENT_METHOD_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => handleMethodSelect(opt.value)}
                  style={{
                    border: `2px solid ${selectedMethod === opt.value ? 'var(--primary-color, var(--color-primary))' : 'var(--color-border-antd)'}`,
                    borderRadius: 8,
                    padding: '16px 12px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    background: selectedMethod === opt.value ? 'rgba(22,119,255,0.04)' : 'var(--color-bg-base)',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{ fontSize: 16, marginBottom: 4 }}>{methodIconMap[opt.value]}</div>
                  <div style={{ fontWeight: 500 }}>{opt.label}</div>
                </div>
              ))}
            </div>
          </Form.Item>

          {/* 显示选中的收款账户信息 */}
          {selectedMethod && selectedMethod !== 'OFFLINE' && (
            <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>
                收款账户
                <Button
                  type="link"

                  onClick={() => {
                    const pt = payForm.getFieldValue('payeeType');
                    const pi = payForm.getFieldValue('payeeId');
                    const pn = payForm.getFieldValue('payeeName');
                    if (pt && pi) openAccountModal(pt, pi, pn || '');
                  }}
                >
                  管理账户
                </Button>
              </div>
              {selectedAccount ? (
                <div>
                  {selectedAccount.accountType === 'BANK' ? (
                    <Space orientation="vertical" size={2}>
                      <span>{accountTypeIconMap[selectedAccount.accountType]} {selectedAccount.bankName}</span>
                      <span style={{ fontFamily: 'monospace' }}>
                        {selectedAccount.accountNo?.replace(/(\d{4})(?=\d)/g, '$1 ')}
                      </span>
                      <span style={{ color: 'var(--color-text-tertiary)' }}>{selectedAccount.accountName}</span>
                    </Space>
                  ) : (
                    <div style={{ textAlign: 'center' }}>
                      {selectedAccount.qrCodeUrl ? (
                        <Image src={getFullAuthedFileUrl(selectedAccount.qrCodeUrl)} width={200} alt="收款二维码" />
                      ) : (
                        <span style={{ color: 'var(--color-danger)' }}>该账户未上传收款二维码</span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <span style={{ color: 'var(--color-warning)' }}>
                  收款方暂无{selectedMethod === 'BANK' ? '银行卡' : selectedMethod === 'WECHAT' ? '微信' : '支付宝'}账户，
                  <Button type="link" style={{ padding: 0, height: 'auto', fontSize: 'inherit' }} onClick={() => {
                    const pt = payForm.getFieldValue('payeeType');
                    const pi = payForm.getFieldValue('payeeId');
                    const pn = payForm.getFieldValue('payeeName');
                    if (pt && pi) openAccountModal(pt, pi, pn || '');
                  }}>点击添加</Button>
                </span>
              )}
            </div>
          )}

          <Form.Item name="paymentAccountId" hidden><Input /></Form.Item>
          {currentPayable && <Form.Item name="bizType" hidden><Input /></Form.Item>}
          <Form.Item name="bizId" hidden><Input /></Form.Item>
          <Form.Item name="bizNo" hidden><Input /></Form.Item>
          {currentPayable && (
            <>
              <Form.Item name="payeeType" hidden><Input /></Form.Item>
              <Form.Item name="payeeId" hidden><Input /></Form.Item>
              <Form.Item name="payeeName" hidden><Input /></Form.Item>
            </>
          )}

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="支付备注" />
          </Form.Item>
        </Form>
      </div>
    </ResizableModal>
  );
};

export default PayModal;
