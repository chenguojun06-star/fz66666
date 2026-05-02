import React, { useMemo, useState } from 'react';
import { Form, Input, Button, Typography, App, Alert } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined, PhoneOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import tenantService from '../../services/tenantService';
import '../Login/styles.css';

const { Title } = Typography;

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const tenantCode = searchParams.get('tenantCode') || '';
  const factoryId = searchParams.get('factoryId') || '';
  const factoryName = searchParams.get('factoryName') || searchParams.get('tenantName') || '';
  const orgUnitId = searchParams.get('orgUnitId') || '';
  const inviteType = searchParams.get('type') || '';
  const isFactoryInvite = inviteType === 'FACTORY_INVITE';
  const isWorkerInvite = !!tenantCode;

  const year = useMemo(() => new Date().getFullYear(), []);
  const buildCommit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown';
  const buildTime = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
  const buildTimeText = useMemo(() => {
    if (!buildTime) return '-';
    const d = new Date(buildTime);
    if (Number.isNaN(d.getTime())) return buildTime;
    return d.toLocaleString('zh-CN', { hour12: false });
  }, [buildTime]);

  const belongLabel = isWorkerInvite
    ? isFactoryInvite
      ? `外发工厂：${factoryName}`
      : `工厂：${factoryName}`
    : '';

  const handleApplyTenant = async (values: any) => {
    const res: any = await tenantService.applyForTenant({
      tenantName: values.tenantName,
      contactName: values.contactName,
      contactPhone: values.contactPhone,
      applyUsername: values.username,
      applyPassword: values.password,
    });
    if (res?.code === 200 || res?.data) {
      message.success(`入驻申请已提交${values.tenantName ? `，欢迎「${values.tenantName}」加入云裳智链` : ''}，请等待平台审核，审核通过后可登录使用`);
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '申请失败');
    }
  };

  const handleWorkerRegister = async (values: any) => {
    const res: any = await tenantService.workerRegister({
      tenantCode,
      factoryId: factoryId || undefined,
      orgUnitId: orgUnitId || undefined,
      username: values.username,
      password: values.password,
      name: values.name,
      phone: values.phone || undefined,
    });
    if (res?.code === 200 || res?.data) {
      message.success(factoryName ? `注册申请已提交，欢迎加入「${factoryName}」，请耐心等待管理员审批通过后即可登录` : '注册申请已提交，请等待管理员审批通过后即可登录');
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '注册失败，请联系管理员');
    }
  };

  const handleSubmit = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isWorkerInvite) {
        await handleWorkerRegister(values);
      } else {
        await handleApplyTenant(values);
      }
    } catch (error: unknown) {
      message.error(error instanceof Error ? error.message : '操作失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page modern-login-page">
      <div className="login-left-pane">
        <div className="tech-bg" aria-hidden="true">
          <div className="tech-grid" />
          <div className="tech-world-map" />
          <div className="tech-glow-left" />
          <div className="tech-glow-right" />
          <div className="tech-arc tech-arc-1" />
          <div className="tech-arc tech-arc-2" />
          <div className="tech-arc tech-arc-3" />
          <span className="tech-node tech-node-1" />
          <span className="tech-node tech-node-2" />
          <span className="tech-node tech-node-3" />
          <span className="tech-node tech-node-4" />
          <span className="tech-node tech-node-5" />
          <span className="tech-node tech-node-6" />
        </div>
        <section className="login-showcase">
          <div className="login-showcase-shell">
            <div className="login-showcase-copy">
              <div className="login-kicker">MARS｜注册引导</div>
              <Title level={2} className="login-showcase-title">
                {isWorkerInvite
                  ? isFactoryInvite
                    ? '扫码加入外发工厂'
                    : '扫码加入工厂'
                  : '提交工厂入驻申请'}
              </Title>
              <div className="login-showcase-desc">
                {isWorkerInvite
                  ? isFactoryInvite
                    ? `欢迎注册「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`
                    : `欢迎注册「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`
                  : '填写工厂与联系人信息，审批通过后即可启用正式账号。'}
              </div>
            </div>
            <div className="login-showcase-visual">
              <div className="tech-core-container">
                <div className="tech-ring ring-1"></div>
                <div className="tech-ring ring-2"></div>
                <div className="tech-ring ring-3"></div>
                <div className="tech-orbit orbit-a"></div>
                <div className="tech-orbit orbit-b"></div>
                <div className="tech-orbit orbit-c"></div>
                <div className="tech-halo"></div>
                <div className="tech-axis tech-axis-x"></div>
                <div className="tech-axis tech-axis-y"></div>
                <div className="signal-node signal-node-1"></div>
                <div className="signal-node signal-node-2"></div>
                <div className="signal-node signal-node-3"></div>
                <div className="signal-node signal-node-4"></div>
                <div className="tech-float-card tech-float-card-top">
                  <span className="tech-float-label">审批流程</span>
                  <strong className="tech-float-value">在线跟踪</strong>
                </div>
                <div className="tech-float-card tech-float-card-left">
                  <span className="tech-float-label">{isWorkerInvite ? '扫码注册' : '入驻申请'}</span>
                  <strong className="tech-float-value">{isWorkerInvite ? '快速加入' : '平台审核'}</strong>
                </div>
                <div className="tech-float-card tech-float-card-right">
                  <span className="tech-float-label">登录切换</span>
                  <strong className="tech-float-value">租户隔离</strong>
                </div>
                <div className="tech-core tech-core--cloud">
                  <div className="tech-cloud-glow" />
                  <div className="tech-cloud">
                    <span className="tech-cloud__part tech-cloud__part--left" />
                    <span className="tech-cloud__part tech-cloud__part--center" />
                    <span className="tech-cloud__part tech-cloud__part--right" />
                    <span className="tech-cloud__base" />
                    <span className="tech-cloud__eye tech-cloud__eye--left">
                      <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--left" />
                    </span>
                    <span className="tech-cloud__eye tech-cloud__eye--right">
                      <span className="tech-cloud__eye-highlight tech-cloud__eye-highlight--right" />
                    </span>
                    <span className="tech-cloud__smile" />
                    <span className="tech-cloud__spark tech-cloud__spark--left" />
                    <span className="tech-cloud__spark tech-cloud__spark--right" />
                  </div>
                </div>
                <div className="small-ai-badge">AI</div>
              </div>
            </div>
          </div>
          <div className="login-showcase-highlights">
            <div className="showcase-highlight-card">
              <span className="highlight-label">注册模式</span>
              <strong className="highlight-value">{isWorkerInvite ? (isFactoryInvite ? '外发工厂工人注册' : '工人扫码注册') : '工厂入驻申请'}</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">流程特点</span>
              <strong className="highlight-value">{isWorkerInvite ? '管理员审批' : '审核通过后启用'}</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">系统目标</span>
              <strong className="highlight-value">{isWorkerInvite ? '工厂绑定 · 账号归属清晰' : '账号归属清晰 · 登录切换准确'}</strong>
            </div>
          </div>
        </section>
      </div>

      <div className="login-right-pane">
        <div className="login-panel-glow" aria-hidden="true" />
        <div className="login-form-wrapper">
          <div className="login-form-card">
            <div className="login-card-accent login-card-accent-top" aria-hidden="true" />
            <div className="login-card-accent login-card-accent-bottom" aria-hidden="true" />
            <div className="login-header">
              <Title level={2} className="login-title">
                云裳智链
              </Title>
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
                {isWorkerInvite
                  ? isFactoryInvite
                    ? '外发工厂工人注册'
                    : '工人注册'
                  : '工厂入驻申请'}
              </p>
            </div>

        <Form
          form={form}
          name="register"
          onFinish={handleSubmit}
          onFinishFailed={({ errorFields }) => {
            const first = errorFields?.[0]?.errors?.[0];
            if (first) message.error(first);
          }}
          className="login-form"
          layout="vertical"
        >
          {isWorkerInvite && (
            <Alert
              message={belongLabel}
              description={isFactoryInvite
                ? `欢迎加入「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`
                : `欢迎加入「${factoryName}」，请您耐心等待管理员审批通过后即可登录。`}
              type="info"
              showIcon
              icon={<BankOutlined />}
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          {!isWorkerInvite && (
            <Form.Item
              name="tenantName"
              rules={[{ required: true, message: '请输入工厂名称' }]}
              label="工厂名称"
            >
              <Input
                id="tenantName"
                prefix={<BankOutlined className="site-form-item-icon" />}
                placeholder="请输入工厂 / 公司名称"
                size="large"
                allowClear
                disabled={submitting}
                autoComplete="organization"
              />
            </Form.Item>
          )}

          {!isWorkerInvite && (
            <Form.Item
              name="contactName"
              rules={[{ required: true, message: '请输入联系人姓名' }]}
              label="联系人"
            >
              <Input
                id="contactName"
                prefix={<IdcardOutlined className="site-form-item-icon" />}
                placeholder="请输入联系人姓名"
                size="large"
                allowClear
                disabled={submitting}
                autoComplete="name"
              />
            </Form.Item>
          )}

          {!isWorkerInvite && (
            <Form.Item
              name="contactPhone"
              rules={[
                { required: true, message: '请输入联系电话' },
                { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
              ]}
              label="联系电话"
            >
              <Input
                prefix={<PhoneOutlined className="site-form-item-icon" />}
                placeholder="请输入手机号"
                size="large"
                allowClear
                disabled={submitting}
                autoComplete="tel"
              />
            </Form.Item>
          )}

          {isWorkerInvite && (
            <Form.Item
              name="name"
              rules={[{ required: true, message: '请输入您的姓名' }]}
              label="姓名"
            >
              <Input
                id="name"
                prefix={<IdcardOutlined className="site-form-item-icon" />}
                placeholder="请输入您的真实姓名"
                size="large"
                allowClear
                disabled={submitting}
                autoComplete="name"
              />
            </Form.Item>
          )}

          {isWorkerInvite && (
            <Form.Item
              name="phone"
              rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }]}
              label="手机号（选填）"
            >
              <Input
                prefix={<PhoneOutlined className="site-form-item-icon" />}
                placeholder="选填，方便联系"
                size="large"
                allowClear
                disabled={submitting}
                autoComplete="tel"
              />
            </Form.Item>
          )}

          {!isWorkerInvite && (
            <Alert
              message="以下账号信息用于审批通过后登录系统"
              type="info"
              showIcon
              style={{ marginBottom: 16, borderRadius: 8 }}
            />
          )}

          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 20, message: '用户名最多20个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
            ]}
            label="用户名"
          >
            <Input
              id="username"
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder="请输入用户名"
              size="large"
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
            label="密码"
          >
            <Input.Password
              id="password"
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请输入密码（至少6位）"
              size="large"
              allowClear
              disabled={submitting}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
            label="确认密码"
          >
            <Input.Password
              id="confirmPassword"
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请再次输入密码"
              size="large"
              allowClear
              disabled={submitting}
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
              size="large"
              loading={submitting}
            >
              {isWorkerInvite ? '提交注册' : '提交入驻申请'}
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="link"
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: 0 }}
              disabled={submitting}
            >
              已有账号？返回登录
            </Button>
          </Form.Item>
        </Form>
            <div className="login-footer">© {year} 云裳智链</div>
            <div className="login-footer" style={{ marginTop: 2, fontSize: 11 }}>
              部署版本：{buildCommit} · 构建时间：{buildTimeText}
            </div>
            <div className="login-footer" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <img loading="lazy" src="/police.png" alt="公安备案图标" style={{ width: 14, height: 14, marginRight: 4 }} />
                  <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352" target="_blank" rel="noopener noreferrer"
                    style={{ color: 'rgba(255,255,255,0.45)' }}>
                    粤公网安备44011302005352号
                  </a>
                </div>
                <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
                  style={{ color: 'rgba(255,255,255,0.45)' }}>
                  粤ICP备2026026776号-1
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
