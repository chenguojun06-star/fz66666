import React, { useMemo, useState, useEffect } from 'react';
import { Form, Input, Button, Card, Typography, App, Segmented, Alert } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, MailOutlined, ShopOutlined, IdcardOutlined, BankOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import tenantService from '../../services/tenantService';
import '../Login/styles.css';

const { Title } = Typography;

type RegisterMode = '通用注册' | '工厂员工注册' | '工厂入驻申请';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const { message } = App.useApp();

  // 从 URL 参数获取 tenantCode（扫码注册链接带入）
  const urlTenantCode = searchParams.get('tenantCode') || '';
  const urlTenantName = searchParams.get('tenantName') || '';

  // 如果 URL 带了 tenantCode，默认选择工厂模式
  const [mode, setMode] = useState<RegisterMode>(urlTenantCode ? '工厂员工注册' : '通用注册');
  const isFactoryMode = mode === '工厂员工注册';
  const isApplyMode = mode === '工厂入驻申请';

  const year = useMemo(() => new Date().getFullYear(), []);

  // URL 带 tenantCode 时自动填入
  useEffect(() => {
    if (urlTenantCode) {
      form.setFieldsValue({ tenantCode: urlTenantCode });
    }
  }, [urlTenantCode, form]);

  // 通用注册
  const handleGeneralRegister = async (values: any) => {
    try {
      const response = await api.post('/auth/register', {
        username: values.username,
        password: values.password,
        phone: values.phone,
        email: values.email,
      });
      if (response && (response as any).code === 200) {
        message.success('注册成功！请等待管理员审批后登录');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        message.error(String((response as any)?.message || '注册失败'));
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || '注册失败，请稍后重试');
    }
  };

  // 工厂员工注册
  const handleFactoryRegister = async (values: any) => {
    try {
      const res: any = await tenantService.workerRegister({
        username: values.username,
        password: values.password,
        name: values.name,
        phone: values.phone,
        tenantCode: values.tenantCode,
      });
      const data = res?.data || res;
      if (data?.status === 'PENDING' || (res?.code === 200)) {
        message.success(data?.message || '注册申请已提交，请等待工厂管理员审批');
        setTimeout(() => navigate('/login'), 2000);
      } else {
        message.error(data?.message || '注册失败');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || '注册失败，请稍后重试';
      message.error(msg);
    }
  };

  // 工厂入驻申请
  const handleApplyTenant = async (values: any) => {
    try {
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
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || '申请失败，请稍候重试');
    }
  };

  const handleRegister = async (values: any) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      if (isApplyMode) {
        await handleApplyTenant(values);
      } else if (isFactoryMode) {
        await handleFactoryRegister(values);
      } else {
        await handleGeneralRegister(values);
      }
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
            云裳智链
          </Title>
          <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
            {isApplyMode ? '工厂入驻申请' : isFactoryMode ? '工厂员工注册' : '用户注册'}
          </p>
        </div>

        {/* 注册模式切换 */}
        {!urlTenantCode && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <Segmented
              options={['通用注册', '工厂员工注册', '工厂入驻申请']}
              value={mode}
              onChange={(v) => { setMode(v as RegisterMode); form.resetFields(); }}
              style={{ background: 'rgba(255,255,255,0.12)' }}
            />
          </div>
        )}

        {/* 扫码注册提示 */}
        {urlTenantCode && (
          <Alert
            message={`正在注册到工厂：${urlTenantName || urlTenantCode}`}
            type="info"
            showIcon
            style={{ marginBottom: 16, borderRadius: 8 }}
          />
        )}

        <Form
          form={form}
          name="register"
          onFinish={handleRegister}
          className="login-form"
          layout="vertical"
        >
          {/* 工厂入驻申请内容 */}
          {isApplyMode && (
            <>
              <Form.Item
                name="tenantName"
                rules={[{ required: true, message: '请输入工厂名称' }]}
                label="工厂名称"
              >
                <Input
                  prefix={<BankOutlined className="site-form-item-icon" />}
                  placeholder="请输入工厂 / 公司名称"
                  size="large"
                  allowClear
                  disabled={submitting}
                />
              </Form.Item>
              <Form.Item
                name="contactName"
                rules={[{ required: true, message: '请输入联系人姓名' }]}
                label="联系人"
              >
                <Input
                  prefix={<IdcardOutlined className="site-form-item-icon" />}
                  placeholder="请输入联系人姓名"
                  size="large"
                  allowClear
                  disabled={submitting}
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
                />
              </Form.Item>
              <Alert
                message="以下账号信息用于审批通过后登录系统"
                type="info"
                showIcon
                style={{ marginBottom: 16, borderRadius: 8 }}
              />
            </>
          )}

          {/* 工厂编码（工厂模式 + 非URL自动填入时显示） */}
          {isFactoryMode && !urlTenantCode && (
            <Form.Item
              name="tenantCode"
              rules={[{ required: true, message: '请输入工厂编码' }]}
              label="工厂编码"
            >
              <Input
                prefix={<ShopOutlined className="site-form-item-icon" />}
                placeholder="请输入工厂编码（向工厂管理员获取）"
                size="large"
                allowClear
                disabled={submitting}
              />
            </Form.Item>
          )}
          {/* URL带入的工厂编码（隐藏字段） */}
          {isFactoryMode && urlTenantCode && (
            <Form.Item name="tenantCode" hidden initialValue={urlTenantCode}>
              <Input />
            </Form.Item>
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
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder="请输入用户名"
              size="large"
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="username"
            />
          </Form.Item>

          {/* 工厂模式需要填真实姓名 */}
          {isFactoryMode && !isApplyMode && (
            <Form.Item
              name="name"
              rules={[{ required: true, message: '请输入真实姓名' }]}
              label="真实姓名"
            >
              <Input
                prefix={<IdcardOutlined className="site-form-item-icon" />}
                placeholder="请输入真实姓名"
                size="large"
                allowClear
                disabled={submitting}
              />
            </Form.Item>
          )}

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
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
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
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
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
              ...(isFactoryMode ? [{ required: true, message: '请输入手机号' } as const] : []),
            ]}
            label={isFactoryMode ? '手机号' : '手机号（选填）'}
            hidden={isApplyMode}
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

          {/* 通用模式有邮箱 */}
          {!isFactoryMode && !isApplyMode && (
            <Form.Item
              name="email"
              rules={[{ type: 'email', message: '请输入正确的邮箱地址' }]}
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
          )}

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
              size="large"
              loading={submitting}
            >
              {isApplyMode ? '提交入驻申请' : isFactoryMode ? '提交注册申请' : '注册'}
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
      </Card>
    </div>
  );
};

export default Register;
