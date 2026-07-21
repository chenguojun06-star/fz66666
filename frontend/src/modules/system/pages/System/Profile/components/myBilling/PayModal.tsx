/**
 * 快捷付款弹窗
 * 展示账单详情 + 付款方式说明 + 付款信息（带复制按钮）
 */
import React from 'react';
import { Button, Space, Descriptions, Alert, Card, Typography } from 'antd';
import { CreditCardOutlined, CopyOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import { PLAN_LABELS } from '../billingDisplay';

const { Text } = Typography;

interface Props {
  open: boolean;
  payingBill: any;
  onClose: () => void;
  onCopy: (text: string, label: string) => void;
}

const PayModal: React.FC<Props> = ({ open, payingBill, onClose, onCopy }) => {
  return (
    <ResizableModal
      title={<Space><CreditCardOutlined />立即付款</Space>}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>关闭</Button>,
      ]}
      width="40vw"
    >
      {payingBill && (
        <div>
          <Descriptions column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="账单编号" span={2}>
              <Space>
                <Text code>{payingBill.billingNo}</Text>
                <Button type="text" icon={<CopyOutlined />}
                  onClick={() => onCopy(payingBill.billingNo, '账单编号')} />
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="账期">{payingBill.billingMonth}</Descriptions.Item>
            <Descriptions.Item label="套餐">{PLAN_LABELS[payingBill.planType] ?? '未知'}</Descriptions.Item>
            <Descriptions.Item label="应付金额" span={2}>
              <Space align="center">
                <Text strong style={{ color: 'var(--color-error)', fontSize: 22 }}>
                  {formatMoney(payingBill.totalAmount)}
                </Text>
                <Button type="text" icon={<CopyOutlined />}
                  onClick={() => onCopy(String(payingBill.totalAmount?.toFixed(2)), '金额')} />
              </Space>
            </Descriptions.Item>
          </Descriptions>

          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title="付款方式"
            description="请通过银行转账或扫码向管理员付款。付款时请在备注中注明账单编号，付款完成后联系管理员确认，确认后账单状态将更新为「已支付」。"
          />

          <Card title="付款信息" style={{ marginBottom: 12 }}>
            <Descriptions column={1}>
              <Descriptions.Item label="付款备注（必填）">
                <Space>
                  <Text code>{payingBill.billingNo}</Text>
                  <Button type="text" icon={<CopyOutlined />}
                    onClick={() => onCopy(payingBill.billingNo, '付款备注')} />
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="付款金额">
                <Space>
                  <Text strong style={{ color: 'var(--color-error)' }}>{formatMoney(payingBill.totalAmount)}</Text>
                  <Button type="text" icon={<CopyOutlined />}
                    onClick={() => onCopy(String(payingBill.totalAmount?.toFixed(2)), '金额')} />
                </Space>
              </Descriptions.Item>
            </Descriptions>
            <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFBE6', borderRadius: 6, fontSize: 14, color: '#ad6800' }}>
               请联系管理员获取收款账号/收款码，并在转账备注中填写账单编号。
            </div>
          </Card>
        </div>
      )}
    </ResizableModal>
  );
};

export default PayModal;
