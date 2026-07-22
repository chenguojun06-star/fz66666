import React from 'react';
import { Button, Space, Input, Alert, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';

const { Text } = Typography;

interface NotifyConfigModalProps {
  visible: boolean;
  serverChanKey: string;
  notifyConfigured: boolean;
  notifyMaskedKey: string;
  saving: boolean;
  onKeyChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onClear: () => void;
}

const NotifyConfigModal: React.FC<NotifyConfigModalProps> = ({
  visible,
  serverChanKey,
  notifyConfigured,
  notifyMaskedKey,
  saving,
  onKeyChange,
  onCancel,
  onSave,
  onClear,
}) => {
  return (
    <ResizableModal
      title="配置微信通知"
      open={visible}
      onCancel={onCancel}
      defaultWidth="40vw"
      defaultHeight="50vh"
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button
            onClick={onClear}
            danger
            disabled={!notifyConfigured}
          >
            清除通知
          </Button>
          <Button type="primary" loading={saving} onClick={onSave} disabled={!serverChanKey}>
            保存
          </Button>
        </Space>
      }
    >
      <Alert
        title="配置后，每当客户在应用商店提交购买订单，系统自动推送微信通知到您的手机。"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <div style={{ marginBottom: 12 }}>
        <Text strong>获取 Server酱 SendKey：</Text>
        <ol style={{ marginTop: 8, paddingLeft: 20, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 2 }}>
          <li>用微信扫码登录 <a href="https://sct.ftqq.com/" target="_blank" rel="noreferrer">sct.ftqq.com</a></li>
          <li>点击「SendKey」复制您的专属Key</li>
          <li>粘贴到下方输入框保存</li>
        </ol>
      </div>
      {notifyConfigured && (
        <Alert
          title={`当前已配置：${notifyMaskedKey}`}
          type="success"
          showIcon
          style={{ marginBottom: 12 }}
        />
      )}
      <Input
        placeholder="粘贴您的 Server酱 SendKey（如：SCT123456789...）"
        value={serverChanKey}
        onChange={e => onKeyChange(e.target.value)}
        allowClear
      />
    </ResizableModal>
  );
};

export default NotifyConfigModal;
