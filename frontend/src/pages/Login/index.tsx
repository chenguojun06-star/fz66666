import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Form, Input, Button, Typography, App, AutoComplete } from 'antd';
import { UserOutlined, LockOutlined, SearchOutlined, PhoneOutlined } from '@ant-design/icons';
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

type LoginMode = 'password' | 'sms';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { login, loginWithSms, sendLoginSmsCode } = useAuth();
  const { language } = useAppLanguage();
  const [submitting, setSubmitting] = useState(false);
  // 当前固定使用账号密码登录；短信登录分支保留在代码中但 UI 切换按钮已移除，
  // 因此 setter 暂时用不到，使用 _ 前缀规避 eslint no-unused-vars（保留类型以便日后恢复）。
  const [loginMode, _setLoginMode] = useState<LoginMode>('password');
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
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

  useEffect(() => {
    if (smsCountdown <= 0) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      setSmsCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [smsCountdown]);

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
  const handleSendSmsCode = useCallback(async () => {
    if (smsSending || smsCountdown > 0) return;
    if (!selectedTenant) {
      message.error(t('login.companySelectRequired', language));
      return;
    }
    try {
      await form.validateFields(['companySearch', 'phone']);
    } catch {
      return;
    }
    const phone = String(form.getFieldValue('phone') || '').trim();
    setSmsSending(true);
    try {
      const result = await sendLoginSmsCode(phone, selectedTenant.id);
      const cooldown = Number(result.cooldownSeconds || 60);
      setSmsCountdown(Number.isFinite(cooldown) && cooldown > 0 ? cooldown : 60);
      if (import.meta.env.DEV && typeof result.debugCode === 'string' && result.debugCode) {
        form.setFieldValue('smsCode', result.debugCode);
      }
      if (import.meta.env.DEV && result.gatewayConfigured === false) {
        message.warning(typeof result.debugCode === 'string' && result.debugCode
          ? `当前环境未配置短信网关，调试验证码：${result.debugCode}`
          : '当前环境未配置短信网关，验证码已写入服务日志');
      } else if (result.gatewayConfigured === false) {
        message.warning('验证码已发送至管理员手机，请联系管理员获取');
      } else {
        message.success('验证码已发送，请注意查收');
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '验证码发送失败，请稍后重试';
      message.error(msg);
    } finally {
      setSmsSending(false);
    }
  }, [form, language, message, selectedTenant, sendLoginSmsCode, smsCountdown, smsSending]);

  const handleLogin = async (values: {
    tenantId: number;
    companySearch: string;
    username?: string;
    password?: string;
    phone?: string;
    smsCode?: string;
  }) => {
    if (submitting) return;
    if (!selectedTenant) {
      message.error(t('login.companySelectRequired', language));
      return;
    }
    setSubmitting(true);
    try {
      const authResult = loginMode === 'password'
        ? await login(String(values.username || '').trim(), String(values.password || '').trim(), selectedTenant.id)
        : await loginWithSms(String(values.phone || '').trim(), String(values.smsCode || '').trim(), selectedTenant.id);
      const { success, user } = authResult;
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
              <div className="login-kicker">MARS｜云裳协同管理</div>
              <Title level={2} className="login-showcase-title">
                云裳智链多端协同
              </Title>
              <div className="login-showcase-desc">
                多厂协同管理, 实时数据看板 ,让交付变得更轻松.
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
                  <span className="tech-float-label">订单在线</span>
                  <strong className="tech-float-value">24h</strong>
                </div>
                <div className="tech-float-card tech-float-card-left">
                  <span className="tech-float-label">排产协同</span>
                  <strong className="tech-float-value">AI Flow</strong>
                </div>
                <div className="tech-float-card tech-float-card-right">
                  <span className="tech-float-label">质检追踪</span>
                  <strong className="tech-float-value">Live</strong>
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
              <span className="highlight-label">统一视图</span>
              <strong className="highlight-value">订单 / 产能 / 交付</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">核心能力</span>
              <strong className="highlight-value">在线协同 · 智能预警</strong>
            </div>
            <div className="showcase-highlight-card">
              <span className="highlight-label">管理目标</span>
              <strong className="highlight-value">提升履约确定性</strong>
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
              <div className="login-subtitle">
                衣智链｜多端协同智能提醒平台
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
                    label={t('login.username', language)}
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
                </>
              ) : (
                <>
                  <Form.Item
                    name="phone"
                    rules={[
                      { required: true, message: '请输入手机号' },
                      { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号' },
                    ]}
                    label="手机号"
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
                    label="验证码"
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
    </div>
  );
};

export default Login;
