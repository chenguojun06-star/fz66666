import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Form, Modal } from 'antd';
import type { InputRef } from 'antd';
import { isOrderFrozenByStatus, isOrderTerminal, generateRequestId } from '@/utils/api';
import { isSupervisorOrAboveUser as isSupervisorOrAboveUserFn, useAuth } from '@/utils/AuthContext';
import { formatDateTimeCompact } from '@/utils/datetime';
import { CuttingBundle, ProductionOrder, ScanRecord } from '@/types/production';
import { productionCuttingApi, productionOrderApi } from '@/services/production/productionApi';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import { useProductionBoardStore } from '@/stores';
import { useProductionSmartQueue } from '../useProductionSmartQueue';
import '../../../styles.css';

import { defaultNodes, stripWarehousingNode, findPricingProcessForStage, getCloseMinRequired, getCurrentWorkflowNodeForOrder } from './utils';
import { ProgressNode } from './types';

import { useProgressData } from './hooks/useProgressData';
import { useScanBundles } from './hooks/useScanBundles';
import { useScanConfirm } from './hooks/useScanConfirm';
import { useNodeStats } from './hooks/useNodeStats';
import { useSubmitScan } from './hooks/useSubmitScan';
import { useNodeWorkflowActions } from './hooks/useNodeWorkflowActions';
import { useOrderSync } from './hooks/useOrderSync';
import { useInlineNodeOps } from './hooks/useInlineNodeOps';
import { useOpenScan } from './hooks/useOpenScan';
import { useOrderProgress } from './hooks/useOrderProgress';
import { useCloseOrder } from './hooks/useCloseOrder';
import { useScanFeedback } from './hooks/useScanFeedback';
import { useNodeDetail } from './hooks/useNodeDetail';
import { usePrintFlow } from './hooks/usePrintFlow';
import { useQuickEdit } from './hooks/useQuickEdit';
import { useProgressFilters } from './hooks/useProgressFilters';
import { useProgressColumns } from './hooks/useProgressColumns';
import { useShareOrderDialog } from './hooks/useShareOrderDialog';
import { useFactoryShipment } from './hooks/useFactoryShipment';
import { useOrderFocus } from './hooks/useOrderFocus';
import { useLabelPrint } from './hooks/useLabelPrint';
import { useCardViewConfig } from './hooks/useCardViewConfig';
import { useStagnantDetection } from './hooks/useStagnantDetection';
import { useDeliveryRiskMap } from './hooks/useDeliveryRiskMap';
import { useBottleneckBanner } from './hooks/useBottleneckBanner';
import { useTemplateNodes } from './hooks/useTemplateNodes';
import { useScanExecution } from './hooks/useScanExecution';
import { useProgressUrlParams } from './hooks/useProgressUrlParams';
import { useBoardStatsRefresh } from './hooks/useBoardStatsRefresh';
import { useFocusNodeEffect } from './hooks/useFocusNodeEffect';
import { useScanFormEffects } from './hooks/useScanFormEffects';
import { useScrollToOrderEffect } from './hooks/useScrollToOrderEffect';
import { fetchScanHistory as fetchScanHistoryHelper, fetchCuttingBundles as fetchCuttingBundlesHelper, fetchPricingProcesses as fetchPricingProcessesHelper } from './helpers/fetchers';
import { fetchNodeOperations } from './helpers/nodeOperations';

import ProgressPageContent from './components/ProgressPageContent';
import ProgressModals from './components/ProgressModals';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';

type ProgressDetailProps = { embedded?: boolean };

const ProgressDetail: React.FC<ProgressDetailProps> = ({ embedded }) => {
  const { message } = App.useApp();
  const { factoryTypeOptions } = useOrganizationFilterOptions();
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUserFn(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const [smartQueueFilter, setSmartQueueFilter] = useState<'all' | 'urgent' | 'behind' | 'stagnant' | 'overdue'>('all');

  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });

  const {
    shipModalOpen, setShipModalOpen, shipModalOrder, shipForm, shipLoading,
    shippableInfo, shipDetails, setShipDetails, handleFactoryShip, handleShipSubmit,
    detailSum, shipHistory,
  } = useFactoryShipment({ message });

  const {
    queryParams, setQueryParams, dateRange, setDateRange,
    viewMode, setViewMode, activeStatFilter,
    orderSortField, orderSortOrder, statusOptions,
    handleOrderSort, handleStatClick, dateSortAsc, toggleDateSort,
  } = useProgressFilters();

  const {
    pendingScrollOrderId, setPendingScrollOrderId, focusedOrderId,
    pendingFocusNode, setPendingFocusNode,
    focusedOrderNos: _focusedOrderNos, setFocusedOrderNos,
    focusedOrderNosRef, getOrderDomKey, triggerOrderFocus,
    normalizeFocusNodeName, getFocusNodeType, clearSmartFocus, scrollToFocusedOrder,
  } = useOrderFocus(viewMode);

  useProgressUrlParams(setQueryParams, setFocusedOrderNos, setPendingFocusNode, normalizeFocusNodeName, setSmartQueueFilter);

  const boardStatsByOrder = useProductionBoardStore((s) => s.boardStatsByOrder);
  const boardTimesByOrder = useProductionBoardStore((s) => s.boardTimesByOrder);
  const boardStatsLoadingByOrder = useProductionBoardStore((s) => s.boardStatsLoadingByOrder);
  const mergeBoardStatsForOrder = useProductionBoardStore((s) => s.mergeBoardStatsForOrder);
  const mergeBoardTimesForOrder = useProductionBoardStore((s) => s.mergeBoardTimesForOrder);
  const setBoardLoadingForOrder = useProductionBoardStore((s) => s.setBoardLoadingForOrder);
  const clearAllBoardCache = useProductionBoardStore((s) => s.clearAllBoardCache);
  const mergeProcessDataForOrder = useProductionBoardStore((s) => s.mergeProcessDataForOrder);

  const {
    loading, total, orders, sortedOrders,
    progressNodesByStyleNo, setProgressNodesByStyleNo,
    showSmartErrorNotice, fetchOrders, globalStats,
  } = useProgressData({ queryParams, dateRange, dateSortAsc, focusedOrderNosRef, clearAllBoardCache });

  useBoardStatsRefresh({
    orders, progressNodesByStyleNo,
    boardStatsByOrder, boardStatsLoadingByOrder,
    mergeBoardStatsForOrder, mergeBoardTimesForOrder,
    setBoardLoadingForOrder, mergeProcessDataForOrder,
  });

  const [activeOrder, setActiveOrder] = useState<ProductionOrder | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanRecord[]>([]);
  const [cuttingBundlesLoading, setCuttingBundlesLoading] = useState(false);
  const [cuttingBundles, setCuttingBundles] = useState<CuttingBundle[]>([]);
  const [nodeOps, setNodeOps] = useState<Record<string, any>>({});
  const [nodes, setNodes] = useState<ProgressNode[]>(defaultNodes);
  const [nodeWorkflowLocked, setNodeWorkflowLocked] = useState(false);
  const [, setNodeWorkflowDirty] = useState(false);

  const { bottleneckItems, bottleneckBannerVisible, setBottleneckBannerVisible, bottleneckLoading } = useBottleneckBanner(orders);

  const [scanOpen, setScanOpen] = useState(false);
  const [_scanSubmitting, setScanSubmitting] = useState(false);
  const [scanForm] = Form.useForm();
  const scanInputRef = useRef<InputRef>(null);
  const scanSubmittingRef = useRef(false);
  const orderSyncingRef = useRef(false);
  const activeOrderRef = useRef<ProductionOrder | null>(null);
  const lastFailedRequestRef = useRef<{ key: string; requestId: string } | null>(null);
  const [_scanBundlesExpanded, setScanBundlesExpanded] = useState(false);
  const [bundleSelectedQr, setBundleSelectedQr] = useState('');

  const { state: scanConfirmState, openConfirm: openScanConfirm, closeConfirm: closeScanConfirmState, setLoading: setScanConfirmLoading } = useScanConfirm();
  const { submitScanFeedback } = useScanFeedback();

  const {
    openNodeDetail, closeNodeDetail,
    nodeDetailVisible, nodeDetailOrder, nodeDetailType,
    nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList,
  } = useNodeDetail();
  const { printingRecord, printModalVisible, setPrintingRecord, closePrintModal } = usePrintFlow();
  const { labelPrintOpen, labelPrintOrder, labelPrintStyle, handlePrintLabel, closeLabelPrint } = useLabelPrint();

  const [remarkModalOpen, setRemarkModalOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');
  const [remarkMerchandiser, setRemarkMerchandiser] = useState<string | undefined>();
  const openRemarkModal = useCallback((orderNo: string, merchandiser?: string) => {
    setRemarkOrderNo(orderNo);
    setRemarkMerchandiser(merchandiser);
    setRemarkModalOpen(true);
  }, []);

  const { quickEditVisible, quickEditSaving, setQuickEditVisible, setQuickEditRecord, quickEditRecord, handleQuickEdit, handleQuickEditSave } = useQuickEdit({ message, fetchOrders: () => fetchOrders() });

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);

  const { ensureNodesFromTemplateIfNeeded } = useTemplateNodes({ setNodes, setProgressNodesByStyleNo });

  const saveNodes = (next: ProgressNode[]) => {
    const stripped = stripWarehousingNode(next);
    setNodes(stripped.length ? stripped : defaultNodes);
  };

  const fetchScanHistory = (order: ProductionOrder, options?: { silent?: boolean }) =>
    fetchScanHistoryHelper({ order, setScanHistory, message, options });
  const fetchCuttingBundles = (order: ProductionOrder) =>
    fetchCuttingBundlesHelper({ order, setCuttingBundles, setCuttingBundlesLoading, message });
  const fetchPricingProcesses = (order: ProductionOrder) =>
    fetchPricingProcessesHelper({ order, setPricingProcesses: () => {}, setPricingProcessLoading: () => {} });

  const currentInlineNode = useMemo(() =>
    getCurrentWorkflowNodeForOrder(activeOrder, progressNodesByStyleNo, nodes, defaultNodes),
    [activeOrder, progressNodesByStyleNo, nodes],
  );

  useInlineNodeOps({ activeOrder, currentInlineNode, nodeOps, setNodeOps, setInlineSaving: () => {}, user, productionOrderApi, message, fetchNodeOperations, formatDateTimeCompact });

  const fetchOrderDetail = async (orderId: string): Promise<ProductionOrder | null> => {
    const oid = String(orderId || '').trim();
    if (!oid) return null;
    try {
      const res = await productionOrderApi.list({ orderNo: oid, page: 1, pageSize: 1 });
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        const data = result.data as { records?: any[] };
        const records = data?.records || [];
        return records.length > 0 ? (records[0] as ProductionOrder) : null;
      }
      return null;
    } catch { return null; }
  };

  useOpenScan({
    isOrderFrozenByStatus, message, fetchOrderDetail, setActiveOrder,
    setNodeWorkflowLocked, setNodeWorkflowDirty, ensureNodesFromTemplateIfNeeded,
    fetchScanHistory, fetchCuttingBundles, fetchPricingProcesses,
    setScanBundlesExpanded, setBundleSelectedQr, setScanOpen, scanForm,
    progressNodesByStyleNo, nodes, defaultNodes, findPricingProcessForStage, scanInputRef,
  });

  const watchScanCode = Form.useWatch('scanCode', scanForm);
  const watchProgressStage = Form.useWatch('progressStage', scanForm);
  const watchScanType = Form.useWatch('scanType', scanForm);

  useScanFormEffects({ scanOpen, activeOrder, progressNodesByStyleNo, nodes, scanForm, cuttingBundlesLoading, cuttingBundles, fetchCuttingBundles });

  const { matchedBundle, isBundleCompletedForSelectedNode } = useScanBundles({
    scanOpen, watchScanCode, watchProgressStage, watchScanType,
    cuttingBundles, scanHistory, scanForm, bundleSelectedQr, setBundleSelectedQr,
  });

  useSubmitScan({
    activeOrder, user, scanForm, bundleSelectedQr, matchedBundle,
    isBundleCompletedForSelectedNode, setCuttingBundles, setScanSubmitting,
    scanSubmittingRef, lastFailedRequestRef, openScanConfirm,
    progressNodesByStyleNo, nodes, defaultNodes, productionCuttingApi, message, generateRequestId,
  });

  useNodeStats({ scanHistory, activeOrder, cuttingBundles, nodes });
  useNodeWorkflowActions({ activeOrderId: activeOrder?.id, isSupervisorOrAbove, nodeWorkflowLocked, nodes, defaultNodes, saveNodes, setNodeWorkflowDirty, message, Modal });
  useOrderSync({ fetchOrders, fetchOrderDetail, fetchScanHistory, activeOrderRef, setActiveOrder, orderSyncingRef });

  const { updateOrderProgress } = useOrderProgress({ activeOrder, fetchOrders, fetchOrderDetail, setActiveOrder, ensureNodesFromTemplateIfNeeded, fetchScanHistory, progressNodesByStyleNo, nodes, productionOrderApi, message });
  const { submitConfirmedScan, closeScanConfirm } = useScanExecution({ scanConfirmState, closeScanConfirmState, setScanConfirmLoading, activeOrder, message, submitScanFeedback, progressNodesByStyleNo, nodes, cuttingBundles, updateOrderProgress, fetchScanHistory, fetchOrders, scanForm, scanInputRef, setScanSubmitting, scanSubmittingRef, lastFailedRequestRef });
  const { handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder } = useCloseOrder({ isSupervisorOrAbove, message, productionOrderApi, fetchOrders, fetchOrderDetail, setActiveOrder, activeOrderId: activeOrder?.id, getCloseMinRequired });

  const { cardActions, titleTags } = useCardViewConfig({
    isOrderFrozenByStatus, setPrintingRecord, handlePrintLabel, handleFactoryShip,
    handleQuickEdit, handleShareOrder, handleCloseOrder,
    onOpenRemark: (record) => openRemarkModal(record.orderNo ?? '', record.merchandiser ?? undefined),
    isFactoryAccount, canManageOrderLifecycle, embedded: !!embedded,
  });

  const stagnantOrderIds = useStagnantDetection(orders, boardTimesByOrder);
  const stagnantOrderIdSet = useMemo(() => new Set(stagnantOrderIds.keys()), [stagnantOrderIds]);
  const hasActiveOrders = orders.some(o => o.status !== 'completed');
  const deliveryRiskMap = useDeliveryRiskMap(hasActiveOrders);

  const { smartQueueOrders, smartActionItems } = useProductionSmartQueue({
    orders, deliveryRiskMap, stagnantOrderIds: stagnantOrderIdSet,
    smartQueueFilter, setSmartQueueFilter, triggerOrderFocus, clearFocus: clearSmartFocus,
  });

  const sortedSmartQueueOrders = useMemo(() => {
    return [...smartQueueOrders].sort((a, b) => {
      const aStatus = String(a.status || '').trim().toLowerCase();
      const bStatus = String(b.status || '').trim().toLowerCase();
      const aScrapped = ['scrapped', 'cancelled', 'closed', 'archived'].includes(aStatus) ? 2 : isOrderTerminal(a) ? 1 : 0;
      const bScrapped = ['scrapped', 'cancelled', 'closed', 'archived'].includes(bStatus) ? 2 : isOrderTerminal(b) ? 1 : 0;
      if (aScrapped !== bScrapped) return aScrapped - bScrapped;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [smartQueueOrders, dateSortAsc]);

  useScrollToOrderEffect({ pendingScrollOrderId, setPendingScrollOrderId, orders, smartQueueOrders, smartQueueFilter, getOrderDomKey, scrollToFocusedOrder, viewMode });
  useFocusNodeEffect({ pendingFocusNode, orders, progressNodesByStyleNo, boardStatsByOrder, boardStatsLoadingByOrder, normalizeFocusNodeName, getFocusNodeType, triggerOrderFocus, openNodeDetail, setPendingFocusNode });

  const { columns } = useProgressColumns({
    orderSortField, orderSortOrder, handleOrderSort,
    boardStatsByOrder: boardStatsByOrder as Record<string, Record<string, number>>, boardTimesByOrder, progressNodesByStyleNo,
    openNodeDetail, isSupervisorOrAbove, handleCloseOrder,
    setPrintingRecord, handlePrintLabel, setQuickEditRecord, setQuickEditVisible,
    openRemarkModal, stagnantOrderIds, deliveryRiskMap,
    onShareOrder: handleShareOrder, isFactoryAccount, onFactoryShip: handleFactoryShip, canManageOrderLifecycle,
  });
  const { columns: cardColumns } = useCardGridLayout(10);

  return (
    <div className="production-progress-detail-page">
      <ProgressPageContent
        embedded={embedded}
        queryParams={queryParams} setQueryParams={setQueryParams}
        dateRange={dateRange} setDateRange={setDateRange}
        statusOptions={statusOptions} factoryTypeOptions={factoryTypeOptions}
        viewMode={viewMode} setViewMode={setViewMode}
        dateSortAsc={dateSortAsc} toggleDateSort={toggleDateSort}
        activeStatFilter={activeStatFilter} handleStatClick={handleStatClick}
        globalStats={globalStats as any}
        showSmartErrorNotice={showSmartErrorNotice} smartError={null} onFixError={() => { void fetchOrders(); }}
        bottleneckBannerVisible={bottleneckBannerVisible} bottleneckItems={bottleneckItems}
        setBottleneckBannerVisible={setBottleneckBannerVisible} bottleneckLoading={bottleneckLoading}
        loading={loading} orders={orders} sortedOrders={sortedOrders}
        sortedSmartQueueOrders={sortedSmartQueueOrders}
        total={total} columns={columns} cardColumns={cardColumns}
        cardActions={cardActions} titleTags={titleTags}
        boardStatsByOrder={boardStatsByOrder}
        focusedOrderId={focusedOrderId} getOrderDomKey={getOrderDomKey}
        smartQueueFilter={smartQueueFilter} smartQueueOrders={smartQueueOrders}
        smartActionItems={smartActionItems} setSmartQueueFilter={setSmartQueueFilter}
        fetchOrders={fetchOrders}
      />

      <ProgressModals
        scanConfirmState={scanConfirmState}
        closeScanConfirm={closeScanConfirm}
        submitConfirmedScan={submitConfirmedScan}
        shipModalOpen={shipModalOpen}
        shipModalOrder={shipModalOrder}
        shippableInfo={shippableInfo}
        shipDetails={shipDetails}
        onShipDetailsChange={setShipDetails}
        shipHistory={shipHistory}
        detailSum={detailSum}
        shipForm={shipForm}
        shipLoading={shipLoading}
        handleShipSubmit={handleShipSubmit}
        setShipModalOpen={setShipModalOpen}
        shareOrderDialog={shareOrderDialog}
        quickEditVisible={quickEditVisible}
        quickEditSaving={quickEditSaving}
        quickEditRecord={quickEditRecord}
        handleQuickEditSave={handleQuickEditSave}
        setQuickEditVisible={setQuickEditVisible}
        setQuickEditRecord={setQuickEditRecord}
        labelPrintOpen={labelPrintOpen}
        closeLabelPrint={closeLabelPrint}
        labelPrintOrder={labelPrintOrder}
        labelPrintStyle={labelPrintStyle}
        printModalVisible={printModalVisible}
        closePrintModal={closePrintModal}
        printingRecord={printingRecord}
        nodeDetailVisible={nodeDetailVisible}
        closeNodeDetail={closeNodeDetail}
        nodeDetailOrder={nodeDetailOrder}
        nodeDetailType={nodeDetailType}
        nodeDetailName={nodeDetailName}
        nodeDetailStats={nodeDetailStats}
        nodeDetailUnitPrice={nodeDetailUnitPrice}
        nodeDetailProcessList={nodeDetailProcessList}
        fetchOrders={fetchOrders}
        pendingCloseOrder={pendingCloseOrder}
        closeOrderLoading={closeOrderLoading}
        confirmCloseOrder={confirmCloseOrder}
        cancelCloseOrder={cancelCloseOrder}
      />

      <RemarkTimelineModal
        open={remarkModalOpen}
        onClose={() => setRemarkModalOpen(false)}
        targetType="order"
        targetNo={remarkOrderNo}
        canAddRemark={isSupervisorOrAbove || isFactoryAccount || (!!user?.username && user.username === remarkMerchandiser)}
      />
    </div>
  );
};

export default ProgressDetail;
