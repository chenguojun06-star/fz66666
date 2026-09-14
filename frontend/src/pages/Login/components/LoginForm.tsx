import React from 'react';
import { Form, Input, Button, AutoComplete, FormInstance } from 'antd';
import { UserOutlined, LockOutlined, SearchOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { t } from '../../../i18n';
import { useAppLanguage } from '../../../i18n/useAppLanguage';
import { LoginFormValues, LoginMode, TenantOption } from '../helpers';

interface LoginFormProps {
  form: FormInstance;
  submitting: boolean;
  loginMode: LoginMode;
  smsSending: boolean;
  smsCountdown: number;
  selectedTenant: TenantOption | null;
  tenantsLoading: boolean;
  searchOptions: { value: string; label: React.ReactNode; key: number }[];
  handleSearch: (text: string) => void;
  handleSelect: (value: string) => void;
  handleSendSmsCode: () => Promise<void> | void;
  handleLogin: (values: LoginFormValues) => Promise<void>;
  setSelectedTenant: React.Dispatch<React.SetStateAction<TenantOption | null>>;
}

const LoginForm: React.FC<LoginFormProps> = ({
  form,
  submitting,
  loginMode,
  smsSending,
  smsCountdown,
  selectedTenant,
  tenantsLoading,
  searchOptions,
  handleSearch,
  handleSelect,
  handleSendSmsCode,
  handleLogin,
  setSelectedTenant,
}) => {
  const navigate = useNavigate();
  const { language } = useAppLanguage();

  return (
    <Form
      form={form}
      name="login"
      onFinish={handleLogin}
      className="login-form"
      layout="vertical"
    >
      <Form.Item name="tenantId" hidden><Input autoComplete="off" /></Form.Item>
      <Form.Item
        name="companySearch"
        htmlFor="login_companySearch"
        rules={[
          { required: true, message: t('login.companySelectRequired', language) },
          {
            validator: (_, value) => {
              if (value && !selectedTenant) {
                return Promise.reject(t('login.companySelectFromResult', language));
              }
              return Promise.resolve();
            },
          },
        ]}
        validateTrigger={['onBlur', 'onSubmit']}
        extra={selectedTenant ? <span className="login-company-selected">{t('login.companySelectedPrefix', language)}{selectedTenant.tenantName}</span> : null}
      >
        <AutoComplete
          options={searchOptions}
          onSearch={handleSearch}
          onSelect={handleSelect}
          onFocus={() => undefined}
          placeholder={tenantsLoading ? t('common.loading', language) : t('login.companySearchPlaceholder', language)}
          disabled={submitting || tenantsLoading}
        >
          <Input
            id="login_companySearch"
            prefix={<SearchOutlined className="site-form-item-icon" />}
            size="large"
            allowClear
            autoComplete="off"
            onClear={() => {
              setSelectedTenant(null);
              form.setFieldsValue({ tenantId: undefined });
            }}
          />
        </AutoComplete>
      </Form.Item>
      {loginMode === 'password' ? (
        <>
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.usernamePlaceholder', language) }]}
            htmlFor="login_username"
          >
            <Input
              id="login_username"
              prefix={<UserOutlined className="site-form-item-icon" />}
              size="large"
              placeholder={t('login.usernamePlaceholder', language)}
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.passwordPlaceholder', language) }]}
            htmlFor="login_password"
          >
            <Input.Password
              id="login_password"
              prefix={<LockOutlined className="site-form-item-icon" />}
              placeholder={t('login.passwordPlaceholder', language)}
              size="large"
              disabled={submitting}
              autoComplete="current-password"
            />
          </Form.Item>
        </>
      ) : (
        <>
          <Form.Item
            name="phone"
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
            ]}
            htmlFor="login_phone"
          >
            <Input
              id="login_phone"
              prefix={<PhoneOutlined className="site-form-item-icon" />}
              size="large"
              placeholder="请输入手机号"
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="tel"
            />
          </Form.Item>
          <Form.Item
            name="smsCode"
            rules={[{ required: true, message: '请输入验证码' }]}
            htmlFor="login_sms_code"
          >
            <div className="login-code-row">
              <Input
                id="login_sms_code"
                prefix={<LockOutlined className="site-form-item-icon" />}
                size="large"
                placeholder="请输入验证码"
                disabled={submitting}
                autoComplete="one-time-code"
              />
              <Button
                type="default"
                className="login-code-button"
                onClick={handleSendSmsCode}
                loading={smsSending}
                disabled={submitting || smsSending || smsCountdown > 0}
              >
                {smsCountdown > 0 ? `${smsCountdown}s 后重试` : '获取验证码'}
              </Button>
            </div>
          </Form.Item>
        </>
      )}
      <Form.Item wrapperCol={{ span: 24 }}>
        <Button
          type="primary"
          htmlType="submit"
          className="login-button"
          size="large"
          loading={submitting}
        >
          {loginMode === 'password' ? t('login.submit', language) : '验证码登录'}
        </Button>
      </Form.Item>
      <Form.Item wrapperCol={{ span: 24 }} style={{ marginBottom: 0 }}>
        <Button
          type="link"
          onClick={() => navigate('/register')}
          className="login-register-button"
          disabled={submitting}
        >
          {t('login.noAccount', language)}{t('login.registerNow', language)}
        </Button>
      </Form.Item>
    </Form>
  );
};

export default LoginForm;
