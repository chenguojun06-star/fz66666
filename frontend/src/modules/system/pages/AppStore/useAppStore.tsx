import { useState, useEffect, useCallback } from 'react';
import { App, Form, Modal } from 'antd';
import { useAuth } from '@/utils/AuthContext';
import { appStoreService, ecPlatformConfigService } from '@/services/system/appStore';
import type { MyAppInfo } from '@/services/system/appStore';
import type { AppStoreItem, OrderForm } from './appStoreConstants';
import { EC_PLATFORM_MAP, isEcApp, parseFeatures } from './appStoreConstants';

export function useAppStore() {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [appList, setAppList] = useState<AppStoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppStoreItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [orderVisible, setOrderVisible] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [form] = Form.useForm<OrderForm>();
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState<{
    appKey?: string; appSecret?: string; tenantAppId?: string;
    apiEndpoints?: { method: string; path: string; desc: string }[];
    appCode?: string; appName?: string; trialDays?: number;
  }>({});
  const [setupForm] = Form.useForm();
  const [setupLoading, setSetupLoading] = useState(false);
  const [myApps, setMyApps] = useState<MyAppInfo[]>([]);
  const [myAppsLoading, setMyAppsLoading] = useState(false);

  const fetchAppList = useCallback(async () => {
    setLoading(true);
    try {
      const result: any = await appStoreService.list({ status: 'PUBLISHED' });
      const rawList = Array.isArray(result) ? result : (result?.data ?? []);
      const list = (Array.isArray(rawList) ? rawList : []).map((app: any) => ({
        ...app, features: parseFeatures(app.features),
      }));
      setAppList(list);
    } catch { message.error('加载应用列表失败'); }
    finally { setLoading(false); }
  }, [message]);

  const fetchMyApps = useCallback(async () => {
    setMyAppsLoading(true);
    try {
      const result: any = await appStoreService.getMyApps();
      const data = Array.isArray(result) ? result : (result?.data ?? []);
      setMyApps(Array.isArray(data) ? data : []);
    } catch { /* 可能还没有开通任何应用 */ }
    finally { setMyAppsLoading(false); }
  }, []);

  useEffect(() => { fetchAppList(); fetchMyApps(); }, [fetchAppList, fetchMyApps]);

  const handleAppClick = useCallback((app: AppStoreItem) => { setSelectedApp(app); setDetailVisible(true); }, []);

  const handleBuyClick = useCallback(() => {
    setDetailVisible(false);
    setOrderVisible(true);
    form.resetFields();
    form.setFieldsValue({
      contactName: user?.name || '', contactPhone: user?.phone || '',
      contactEmail: user?.email || '', companyName: user?.tenantName || '',
      userCount: 1, subscriptionType: 'MONTHLY', invoiceRequired: false,
    });
  }, [form, user]);

  const handleTrialClick = useCallback(async () => {
    if (!selectedApp) return;
    setTrialLoading(true);
    try {
      const result = await appStoreService.startTrial(selectedApp.id);
      setDetailVisible(false);
      if (!result?.apiCredentials) {
        message.success(` ${result?.appName || selectedApp.appName} 试用已开通！`);
        fetchMyApps();
        return;
      }
      setWizardData({
        appKey: result.apiCredentials.appKey, appSecret: result.apiCredentials.appSecret,
        tenantAppId: result.apiCredentials.appId, apiEndpoints: result?.apiEndpoints || [],
        appCode: result?.appCode || selectedApp.appCode, appName: result?.appName || selectedApp.appName,
        trialDays: selectedApp.trialDays,
      });
      setWizardStep(0); setupForm.resetFields(); setWizardVisible(true);
    } catch (error: unknown) { message.error(error instanceof Error ? error.message : '开通试用失败'); }
    finally { setTrialLoading(false); }
  }, [selectedApp, message, fetchMyApps, setupForm]);

  const handleSetupComplete = useCallback(async () => {
    try {
      const values = await setupForm.validateFields();
      setSetupLoading(true);
      try {
        if (isEcApp(wizardData.appCode || '')) {
          const ecInfo = EC_PLATFORM_MAP[wizardData.appCode || ''];
          if (ecInfo && values.ecAppKey && values.ecAppSecret) {
            await ecPlatformConfigService.save({
              platformCode: ecInfo.code, shopName: values.shopName || '',
              appKey: values.ecAppKey, appSecret: values.ecAppSecret,
              extraField: values.extraField || '', callbackUrl: values.callbackUrl || '',
            });
          }
          if (wizardData.tenantAppId && values.callbackUrl) {
            await appStoreService.quickSetup(wizardData.tenantAppId, { callbackUrl: values.callbackUrl });
          }
          message.success(`${EC_PLATFORM_MAP[wizardData.appCode || '']?.label || '电商平台'}凭证配置完成！系统已就绪`);
        } else {
          const { callbackUrl, externalApiUrl } = values;
          if ((callbackUrl || externalApiUrl) && wizardData.tenantAppId) {
            await appStoreService.quickSetup(wizardData.tenantAppId, {
              callbackUrl: callbackUrl || undefined, externalApiUrl: externalApiUrl || undefined,
            });
          }
          message.success('配置完成！API对接已就绪');
        }
        setWizardStep(2);
      } catch { message.warning('配置保存失败，您可以稍后在「API对接管理」中配置'); }
      finally { setSetupLoading(false); }
      fetchMyApps();
    } catch { /* form validation */ }
  }, [wizardData, setupForm, message, fetchMyApps]);

  const handleSetupSkip = useCallback(() => {
    message.success('试用已开通！您可以随时在「API对接管理」中完成配置');
    setWizardVisible(false); fetchMyApps();
  }, [message, fetchMyApps]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => message.success('已复制')).catch(() => message.error('复制失败'));
  }, [message]);

  const handleOrderSubmit = useCallback(async () => {
    try {
      const values = await form.validateFields();
      if (!selectedApp || orderSubmitting) return;
      setOrderSubmitting(true);
      await appStoreService.createOrder({ appId: selectedApp.id, appCode: selectedApp.appCode, appName: selectedApp.appName, ...values });
      setOrderVisible(false);
      Modal.success({
        title: '购买意向已提交！', width: 440,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
            <div>商务团队将在 <strong>1-3个工作日</strong> 内联系您确认订单。</div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12 }}>
              <div> 商务电话：400-xxx-xxxx</div>
              <div> 商务邮箱：sales@example.com</div>
            </div>
          </div>
        ),
      });
    } catch (error: unknown) { if (error && typeof error === 'object' && 'errorFields' in error) return; message.error('提交失败'); }
    finally { setOrderSubmitting(false); }
  }, [form, selectedApp, orderSubmitting, message]);

  const isAppActivated = useCallback((appCode: string) => myApps.some(a => a.appCode === appCode && !a.isExpired), [myApps]);

  return {
    appList, loading, selectedApp, detailVisible, setDetailVisible,
    orderVisible, setOrderVisible, trialLoading, orderSubmitting,
    form, wizardVisible, setWizardVisible, wizardStep, setWizardStep,
    wizardData, setupForm, setupLoading, myApps, myAppsLoading,
    handleAppClick, handleBuyClick, handleTrialClick, handleSetupComplete,
    handleSetupSkip, copyToClipboard, handleOrderSubmit, isAppActivated,
  };
}
