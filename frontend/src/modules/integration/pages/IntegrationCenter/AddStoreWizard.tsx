import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Collapse, Form, Input, Popconfirm, Result, Segmented, Steps, Typography } from 'antd';
import {
  CheckCircleFilled, CopyOutlined, LinkOutlined, RightOutlined, SafetyCertificateOutlined, ShopOutlined,
} from '@ant-design/icons';
import SideDrawer from '@/components/common/SideDrawer';
import { message } from '@/utils/antdStatic';
import api from '@/utils/api';
import {
  PLATFORM_AUTH_BY_CODE, PLATFORM_AUTH_LIST, PLATFORM_GROUPS,
  type PlatformAuthMeta,
} from './PlatformAuthConstants';

const { Text, Title } = Typography;

interface AddStoreWizardProps {
  open: boolean;
  onClose: () => void;
  /** 授权/配置变化后通知外层刷新状态 */
  onChanged?: () => void;
  /** 预选平台（从平台卡片点「重新对接」进入时） */
  initialPlatformCode?: string;
}

const AUTH_STATUS_POLL_MS = 3000;
const AUTH_STATUS_POLL_MAX = 100; // 5 分钟

/**
 * D-587 添加店铺四步向导（对标聚水潭）：选择平台 → 接入配置 → 平台授权 → 完成。
 * OAuth 平台支持「点一下跳平台授权」；不支持的平台走手工凭证（帮助栏有说明）。
 */
const AddStoreWizard: React.FC<AddStoreWizardProps> = ({ open, onClose, onChanged, initialPlatformCode }) => {
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState<string>('国内平台');
  const [platformCode, setPlatformCode] = useState<string>('');
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [authorizeUrl, setAuthorizeUrl] = useState('');
  const [callbackUrl, setCallbackUrl] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [polling, setPolling] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualExchanging, setManualExchanging] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const meta: PlatformAuthMeta | undefined = PLATFORM_AUTH_BY_CODE[platformCode];

  const resetAll = useCallback(() => {
    setStep(0);
    setPlatformCode(initialPlatformCode || '');
    setAuthorized(false);
    setAuthorizeUrl('');
    setCallbackUrl('');
    setManualCode('');
    setTestResult('');
    setPolling(false);
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    form.resetFields();
  }, [form, initialPlatformCode]);

  useEffect(() => {
    if (open) {
      resetAll();
      if (initialPlatformCode) setStep(1);
    }
    return () => {
      if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    };
  }, [open, resetAll, initialPlatformCode]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    setPolling(false);
  }, []);

  const startPolling = useCallback((code: string) => {
    stopPolling();
    let ticks = 0;
    setPolling(true);
    pollTimerRef.current = setInterval(async () => {
      ticks += 1;
      if (ticks > AUTH_STATUS_POLL_MAX) { stopPolling(); return; }
      try {
        const res = await api.get(`/platform-connector/oauth/${code}/auth-status`);
        if (res?.code === 200 && res.data?.authorized) {
          stopPolling();
          setAuthorized(true);
          message.success('平台授权成功');
          setStep(3);
        }
      } catch { /* 轮询失败静默 */ }
    }, AUTH_STATUS_POLL_MS);
  }, [stopPolling]);

  const groupedPlatforms = useMemo(
    () => PLATFORM_AUTH_LIST.filter((p) => p.group === group),
    [group],
  );

  /** 第二步：保存凭证并进入授权/完成步骤 */
  const handleSaveConfig = useCallback(async () => {
    if (!meta) return;
    try {
      const values = await form.validateFields();
      setSaving(true);
      await api.put('/platform-connector/config', {
        platformCode: meta.code,
        appKey: values.appKey,
        appSecret: values.appSecret,
        shopName: values.shopName,
        authMode: meta.oauthSupported ? 'OAUTH' : 'CREDENTIAL',
      });
      message.success(`${meta.name} 接入配置已保存`);
      onChanged?.();
      if (meta.oauthSupported) {
        const res = await api.get(`/platform-connector/oauth/${meta.code}/authorize-url`);
        if (res?.code === 200 && res.data?.authorizeUrl) {
          setAuthorizeUrl(res.data.authorizeUrl);
          setCallbackUrl(res.data.callbackUrl || '');
        } else {
          throw new Error(res?.message || '生成授权链接失败');
        }
        setStep(2);
      } else {
        setAuthorized(true);
        setStep(3);
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [meta, form, onChanged]);

  /** 第三步（OAuth）：跳平台授权 */
  const handleGoAuthorize = useCallback(() => {
    if (!authorizeUrl) return;
    window.open(authorizeUrl, '_blank', 'width=1024,height=760');
    startPolling(platformCode);
  }, [authorizeUrl, platformCode, startPolling]);

  /** 第三步（OAuth 兜底）：手动粘贴授权码 */
  const handleManualExchange = useCallback(async () => {
    if (!manualCode.trim() || !meta) return;
    setManualExchanging(true);
    try {
      const res = await api.post(`/platform-connector/oauth/${meta.code}/exchange`, { code: manualCode.trim() });
      if (res?.code === 200) {
        stopPolling();
        setAuthorized(true);
        setManualCode('');
        message.success('授权码换取令牌成功');
        setStep(3);
      } else {
        message.error(res?.message || '换取失败');
      }
    } catch (e: any) {
      message.error(e?.message || '换取失败');
    } finally {
      setManualExchanging(false);
    }
  }, [manualCode, meta, stopPolling]);

  /** 第四步：测试连接 */
  const handleTest = useCallback(async () => {
    if (!meta) return;
    setTestResult('testing');
    try {
      const res = await api.post('/platform-connector/test-connection', { platformCode: meta.code });
      const data = res?.data || {};
      const ok = data.success === true || data.connected === true;
      setTestResult(ok ? '连接正常，店铺数据可同步' : String(data.message || '连接未就绪，请检查凭证/授权'));
    } catch (e: any) {
      setTestResult(e?.message || '测试失败');
    }
  }, [meta]);

  const handleFinish = useCallback(() => {
    onChanged?.();
    onClose();
  }, [onClose]);

  const stepsItems = [
    { title: '选择平台' },
    { title: '接入配置' },
    { title: meta?.oauthSupported === false ? '保存凭证' : '平台授权' },
    { title: '完成' },
  ];

  const renderHelpRail = () => {
    if (!meta) {
      return (
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.8 }}>
          <Title level={5} style={{ marginTop: 0 }}>对接说明</Title>
          <p>先在左侧选择店铺所在的平台。</p>
          <p>支持两种接入方式：</p>
          <p>① <b>跳转授权</b>：在平台开放平台创建免费的自用型应用，然后点一下「去平台授权」即可；</p>
          <p>② <b>凭证接入</b>：部分平台直接粘贴店铺后台生成的密钥。</p>
          <p>选完平台后，这里会显示该平台的分步引导和常见问题。</p>
        </div>
      );
    }
    return (
      <div style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
        <Title level={5} style={{ marginTop: 0 }}>{meta.name} · 手把手引导</Title>
        <ol style={{ paddingLeft: 18, margin: '8px 0 12px', lineHeight: 2 }}>
          {meta.guide.map((g, i) => (
            <li key={i}>
              {g.text}
              {g.link && (
                <div style={{ marginTop: 2 }}>
                  <a href={g.link} target="_blank" rel="noopener noreferrer">
                    <Button type="link" size="small" style={{ padding: 0 }} icon={<LinkOutlined />}>
                      {g.linkLabel || '直达入口'}
                    </Button>
                  </a>
                </div>
              )}
            </li>
          ))}
        </ol>
        <Card size="small" style={{ marginBottom: 12, background: 'var(--status-processing-bg, #f0f5ff)', border: '1px solid var(--status-processing-border, #d6e4ff)' }}>
          <div style={{ fontSize: 13 }}><b>授权动作：</b>{meta.authorizeHint}</div>
        </Card>
        <Title level={5} style={{ marginTop: 16 }}>常见问题</Title>
        <Collapse
          ghost
          size="small"
          items={meta.faq.map((f, i) => ({
            key: String(i),
            label: <span style={{ fontSize: 13 }}>{f.q}</span>,
            children: <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{f.a}</span>,
          }))}
        />
      </div>
    );
  };

  return (
    <SideDrawer
      title={<span><ShopOutlined /> 添加店铺{meta ? ` · ${meta.name}` : ''}</span>}
      open={open}
      onClose={onClose}
      width="62%"
    >
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* ====== 左：向导主体 ====== */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Steps
            current={step}
            size="small"
            style={{ marginBottom: 24, maxWidth: 560 }}
            items={stepsItems}
          />

          {/* ---- 第1步 选择平台 ---- */}
          {step === 0 && (
            <div>
              <Segmented
                options={PLATFORM_GROUPS}
                value={group}
                onChange={(v) => setGroup(String(v))}
                style={{ marginBottom: 16 }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
                {groupedPlatforms.map((p) => (
                  <div
                    key={p.code}
                    role="button"
                    tabIndex={0}
                    onClick={() => { setPlatformCode(p.code); setStep(1); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { setPlatformCode(p.code); setStep(1); } }}
                    style={{
                      border: '1px solid var(--color-border, #e5e7eb)',
                      borderRadius: 10,
                      padding: '16px 12px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      background: platformCode === p.code ? 'var(--color-primary-bg, #f0f5ff)' : 'var(--color-bg-container, #fff)',
                    }}
                  >
                    <ShopOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />
                    <div style={{ marginTop: 8, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                      {p.oauthSupported ? '跳转授权' : '凭证接入'}
                    </div>
                  </div>
                ))}
              </div>
              <Alert
                style={{ marginTop: 20 }}
                type="info"
                showIcon
                title="建议先接一个主力平台跑通，其余平台随时可以回来继续添加"
              />
              <div style={{ marginTop: 20, textAlign: 'right' }}>
                <Button disabled={!platformCode} type="primary" onClick={() => setStep(1)}>
                  下一步 <RightOutlined />
                </Button>
              </div>
            </div>
          )}

          {/* ---- 第2步 接入配置 ---- */}
          {step === 1 && meta && (
            <div style={{ maxWidth: 520 }}>
              <Card
                size="small"
                title={`${meta.name} · 在哪里拿密钥（跟着做即可）`}
                style={{ marginBottom: 16, border: '1px solid var(--status-warning-border, #ffe58f)' }}
              >
                <Steps
                  direction="vertical"
                  size="small"
                  current={-1}
                  items={meta.guide.map((g) => ({
                    title: <span style={{ fontSize: 13 }}>{g.text}</span>,
                    description: g.link ? (
                      <a href={g.link} target="_blank" rel="noopener noreferrer">
                        <Button type="link" size="small" style={{ padding: 0 }} icon={<LinkOutlined />}>
                          {g.linkLabel || '直达入口'}
                        </Button>
                      </a>
                    ) : undefined,
                    status: 'process' as const,
                  }))}
                />
              </Card>
              <Form form={form} layout="vertical">
                <Form.Item name="shopName" label="店铺名称（必填，方便识别）" rules={[{ required: true, message: '请输入店铺名称' }]}>
                  <Input placeholder="如：官方旗舰店" />
                </Form.Item>
                <Form.Item name="appKey" label={`AppKey（${meta.oauthSupported ? 'client_id' : '应用Key'}）`} rules={[{ required: true, message: '请输入 AppKey' }]}>
                  <Input placeholder="平台应用详情里复制" />
                </Form.Item>
                <Form.Item name="appSecret" label="AppSecret" rules={[{ required: true, message: '请输入 AppSecret' }]}>
                  <Input.Password placeholder="平台应用详情里复制" autoComplete="new-password" />
                </Form.Item>
              </Form>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <Button onClick={() => setStep(0)}>上一步</Button>
                <Button type="primary" loading={saving} onClick={handleSaveConfig}>
                  保存并下一步 <RightOutlined />
                </Button>
              </div>
            </div>
          )}

          {/* ---- 第3步 平台授权 ---- */}
          {step === 2 && meta && (
            <div style={{ maxWidth: 560 }}>
              {authorized ? (
                <Result
                  status="success"
                  title="授权成功"
                  subTitle={`${meta.name} 店铺已授权，订单将自动同步进系统`}
                />
              ) : (
                <>
                  <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    title={`第一步：先把下面的授权回调地址填到${meta.name}开放平台的应用配置里`}
                  />
                  <Input.Search
                    readOnly
                    value={callbackUrl}
                    addonBefore={<SafetyCertificateOutlined />}
                    enterButton={<span><CopyOutlined /> 复制</span>}
                    onSearch={() => { navigator.clipboard?.writeText(callbackUrl || ''); message.success('回调地址已复制'); }}
                  />
                  <div style={{ margin: '20px 0 12px', fontSize: 14, lineHeight: 1.9 }}>
                    <b>授权动作：</b>{meta.authorizeHint}
                  </div>
                  <Button type="primary" size="large" icon={<LinkOutlined />} onClick={handleGoAuthorize}>
                    去平台授权{polling ? '（等待授权结果…）' : ''}
                  </Button>
                  {polling && (
                    <div style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                      已打开平台页面，正在等待你完成授权… 完成后本页会自动跳到下一步。
                    </div>
                  )}
                  <Collapse
                    ghost
                    size="small"
                    style={{ marginTop: 16 }}
                    items={[{
                      key: 'manual',
                      label: '平台页面里没有跳转？手动粘贴授权码（备用）',
                      children: (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Input
                            value={manualCode}
                            onChange={(e) => setManualCode(e.target.value)}
                            placeholder="粘贴平台返回的授权码 code"
                          />
                          <Button loading={manualExchanging} onClick={handleManualExchange}>换取</Button>
                        </div>
                      ),
                    }]}
                  />
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <Button onClick={() => { stopPolling(); setStep(1); }}>上一步</Button>
                {authorized && (
                  <Button type="primary" onClick={() => setStep(3)}>
                    下一步 <RightOutlined />
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* ---- 第4步 完成 ---- */}
          {step === 3 && meta && (
            <div style={{ maxWidth: 520 }}>
              <Result
                status="success"
                title={<span><CheckCircleFilled style={{ color: 'var(--color-success)' }} /> {meta.name}店铺接入完成</span>}
                subTitle="平台订单将自动进入系统；也可以立即做一次连接检查或手动同步"
                extra={
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <Button onClick={handleTest} loading={testResult === 'testing'}>测试连接</Button>
                    <Popconfirm
                      title="立即手动同步一次订单？"
                      onConfirm={async () => {
                        try {
                          await api.post('/platform-connector/sync-now', { platformCode: meta.code });
                          message.success('已触发同步');
                        } catch (e: any) {
                          message.error(e?.message || '同步失败');
                        }
                      }}
                    >
                      <Button type="primary">拉取订单</Button>
                    </Popconfirm>
                    <Button onClick={handleFinish}>完成</Button>
                  </div>
                }
              />
              {testResult && testResult !== 'testing' && (
                <Alert style={{ marginTop: 4 }} type="info" showIcon title={testResult} />
              )}
            </div>
          )}
        </div>

        {/* ====== 右：帮助侧栏 ====== */}
        <div
          style={{
            width: 280, flexShrink: 0,
            borderLeft: '1px solid var(--color-border, #eee)',
            paddingLeft: 20,
            maxHeight: '72vh',
            overflowY: 'auto',
          }}
        >
          {renderHelpRail()}
          <div style={{ marginTop: 16 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              授权数据仅存于本租户空间；令牌到期系统会自动续期。
            </Text>
          </div>
        </div>
      </div>
    </SideDrawer>
  );
};

export default AddStoreWizard;
