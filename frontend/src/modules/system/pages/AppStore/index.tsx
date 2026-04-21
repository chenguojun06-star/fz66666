import React, { useState, useEffect } from 'react';
import { useAuth } from '@/utils/AuthContext';
import { Card, Row, Col, Tag, Button, Form, Input, Select, InputNumber, App, Spin, Badge, Alert, Steps, Divider, Typography, Modal } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ShoppingCartOutlined, CheckCircleOutlined, FireOutlined, RocketOutlined, GiftOutlined, BookOutlined, SettingOutlined, ApiOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { appStoreService } from '@/services/system/appStore';
import type { MyAppInfo } from '@/services/system/appStore';
import './index.css';

const { Text } = Typography;

interface AppStoreItem {
  id: number;
  appCode: string;
  appName: string;
  appIcon: string;
  appDesc: string;
  category: string;
  priceType: string;
  priceMonthly: number;
  priceYearly: number;
  priceOnce: number;
  isHot: boolean;
  isNew: boolean;
  features: string[];
  trialDays: number;
}

interface OrderForm {
  subscriptionType: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'PERPETUAL';
  userCount: number;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  companyName: string;
  invoiceRequired: boolean;
  invoiceTitle?: string;
  invoiceTaxNo?: string;
}

// 模块图标 + 颜色配置
const MODULE_CONFIG: Record<string, { icon: string; color: string; urlHint: string }> = {
  ORDER_SYNC: { icon: '', color: 'var(--color-primary)', urlHint: '如: https://your-erp.com/api/order-callback' },
  QUALITY_FEEDBACK: { icon: '', color: 'var(--color-success)', urlHint: '如: https://your-system.com/webhook/quality' },
  LOGISTICS_SYNC: { icon: '', color: 'var(--color-info)', urlHint: '如: https://your-system.com/webhook/logistics' },
  PAYMENT_SYNC: { icon: '', color: 'var(--color-warning)', urlHint: '如: https://your-finance.com/api/payment' },
  // 电商平台 — 所有 EC_* 均展示「开通后自动获得」区块
  EC_TAOBAO:      { icon: '', color: '#FF6600', urlHint: '如: https://your-system.com/webhook/taobao' },
  EC_TMALL:       { icon: '', color: '#D40016', urlHint: '如: https://your-system.com/webhook/tmall' },
  EC_JD:          { icon: '', color: '#CC0000', urlHint: '如: https://your-system.com/webhook/jd' },
  EC_DOUYIN:      { icon: '', color: '#161823', urlHint: '如: https://your-system.com/webhook/douyin' },
  EC_PINDUODUO:   { icon: '', color: '#CC2B2B', urlHint: '如: https://your-system.com/webhook/pdd' },
  EC_XIAOHONGSHU: { icon: '', color: '#FF2442', urlHint: '如: https://your-system.com/webhook/xiaohongshu' },
  EC_WECHAT_SHOP: { icon: '', color: '#07C160', urlHint: '如: https://your-system.com/webhook/wechat-shop' },
  EC_SHOPIFY:     { icon: '', color: '#5C6AC4', urlHint: '如: https://your-system.com/webhook/shopify' },
  // UI功能模块 — 订阅后直接解锁系统内功能页面，无需配置外部API地址
  CRM_MODULE:  { icon: '', color: 'var(--color-primary)', urlHint: '' },
  FINANCE_TAX: { icon: '', color: 'var(--color-success)', urlHint: '' },
  PROCUREMENT: { icon: '', color: 'var(--color-warning)', urlHint: '' },
};

// 安全解析 features 字段（后端可能返回字符串、JSON字符串或数组）
const parseFeatures = (features: any): string[] => {
  if (Array.isArray(features)) return features;
  if (typeof features === 'string') {
    try {
      const parsed = JSON.parse(features);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 可能是逗号分隔的字符串
      if (features.includes(',')) return features.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (features.trim()) return [features];
    }
  }
  return [];
};

const AppStore: React.FC = () => {
  const [appList, setAppList] = useState<AppStoreItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState<AppStoreItem | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [orderVisible, setOrderVisible] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [form] = Form.useForm<OrderForm>();
  const navigate = useNavigate();
  const { message } = App.useApp();
  const { user } = useAuth();

  // 一键开通向导状态
  const [wizardVisible, setWizardVisible] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardData, setWizardData] = useState<{
    appKey?: string; appSecret?: string; tenantAppId?: string;
    apiEndpoints?: { method: string; path: string; desc: string }[];
    appCode?: string; appName?: string; trialDays?: number;
  }>({});
  const [setupForm] = Form.useForm();
  const [setupLoading, setSetupLoading] = useState(false);

  // 我的已开通应用
  const [myApps, setMyApps] = useState<MyAppInfo[]>([]);
  const [myAppsLoading, setMyAppsLoading] = useState(false);

  useEffect(() => { fetchAppList(); fetchMyApps(); }, []);

  const fetchAppList = async () => {
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
  };

  const fetchMyApps = async () => {
    setMyAppsLoading(true);
    try {
      const result: any = await appStoreService.getMyApps();
      const data = Array.isArray(result) ? result : (result?.data ?? []);
      setMyApps(Array.isArray(data) ? data : []);
    } catch { /* 可能还没有开通任何应用 */ }
    finally { setMyAppsLoading(false); }
  };

  const handleAppClick = (app: AppStoreItem) => { setSelectedApp(app); setDetailVisible(true); };

  const handleBuyClick = () => {
    setDetailVisible(false);
    setOrderVisible(true);
    form.resetFields();
    // 自动预填租户/用户信息
    form.setFieldsValue({
      contactName: user?.name || '',
      contactPhone: user?.phone || '',
      contactEmail: user?.email || '',
      companyName: user?.tenantName || '',
      userCount: 1,
      subscriptionType: 'MONTHLY',
      invoiceRequired: false,
    });
  };

  // 一键开通试用（核心改进：开通 → 向导配置 → 完成）
  const handleTrialClick = async () => {
    if (!selectedApp) return;
    setTrialLoading(true);
    try {
      const result = await appStoreService.startTrial(selectedApp.id);
      setDetailVisible(false);
      // UI 功能模块（采购/CRM/财税）无 API 凭证，直接刷新并提示成功
      if (!result?.apiCredentials) {
        message.success(` ${result?.appName || selectedApp.appName} 试用已开通！`);
        fetchMyApps();
        return;
      }
      setWizardData({
        appKey: result.apiCredentials.appKey,
        appSecret: result.apiCredentials.appSecret,
        tenantAppId: result.apiCredentials.appId,
        apiEndpoints: result?.apiEndpoints || [],
        appCode: result?.appCode || selectedApp.appCode,
        appName: result?.appName || selectedApp.appName,
        trialDays: selectedApp.trialDays,
      });
      setWizardStep(0);
      setupForm.resetFields();
      setWizardVisible(true);
    } catch (error: unknown) { message.error(error instanceof Error ? error.message : '开通试用失败'); }
    finally { setTrialLoading(false); }
  };

  const handleSetupComplete = async () => {
    try {
      const values = await setupForm.validateFields();
      const { callbackUrl, externalApiUrl } = values;
      if ((callbackUrl || externalApiUrl) && wizardData.tenantAppId) {
        setSetupLoading(true);
        try {
          await appStoreService.quickSetup(wizardData.tenantAppId, {
            callbackUrl: callbackUrl || undefined,
            externalApiUrl: externalApiUrl || undefined,
          });
          message.success(' 配置完成！API对接已就绪');
          setWizardStep(2);
        } catch { message.warning('URL保存失败，您可以稍后在「API对接管理」中配置'); }
        finally { setSetupLoading(false); }
      } else {
        message.success(' 试用已开通！您可以稍后配置API地址');
        setWizardStep(2);
      }
      fetchMyApps();
    } catch { /* form validation */ }
  };

  const handleSetupSkip = () => {
    message.success('试用已开通！您可以随时在「API对接管理」中完成配置');
    setWizardVisible(false);
    fetchMyApps();
  };

  const copyToClipboard = (text: string) => { navigator.clipboard.writeText(text).then(() => message.success('已复制')).catch(() => message.error('复制失败')); };

  const handleOrderSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedApp) return;
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
  };

  const isAppActivated = (appCode: string) => myApps.some(a => a.appCode === appCode && !a.isExpired);

  // 渲染应用卡片
  const renderAppCard = (app: AppStoreItem) => {
    const activated = isAppActivated(app.appCode);
    const myApp = myApps.find(a => a.appCode === app.appCode);
    return (
      <Col xs={24} sm={12} md={8} lg={6} xl={6} key={app.id}>
        <Badge.Ribbon
          text={activated ? '已开通' : app.isNew ? '新应用' : app.isHot ? '热门' : ''}
          color={activated ? 'green' : app.isNew ? 'blue' : 'red'}
          style={{ display: activated || app.isNew || app.isHot ? 'block' : 'none' }}
        >
          <Card hoverable className="app-store-card" onClick={() => handleAppClick(app)}
            cover={<div className="app-icon-container"><span className="app-icon">{app.appIcon}</span></div>}
          >
            <Card.Meta
              title={<div className="app-title">{app.appName}{app.isHot && <FireOutlined style={{ color: 'var(--color-danger)', marginLeft: 8 }} />}</div>}
              description={
                <div className="app-desc">
                  <div className="desc-text">{app.appDesc}</div>
                  {activated && myApp ? (
                    <div style={{ marginTop: 6 }}>
                      <Tag color={myApp.configured ? 'green' : 'orange'} style={{ fontSize: 11 }}>
                        {myApp.configured ? ' 已配置' : ' 待配置URL'}
                      </Tag>
                      {(myApp.totalCalls ?? 0) > 0 && <Tag style={{ fontSize: 11 }}>调用 {myApp.totalCalls} 次</Tag>}
                    </div>
                  ) : (
                    <>
                      {app.trialDays > 0 && (
                        <div className="trial-badge"><GiftOutlined style={{ marginRight: 4 }} />免费试用 {app.trialDays} 天</div>
                      )}
                      <div className="price-section">
                        <span className="price-label">月付</span>
                        <span className="price-value">¥{app.priceMonthly}</span>
                        <span className="price-unit">/月</span>
                      </div>
                    </>
                  )}
                  <Tag color="blue">{{
                    ECOMMERCE: '电商对接',
                    CRM: '客户管理',
                    FINANCE: '财务',
                    SUPPLY_CHAIN: '供应链',
                    CORE: '核心对接',
                    PRODUCTION: '生产管理',
                    WAREHOUSE: '成品管理',
                  }[app.category] ?? app.category}</Tag>
                </div>
              }
            />
          </Card>
        </Badge.Ribbon>
      </Col>
    );
  };

  // 渲染已开通应用区域
  const renderMyApps = () => {
    if (myApps.length === 0) return null;
    const needSetup = myApps.filter(a => !a.configured && !a.isExpired);
    return (
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>
            <ApiOutlined style={{ marginRight: 6 }} />我的已开通应用
            {needSetup.length > 0 && <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>{needSetup.length} 个待配置</Tag>}
          </div>
          <Button size="small" type="link" onClick={() => navigate('/system/tenant?tab=apps')}>管理全部 →</Button>
        </div>
        <Row gutter={[16, 16]}>
          {myApps.map(app => {
            const cfg = MODULE_CONFIG[app.appCode] || { icon: '', color: 'var(--color-text-tertiary)', urlHint: '' };
            return (
              <Col xs={24} sm={12} md={6} key={app.appCode}>
                <Card size="small" hoverable
                  style={{ borderTop: `3px solid ${cfg.color}`, background: app.isExpired ? '#fafafa' : '#fff' }}
                  onClick={() => navigate('/system/tenant?tab=apps')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{cfg.icon}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{app.appName}</div>
                      <Tag color={app.isExpired ? 'default' : app.configured ? 'success' : 'warning'} style={{ fontSize: 11 }}>
                        {app.isExpired ? '已过期' : app.configured ? ' 运行中' : ' 待配置'}
                      </Tag>
                    </div>
                  </div>
                  {app.appKey && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                      Key: {app.appKey.substring(0, 16)}...
                    </div>
                  )}
                  {app.totalCalls != null && (
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      累计调用 {app.totalCalls} 次{app.dailyQuota ? ` · 今日 ${app.dailyUsed || 0}/${app.dailyQuota}` : ''}
                    </div>
                  )}
                </Card>
              </Col>
            );
          })}
        </Row>
      </div>
    );
  };

  return (
    <>
    <div className="app-store-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>应用商店</h2>
          <p>一键开通API对接，填写您的接口地址即可使用</p>
        </div>
        <Button icon={<BookOutlined />} onClick={() => navigate('/system/tenant?tab=guide')} style={{ marginTop: 4 }}>
          查看对接教程
        </Button>
      </div>

      {/* 我的已开通应用 */}
      <Spin spinning={myAppsLoading}>{renderMyApps()}</Spin>

      {/* 全部应用 */}
      <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12 }}>
        <ShoppingCartOutlined style={{ marginRight: 6 }} />全部应用
      </div>
      <Spin spinning={loading}>
        <Row gutter={[24, 24]}>{(Array.isArray(appList) ? appList : []).map(renderAppCard)}</Row>
      </Spin>

      {/* 应用详情弹窗 */}
      <ResizableModal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{selectedApp?.appIcon}</span>
            <span style={{ fontSize: 15 }}>{selectedApp?.appName}</span>
            {isAppActivated(selectedApp?.appCode || '') && <Tag color="green">已开通</Tag>}
          </div>
        }
        open={detailVisible} onCancel={() => setDetailVisible(false)} width="40vw"
        footer={
          isAppActivated(selectedApp?.appCode || '') ? [
            <Button key="manage" type="primary" icon={<SettingOutlined />} onClick={() => { setDetailVisible(false); navigate('/system/tenant?tab=apps'); }}>
              管理配置
            </Button>,
          ] : [
            <Button key="cancel" size="small" onClick={() => setDetailVisible(false)}>取消</Button>,
            selectedApp?.trialDays ? (
              <Button key="trial" size="small" icon={<GiftOutlined />} loading={trialLoading} onClick={handleTrialClick}
                style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#fff' }}>
                一键开通试用 {selectedApp.trialDays} 天
              </Button>
            ) : null,
            <Button key="buy" size="small" type="primary" icon={<ShoppingCartOutlined />} onClick={handleBuyClick}>
              立即购买
            </Button>,
          ]
        }
      >
        <div style={{ padding: '8px 0' }}>
          <Alert type="success" showIcon icon={<RocketOutlined />} style={{ marginBottom: 12, fontSize: 12 }}
            title={<span style={{ fontSize: 12 }}><strong>智能对接：</strong>开通后系统自动生成API凭证，您只需填写您的接口地址即可使用</span>}
          />
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>应用简介</div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>{selectedApp?.appDesc}</p>
          </div>
          {selectedApp && MODULE_CONFIG[selectedApp.appCode] && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>开通后自动获得</div>
              <div style={{ background: '#f6f8fa', borderRadius: 6, padding: 12, fontSize: 12 }}>
                <div style={{ marginBottom: 4 }}><CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />API密钥对（appKey + appSecret）自动生成</div>
                <div style={{ marginBottom: 4 }}><CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />HMAC-SHA256 签名鉴权</div>
                <div style={{ marginBottom: 4 }}><CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />内部API端点全部自动匹配就绪</div>
                <div><LinkOutlined style={{ color: 'var(--color-primary)', marginRight: 4 }} />只需填写您的接口地址即可开始使用</div>
              </div>
            </div>
          )}
          {parseFeatures(selectedApp?.features).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>核心功能</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {parseFeatures(selectedApp?.features).map((f: string, i: number) => (
                  <li key={i} style={{ padding: '2px 0', fontSize: 12 }}>
                    <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 6, fontSize: 12 }} />{f}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>价格方案</div>
            <div style={{ display: 'grid', gridTemplateColumns: selectedApp?.trialDays ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 10 }}>
              {/* 免费试用 */}
              {selectedApp?.trialDays ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px', borderRadius: 10, border: '1.5px solid #52c41a', background: 'linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%)', minHeight: 88 }}>
                  <GiftOutlined style={{ fontSize: 15, color: '#52c41a', marginBottom: 4 }} />
                  <div style={{ fontSize: 10, color: '#389e0d', fontWeight: 600, marginBottom: 3 }}>免费试用</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#52c41a', lineHeight: 1.2 }}>¥0</div>
                  <div style={{ fontSize: 10, color: '#73d13d', marginTop: 3 }}>{selectedApp.trialDays} 天</div>
                </div>
              ) : null}
              {/* 月付 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px', borderRadius: 10, border: '1.5px solid #d9d9d9', background: '#fafafa', minHeight: 88 }}>
                <div style={{ fontSize: 10, color: '#8c8c8c', fontWeight: 500, marginBottom: 4 }}>月 付</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1677ff', lineHeight: 1.2 }}>¥{selectedApp?.priceMonthly}</div>
                <div style={{ fontSize: 10, color: '#bfbfbf', marginTop: 3 }}>/ 月</div>
              </div>
              {/* 年付（推荐） */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px', borderRadius: 10, border: '1.5px solid #faad14', background: 'linear-gradient(135deg, #fffbe6 0%, #fff1b8 100%)', minHeight: 88, position: 'relative' }}>
                <div style={{ position: 'absolute', top: -1, right: -1, background: '#faad14', color: '#fff', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: '0 9px 0 8px', letterSpacing: 0.5 }}>推荐</div>
                <div style={{ fontSize: 10, color: '#d48806', fontWeight: 600, marginBottom: 4 }}>年 付</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#fa8c16', lineHeight: 1.2 }}>¥{selectedApp?.priceYearly}</div>
                <div style={{ fontSize: 9, color: '#ffc53d', marginTop: 3 }}>/ 年 · 省2个月</div>
              </div>
              {/* 买断 */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px 6px', borderRadius: 10, border: '1.5px solid #adc6ff', background: 'linear-gradient(135deg, #f0f5ff 0%, #d6e4ff 100%)', minHeight: 88 }}>
                <div style={{ fontSize: 10, color: '#2f54eb', fontWeight: 600, marginBottom: 4 }}>买 断</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#2f54eb', lineHeight: 1.2 }}>¥{selectedApp?.priceOnce}</div>
                <div style={{ fontSize: 10, color: '#85a5ff', marginTop: 3 }}>永久使用</div>
              </div>
            </div>
          </div>
        </div>
      </ResizableModal>

      {/* 一键开通设置向导 */}
      <ResizableModal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RocketOutlined style={{ color: 'var(--color-success)' }} /><span>{wizardData.appName} - 智能配置向导</span></div>}
        open={wizardVisible} onCancel={handleSetupSkip} width="40vw" footer={null} maskClosable={false}
      >
        <Steps current={wizardStep} size="small" style={{ marginBottom: 20, padding: '0 20px' }}
          items={[
            { title: 'API凭证', content: '自动生成' },
            { title: '配置地址', content: '填写您的接口' },
            { title: '完成', content: '开始使用' },
          ]}
        />

        {wizardStep === 0 && (
          <div>
            {wizardData.appKey && wizardData.appSecret ? (
              <>
                <Alert type="success" showIcon icon={<CheckCircleOutlined />}
                  title="API凭证已自动生成！" description="系统已为您自动创建API密钥并配置好所有内部接口端点。"
                  style={{ marginBottom: 16 }} />
                <div style={{ background: '#f6f8fa', padding: 16, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>AppKey</Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text code style={{ fontSize: 13, fontWeight: 600 }}>{wizardData.appKey}</Text>
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => copyToClipboard(wizardData.appKey || '')} />
                    </div>
                  </div>
                  <div>
                    <Text type="secondary" style={{ fontSize: 12 }}>AppSecret</Text>
                    <Alert type="warning" showIcon style={{ padding: '4px 8px', fontSize: 11, marginBottom: 4 }} title=" 密镂仅显示一次，请立即保存！" />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text code style={{ fontSize: 13, fontWeight: 600, color: '#cf1322' }}>{wizardData.appSecret}</Text>
                      <CopyOutlined style={{ cursor: 'pointer', color: 'var(--color-primary)' }} onClick={() => copyToClipboard(wizardData.appSecret || '')} />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <Alert type="error" showIcon
                title="API凭证生成失败"
                description="试用已开通但API凭证创建失败，请前往「API对接管理」手动创建凭证，或联系管理员处理。"
                style={{ marginBottom: 16 }} />
            )}
            {wizardData.apiEndpoints && wizardData.apiEndpoints.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}> 已自动匹配的API端点：</div>
                <div style={{ background: '#f0f5ff', borderRadius: 6, padding: 12 }}>
                  {wizardData.apiEndpoints.map((ep, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 12, alignItems: 'center' }}>
                      <Tag color={ep.method === 'PUSH' ? 'green' : 'blue'} style={{ fontSize: 11, minWidth: 44, textAlign: 'center' }}>{ep.method}</Tag>
                      <Text code style={{ fontSize: 11 }}>{ep.path}</Text>
                      <Text type="secondary" style={{ fontSize: 11 }}>{ep.desc}</Text>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              <Button style={{ marginRight: 8 }} onClick={handleSetupSkip}>稍后配置</Button>
              <Button type="primary" icon={<SettingOutlined />} onClick={() => setWizardStep(1)}
                disabled={!wizardData.tenantAppId}>
                {wizardData.tenantAppId ? '下一步：填写您的接口地址' : '凭证未就绪，请稍后在管理页配置'}
              </Button>
            </div>
          </div>
        )}

        {wizardStep === 1 && (
          <div>
            <Alert type="info" showIcon title="只需填写您的接口地址，内部API已全部自动配置好"
              description="我们会将数据推送到您填写的回调地址。如果您需要主动调用我们的API，使用上一步的凭证即可。"
              style={{ marginBottom: 16 }} />
            <Form form={setupForm} layout="vertical" size="small">
              <Form.Item
                label={<span>回调地址（Webhook）<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>我们会向此地址推送数据</Text></span>}
                name="callbackUrl" rules={[{ type: 'url', message: '请输入正确的URL地址' }]}
              >
                <Input placeholder={MODULE_CONFIG[wizardData.appCode || '']?.urlHint || 'https://your-system.com/webhook/callback'} prefix={<LinkOutlined />} />
              </Form.Item>
              <Form.Item
                label={<span>您的API地址<Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>用于我们主动调用您的系统</Text></span>}
                name="externalApiUrl" rules={[{ type: 'url', message: '请输入正确的URL地址' }]}
              >
                <Input placeholder="https://your-system.com/api" prefix={<ApiOutlined />} />
              </Form.Item>
            </Form>
            <Divider style={{ margin: '16px 0' }} />
            <div style={{ background: '#f6f8fa', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}> 不确定填什么？</div>
              <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                <li><strong>回调地址</strong>：您系统中接收推送通知的URL（如质检结果、物流信息）</li>
                <li><strong>您的API地址</strong>：我们主动调用您系统的地址（如查询订单状态）</li>
                <li>两个地址都可以稍后再填，不影响试用开通</li>
              </ul>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Button style={{ marginRight: 8 }} onClick={() => setWizardStep(0)}>上一步</Button>
              <Button style={{ marginRight: 8 }} onClick={handleSetupSkip}>稍后配置</Button>
              <Button type="primary" loading={setupLoading} onClick={handleSetupComplete}>完成配置</Button>
            </div>
          </div>
        )}

        {wizardStep === 2 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircleOutlined style={{ fontSize: 48, color: 'var(--color-success)', marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}> 对接配置完成！</div>
            <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 24 }}>
              {wizardData.appName} 已开通{wizardData.trialDays ? ` ${wizardData.trialDays} 天试用` : ''}，API端点已就绪。
            </div>
            <Row gutter={16} style={{ textAlign: 'left', marginBottom: 24 }}>
              <Col span={12}>
                <Card size="small" style={{ borderLeft: '3px solid var(--color-success)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}> 已完成</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                    <li>API凭证自动生成</li><li>内部端点自动匹配</li><li>接口地址已配置</li>
                  </ul>
                </Card>
              </Col>
              <Col span={12}>
                <Card size="small" style={{ borderLeft: '3px solid var(--color-primary)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}> 下一步</div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                    <li>查看对接教程了解详情</li><li>在您的系统中集成API</li><li>发送第一个请求测试</li>
                  </ul>
                </Card>
              </Col>
            </Row>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
              <Button onClick={() => setWizardVisible(false)}>关闭</Button>
              <Button type="primary" icon={<BookOutlined />} onClick={() => { setWizardVisible(false); navigate('/system/tenant?tab=guide'); }}>查看对接教程</Button>
            </div>
          </div>
        )}
      </ResizableModal>

      {/* 购买意向弹窗 */}
      <ResizableModal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 18 }}>{selectedApp?.appIcon}</span><span>购买意向 - {selectedApp?.appName}</span></div>}
        open={orderVisible} onCancel={() => setOrderVisible(false)} onOk={handleOrderSubmit} width="40vw" okText="提交意向" cancelText="取消"
      >
        <div style={{ padding: '8px 0' }}>
          <Alert type="info" showIcon style={{ marginBottom: 12, fontSize: 12 }} title="提交后，商务团队将在1-3个工作日内联系您确认并完成开通。" />
          <Form form={form} layout="vertical" size="small" initialValues={{ subscriptionType: 'MONTHLY', userCount: 1, invoiceRequired: false }}>
            <Form.Item name="subscriptionType" label="订阅类型">
              <Select>
                {selectedApp?.trialDays ? <Select.Option value="TRIAL">免费试用 {selectedApp.trialDays} 天</Select.Option> : null}
                <Select.Option value="MONTHLY">月付 - ¥{selectedApp?.priceMonthly}/月</Select.Option>
                <Select.Option value="YEARLY">年付 - ¥{selectedApp?.priceYearly}/年</Select.Option>
                <Select.Option value="PERPETUAL">买断 - ¥{selectedApp?.priceOnce}</Select.Option>
              </Select>
            </Form.Item>
            <Form.Item name="userCount" label="用户数量" rules={[{ required: true }]}>
              <InputNumber min={1} max={999} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="contactName" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}><Input placeholder="请输入联系人姓名" /></Form.Item>
            <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, pattern: /^1\d{10}$/, message: '请输入正确的手机号' }]}><Input placeholder="请输入手机号" /></Form.Item>
            <Form.Item name="contactEmail" label="联系邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱' }]}><Input placeholder="请输入邮箱" /></Form.Item>
            <Form.Item name="companyName" label="公司名称"><Input placeholder="请输入公司名称" /></Form.Item>
            <Form.Item name="invoiceRequired" label="是否需要发票">
              <Select><Select.Option value={false}>不需要</Select.Option><Select.Option value={true}>需要发票</Select.Option></Select>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.invoiceRequired !== curr.invoiceRequired}>
              {({ getFieldValue }) => getFieldValue('invoiceRequired') ? (
                <div>
                  <Form.Item name="invoiceTitle" label="发票抬头" rules={[{ required: true }]}><Input placeholder="请输入发票抬头" /></Form.Item>
                  <Form.Item name="invoiceTaxNo" label="纳税人识别号" rules={[{ required: true }]}><Input placeholder="请输入纳税人识别号" /></Form.Item>
                </div>
              ) : null}
            </Form.Item>
          </Form>
        </div>
      </ResizableModal>

    </div>
    </>
  );
};

export default AppStore;
