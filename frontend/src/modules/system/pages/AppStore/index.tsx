import React from 'react';
import { Card, Row, Col, Tag, Button, Form, Input, Select, InputNumber, Spin, Badge, Alert, Steps, Divider, Typography } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ShoppingCartOutlined, CheckCircleOutlined, FireOutlined, RocketOutlined, GiftOutlined, SettingOutlined, ApiOutlined, CopyOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from './useAppStore';
import { EC_PLATFORM_MAP, MODULE_CONFIG, CATEGORY_LABEL_MAP, isEcApp, parseFeatures } from './appStoreConstants';
import type { AppStoreItem } from './appStoreConstants';
import './index.css';

const { Text } = Typography;

const AppStore: React.FC = () => {
  const navigate = useNavigate();
  const {
    appList, loading, selectedApp, detailVisible, setDetailVisible,
    orderVisible, setOrderVisible, trialLoading, orderSubmitting,
    form, wizardVisible, setWizardVisible, wizardStep, setWizardStep,
    wizardData, setupForm, setupLoading, myApps, myAppsLoading,
    handleAppClick, handleBuyClick, handleTrialClick, handleSetupComplete,
    handleSetupSkip, copyToClipboard, handleOrderSubmit, isAppActivated,
  } = useAppStore();

  const renderAppCard = (app: AppStoreItem) => {
    const activated = isAppActivated(app.appCode);
    const myApp = myApps.find(a => a.appCode === app.appCode);
    return (
      <Col xs={24} sm={12} md={8} lg={6} xl={6} key={app.id}>
        <Badge.Ribbon text={activated ? '已开通' : app.isNew ? '新应用' : app.isHot ? '热门' : ''} color={activated ? 'green' : app.isNew ? 'blue' : 'red'} style={{ display: activated || app.isNew || app.isHot ? 'block' : 'none' }}>
          <Card hoverable className="app-store-card" onClick={() => handleAppClick(app)} cover={<div className="app-icon-container"><span className="app-icon">{app.appIcon}</span></div>}>
            <Card.Meta title={<div className="app-title">{app.appName}{app.isHot && <FireOutlined className="u-ml-8" style={{ color: 'var(--color-danger)' }} />}</div>} description={
              <div className="app-desc">
                <div className="desc-text">{app.appDesc}</div>
                {activated && myApp ? (
                  <div className="u-mt-6">
                    <Tag color={myApp.configured ? 'green' : 'orange'} className="u-fs-14">{myApp.configured ? ' 已配置' : ' 待配置URL'}</Tag>
                    {(myApp.totalCalls ?? 0) > 0 && <Tag className="u-fs-14">调用 {myApp.totalCalls} 次</Tag>}
                  </div>
                ) : (<>
                  {app.trialDays > 0 && <div className="trial-badge"><GiftOutlined className="u-mr-4" />免费试用 {app.trialDays} 天</div>}
                  <div className="price-section"><span className="price-label">月付</span><span className="price-value">¥{app.priceMonthly}</span><span className="price-unit">/月</span></div>
                </>)}
                <Tag color="blue">{CATEGORY_LABEL_MAP[app.category] ?? app.category}</Tag>
              </div>} />
          </Card>
        </Badge.Ribbon>
      </Col>
    );
  };

  const renderMyApps = () => {
    if (myApps.length === 0) return null;
    const needSetup = myApps.filter(a => !a.configured && !a.isExpired);
    return (
      <div className="u-mb-12">
        <div className="u-d-flex u-jc-between u-ai-center u-mb-12">
          <div className="u-fw-600 u-fs-15"><ApiOutlined className="u-mr-6" />我的已开通应用{needSetup.length > 0 && <Tag color="orange" className="u-ml-8 u-fs-14">{needSetup.length} 个待配置</Tag>}</div>
          <Button type="link" onClick={() => navigate('/system/tenant?tab=apps')}>管理全部 →</Button>
        </div>
        <Row gutter={[16, 16]}>
          {myApps.map(app => {
            const cfg = MODULE_CONFIG[app.appCode] || { icon: '', color: 'var(--color-text-tertiary)', urlHint: '' };
            return (
              <Col xs={24} sm={12} md={6} key={app.appCode}>
                <Card hoverable style={{ borderTop: `3px solid ${cfg.color}`, background: app.isExpired ? 'var(--color-bg-container)' : 'var(--color-bg-base)' }} onClick={() => navigate('/system/tenant?tab=apps')}>
                  <div className="u-d-flex u-ai-center u-gap-8 u-mb-8">
                    <span className="u-fs-16">{cfg.icon}</span>
                    <div><div className="u-fw-600 u-fs-14">{app.appName}</div><Tag color={app.isExpired ? 'default' : app.configured ? 'success' : 'warning'} className="u-fs-14">{app.isExpired ? '已过期' : app.configured ? ' 运行中' : ' 待配置'}</Tag></div>
                  </div>
                  {app.appKey && <div className="u-fs-14" style={{ color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>Key: {app.appKey.substring(0, 16)}...</div>}
                  {app.totalCalls != null && <div className="u-fs-14 u-mt-2" style={{ color: 'var(--color-text-secondary)' }}>累计调用 {app.totalCalls} 次{app.dailyQuota ? ` · 今日 ${app.dailyUsed || 0}/${app.dailyQuota}` : ''}</div>}
                </Card>
              </Col>
            );
          })}
        </Row>
      </div>
    );
  };

  return (<>
    <div className="app-store-container">
      <div className="page-header">
        <div><h2>应用商店</h2><p>一键开通API对接，填写您的接口地址即可使用</p></div>
      </div>
      <Spin spinning={myAppsLoading}>{renderMyApps()}</Spin>
      <div className="u-fw-600 u-fs-15 u-mb-12"><ShoppingCartOutlined className="u-mr-6" />全部应用</div>
      <Spin spinning={loading}><Row gutter={[24, 24]}>{(Array.isArray(appList) ? appList : []).map(renderAppCard)}</Row></Spin>

      {/* 应用详情弹窗 */}
      <ResizableModal title={<div className="u-d-flex u-ai-center u-gap-8"><span className="u-fs-15">{selectedApp?.appIcon}</span><span className="u-fs-15">{selectedApp?.appName}</span>{isAppActivated(selectedApp?.appCode || '') && <Tag color="green">已开通</Tag>}</div>}
        open={detailVisible} onCancel={() => setDetailVisible(false)} width="40vw"
        footer={isAppActivated(selectedApp?.appCode || '') ? [<Button key="manage" type="primary" icon={<SettingOutlined />} onClick={() => { setDetailVisible(false); navigate(isEcApp(selectedApp?.appCode || '') ? '/ecommerce/center' : '/system/tenant?tab=apps'); }}>管理配置</Button>] : [
          <Button key="cancel" onClick={() => setDetailVisible(false)}>取消</Button>,
          selectedApp?.trialDays ? <Button key="trial" icon={<GiftOutlined />} loading={trialLoading} onClick={handleTrialClick} style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: 'var(--color-bg-base)' }}>一键开通试用 {selectedApp.trialDays} 天</Button> : null,
          <Button key="buy" type="primary" icon={<ShoppingCartOutlined />} onClick={handleBuyClick}>立即购买</Button>,
        ]}>
        <div className="u-p-8px0">
          <Alert type="success" showIcon icon={<RocketOutlined />} className="u-mb-12 u-fs-14" title={<span className="u-fs-14"><strong>智能对接：</strong>开通后系统自动生成API凭证，您只需填写您的接口地址即可使用</span>} />
          <div className="u-mb-12"><div className="u-fs-14 u-fw-600 u-mb-4" style={{ borderLeft: '3px solid var(--primary-color, var(--color-info))', paddingLeft: 8 }}>应用简介</div><p className="u-fs-14 u-m-0" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{selectedApp?.appDesc}</p></div>
          {selectedApp && MODULE_CONFIG[selectedApp.appCode] && (
            <div className="u-mb-12"><div className="u-fs-14 u-fw-600 u-mb-4" style={{ borderLeft: '3px solid var(--primary-color, var(--color-info))', paddingLeft: 8 }}>开通后自动获得</div>
              <div className="u-br-6 u-p-12 u-fs-14" style={{ background: 'var(--color-slate-50)' }}>
                <div className="u-mb-4"><CheckCircleOutlined className="u-mr-4" style={{ color: 'var(--color-success)' }} />API密钥对（appKey + appSecret）自动生成</div>
                <div className="u-mb-4"><CheckCircleOutlined className="u-mr-4" style={{ color: 'var(--color-success)' }} />HMAC-SHA256 签名鉴权</div>
                <div className="u-mb-4"><CheckCircleOutlined className="u-mr-4" style={{ color: 'var(--color-success)' }} />内部API端点全部自动匹配就绪</div>
                <div><LinkOutlined className="u-mr-4" style={{ color: 'var(--color-primary)' }} />只需填写您的接口地址即可开始使用</div>
              </div></div>
          )}
          {parseFeatures(selectedApp?.features).length > 0 && (
            <div className="u-mb-12"><div className="u-fs-14 u-fw-600 u-mb-4" style={{ borderLeft: '3px solid var(--primary-color, var(--color-info))', paddingLeft: 8 }}>核心功能</div>
              <ul className="u-p-0 u-m-0" style={{ listStyle: 'none' }}>{parseFeatures(selectedApp?.features).map((f: string, i: number) => (<li key={i} className="u-fs-14" style={{ padding: '2px 0' }}><CheckCircleOutlined className="u-mr-6 u-fs-12" style={{ color: 'var(--color-success)' }} />{f}</li>))}</ul></div>
          )}
          <div>
            <div className="u-fs-14 u-fw-600 u-mb-10" style={{ borderLeft: '3px solid var(--primary-color, var(--color-info))', paddingLeft: 8 }}>价格方案</div>
            <div style={{ display: 'grid', gridTemplateColumns: selectedApp?.trialDays ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 10 }}>
              {selectedApp?.trialDays ? (<div className="u-d-flex u-fd-column u-ai-center u-jc-center u-br-10" style={{ padding: '12px 6px', border: '1.5px solid var(--color-success)', background: 'linear-gradient(135deg, var(--status-success-bg) 0%, #d9f7be 100%)', minHeight: 88 }}><GiftOutlined className="u-fs-15 u-mb-4" style={{ color: 'var(--color-success)' }} /><div className="u-fs-14 u-fw-600" style={{ color: '#389e0d', marginBottom: 3 }}>免费试用</div><div className="u-fs-13 u-fw-700" style={{ color: 'var(--color-success)', lineHeight: 1.2 }}>¥0</div><div className="u-fs-14" style={{ color: '#73d13d', marginTop: 3 }}>{selectedApp.trialDays} 天</div></div>) : null}
              <div className="u-d-flex u-fd-column u-ai-center u-jc-center u-br-10" style={{ padding: '12px 6px', border: '1.5px solid var(--color-border-antd)', background: 'var(--color-bg-container)', minHeight: 88 }}><div className="u-fs-14 u-fw-500 u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>月 付</div><div className="u-fs-13 u-fw-700" style={{ color: 'var(--color-primary)', lineHeight: 1.2 }}>¥{selectedApp?.priceMonthly}</div><div className="u-fs-14" style={{ color: 'var(--color-text-quaternary)', marginTop: 3 }}>/ 月</div></div>
              <div className="u-d-flex u-fd-column u-ai-center u-jc-center u-br-10 u-pos-relative" style={{ padding: '12px 6px', border: '1.5px solid var(--color-warning)', background: 'linear-gradient(135deg, #FFFBE6 0%, #E6F4FF 100%)', minHeight: 88 }}><div className="u-pos-absolute u-fw-700" style={{ top: -1, right: -1, background: 'var(--color-warning)', color: 'var(--color-bg-base)', fontSize: 9, padding: '1px 6px', borderRadius: '0 9px 0 8px', letterSpacing: 0.5 }}>推荐</div><div className="u-fs-14 u-fw-600 u-mb-4" style={{ color: '#d48806' }}>年 付</div><div className="u-fs-13 u-fw-700" style={{ color: 'var(--color-warning)', lineHeight: 1.2 }}>¥{selectedApp?.priceYearly}</div><div style={{ fontSize: 9, color: '#ffc53d', marginTop: 3 }}>/ 年 · 省2个月</div></div>
              <div className="u-d-flex u-fd-column u-ai-center u-jc-center u-br-10" style={{ padding: '12px 6px', border: '1.5px solid #adc6ff', background: 'linear-gradient(135deg, #f0f5ff 0%, #d6e4ff 100%)', minHeight: 88 }}><div className="u-fs-14 u-fw-600 u-mb-4" style={{ color: '#2f54eb' }}>买 断</div><div className="u-fs-13 u-fw-700" style={{ color: '#2f54eb', lineHeight: 1.2 }}>¥{selectedApp?.priceOnce}</div><div className="u-fs-14" style={{ color: '#85a5ff', marginTop: 3 }}>永久使用</div></div>
            </div>
          </div>
        </div>
      </ResizableModal>

      {/* 一键开通设置向导 */}
      <ResizableModal title={<div className="u-d-flex u-ai-center u-gap-8"><RocketOutlined style={{ color: 'var(--color-success)' }} /><span>{wizardData.appName} - 智能配置向导</span></div>}
        open={wizardVisible} onCancel={handleSetupSkip} width="40vw" footer={null} maskClosable={false}>
        <Steps current={wizardStep} className="u-mb-12" style={{ padding: '0 20px' }} items={[{ title: 'API凭证' }, { title: '配置地址' }, { title: '完成' }]} />
        {wizardStep === 0 && (<div>
          {wizardData.appKey && wizardData.appSecret ? (<>
            <Alert type="success" showIcon icon={<CheckCircleOutlined />} title="API凭证已自动生成！" description="系统已为您自动创建API密钥并配置好所有内部接口端点。" className="u-mb-16" />
            <div className="u-p-16 u-br-8 u-mb-16" style={{ background: 'var(--color-slate-50)' }}>
              <div className="u-mb-8"><Text type="secondary" className="u-fs-14">AppKey</Text><div className="u-d-flex u-ai-center u-gap-8"><Text code className="u-fs-14 u-fw-600">{wizardData.appKey}</Text><CopyOutlined className="u-cur-pointer" style={{ color: 'var(--color-primary)' }} onClick={() => copyToClipboard(wizardData.appKey || '')} /></div></div>
              <div><Text type="secondary" className="u-fs-14">AppSecret</Text><Alert type="warning" showIcon className="u-fs-14 u-mb-4" style={{ padding: '4px 8px' }} title=" 密镂仅显示一次，请立即保存！" /><div className="u-d-flex u-ai-center u-gap-8"><Text code className="u-fs-14 u-fw-600" style={{ color: 'var(--color-error)' }}>{wizardData.appSecret}</Text><CopyOutlined className="u-cur-pointer" style={{ color: 'var(--color-primary)' }} onClick={() => copyToClipboard(wizardData.appSecret || '')} /></div></div>
            </div></>
          ) : <Alert type="error" showIcon title="API凭证生成失败" description="试用已开通但API凭证创建失败，请前往「API对接管理」手动创建凭证，或联系管理员处理。" className="u-mb-16" />}
          {wizardData.apiEndpoints && wizardData.apiEndpoints.length > 0 && (<div className="u-mb-16"><div className="u-fw-600 u-mb-8 u-fs-14"> 已自动匹配的API端点：</div><div className="u-br-6 u-p-12" style={{ background: 'var(--color-bg-highlight)' }}>{wizardData.apiEndpoints.map((ep, idx) => (<div key={idx} className="u-d-flex u-gap-8 u-fs-14 u-ai-center" style={{ padding: '3px 0' }}><Tag color={ep.method === 'PUSH' ? 'green' : 'blue'} className="u-fs-14 u-ta-center" style={{ minWidth: 44 }}>{ep.method}</Tag><Text code className="u-fs-14">{ep.path}</Text><Text type="secondary" className="u-fs-14">{ep.desc}</Text></div>))}</div></div>)}
          <div className="u-ta-right u-mt-16"><Button className="u-mr-8" onClick={handleSetupSkip}>稍后配置</Button><Button type="primary" icon={<SettingOutlined />} onClick={() => setWizardStep(1)} disabled={!wizardData.tenantAppId}>{wizardData.tenantAppId ? '下一步：填写您的接口地址' : '凭证未就绪，请稍后在管理页配置'}</Button></div>
        </div>)}
        {wizardStep === 1 && (<div>
          {isEcApp(wizardData.appCode || '') ? (<>
            <Alert type="info" showIcon title={`配置${EC_PLATFORM_MAP[wizardData.appCode || '']?.label || '电商平台'}对接凭证`} description="填写平台颁发的AppKey和AppSecret，系统将自动接收平台推单并回传物流信息。" className="u-mb-16" />
            <Form form={setupForm} layout="vertical">
              <Form.Item label="店铺名称" name="shopName"><Input placeholder="请输入店铺名称" /></Form.Item>
              <Form.Item label="AppKey / Client ID" name="ecAppKey" rules={[{ required: true, message: '请输入AppKey' }]}><Input placeholder="平台颁发的AppKey或Client ID" /></Form.Item>
              <Form.Item label="AppSecret / Client Secret" name="ecAppSecret" rules={[{ required: true, message: '请输入AppSecret' }]}><Input.Password placeholder="平台颁发的AppSecret或Client Secret" autoComplete="off" /></Form.Item>
              {EC_PLATFORM_MAP[wizardData.appCode || '']?.extraHint && <Form.Item label={<span>扩展字段<Text type="secondary" className="u-fs-14 u-ml-4">{EC_PLATFORM_MAP[wizardData.appCode || '']?.extraHint}</Text></span>} name="extraField"><Input placeholder={EC_PLATFORM_MAP[wizardData.appCode || '']?.extraHint} /></Form.Item>}
              <Form.Item label={<span>物流回传地址<Text type="secondary" className="u-fs-14 u-ml-4">出库后自动回传物流信息到此地址</Text></span>} name="callbackUrl" rules={[{ type: 'url', message: '请输入正确的URL地址' }]}><Input placeholder="https://open.platform.com/api/logistics/callback" prefix={<LinkOutlined />} /></Form.Item>
            </Form></>
          ) : (<>
            <Alert type="info" showIcon title="只需填写您的接口地址，内部API已全部自动配置好" description="我们会将数据推送到您填写的回调地址。如果您需要主动调用我们的API，使用上一步的凭证即可。" className="u-mb-16" />
            <Form form={setupForm} layout="vertical">
              <Form.Item label={<span>回调地址（Webhook）<Text type="secondary" className="u-fs-14 u-ml-4">我们会向此地址推送数据</Text></span>} name="callbackUrl" rules={[{ type: 'url', message: '请输入正确的URL地址' }]}><Input placeholder={MODULE_CONFIG[wizardData.appCode || '']?.urlHint || 'https://your-system.com/webhook/callback'} prefix={<LinkOutlined />} /></Form.Item>
              <Form.Item label={<span>您的API地址<Text type="secondary" className="u-fs-14 u-ml-4">用于我们主动调用您的系统</Text></span>} name="externalApiUrl" rules={[{ type: 'url', message: '请输入正确的URL地址' }]}><Input placeholder="https://your-system.com/api" prefix={<ApiOutlined />} /></Form.Item>
            </Form>
            <Divider style={{ margin: '16px 0' }} />
            <div className="u-br-6 u-p-12 u-mb-16 u-fs-14" style={{ background: 'var(--color-slate-50)' }}><div className="u-fw-600 u-mb-4"> 不确定填什么？</div><ul className="u-m-0 u-lh-18" style={{ paddingLeft: 16, color: 'var(--color-text-secondary)' }}><li><strong>回调地址</strong>：您系统中接收推送通知的URL</li><li><strong>您的API地址</strong>：我们主动调用您系统的地址</li><li>两个地址都可以稍后再填，不影响试用开通</li></ul></div>
          </>)}
          <div className="u-ta-right"><Button className="u-mr-8" onClick={() => setWizardStep(0)}>上一步</Button><Button className="u-mr-8" onClick={handleSetupSkip}>稍后配置</Button><Button type="primary" loading={setupLoading} onClick={handleSetupComplete}>完成配置</Button></div>
        </div>)}
        {wizardStep === 2 && (<div className="u-ta-center" style={{ padding: '20px 0' }}>
          <CheckCircleOutlined className="u-mb-16" style={{ fontSize: 48, color: 'var(--color-success)' }} />
          <div className="u-fs-14 u-fw-600 u-mb-8"> 对接配置完成！</div>
          <div className="u-fs-14 u-mb-12" style={{ color: 'var(--color-text-secondary)' }}>{wizardData.appName} 已开通{wizardData.trialDays ? ` ${wizardData.trialDays} 天试用` : ''}，API端点已就绪。</div>
          <div className="u-ta-left u-mb-16">
            <Card style={{ borderLeft: '3px solid var(--color-success)' }}>
              <div className="u-fw-600 u-mb-4">已完成</div>
              <ul className="u-m-0 u-fs-14 u-lh-18" style={{ paddingLeft: 16, color: 'var(--color-text-secondary)' }}>
                <li>API凭证自动生成</li>
                <li>内部端点自动匹配</li>
                <li>接口地址已配置</li>
              </ul>
            </Card>
          </div>
          <div className="u-d-flex u-jc-center u-gap-12">
            <Button onClick={() => setWizardVisible(false)}>关闭</Button>
            {isEcApp(wizardData.appCode || '') ? (
              <Button type="primary" icon={<SettingOutlined />} onClick={() => { setWizardVisible(false); navigate('/ecommerce/center'); }}>
                前往电商运营管理平台
              </Button>
            ) : (
              <Button type="primary" onClick={() => setWizardVisible(false)}>
                完成
              </Button>
            )}
          </div>
        </div>)}
      </ResizableModal>

      {/* 购买意向弹窗 */}
      <ResizableModal title={<div className="u-d-flex u-ai-center u-gap-8"><span className="u-fs-14">{selectedApp?.appIcon}</span><span>购买意向 - {selectedApp?.appName}</span></div>}
        open={orderVisible} onCancel={() => setOrderVisible(false)} onOk={handleOrderSubmit} width="40vw" okText="提交意向" cancelText="取消" confirmLoading={orderSubmitting}>
        <div className="u-p-8px0">
          <Alert type="info" showIcon className="u-mb-12 u-fs-14" title="提交后，商务团队将在1-3个工作日内联系您确认并完成开通。" />
          <Form form={form} layout="vertical" initialValues={{ subscriptionType: 'MONTHLY', userCount: 1, invoiceRequired: false }}>
            <Form.Item name="subscriptionType" label="订阅类型"><Select>{selectedApp?.trialDays ? <Select.Option value="TRIAL">免费试用 {selectedApp.trialDays} 天</Select.Option> : null}<Select.Option value="MONTHLY">月付 - ¥{selectedApp?.priceMonthly}/月</Select.Option><Select.Option value="YEARLY">年付 - ¥{selectedApp?.priceYearly}/年</Select.Option><Select.Option value="PERPETUAL">买断 - ¥{selectedApp?.priceOnce}</Select.Option></Select></Form.Item>
            <Form.Item name="userCount" label="用户数量" rules={[{ required: true }]}><InputNumber min={1} max={999} className="u-w-full" /></Form.Item>
            <Form.Item name="contactName" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}><Input placeholder="请输入联系人姓名" /></Form.Item>
            <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, pattern: /^1\d{10}$/, message: '请输入正确的手机号' }]}><Input placeholder="请输入手机号" /></Form.Item>
            <Form.Item name="contactEmail" label="联系邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱' }]}><Input placeholder="请输入邮箱" /></Form.Item>
            <Form.Item name="companyName" label="公司名称"><Input placeholder="请输入公司名称" /></Form.Item>
            <Form.Item name="invoiceRequired" label="是否需要发票"><Select><Select.Option value={false}>不需要</Select.Option><Select.Option value={true}>需要发票</Select.Option></Select></Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.invoiceRequired !== curr.invoiceRequired}>{({ getFieldValue }) => getFieldValue('invoiceRequired') ? (<div><Form.Item name="invoiceTitle" label="发票抬头" rules={[{ required: true }]}><Input placeholder="请输入发票抬头" /></Form.Item><Form.Item name="invoiceTaxNo" label="纳税人识别号" rules={[{ required: true }]}><Input placeholder="请输入纳税人识别号" /></Form.Item></div>) : null}</Form.Item>
          </Form>
        </div>
      </ResizableModal>
    </div>
  </>);
};

export default AppStore;
