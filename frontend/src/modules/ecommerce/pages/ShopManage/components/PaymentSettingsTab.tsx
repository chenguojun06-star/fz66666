import React from 'react';
import { Alert, Button, Card, Descriptions, Input, Space, Switch, Tag, Typography } from 'antd';
import { CheckCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { message } from '@/utils/antdStatic';
import { unwrapApiData } from '@/utils/api';
import paymentApi from '@/services/payment/paymentApi';
import type { PaymentChannelStatus, PaymentSaveBody } from '@/services/payment/paymentApi';

const { Text, Paragraph } = Typography;

/** 表单态：密钥字段单独放，提交时留空表示保持原值 */
interface FormState {
  enabled: boolean;
  appId: string;
  mchId: string;
  serialNo: string;
  privateKey: string;
  publicKey: string;
  apiV3Key: string;
  notifyUrl: string;
  sandbox: boolean;
}

const emptyForm = (): FormState => ({
  enabled: false,
  appId: '',
  mchId: '',
  serialNo: '',
  privateKey: '',
  publicKey: '',
  apiV3Key: '',
  notifyUrl: '',
  sandbox: false,
});

/**
 * 收款设置：商家填写**自己的**微信/支付宝商户参数。
 *
 * <p>为什么必须每家商户自己配：微信/支付宝商户号是企业资质，钱结算到该企业账户。
 * 平台用一个商户号代收所有商家的钱再转付属于「二清」（无牌照非法经营），
 * 这是不能碰的红线 —— 所以这里只提供配置入口，平台不托管任何收款账号。
 */
const PaymentSettingsTab: React.FC = () => {
  const [loading, setLoading] = React.useState(false);
  const [channels, setChannels] = React.useState<PaymentChannelStatus[]>([]);
  const [forms, setForms] = React.useState<Record<string, FormState>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [verifying, setVerifying] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = unwrapApiData<{ channels: PaymentChannelStatus[] }>(
        await paymentApi.status(),
        '加载收款设置失败',
      );
      const list = res?.channels ?? [];
      setChannels(list);
      const next: Record<string, FormState> = {};
      list.forEach((c) => {
        next[c.channel] = {
          ...emptyForm(),
          enabled: !!c.enabled,
          appId: c.appId ?? '',
          mchId: c.mchId ?? '',
          serialNo: c.serialNo ?? '',
          notifyUrl: c.notifyUrl ?? '',
          sandbox: !!c.sandbox,
        };
      });
      setForms(next);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '加载收款设置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const patchForm = React.useCallback((channel: string, patch: Partial<FormState>) => {
    setForms((prev) => ({ ...prev, [channel]: { ...(prev[channel] ?? emptyForm()), ...patch } }));
  }, []);

  const save = React.useCallback(
    async (channel: string) => {
      const f = forms[channel];
      if (!f) return;
      setSaving(channel);
      try {
        const body: PaymentSaveBody = {
          enabled: f.enabled,
          appId: f.appId.trim(),
          mchId: f.mchId.trim(),
          serialNo: f.serialNo.trim(),
          notifyUrl: f.notifyUrl.trim(),
          sandbox: f.sandbox,
        };
        // 密钥留空 = 保持原值（后端语义），所以只在填了的时候才带上
        if (f.privateKey.trim()) body.privateKey = f.privateKey.trim();
        if (f.publicKey.trim()) body.publicKey = f.publicKey.trim();
        if (f.apiV3Key.trim()) body.apiV3Key = f.apiV3Key.trim();
        unwrapApiData(await paymentApi.save(channel, body), '保存失败');
        message.success('已保存');
        patchForm(channel, { privateKey: '', publicKey: '', apiV3Key: '' });
        await load();
      } catch (e) {
        message.error(e instanceof Error ? e.message : '保存失败');
      } finally {
        setSaving(null);
      }
    },
    [forms, load, patchForm],
  );

  const verify = React.useCallback(async (channel: string) => {
    setVerifying(channel);
    try {
      const res = unwrapApiData<{ ok: boolean; message: string }>(
        await paymentApi.verify(channel),
        '验证失败',
      );
      if (res?.ok) {
        message.success(res.message || '鉴权通过');
        await load();
      } else {
        message.error(res?.message || '验证未通过');
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : '验证失败');
    } finally {
      setVerifying(null);
    }
  }, [load]);

  const renderChannel = (c: PaymentChannelStatus) => {
    const f = forms[c.channel] ?? emptyForm();
    const isWechat = c.channel === 'WECHAT_PAY';
    return (
      <Card
        key={c.channel}
        size="small"
        style={{ marginBottom: 12 }}
        title={
          <Space>
            <span>{c.channelName}</span>
            {c.usable ? (
              <Tag color="green">可用</Tag>
            ) : c.configured ? (
              <Tag color="orange">待完善</Tag>
            ) : (
              <Tag>未配置</Tag>
            )}
            {c.verifiedTime ? (
              <Tag color="blue" icon={<CheckCircleOutlined />}>
                已验通
              </Tag>
            ) : null}
          </Space>
        }
        extra={
          <Space>
            <Button
              size="small"
              icon={<SafetyCertificateOutlined />}
              loading={verifying === c.channel}
              onClick={() => void verify(c.channel)}
              disabled={!c.configured}
            >
              连通性验证
            </Button>
            <Button
              size="small"
              type="primary"
              loading={saving === c.channel}
              onClick={() => void save(c.channel)}
            >
              保存
            </Button>
          </Space>
        }
      >
        <Descriptions column={1} size="small" bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="启用">
            <Switch checked={f.enabled} onChange={(v) => patchForm(c.channel, { enabled: v })} />
            <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
              启用且参数齐全后，收银台才会出现该收款方式
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={isWechat ? 'AppID' : 'AppID'}>
            <Input
              value={f.appId}
              onChange={(e) => patchForm(c.channel, { appId: e.target.value })}
              placeholder={isWechat ? '微信支付绑定的 AppID（公众号/小程序/APP）' : '支付宝开放平台 AppID'}
            />
          </Descriptions.Item>
          {isWechat ? (
            <>
              <Descriptions.Item label="商户号">
                <Input
                  value={f.mchId}
                  onChange={(e) => patchForm(c.channel, { mchId: e.target.value })}
                  placeholder="微信支付商户号 mchid"
                />
              </Descriptions.Item>
              <Descriptions.Item label="证书序列号">
                <Input
                  value={f.serialNo}
                  onChange={(e) => patchForm(c.channel, { serialNo: e.target.value })}
                  placeholder="商户 API 证书序列号（商户平台 → API 安全）"
                />
              </Descriptions.Item>
            </>
          ) : (
            <Descriptions.Item label="沙箱">
              <Switch checked={f.sandbox} onChange={(v) => patchForm(c.channel, { sandbox: v })} />
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                先用沙箱联调，上线前务必关掉
              </Text>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="异步通知地址">
            <Input
              value={f.notifyUrl}
              onChange={(e) => patchForm(c.channel, { notifyUrl: e.target.value })}
              placeholder={`如 https://你的域名${c.notifyUrlSuggestion ?? ''}`}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              必须公网可达且域名已备案；填错会导致「顾客付了钱、系统还是待支付」
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={isWechat ? '商户私钥' : '应用私钥'}>
            <Input.Password
              value={f.privateKey}
              onChange={(e) => patchForm(c.channel, { privateKey: e.target.value })}
              placeholder={c.privateKeySet ? '已设置（留空保持不变）' : '粘贴 PKCS#8 私钥内容（含或不含 PEM 头尾都可）'}
            />
          </Descriptions.Item>
          {isWechat ? (
            <Descriptions.Item label="APIv3 密钥">
              <Input.Password
                value={f.apiV3Key}
                onChange={(e) => patchForm(c.channel, { apiV3Key: e.target.value })}
                placeholder={c.apiV3KeySet ? '已设置（留空保持不变）' : '32 位 APIv3 密钥'}
              />
            </Descriptions.Item>
          ) : (
            <Descriptions.Item label="支付宝公钥">
              <Input.Password
                value={f.publicKey}
                onChange={(e) => patchForm(c.channel, { publicKey: e.target.value })}
                placeholder={c.publicKeySet ? '已设置（留空保持不变）' : '开放平台「查看支付宝公钥」内容'}
              />
            </Descriptions.Item>
          )}
        </Descriptions>
        {!c.usable && c.missingHint ? (
          <Alert type="warning" showIcon message={`还缺：${c.missingHint}`} />
        ) : null}
      </Card>
    );
  };

  return (
    <div>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="在线收款用的是你自己的商户号，钱直接进你的账户，平台不经手"
        description={
          <span style={{ fontSize: 12.5 }}>
            微信/支付宝商户号是企业资质（需营业执照、法人身份证、银行账户，去官方平台申请）。
            每家商户必须用自己的商户号收款：平台代收所有商家的钱再转付属于「二清」，
            无《支付业务许可证》属非法经营，这是不能碰的红线。
            <br />
            密钥类字段加密保存、**不会回传**（页面上看不到已填内容），要修改就整段重填。
          </span>
        }
      />
      <div style={{ marginBottom: 8 }}>
        <Button size="small" onClick={() => void load()} loading={loading}>
          刷新状态
        </Button>
      </div>
      {channels.map(renderChannel)}
      <Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
        没配置也能用收银台：现金、刷卡、挂账都不需要商户号；只有微信/支付宝扫码收款才需要。
      </Paragraph>
    </div>
  );
};

export default PaymentSettingsTab;
