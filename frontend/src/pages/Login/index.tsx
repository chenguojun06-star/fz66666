import React, { useMemo, useState } from 'react';
import { Form, Input, Button, Card, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/authContext';
import './styles.css';

const { Title } = Typography;

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { login } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const year = useMemo(() => new Date().getFullYear(), []);

  // 登录表单提交处理
  const handleLogin = async (values: { username: string; password: string }) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const success = await login(values.username, values.password);
      if (success) {
        message.success('登录成功');
        navigate('/dashboard');
      } else {
        message.error('登录失败，请检查用户名和密码');
      }
    } catch (error) {
      message.error('登录失败，请检查用户名和密码');
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
        </div>
        <Form
          form={form}
          name="login"
          onFinish={handleLogin}
          className="login-form"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
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
            rules={[{ required: true, message: '请输入密码' }]}
            label="密码"
          >
            <Input.Password
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder="请输入密码"
              size="large"
              disabled={submitting}
              autoComplete="current-password"
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
              登录
            </Button>
          </Form.Item>
        </Form>
        <div className="login-footer">© {year} 衣富ERP</div>
      </Card>
    </div>
  );
};

export default Login;
