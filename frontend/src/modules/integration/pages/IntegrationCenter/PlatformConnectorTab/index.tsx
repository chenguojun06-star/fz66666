import React from 'react';
import { Row, Col, Card, Statistic, Button, Spin, Alert, Empty } from 'antd';
import {
  ApiOutlined, ShoppingCartOutlined, DollarOutlined, CloudUploadOutlined, InboxOutlined, ShopOutlined,
} from '@ant-design/icons';
import { PLATFORM_LIST } from '../PlatformConnectorConstants';
import { usePlatformConnectorTabData } from './usePlatformConnectorTabData';
import PlatformCard from './PlatformCard';
import ConfigModal from './ConfigModal';
import TestResultModal from './TestResultModal';
import StatsModal from './StatsModal';
import SyncResultModal from './SyncResultModal';
import AddStoreWizard from '../AddStoreWizard';

const PlatformConnectorTab: React.FC<{ active: boolean }> = ({ active }) => {
  const {
    loading, testing, syncing,
    statusMap, shopStatsMap,
    configModalOpen, testModalOpen, statsModalOpen,
    activePlatform, activeStats,
    testResult, syncResult,
    form, stats,
    setConfigModalOpen, setTestModalOpen, setStatsModalOpen,
    setActiveStats, setTestResult, setSyncResult,
    handleConfig, handleSave, handleTest, handleSync, handleViewStats,
    triggerTest, loadAllStatus,
  } = usePlatformConnectorTabData(active);
  const [wizardOpen, setWizardOpen] = React.useState(false);

  return (
    <Spin spinning={loading}>
      <div className="u-p-08px">
        {/* ====== 数据总览 ====== */}
        <Row gutter={16} style={{ marginBottom: 24, marginTop: 16 }}>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'var(--status-processing-bg)', borderRadius: 12 }}>
              <Statistic title="已对接平台" value={stats.connected} suffix={`/ ${stats.total}`} prefix={<ApiOutlined style={{ color: 'var(--color-primary)' }} />} styles={{ content: { color: 'var(--color-primary)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'var(--status-success-bg)', borderRadius: 12 }}>
              <Statistic title="今日总订单" value={stats.todayOrders} suffix="单" prefix={<ShoppingCartOutlined style={{ color: 'var(--color-success)' }} />} styles={{ content: { color: 'var(--color-success)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'var(--status-warning-bg)', borderRadius: 12 }}>
              <Statistic title="今日销售额" value={stats.todaySales.toFixed(2)} prefix={<DollarOutlined style={{ color: 'var(--color-warning)' }} />} suffix="元" styles={{ content: { color: 'var(--color-warning)' } }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card variant="borderless" style={{ background: 'var(--color-bg-subtle)', borderRadius: 12 }}>
              <Statistic title="平台总数" value={PLATFORM_LIST.length} suffix="个" prefix={<CloudUploadOutlined style={{ color: 'var(--color-accent-purple)' }} />} styles={{ content: { color: 'var(--color-accent-purple)' } }} />
            </Card>
          </Col>
        </Row>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <Alert type="success" showIcon style={{ flex: 1, borderRadius: 8, marginBottom: 0 }}
            title={<span><InboxOutlined /> <strong>四步对接</strong>：选择平台 → 填密钥 → 点一下去平台授权 → 完成</span>}
            description="支持 10 大电商平台，订单自动同步，物流自动回传；授权令牌到期自动续期"
          />
          <Button type="primary" size="large" icon={<ShopOutlined />} onClick={() => setWizardOpen(true)}>
            添加店铺
          </Button>
        </div>
        <Row gutter={[16, 16]}>
          {PLATFORM_LIST.map(p => (
            <PlatformCard
              key={p.code}
              p={p}
              statusMap={statusMap}
              shopStatsMap={shopStatsMap}
              testing={testing}
              syncing={syncing}
              activePlatformCode={activePlatform?.code}
              onConfig={handleConfig}
              onTest={triggerTest}
              onViewStats={handleViewStats}
              onSync={handleSync}
            />
          ))}
        </Row>
        {stats.connected === 0 && (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="还没有对接任何平台" style={{ marginTop: 40 }}>
            <Button type="primary" onClick={() => PLATFORM_LIST[0] && handleConfig(PLATFORM_LIST[0])}>立即配置</Button>
          </Empty>
        )}

        {/* ====== 配置弹窗 ====== */}
        <ConfigModal
          open={configModalOpen}
          activePlatform={activePlatform}
          form={form}
          testing={testing}
          onCancel={() => { setConfigModalOpen(false); setTestResult(null); }}
          onTest={handleTest}
          onSave={handleSave}
        />

        {/* ====== 测试结果弹窗 ====== */}
        <TestResultModal
          open={testModalOpen}
          testResult={testResult}
          activePlatform={activePlatform}
          onCancel={() => { setTestModalOpen(false); setTestResult(null); }}
          onClose={() => setTestModalOpen(false)}
        />

        {/* ====== 店铺数据看板弹窗 ====== */}
        <StatsModal
          open={statsModalOpen}
          activePlatform={activePlatform}
          activeStats={activeStats}
          onCancel={() => { setStatsModalOpen(false); setActiveStats(null); }}
          onClose={() => setStatsModalOpen(false)}
        />

        {/* ====== 同步结果 ====== */}
        <SyncResultModal
          open={!!syncResult}
          activePlatform={activePlatform}
          syncResult={syncResult}
          onCancel={() => setSyncResult(null)}
          onClose={() => setSyncResult(null)}
        />
      </div>

      {/* ====== D-587 添加店铺四步向导 ====== */}
      <AddStoreWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onChanged={loadAllStatus}
      />
    </Spin>
  );
};

export default PlatformConnectorTab;
