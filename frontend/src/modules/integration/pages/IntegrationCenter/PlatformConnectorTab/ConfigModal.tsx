import React from 'react';
import { Form, Input, Button, Space } from 'antd';
import type { FormInstance } from 'antd';
import {
  LinkOutlined, KeyOutlined, SafetyCertificateOutlined, ShopOutlined,
  ThunderboltOutlined, SettingOutlined, ApiOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import type { PlatformMeta } from '../PlatformConnectorConstants';
import { PLATFORM_HELP_TIPS } from './helpers';
import { renderIcon } from './icons';

interface ConfigModalProps {
  open: boolean;
  activePlatform: PlatformMeta | null;
  form: FormInstance;
  testing: boolean;
  onCancel: () => void;
  onTest: () => void;
  onSave: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ open, activePlatform, form, testing, onCancel, onTest, onSave }) => {
  return (
    <ResizableModal
      open={open}
      title={<Space><span style={{ fontSize: 20 }}>{activePlatform ? renderIcon(activePlatform.icon) : <ApiOutlined />}</span><span>配置 {activePlatform?.name} 连接</span></Space>}
      onCancel={onCancel}
      footer={null} width="40vw" destroyOnHidden
    >
      <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>💡 对接说明</div>
        <div style={{ fontSize: 14, color: '#595959', marginBottom: 8 }}>
          {PLATFORM_HELP_TIPS[activePlatform?.code || '']?.tip || '在对应平台开放平台创建应用，获取 AppKey 和 AppSecret'}
        </div>
        {PLATFORM_HELP_TIPS[activePlatform?.code || '']?.openUrl && (
          <Button type="link" icon={<LinkOutlined />} onClick={() => window.open(PLATFORM_HELP_TIPS[activePlatform!.code].openUrl, '_blank')}>
            打开 {activePlatform?.name} 开放平台 →
          </Button>
        )}
      </div>

      <Form form={form} layout="vertical">
        <Form.Item name="appKey" label={<span><KeyOutlined /> AppKey</span>} rules={[{ required: true, message: '请粘贴应用标识' }]} tooltip="从平台开放平台复制">
          <Input placeholder={`粘贴 ${activePlatform?.name} 的 AppKey`} autoComplete="off" />
        </Form.Item>
        <Form.Item name="appSecret" label={<span><SafetyCertificateOutlined /> AppSecret</span>} rules={[{ required: true, message: '请粘贴应用密钥' }]} tooltip="密钥加密存储，安全可靠">
          <Input.Password placeholder={`粘贴 ${activePlatform?.name} 的 AppSecret`} autoComplete="off" />
        </Form.Item>
        <Form.Item name="shopName" label={<span><ShopOutlined /> 店铺名称（可选）</span>}>
          <Input placeholder="如：主店铺" />
        </Form.Item>
      </Form>

      <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
        <Button type="primary" icon={<ThunderboltOutlined />} loading={testing} onClick={onTest} style={{ flex: 1 }}>保存并测试连接</Button>
        <Button icon={<SettingOutlined />} onClick={onSave} style={{ flex: 1 }}>仅保存</Button>
      </div>
    </ResizableModal>
  );
};

export default ConfigModal;
