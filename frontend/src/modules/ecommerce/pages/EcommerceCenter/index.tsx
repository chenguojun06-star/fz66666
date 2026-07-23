import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Statistic, Button, Tag, Spin, Space, Typography, Empty, Tabs,
} from 'antd';
import {
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  ApiOutlined, ShopOutlined, ShoppingCartOutlined, DollarOutlined,
  SyncOutlined, CloudOutlined, InboxOutlined, ArrowRightOutlined, CloudUploadOutlined,
  CreditCardOutlined, CarOutlined, BellOutlined, StockOutlined, TeamOutlined,
  ArrowUpOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlatformConnector, type ShopStats } from '../../../integration/pages/IntegrationCenter/usePlatformConnector';
import { PLATFORM_LIST, type PlatformMeta } from '../../../integration/pages/IntegrationCenter/PlatformConnectorConstants';
import PaymentRecordsTab from '../../../integration/pages/IntegrationCenter/PaymentRecordsTab';
import LogisticsRecordsTab from '../../../integration/pages/IntegrationCenter/LogisticsRecordsTab';
import CallbackLogsTab from '../../../integration/pages/IntegrationCenter/CallbackLogsTab';
import SmartStockTab from './SmartStockTab';
import DistributorTab from './DistributorTab';
import SmartPriceTab from './SmartPriceTab';
import SmartRefundTab from './SmartRefundTab';
import StockDiscrepancyTab from './StockDiscrepancyTab';
import { usePersistentState } from '@/hooks/usePersistentState';
import { paths } from '@/routeConfig';

const { Text, Paragraph } = Typography;

const IconMap: Record<string, React.ReactNode> = {
  cloud: <CloudOutlined />, shop: <ShopOutlined />,
  tb: <ApiOutlined />, dy: <ApiOutlined />, jd: <ApiOutlined />,
  tm: <ApiOutlined />, pdd: <ApiOutlined />, xhs: <ApiOutlined />,
  wx: <ApiOutlined />, sf: <ApiOutlined />,
};
const renderIcon = (iconName: string): React.ReactNode => IconMap[iconName] || <ApiOutlined />;

const EcommerceCenter: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = usePersistentState<string>('ecommerce-center-active-tab', 'overview');
  const { loading, syncing, getStatus, getShopStats, syncNow } = usePlatformConnector();

  const [statusMap, setStatusMap] = useState<Record<string, { configured: boolean; status: string }>>({});
  const [shopStatsMap, setShopStatsMap] = useState<Record<string, ShopStats | null>>({});

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

  useEffect(() => { loadAllStatus(); }, [loadAllStatus]);

  const globalStats = useMemo(() => {
    const connected = Object.values(statusMap).filter(s => s.configured).length;
    const todayOrders = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.todayOrders ?? 0), 0);
    const todaySales = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + parseFloat(s?.todaySales ?? '0'), 0);
    const pendingShip = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.pendingShip ?? 0), 0);
    const pendingPick = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.pendingPick ?? 0), 0);
    const noStockWarn = Object.values(shopStatsMap).filter(Boolean).reduce((sum, s) => sum + (s?.noStockWarn ?? 0), 0);
    return { connected, todayOrders, todaySales, pendingShip, pendingPick, noStockWarn };
  }, [statusMap, shopStatsMap]);

  const handleSync = async (p: PlatformMeta) => {
    try {
      await syncNow(p.code);
      loadAllStatus();
    } catch { /* handled in hook */ }
  };

  const renderPlatformCard = (p: PlatformMeta) => {
    const status = statusMap[p.code];
    const isConfigured = status?.configured;
    const isConnected = status?.status === 'ACTIVE' || status?.status === 'CONNECTED';
    const statsData = shopStatsMap[p.code];

    const statusConfig = !status
      ? { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' }
      : isConfigured && isConnected
        ? { color: 'var(--color-success)', icon: <CheckCircleOutlined />, text: '已连接' }
        : isConfigured
          ? { color: 'var(--color-warning)', icon: <WarningOutlined />, text: '已配置' }
          : { color: 'var(--color-border-antd)', icon: <CloseCircleOutlined />, text: '未配置' };

    return (
      <Card
        key={p.code}
        hoverable
        style={{ borderRadius: 12, border: `1px solid ${isConnected ? 'var(--status-success-border)' : isConfigured ? 'var(--status-warning-border)' : 'var(--color-border-light)'}` }}
        styles={{ body: { padding: 20 } }}
        onClick={() => navigate(`${paths.ecommercePlatform}/${p.code}`)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Space size={10}>
            <span style={{
              width: 42, height: 42, borderRadius: 10,
              background: isConnected ? 'var(--status-success-bg)' : isConfigured ? 'var(--status-warning-bg)' : 'var(--color-bg-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: p.color,
            }}>
              {renderIcon(p.icon)}
            </span>
            <div>
              <Text strong style={{ fontSize: 16 }}>{p.name}</Text>
              <div style={{ marginTop: 2 }}><Tag icon={statusConfig.icon} color={isConnected ? 'success' : isConfigured ? 'warning' : 'default'} style={{ margin: 0 }}>{statusConfig.text}</Tag></div>
            </div>
          </Space>
          <ArrowRightOutlined style={{ color: 'var(--color-text-quaternary)', fontSize: 16 }} />
        </div>

        {isConfigured && statsData ? (
          <Row gutter={8}>
            <Col span={8}>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 2 }}>今日订单</div>
              <Text strong style={{ color: 'var(--color-primary)', fontSize: 20 }}>{statsData.todayOrders}</Text>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 2 }}>今日销售</div>
              <Text strong style={{ color: 'var(--color-success)', fontSize: 20 }}>¥{parseFloat(statsData.todaySales).toFixed(0)}</Text>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 2 }}>待发货</div>
              <Text strong style={{ color: statsData.pendingShip > 0 ? 'var(--color-warning)' : '#999', fontSize: 20 }}>{statsData.pendingShip}</Text>
            </Col>
          </Row>
        ) : (
          <Paragraph type="secondary" style={{ fontSize: 14, marginBottom: 0, minHeight: 50 }}>{p.desc}</Paragraph>
        )}

        {isConfigured && statsData && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {statsData.pendingPick > 0 && <Tag color="orange">待拣货 {statsData.pendingPick}</Tag>}
            {statsData.noStockWarn > 0 && <Tag color="red">缺货 {statsData.noStockWarn}</Tag>}
            {statsData.preparing > 0 && <Tag color="blue">备货中 {statsData.preparing}</Tag>}
            {statsData.shippedToday > 0 && <Tag color="green">已出库 {statsData.shippedToday}</Tag>}
          </div>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {p.features.slice(0, 3).map(f => <Tag key={f}>{f}</Tag>)}
        </div>

        {isConfigured && p.syncMode === 'pull' && (
          <Button
            size="small" icon={<SyncOutlined />} loading={syncing}
            onClick={(e) => { e.stopPropagation(); handleSync(p); }}
            style={{ marginTop: 10, width: '100%' }}
          >
            同步订单
          </Button>
        )}
      </Card>
    );
  };

  const connectedPlatforms = PLATFORM_LIST.filter(p => statusMap[p.code]?.configured);
  const unconnectedPlatforms = PLATFORM_LIST.filter(p => !statusMap[p.code]?.configured);

  const overviewContent = (
    <div style={{ padding: '0 8px' }}>
      <Row gutter={16} style={{ marginBottom: 12, marginTop: 8 }}>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-processing-bg) 0%, #f0f5ff 100%)', borderRadius: 12 }}>
              <Statistic title="已对接平台" value={globalStats.connected} suffix={`/ ${PLATFORM_LIST.length}`} prefix={<ApiOutlined style={{ color: 'var(--color-primary)' }} />} styles={{ content: { color: 'var(--color-primary)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-success-bg) 0%, #fcffe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日总订单" value={globalStats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: 'var(--color-success)' }} />} styles={{ content: { color: 'var(--color-success)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-warning-bg) 0%, #FFFBE6 100%)', borderRadius: 12 }}>
              <Statistic title="今日销售额" value={globalStats.todaySales.toFixed(2)} prefix={<DollarOutlined style={{ color: 'var(--color-warning)' }} />} suffix="元" styles={{ content: { color: 'var(--color-warning)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: globalStats.pendingShip > 0 ? 'linear-gradient(135deg, #FFF1F0 0%, var(--status-error-border) 100%)' : 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
              <Statistic title="待发货" value={globalStats.pendingShip} suffix="单" prefix={<InboxOutlined style={{ color: globalStats.pendingShip > 0 ? 'var(--color-danger)' : 'var(--color-accent-purple)' }} />} styles={{ content: { color: globalStats.pendingShip > 0 ? 'var(--color-danger)' : 'var(--color-accent-purple)' } }} />
            </Card>
          </Col>
        </Row>

        {globalStats.noStockWarn > 0 && (
          <Card style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #ffa39e', background: '#FFF1F0' }} styles={{ body: { padding: '10px 16px' } }}>
            <Space>
              <WarningOutlined style={{ color: 'var(--color-danger)', fontSize: 18 }} />
              <Text strong style={{ color: 'var(--color-danger)', fontSize: 14 }}>缺货预警：{globalStats.noStockWarn} 单未匹配到生产单，需人工确认库存或创建生产计划</Text>
              <Button type="link" size="small" onClick={() => navigate('/warehouse/ecommerce')}>查看详情 →</Button>
            </Space>
          </Card>
        )}

        {connectedPlatforms.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <CheckCircleOutlined style={{ color: 'var(--color-success)', marginRight: 8, fontSize: 18 }} />
              <Text strong style={{ fontSize: 17 }}>已对接平台</Text>
              <Tag color="green" style={{ marginLeft: 8 }}>{connectedPlatforms.length} 个</Tag>
            </div>
            <Row gutter={[16, 16]}>
              {connectedPlatforms.map(renderPlatformCard)}
            </Row>
          </div>
        )}

        {unconnectedPlatforms.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <CloudUploadOutlined style={{ color: 'var(--color-warning)', marginRight: 8, fontSize: 18 }} />
              <Text strong style={{ fontSize: 17 }}>待对接平台</Text>
              <Tag color="orange" style={{ marginLeft: 8 }}>{unconnectedPlatforms.length} 个</Tag>
            </div>
            <Row gutter={[16, 16]}>
              {unconnectedPlatforms.map(renderPlatformCard)}
            </Row>
          </div>
        )}

        {connectedPlatforms.length === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对接任何平台，点击平台卡片开始配置" style={{ marginTop: 40 }} />
        )}
      </div>
  );

  const tabs = [
    {
      key: 'overview',
      label: <span><ShopOutlined /> 平台总览</span>,
      children: <Spin spinning={loading}>{overviewContent}</Spin>,
    },
    {
      key: 'payment-records',
      label: <span><CreditCardOutlined /> 支付流水</span>,
      children: <PaymentRecordsTab active={activeTab === 'payment-records'} />,
    },
    {
      key: 'logistics-records',
      label: <span><CarOutlined /> 物流运单</span>,
      children: <LogisticsRecordsTab active={activeTab === 'logistics-records'} />,
    },
    {
      key: 'callback-logs',
      label: <span><BellOutlined /> 回调日志</span>,
      children: <CallbackLogsTab active={activeTab === 'callback-logs'} />,
    },
    {
      key: 'smart-stock',
      label: <span><StockOutlined /> 智能库存</span>,
      children: <SmartStockTab />,
    },
    {
      key: 'smart-price',
      label: <span><ArrowUpOutlined /> 智能定价</span>,
      children: <SmartPriceTab />,
    },
    {
      key: 'smart-refund',
      label: <span><CreditCardOutlined /> 智能退款</span>,
      children: <SmartRefundTab />,
    },
    {
      key: 'stock-discrepancy',
      label: <span><ThunderboltOutlined /> 库存差异</span>,
      children: <StockDiscrepancyTab />,
    },
    {
      key: 'distributor',
      label: <span><TeamOutlined /> 分销/B2B</span>,
      children: <DistributorTab />,
    },
  ];

  return (
    <Tabs
      activeKey={activeTab}
      onChange={setActiveTab}
      items={tabs}
      style={{ background: 'var(--color-bg-base)', padding: '0 16px', borderRadius: 8 }}
    />
  );
};

export default EcommerceCenter;
