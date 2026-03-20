import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Input, Button, Card, Typography, App, AutoComplete } from 'antd';
import { UserOutlined, LockOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import api from '../../utils/api';
import { t } from '../../i18n';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import './styles.css';

const { Title } = Typography;

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

interface TenantOption {
  id: number;
  tenantName: string;
}

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { login } = useAuth();
  const { language } = useAppLanguage();
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

  // 租户列表
  const [tenantsLoading, setTenantsLoading] = useState(true);
  // 当前选中的租户（搜索选中后锁定）
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const tenantsRef = useRef<TenantOption[]>([]);

  // 加载租户列表
  const loadTenants = useCallback(async () => {
    setTenantsLoading(true);
    try {
      const res = await api.get('/system/tenant/public-list') as { code?: number; data?: TenantOption[] };
      if (res?.code === 200 && Array.isArray(res.data)) {
        tenantsRef.current = res.data;
        // 如果只有一个租户，自动选中
        if (res.data.length === 1) {
          setSelectedTenant(res.data[0]);
          form.setFieldsValue({ companySearch: res.data[0].tenantName, tenantId: res.data[0].id });
        } else {
          // 尝试恢复上次选择的租户
          const lastTenantId = localStorage.getItem('lastTenantId');
          if (lastTenantId) {
            const numId = Number(lastTenantId);
            const found = res.data.find(t => t.id === numId);
            if (found) {
              setSelectedTenant(found);
              form.setFieldsValue({ companySearch: found.tenantName, tenantId: found.id });
            }
          }
        }
      }
    } catch {
      // 加载失败静默处理
    } finally {
      setTenantsLoading(false);
    }
  }, [form]);

  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // AutoComplete 搜索过滤
  const [searchOptions, setSearchOptions] = useState<{ value: string; label: React.ReactNode; key: number }[]>([]);

  const handleSearch = useCallback((text: string) => {
    // 如果用户正在编辑已选中的公司名，清除选中状态
    if (selectedTenant && text !== selectedTenant.tenantName) {
      setSelectedTenant(null);
      form.setFieldsValue({ tenantId: undefined });
    }
    if (!text || !text.trim()) {
      // 空输入不显示任何选项，避免默认展开全部
      setSearchOptions([]);
      return;
    }
    const keyword = text.toLowerCase();
    const filtered = tenantsRef.current.filter(t => t.tenantName.toLowerCase().includes(keyword));
    setSearchOptions(filtered.map(t => ({ value: t.tenantName, label: t.tenantName, key: t.id })));
  }, [selectedTenant, form]);

  const handleSelect = useCallback((value: string) => {
    const tenant = tenantsRef.current.find(t => t.tenantName === value);
    if (tenant) {
      setSelectedTenant(tenant);
      form.setFieldsValue({ tenantId: tenant.id, companySearch: tenant.tenantName });
      // 记住选择
      localStorage.setItem('lastTenantId', String(tenant.id));
      localStorage.setItem('lastTenantName', tenant.tenantName);
    }
  }, [form]);

  // 登录表单提交处理
  const handleLogin = async (values: { tenantId: number; companySearch: string; username: string; password: string }) => {
    if (submitting) return;
    if (!selectedTenant) {
      message.error(t('login.companySelectRequired', language));
      return;
    }
    setSubmitting(true);
    try {
      const success = await login(values.username, values.password, selectedTenant.id);
      if (success) {
        message.success(t('login.loginSuccess', language));
        navigate('/dashboard');
      } else {
        message.error(t('login.loginFailed', language));
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t('login.loginFailed', language);
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-bg" aria-hidden="true" />
      <div className="login-constellation" aria-hidden="true">
        <div className="constellation-line" />
        <div className="constellation-glow" />
        <span className="constellation-dot" style={{ left: 41, top: 43 }} />
        <span className="constellation-dot" style={{ left: 82, top: 86 }} />
        <span className="constellation-dot" style={{ left: 116, top: 125 }} />
        <span className="constellation-dot" style={{ left: 156, top: 106 }} />
        <span className="constellation-dot" style={{ left: 197, top: 134 }} />
        <span className="constellation-dot" style={{ left: 231, top: 168 }} />
        <span className="constellation-dot" style={{ left: 265, top: 149 }} />
        <span className="constellation-dot" style={{ left: 292, top: 187 }} />
        <span className="constellation-dot" style={{ left: 313, top: 206 }} />
      </div>
      <Card className="login-card" variant="borderless">
        <div className="login-header">
          <Title level={2} className="login-title">
            {selectedTenant?.tenantName || t('login.brand', language)}
          </Title>
        </div>
        <Form
          form={form}
          name="login"
          onFinish={handleLogin}
          className="login-form"
          layout="vertical"
        >
          {/* 隐藏字段存储实际tenantId */}
          <Form.Item name="tenantId" hidden><Input autoComplete="off" /></Form.Item>
          <Form.Item
            name="companySearch"
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
            label={t('login.company', language)}
            extra={selectedTenant ? <span style={{ color: '#52c41a', fontSize: 12 }}>{t('login.companySelectedPrefix', language)}{selectedTenant.tenantName}</span> : null}
          >
            <AutoComplete
              options={searchOptions}
              onSearch={handleSearch}
              onSelect={handleSelect}
              onFocus={() => { /* 不自动展开，等用户输入后再搜索 */ }}
              placeholder={tenantsLoading ? t('common.loading', language) : t('login.companySearchPlaceholder', language)}
              disabled={submitting || tenantsLoading}
              getPopupContainer={(triggerNode) => triggerNode.parentElement as HTMLElement}
            >
              <Input
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
          <Form.Item
            name="username"
            rules={[{ required: true, message: t('login.usernamePlaceholder', language) }]}
            label={t('login.username', language)}
            htmlFor="login_username"
          >
            <Input
              id="login_username"
              prefix={<UserOutlined className="site-form-item-icon" />}
              placeholder={t('login.usernamePlaceholder', language)}
              size="large"
              autoFocus
              allowClear
              disabled={submitting}
              autoComplete="username"
            />
          </Form.Item>
          <Form.Item
            name="password"
            rules={[{ required: true, message: t('login.passwordPlaceholder', language) }]}
            label={t('login.password', language)}
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
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="login-button"
              size="large"
              loading={submitting}
            >
              {t('login.submit', language)}
            </Button>
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="link"
              onClick={() => navigate('/register')}
              style={{ width: '100%', padding: 0 }}
              disabled={submitting}
            >
              {t('login.noAccount', language)}{t('login.registerNow', language)}
            </Button>
          </Form.Item>
        </Form>
        <div className="login-footer">© {year} {t('login.brand', language)}</div>
        <div className="login-footer" style={{ marginTop: 2, fontSize: 11 }}>
          部署版本：{buildCommit} · 构建时间：{buildTimeText}
        </div>
        <div className="login-footer" style={{ marginTop: 4 }}>
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"
             style={{ color: 'rgba(255,255,255,0.45)' }}>粤ICP备2026026776号-1</a>
        </div>
      </Card>
    </div>
  );
};

export default Login;
