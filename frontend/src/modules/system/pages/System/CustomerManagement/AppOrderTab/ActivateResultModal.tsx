import React from 'react';
import { Button, Descriptions, Alert, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

interface ApiCredentials {
  appKey: string;
  appSecret: string;
}

interface ActivateResultData {
  orderNo?: string;
  activatedAt?: string;
  expireAt?: string;
  apiCredentials?: ApiCredentials;
  [key: string]: any;
}

interface ActivateResultModalProps {
  visible: boolean;
  data: ActivateResultData | null;
  onClose: () => void;
}

const ActivateResultModal: React.FC<ActivateResultModalProps> = ({ visible, data, onClose }) => {
  return (
    <ResizableModal
      title="激活成功"
      open={visible}
      onCancel={onClose}
      defaultWidth="40vw"
      defaultHeight="50vh"
      footer={<Button type="primary" onClick={onClose}>知道了</Button>}
    >
      {data && (
        <>
          <Alert title="订单已激活成功，客户可以开始使用应用了。" type="success" showIcon style={{ marginBottom: 16 }} />
          <Descriptions column={1} bordered>
            <Descriptions.Item label="订单号">{data.orderNo}</Descriptions.Item>
            <Descriptions.Item label="激活时间">{data.activatedAt}</Descriptions.Item>
            <Descriptions.Item label="到期时间">{data.expireAt}</Descriptions.Item>
          </Descriptions>
          {data.apiCredentials && (
            <div style={{ marginTop: 16 }}>
              <Typography.Text strong>API 凭证（请妥善保管）：</Typography.Text>
              <Descriptions column={1} bordered style={{ marginTop: 8 }}>
                <Descriptions.Item label="App Key">
                  <Typography.Paragraph copyable style={{ marginBottom: 0 }}>{data.apiCredentials.appKey}</Typography.Paragraph>
                </Descriptions.Item>
                <Descriptions.Item label="App Secret">
                  <Typography.Paragraph copyable style={{ marginBottom: 0 }}>{data.apiCredentials.appSecret}</Typography.Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </div>
          )}
        </>
      )}
    </ResizableModal>
  );
};

export default ActivateResultModal;
