import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Badge, Statistic, Button, Tag, Spin, Modal, Form,
  Input, Alert, Descriptions, List, Divider, Tooltip, Space, Empty, Typography, Steps,
} from 'antd';
import {
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  SettingOutlined, SyncOutlined, ApiOutlined, LinkOutlined,
  CloudUploadOutlined, CloudOutlined, ThunderboltOutlined,
  KeyOutlined, SafetyCertificateOutlined, ShopOutlined,
  ShoppingCartOutlined, DollarOutlined,
  QuestionCircleOutlined, NumberOutlined,
} from '@ant-design/icons';
import { usePlatformConnector } from './usePlatformConnector';
import type { ShopStats } from './usePlatformConnector';
import {
  PLATFORM_LIST, SYNC_MODE_LABELS, type PlatformMeta,
} from './PlatformConnectorConstants';
import { message } from '@/utils/antdStatic';

const { Text, Paragraph } = Typography;

const IconMap: Record<string, React.ReactNode> = {
  cloud: <CloudOutlined />,
  shop: <ShopOutlined />,
  tb: <ApiOutlined />, dy: <ApiOutlined />, jd: <ApiOutlined />,
  tm: <ApiOutlined />, pdd: <ApiOutlined />, xhs: <ApiOutlined />,
  wx: <ApiOutlined />, sf: <ApiOutlined />,
};
const renderIcon = (iconName: string): React.ReactNode => IconMap[iconName] || <ApiOutlined />;

interface ShopInfo {
  shopId: string;
  shopName: string;
  platform: string;
  status: string;
}

// ============================================================
// 凭证获取教程内容
// ============================================================
const CREDENTIAL_GUIDES: Record<string, { title: string; steps: { title: string; description: string }[]; docUrl: string }> = {
  JST: {
    title: '如何获取聚水潭 AppKey 和 AppSecret？',
    steps: [
      { title: '登录聚水潭开放平台', description: '打开 open.jushuitan.com，使用企业账号登录' },
      { title: '创建应用', description: '进入「开发者中心」→「应用管理」→「创建应用」，选择"自研ERP对接"，填写应用名称和回调地址（填写成为本系统的 Webhook 地址）' },
      { title: '获取凭证', description: '应用审核通过后，在应用详情页复制 AppKey 和 AppSecret' },
      { title: '填写到本系统', description: '将 AppKey 和 AppSecret 填入下方表单，点击"保存并测试连接"' },
      { title: '授权店铺数据', description: '在聚水潭应用管理中，授权需要同步的店铺。系统会自动发现并拉取这些店铺的订单数据' },
    ],
    docUrl: 'https://open.jushuitan.com',
  },
  DONGFANG: {
    title: '如何获取东纺纺织 API 密钥？',
    steps: [
      { title: '联系东纺纺织平台', description: '联系东纺纺织客户经理，申请 API 对接权限' },
      { title: '获取 API 凭证', description: '平台会下发 AppKey 和 AppSecret，同时配置数据同步范围（面料/供应商/订单）' },
      { title: '填写到本系统', description: '将获取到的 AppKey 和 AppSecret 填入下方表单' },
      { title: '配置回调', description: '将本系统生成的 Webhook 地址提供给东纺纺织，完成双向对接' },
    ],
    docUrl: '',
  },
  DEFAULT: {
    title: '如何获取平台的 API 凭证？',
    steps: [
      { title: '打开平台开放平台', description: '登录该平台的开放平台/开发者中心' },
      { title: '创建应用/获取密钥', description: '创建对接应用，获取 AppKey 和 AppSecret' },
      { title: '填写到本系统', description: '将获取到的凭证填入下方表单' },
      { title: '配置回调地址', description: '将本系统的 Webhook 地址配置到平台的回调URL中' },
    ],
    docUrl: '',
  },
};

// ============================================================
// 主组件
// ============================================================
const PlatformConnectorTab: React.FC<{ active: boolean }> = ({ active }) => {
  const { loading, testing, syncing, saveConfig, getStatus, getShopStats, testConnection, syncNow } = usePlatformConnector();

  const [statusMap, setStatusMap] = useState<Record<string, { configured: boolean; status: string }>>({});
  const [shopStatsMap, setShopStatsMap] = useState<Record<string, ShopStats | null>>({});

  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [activePlatform, setActivePlatform] = useState<PlatformMeta | null>(null);
  const [activeStats, setActiveStats] = useState<ShopStats | null>(null);

  const [testResult, setTestResult] = useState<{ success: boolean; message: string; shops?: ShopInfo[]; supportedActions?: string[] } | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced?: number; skipped?: number } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const [form] = Form.useForm();

  // 加载所有平台状态
  const loadAllStatus = useCallback(async () => {
    const map: Record<string, { configured: boolean; status: string }> = {};
    const statsMap: Record<string, ShopStats | null> = {};
    for (const p of PLATFORM_LIST) {
      try {
        const s = await getStatus(p.code);
        map[p.code] = { configured: s.configured, status: s.status };
        if (s.configured) {
          try { statsMap[p.code] = await getShopStats(p.code); } catch { statsMap[p.code] = null; }
        }
      } catch {
        map[p.code] = { configured: false, status: 'DISCONNECTED' };
      }
    }
    setStatusMap(map);
    setShopStatsMap(statsMap);
  }, [getStatus, getShopStats]);

  useEffect(() => { if (active) { loadAllStatus(); } }, [active, loadAllStatus]);

  const stats = useMemo(() => {
    const total = PLATFORM_LIST.length;
    const connected = Object.values(statusMap).filter(s => s.configured).length;
    const todayOrders = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.todayOrders ?? 0), 0);
    const todaySales = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (parseFloat(s?.todaySales ?? '0')), 0);
    return { total, connected, todayOrders, todaySales };
  }, [statusMap, shopStatsMap]);

  // 打开配置
  const handleConfig = (p: PlatformMeta) => {
    setActivePlatform(p);
    form.resetFields();
    form.setFieldsValue({ appKey: '', appSecret: '' });
    setTestResult(null);
    setShowGuide(false);
    setConfigModalOpen(true);
  };

  // 保存凭证
  const handleSave = async () => {
    if (!activePlatform) return;
    try {
      const values = await form.validateFields();
      await saveConfig(activePlatform.code, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
      message.success(`${activePlatform.name} 凭证已保存`);
      setConfigModalOpen(false);
      loadAllStatus();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败');
    }
  };

  // 连接测试
  const handleTest = async () => {
    if (!activePlatform) return;
    try {
      const values = await form.validateFields();
      await saveConfig(activePlatform.code, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
    } catch (e: any) {
      if (e?.errorFields) { message.warning('请先填写凭证'); return; }
    }
    const result = await testConnection(activePlatform.code);
    setTestResult(result);
    setTestModalOpen(true);
    loadAllStatus();
  };

  // 手动同步
  const handleSync = async (p: PlatformMeta) => {
    setActivePlatform(p);
    setSyncResult(null);
    try {
      const r = await syncNow(p.code);
      setSyncResult(r);
      loadAllStatus();
    } catch { /* handled in hook */ }
  };

  // 查看店铺数据
  const handleViewStats = async (p: PlatformMeta) => {
    setActivePlatform(p);
    setStatsModalOpen(true);
    try {
      const s = await getShopStats(p.code);
      setActiveStats(s);
      setShopStatsMap(prev => ({ ...prev, [p.code]: s }));
    } catch { setActiveStats(null); }
  };

  const modeLabel = (mode: 'pull' | 'webhook' | 'both') => {
    const colorMap = { pull: 'blue', webhook: 'green', both: 'purple' };
    return <Tag color={colorMap[mode]}>{SYNC_MODE_LABELS[mode]}</Tag>;
  };

  // 凭证获取教程
  const guide = activePlatform ? (CREDENTIAL_GUIDES[activePlatform.code] || CREDENTIAL_GUIDES.DEFAULT) : CREDENTIAL_GUIDES.DEFAULT;

  // 平台卡片
  const renderPlatformCard = (p: PlatformMeta) => {
    const status = statusMap[p.code];
    const isConfigured = status?.configured;
    const isConnected = status?.status === 'ACTIVE' || status?.status === 'CONNECTED';
    const statsData = shopStatsMap[p.code];

    const statusDot = !status ? { color: '#d9d9d9', icon: <CloseCircleOutlined />, text: '未配置' }
      : isConfigured && isConnected ? { color: '#52c41a', icon: <CheckCircleOutlined />, text: '已连接' }
      : isConfigured ? { color: '#fa8c16', icon: <WarningOutlined />, text: '已配置' }
      : { color: '#d9d9d9', icon: <CloseCircleOutlined />, text: '未配置' };

    return (
      <Col key={p.code} xs={24} sm={12} lg={8} xl={6}>
        <Badge.Ribbon
          text={p.syncMode === 'pull' ? '主动同步' : 'Webhook'}
          color={p.syncMode === 'pull' ? 'blue' : 'green'}
          style={{ opacity: 0.85 }}
        >
          <Card hoverable style={{ borderRadius: 12, height: '100%' }} styles={{ body: { padding: '20px 16px 12px' } }}>
            {/* 头部 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <Space size={8}>
                <span style={{ fontSize: 24 }}>{renderIcon(p.icon)}</span>
                <Text strong style={{ fontSize: 16 }}>{p.name}</Text>
              </Space>
              <Tag icon={statusDot.icon} color={isConfigured && isConnected ? 'success' : isConfigured ? 'warning' : 'default'} style={{ margin: 0 }}>
                {statusDot.text}
              </Tag>
            </div>

            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 8, minHeight: 36 }}>{p.desc}</Paragraph>
            <div style={{ marginBottom: 8 }}>{modeLabel(p.syncMode)}</div>

            {/* 功能标签 */}
            <div style={{ marginBottom: 8 }}>
              {p.features.slice(0, 3).map(f => (<Tag key={f} style={{ marginBottom: 4, fontSize: 11 }}>{f}</Tag>))}
              {p.features.length > 3 && (
                <Tooltip title={p.features.slice(3).join('、')}><Tag style={{ fontSize: 11 }}>+{p.features.length - 3}</Tag></Tooltip>
              )}
            </div>

            {/* 连接后的迷你数据 */}
            {isConfigured && statsData && (
              <Row gutter={8} style={{ marginBottom: 8 }}>
                <Col span={12}>
                  <div style={{ fontSize: 11, color: '#888' }}>今日订单</div>
                  <Text strong style={{ color: '#1677ff' }}>{statsData.todayOrders}</Text>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 11, color: '#888' }}>今日销售额</div>
                  <Text strong style={{ color: '#52c41a' }}>¥{statsData.todaySales}</Text>
                </Col>
              </Row>
            )}

            <Divider style={{ margin: '8px 0' }} />
            <Space orientation="vertical" style={{ width: '100%' }} size={6}>
              <Button type={isConfigured ? 'default' : 'primary'} icon={<SettingOutlined />} block size="small" onClick={() => handleConfig(p)}>
                {isConfigured ? '修改凭证' : '配置连接'}
              </Button>
              {isConfigured && (
                <Button icon={<ThunderboltOutlined />} block size="small" loading={testing} onClick={() => { setActivePlatform(p); setTestResult(null); handleTest(); }}>连接测试</Button>
              )}
              {isConfigured && (
                <Button icon={<NumberOutlined />} block size="small" onClick={() => handleViewStats(p)}>店铺数据</Button>
              )}
              {isConfigured && p.syncMode === 'pull' && (
                <Button icon={<SyncOutlined />} block size="small" loading={syncing && activePlatform?.code === p.code} onClick={() => handleSync(p)}>同步订单</Button>
              )}
              {p.docUrl && (
                <Button type="link" size="small" icon={<LinkOutlined />} block onClick={() => window.open(p.docUrl, '_blank')} style={{ padding: 0 }}>开放平台文档</Button>
              )}
            </Space>
          </Card>
        </Badge.Ribbon>
      </Col>
    );
  };

  return (
    <Spin spinning={loading}>
      <div style={{ padding: '0 8px' }}>
        {/* ====== 数据总览 ====== */}
        <Row gutter={16} style={{ marginBottom: 24, marginTop: 16 }}>
          <Col span={6}>
            <Card size="small" variant="borderless" style={{ background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)', borderRadius: 12 }}>
              <Statistic title="已对接平台" value={stats.connected} suffix={`/ ${stats.total}`} prefix={<ApiOutlined style={{ color: '#1677ff' }} />} styles={{ content: { color: '#1677ff' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" variant="borderless" style={{ background: 'linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日总订单" value={stats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: '#52c41a' }} />} styles={{ content: { color: '#52c41a' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" variant="borderless" style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日销售额" value={stats.todaySales.toFixed(2)} prefix={<DollarOutlined style={{ color: '#fa8c16' }} />} suffix="元" styles={{ content: { color: '#fa8c16' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small" variant="borderless" style={{ background: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
              <Statistic title="平台总数" value={PLATFORM_LIST.length} suffix="个" prefix={<CloudUploadOutlined style={{ color: '#722ed1' }} />} styles={{ content: { color: '#722ed1' } }} />
            </Card>
          </Col>
        </Row>

        <Alert type="info" showIcon style={{ marginBottom: 20, borderRadius: 8 }}
          message={<span>选择一个电商/ERP平台，填写 AppKey 和 AppSecret 即可自动对接。支持 <strong>主动拉取</strong> 和 <strong>Webhook 推送</strong>。<span style={{ color: '#fa8c16' }}>不知道怎么获取凭证？点击「配置连接」→「如何获取凭证？」查看教程。</span></span>}
        />
        <Row gutter={[16, 16]}>{PLATFORM_LIST.map(renderPlatformCard)}</Row>
        {stats.connected === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对接任何平台" style={{ marginTop: 40 }}>
            <Button type="primary" onClick={() => PLATFORM_LIST[0] && handleConfig(PLATFORM_LIST[0])}>立即配置</Button>
          </Empty>
        )}

        {/* ====== 配置弹窗 ====== */}
        <Modal
          open={configModalOpen}
          title={<Space><span style={{ fontSize: 20 }}>{activePlatform ? renderIcon(activePlatform.icon) : <ApiOutlined />}</span><span>配置 {activePlatform?.name} 连接</span></Space>}
          onCancel={() => { setConfigModalOpen(false); setTestResult(null); setShowGuide(false); }}
          footer={null} width={600} destroyOnHidden
        >
          {/* 凭证获取教程 */}
          {!showGuide ? (
            <Alert type="warning" showIcon icon={<QuestionCircleOutlined />} style={{ marginBottom: 16, borderRadius: 8 }}
              message={
                <span>
                  不知道怎么获取 {activePlatform?.name} 的 AppKey 和 AppSecret？
                  <Button type="link" size="small" onClick={() => setShowGuide(true)} style={{ padding: '0 4px' }}>
                    点击查看获取教程 →
                  </Button>
                </span>
              }
            />
          ) : (
            <Card size="small" title={<span><QuestionCircleOutlined /> {guide.title}</span>} style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #ffe58f' }}
              extra={<Button type="link" size="small" onClick={() => setShowGuide(false)}>收起</Button>}>
              <Steps direction="vertical" size="small" current={-1}
                items={guide.steps.map(s => ({
                  title: s.title,
                  description: <Text type="secondary">{s.description}</Text>,
                  status: 'process' as const,
                }))}
              />
              {guide.docUrl && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Button size="small" icon={<LinkOutlined />} onClick={() => window.open(guide.docUrl, '_blank')}>
                    打开 {activePlatform?.name} 开放平台 →
                  </Button>
                </div>
              )}
            </Card>
          )}

          <Descriptions size="small" bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="平台">{activePlatform?.name}</Descriptions.Item>
            <Descriptions.Item label="同步方式">{activePlatform ? modeLabel(activePlatform.syncMode) : null}</Descriptions.Item>
            <Descriptions.Item label="功能">{activePlatform?.features.join('、')}</Descriptions.Item>
          </Descriptions>

          <Divider style={{ margin: '12px 0' }} />
          <Form form={form} layout="vertical">
            <Form.Item name="appKey" label={<span><KeyOutlined /> AppKey / Client ID</span>} rules={[{ required: true, message: '请输入 AppKey' }]} tooltip={`${activePlatform?.name} 开放平台颁发的应用标识`}>
              <Input placeholder={`${activePlatform?.name} 开放平台 AppKey`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="appSecret" label={<span><SafetyCertificateOutlined /> AppSecret</span>} rules={[{ required: true, message: '请输入 AppSecret' }]} tooltip="密钥加密传输，仅存储不可逆Hash">
              <Input.Password placeholder={`${activePlatform?.name} 开放平台 AppSecret`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="shopName" label={<span><ShopOutlined /> 店铺名称（可选）</span>}>
              <Input placeholder="给这个连接起个名字，如：主店铺" />
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={testing} onClick={handleTest} style={{ flex: 1 }}>保存并测试连接</Button>
            <Button icon={<SettingOutlined />} onClick={handleSave} style={{ flex: 1 }}>仅保存</Button>
          </div>
        </Modal>

        {/* ====== 测试结果弹窗 ====== */}
        <Modal open={testModalOpen} title="连接测试结果" onCancel={() => { setTestModalOpen(false); setTestResult(null); }}
          footer={<Button onClick={() => setTestModalOpen(false)}>关闭</Button>} width={540} destroyOnHidden>
          {testResult ? (
            <div>
              <Alert type={testResult.success ? 'success' : 'error'} showIcon message={testResult.success ? '连接成功' : '连接失败'} description={testResult.message} style={{ marginBottom: 16 }} />
              {testResult.success && testResult.supportedActions && (
                <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="同步能力" span={2}>
                    {testResult.supportedActions.map(a => (<Tag key={a} color="blue" style={{ marginBottom: 4 }}>{a}</Tag>))}
                  </Descriptions.Item>
                </Descriptions>
              )}
              {testResult.success && testResult.shops && testResult.shops.length > 0 && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}><ShopOutlined /> 发现的店铺 ({testResult.shops.length})</Text>
                  <List size="small" bordered dataSource={testResult.shops}
                    renderItem={(shop: ShopInfo) => (
                      <List.Item><Space><Tag color="green">{shop.platform || '-'}</Tag>{shop.shopName}<Tag>{shop.status}</Tag></Space></List.Item>
                    )}
                  />
                </div>
              )}
            </div>
          ) : (<Spin tip="测试中..." />)}
        </Modal>

        {/* ====== 店铺数据看板弹窗 ====== */}
        <Modal open={statsModalOpen} title={<Space><ShopOutlined />{activePlatform?.name} 店铺数据看板</Space>}
          onCancel={() => { setStatsModalOpen(false); setActiveStats(null); }}
          footer={<Button onClick={() => setStatsModalOpen(false)}>关闭</Button>} width={680} destroyOnHidden>
          {activeStats ? (
            <div>
              {/* 总览 */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card size="small" style={{ background: '#e6f7ff', borderRadius: 8, border: 'none' }}>
                    <Statistic title="今日订单" value={activeStats.todayOrders} suffix="单" valueStyle={{ color: '#1677ff' }} prefix={<ShoppingCartOutlined />} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#f6ffed', borderRadius: 8, border: 'none' }}>
                    <Statistic title="今日销售额" value={parseFloat(activeStats.todaySales).toFixed(2)} prefix="¥" valueStyle={{ color: '#52c41a' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#fff7e6', borderRadius: 8, border: 'none' }}>
                    <Statistic title="累计订单" value={activeStats.totalOrders} suffix="单" valueStyle={{ color: '#fa8c16' }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card size="small" style={{ background: '#f9f0ff', borderRadius: 8, border: 'none' }}>
                    <Statistic title="关联店铺" value={activeStats.shopCount} suffix="个" valueStyle={{ color: '#722ed1' }} />
                  </Card>
                </Col>
              </Row>

              {/* 两条出库链路 */}
              <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
                message={<div style={{ fontWeight: 600, marginBottom: 8 }}>两条出库链路</div>}
                description={
                  <Row gutter={24}>
                    <Col span={12}>
                      <Card size="small" style={{ borderRadius: 6, border: '1px solid #91caff', background: '#f0f9ff' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#1677ff' }}>
                          📦 链路一：成品仓（有生产单）
                        </div>
                        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                          订单 → SKU匹配款号 → <Tag color="blue" style={{ fontSize: 10 }}>关联生产单</Tag>
                          → 生产加工 → 完工入库 → 出库发货 → 物流回传
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Tag color="blue">备货中 {activeStats.preparing}</Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card size="small" style={{ borderRadius: 6, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: '#52c41a' }}>
                          🛒 链路二：电商仓（现货发货）
                        </div>
                        <div style={{ fontSize: 11, color: '#555', lineHeight: 1.8 }}>
                          订单 → <Tag color="orange" style={{ fontSize: 10 }}>待拣货</Tag>
                          → 仓库拣货 → 复核包装 → 出库发货 → 物流回传
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Tag color="orange">待拣货 {activeStats.pendingPick}</Tag>
                          {activeStats.noStockWarn > 0 && <Tag color="red">缺货预警 {activeStats.noStockWarn}</Tag>}
                        </div>
                      </Card>
                    </Col>
                  </Row>
                }
              />

              {/* 订单状态分解 */}
              <Text strong style={{ display: 'block', marginBottom: 8 }}>📊 今日订单状态</Text>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col span={8}>
                  <Card size="small" style={{ background: '#fff7e6', borderRadius: 8, border: '1px solid #ffd591' }}>
                    <Statistic title="待拣货" value={activeStats.pendingPick} suffix="单"
                      valueStyle={{ color: '#fa8c16', fontSize: 20 }}
                      prefix={<ShoppingCartOutlined />} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: '#e6f7ff', borderRadius: 8, border: '1px solid #91caff' }}>
                    <Statistic title="备货中" value={activeStats.preparing} suffix="单"
                      valueStyle={{ color: '#1677ff', fontSize: 20 }}
                      prefix={<SyncOutlined />} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card size="small" style={{ background: '#f6ffed', borderRadius: 8, border: '1px solid #95de64' }}>
                    <Statistic title="已出库" value={activeStats.shippedToday} suffix="单"
                      valueStyle={{ color: '#52c41a', fontSize: 20 }}
                      prefix={<CheckCircleOutlined />} />
                  </Card>
                </Col>
              </Row>

              {/* 汇总 */}
              <Descriptions bordered size="small" column={2} style={{ marginBottom: 12 }}>
                <Descriptions.Item label="累计订单">{activeStats.totalOrders} 单</Descriptions.Item>
                <Descriptions.Item label="累计销售额">¥{parseFloat(activeStats.totalSales).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="客单价">¥{parseFloat(activeStats.avgOrderValue).toFixed(2)}</Descriptions.Item>
                <Descriptions.Item label="待发货总数">{activeStats.pendingShip} 单</Descriptions.Item>
              </Descriptions>

              {activeStats.noStockWarn > 0 && (
                <Alert type="error" showIcon style={{ borderRadius: 8 }}
                  message={`⚠️ 缺货预警：${activeStats.noStockWarn} 单未匹配到生产单，需人工确认库存或创建生产计划`} />
              )}
            </div>
          ) : (<Spin />)}
        </Modal>

        {/* ====== 同步结果 ====== */}
        {syncResult && activePlatform && (
          <Modal open={!!syncResult} title={`${activePlatform.name} 同步结果`}
            onCancel={() => setSyncResult(null)} footer={<Button onClick={() => setSyncResult(null)}>确定</Button>} width={400}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="新增订单"><Text style={{ color: '#52c41a', fontWeight: 'bold', fontSize: 18 }}>{syncResult.synced ?? '-'}</Text></Descriptions.Item>
              <Descriptions.Item label="已跳过"><Text style={{ color: '#fa8c16' }}>{syncResult.skipped ?? '-'}</Text></Descriptions.Item>
            </Descriptions>
          </Modal>
        )}
      </div>
    </Spin>
  );
};

export default PlatformConnectorTab;
