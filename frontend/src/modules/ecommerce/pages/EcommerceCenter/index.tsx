import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Row, Col, Card, Statistic, Button, Tag, Spin, Space, Typography, Empty, Tabs,
} from 'antd';
import {
  CheckCircleOutlined, WarningOutlined, CloseCircleOutlined,
  ApiOutlined, ShopOutlined, ShoppingCartOutlined, DollarOutlined,
  SyncOutlined, CloudOutlined, InboxOutlined, ArrowRightOutlined, CloudUploadOutlined,
  CreditCardOutlined, CarOutlined, BellOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { usePlatformConnector, type ShopStats } from '../../../integration/pages/IntegrationCenter/usePlatformConnector';
import { PLATFORM_LIST, type PlatformMeta } from '../../../integration/pages/IntegrationCenter/PlatformConnectorConstants';
import PaymentRecordsTab from '../../../integration/pages/IntegrationCenter/PaymentRecordsTab';
import LogisticsRecordsTab from '../../../integration/pages/IntegrationCenter/LogisticsRecordsTab';
import CallbackLogsTab from '../../../integration/pages/IntegrationCenter/CallbackLogsTab';
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
      ? { color: '#d9d9d9', icon: <CloseCircleOutlined />, text: '未配置' }
      : isConfigured && isConnected
        ? { color: '#52c41a', icon: <CheckCircleOutlined />, text: '已连接' }
        : isConfigured
          ? { color: '#fa8c16', icon: <WarningOutlined />, text: '已配置' }
          : { color: '#d9d9d9', icon: <CloseCircleOutlined />, text: '未配置' };

    return (
      <Card
        key={p.code}
        hoverable
        style={{ borderRadius: 12, border: `1px solid ${isConnected ? '#b7eb8f' : isConfigured ? '#ffe58f' : '#f0f0f0'}` }}
        styles={{ body: { padding: 20 } }}
        onClick={() => navigate(`${paths.ecommercePlatform}/${p.code}`)}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Space size={10}>
            <span style={{
              width: 42, height: 42, borderRadius: 10,
              background: isConnected ? '#f6ffed' : isConfigured ? '#fff7e6' : '#f5f5f5',
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
              <Text strong style={{ color: '#1677ff', fontSize: 20 }}>{statsData.todayOrders}</Text>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 2 }}>今日销售</div>
              <Text strong style={{ color: '#52c41a', fontSize: 20 }}>¥{parseFloat(statsData.todaySales).toFixed(0)}</Text>
            </Col>
            <Col span={8}>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 2 }}>待发货</div>
              <Text strong style={{ color: statsData.pendingShip > 0 ? '#fa8c16' : '#999', fontSize: 20 }}>{statsData.pendingShip}</Text>
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
      <Row gutter={16} style={{ marginBottom: 24, marginTop: 16 }}>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #e6f7ff 0%, #f0f5ff 100%)', borderRadius: 12 }}>
              <Statistic title="已对接平台" value={globalStats.connected} suffix={`/ ${PLATFORM_LIST.length}`} prefix={<ApiOutlined style={{ color: '#1677ff' }} />} styles={{ content: { color: '#1677ff' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #f6ffed 0%, #fcffe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日总订单" value={globalStats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: '#52c41a' }} />} styles={{ content: { color: '#52c41a' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #fff7e6 0%, #fffbe6 100%)', borderRadius: 12 }}>
              <Statistic title="今日销售额" value={globalStats.todaySales.toFixed(2)} prefix={<DollarOutlined style={{ color: '#fa8c16' }} />} suffix="元" styles={{ content: { color: '#fa8c16' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: globalStats.pendingShip > 0 ? 'linear-gradient(135deg, #fff1f0 0%, #ffccc7 100%)' : 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
              <Statistic title="待发货" value={globalStats.pendingShip} suffix="单" prefix={<InboxOutlined style={{ color: globalStats.pendingShip > 0 ? '#ff4d4f' : '#722ed1' }} />} styles={{ content: { color: globalStats.pendingShip > 0 ? '#ff4d4f' : '#722ed1' } }} />
            </Card>
          </Col>
        </Row>

        {globalStats.noStockWarn > 0 && (
          <Card style={{ marginBottom: 16, borderRadius: 8, border: '1px solid #ffa39e', background: '#fff1f0' }} styles={{ body: { padding: '10px 16px' } }}>
            <Space>
              <WarningOutlined style={{ color: '#ff4d4f', fontSize: 18 }} />
              <Text strong style={{ color: '#ff4d4f', fontSize: 14 }}>缺货预警：{globalStats.noStockWarn} 单未匹配到生产单，需人工确认库存或创建生产计划</Text>
              <Button type="link" size="small" onClick={() => navigate('/warehouse/ecommerce')}>查看详情 →</Button>
            </Space>
          </Card>
        )}

        {connectedPlatforms.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
              <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8, fontSize: 18 }} />
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
              <CloudUploadOutlined style={{ color: '#fa8c16', marginRight: 8, fontSize: 18 }} />
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
