import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import BudgetDaysEditor from '@/components/common/BudgetDaysEditor';
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
import SmartReceiveModal from '../MaterialPurchase/components/SmartReceiveModal';
import { useDelayedStageBreakdown } from '@/modules/dashboard/components/DelayedStageBreakdown/useDelayedStageBreakdown';

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

  // 延期环节数据（内联到智能提示标签）
  const { stageHints: delayedHints } = useDelayedStageBreakdown({ forceTab: 'bulk' });

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  // ===== 裁剪订单工序编辑弹窗状态 =====
  const [workflowEditorVisible, setWorkflowEditorVisible] = useState(false);
  const [workflowEditorStyleNo, setWorkflowEditorStyleNo] = useState('');

  const [inspectDrawerVisible, setInspectDrawerVisible] = useState(false);
  const [inspectDrawerOrderId, setInspectDrawerOrderId] = useState('');
  const openInspectDrawer = useCallback((orderId: string) => {
    setInspectDrawerOrderId(orderId);
    setInspectDrawerVisible(true);
  }, []);
  const closeInspectDrawer = useCallback(() => {
    setInspectDrawerVisible(false);
    setInspectDrawerOrderId('');
  }, []);

  // ===== 智能领取弹窗（入库/出库） =====
  const [smartReceiveVisible, setSmartReceiveVisible] = useState(false);
  const [smartReceiveOrderNo, setSmartReceiveOrderNo] = useState('');

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
    focusOrderIds, setFocusOrderIds,
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
    transferSubmitting, submitTransfer, searchTransferUsers, searchTransferFactories,
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            handleTransferOrder,
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
    getStageCompletionTime,
    openWorkflowEditor: (styleNo?: string) => {
      setWorkflowEditorStyleNo(styleNo || '');
      setWorkflowEditorVisible(true);
    },
    onOpenRemark: (record: ProductionOrder, defaultRole?: string) => setRemarkTarget({ open: true, orderNo: record.orderNo || '', defaultRole, merchandiser: record.merchandiser }),
    onOpenInspectDrawer: openInspectDrawer,
    onOpenSmartReceive: (orderNo: string) => { setSmartReceiveOrderNo(orderNo); setSmartReceiveVisible(true); },
  });

  // 根据 visibleColumns 过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true;
    return visibleColumns[col.key as string] !== false;
  });

  
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
            hints={[
              ...smartActionItems.map((item) => ({ ...item, count: item.value })),
              ...delayedHints.map(h => ({
                  key: h.key,
                  count: h.count,
                  tone: 'red' as const,
                  label: `${h.stageName}延期`,
                  hint: `点击查看${h.stageName}延期订单`,
                  active: focusOrderIds.size > 0 && h.items.some(item => focusOrderIds.has(String(item.id))),
                  onClick: () => {
                    // 已在当前页面，直接设置筛选，不走 navigate
                    const ids = h.items.map(item => String(item.id));
                    setFocusOrderIds(new Set(ids));
                    setSmartQueueFilter('all');
                    setQueryParams(prev => ({ ...prev, page: 1 }));
                  },
                })),
              ]}
              onClearHints={smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? () => { setSmartQueueFilter('all'); setFocusOrderIds(new Set()); } : undefined}
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
              total={smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? sortedProductionList.length : total}
              currentPage={queryParams.page}
              pageSize={queryParams.pageSize}
              onPageChange={handlePageChange}
              handleCloseOrder={handleCloseOrder}
              handleScrapOrder={handleScrapOrder}
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
                [
                  { label: '下单', key: 'createTime', render: (val: unknown) => val ? dayjs(val as string).format('MM-DD') : '-' },
                ],
                ...createOrderColorSizeGridFieldGroups<ProductionOrder>({
                  gridKey: 'cardColorSizeGrid',
                  getItems: (record) => getOrderCardSizeQuantityItems(record),
                  getFallbackColor: (record) => String(record.color || '').trim(),
                  getFallbackSize: (record) => String(record.size || '').trim(),
                  getFallbackQuantity: (record) => Number(record.orderQuantity) || 0,
                }),
                [
                  { label: '', key: 'statusTags', render: (_val: unknown, record: Record<string, unknown>) => {
                    const status = ORDER_STATUS_LABEL[String(record?.status || '').trim().toLowerCase()] || String(record?.status || '-');
                    const statusColor = ORDER_STATUS_COLOR[String(record?.status || '').trim().toLowerCase()] || 'default';
                    const { text: remainText, color: remainColor } = getRemainingDaysDisplay(record?.plannedEndDate as string, record?.createTime as string, record?.actualEndDate as string, record?.status as string);
                    const deliveryDate = record?.plannedEndDate ? dayjs(record.plannedEndDate as string).format('MM-DD') : '';
                    return (
                      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Tag color={statusColor} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{status}</Tag>
                        {deliveryDate && <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{deliveryDate}</span>}
                        {record?.urgencyLevel === 'urgent' && <Tag color="red" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>急</Tag>}
                        {String(record?.plateType || '').toUpperCase() === 'FIRST' && <Tag color="blue" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>首单</Tag>}
                        {String(record?.plateType || '').toUpperCase() === 'REORDER' && <Tag color="gold" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>翻单</Tag>}
                        {remainText && remainText !== '已完成' && remainText !== '已报废' && remainText !== '已关单' && remainText !== '已取消' && remainText !== '-'
                          && <Tag style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px', color: remainColor, borderColor: remainColor, background: 'transparent', fontWeight: 600 }}>{remainText}</Tag>}
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
                progressExtra: (record: ProductionOrder) => {
                  const frozen = isOrderFrozenByStatus(record);
                  return (
                    <BudgetDaysEditor
                      record={record}
                      nodeName="整体"
                      stageEndTime={(record as any).actualEndDate || undefined}
                      isCompletedOrClosed={frozen}
                    />
                  );
                },
              }}
              getCardId={(record) => `production-order-card-${getOrderDomKey(record as ProductionOrder)}`}
              getCardStyle={(record) => getOrderDomKey(record as ProductionOrder) === focusedOrderId ? {
                boxShadow: '0 0 0 2px rgba(250, 173, 20, 0.35), 0 10px 24px rgba(250, 173, 20, 0.18)',
                transform: 'translateY(-2px)',
              } : undefined}
              actions={(record: ProductionOrder) => {
                const frozen = isOrderFrozenByStatus(record);
                const frozenTitle = '订单已关单/报废/完成，无法操作';
                const commonActions = buildCommonOrderActions({
                  record, frozen, completed: frozen,
                  canManageOrderLifecycle: !!canManageOrderLifecycle,
                  isSupervisorOrAbove: !!isSupervisorOrAbove,
                  onQuickEdit: (r) => quickEditModal.open(r),
                  handleCloseOrder, handleScrapOrder, handleCopyOrder, handleShareOrder,
                  onOpenRemark: (r) => setRemarkTarget({ open: true, orderNo: r.orderNo || '', merchandiser: r.merchandiser }),
                });
                return [
                  { key: 'detail', label: '详情', title: '查看订单详情', onClick: () => navigate(withQuery('/production/order-flow', { orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo })) },
                  { key: 'print', label: '打印', disabled: frozen, title: frozen ? frozenTitle : '打印', onClick: () => { setPrintingRecord(record); setPrintModalVisible(true); } },
                  { key: 'printLabel', label: '打印标签', disabled: frozen, title: frozen ? frozenTitle : '打印标签', onClick: () => void handlePrintLabel(record) },
                  ...(!isFactoryAccount ? [{ key: 'process', label: '工序', disabled: frozen, title: frozen ? frozenTitle : '工序', onClick: () => openProcessDetail(record, 'all') }] : []),
                  ...(isFactoryAccount ? [{ key: 'subProcessRemap', label: '子工序', disabled: frozen, title: frozen ? frozenTitle : '子工序单价配置', onClick: () => openSubProcessRemap(record) }] : []),
                  { key: 'receive', label: '入库/出库', title: '面辅料智能领取（入库/出库）', onClick: () => { setSmartReceiveOrderNo(record.orderNo || ''); setSmartReceiveVisible(true); } },
                  ...commonActions,
                  ...(isFactoryAccount ? [{ key: 'orderFlow', label: '全流程', title: '查看订单全流程记录', onClick: () => navigate(withQuery('/production/order-flow', { orderId: record.id, orderNo: record.orderNo, styleNo: record.styleNo })) }] : []),
                ];
              }}
              hoverRender={(record) => <SmartOrderHoverCard order={record as ProductionOrder} />}
              titleTags={patrolTitleTags}
            />
            {/* 卡片视图分页器 */}
            <StandardPagination
              current={queryParams.page}
              pageSize={queryParams.pageSize}
              total={smartQueueFilter !== 'all' || focusOrderIds.size > 0 ? sortedProductionList.length : total}
              wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
              onChange={handlePageChange}
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
          onOpenInspectDrawer={openInspectDrawer}
          inspectDrawerVisible={inspectDrawerVisible}
          inspectDrawerOrderId={inspectDrawerOrderId}
          closeInspectDrawer={closeInspectDrawer}
        />

        {/* 智能领取弹窗（入库/出库） */}
        <SmartReceiveModal
          open={smartReceiveVisible}
          orderNo={smartReceiveOrderNo}
          onCancel={() => { setSmartReceiveVisible(false); setSmartReceiveOrderNo(''); }}
          onSuccess={() => { void fetchProductionList(); }}
          isSupervisorOrAbove={isSupervisorOrAbove}
          userId={user?.id as any}
          userName={user?.name || user?.username || ''}
        />

    </>
  );
};

export default ProductionList;
