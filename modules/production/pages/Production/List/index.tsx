import React, { useState, useEffect, useMemo } from 'react';
import { Tag, App } from 'antd';

import ExternalFactorySmartView from '../ExternalFactory/ExternalFactorySmartView';
import ResizableTable from '@/components/common/ResizableTable';
import StandardPagination from '@/components/common/StandardPagination';
import PageStatCards from '@/components/common/PageStatCards';

import PageLayout from '@/components/common/PageLayout';
import { useSubProcessRemap } from './hooks/useSubProcessRemap';
import { ProductionOrder } from '@/types/production';
import {
  isOrderFrozenByStatus,
  withQuery,
} from '@/utils/api';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import '../../../styles.css';
import dayjs from 'dayjs';
import UniversalCardView from '@/components/common/UniversalCardView';
import { createOrderColorSizeGridFieldGroups } from '@/components/common/CardSizeQuantityFieldGroups';
import SmartOrderHoverCard from '../ProgressDetail/components/SmartOrderHoverCard';
import { useShareOrderDialog } from '../ProgressDetail/hooks/useShareOrderDialog';
import { getOrderCardSizeQuantityItems } from '@/utils/cardSizeQuantity';
import { DEFAULT_PAGE_SIZE_OPTIONS, savePageSize } from '@/utils/pageSizeStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { useViewport } from '@/utils/useViewport';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import { useModal } from '@/hooks';
import { useOrganizationFilterOptions } from '@/hooks/useOrganizationFilterOptions';
import { getProgressColorStatus, getRemainingDaysDisplay } from '@/utils/progressColor';
import { ORDER_STATUS_LABEL, ORDER_STATUS_COLOR } from '@/constants/orderStatus';
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
import AnomalyBanner from './AnomalyBanner';
import { useAiPatrol, RISK_TYPE_LABELS } from './hooks/useAiPatrol';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ProductionModals from './components/ProductionModals';
import ProductionFilterBar from './components/ProductionFilterBar';
import { buildCommonOrderActions } from '../components/buildCommonOrderActions';

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const location = useLocation();
  const { factoryTypeOptions } = useOrganizationFilterOptions();

  // ===== 鎵撳嵃寮圭獥鐘舵€?=====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  // ===== 瑁佸壀璁㈠崟宸ュ簭缂栬緫寮圭獥鐘舵€?=====
  const [workflowEditorVisible, setWorkflowEditorVisible] = useState(false);
  const [workflowEditorStyleNo, setWorkflowEditorStyleNo] = useState('');

    // ===== Hook 鎻愬彇锛氳繘搴?寮圭獥/鎵撳嵃/鑱氱劍 =====
    const { nodeDetailVisible, nodeDetailOrder, nodeDetailType, nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList, openNodeDetail, closeNodeDetail } = useNodeDetailModal();
    const { labelPrintOpen, closeLabelPrint, labelPrintOrder, labelPrintStyle, handlePrintLabel } = useLabelPrint();

  // ===== 鏁版嵁灞?Hook锛堢姸鎬?+ 鏁版嵁鑾峰彇 + Effects锛?=====
  const {
    queryParams, setQueryParams, dateRange, setDateRange,
    sortField, sortOrder, handleSort,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    productionList, setProductionList, selectedRowKeys, setSelectedRowKeys,
    _selectedRows, setSelectedRows, loading, total,
    viewMode, setViewMode,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    showDelayedOnly, setShowDelayedOnly, activeStatFilter, setActiveStatFilter,
    smartQueueFilter, setSmartQueueFilter,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    smartError, showSmartErrorNotice, reportSmartError,
    orderFocusRef, calcCardProgress,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    deliveryRiskMap, stagnantOrderIds, smartActionItems, smartQueueOrders,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fetchProductionList, sortedProductionList, urlFocusApplied,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    wsRefreshRef,
  } = useProductionListData();

  // ===== 鎻愬彇鐨?Hooks =====
  const { visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions } = useColumnSettings();
  const { globalStats } = useProductionStats(queryParams);

  // 渚濊禆 fetchProductionList 鐨?Hooks
  const {
    quickEditSaving, handleQuickEditSave: hookQuickEditSave,
    handleCloseOrder, pendingCloseOrder, closeOrderLoading, confirmCloseOrder, cancelCloseOrder,
    handleScrapOrder, pendingScrapOrder, scrapOrderLoading, confirmScrapOrder, cancelScrapOrder,
    remarkPopoverId, setRemarkPopoverId, remarkText, setRemarkText, remarkSaving, handleRemarkSave,
    handleCopyOrder,
  } = useProductionActions({ message, isSupervisorOrAbove, fetchProductionList });

  const {
    transferModalVisible, transferRecord,
    transferType, setTransferType,
    transferUserId, setTransferUserId,
    transferMessage, setTransferMessage, transferUsers, transferSearching,
    transferFactoryId, setTransferFactoryId,
    transferFactoryMessage, setTransferFactoryMessage, transferFactories, transferFactorySearching,
    transferSubmitting, submitTransfer, searchTransferUsers, searchTransferFactories, handleTransferOrder,
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
  } = useProgressTracking(productionList);

  // ===== useOrderFocus: 鑱氱劍/婊氬姩/楂樹寒閫昏緫 =====
  const { focusedOrderId, pendingScrollOrderId: _pendingScrollOrderId, getOrderDomKey, triggerOrderFocus, clearSmartFocus, scrollToFocusedOrder: _scrollToFocusedOrder } = useOrderFocus(viewMode, sortedProductionList);
  orderFocusRef.current = { triggerOrderFocus, clearSmartFocus };

  // ===== useAnomalyDetection: 寮傚父妫€娴嬫í骞?=====
  
  const { patrolRiskMap, patrolSummary, fetchForOrders, hasRisks, getHighestSeverity, getOrderRisks } = useAiPatrol();
  const { anomalyItems, anomalyBannerVisible, setAnomalyBannerVisible, fetchAnomalies, handleAnomalyClick } = useAnomalyDetection({
    productionList, message, navigate, setActiveStatFilter, setShowDelayedOnly, setSmartQueueFilter, setQueryParams, triggerOrderFocus,
  });

  // 棣栨鍔犺浇鍒拌鍗曞悗锛岄潤榛樿Е鍙戝紓甯告娴嬶紙浠呮娴嬩竴娆★紝涓嶉樆濉炰富鍒楄〃锛?  useEffect(() => {
    if (productionList.length > 0) void fetchAnomalies();
  useEffect(() => {
    if (productionList.length > 0) {
      const orderNos = productionList.map(o => o.orderNo).filter(Boolean) as string[];
      fetchForOrders(orderNos);
    }
  }, [productionList.length]);
  }, [productionList.length]);

  // 琛ㄦ牸鍒楁覆鏌撹緟鍔?  const allColumns = useProductionColumns({
    sortField, sortOrder, handleSort,
    handleCloseOrder, handleScrapOrder, handleTransferOrder, handleCopyOrder,
    navigate, openProcessDetail, openNodeDetail, syncProcessFromTemplate,
    setPrintModalVisible, setPrintingRecord,
    setRemarkPopoverId, setRemarkText,
    quickEditModal, isSupervisorOrAbove, renderCompletionTimeTag,
    deliveryRiskMap,
    stagnantOrderIds,
    handleShareOrder,
    handlePrintLabel,
    canManageOrderLifecycle,
    openSubProcessRemap,
    isFactoryAccount,
    openWorkflowEditor: (styleNo?: string) => {
      setWorkflowEditorStyleNo(styleNo || '');
      setWorkflowEditorVisible(true);
    },
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
  });

  // 鏍规嵁 visibleColumns 杩囨护鍒?  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  
  const patrolTitleTags = useMemo(() => (record: ProductionOrder) => {
    const risks = getOrderRisks(record.orderNo || '');
    const severity = getHighestSeverity(record.orderNo || '');
    if (!severity || risks.length === 0) return null;
    const label = RISK_TYPE_LABELS[risks[0]?.issueType] || 'AI宸℃';
    const colorMap: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'default' };
    return (
      <Tag color={colorMap[severity] || 'orange'} style={{ margin: 0, fontSize: 11, lineHeight: '17px', padding: '0 3px' }}>
        {label}
      </Tag>
    );
  }, [patrolRiskMap]);

  // 鐐瑰嚮缁熻鍗＄墖绛涢€?  const handleStatClick = (type: 'production' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'production') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 });
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams({ ...queryParams, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 });
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 });
    }
  };

  return (
    <>
        <PageLayout
          title="璁㈠崟绠＄悊"
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
            cards={[
              {
                key: 'production',
                items: [
                  { label: '鐢熶骇璁㈠崟', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '涓?, color: 'var(--color-primary)' },
                  { label: '鏁伴噺', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '浠?, color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('production'),
                activeColor: 'var(--color-primary)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '寤舵湡璁㈠崟', value: globalStats.delayedOrders, unit: '涓?, color: 'var(--color-danger)' },
                  { label: '鏁伴噺', value: globalStats.delayedQuantity, unit: '浠?, color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
              },
              {
                key: 'today',
                items: [
                  { label: '浠婃棩璁㈠崟', value: globalStats.todayOrders, unit: '涓?, color: 'var(--color-primary)' },
                  { label: '鏁伴噺', value: globalStats.todayQuantity, unit: '浠?, color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
              },
            ]}
            hints={smartActionItems.map((item) => ({ ...item, count: item.value }))}
            onClearHints={smartQueueFilter !== 'all' ? () => setSmartQueueFilter('all') : undefined}
          />
          </>}
          filterLeft={ProductionFilterBar({
            queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
            visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
            viewMode, setViewMode, factoryTypeOptions,
          }).filterLeft}
          filterRight={ProductionFilterBar({
            queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
            visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
            viewMode, setViewMode, factoryTypeOptions,
          }).filterRight}
        >
          {viewMode === 'smart' ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <ExternalFactorySmartView
              data={sortedProductionList}
              loading={loading}
              total={total}
              currentPage={queryParams.page}
              pageSize={queryParams.pageSize}
              onPageChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams({ ...queryParams, page, pageSize });
              }}
              handleCloseOrder={handleCloseOrder}
              handleScrapOrder={handleScrapOrder}
              handleTransferOrder={handleTransferOrder}
              openProcessDetail={openProcessDetail}
              openNodeDetail={openNodeDetail}
              syncProcessFromTemplate={syncProcessFromTemplate}
              setPrintModalVisible={setPrintModalVisible}
              setPrintingRecord={setPrintingRecord}
              quickEditModal={quickEditModal}
              handleShareOrder={handleShareOrder}
              handlePrintLabel={handlePrintLabel}
              canManageOrderLifecycle={canManageOrderLifecycle}
              isSupervisorOrAbove={isSupervisorOrAbove}
              openSubProcessRemap={openSubProcessRemap}
              isFactoryAccount={isFactoryAccount}
              onOpenRemark={(record) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', merchandiser: record.merchandiser })}
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
                onChange: (keys: React.Key[], rows: ProductionOrder[]) => {
                  setSelectedRowKeys(keys);
                  setSelectedRows(rows);
                },
              }}
              stickyHeader
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total: total,
                showTotal: (total) => `鍏?${total} 鏉,
                showSizeChanger: true,
                pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                onChange: (page, pageSize) => {
                  savePageSize(pageSize);
                  setQueryParams({ ...queryParams, page, pageSize });
                },
              }}
            />
          ) : (
            <>
            <UniversalCardView
              dataSource={sortedProductionList}
              columns={cardColumns}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[]}
              fieldGroups={[
                ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
                  gridKey: 'cardColorSizeGrid',
                  getItems: (record) => getOrderCardSizeQuantityItems(record),
                  getFallbackColor: (record) => String(record.color || '').trim(),
                  getFallbackSize: (record) => String(record.size || '').trim(),
                  getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
                }),
                [
                  { label: '涓嬪崟', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                  { label: '浜ゆ湡', key: 'plannedEndDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                ],
                [
                  { label: '', key: 'statusTags', render: (_val: unknown, record: Record<string, unknown>) => {
                    const status = ORDER_STATUS_LABEL[String(record?.status || '').trim().toLowerCase()] || String(record?.status || '-');
                    const statusColor = ORDER_STATUS_COLOR[String(record?.status || '').trim().toLowerCase()] || 'default';
                    const { text: remainText, color: remainColor } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
                    return (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Tag color={statusColor} style={{ margin: 0, fontSize: 13, padding: '0 4px', lineHeight: '18px', height: 18 }}>{status}</Tag>
                        {record?.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 13, padding: '0 4px', lineHeight: '18px', height: 18 }}>鎬?/Tag>}
                        {String(record?.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 13, padding: '0 4px', lineHeight: '18px', height: 18 }}>棣栧崟</Tag>}
                        {String(record?.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 13, padding: '0 4px', lineHeight: '18px', height: 18 }}>缈诲崟</Tag>}
                        {remainText && remainText !== '宸插畬鎴? && remainText !== '宸叉姤搴? && remainText !== '宸插叧鍗? && remainText !== '-'
                          && <Tag style={{ margin: 0, fontSize: 13, padding: '0 4px', lineHeight: '18px', height: 18, color: remainColor, borderColor: remainColor, background: 'transparent', fontWeight: 600 }}>{remainText}</Tag>}
                      </div>
                    );
                  }},
                ]
              ]}
              progressConfig={{
                calculate: calcCardProgress,
                getStatus: (record: ProductionOrder) => {
                  const s = String(record.status || '').trim().toLowerCase();
                  if (s === 'completed' || s === 'closed') return 'normal' as const;
                  if (isOrderFrozenByStatus(record)) return 'default' as const;
                  return getProgressColorStatus(record.plannedEndDate, record.status);
                },
                isCompleted: (record: ProductionOrder) => {
                  const s = String(record.status || '').trim().toLowerCase();
                  return s === 'completed' || s === 'closed';
                },
                minVisiblePercent: (record: ProductionOrder) => String(record.status || '').trim().toLowerCase() === 'in_progress' ? 5 : 0,
                show: true,
                type: 'liquid',
              }}
              getCardId={(record) => `production-order-card-${getOrderDomKey(record as ProductionOrder)}`}
              getCardStyle={(record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? {
                boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
                transform: 'translateY(-2px)',
              } : undefined}
              actions={(record: ProductionOrder) => {
                const frozen = isOrderFrozenByStatus(record);
                const frozenTitle = '璁㈠崟宸插叧鍗?鎶ュ簾/瀹屾垚锛屾棤娉曟搷浣?;
                const commonActions = buildCommonOrderActions({
                  record, frozen, completed: frozen,
                  canManageOrderLifecycle: !!canManageOrderLifecycle,
                  isSupervisorOrAbove: !!isSupervisorOrAbove,
                  onQuickEdit: (r) => quickEditModal.open(r),
                  handleCloseOrder, handleScrapOrder, handleTransferOrder, handleCopyOrder, handleShareOrder,
                  onOpenRemark: (r) => setRemarkTarget({ open: true, orderNo: r.orderNo || '', merchandiser: r.merchandiser }),
                });
                return [
                  { key: 'print', label: '鎵撳嵃', disabled: frozen, title: frozen ? frozenTitle : '鎵撳嵃', onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); } },
                  { key: 'printLabel', label: '鎵撳嵃鏍囩', disabled: frozen, title: frozen ? frozenTitle : '鎵撳嵃鏍囩', onClick: () => void handlePrintLabel(record) },
                  ...(!isFactoryAccount ? [{ key: 'process', label: '宸ュ簭', disabled: frozen, title: frozen ? frozenTitle : '宸ュ簭', onClick: () => openProcessDetail(record, 'all') }] : []),
                  ...(isFactoryAccount ? [{ key: 'subProcessRemap', label: '瀛愬伐搴?, disabled: frozen, title: frozen ? frozenTitle : '瀛愬伐搴忓崟浠烽厤缃?, onClick: () => openSubProcessRemap(record) }] : []),
                  ...commonActions,
                  ...(isFactoryAccount ? [{ key: 'orderFlow', label: '鍏ㄦ祦绋?, title: '鏌ョ湅璁㈠崟鍏ㄦ祦绋嬭褰?, onClick: () => navigate(withQuery('/production/order-flow', { orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo })) }] : []),
                ];
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={patrolTitleTags}
            />
            {/* 鍗＄墖瑙嗗浘鍒嗛〉鍣?*/}
            <StandardPagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={total}
              wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
              showQuickJumper={false}
              onChange={(page, pageSize) => {
                savePageSize(pageSize);
                setQueryParams({ ...queryParams, page, pageSize });
              }}
            />
            </>
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
          printModalVisible={printModalVisible}
          setPrintModalVisible={setPrintModalVisible}
          printingRecord={printingRecord}
          setPrintingRecord={setPrintingRecord}
          pendingCloseOrder={pendingCloseOrder}
          closeOrderLoading={closeOrderLoading}
          confirmCloseOrder={confirmCloseOrder}
          cancelCloseOrder={cancelCloseOrder}
          pendingScrapOrder={pendingScrapOrder}
          scrapOrderLoading={scrapOrderLoading}
          confirmScrapOrder={confirmScrapOrder}
          cancelScrapOrder={cancelScrapOrder}
          workflowEditorVisible={workflowEditorVisible}
          workflowEditorStyleNo={workflowEditorStyleNo}
          closeWorkflowEditor={() => setWorkflowEditorVisible(false)}
          onWorkflowSaved={() => { void fetchProductionList(); }}
        />

    </>
  );
};

export default ProductionList;
