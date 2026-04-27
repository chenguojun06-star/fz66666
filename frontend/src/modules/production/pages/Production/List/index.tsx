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
} from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
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
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import ProductionModals from './components/ProductionModals';
import ProductionFilterBar from './components/ProductionFilterBar';

const ProductionList: React.FC = () => {
  const { message } = App.useApp();
  useViewport();
  const { columns: cardColumns } = useCardGridLayout(10);
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });
  const quickEditModal = useModal<ProductionOrder>();
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string }>({ open: false, orderNo: '' });
  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const location = useLocation();
  const { factoryTypeOptions } = useOrganizationFilterOptions();

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

    // ===== Hook 提取：进度/弹窗/打印/聚焦 =====
    const { nodeDetailVisible, nodeDetailOrder, nodeDetailType, nodeDetailName, nodeDetailStats, nodeDetailUnitPrice, nodeDetailProcessList, openNodeDetail, closeNodeDetail } = useNodeDetailModal();
    const { labelPrintOpen, closeLabelPrint, labelPrintOrder, labelPrintStyle, handlePrintLabel } = useLabelPrint();

  // ===== 数据层 Hook（状态 + 数据获取 + Effects） =====
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

  // ===== 提取的 Hooks =====
  const { visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions } = useColumnSettings();
  const { globalStats } = useProductionStats(queryParams);

  // 依赖 fetchProductionList 的 Hooks
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

  // ===== useOrderFocus: 聚焦/滚动/高亮逻辑 =====
  const { focusedOrderId, pendingScrollOrderId: _pendingScrollOrderId, getOrderDomKey, triggerOrderFocus, clearSmartFocus, scrollToFocusedOrder: _scrollToFocusedOrder } = useOrderFocus(viewMode, sortedProductionList);
  orderFocusRef.current = { triggerOrderFocus, clearSmartFocus };

  // ===== useAnomalyDetection: 异常检测横幅 =====
  const { anomalyItems, anomalyBannerVisible, setAnomalyBannerVisible, fetchAnomalies, handleAnomalyClick } = useAnomalyDetection({
    productionList, message, navigate, setActiveStatFilter, setShowDelayedOnly, setSmartQueueFilter, setQueryParams, triggerOrderFocus,
  });

  // 首次加载到订单后，静默触发异常检测（仅检测一次，不阻塞主列表）
  useEffect(() => {
    if (productionList.length > 0) void fetchAnomalies();
  }, [productionList.length]);

  // 表格列渲染辅助
  const allColumns = useProductionColumns({
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
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
  });

  // 根据 visibleColumns 过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  // 点击统计卡片筛选
  const handleStatClick = (type: 'production' | 'delayed' | 'today') => {
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
            cards={[
              {
                key: 'production',
                items: [
                  { label: '生产订单', value: Number(globalStats.activeOrders ?? globalStats.totalOrders ?? 0), unit: '个', color: 'var(--color-primary)' },
                  { label: '数量', value: Number(globalStats.activeQuantity ?? globalStats.totalQuantity ?? 0), unit: '件', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('production'),
                activeColor: 'var(--color-primary)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                  { label: '数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
              },
              {
                key: 'today',
                items: [
                  { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
              },
            ]}
            hints={smartActionItems.map((item) => ({ ...item, count: item.value }))}
            onClearHints={smartQueueFilter !== 'all' ? () => setSmartQueueFilter('all') : undefined}
          />
          </>}
          {...ProductionFilterBar({
            queryParams, setQueryParams, dateRange, setDateRange, fetchProductionList,
            visibleColumns, toggleColumnVisible, resetColumnSettings, columnOptions,
            viewMode, setViewMode, factoryTypeOptions,
          })}
        >
          {viewMode === 'smart' ? (
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
          ) : viewMode === 'list' ? (
            <ResizableTable<any>
              storageKey="production-order-table"
              columns={columns as any}
              dataSource={sortedProductionList}
              rowKey="id"
              loading={loading}
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
                showTotal: (total) => `共 ${total} 条`,
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
                  { label: '下单', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                  { label: '交期', key: 'plannedEndDate', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                  {
                    label: '剩',
                    key: 'remainingDays',
                    render: (val: unknown, record: Record<string, unknown>) => {
                      const { text, color } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
                      // 已完成/已报废/已关单 的状态已由进度条展示，此处不重复显示
                      if (text === '已完成' || text === '已报废' || text === '已关单') return <span style={{ color: '#999', fontSize: '10px' }}>-</span>;
                      return <span style={{ color, fontWeight: 600, fontSize: '10px' }}>{text}</span>;
                    }
                  }
                ]
              ]}
              progressConfig={{
                calculate: calcCardProgress,
                getStatus: (record: ProductionOrder) => (isOrderFrozenByStatus(record) ? 'default' : getProgressColorStatus(record.plannedEndDate, record.status)),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
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
                const frozenTitle = '订单已关单/报废/完成，无法操作';
                return [
                { key: 'print', label: '打印', disabled: frozen, title: frozen ? frozenTitle : '打印', onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); } },
                { key: 'printLabel', label: '打印标签', disabled: frozen, title: frozen ? frozenTitle : '打印标签', onClick: () => void handlePrintLabel(record) },
                ...(canManageOrderLifecycle ? [{ key: 'close', label: '关单', disabled: frozen, title: frozen ? frozenTitle : '关单', onClick: () => { handleCloseOrder(record); } }] : []),
                { key: 'divider1', type: 'divider' as const, label: '' },
                { key: 'edit', label: '编辑', disabled: frozen, title: frozen ? frozenTitle : '编辑', onClick: () => { quickEditModal.open(record); } },
                { key: 'share', label: '分享', disabled: frozen, title: frozen ? frozenTitle : '分享', onClick: () => { void handleShareOrder(record); } },
              ].filter(Boolean);
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={(record) => (
                <>
                  {(record as any).urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>急</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>首单</Tag>}
                  {String((record as any).plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 10, padding: '0 3px', lineHeight: '16px', height: 16 }}>翻单</Tag>}
                </>
              )}
            />
            {/* 卡片视图分页器 */}
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
          nodeDetailName={nodeDetailName}
          nodeDetailStats={nodeDetailStats}
          nodeDetailUnitPrice={nodeDetailUnitPrice}
          nodeDetailProcessList={nodeDetailProcessList}
          transferModalVisible={transferModalVisible}
          transferRecord={transferRecord}
          transferType={transferType}
          setTransferType={setTransferType}
          transferUserId={transferUserId}
          setTransferUserId={setTransferUserId}
          transferMessage={transferMessage}
          setTransferMessage={setTransferMessage}
          transferUsers={transferUsers}
          transferSearching={transferSearching}
          transferFactoryId={transferFactoryId}
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
        />

    </>
  );
};

export default ProductionList;
