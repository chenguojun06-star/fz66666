import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Input, Button, Typography, App, AutoComplete } from 'antd';
import { UserOutlined, LockOutlined, SearchOutlined, SkinOutlined, ScissorOutlined, DeploymentUnitOutlined, AuditOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import { getDefaultRouteForUser } from '../../routeConfig';
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
      const res = await api.get('/system/tenant/public-list', { timeout: 8000, retry: -1 } as any) as { code?: number; data?: TenantOption[] };
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
      const cachedTenantId = Number(localStorage.getItem('lastTenantId') || '');
      const cachedTenantName = String(localStorage.getItem('lastTenantName') || '').trim();
      if (Number.isFinite(cachedTenantId) && cachedTenantId > 0 && cachedTenantName) {
        const cachedTenant = { id: cachedTenantId, tenantName: cachedTenantName };
        setSelectedTenant(cachedTenant);
        form.setFieldsValue({ companySearch: cachedTenantName, tenantId: cachedTenantId });
        tenantsRef.current = [cachedTenant];
      } else {
        message.error('公司列表加载失败，请稍后重试');
      }
    } finally {
      setTenantsLoading(false);
    }
  }, [form, message]);

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
      const { success, user } = await login(values.username, values.password, selectedTenant.id);
      if (success) {
        message.success(t('login.loginSuccess', language));
        navigate(getDefaultRouteForUser(user));
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
    <div className="login-page modern-login-page">
      {/* 左侧：70%科技感展示区 */}
      <div className="login-left-pane">
        <div className="tech-bg" aria-hidden="true">
          <div className="tech-grid" />
          <div className="tech-glow-left" />
          <div className="tech-glow-right" />
        </div>
        <section className="login-showcase">
          <div className="tech-core-container">
             <div className="tech-ring ring-1"></div>
             <div className="tech-ring ring-2 stitch-ring"></div>
             <div className="tech-ring ring-3"></div>
             <div className="tech-orbit orbit-a"></div>
             <div className="tech-orbit orbit-b"></div>
             <div className="signal-node signal-node-1"></div>
             <div className="signal-node signal-node-2"></div>
             <div className="signal-node signal-node-3"></div>
             <div className="tech-core">
               <SkinOutlined />
             </div>
             <div className="small-ai-badge">AI</div>
          </div>
          <div className="login-kicker">MARS INTELLIGENCE</div>
          <Title level={2} className="login-showcase-title">
            智能供应链协同中枢
          </Title>
          <div className="login-showcase-desc">
            围绕订单协同、裁剪排产、工序流转、质检入仓等关键节点，形成可感知、可协同、可预警的服装智能供应链视图。
          </div>
          <div className="login-showcase-points">
            <div className="flow-beam"></div>
            <div className="login-showcase-point">
              <span className="flow-icon"><DeploymentUnitOutlined /></span>
              <span className="flow-label">订单协同</span>
            </div>
            <div className="login-showcase-point">
              <span className="flow-icon"><ScissorOutlined /></span>
              <span className="flow-label">裁剪排产</span>
            </div>
            <div className="login-showcase-point">
              <span className="flow-icon"><SkinOutlined /></span>
              <span className="flow-label">工序流转</span>
            </div>
            <div className="login-showcase-point">
              <span className="flow-icon"><AuditOutlined /></span>
              <span className="flow-label">质检入仓</span>
            </div>
          </div>
        </section>
      </div>

      {/* 右侧：30%表单区 */}
      <div className="login-right-pane">
        <div className="login-form-wrapper">
          <div className="login-header">
            <Title level={2} className="login-title">
              欢迎使用
            </Title>
            <div className="login-subtitle">
              {selectedTenant?.tenantName || t('login.brand', language)}
            </div>
          </div>
          <Form
            form={form}
            name="login"
            onFinish={handleLogin}
            className="login-form"
            labelCol={{ flex: '80px' }}
            wrapperCol={{ flex: 1 }}
            labelAlign="left"
          >
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
              extra={selectedTenant ? <span className="login-company-selected">{t('login.companySelectedPrefix', language)}{selectedTenant.tenantName}</span> : null}
            >
              <AutoComplete
                options={searchOptions}
                onSearch={handleSearch}
                onSelect={handleSelect}
                onFocus={() => undefined}
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
            <Form.Item wrapperCol={{ span: 24 }}>
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
          <div className="login-footer">© {year} {t('login.brand', language)}</div>
          <div className="login-footer" style={{ marginTop: 2, fontSize: 11 }}>
            部署版本：{buildCommit} · 构建时间：{buildTimeText}
          </div>
          <div className="login-footer login-filing">
            <div className="login-filing-row">
              <div className="login-filing-item">
                <img src="/police.png" alt="公安备案图标" className="login-filing-icon" />
                <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011302005352" target="_blank" rel="noopener noreferrer" className="login-filing-link">
                  粤公网安备44011302005352号
                </a>
              </div>
              <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="login-filing-link">
                粤ICP备2026026776号-1
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
