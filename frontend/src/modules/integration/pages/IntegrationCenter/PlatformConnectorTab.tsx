import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Badge, Statistic, Button, Tag, Spin, Form,
  Input, Alert, Descriptions, List, Divider, Tooltip, Space, Empty, Typography, Steps,
} from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import {
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  SettingOutlined, SyncOutlined, ApiOutlined, LinkOutlined,
  CloudUploadOutlined, CloudOutlined, ThunderboltOutlined,
  KeyOutlined, SafetyCertificateOutlined, ShopOutlined,
  ShoppingCartOutlined, DollarOutlined,
  QuestionCircleOutlined, NumberOutlined,
} from '@ant-design/icons';
import { usePlatformConnector } from './usePlatformConnector';
import { formatMoney } from '@/utils/format';
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
const PLATFORM_HELP_TIPS: Record<string, { openUrl: string; tip: string }> = {
  JST: { openUrl: 'https://open.jushuitan.com', tip: '在聚水潭开放平台创建应用，获取 AppKey 和 AppSecret' },
  TAOBAO: { openUrl: 'https://open.taobao.com', tip: '在淘宝开放平台创建自用型应用，获取 AppKey 和 AppSecret' },
  TMALL: { openUrl: 'https://open.taobao.com', tip: '天猫与淘宝共用开放平台，创建应用获取凭证' },
  DOUYIN: { openUrl: 'https://open.douyin.com', tip: '在抖音开放平台创建应用，获取 AppKey 和 AppSecret' },
  PINDUODUO: { openUrl: 'https://open.pinduoduo.com', tip: '在拼多多开放平台创建应用，client_id 作为 AppKey' },
  JD: { openUrl: 'https://open.jd.com', tip: '在京东开放平台创建应用，获取 AppKey 和 AppSecret' },
  XIAOHONGSHU: { openUrl: 'https://open.xiaohongshu.com', tip: '在小红书开放平台创建应用，获取凭证' },
  WECHAT_SHOP: { openUrl: 'https://developers.weixin.qq.com', tip: '在微信小店后台获取 AppID 和 AppSecret' },
  SHOPIFY: { openUrl: 'https://shopify.dev', tip: '在 Shopify 后台创建私有应用，获取 API Key 和 Password' },
  SHEIN: { openUrl: 'https://open.shein.com', tip: '在希音开放平台创建应用，获取 AppKey 和 AppSecret' },
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

  const [testResult, setTestResult] = useState<{
    success: boolean; message: string; shops?: ShopInfo[];
    supportedActions?: string[]; webhookUrl?: string; credentialGuide?: string;
  } | null>(null);
  const [syncResult, setSyncResult] = useState<{ synced?: number; skipped?: number } | null>(null);

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

  // 平台卡片
  const renderPlatformCard = (p: PlatformMeta) => {
    const status = statusMap[p.code];
    const isConfigured = status?.configured;
    const isConnected = status?.status === 'ACTIVE' || status?.status === 'CONNECTED';
    const statsData = shopStatsMap[p.code];

    const statusDot = !status ? { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' }
      : isConfigured && isConnected ? { color: 'var(--color-success)', icon: <CheckCircleOutlined />, text: '已连接' }
      : isConfigured ? { color: 'var(--color-warning)', icon: <WarningOutlined />, text: '已配置' }
      : { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' };

    return (
      <Col key={p.code} xs={24} sm={12} lg={8} xl={6}>
        <Badge.Ribbon
          text={p.syncMode === 'pull' ? '主动同步' : '回调推送'}
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

            <Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 8, minHeight: 36 }}>{p.desc}</Paragraph>
            <div style={{ marginBottom: 8 }}>{modeLabel(p.syncMode)}</div>

            {/* 功能标签 */}
            <div style={{ marginBottom: 8 }}>
              {p.features.slice(0, 3).map(f => (<Tag key={f} style={{ marginBottom: 4, fontSize: 14 }}>{f}</Tag>))}
              {p.features.length > 3 && (
                <Tooltip title={p.features.slice(3).join('、')}><Tag style={{ fontSize: 14 }}>+{p.features.length - 3}</Tag></Tooltip>
              )}
            </div>

            {/* 连接后的迷你数据 */}
            {isConfigured && statsData && (
              <Row gutter={8} style={{ marginBottom: 8 }}>
                <Col span={12}>
                  <div style={{ fontSize: 14, color: '#888' }}>今日订单</div>
                  <Text strong style={{ color: 'var(--color-primary)' }}>{statsData.todayOrders}</Text>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: 14, color: '#888' }}>今日销售额</div>
                  <Text strong style={{ color: 'var(--color-success)' }}>¥{statsData.todaySales}</Text>
                </Col>
              </Row>
            )}

            <Divider style={{ margin: '8px 0' }} />
            <Space orientation="vertical" style={{ width: '100%' }} size={6}>
              <Button type={isConfigured ? 'default' : 'primary'} icon={<SettingOutlined />} block onClick={() => handleConfig(p)}>
                {isConfigured ? '修改凭证' : '配置连接'}
              </Button>
              {isConfigured && (
                <Button icon={<ThunderboltOutlined />} block loading={testing} onClick={() => { setActivePlatform(p); setTestResult(null); handleTest(); }}>连接测试</Button>
              )}
              {isConfigured && (
                <Button icon={<NumberOutlined />} block onClick={() => handleViewStats(p)}>店铺数据</Button>
              )}
              {isConfigured && p.syncMode === 'pull' && (
                <Button icon={<SyncOutlined />} block loading={syncing && activePlatform?.code === p.code} onClick={() => handleSync(p)}>同步订单</Button>
              )}
              {p.docUrl && (
                <Button type="link" icon={<LinkOutlined />} block onClick={() => window.open(p.docUrl, '_blank')} style={{ padding: 0 }}>开放平台文档</Button>
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
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)', borderRadius: 12 }}>
              <Statistic title="已对接平台" value={stats.connected} suffix={`/ ${stats.total}`} prefix={<ApiOutlined style={{ color: 'var(--color-primary)' }} />} styles={{ content: { color: 'var(--color-primary)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日总订单" value={stats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: 'var(--color-success)' }} />} styles={{ content: { color: 'var(--color-success)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #FFF7E6 0%, #FFFBE6 100%)', borderRadius: 12 }}>
              <Statistic title="今日销售额" value={stats.todaySales.toFixed(2)} prefix={<DollarOutlined style={{ color: 'var(--color-warning)' }} />} suffix="元" styles={{ content: { color: 'var(--color-warning)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
              <Statistic title="平台总数" value={PLATFORM_LIST.length} suffix="个" prefix={<CloudUploadOutlined style={{ color: 'var(--color-accent-purple)' }} />} styles={{ content: { color: 'var(--color-accent-purple)' } }} />
            </Card>
          </Col>
        </Row>

        <Alert type="success" showIcon style={{ marginBottom: 20, borderRadius: 8 }}
          title={<span>📦 <strong>三步傻瓜式对接</strong>：选择平台 → 粘贴凭证 → 复制回调地址到平台</span>}
          description="支持 10 大电商平台一键对接，订单自动同步，物流自动回传"
        />
        <Row gutter={[16, 16]}>{PLATFORM_LIST.map(renderPlatformCard)}</Row>
        {stats.connected === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对接任何平台" style={{ marginTop: 40 }}>
            <Button type="primary" onClick={() => PLATFORM_LIST[0] && handleConfig(PLATFORM_LIST[0])}>立即配置</Button>
          </Empty>
        )}

        {/* ====== 配置弹窗 ====== */}
        <ResizableModal
          open={configModalOpen}
          title={<Space><span style={{ fontSize: 20 }}>{activePlatform ? renderIcon(activePlatform.icon) : <ApiOutlined />}</span><span>配置 {activePlatform?.name} 连接</span></Space>}
          onCancel={() => { setConfigModalOpen(false); setTestResult(null); }}
          footer={null} width="40vw" destroyOnHidden
        >
          <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>💡 对接说明</div>
            <div style={{ fontSize: 14, color: '#595959', marginBottom: 8 }}>
              {PLATFORM_HELP_TIPS[activePlatform?.code || '']?.tip || '在对应平台开放平台创建应用，获取 AppKey 和 AppSecret'}
            </div>
            {PLATFORM_HELP_TIPS[activePlatform?.code || '']?.openUrl && (
              <Button type="link" icon={<LinkOutlined />} onClick={() => window.open(PLATFORM_HELP_TIPS[activePlatform!.code].openUrl, '_blank')}>
                打开 {activePlatform?.name} 开放平台 →
              </Button>
            )}
          </div>

          <Form form={form} layout="vertical">
            <Form.Item name="appKey" label={<span><KeyOutlined /> AppKey</span>} rules={[{ required: true, message: '请粘贴应用标识' }]} tooltip="从平台开放平台复制">
              <Input placeholder={`粘贴 ${activePlatform?.name} 的 AppKey`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="appSecret" label={<span><SafetyCertificateOutlined /> AppSecret</span>} rules={[{ required: true, message: '请粘贴应用密钥' }]} tooltip="密钥加密存储，安全可靠">
              <Input.Password placeholder={`粘贴 ${activePlatform?.name} 的 AppSecret`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="shopName" label={<span><ShopOutlined /> 店铺名称（可选）</span>}>
              <Input placeholder="如：主店铺" />
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={testing} onClick={handleTest} style={{ flex: 1 }}>保存并测试连接</Button>
            <Button icon={<SettingOutlined />} onClick={handleSave} style={{ flex: 1 }}>仅保存</Button>
          </div>
        </ResizableModal>

        {/* ====== 测试结果弹窗 ====== */}
        <ResizableModal open={testModalOpen} title="连接测试结果" onCancel={() => { setTestModalOpen(false); setTestResult(null); }}
          footer={<Button onClick={() => setTestModalOpen(false)}>关闭</Button>} width="40vw" destroyOnHidden>
          {testResult ? (
            <div>
              <Alert type={testResult.success ? 'success' : 'error'} showIcon
                title={testResult.success ? '连接成功' : '凭证未配置'}
                description={testResult.message} style={{ marginBottom: 16 }} />
              {testResult.credentialGuide && (
                <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
                  title="如何获取凭证？"
                  description={testResult.credentialGuide} />
              )}
              {testResult.webhookUrl && (
                <div style={{ background: '#f0f9ff', border: '1px solid #91caff', borderRadius: 8, padding: '16px', marginBottom: 16 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>✅ 下一步：配置回调地址</div>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>复制下方地址，粘贴到 {activePlatform?.name} 平台的 Webhook 设置中：</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <code style={{ flex: 1, background: '#fff', border: '1px solid #d9d9d9', padding: '8px 12px', borderRadius: 4, fontSize: 14, wordBreak: 'break-all' }}>
                      {window.location.origin}{testResult.webhookUrl}
                    </code>
                    <Button type="primary" size="small" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${testResult.webhookUrl}`); message.success('已复制到剪贴板'); }}>一键复制</Button>
                  </div>
                  <div style={{ fontSize: 13, color: '#8c8c8c' }}>配置后，平台订单会自动推送到本系统，无需手动同步</div>
                </div>
              )}
              {testResult.success && testResult.supportedActions && (
                <Descriptions bordered column={2} style={{ marginBottom: 16 }}>
                  <Descriptions.Item label="同步能力" span={2}>
                    {testResult.supportedActions.map(a => (<Tag key={a} color="blue" style={{ marginBottom: 4 }}>{a}</Tag>))}
                  </Descriptions.Item>
                </Descriptions>
              )}
              {testResult.success && testResult.shops && testResult.shops.length > 0 && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}><ShopOutlined /> 发现的店铺 ({testResult.shops.length})</Text>
                  <List bordered dataSource={testResult.shops}
                    renderItem={(shop: ShopInfo) => (
                      <List.Item><Space><Tag color="green">{shop.platform || '-'}</Tag>{shop.shopName}<Tag color={shop.status === 'ACTIVE' || shop.status === 'CONNECTED' ? 'success' : 'default'}>{{ ACTIVE: '已激活', CONNECTED: '已连接', DISCONNECTED: '已断开', INACTIVE: '未激活', PENDING: '待激活' }[shop.status] || shop.status}</Tag></Space></List.Item>
                    )}
                  />
                </div>
              )}
            </div>
          ) : (<Spin tip="测试中..." />)}
        </ResizableModal>

        {/* ====== 店铺数据看板弹窗 ====== */}
        <ResizableModal open={statsModalOpen} title={<Space><ShopOutlined />{activePlatform?.name} 店铺数据看板</Space>}
          onCancel={() => { setStatsModalOpen(false); setActiveStats(null); }}
          footer={<Button onClick={() => setStatsModalOpen(false)}>关闭</Button>} width="40vw" destroyOnHidden>
          {activeStats ? (
            <div>
              {/* 总览 */}
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col span={6}>
                  <Card style={{ background: '#e6f7ff', borderRadius: 8, border: 'none' }}>
                    <Statistic title="今日订单" value={activeStats.todayOrders} suffix="单" styles={{ content: { color: 'var(--color-primary)' } }} prefix={<ShoppingCartOutlined />} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ background: '#f6ffed', borderRadius: 8, border: 'none' }}>
                    <Statistic title="今日销售额" value={formatMoney(parseFloat(activeStats.todaySales))} styles={{ content: { color: 'var(--color-success)' } }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ background: '#FFF7E6', borderRadius: 8, border: 'none' }}>
                    <Statistic title="累计订单" value={activeStats.totalOrders} suffix="单" styles={{ content: { color: 'var(--color-warning)' } }} />
                  </Card>
                </Col>
                <Col span={6}>
                  <Card style={{ background: '#f9f0ff', borderRadius: 8, border: 'none' }}>
                    <Statistic title="关联店铺" value={activeStats.shopCount} suffix="个" styles={{ content: { color: 'var(--color-accent-purple)' } }} />
                  </Card>
                </Col>
              </Row>

              {/* 两条出库链路 */}
              <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
                title={<div style={{ fontWeight: 600, marginBottom: 8 }}>两条出库链路</div>}
                description={
                  <Row gutter={24}>
                    <Col span={12}>
                      <Card style={{ borderRadius: 6, border: '1px solid #91caff', background: '#f0f9ff' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-primary)' }}>
                          📦 链路一：成品仓（有生产单）
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                          订单 → SKU匹配款号 → <Tag color="blue" style={{ fontSize: 14 }}>关联生产单</Tag>
                          → 生产加工 → 完工入库 → 出库发货 → 物流回传
                        </div>
                        <div style={{ marginTop: 6 }}>
                          <Tag color="blue">备货中 {activeStats.preparing}</Tag>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card style={{ borderRadius: 6, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-success)' }}>
                          🛒 链路二：电商仓（现货发货）
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                          订单 → <Tag color="orange" style={{ fontSize: 14 }}>待拣货</Tag>
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
                  <Card style={{ background: '#FFF7E6', borderRadius: 8, border: '1px solid #ffd591' }}>
                    <Statistic title="待拣货" value={activeStats.pendingPick} suffix="单"
                      styles={{ content: { color: 'var(--color-warning)', fontSize: 20 } }}
                      prefix={<ShoppingCartOutlined />} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card style={{ background: '#e6f7ff', borderRadius: 8, border: '1px solid #91caff' }}>
                    <Statistic title="备货中" value={activeStats.preparing} suffix="单"
                      styles={{ content: { color: 'var(--color-primary)', fontSize: 20 } }}
                      prefix={<SyncOutlined />} />
                  </Card>
                </Col>
                <Col span={8}>
                  <Card style={{ background: '#f6ffed', borderRadius: 8, border: '1px solid #95de64' }}>
                    <Statistic title="已出库" value={activeStats.shippedToday} suffix="单"
                      styles={{ content: { color: 'var(--color-success)', fontSize: 20 } }}
                      prefix={<CheckCircleOutlined />} />
                  </Card>
                </Col>
              </Row>

              {/* 汇总 */}
              <Descriptions bordered column={2} style={{ marginBottom: 12 }}>
                <Descriptions.Item label="累计订单">{activeStats.totalOrders} 单</Descriptions.Item>
                <Descriptions.Item label="累计销售额">{formatMoney(parseFloat(activeStats.totalSales))}</Descriptions.Item>
                <Descriptions.Item label="客单价">{formatMoney(parseFloat(activeStats.avgOrderValue))}</Descriptions.Item>
                <Descriptions.Item label="待发货总数">{activeStats.pendingShip} 单</Descriptions.Item>
              </Descriptions>

              {activeStats.noStockWarn > 0 && (
                <Alert type="error" showIcon style={{ borderRadius: 8 }}
                  title={`⚠️ 缺货预警：${activeStats.noStockWarn} 单未匹配到生产单，需人工确认库存或创建生产计划`} />
              )}
            </div>
          ) : (<Spin />)}
        </ResizableModal>

        {/* ====== 同步结果 ====== */}
        {syncResult && activePlatform && (
          <ResizableModal open={!!syncResult} title={`${activePlatform.name} 同步结果`}
            onCancel={() => setSyncResult(null)} footer={<Button onClick={() => setSyncResult(null)}>确定</Button>} width="30vw">
            <Descriptions bordered column={2}>
              <Descriptions.Item label="新增订单"><Text style={{ color: 'var(--color-success)', fontWeight: 'bold', fontSize: 18 }}>{syncResult.synced ?? '-'}</Text></Descriptions.Item>
              <Descriptions.Item label="已跳过"><Text style={{ color: 'var(--color-warning)' }}>{syncResult.skipped ?? '-'}</Text></Descriptions.Item>
            </Descriptions>
          </ResizableModal>
        )}
      </div>
    </Spin>
  );
};

export default PlatformConnectorTab;
