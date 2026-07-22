import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { App } from 'antd';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import { useSubProcessRemap } from './hooks/useSubProcessRemap';
import { ProductionOrder } from '@/types/production';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import '../../../styles.css';
import { useShareOrderDialog } from '../ProgressDetail/hooks/useShareOrderDialog';
import { savePageSize } from '@/utils/pageSizeStore';
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
  useNodeDetailModal,
  useLabelPrint,
  useOrderFocus,
  useAnomalyDetection,
} from './hooks';
import { useProductionListData } from './hooks/useProductionListData';
import { useStatCardsConfig } from './hooks/useStatCardsConfig';
import AnomalyBanner from './AnomalyBanner';
import { useAiPatrol } from './hooks/useAiPatrol';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ProductionModals from './components/ProductionModals';
import ProductionFilterBar from './components/ProductionFilterBar';
import ProductionContentView from './components/ProductionContentView';
import SmartReceiveModal from '../MaterialPurchase/components/SmartReceiveModal';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import { SettingOutlined } from '@ant-design/icons';
import { paths } from '@/routeConfig';
import { usePatrolTitleTags } from './hooks/usePatrolTitleTags.tsx';
import { useTableColumns } from './hooks/useTableColumns';

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
  const { stageHints: delayedHints } = useDelayedStageBreakdown({ forceTab: 'bulk' });

  const printModal = useModal<ProductionOrder>();
  const workflowEditorModal = useModal<string>();
  const inspectDrawerModal = useModal<string>();
  const smartReceiveModal = useModal<string>();

  const nodeDetailModal = useNodeDetailModal();
  const labelPrint = useLabelPrint();
  const listData = useProductionListData();
  const columnSettings = useColumnSettings();
  const { globalStats } = useProductionStats(listData.queryParams);
  const { fields: fieldConfigs } = useFieldConfig({ bizType: 'production', platform: 'pc' });
  const customFields = useMemo(() => fieldConfigs.filter(f => f.isSystem === 0), [fieldConfigs]);

  const productionActions = useProductionActions({
    message, isSupervisorOrAbove, fetchProductionList: listData.fetchProductionList, customFields,
  });
  const productionTransfer = useProductionTransfer({ message });
  const processDetail = useProcessDetail({ message, fetchProductionList: listData.fetchProductionList });
  const subProcessRemap = useSubProcessRemap({ message, fetchProductionList: listData.fetchProductionList });
  const progressTracking = useProgressTracking(listData.productionList);
  const orderFocus = useOrderFocus(listData.viewMode, listData.sortedProductionList);
  listData.orderFocusRef.current = { triggerOrderFocus: orderFocus.triggerOrderFocus, clearSmartFocus: orderFocus.clearSmartFocus };

  const { fetchForOrders } = useAiPatrol();
  const anomalyDetection = useAnomalyDetection({
    productionList: listData.productionList, message, navigate,
    setActiveStatFilter: listData.setActiveStatFilter, setShowDelayedOnly: listData.setShowDelayedOnly,
    setSmartQueueFilter: listData.setSmartQueueFilter, setQueryParams: listData.setQueryParams,
    triggerOrderFocus: orderFocus.triggerOrderFocus,
  });

  useEffect(() => {
    if (listData.productionList.length > 0) {
      void anomalyDetection.fetchAnomalies();
      const orderNos = listData.productionList.map(o => o.orderNo).filter(Boolean) as string[];
      fetchForOrders(orderNos);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listData.productionList.length]);

  const { columns } = useTableColumns({
    sortField: listData.sortField, sortOrder: listData.sortOrder, handleSort: listData.handleSort,
    handleCloseOrder: productionActions.handleCloseOrder, handleScrapOrder: productionActions.handleScrapOrder,
    handleCopyOrder: productionActions.handleCopyOrder, navigate, openProcessDetail: processDetail.openProcessDetail,
    openNodeDetail: nodeDetailModal.openNodeDetail, syncProcessFromTemplate: processDetail.syncProcessFromTemplate,
    setPrintModalVisible: (v: boolean) => { if (!v) printModal.close(); },
    setPrintingRecord: (r: ProductionOrder | null) => { if (r) printModal.open(r); else printModal.close(); },
    setRemarkPopoverId: productionActions.setRemarkPopoverId, setRemarkText: productionActions.setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag: progressTracking.renderCompletionTimeTag,
    deliveryRiskMap: listData.deliveryRiskMap, stagnantOrderIds: listData.stagnantOrderIds,
    handleShareOrder, handlePrintLabel: labelPrint.handlePrintLabel, canManageOrderLifecycle,
    openSubProcessRemap: subProcessRemap.openSubProcessRemap, isFactoryAccount,
    getStageCompletionTime: progressTracking.getStageCompletionTime,
    openWorkflowEditor: (styleNo?: string) => workflowEditorModal.open(styleNo || ''),
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
    onOpenInspectDrawer: (orderId: string) => inspectDrawerModal.open(orderId),
    onOpenSmartReceive: (orderNo: string) => smartReceiveModal.open(orderNo),
    visibleColumns: columnSettings.visibleColumns,
  });

  const { patrolTitleTags } = usePatrolTitleTags();

  const statCards = useStatCardsConfig({
    globalStats, activeStatFilter: listData.activeStatFilter, setActiveStatFilter: listData.setActiveStatFilter,
    setShowDelayedOnly: listData.setShowDelayedOnly, setQueryParams: listData.setQueryParams,
    queryParams: listData.queryParams, smartActionItems: listData.smartActionItems, delayedHints,
    focusOrderIds: listData.focusOrderIds, setFocusOrderIds: listData.setFocusOrderIds,
    setSmartQueueFilter: listData.setSmartQueueFilter, smartQueueFilter: listData.smartQueueFilter,
  });

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    savePageSize(pageSize);
    listData.setQueryParams(prev => ({ ...prev, page, pageSize }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowSelectionChange = useCallback((keys: React.Key[], rows: ProductionOrder[]) => {
    listData.setSelectedRowKeys(keys);
    listData.setSelectedRows(rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSmartOpenRemark = useCallback((record: ProductionOrder) => {
    setRemarkTarget({ open: true, orderNo: record.orderNo || '', merchandiser: record.merchandiser });
  }, []);

  const filterBarProps = {
    queryParams: listData.queryParams, setQueryParams: listData.setQueryParams,
    dateRange: listData.dateRange, setDateRange: listData.setDateRange,
    fetchProductionList: listData.fetchProductionList,
    visibleColumns: columnSettings.visibleColumns, toggleColumnVisible: columnSettings.toggleColumnVisible,
    resetColumnSettings: columnSettings.resetColumnSettings, columnOptions: columnSettings.columnOptions,
    viewMode: listData.viewMode, setViewMode: listData.setViewMode, factoryTypeOptions,
  };

  return (
    <>
      <PageLayout
        title="订单管理"
        headerContent={<>
          {listData.showSmartErrorNotice && listData.smartError ? (
            <div style={{ marginBottom: 12 }}>
              <SmartErrorNotice error={listData.smartError} onFix={listData.fetchProductionList} />
            </div>
          ) : null}
          <AnomalyBanner
            visible={anomalyDetection.anomalyBannerVisible}
            items={anomalyDetection.anomalyItems}
            onClose={() => anomalyDetection.setAnomalyBannerVisible(false)}
            onItemClick={anomalyDetection.handleAnomalyClick}
          />
          <PageStatCards
            activeKey={listData.activeStatFilter}
            cards={statCards.cards}
            hints={statCards.hints}
            onClearHints={statCards.onClearHints}
            extraRight={statCards.extraRight}
          />
        </>}
        filterLeft={ProductionFilterBar(filterBarProps).filterLeft}
        filterRight={
          <>
            {ProductionFilterBar(filterBarProps).filterRight}
            <a
              onClick={() => navigate(`${paths.fieldConfig}?bizType=production`)}
              style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <SettingOutlined /> 字段配置
            </a>
          </>
        }
      >
        <ProductionContentView
          viewMode={listData.viewMode}
          sortedProductionList={listData.sortedProductionList}
          loading={listData.loading}
          total={listData.total}
          page={listData.queryParams.page}
          pageSize={listData.queryParams.pageSize}
          smartQueueFilter={listData.smartQueueFilter}
          focusOrderIds={listData.focusOrderIds}
          selectedRowKeys={listData.selectedRowKeys}
          onRowSelectionChange={handleRowSelectionChange}
          onPageChange={handlePageChange}
          focusedOrderId={orderFocus.focusedOrderId}
          getOrderDomKey={orderFocus.getOrderDomKey}
          navigate={navigate}
          columns={columns}
          cardColumns={cardColumns}
          calcCardProgress={listData.calcCardProgress}
          patrolTitleTags={patrolTitleTags}
          quickEditModal={quickEditModal}
          printModal={printModal}
          handlePrintLabel={labelPrint.handlePrintLabel}
          openProcessDetail={processDetail.openProcessDetail}
          openSubProcessRemap={subProcessRemap.openSubProcessRemap}
          smartReceiveModal={smartReceiveModal}
          handleCloseOrder={productionActions.handleCloseOrder}
          handleScrapOrder={productionActions.handleScrapOrder}
          handleCopyOrder={productionActions.handleCopyOrder}
          handleShareOrder={handleShareOrder}
          canManageOrderLifecycle={canManageOrderLifecycle}
          isSupervisorOrAbove={isSupervisorOrAbove}
          isFactoryAccount={isFactoryAccount}
          setRemarkTarget={setRemarkTarget}
          openNodeDetail={nodeDetailModal.openNodeDetail}
          syncProcessFromTemplate={processDetail.syncProcessFromTemplate}
          handleSmartOpenRemark={handleSmartOpenRemark}
        />
      </PageLayout>

      <ProductionModals
        quickEditModal={quickEditModal}
        quickEditSaving={productionActions.quickEditSaving}
        onQuickEditSave={productionActions.handleQuickEditSave}
        remarkPopoverId={productionActions.remarkPopoverId}
        setRemarkPopoverId={productionActions.setRemarkPopoverId}
        remarkText={productionActions.remarkText}
        setRemarkText={productionActions.setRemarkText}
        remarkSaving={productionActions.remarkSaving}
        handleRemarkSave={productionActions.handleRemarkSave}
        processDetailVisible={processDetail.processDetailVisible}
        closeProcessDetail={processDetail.closeProcessDetail}
        processDetailRecord={processDetail.processDetailRecord}
        processDetailType={processDetail.processDetailType}
        procurementStatus={processDetail.procurementStatus}
        processStatus={processDetail.processStatus}
        fetchProductionList={listData.fetchProductionList}
        nodeDetailVisible={nodeDetailModal.nodeDetailVisible}
        closeNodeDetail={nodeDetailModal.closeNodeDetail}
        nodeDetailOrder={nodeDetailModal.nodeDetailOrder}
        nodeDetailType={nodeDetailModal.nodeDetailType}
        nodeDetailName={nodeDetailModal.nodeDetailName ?? ''}
        nodeDetailStats={nodeDetailModal.nodeDetailStats}
        nodeDetailUnitPrice={nodeDetailModal.nodeDetailUnitPrice ?? 0}
        nodeDetailProcessList={nodeDetailModal.nodeDetailProcessList ?? []}
        transferModalVisible={productionTransfer.transferModalVisible}
        transferRecord={productionTransfer.transferRecord}
        transferType={productionTransfer.transferType}
        setTransferType={productionTransfer.setTransferType}
        transferUserId={productionTransfer.transferUserId ?? ''}
        setTransferUserId={productionTransfer.setTransferUserId}
        transferMessage={productionTransfer.transferMessage}
        setTransferMessage={productionTransfer.setTransferMessage}
        transferUsers={productionTransfer.transferUsers}
        transferSearching={productionTransfer.transferSearching}
        transferFactoryId={productionTransfer.transferFactoryId ?? ''}
        setTransferFactoryId={productionTransfer.setTransferFactoryId}
        transferFactoryMessage={productionTransfer.transferFactoryMessage}
        setTransferFactoryMessage={productionTransfer.setTransferFactoryMessage}
        transferFactories={productionTransfer.transferFactories}
        transferFactorySearching={productionTransfer.transferFactorySearching}
        transferSubmitting={productionTransfer.transferSubmitting}
        transferBundles={productionTransfer.transferBundles}
        transferBundlesLoading={productionTransfer.transferBundlesLoading}
        transferSelectedBundleIds={productionTransfer.transferSelectedBundleIds}
        setTransferSelectedBundleIds={productionTransfer.setTransferSelectedBundleIds}
        transferProcesses={productionTransfer.transferProcesses}
        transferProcessesLoading={productionTransfer.transferProcessesLoading}
        transferSelectedProcessCodes={productionTransfer.transferSelectedProcessCodes}
        setTransferSelectedProcessCodes={productionTransfer.setTransferSelectedProcessCodes}
        searchTransferUsers={productionTransfer.searchTransferUsers}
        searchTransferFactories={productionTransfer.searchTransferFactories}
        submitTransfer={productionTransfer.submitTransfer}
        closeTransferModal={productionTransfer.closeTransferModal}
        shareOrderDialog={shareOrderDialog}
        remarkTarget={remarkTarget}
        setRemarkTarget={setRemarkTarget}
        isSupervisorOrAbove={isSupervisorOrAbove}
        isFactoryAccount={isFactoryAccount}
        user={user}
        labelPrintOpen={labelPrint.labelPrintOpen}
        closeLabelPrint={labelPrint.closeLabelPrint}
        labelPrintOrder={labelPrint.labelPrintOrder}
        labelPrintStyle={labelPrint.labelPrintStyle}
        remapVisible={subProcessRemap.remapVisible}
        remapRecord={subProcessRemap.remapRecord}
        remapParentNodes={subProcessRemap.parentNodes}
        remapConfig={subProcessRemap.remapConfig}
        remapSaving={subProcessRemap.remapSaving}
        saveRemap={subProcessRemap.saveRemap}
        closeRemap={subProcessRemap.closeRemap}
        printModalVisible={printModal.visible}
        setPrintModalVisible={(v: boolean) => v ? undefined : printModal.close()}
        printingRecord={printModal.data}
        setPrintingRecord={(r: ProductionOrder | null) => r !== null ? printModal.open(r) : printModal.close()}
        pendingCloseOrder={productionActions.pendingCloseOrder}
        closeOrderLoading={productionActions.closeOrderLoading}
        confirmCloseOrder={productionActions.confirmCloseOrder}
        cancelCloseOrder={productionActions.cancelCloseOrder}
        pendingScrapOrder={productionActions.pendingScrapOrder}
        scrapOrderLoading={productionActions.scrapOrderLoading}
        confirmScrapOrder={productionActions.confirmScrapOrder}
        cancelScrapOrder={productionActions.cancelScrapOrder}
        workflowEditorVisible={workflowEditorModal.visible}
        workflowEditorStyleNo={workflowEditorModal.data ?? ''}
        closeWorkflowEditor={() => workflowEditorModal.close()}
        onWorkflowSaved={() => { void listData.fetchProductionList(); }}
        onOpenInspectDrawer={(orderId: string) => inspectDrawerModal.open(orderId)}
        inspectDrawerVisible={inspectDrawerModal.visible}
        inspectDrawerOrderId={inspectDrawerModal.data ?? ''}
        closeInspectDrawer={() => inspectDrawerModal.close()}
        customFields={customFields}
        fieldConfigs={fieldConfigs}
      />

      <SmartReceiveModal
        open={smartReceiveModal.visible}
        orderNo={smartReceiveModal.data ?? ''}
        onCancel={() => smartReceiveModal.close()}
        onSuccess={() => { void listData.fetchProductionList(); }}
        isSupervisorOrAbove={isSupervisorOrAbove}
        userId={user?.id as any}
        userName={user?.name || user?.username || ''}
      />
    </>
  );
};

export default ProductionList;
