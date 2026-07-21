import React, { useMemo, useCallback } from 'react';
import { Card, Empty } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import FactoryStatementPrintModal from './FactoryStatementPrintModal';
import FactoryOrderDrilldown from './FactoryOrderDrilldown';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useFactorySummaryData, type FactorySummaryRow } from './useFactorySummaryData';
import { getFactorySummaryColumns, renderFactorySummarySummary } from './factorySummaryColumns';
import StatsCards from './components/StatsCards';
import FactoryLeaderboard from './components/FactoryLeaderboard';
import FilterToolbar from './components/FilterToolbar';

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FactorySummaryContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
  const {
    form,
    loading,
    data,
    selectedRowKeys,
    pushedFactoryIds,
    smartError,
    batchApproveLoading,
    exportLoading,
    showSmartErrorNotice,
    leaderboard,
    lbLoading,
    lbCollapsed,
    presetValue,
    statusTab,
    printModalVisible,
    drilldownOpen,
    drilldownTarget,
    setSelectedRowKeys,
    setLbCollapsed,
    setPresetValue,
    setStatusTab,
    setPrintModalVisible,
    setDrilldownOpen,
    setDrilldownTarget,
    stats,
    filteredDataByTab,
    filteredData,
    summary,
    handlePresetChange,
    handlePrintStatement,
    getPrintData,
    getDateRange,
    handleReject,
    handleApprove,
    handleBatchApprove,
    handleExport,
    fetchData,
  } = useFactorySummaryData(auditedOrderNos, onAuditNosChange);

  const openDrilldown = useCallback((record: FactorySummaryRow) => {
    setDrilldownTarget(record);
    setDrilldownOpen(true);
  }, [setDrilldownOpen, setDrilldownTarget]);

  const columns = useMemo(
    () => getFactorySummaryColumns(auditedOrderNos, pushedFactoryIds, handleApprove, handleReject, openDrilldown),
    [auditedOrderNos, pushedFactoryIds, handleApprove, handleReject, openDrilldown],
  );

  const renderSummary = useMemo(
    () => () => renderFactorySummarySummary(filteredData, summary),
    [filteredData, summary],
  );

  return (
    <div>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void fetchData();
            }}
          />
        </Card>
      ) : null}

      {/* ===== 统一统计卡片 ===== */}
      <StatsCards stats={stats} summary={summary} />

      {/* 工厂绩效榜 */}
      <FactoryLeaderboard
        leaderboard={leaderboard}
        lbLoading={lbLoading}
        lbCollapsed={lbCollapsed}
        onToggleCollapse={() => setLbCollapsed(!lbCollapsed)}
      />

      {/* 搜索 & 工具栏 */}
      <FilterToolbar
        form={form}
        loading={loading}
        dataCount={data.length}
        stats={stats}
        selectedRowKeysCount={selectedRowKeys.length}
        presetValue={presetValue}
        statusTab={statusTab}
        batchApproveLoading={batchApproveLoading}
        exportLoading={exportLoading}
        onPresetChange={handlePresetChange}
        onClearPreset={() => setPresetValue('')}
        onStatusTabChange={setStatusTab}
        onSubmitSearch={fetchData}
        onResetSearch={fetchData}
        onBatchApprove={handleBatchApprove}
        onPrintStatement={handlePrintStatement}
        onExport={handleExport}
        onRefresh={fetchData}
      />

      {/* 数据表格 */}
      <ResizableTable
        columns={columns}
        dataSource={filteredDataByTab}
        rowKey="factoryName"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        summary={renderSummary}
      />
      <FactoryStatementPrintModal
        visible={printModalVisible}
        onClose={() => setPrintModalVisible(false)}
        factoryData={getPrintData()}
        dateRange={printModalVisible ? getDateRange() : ['-', '-']}
      />

      {drilldownTarget && (
        <FactoryOrderDrilldown
          open={drilldownOpen}
          factoryName={drilldownTarget.factoryName}
          factoryType={drilldownTarget.factoryType}
          orderNos={drilldownTarget.orderNos || []}
          totalAmount={drilldownTarget.totalAmount}
          totalMaterialCost={drilldownTarget.totalMaterialCost}
          totalProductionCost={drilldownTarget.totalProductionCost}
          totalProfit={drilldownTarget.totalProfit}
          totalDefectQuantity={drilldownTarget.totalDefectQuantity}
          totalOrderQuantity={drilldownTarget.totalOrderQuantity}
          totalWarehousedQuantity={drilldownTarget.totalWarehousedQuantity}
          onClose={() => { setDrilldownOpen(false); setDrilldownTarget(null); }}
        />
      )}
    </div>
  );
};

export default FactorySummaryContent;
