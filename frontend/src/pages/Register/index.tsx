import React, { useMemo, useState } from 'react';
import { Form, Input, Button, Card, Typography, App } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import '../Login/styles.css';

const { Title } = Typography;

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  const year = useMemo(() => new Date().getFullYear(), []);

  // 注册表单提交处理
  const handleRegister = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const response = await api.post('/auth/register', {
        username: values.username,
        password: values.password,
        phone: values.phone,
        email: values.email
      });

      if (response && (response as any).code === 200) {
        message.success('注册成功！请等待管理员审批后登录');
        setTimeout(() => {
          navigate('/login');
        }, 2000);
      } else {
        message.error((response as any)?.message || '注册失败，请稍后重试');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-constellation" aria-hidden="true" />
      <Card className="login-card" variant="borderless">
        <div className="login-header">
          <Title level={2} className="login-title">
            衣富ERP供应链生态
          </Title>
          <p style={{ textAlign: 'center', color: '#666', marginTop: 8 }}>用户注册</p>
        </div>
        <Form
          form={form}
          name="register"
          onFinish={handleRegister}
          className="login-form"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
              { max: 20, message: '用户名最多20个字符' },
              { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' }
            ]}
            label="用户名"
          >
            <Input
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
              { min: 6, message: '密码至少6个字符' }
            ]}
            label="密码"
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请输入密码"
              size="large"
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
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请再次输入密码"
              size="large"
              disabled={submitting}
              autoComplete="new-password"
            />
          </Form.Item>
          <Form.Item
            name="phone"
            rules={[
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' }
            ]}
            label="手机号（选填）"
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
          <Form.Item
            name="email"
            rules={[
              { type: 'email', message: '请输入正确的邮箱地址' }
            ]}
            label="邮箱（选填）"
          >
            <Input
              prefix={<MailOutlined className="site-form-item-icon" />}
              placeholder="请输入邮箱"
              size="large"
              allowClear
              disabled={submitting}
              autoComplete="email"
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
              注册
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
        <div className="login-footer">© {year} 衣富ERP</div>
      </Card>
    </div>
  );
};

export default Register;
