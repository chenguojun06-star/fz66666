import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Tag, Button, Modal, Form, Input, Select, InputNumber, App, Spin, Badge, Alert } from 'antd';
import { ShoppingCartOutlined, CheckCircleOutlined, FireOutlined, RocketOutlined, GiftOutlined, BookOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { appStoreService } from '@/services/system/appStore';
import Layout from '@/components/Layout';
import './index.css';

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

  // 加载应用列表
  useEffect(() => {
    fetchAppList();
  }, []);

  const fetchAppList = async () => {
    setLoading(true);
    try {
      const result: any = await appStoreService.list({ status: 'PUBLISHED' });
      // API 返回 Result<T> 格式：{ code: 200, data: [...] }
      const rawList = Array.isArray(result) ? result : (result?.data ?? []);
      // 规范化每个 app 的 features 字段
      const list = (Array.isArray(rawList) ? rawList : []).map((app: any) => ({
        ...app,
        features: parseFeatures(app.features),
      }));
      setAppList(list);
    } catch (error) {
      message.error('加载应用列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 点击应用图标 - 显示详情
  const handleAppClick = (app: AppStoreItem) => {
    setSelectedApp(app);
    setDetailVisible(true);
  };

  // 点击购买按钮
  const handleBuyClick = () => {
    setDetailVisible(false);
    setOrderVisible(true);
    // 不再使用 setFieldsValue，改用 Modal 打开时重置表单
    form.resetFields();
  };

  // 开通免费试用
  const handleTrialClick = async () => {
    if (!selectedApp) return;
    setTrialLoading(true);
    try {
      const result = await appStoreService.startTrial(selectedApp.id);
      setDetailVisible(false);

      // 如果返回了 API 凭证，弹窗显示
      if (result?.apiCredentials) {
        Modal.success({
          title: '🎉 试用开通成功！',
          width: 480,
          content: (
            <div>
              <Alert
                type="warning"
                showIcon
                title="⚠️ 请立即保存以下API密钥，关闭后无法再次查看！"
                style={{ marginBottom: 12, marginTop: 8, fontSize: 12 }}
              />
              <div style={{ background: '#f6f8fa', padding: 12, borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>appKey：</span>
                  <span style={{ fontWeight: 600 }}>{result.apiCredentials.appKey}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--color-text-secondary)' }}>appSecret：</span>
                  <span style={{ fontWeight: 600, color: '#cf1322' }}>{result.apiCredentials.appSecret}</span>
                </div>
              </div>
              <div style={{ marginTop: 12, color: 'var(--color-text-secondary)', fontSize: 13 }}>
                有效期 {selectedApp.trialDays} 天 · 每日100次API调用 ·{' '}
                <a onClick={() => navigate('/system/tenant?tab=guide')}>
                  查看对接教程 →
                </a>
              </div>
            </div>
          ),
        });
      } else {
        message.success(`🎉 ${selectedApp.appName} 免费试用已开通！有效期 ${selectedApp.trialDays} 天`);
      }
    } catch (error: any) {
      message.error(error?.message || '开通试用失败');
    } finally {
      setTrialLoading(false);
    }
  };

  // 提交购买意向
  const handleOrderSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (!selectedApp) return;

      const orderData = {
        appId: selectedApp.id,
        appCode: selectedApp.appCode,
        appName: selectedApp.appName,
        ...values,
      };

      await appStoreService.createOrder(orderData);
      setOrderVisible(false);
      Modal.success({
        title: '购买意向已提交！',
        width: 440,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
            <div>我们的商务团队将在 <strong style={{ color: 'var(--color-text-primary)' }}>1-3个工作日</strong> 内通过您填写的手机号/邮箱与您联系，确认订单并完成开通。</div>
            <div style={{ marginTop: 12, padding: '8px 12px', background: '#f6f8fa', borderRadius: 6, fontSize: 12 }}>
              <div>📞 商务电话：400-xxx-xxxx</div>
              <div>📧 商务邮箱：sales@example.com</div>
              <div style={{ marginTop: 4, color: 'var(--color-text-tertiary)' }}>工作时间：周一至周五 9:00-18:00</div>
            </div>
          </div>
        ),
      });
    } catch (error: any) {
      if (error?.errorFields) return; // 表单校验失败，不提示
      message.error('提交失败，请稍后重试');
    }
  };

  // 渲染应用卡片
  const renderAppCard = (app: AppStoreItem) => (
    <Col xs={24} sm={12} md={8} lg={6} xl={6} key={app.id}>
      <Badge.Ribbon
        text={app.isNew ? '新应用' : app.isHot ? '热门' : ''}
        color={app.isNew ? 'blue' : 'red'}
        style={{ display: app.isNew || app.isHot ? 'block' : 'none' }}
      >
        <Card
          hoverable
          className="app-store-card"
          onClick={() => handleAppClick(app)}
          cover={
            <div className="app-icon-container">
              <span className="app-icon">{app.appIcon}</span>
            </div>
          }
        >
          <Card.Meta
            title={
              <div className="app-title">
                {app.appName}
                {app.isHot && <FireOutlined style={{ color: 'var(--color-danger)', marginLeft: 8 }} />}
                {app.isNew && <RocketOutlined style={{ color: 'var(--color-primary)', marginLeft: 8 }} />}
              </div>
            }
            description={
              <div className="app-desc">
                <div className="desc-text">{app.appDesc}</div>
                {app.trialDays > 0 && (
                  <div className="trial-badge">
                    <GiftOutlined style={{ marginRight: 4 }} />
                    免费试用 {app.trialDays} 天
                  </div>
                )}
                <div className="price-section">
                  <span className="price-label">月付</span>
                  <span className="price-value">¥{app.priceMonthly}</span>
                  <span className="price-unit">/月</span>
                </div>
                <Tag color="blue">{app.category}</Tag>
              </div>
            }
          />
        </Card>
      </Badge.Ribbon>
    </Col>
  );

  return (
    <Layout>
    <div className="app-store-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>应用商店</h2>
          <p>选择适合您企业的应用模块，按需购买，灵活订阅</p>
        </div>
        <Button
          icon={<BookOutlined />}
          onClick={() => navigate('/system/tenant?tab=guide')}
          style={{ marginTop: 4 }}
        >
          查看对接教程
        </Button>
      </div>

      <Spin spinning={loading}>
        <Row gutter={[24, 24]}>
          {(Array.isArray(appList) ? appList : []).map(renderAppCard)}
        </Row>
      </Spin>

      {/* 应用详情弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>{selectedApp?.appIcon}</span>
            <span style={{ fontSize: 15 }}>{selectedApp?.appName}</span>
          </div>
        }
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        width={560}
        footer={[
          <Button key="cancel" size="small" onClick={() => setDetailVisible(false)}>
            取消
          </Button>,
          selectedApp?.trialDays ? (
            <Button
              key="trial"
              size="small"
              icon={<GiftOutlined />}
              loading={trialLoading}
              onClick={handleTrialClick}
              style={{ background: 'var(--color-success)', borderColor: 'var(--color-success)', color: '#fff' }}
            >
              免费试用 {selectedApp.trialDays} 天
            </Button>
          ) : null,
          <Button key="buy" size="small" type="primary" icon={<ShoppingCartOutlined />} onClick={handleBuyClick}>
            立即购买
          </Button>,
        ]}
      >
        <div style={{ padding: '8px 0' }}>
          {selectedApp?.trialDays ? (
            <Alert
              title={`🎁 支持免费试用 ${selectedApp.trialDays} 天，无需付费即可体验全部功能`}
              type="success"
              showIcon
              icon={<GiftOutlined />}
              style={{ marginBottom: 12, fontSize: 12 }}
            />
          ) : null}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--color-text-primary)', borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>应用简介</div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>{selectedApp?.appDesc}</p>
          </div>

          {parseFeatures(selectedApp?.features).length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--color-text-primary)', borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>核心功能</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {parseFeatures(selectedApp?.features).map((feature: string, index: number) => (
                  <li key={index} style={{ padding: '3px 0', fontSize: 12, color: 'var(--color-text-primary)' }}>
                    <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 6, fontSize: 12 }} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--color-text-primary)', borderLeft: '3px solid var(--primary-color, #1890ff)', paddingLeft: 8 }}>价格方案 <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 400 }}>（点击选择）</span></div>
            <Row gutter={8}>
              {selectedApp?.trialDays ? (
                <Col span={6}>
                  <Card size="small" hoverable onClick={() => { setDetailVisible(false); setOrderVisible(true); form.resetFields(); form.setFieldsValue({ subscriptionType: 'TRIAL' }); }} style={{ textAlign: 'center', borderRadius: 6, border: '1px solid #b7eb8f', background: 'rgba(34, 197, 94, 0.15)', cursor: 'pointer' }}>
                    <GiftOutlined style={{ fontSize: 14, color: 'var(--color-success)', marginBottom: 4 }} />
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>免费试用</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-success)' }}>¥0</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{selectedApp.trialDays} 天</div>
                  </Card>
                </Col>
              ) : null}
              <Col span={selectedApp?.trialDays ? 6 : 8}>
                <Card size="small" hoverable onClick={() => { setDetailVisible(false); setOrderVisible(true); form.resetFields(); form.setFieldsValue({ subscriptionType: 'MONTHLY' }); }} style={{ textAlign: 'center', borderRadius: 6, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>月付</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-color, #1890ff)' }}>¥{selectedApp?.priceMonthly}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>/月</div>
                </Card>
              </Col>
              <Col span={selectedApp?.trialDays ? 6 : 8}>
                <Card size="small" hoverable onClick={() => { setDetailVisible(false); setOrderVisible(true); form.resetFields(); form.setFieldsValue({ subscriptionType: 'YEARLY' }); }} style={{ textAlign: 'center', borderRadius: 6, border: '1px solid var(--color-warning)', position: 'relative', cursor: 'pointer' }}>
                  <Tag color="gold" style={{ position: 'absolute', top: -8, right: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>推荐</Tag>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>年付</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-color, #1890ff)' }}>¥{selectedApp?.priceYearly}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>/年</div>
                  <div style={{ fontSize: 10, color: 'var(--color-success)', fontWeight: 600 }}>省 ¥{((selectedApp?.priceMonthly || 0) * 12 - (selectedApp?.priceYearly || 0)).toFixed(0)}</div>
                </Card>
              </Col>
              <Col span={selectedApp?.trialDays ? 6 : 8}>
                <Card size="small" hoverable onClick={() => { setDetailVisible(false); setOrderVisible(true); form.resetFields(); form.setFieldsValue({ subscriptionType: 'PERPETUAL' }); }} style={{ textAlign: 'center', borderRadius: 6, cursor: 'pointer' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>买断</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-color, #1890ff)' }}>¥{selectedApp?.priceOnce}</div>
                  <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>永久</div>
                </Card>
              </Col>
            </Row>
          </div>

          <Alert
            type="info"
            showIcon
            icon={<BookOutlined style={{ fontSize: 12 }} />}
            style={{ fontSize: 12 }}
            title={
              <span style={{ fontSize: 12 }}>
                购买后如何对接？
                <a onClick={() => { setDetailVisible(false); navigate('/system/tenant?tab=guide'); }} style={{ marginLeft: 4 }}>
                  查看API对接教程 →
                </a>
              </span>
            }
          />
        </div>
      </Modal>

      {/* 购买意向弹窗 */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>{selectedApp?.appIcon}</span>
            <span>购买意向 - {selectedApp?.appName}</span>
          </div>
        }
        open={orderVisible}
        onCancel={() => setOrderVisible(false)}
        onOk={handleOrderSubmit}
        width={480}
        okText="提交意向"
        cancelText="取消"
      >
        <div style={{ padding: '8px 0' }}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12, fontSize: 12 }}
            message="提交后，商务团队将在1-3个工作日内联系您确认并完成开通，无需在线支付。"
          />
          <Form
            form={form}
            layout="vertical"
            size="small"
            initialValues={{
              subscriptionType: 'MONTHLY',
              userCount: 1,
              invoiceRequired: false,
            }}
          >
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

            <Form.Item name="contactName" label="联系人" rules={[{ required: true, message: '请输入联系人' }]}>
                <Input placeholder="请输入联系人姓名" />
              </Form.Item>

            <Form.Item name="contactPhone" label="联系电话" rules={[{ required: true, pattern: /^1\d{10}$/, message: '请输入正确的手机号' }]}>
                <Input placeholder="请输入手机号" />
              </Form.Item>

            <Form.Item name="contactEmail" label="联系邮箱" rules={[{ type: 'email', message: '请输入正确的邮箱' }]}>
                <Input placeholder="请输入邮箱" />
              </Form.Item>

            <Form.Item name="companyName" label="公司名称">
                <Input placeholder="请输入公司名称" />
              </Form.Item>

            <Form.Item name="invoiceRequired" label="是否需要发票" valuePropName="checked">
                <Select>
                  <Select.Option value={false}>不需要</Select.Option>
                  <Select.Option value={true}>需要发票</Select.Option>
                </Select>
              </Form.Item>

            <Form.Item noStyle shouldUpdate={(prev, curr) => prev.invoiceRequired !== curr.invoiceRequired}>
              {({ getFieldValue }) =>
                getFieldValue('invoiceRequired') ? (
                  <>
                    <Form.Item name="invoiceTitle" label="发票抬头" rules={[{ required: true }]}>
                        <Input placeholder="请输入发票抬头" />
                      </Form.Item>
                    <Form.Item name="invoiceTaxNo" label="纳税人识别号" rules={[{ required: true }]}>
                        <Input placeholder="请输入纳税人识别号" />
                      </Form.Item>
                  </>
                ) : null
              }
            </Form.Item>
          </Form>
        </div>
      </Modal>
    </div>
    </Layout>
  );
};

export default AppStore;
