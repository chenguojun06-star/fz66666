import React, { useMemo } from 'react';
import { Button, Space, Tabs } from 'antd';
import { WarningOutlined, ShoppingCartOutlined, InboxOutlined, SwapOutlined, ThunderboltOutlined, RobotOutlined, MergeCellsOutlined, GiftOutlined, PlusOutlined, EnvironmentOutlined, AuditOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { UniversalStock, StockAlert, PurchaseSuggestion, WarehouseAllocation, MergeGroup, GiftRule, LogisticsAnomaly, PlatformBill } from './useEcStock';
import { useSmartStockData } from './useSmartStockData';
import { buildAllColumns } from './columns';
import SafeStockModal from './components/SafeStockModal';
import SplitDetailModal from './components/SplitDetailModal';
import MergeOutboundModal from './components/MergeOutboundModal';
import GiftRuleModal from './components/GiftRuleModal';

const SmartStockTab: React.FC = () => {
  const data = useSmartStockData();
  const {
    st,
    safeStockRecord, setSafeStockRecord,
    splitVisible, setSplitVisible,
    mergeGroup, setMergeGroup,
    mergeModalOpen, setMergeModalOpen,
    giftRuleRecord, setGiftRuleRecord,
    giftRuleModalOpen, setGiftRuleModalOpen,
    aiScanning,
    anomalyScanning,
    billReconciling,
    handleAiScan,
    handleSafeStock,
    handleMergeOutbound,
    handleSaveGiftRule,
    handleScanAnomalies,
    handleReconcileBills,
  } = data;

  const cols = useMemo(() => buildAllColumns({
    handleResolve: data.handleResolve,
    generateSuggestions: st.generateSuggestions,
    handleApprove: data.handleApprove,
    handleReject: data.handleReject,
    setSafeStockRecord,
    setSplitVisible,
    setMergeGroup,
    setMergeModalOpen,
    setGiftRuleRecord,
    setGiftRuleModalOpen,
    handleDeleteGiftRule: data.handleDeleteGiftRule,
    handleHandleAnomaly: data.handleHandleAnomaly,
    handleIgnoreAnomaly: data.handleIgnoreAnomaly,
    handleHandleBill: data.handleHandleBill,
  }), [data, st, setSafeStockRecord, setSplitVisible, setMergeGroup, setMergeModalOpen, setGiftRuleRecord, setGiftRuleModalOpen]);

  const tabItems = [
    { key: 'alerts', label: <span><WarningOutlined /> 预警列表</span>, children: <ResizableTable<StockAlert> dataSource={st.alerts} columns={cols.alertCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无数据" /> },
    {
      key: 'suggestions',
      label: <span><ShoppingCartOutlined /> 补货建议</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
              AI 补货顾问根据租户类型与款式 BOM 自动判断走采购还是生产，置信度低于 70% 时请仔细核对
            </span>
            <Space>
              <Button icon={<ThunderboltOutlined />} loading={aiScanning} onClick={handleAiScan}>AI 扫描生成建议</Button>
            </Space>
          </div>
          <ResizableTable<PurchaseSuggestion> dataSource={st.suggestions} columns={cols.suggestionCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无数据" />
        </div>
      ),
    },
    { key: 'stock', label: <span><InboxOutlined /> 库存明细</span>, children: <ResizableTable<UniversalStock> dataSource={st.stockList} columns={cols.stockCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无库存数据" /> },
    { key: 'allocations', label: <span><SwapOutlined /> 分配记录</span>, children: <ResizableTable<WarehouseAllocation> dataSource={st.allocations} columns={cols.allocCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无数据" /> },
    {
      key: 'merge',
      label: <span><MergeCellsOutlined /> 合单管理</span>,
      children: (
        <div>
          <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, marginBottom: 12 }}>
            系统自动扫描同收货人+同平台的多笔待发货订单，合并成一个包裹发货可节省运费
          </div>
          <ResizableTable<MergeGroup> dataSource={st.mergeGroups} columns={cols.mergeCols} rowKey={(r) => `${r.receiverPhone}_${r.platform}`} size="small" loading={st.loading} emptyDescription="暂无数据" />
        </div>
      ),
    },
    {
      key: 'gift',
      label: <span><GiftOutlined /> 赠品规则</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              按订单金额/数量/平台自动匹配赠品规则
            </span>
            <Button icon={<PlusOutlined />} type="primary" onClick={() => { setGiftRuleRecord(null); setGiftRuleModalOpen(true); }}>新增规则</Button>
          </div>
          <ResizableTable<GiftRule> dataSource={st.giftRules} columns={cols.giftRuleCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无数据" />
        </div>
      ),
    },
    {
      key: 'logistics',
      label: <span><EnvironmentOutlined /> 物流监控</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
              AI 监控在途订单物流异常（超时未签/轨迹停滞/轨迹异常），自动生成处理建议
            </span>
            <Button icon={<ThunderboltOutlined />} loading={anomalyScanning} onClick={handleScanAnomalies}>扫描物流异常</Button>
          </div>
          <ResizableTable<LogisticsAnomaly> dataSource={st.anomalies} columns={cols.anomalyCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无数据" />
        </div>
      ),
    },
    {
      key: 'bills',
      label: <span><AuditOutlined /> 账单对账</span>,
      children: (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
              <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
              AI 对账：拉取平台账单与本地收入流水比对，自动分析差异原因（佣金扣除/跨账期/优惠券等）
            </span>
            <Button icon={<ThunderboltOutlined />} loading={billReconciling} onClick={handleReconcileBills}>触发对账</Button>
          </div>
          <ResizableTable<PlatformBill> dataSource={st.bills} columns={cols.billCols} rowKey="id" size="small" loading={st.loading} emptyDescription="暂无财务数据" />
        </div>
      ),
    },
  ];

  return (
    <>
      <Tabs items={tabItems} />
      <SafeStockModal open={!!safeStockRecord} record={safeStockRecord} onClose={() => setSafeStockRecord(null)} onOk={handleSafeStock} />
      <SplitDetailModal open={splitVisible} splits={[]} onClose={() => setSplitVisible(false)} />
      <MergeOutboundModal open={mergeModalOpen} group={mergeGroup} onClose={() => setMergeModalOpen(false)} onOk={handleMergeOutbound} />
      <GiftRuleModal open={giftRuleModalOpen} record={giftRuleRecord} onClose={() => setGiftRuleModalOpen(false)} onOk={handleSaveGiftRule} />
    </>
  );
};

export default SmartStockTab;
