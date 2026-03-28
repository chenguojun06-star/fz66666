import React, { useMemo, useState } from 'react';
import { Form, Input, Button, Typography, App, Alert } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined, BankOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import tenantService from '../../services/tenantService';
import '../Login/styles.css';

const { Title } = Typography;

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const year = useMemo(() => new Date().getFullYear(), []);
  const buildCommit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__ : 'unknown';
  const buildTime = typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : '';
  const buildTimeText = useMemo(() => {
    if (!buildTime) return '-';
    const d = new Date(buildTime);
    if (Number.isNaN(d.getTime())) return buildTime;
    return d.toLocaleString('zh-CN', { hour12: false });
  }, [buildTime]);

  const handleApplyTenant = async (values: any) => {
    const res: any = await tenantService.applyForTenant({
      tenantName: values.tenantName,
      contactName: values.contactName,
      contactPhone: values.contactPhone,
      applyUsername: values.username,
      applyPassword: values.password,
    });
    if (res?.code === 200 || res?.data) {
      message.success('入驻申请已提交，请等待平台审核，审核通过后可登录使用');
      setTimeout(() => navigate('/login'), 2500);
    } else {
      message.error(res?.message || '申请失败');
    }
  };

  const handleSubmit = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await handleApplyTenant(values);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || '操作失败，请稍后重试');
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
                提交工厂入驻申请
              </Title>
              <div className="login-showcase-desc">
                填写工厂与联系人信息，审批通过后即可启用正式账号。
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
                  <span className="tech-float-label">入驻申请</span>
                  <strong className="tech-float-value">平台审核</strong>
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
              <strong className="highlight-value">工厂入驻申请</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">流程特点</span>
              <strong className="highlight-value">审核通过后启用</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">系统目标</span>
              <strong className="highlight-value">账号归属清晰 · 登录切换准确</strong>
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
                工厂注册申请
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
          <Alert
            title="以下账号信息用于审批通过后登录系统"
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />

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
              提交入驻申请
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
                  <img src="/police.png" alt="公安备案图标" style={{ width: 14, height: 14, marginRight: 4 }} />
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
