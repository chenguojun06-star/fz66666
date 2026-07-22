import React from 'react';
import { Button, Tag, Space, Input, Descriptions, Alert, Typography } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { AppOrder } from '@/services/system/appStore';
import { formatMoney } from '@/utils/format';
import { SUB_TYPE } from './constants';

const { Text } = Typography;

interface ActivateOrderModalProps {
  visible: boolean;
  order: AppOrder | null;
  remark: string;
  activating: boolean;
  onRemarkChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

const ActivateOrderModal: React.FC<ActivateOrderModalProps> = ({
  visible,
  order,
  remark,
  activating,
  onRemarkChange,
  onCancel,
  onConfirm,
}) => {
  return (
    <ResizableModal
      title="激活订单"
      open={visible}
      onCancel={onCancel}
      width="40vw"
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} loading={activating} onClick={onConfirm}>
            确认激活
          </Button>
        </Space>
      }
    >
      {order && (
        <>
          <Alert
            title="激活后将自动为客户创建订阅和API凭证，请确认已收到付款。"
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Descriptions column={1} bordered>
            <Descriptions.Item label="订单号">{order.orderNo}</Descriptions.Item>
            <Descriptions.Item label="客户">{order.tenantName}</Descriptions.Item>
            <Descriptions.Item label="应用">{order.appName}</Descriptions.Item>
            <Descriptions.Item label="订阅类型">
              <Tag color={SUB_TYPE[order.subscriptionType]?.color}>
                {SUB_TYPE[order.subscriptionType]?.label || order.subscriptionType}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="实付金额">
              <Text strong style={{ color: 'var(--primary-color)' }}>
                {formatMoney(Number(order.actualAmount))}
              </Text>
            </Descriptions.Item>
            <Descriptions.Item label="联系人">
              {order.contactName || '-'} / {order.contactPhone || '-'}
            </Descriptions.Item>
            {order.companyName && (
              <Descriptions.Item label="公司名称">{order.companyName}</Descriptions.Item>
            )}
          </Descriptions>
          <div style={{ marginTop: 16 }}>
            <Text>备注（可选）：</Text>
            <Input.TextArea
              id="activateRemark"
              rows={2}
              placeholder="如：已收到转账 / 线下签约确认"
              value={remark}
              onChange={(e) => onRemarkChange(e.target.value)}
              style={{ marginTop: 8 }}
            />
          </div>
        </>
      )}
    </ResizableModal>
  );
};

export default ActivateOrderModal;
