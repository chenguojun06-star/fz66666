import React, { useEffect, useState, useCallback } from 'react';
import { Form, Input, Switch, message, Alert, Descriptions, Spin } from 'antd';
import {
  KeyOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';

/** 各渠道表单字段定义 */
const CHANNEL_FIELDS: Record<string, { label: string; key: string; icon: React.ReactNode; required?: boolean; isSecret?: boolean; placeholder?: string }[]> = {
  ALIPAY: [
    { label: 'AppID', key: 'appId', icon: <KeyOutlined />, required: true, placeholder: '支付宝分配的 AppID，如 2021000000000000' },
    { label: '应用私钥', key: 'privateKey', icon: <SafetyCertificateOutlined />, required: true, isSecret: true, placeholder: 'RSA2私钥（PKCS8，不含头尾）' },
    { label: '支付宝公钥', key: 'publicKey', icon: <SafetyCertificateOutlined />, required: true, isSecret: true, placeholder: '从开放平台复制的支付宝公钥' },
    { label: '回调通知地址', key: 'notifyUrl', icon: <LinkOutlined />, placeholder: 'https://你的域名/api/webhook/payment/alipay' },
  ],
  WECHAT_PAY: [
    { label: 'AppID', key: 'appId', icon: <KeyOutlined />, required: true, placeholder: '公众号/小程序/APP 的 AppID' },
    { label: '商户号(MchId)', key: 'appSecret', icon: <KeyOutlined />, required: true, placeholder: '微信支付商户号，如 1600000000' },
    { label: 'API V3 密钥', key: 'privateKey', icon: <SafetyCertificateOutlined />, required: true, isSecret: true, placeholder: '32位 API V3 密钥' },
    { label: '回调通知地址', key: 'notifyUrl', icon: <LinkOutlined />, placeholder: 'https://你的域名/api/webhook/payment/wechat' },
  ],
  SF: [
    { label: 'AppKey', key: 'appId', icon: <KeyOutlined />, required: true, placeholder: '顺丰开放平台 AppKey' },
    { label: 'AppSecret', key: 'appSecret', icon: <SafetyCertificateOutlined />, required: true, isSecret: true, placeholder: '顺丰开放平台 AppSecret' },
    { label: '回调通知地址', key: 'notifyUrl', icon: <LinkOutlined />, placeholder: 'https://你的域名/api/webhook/logistics/sf' },
  ],
  STO: [
    { label: 'AppKey', key: 'appId', icon: <KeyOutlined />, required: true, placeholder: '申通开放平台 AppKey' },
    { label: 'AppSecret', key: 'appSecret', icon: <SafetyCertificateOutlined />, required: true, isSecret: true, placeholder: '申通开放平台 AppSecret' },
    { label: '回调通知地址', key: 'notifyUrl', icon: <LinkOutlined />, placeholder: 'https://你的域名/api/webhook/logistics/sto' },
  ],
};

const CHANNEL_NAMES: Record<string, string> = {
  ALIPAY: '支付宝',
  WECHAT_PAY: '微信支付',
  SF: '顺丰速运',
  STO: '申通快递',
};

const HELP_LINKS: Record<string, { text: string; url: string }> = {
  ALIPAY: { text: '支付宝开放平台', url: 'https://openhome.alipay.com/dev/workspace' },
  WECHAT_PAY: { text: '微信支付商户平台', url: 'https://pay.weixin.qq.com' },
  SF: { text: '顺丰开放平台', url: 'https://open.sf-express.com' },
  STO: { text: '申通开放平台', url: 'https://open.sto.cn' },
};

interface Props {
  open: boolean;
  channelCode: string | null;
  onClose: () => void;
  onSaved: () => void;
}

const ChannelConfigModal: React.FC<Props> = ({ open, channelCode, onClose, onSaved }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configData, setConfigData] = useState<Record<string, any> | null>(null);

  const loadConfig = useCallback(async () => {
    if (!channelCode) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: Record<string, any> }>(
        `/integration/channel-config/${channelCode}`
      );
      if (res.code === 200 && res.data) {
        setConfigData(res.data);
        form.setFieldsValue({
          enabled: res.data.enabled ?? false,
          appId: res.data.appId || '',
          notifyUrl: res.data.notifyUrl || '',
          // 密钥字段不回填原文，只在placeholder提示已配置
        });
      }
    } catch {
      // 降级：表不存在时仍能打开
      setConfigData({ hasConfig: false, enabled: false });
    } finally {
      setLoading(false);
    }
  }, [channelCode, form]);

  useEffect(() => {
    if (open && channelCode) {
      form.resetFields();
      setConfigData(null);
      loadConfig();
    }
  }, [open, channelCode, form, loadConfig]);

  const handleSave = async () => {
    if (!channelCode) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      const res = await api.post<{ code: number; message?: string }>(
        '/integration/channel-config/save',
        { channelCode, ...values }
      );
      if (res.code === 200) {
        message.success('渠道配置已保存');
        onSaved();
        onClose();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (err: any) {
      if (err?.errorFields) return; // 表单校验失败
      message.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const fields = channelCode ? CHANNEL_FIELDS[channelCode] || [] : [];
  const channelName = channelCode ? CHANNEL_NAMES[channelCode] || channelCode : '';
  const helpLink = channelCode ? HELP_LINKS[channelCode] : null;

  return (
    <ResizableModal
      open={open}
      title={`配置${channelName}渠道`}
      onCancel={onClose}
      onOk={handleSave}
      okText="保存配置"
      confirmLoading={saving}
      width="40vw"
      destroyOnClose
    >
      <Spin spinning={loading}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={
            <span>
              填写 API 密钥后开启渠道即可使用。
              {helpLink && (
                <>
                  {' '}密钥获取：
                  <a href={helpLink.url} target="_blank" rel="noopener noreferrer">
                    {helpLink.text} →
                  </a>
                </>
              )}
            </span>
          }
        />

        {configData?.hasConfig && (
          <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="当前状态">
              {configData.enabled ? '✅ 已启用' : '⭕ 未启用'}
            </Descriptions.Item>
            {configData.hasAppSecret && (
              <Descriptions.Item label="密钥状态">
                AppSecret/私钥已配置（脱敏显示）
              </Descriptions.Item>
            )}
          </Descriptions>
        )}

        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item
            name="enabled"
            label="启用渠道"
            valuePropName="checked"
          >
            <Switch checkedChildren="开启" unCheckedChildren="关闭" />
          </Form.Item>

          {fields.map(field => (
            <Form.Item
              key={field.key}
              name={field.key}
              label={
                <span>
                  {field.icon}&nbsp;{field.label}
                  {field.isSecret && configData?.hasConfig && configData?.[`has${field.key.charAt(0).toUpperCase() + field.key.slice(1)}`] && (
                    <span style={{ color: '#52c41a', marginLeft: 8, fontSize: 12 }}>✓ 已配置</span>
                  )}
                </span>
              }
              rules={field.required ? [{ required: !configData?.hasConfig, message: `请输入${field.label}` }] : undefined}
            >
              {field.isSecret ? (
                <Input.Password
                  placeholder={
                    configData?.hasConfig && configData?.[`has${field.key.charAt(0).toUpperCase() + field.key.slice(1)}`]
                      ? `已配置（留空则不修改）`
                      : field.placeholder
                  }
                  autoComplete="off"
                />
              ) : (
                <Input placeholder={field.placeholder} autoComplete="off" />
              )}
            </Form.Item>
          ))}
        </Form>
      </Spin>
    </ResizableModal>
  );
};

export default ChannelConfigModal;
