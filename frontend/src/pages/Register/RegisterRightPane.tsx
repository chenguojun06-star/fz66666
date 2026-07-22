import React from 'react';
import { Form, Input, Button, Typography, Alert } from 'antd';
import { UserOutlined, LockOutlined, IdcardOutlined, PhoneOutlined, BankOutlined } from '@ant-design/icons';

const { Title } = Typography;

interface RegisterRightPaneProps {
  form: any;
  submitting: boolean;
  isWorkerInvite: boolean;
  isFactoryInvite: boolean;
  factoryName: string;
  belongLabel: string;
  year: number;
  buildCommit: string;
  buildTimeText: string;
  handleSubmit: (values: any) => Promise<void>;
  navigate: (path: string) => void;
  message: any;
}

const RegisterRightPane: React.FC<RegisterRightPaneProps> = ({
  form,
  submitting,
  isWorkerInvite,
  isFactoryInvite,
  factoryName,
  belongLabel,
  year,
  buildCommit,
  buildTimeText,
  handleSubmit,
  navigate,
  message,
}) => {
  return (
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
                title={belongLabel}
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
                title="以下账号信息用于审批通过后登录系统"
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
          <div className="login-footer" style={{ marginTop: 2, fontSize: 14 }}>
            部署版本：{buildCommit} · 构建时间：{buildTimeText}
          </div>
          <div className="login-footer" style={{ marginTop: 8, fontSize: 11, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <img loading="lazy" src="/police.png" alt="公安备案图标" style={{ width: 11, height: 11, marginRight: 4 }} />
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
  );
};

export default RegisterRightPane;
