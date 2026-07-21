import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tag, App, Tooltip } from 'antd';

import ExternalFactorySmartView from '../ExternalFactory/ExternalFactorySmartView';
import ResizableTable from '@/components/common/ResizableTable';
import PageStatCards from '@/components/common/PageStatCards';

import PageLayout from '@/components/common/PageLayout';
import { useSubProcessRemap } from './hooks/useSubProcessRemap';
import { ProductionOrder } from '@/types/production';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import '../../../styles.css';
import { useShareOrderDialog } from '../ProgressDetail/hooks/useShareOrderDialog';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import { useNavigate } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useModal } from '@/hooks';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import {
  useColumnSettings,
  useProductionTransfer,
  useProcessDetail,
  useProductionActions,
  useProgressTracking,
  useProductionStats,
  useProductionColumns,
  useNodeDetailModal,
  useLabelPrint,
  useOrderFocus,
  useAnomalyDetection,
} from './hooks';
import { useProductionListData } from './hooks/useProductionListData';
import { useStatCardsConfig } from './hooks/useStatCardsConfig';
import AnomalyBanner from './AnomalyBanner';
import { useAiPatrol, RISK_TYPE_LABELS } from './hooks/useAiPatrol';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ProductionModals from './components/ProductionModals';
import ProductionFilterBar from './components/ProductionFilterBar';
import ProductionCardView from './components/ProductionCardView';
import SmartReceiveModal from '../MaterialPurchase/components/SmartReceiveModal';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { useExtColumns } from '@/hooks/useExtColumns';
import { SettingOutlined } from '@ant-design/icons';
import { paths } from '@/routeConfig';

const ProductionList: React.FC = () => {
  const { message } = App.useApp();
  useViewport();
  const { columns: cardColumns } = useCardGridLayout(10);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });
  const quickEditModal = useModal<ProductionOrder>();
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string }>({ open: false, orderNo: '' });
  const { user } = useUser();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const navigate = useNavigate();
  const { factoryTypeOptions } = useOrganizationFilterOptions();

  // 延期环节数据（内联到智能提示标签）
  const { stageHints: delayedHints } = useDelayedStageBreakdown({ forceTab: 'bulk' });

  // ===== 统一弹窗状态管理（useModal） =====
  const printModal = useModal<ProductionOrder>();
  const workflowEditorModal = useModal<string>();
  const inspectDrawerModal = useModal<string>();
  const smartReceiveModal = useModal<string>();

    // ===== Hook 提取：进度/弹窗/打印/聚焦 =====
    const { nodeDetailVisible, nodeDetailOrder, nodeDetailType, nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList, openNodeDetail, closeNodeDetail } = useNodeDetailModal();
    const { labelPrintOpen, closeLabelPrint, labelPrintOrder, labelPrintStyle, handlePrintLabel } = useLabelPrint();

  // ===== 数据层 Hook（状态 + 数据获取 + Effects） =====
  const {
    queryParams, setQueryParams, dateRange, setDateRange,
    sortField, sortOrder, handleSort,
    productionList, selectedRowKeys, setSelectedRowKeys,
    _selectedRows, setSelectedRows, loading, total,
    viewMode, setViewMode,
    setShowDelayedOnly, activeStatFilter, setActiveStatFilter,
    smartQueueFilter, setSmartQueueFilter,
    smartError, showSmartErrorNotice,
    orderFocusRef, calcCardProgress,
    deliveryRiskMap, stagnantOrderIds, smartActionItems,
    fetchProductionList, sortedProductionList,
    focusOrderIds, setFocusOrderIds,
  } = useProductionListData();

  // ===== 提取的 Hooks =====
  const { visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions } = useColumnSettings();
  const { globalStats } = useProductionStats(queryParams);

  // ===== 扩展字段配置 =====
  const { fields: fieldConfigs, loading: fieldConfigLoading } = useFieldConfig({
    bizType: 'production',
    platform: 'pc',
  });
  const { extColumns } = useExtColumns({ bizType: 'production', platform: 'pc' });

  const customFields = useMemo(
    () => fieldConfigs.filter(f => f.isSystem === 0),
    [fieldConfigs]
  );

  // 依赖 fetchProductionList 的 Hooks
  const {
    quickEditSaving, handleQuickEditSave: hookQuickEditSave,
    handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder,
    handleScrapOrder, pendingScrapOrder, scrapOrderLoading, confirmScrapOrder, cancelScrapOrder,
    remarkPopoverId, setRemarkPopoverId, remarkText, setRemarkText, remarkSaving, handleRemarkSave,
    handleCopyOrder,
  } = useProductionActions({ message, isSupervisorOrAbove, fetchProductionList, customFields });

  const {
    transferModalVisible, transferRecord,
    transferType, setTransferType,
    transferUserId, setTransferUserId,
    transferMessage, setTransferMessage, transferUsers, transferSearching,
    transferFactoryId, setTransferFactoryId,
    transferFactoryMessage, setTransferFactoryMessage, transferFactories, transferFactorySearching,
    transferSubmitting, submitTransfer, searchTransferUsers, searchTransferFactories,
    transferBundles, transferBundlesLoading, transferSelectedBundleIds, setTransferSelectedBundleIds,
    transferProcesses, transferProcessesLoading, transferSelectedProcessCodes, setTransferSelectedProcessCodes,
    closeTransferModal,
  } = useProductionTransfer({ message });

  const {
    processDetailVisible, processDetailRecord, processDetailType,
    procurementStatus, processStatus,
    openProcessDetail, closeProcessDetail, syncProcessFromTemplate,
  } = useProcessDetail({ message, fetchProductionList });

  const {
    remapVisible, remapRecord, parentNodes: remapParentNodes,
    remapConfig, remapSaving,
    openSubProcessRemap, closeRemap, saveRemap,
  } = useSubProcessRemap({ message, fetchProductionList });

  const {
    renderCompletionTimeTag,
    getStageCompletionTime,
  } = useProgressTracking(productionList);

  // ===== useOrderFocus: 聚焦/滚动/高亮逻辑 =====
  const { focusedOrderId, pendingScrollOrderId: _pendingScrollOrderId, getOrderDomKey, triggerOrderFocus, clearSmartFocus, scrollToFocusedOrder: _scrollToFocusedOrder } = useOrderFocus(viewMode, sortedProductionList);
  orderFocusRef.current = { triggerOrderFocus, clearSmartFocus };

  // ===== useAnomalyDetection: 异常检测横幅 =====
  
  const { patrolRiskMap, patrolSummary, fetchForOrders, hasRisks, getHighestSeverity, getOrderRisks } = useAiPatrol();
  const { anomalyItems, anomalyBannerVisible, setAnomalyBannerVisible, fetchAnomalies, handleAnomalyClick } = useAnomalyDetection({
    productionList, message, navigate, setActiveStatFilter, setShowDelayedOnly, setSmartQueueFilter, setQueryParams, triggerOrderFocus,
  });

  // 首次加载到订单后，静默触发异常检测和AI巡检（仅检测一次，不阻塞主列表）
  useEffect(() => {
    if (productionList.length > 0) {
      void fetchAnomalies();
      const orderNos = productionList.map(o => o.orderNo).filter(Boolean) as string[];
      fetchForOrders(orderNos);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productionList.length]);

  // 表格列渲染辅助
  const allColumns = useProductionColumns({
    sortField, sortOrder, handleSort,
    handleCloseOrder, handleScrapOrder, handleCopyOrder,
    navigate, openProcessDetail, openNodeDetail, syncProcessFromTemplate,
    setPrintModalVisible: (v: boolean) => { if (!v) printModal.close(); },
    setPrintingRecord: (r: ProductionOrder | null) => { if (r) printModal.open(r); else printModal.close(); },
    setRemarkPopoverId, setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
    deliveryRiskMap,
    stagnantOrderIds,
    handleShareOrder,
    handlePrintLabel,
    canManageOrderLifecycle,
    openSubProcessRemap,
    isFactoryAccount,
    getStageCompletionTime,
    openWorkflowEditor: (styleNo?: string) => workflowEditorModal.open(styleNo || ''),
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
    onOpenInspectDrawer: (orderId: string) => inspectDrawerModal.open(orderId),
    onOpenSmartReceive: (orderNo: string) => smartReceiveModal.open(orderNo),
  });

  // 根据 visibleColumns 过滤列
  const filteredColumns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  // 追加自定义字段列
  const columns = [...filteredColumns, ...extColumns];

  
  const patrolTitleTags = useMemo(() => (record: ProductionOrder) => {
    const risks = getOrderRisks(record.orderNo || '');
    const severity = getHighestSeverity(record.orderNo || '');
    if (!severity || risks.length === 0) return null;
    const label = RISK_TYPE_LABELS[risks[0]?.issueType] || 'AI巡检';
    const colorMap: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'gold' };
    return (
      <Tag color={colorMap[severity] || 'orange'} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>
        {label}
      </Tag>
    );
  }, [patrolRiskMap]);

  // ===== 统计卡片配置（handleStatClick + cards + hints + extraRight） =====
  const { cards: statCards, hints: statHints, onClearHints: statOnClearHints, extraRight: statExtraRight } = useStatCardsConfig({
    globalStats,
    activeStatFilter,
    setActiveStatFilter,
    setShowDelayedOnly,
    setQueryParams,
    queryParams,
    smartActionItems,
    delayedHints,
    focusOrderIds,
    setFocusOrderIds,
    setSmartQueueFilter,
    smartQueueFilter,
  });

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    savePageSize(pageSize);
    setQueryParams(prev => ({ ...prev, page, pageSize }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowSelectionChange = useCallback((keys: React.Key[], rows: ProductionOrder[]) => {
    setSelectedRowKeys(keys);
    setSelectedRows(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSmartOpenRemark = useCallback((record: ProductionOrder) => {
    setRemarkTarget({ open: true, orderNo: record.orderNo || '', merchandiser: record.merchandiser });
  }, []);

  return (
    <>
        <PageLayout
          title="订单管理"
          headerContent={<>
          {showSmartErrorNotice && smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={smartError} onFix={fetchProductionList} />
            </div>
          ) : null}

          <AnomalyBanner
            visible={anomalyBannerVisible}
            items={anomalyItems}
            onClose={() => setAnomalyBannerVisible(false)}
            onItemClick={handleAnomalyClick}
          />

          <PageStatCards
            activeKey={activeStatFilter}
            cards={statCards}
            hints={statHints}
            onClearHints={statOnClearHints}
            extraRight={statExtraRight}
          />
          </>}
          filterLeft={ProductionFilterBar({
            queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
            visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
            viewMode, setViewMode, factoryTypeOptions,
          }).filterLeft}
          filterRight={
            <>
              {ProductionFilterBar({
                queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
                visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
                viewMode, setViewMode, factoryTypeOptions,
              }).filterRight}
              <a
                onClick={() => navigate(`${paths.fieldConfig}?bizType=production`)}
                style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <SettingOutlined /> 字段配置
              </a>

            </>
          }
        >
          {viewMode === 'smart' ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <ExternalFactorySmartView
              data={sortedProductionList}
              loading={loading}
              total={smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? sortedProductionList.length : total}
              currentPage={queryParams.page}
              pageSize={queryParams.pageSize}
              onPageChange={handlePageChange}
              handleCloseOrder={handleCloseOrder}
              handleScrapOrder={handleScrapOrder}
              openProcessDetail={openProcessDetail}
              openNodeDetail={openNodeDetail}
              syncProcessFromTemplate={syncProcessFromTemplate}
              quickEditModal={quickEditModal}
              handleShareOrder={handleShareOrder}
              handlePrintLabel={handlePrintLabel}
              canManageOrderLifecycle={canManageOrderLifecycle}
              isSupervisorOrAbove={isSupervisorOrAbove}
              openSubProcessRemap={openSubProcessRemap}
              isFactoryAccount={isFactoryAccount}
              onOpenRemark={handleSmartOpenRemark}
            />
            </div>
          ) : viewMode === 'list' ? (
            <ResizableTable<any>
              storageKey="production-order-table"
              columns={columns as any}
              dataSource={sortedProductionList}
              rowKey="id"
              loading={loading}
              scroll={{ x: 3500 }}
              rowClassName={(record: ProductionOrder) => getOrderDomKey(record) === focusedOrderId ? 'smart-order-focus-row' : ''}
              rowSelection={{
                selectedRowKeys,
                onChange: handleRowSelectionChange,
              }}
              stickyHeader
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total: smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? sortedProductionList.length : total,
                showTotal: (t) => `共 ${t} 条${smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? '（已筛选）' : ''}`,
                showSizeChanger: true,
                pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                onChange: handlePageChange,
              }}
              showExport={true}
              exportFilename="生产订单.xlsx"
              emptyDescription="暂无生产订单"
              emptyActionText="去创建订单"
              onEmptyAction={() => navigate('/order-management')}
            />
          ) : (
            <ProductionCardView
              sortedProductionList={sortedProductionList}
              cardColumns={cardColumns}
              page={queryParams.page}
              pageSize={queryParams.pageSize}
              handlePageChange={handlePageChange}
              smartQueueFilter={smartQueueFilter}
              focusOrderIds={focusOrderIds}
              total={total}
              focusedOrderId={focusedOrderId}
              getOrderDomKey={getOrderDomKey}
              calcCardProgress={calcCardProgress}
              patrolTitleTags={patrolTitleTags}
              navigate={navigate}
              quickEditModal={quickEditModal}
              printModal={printModal}
              handlePrintLabel={handlePrintLabel}
              openProcessDetail={openProcessDetail}
              openSubProcessRemap={openSubProcessRemap}
              smartReceiveModal={smartReceiveModal}
              handleCloseOrder={handleCloseOrder}
              handleScrapOrder={handleScrapOrder}
              handleCopyOrder={handleCopyOrder}
              handleShareOrder={handleShareOrder}
              canManageOrderLifecycle={canManageOrderLifecycle}
              isSupervisorOrAbove={isSupervisorOrAbove}
              isFactoryAccount={isFactoryAccount}
              setRemarkTarget={setRemarkTarget}
            />
          )}
        </PageLayout>

        <ProductionModals
          quickEditModal={quickEditModal}
          quickEditSaving={quickEditSaving}
          onQuickEditSave={hookQuickEditSave}
          remarkPopoverId={remarkPopoverId}
          setRemarkPopoverId={setRemarkPopoverId}
          remarkText={remarkText}
          setRemarkText={setRemarkText}
          remarkSaving={remarkSaving}
          handleRemarkSave={handleRemarkSave}
          processDetailVisible={processDetailVisible}
          closeProcessDetail={closeProcessDetail}
          processDetailRecord={processDetailRecord}
          processDetailType={processDetailType}
          procurementStatus={procurementStatus}
          processStatus={processStatus}
          fetchProductionList={fetchProductionList}
          nodeDetailVisible={nodeDetailVisible}
          closeNodeDetail={closeNodeDetail}
          nodeDetailOrder={nodeDetailOrder}
          nodeDetailType={nodeDetailType}
          nodeDetailName={nodeDetailName ?? ''}
          nodeDetailStats={nodeDetailStats}
          nodeDetailUnitPrice={nodeDetailUnitPrice ?? 0}
          nodeDetailProcessList={nodeDetailProcessList ?? []}
          transferModalVisible={transferModalVisible}
          transferRecord={transferRecord}
          transferType={transferType}
          setTransferType={setTransferType}
          transferUserId={transferUserId ?? ''}
          setTransferUserId={setTransferUserId}
          transferMessage={transferMessage}
          setTransferMessage={setTransferMessage}
          transferUsers={transferUsers}
          transferSearching={transferSearching}
          transferFactoryId={transferFactoryId ?? ''}
          setTransferFactoryId={setTransferFactoryId}
          transferFactoryMessage={transferFactoryMessage}
          setTransferFactoryMessage={setTransferFactoryMessage}
          transferFactories={transferFactories}
          transferFactorySearching={transferFactorySearching}
          transferSubmitting={transferSubmitting}
          transferBundles={transferBundles}
          transferBundlesLoading={transferBundlesLoading}
          transferSelectedBundleIds={transferSelectedBundleIds}
          setTransferSelectedBundleIds={setTransferSelectedBundleIds}
          transferProcesses={transferProcesses}
          transferProcessesLoading={transferProcessesLoading}
          transferSelectedProcessCodes={transferSelectedProcessCodes}
          setTransferSelectedProcessCodes={setTransferSelectedProcessCodes}
          searchTransferUsers={searchTransferUsers}
          searchTransferFactories={searchTransferFactories}
          submitTransfer={submitTransfer}
          closeTransferModal={closeTransferModal}
          shareOrderDialog={shareOrderDialog}
          remarkTarget={remarkTarget}
          setRemarkTarget={setRemarkTarget}
          isSupervisorOrAbove={isSupervisorOrAbove}
          isFactoryAccount={isFactoryAccount}
          user={user}
          labelPrintOpen={labelPrintOpen}
          closeLabelPrint={closeLabelPrint}
          labelPrintOrder={labelPrintOrder}
          labelPrintStyle={labelPrintStyle}
          remapVisible={remapVisible}
          remapRecord={remapRecord}
          remapParentNodes={remapParentNodes}
          remapConfig={remapConfig}
          remapSaving={remapSaving}
          saveRemap={saveRemap}
          closeRemap={closeRemap}
          printModalVisible={printModal.visible}
          setPrintModalVisible={(v: boolean) => v ? undefined : printModal.close()}
          printingRecord={printModal.data}
          setPrintingRecord={(r: ProductionOrder | null) => r !== null ? printModal.open(r) : printModal.close()}
          pendingCloseOrder={pendingCloseOrder}
          closeOrderLoading={closeOrderLoading}
          confirmCloseOrder={confirmCloseOrder}
          cancelCloseOrder={cancelCloseOrder}
          pendingScrapOrder={pendingScrapOrder}
          scrapOrderLoading={scrapOrderLoading}
          confirmScrapOrder={confirmScrapOrder}
          cancelScrapOrder={cancelScrapOrder}
          workflowEditorVisible={workflowEditorModal.visible}
          workflowEditorStyleNo={workflowEditorModal.data ?? ''}
          closeWorkflowEditor={() => workflowEditorModal.close()}
          onWorkflowSaved={() => { void fetchProductionList(); }}
          onOpenInspectDrawer={(orderId: string) => inspectDrawerModal.open(orderId)}
          inspectDrawerVisible={inspectDrawerModal.visible}
          inspectDrawerOrderId={inspectDrawerModal.data ?? ''}
          closeInspectDrawer={() => inspectDrawerModal.close()}
          customFields={customFields}
          fieldConfigs={fieldConfigs}
        />

        {/* 智能领取弹窗（入库/出库） */}
        <SmartReceiveModal
          open={smartReceiveModal.visible}
          orderNo={smartReceiveModal.data ?? ''}
          onCancel={() => smartReceiveModal.close()}
          onSuccess={() => { void fetchProductionList(); }}
          isSupervisorOrAbove={isSupervisorOrAbove}
          userId={user?.id as any}
          userName={user?.name || user?.username || ''}
        />

    </>
  );
};

export default ProductionList;
