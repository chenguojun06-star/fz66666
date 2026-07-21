import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from 'react';
import { Form, App } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuthState } from '../../utils/AuthContext';
import { getDefaultRouteForUser } from '../../routeConfig';
import api from '../../utils/api';
import { t } from '../../i18n';
import { useAppLanguage } from '../../i18n/useAppLanguage';
import { formatBuildTimeText, getBuildCommit, getRawBuildTime, LoginFormValues, LoginMode, TenantOption } from './helpers';

export interface UseLoginDataReturn {
  form: ReturnType<typeof Form.useForm>[0];
  submitting: boolean;
  loginMode: LoginMode;
  smsSending: boolean;
  smsCountdown: number;
  selectedTenant: TenantOption | null;
  tenantsLoading: boolean;
  searchOptions: { value: string; label: ReactNode; key: number }[];
  year: number;
  buildCommit: string;
  buildTimeText: string;
  handleSearch: (text: string) => void;
  handleSelect: (value: string) => void;
  handleSendSmsCode: () => Promise<void> | void;
  handleLogin: (values: LoginFormValues) => Promise<void>;
  setSelectedTenant: Dispatch<SetStateAction<TenantOption | null>>;
}

export const useLoginData = (): UseLoginDataReturn => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { login, loginWithSms, sendLoginSmsCode } = useAuthState();
  const { language } = useAppLanguage();
  const [submitting, setSubmitting] = useState(false);
  const [loginMode] = useState<LoginMode>('password');
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const { message } = App.useApp();

  const year = useMemo(() => new Date().getFullYear(), []);
  const buildCommit = useMemo(() => getBuildCommit(), []);
  const buildTimeText = useMemo(() => formatBuildTimeText(getRawBuildTime()), []);

  const [tenantsLoading, setTenantsLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<TenantOption | null>(null);
  const tenantsRef = useRef<TenantOption[]>([]);

  const loadTenants = useCallback(async () => {
    setTenantsLoading(true);
    try {
      const res = await api.get('/system/tenant/public-list', { timeout: 8000, retry: -1 } as any) as { code?: number; data?: TenantOption[] };
      if (res?.code === 200 && Array.isArray(res.data)) {
        tenantsRef.current = res.data;
        if (res.data.length === 1) {
          setSelectedTenant(res.data[0]);
          form.setFieldsValue({ companySearch: res.data[0].tenantName, tenantId: res.data[0].id });
        } else {
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

  const [searchOptions, setSearchOptions] = useState<{ value: string; label: ReactNode; key: number }[]>([]);

  const handleSearch = useCallback((text: string) => {
    if (selectedTenant && text !== selectedTenant.tenantName) {
      setSelectedTenant(null);
      form.setFieldsValue({ tenantId: undefined });
    }
    if (!text || !text.trim()) {
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
      localStorage.setItem('lastTenantId', String(tenant.id));
      localStorage.setItem('lastTenantName', tenant.tenantName);
    }
  }, [form]);

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

  const handleLogin = async (values: LoginFormValues) => {
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

  return {
    form,
    submitting,
    loginMode,
    smsSending,
    smsCountdown,
    selectedTenant,
    tenantsLoading,
    searchOptions,
    year,
    buildCommit,
    buildTimeText,
    handleSearch,
    handleSelect,
    handleSendSmsCode,
    handleLogin,
    setSelectedTenant,
  };
};
