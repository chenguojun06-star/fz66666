import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Tabs, Card, Row, Col, Statistic, Tag, Button, Space, Spin, Typography, Alert, Descriptions, Input, Select, Form, Steps, Divider, Empty,
} from 'antd';
import {
  ArrowLeftOutlined, ShoppingCartOutlined, InboxOutlined, ShopOutlined,
  SettingOutlined, ThunderboltOutlined, SyncOutlined, CheckCircleOutlined,
  WarningOutlined, CloseCircleOutlined, CloudOutlined, KeyOutlined,
  SafetyCertificateOutlined, LinkOutlined, SearchOutlined, ReloadOutlined,
  EyeOutlined, CarOutlined, ApiOutlined, SendOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import ExpressOrderModal from '../../components/ExpressOrderModal';
import { formatMoney } from '@/utils/format';
import { usePlatformConnector, type ShopStats } from '../../../integration/pages/IntegrationCenter/usePlatformConnector';
import { PLATFORM_LIST, SYNC_MODE_LABELS } from '../../../integration/pages/IntegrationCenter/PlatformConnectorConstants';
import api, { type ApiResult } from '@/utils/api';
import { message } from '@/utils/antdStatic';
import { paths } from '@/routeConfig';
import { readPageSize } from '@/utils/pageSizeStore';
import { useDebouncedValue } from '@/hooks/usePerformance';

const { Text } = Typography;

const IconMap: Record<string, React.ReactNode> = {
  cloud: <CloudOutlined />, shop: <ShopOutlined />,
  tb: <ApiOutlined />, dy: <ApiOutlined />, jd: <ApiOutlined />,
  tm: <ApiOutlined />, pdd: <ApiOutlined />, xhs: <ApiOutlined />,
  wx: <ApiOutlined />, sf: <ApiOutlined />,
};
const renderIcon = (iconName: string): React.ReactNode => IconMap[iconName] || <ApiOutlined />;

const STATUS_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待付款', color: 'default' }, 1: { label: '待发货', color: 'orange' },
  2: { label: '已发货', color: 'blue' }, 3: { label: '已完成', color: 'green' },
  4: { label: '已取消', color: 'red' }, 5: { label: '退款中', color: 'magenta' },
};
const WH_MAP: Record<number, { label: string; color: string }> = {
  0: { label: '待拣货', color: 'default' }, 1: { label: '备货中', color: 'orange' },
  2: { label: '已出库', color: 'green' },
};

interface EcOrder {
  id: number; orderNo: string; platform: string; sourcePlatformCode: string;
  platformOrderNo: string; shopName: string; buyerNick: string;
  productName: string; skuCode: string; quantity: number;
  unitPrice: number; totalAmount: number; payAmount: number;
  freight: number; discount: number; payType: string;
  payTime: string; shipTime: string; completeTime: string;
  receiverName: string; receiverPhone: string; receiverAddress: string;
  trackingNo: string; expressCompany: string;
  buyerRemark: string; sellerRemark: string;
  status: number; warehouseStatus: number;
  productionOrderNo: string; createTime: string;
}

const CREDENTIAL_GUIDES: Record<string, { title: string; steps: { title: string; description: string }[]; docUrl: string }> = {
  JST: {
    title: '如何获取聚水潭应用凭证？',
    steps: [
      { title: '登录聚水潭开放平台', description: '打开 open.jushuitan.com，使用企业账号登录' },
      { title: '创建应用', description: '进入「开发者中心」→「应用管理」→「创建应用」，选择"自研ERP对接"' },
      { title: '获取凭证', description: '应用审核通过后，复制应用标识和密钥' },
      { title: '填写到本系统', description: '将应用标识和密钥填入下方表单' },
      { title: '授权店铺数据', description: '在聚水潭中授权需要同步的店铺' },
    ],
    docUrl: 'https://open.jushuitan.com',
  },
  SHEIN: {
    title: '如何获取希音接口密钥？',
    steps: [
      { title: '登录希音开放平台', description: '打开 developer.shein.com，注册企业账号' },
      { title: '创建应用', description: '进入「应用管理」→「创建应用」' },
      { title: '获取凭证', description: '应用审核通过后，复制 API Key 和 API Secret' },
      { title: '填写到本系统', description: '将凭证填入下方表单' },
    ],
    docUrl: 'https://developer.shein.com',
  },
  DEFAULT: {
    title: '如何获取平台接口凭证？',
    steps: [
      { title: '打开平台开放平台', description: '登录该平台的开放平台/开发者中心' },
      { title: '创建应用/获取密钥', description: '创建对接应用，获取应用标识和密钥' },
      { title: '填写到本系统', description: '将凭证填入下方表单' },
      { title: '配置回调地址', description: '将本系统回调地址配置到平台中' },
    ],
    docUrl: '',
  },
};

const PlatformDetail: React.FC = () => {
  const { platformCode } = useParams<{ platformCode: string }>();
  const navigate = useNavigate();
  const platform = PLATFORM_LIST.find(p => p.code === platformCode);

  const { loading, testing, syncing, saveConfig, getStatus, getShopStats, testConnection, syncNow } = usePlatformConnector();

  const [stats, setStats] = useState<ShopStats | null>(null);
  const [configured, setConfigured] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('config');
  const [showGuide, setShowGuide] = useState(false);

  const [orders, setOrders] = useState<EcOrder[]>([]);
  const [orderTotal, setOrderTotal] = useState(0);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderPage, setOrderPage] = useState(1);
  const [orderPageSize, setOrderPageSize] = useState(readPageSize(20));
  const [filterStatus, setFilterStatus] = useState<number | undefined>();
  const [keyword, setKeyword] = useState('');
  const debouncedKeyword = useDebouncedValue(keyword, 300);
  const prevDebouncedKeywordRef = useRef(debouncedKeyword);
  if (debouncedKeyword !== prevDebouncedKeywordRef.current) {
    prevDebouncedKeywordRef.current = debouncedKeyword;
    setOrderPage(1);
  }
  const [_detail, setDetail] = useState<EcOrder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [linkTarget, setLinkTarget] = useState<EcOrder | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [outboundTarget, setOutboundTarget] = useState<EcOrder | null>(null);
  const [expressOrderTarget, setExpressOrderTarget] = useState<EcOrder | null>(null);
const [expressModalOpen, setExpressModalOpen] = useState(false);

  const [configForm] = Form.useForm();
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadPlatformData = useCallback(async () => {
    if (!platformCode) return;
    try {
      const s = await getStatus(platformCode);
      setConfigured(s.configured);
      if (s.configured) {
        const st = await getShopStats(platformCode);
        setStats(st);
      }
    } catch {
      setConfigured(false);
    }
  }, [platformCode, getStatus, getShopStats]);

  const loadOrders = useCallback(async () => {
    if (!platformCode || !configured) return;
    setOrderLoading(true);
    try {
      const params: Record<string, unknown> = { page: orderPage, pageSize: orderPageSize, platform: platformCode };
      if (filterStatus !== undefined) params.status = filterStatus;
      if (debouncedKeyword) params.keyword = debouncedKeyword;
      const res = await api.post<ApiResult>('/ecommerce/orders/list', params);
      const d = (res?.data ?? {}) as Record<string, unknown>;
      setOrders((d.records as EcOrder[]) ?? []);
      setOrderTotal((d.total as number) ?? 0);
    } catch (err: unknown) { message.error(err instanceof Error ? err.message : '加载失败'); }
    finally { setOrderLoading(false); }
  }, [platformCode, configured, orderPage, orderPageSize, filterStatus, debouncedKeyword]);

  useEffect(() => { loadPlatformData(); }, [loadPlatformData]);
  useEffect(() => { if (configured) loadOrders(); }, [loadOrders, configured]);
  useEffect(() => { setActiveTab(configured ? 'orders' : 'config'); }, [configured]);

  const handleSaveConfig = async () => {
    if (!platformCode) return;
    try {
      const values = await configForm.validateFields();
      await saveConfig(platformCode, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
      message.success('凭证已保存');
      loadPlatformData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('保存失败');
    }
  };

  const handleTestConnection = async () => {
    if (!platformCode) return;
    try {
      const values = await configForm.validateFields();
      await saveConfig(platformCode, values.appKey, values.appSecret, values.shopName, values.callbackUrl);
    } catch (e: any) {
      if (e?.errorFields) { message.warning('请先填写凭证'); return; }
    }
    const result = await testConnection(platformCode);
    setTestResult({ success: result.success, message: result.message });
    loadPlatformData();
  };

  const handleSync = async () => {
    if (!platformCode) return;
    try {
      await syncNow(platformCode);
      loadPlatformData();
      loadOrders();
    } catch { /* handled in hook */ }
  };

  if (!platform) {
    return <Empty description="平台不存在" />;
  }

  const guide = CREDENTIAL_GUIDES[platform.code] || CREDENTIAL_GUIDES.DEFAULT;

  const orderColumns: ColumnsType<EcOrder> = [
    {
      title: '订单号', dataIndex: 'platformOrderNo', width: 160,
      render: (v, r) => (
        <div>
          <div style={{ fontWeight: 600 }}>{v || r.orderNo}</div>
          {v && <div style={{ fontSize: 14, color: '#888' }}>内部 {r.orderNo}</div>}
        </div>
      ),
    },
    {
      title: '款号', width: 110,
      render: (_: unknown, r: EcOrder) => {
        const styleNo = (r.skuCode || '').split('-')[0];
        return styleNo ? <Text strong style={{ fontFamily: 'monospace' }}>{styleNo}</Text> : <Text type="secondary">-</Text>;
      },
    },
    {
      title: '商品 / 买家', width: 200,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div>{r.productName || '-'} <Text type="secondary">×{r.quantity}</Text></div>
          {r.skuCode && <div style={{ fontSize: 14, color: 'var(--color-success)' }}>SKU {r.skuCode}</div>}
          <div style={{ fontSize: 14, color: '#888' }}>{r.buyerNick || r.receiverName}</div>
        </div>
      ),
    },
    {
      title: '金额', width: 130,
      render: (_: unknown, r: EcOrder) => (
        <div>
          <div style={{ color: 'var(--color-warning)', fontWeight: 600 }}>¥{r.payAmount ?? '-'}</div>
          {r.freight ? <div style={{ fontSize: 14, color: '#aaa' }}>运费 ¥{r.freight}</div> : null}
        </div>
      ),
    },
    {
      title: '订单状态', dataIndex: 'status', width: 90,
      render: v => <Tag color={STATUS_MAP[v]?.color}>{STATUS_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '仓库状态', dataIndex: 'warehouseStatus', width: 90,
      render: v => <Tag color={WH_MAP[v]?.color}>{WH_MAP[v]?.label ?? '未知'}</Tag>,
    },
    {
      title: '关联生产单', dataIndex: 'productionOrderNo', width: 140,
      render: v => v ? <Tag color="blue" icon={<CheckCircleOutlined />}>{v}</Tag> : <Text type="secondary">未关联</Text>,
    },
    {
      title: '快递', dataIndex: 'trackingNo', width: 130,
      render: (v, r) => v ? <div><div style={{ fontSize: 14, color: '#888' }}>{r.expressCompany}</div><div>{v}</div></div> : <Text type="secondary">-</Text>,
    },
    {
      title: '下单时间', dataIndex: 'createTime', width: 110,
      render: v => <span>{v?.slice(0, 16)}</span>,
    },
    {
      title: '操作', width: 120, fixed: 'right',
      render: (_: unknown, r: EcOrder) => (
        <Space size={4}>
          <Button type="text" icon={<EyeOutlined />} onClick={() => setDetail(r)} />
          <Button type="text" icon={<LinkOutlined />} disabled={!!r.productionOrderNo} onClick={() => setLinkTarget(r)} />
          {(r.warehouseStatus ?? 0) < 2 && <Button type="text" icon={<CarOutlined />} onClick={() => setOutboundTarget(r)} />}
          <Button type="text" icon={<SendOutlined />} disabled={!!r.trackingNo} onClick={() => { setExpressOrderTarget(r); setExpressModalOpen(true); }} />
        </Space>
      ),
    },
  ];

  const tabs = [
    {
      key: 'orders',
      label: <span><ShoppingCartOutlined /> 订单管理</span>,
      children: configured ? (
        <div>
          <Row gutter={12} style={{ marginBottom: 14 }}>
            {[
              { title: '总订单', value: stats?.totalOrders ?? 0, suffix: '单', color: undefined },
              { title: '待发货', value: stats?.pendingShip ?? 0, suffix: '单', color: 'var(--color-warning)' },
              { title: '待拣货', value: stats?.pendingPick ?? 0, suffix: '单', color: 'var(--color-primary)' },
              { title: '已出库', value: stats?.shippedToday ?? 0, suffix: '单', color: 'var(--color-success)' },
            ].map((s, i) => (
              <Col span={6} key={i}>
                <Card styles={{ body: { padding: '8px 12px' } }}>
                  <Statistic title={<span style={{ fontSize: 14 }}>{s.title}</span>} value={s.value} suffix={s.suffix} styles={{ content: { fontSize: 20, color: s.color } }} />
                </Card>
              </Col>
            ))}
          </Row>
          <Card style={{ marginBottom: 10 }}>
            <Space wrap>
              <Select placeholder="全部状态" allowClear value={filterStatus} onChange={v => { setFilterStatus(v); setOrderPage(1); }} style={{ width: 100 }}>
                {Object.entries(STATUS_MAP).map(([k, v]) => <Select.Option key={k} value={Number(k)}>{v.label}</Select.Option>)}
              </Select>
              <Input.Search placeholder="订单号 / 买家" allowClear style={{ width: 200 }} enterButton={<SearchOutlined />} onSearch={v => { setKeyword(v); }} />
              <Button icon={<ReloadOutlined />} onClick={loadOrders}>刷新</Button>
            </Space>
          </Card>
          <ResizableTable rowKey="id" dataSource={orders} columns={orderColumns} loading={orderLoading} stickyHeader scroll={{ x: 1200 }} emptyDescription="暂无订单数据"
            pagination={{ current: orderPage, pageSize: orderPageSize, total: orderTotal, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setOrderPage(p); setOrderPageSize(ps); } }} />
        </div>
      ) : <Empty description="请先配置平台连接"><Button type="primary" onClick={() => setActiveTab('config')}>去配置</Button></Empty>,
    },
    {
      key: 'inventory',
      label: <span><InboxOutlined /> 进销存</span>,
      children: configured ? (
        <div>
          <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
            title={<div style={{ fontWeight: 600, marginBottom: 8 }}>两条出库链路</div>}
            description={
              <Row gutter={24}>
                <Col span={12}>
                  <Card style={{ borderRadius: 6, border: '1px solid #91caff', background: '#f0f9ff' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-primary)' }}>📦 链路一：成品仓（有生产单）</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      订单 → SKU匹配款号 → <Tag color="blue">关联生产单</Tag> → 生产加工 → 完工入库 → 出库发货 → 物流回传
                    </div>
                    <div style={{ marginTop: 6 }}><Tag color="blue">备货中 {stats?.preparing ?? 0}</Tag></div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card style={{ borderRadius: 6, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-success)' }}>🛒 链路二：电商仓（现货发货）</div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      订单 → <Tag color="orange">待拣货</Tag> → 仓库拣货 → 复核包装 → 出库发货 → 物流回传
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Tag color="orange">待拣货 {stats?.pendingPick ?? 0}</Tag>
                      {(stats?.noStockWarn ?? 0) > 0 && <Tag color="red">缺货预警 {stats?.noStockWarn}</Tag>}
                    </div>
                  </Card>
                </Col>
              </Row>
            }
          />
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card style={{ background: '#FFF7E6', borderRadius: 8, border: '1px solid #ffd591' }}>
                <Statistic title="待拣货" value={stats?.pendingPick ?? 0} suffix="单" styles={{ content: { color: 'var(--color-warning)', fontSize: 20 } }} prefix={<ShoppingCartOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#e6f7ff', borderRadius: 8, border: '1px solid #91caff' }}>
                <Statistic title="备货中" value={stats?.preparing ?? 0} suffix="单" styles={{ content: { color: 'var(--color-primary)', fontSize: 20 } }} prefix={<SyncOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#f6ffed', borderRadius: 8, border: '1px solid #95de64' }}>
                <Statistic title="已出库" value={stats?.shippedToday ?? 0} suffix="单" styles={{ content: { color: 'var(--color-success)', fontSize: 20 } }} prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: (stats?.noStockWarn ?? 0) > 0 ? '#FFF1F0' : '#f9f0ff', borderRadius: 8, border: (stats?.noStockWarn ?? 0) > 0 ? '1px solid #ffa39e' : '1px solid #d3adf7' }}>
                <Statistic title="缺货预警" value={stats?.noStockWarn ?? 0} suffix="单" styles={{ content: { color: (stats?.noStockWarn ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-accent-purple)', fontSize: 20 } }} prefix={<WarningOutlined />} />
              </Card>
            </Col>
          </Row>
          <Descriptions bordered column={2}>
            <Descriptions.Item label="累计订单">{stats?.totalOrders ?? 0} 单</Descriptions.Item>
            <Descriptions.Item label="累计销售额">{stats ? formatMoney(parseFloat(stats.totalSales)) : '¥0.00'}</Descriptions.Item>
            <Descriptions.Item label="客单价">{stats ? formatMoney(parseFloat(stats.avgOrderValue)) : '¥0.00'}</Descriptions.Item>
            <Descriptions.Item label="关联店铺">{stats?.shopCount ?? 0} 个</Descriptions.Item>
          </Descriptions>
        </div>
      ) : <Empty description="请先配置平台连接"><Button type="primary" onClick={() => setActiveTab('config')}>去配置</Button></Empty>,
    },
    {
      key: 'config',
      label: <span><SettingOutlined /> 平台配置</span>,
      children: (
        <div>
          {!showGuide ? (
            <Alert type="warning" showIcon icon={<WarningOutlined />} style={{ marginBottom: 16, borderRadius: 8 }}
              title={<span>不知道怎么获取 {platform.name} 的凭证？<Button type="link" onClick={() => setShowGuide(true)} style={{ padding: '0 4px' }}>点击查看获取教程 →</Button></span>}
            />
          ) : (
            <Card title={guide.title} style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #ffe58f' }}
              extra={<Button type="link" onClick={() => setShowGuide(false)}>收起</Button>}>
              <Steps direction="vertical" current={-1}
                items={guide.steps.map(s => ({ title: s.title, description: <Text type="secondary">{s.description}</Text>, status: 'process' as const }))}
              />
              {guide.docUrl && (
                <div style={{ marginTop: 12, textAlign: 'center' }}>
                  <Button icon={<LinkOutlined />} onClick={() => window.open(guide.docUrl, '_blank')}>打开 {platform.name} 开放平台 →</Button>
                </div>
              )}
            </Card>
          )}

          <Descriptions bordered column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label="平台">{platform.name}</Descriptions.Item>
            <Descriptions.Item label="同步方式">{SYNC_MODE_LABELS[platform.syncMode]}</Descriptions.Item>
            <Descriptions.Item label="功能">{platform.features.join('、')}</Descriptions.Item>
          </Descriptions>

          <Divider />
          <Form form={configForm} layout="vertical">
            <Form.Item name="appKey" label={<span><KeyOutlined /> 应用标识 (AppKey)</span>} rules={[{ required: true, message: '请输入应用标识' }]}>
              <Input placeholder={`请输入 ${platform.name} 的应用标识`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="appSecret" label={<span><SafetyCertificateOutlined /> 应用密钥 (AppSecret)</span>} rules={[{ required: true, message: '请输入应用密钥' }]}>
              <Input.Password placeholder={`请输入 ${platform.name} 的应用密钥`} autoComplete="off" />
            </Form.Item>
            <Form.Item name="shopName" label={<span><ShopOutlined /> 店铺名称（可选）</span>}>
              <Input placeholder="给这个连接起个名字" />
            </Form.Item>
          </Form>

          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <Button type="primary" icon={<ThunderboltOutlined />} loading={testing} onClick={handleTestConnection} style={{ flex: 1 }}>保存并测试连接</Button>
            <Button icon={<SettingOutlined />} onClick={handleSaveConfig} style={{ flex: 1 }}>仅保存</Button>
          </div>

          {testResult && (
            <Alert type={testResult.success ? 'success' : 'error'} showIcon title={testResult.success ? '连接成功' : '连接失败'} description={testResult.message} style={{ marginTop: 16, borderRadius: 8 }} />
          )}

          {configured && platform.syncMode === 'pull' && (
            <div style={{ marginTop: 16 }}>
              <Button icon={<SyncOutlined />} loading={syncing} onClick={handleSync} block>手动同步订单</Button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ padding: '0 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, marginTop: 16 }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(paths.ecommerceCenter)} style={{ marginRight: 8 }} />
          <span style={{
            width: 40, height: 40, borderRadius: 10,
            background: configured ? '#f6ffed' : '#FFF7E6',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, color: platform.color, marginRight: 12,
          }}>
            {renderIcon(platform.icon)}
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{platform.name}</div>
            <Text type="secondary" style={{ fontSize: 14 }}>{platform.desc}</Text>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {configured ? (
              <Tag icon={<CheckCircleOutlined />} color="success" style={{ fontSize: 14, padding: '2px 12px' }}>已连接</Tag>
            ) : (
              <Tag icon={<CloseCircleOutlined />} color="default" style={{ fontSize: 14, padding: '2px 12px' }}>未配置</Tag>
            )}
          </div>
        </div>

        {configured && stats && (
          <Row gutter={16} style={{ marginBottom: 12 }}>
            <Col span={6}>
              <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)', borderRadius: 12 }}>
                <Statistic title="今日订单" value={stats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: 'var(--color-primary)' }} />} styles={{ content: { color: 'var(--color-primary)' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%)', borderRadius: 12 }}>
                <Statistic title="今日销售" value={formatMoney(parseFloat(stats.todaySales))} styles={{ content: { color: 'var(--color-success)' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #FFF7E6 0%, #FFFBE6 100%)', borderRadius: 12 }}>
                <Statistic title="待发货" value={stats.pendingShip} suffix="单" prefix={<InboxOutlined style={{ color: 'var(--color-warning)' }} />} styles={{ content: { color: 'var(--color-warning)' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card variant="borderless" style={{ background: (stats.noStockWarn ?? 0) > 0 ? 'linear-gradient(135deg, #FFF1F0 0%, #ffccc7 100%)' : 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
                <Statistic title="缺货预警" value={stats.noStockWarn} suffix="单" prefix={<WarningOutlined style={{ color: (stats.noStockWarn ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-accent-purple)' }} />} styles={{ content: { color: (stats.noStockWarn ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-accent-purple)' } }} />
              </Card>
            </Col>
          </Row>
        )}

        <Card style={{ borderRadius: 12 }}>
          <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabs} />
        </Card>

        <ExpressOrderModal
          open={expressModalOpen}
          order={expressOrderTarget}
          onClose={() => { setExpressModalOpen(false); setExpressOrderTarget(null); }}
          onSuccess={() => { loadOrders(); }}
        />

        <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 'var(--z-dropdown)' }}>
          <Button type="primary" shape="circle" size="large" icon={<ArrowLeftOutlined />}
            onClick={() => navigate(paths.ecommerceCenter)}
            style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}
          />
        </div>
      </div>
    </Spin>
  );
};

export default PlatformDetail;
