import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Button, Card, Space, Tabs, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ShopOutlined, InboxOutlined } from '@ant-design/icons';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import SkeletonLoader from '@/components/common/SkeletonLoader';
import { useUser, isSupervisorOrAboveUser } from '@/utils/AuthContext';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import { productionOrderApi, type ProductionOrderListParams } from '@/services/production/productionApi';
import { savePageSize, readPageSize } from '@/utils/pageSizeStore';
import { isOrderTerminal } from '@/utils/api';
import { useDebouncedValue } from '@/hooks/usePerformance';
import { useModal } from '@/hooks';
import { useFieldConfig } from '@/hooks/useFieldConfig';
import '../../../styles.css';
import { useProgressFilters } from '../ProgressDetail/hooks/useProgressFilters';
import { useShareOrderDialog } from '../ProgressDetail/hooks/useShareOrderDialog';
import {
  useNodeDetailModal,
  useProcessDetail,
  useProductionActions,
  useProductionTransfer,
  useLabelPrint,
} from '../List/hooks';
import { useSubProcessRemap } from '../List/hooks/useSubProcessRemap';
import ProductionModals from '../List/components/ProductionModals';
import FactorySidebar, { FactoryStats } from './components/FactorySidebar';
import ExternalFactorySmartView from './ExternalFactorySmartView';
import FactoryShipmentTab from './components/FactoryShipmentTab';

const ExternalFactory: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useUser();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const isFactoryAccount = !!(user as any)?.factoryId;
  // 工厂账号不能自行关单/报废，与生产管理保持一致
  const canManageOrderLifecycle = !isFactoryAccount && isSupervisorOrAbove;
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [factoryStats, setFactoryStats] = useState<FactoryStats[]>([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: readPageSize(20),
    keyword: '',
    // D-235：外发工厂要能看到本厂全部状态的订单（生产中 / 已完成 / 已关单 /
    // 已报废 / 已取消）。原先 excludeTerminal=true 会把所有终态订单排除掉，
    // includeScrapped=false 又会额外排除报废单，导致历史订单在列表里看不到。
    includeScrapped: true,
    excludeTerminal: false,
  });

  const debouncedKeyword = useDebouncedValue(searchInput, 300);

  useEffect(() => {
    setQueryParams(prev => ({ ...prev, keyword: debouncedKeyword, page: 1 }));
  }, [debouncedKeyword]);
  const {
    dateSortAsc, toggleDateSort,
  } = useProgressFilters();

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params: ProductionOrderListParams = {
        page: queryParams.page,
        pageSize: queryParams.pageSize,
        keyword: queryParams.keyword || undefined,
        includeScrapped: queryParams.includeScrapped,
        excludeTerminal: queryParams.excludeTerminal,
        factoryType: 'EXTERNAL',
        // 传给后端按工厂精确筛选，由后端 QueryWrapper 过滤，total 也是筛选后的正确值
        factoryId: selectedFactoryId || undefined,
      };
      const res = await productionOrderApi.list(params);
      if (res && res.data) {
        setOrders((res.data.records || []) as ProductionOrder[]);
        setTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '获取订单列表失败');
    } finally {
      setLoading(false);
    }
  }, [queryParams, selectedFactoryId, message]);

  const fetchFactoryStats = useCallback(async () => {
    try {
      const res = await productionOrderApi.list({
        page: 1,
        pageSize: 1000,
        factoryType: 'EXTERNAL',
        excludeTerminal: false,
      });
      if (res && res.data) {
        const allOrders = (res.data.records || []) as ProductionOrder[];
        const statsMap = new Map<string, FactoryStats>();
        const now = new Date();

        allOrders.forEach((order) => {
          const factoryId = order.factoryId || 'unknown';
          const factoryName = order.factoryName || '未知工厂';
          if (!statsMap.has(factoryId)) {
            statsMap.set(factoryId, {
              factoryId,
              factoryName,
              orderCount: 0,
              totalQuantity: 0,
              inProgressCount: 0,
              completedCount: 0,
              styleCount: 0,
              overdueCount: 0,
              warningCount: 0,
            });
          }
          const stat = statsMap.get(factoryId)!;
          stat.orderCount++;
          stat.totalQuantity += order.orderQuantity || 0;

          // 统计款号
          const styleSet = new Set<string>();
          if (order.styleNo) styleSet.add(order.styleNo);
          stat.styleCount = (stat.styleCount || 0) + (order.styleNo ? 1 : 0);

          if (order.status === 'completed') {
            stat.completedCount++;
          } else if (order.status === 'production') {
            stat.inProgressCount++;
          }

          // 交期预警统计
          const deliveryDate = (order as any).expectedShipDate || (order as any).plannedEndDate;
          if (deliveryDate && order.status !== 'completed') {
            const d = new Date(deliveryDate);
            const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) {
              stat.overdueCount = (stat.overdueCount || 0) + 1;
            } else if (diffDays <= 7) {
              stat.warningCount = (stat.warningCount || 0) + 1;
            }
          }
        });

        // 计算每个工厂的唯一款号数
        const factoryStyleMap = new Map<string, Set<string>>();
        allOrders.forEach((order) => {
          const factoryId = order.factoryId || 'unknown';
          if (!factoryStyleMap.has(factoryId)) {
            factoryStyleMap.set(factoryId, new Set());
          }
          if (order.styleNo) {
            factoryStyleMap.get(factoryId)!.add(order.styleNo);
          }
        });

        factoryStyleMap.forEach((styleSet, factoryId) => {
          const stat = statsMap.get(factoryId);
          if (stat) {
            stat.styleCount = styleSet.size;
          }
        });

        setFactoryStats(Array.from(statsMap.values()).sort((a, b) => b.orderCount - a.orderCount));
      }
    } catch (err) {
      console.error('获取工厂统计失败:', err);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchFactoryStats();
  }, [fetchOrders, fetchFactoryStats]);

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const aStatus = String(a.status || '').trim().toLowerCase();
      const bStatus = String(b.status || '').trim().toLowerCase();
      const aScrapped = ['scrapped', 'cancelled', 'closed', 'archived'].includes(aStatus) ? 2 : isOrderTerminal(a) ? 1 : 0;
      const bScrapped = ['scrapped', 'cancelled', 'closed', 'archived'].includes(bStatus) ? 2 : isOrderTerminal(b) ? 1 : 0;
      if (aScrapped !== bScrapped) return aScrapped - bScrapped;
      const aTime = new Date(String(a.createTime || 0)).getTime();
      const bTime = new Date(String(b.createTime || 0)).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });
  }, [orders, dateSortAsc]);

  const handleFactorySelect = useCallback((factoryId: string | null) => {
    setSelectedFactoryId(factoryId);
    setQueryParams(prev => ({ ...prev, page: 1 }));
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearchInput(value);
  }, []);

  const handlePageChange = useCallback((page: number, pageSize: number) => {
    savePageSize(pageSize);
    setQueryParams(prev => ({ ...prev, page, pageSize }));
  }, []);

  const handleRefresh = useCallback(() => {
    fetchOrders();
    fetchFactoryStats();
  }, [fetchOrders, fetchFactoryStats]);

  // ===== 以下能力对齐「生产管理」：阶段点击详情、工序、打印、编辑、关单/报废、备注、分享、子工序 =====
  const quickEditModal = useModal<ProductionOrder>();
  const printModal = useModal<ProductionOrder>();
  const workflowEditorModal = useModal<string>();
  const inspectDrawerModal = useModal<string>();
  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; orderNo: string; defaultRole?: string; merchandiser?: string }>({ open: false, orderNo: '' });

  const { fields: fieldConfigs } = useFieldConfig({ bizType: 'production', platform: 'pc' });
  const customFields = useMemo(() => fieldConfigs.filter(f => f.isSystem === 0), [fieldConfigs]);

  const nodeDetailModal = useNodeDetailModal();
  const labelPrint = useLabelPrint();
  const { handleShareOrder, shareOrderDialog } = useShareOrderDialog({ message });
  const productionActions = useProductionActions({
    message, isSupervisorOrAbove, fetchProductionList: fetchOrders, customFields,
  });
  const processDetail = useProcessDetail({ message, fetchProductionList: fetchOrders });
  const subProcessRemap = useSubProcessRemap({ message, fetchProductionList: fetchOrders });
  const productionTransfer = useProductionTransfer({ message });

  const handleSmartOpenRemark = useCallback((record: ProductionOrder) => {
    setRemarkTarget({ open: true, orderNo: record.orderNo || '', merchandiser: record.merchandiser });
  }, []);

  const selectedFactoryName = useMemo(() => {
    if (!selectedFactoryId) return null;
    const factory = factoryStats.find(f => f.factoryId === selectedFactoryId);
    return factory?.factoryName || null;
  }, [selectedFactoryId, factoryStats]);

  return (
    <>
    <>
      <div style={{ display: 'flex', height: 'calc(100vh - 64px)' }}>
        <FactorySidebar
          stats={factoryStats}
          selectedFactoryId={selectedFactoryId}
          onSelect={handleFactorySelect}
          loading={loading}
        />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0, padding: 16 }}>
          <Tabs defaultActiveKey="orders" className="ef-tabs" items={[
            {
              key: 'orders',
              label: <span><ShopOutlined /> 订单管理</span>,
              children: (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                  <StickyFilterBar>
                  <Card
                   
                    styles={{ body: { padding: '12px 16px' } }}
                    title={
                      <Space>
                        <ShopOutlined />
                        <span>外发工厂订单</span>
                        {selectedFactoryName && (
                          <Tag color="blue">{selectedFactoryName}</Tag>
                        )}
                        <Tag color="orange">{total} 单</Tag>
                      </Space>
                    }
                    extra={
                      <Space>
                        <Button onClick={handleRefresh}>刷新</Button>
                        <Button
                          icon={dateSortAsc ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                          onClick={toggleDateSort}
                          title={dateSortAsc ? '按时间升序' : '按时间降序'}
                          style={{ borderRadius: 16, minWidth: 32, width: 32, padding: 0 }}
                        />
                      </Space>
                    }
                  >
                    <StandardToolbar
                      left={
                        <StandardSearchBar
                          searchPlaceholder="搜索款号/订单号..."
                          searchValue={searchInput}
                          onSearchChange={handleSearch}
                          showDate={false}
                          showStatus={false}
                        />
                      }
                    />
                  </Card>
                  </StickyFilterBar>

                  {loading && orders.length === 0 ? (
                    <SkeletonLoader type="table" rows={8} loading={loading} />
                  ) : (
                    <ExternalFactorySmartView
                      data={sortedOrders}
                      loading={loading}
                      total={total}
                      pageSize={queryParams.pageSize}
                      currentPage={queryParams.page}
                      onPageChange={handlePageChange}
                      handleCloseOrder={productionActions.handleCloseOrder}
                      handleScrapOrder={productionActions.handleScrapOrder}
                      openProcessDetail={processDetail.openProcessDetail}
                      syncProcessFromTemplate={processDetail.syncProcessFromTemplate}
                      setPrintModalVisible={(v: boolean) => { if (!v) printModal.close(); }}
                      setPrintingRecord={(r: ProductionOrder | null) => { if (r) printModal.open(r); else printModal.close(); }}
                      quickEditModal={quickEditModal}
                      handleShareOrder={handleShareOrder}
                      onOpenRemark={handleSmartOpenRemark}
                      handlePrintLabel={labelPrint.handlePrintLabel}
                      canManageOrderLifecycle={canManageOrderLifecycle}
                      isSupervisorOrAbove={isSupervisorOrAbove}
                      openSubProcessRemap={subProcessRemap.openSubProcessRemap}
                      isFactoryAccount={isFactoryAccount}
                      openNodeDetail={nodeDetailModal.openNodeDetail}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'shipments',
              label: <span><InboxOutlined /> 收货管理</span>,
              children: <div style={{ overflow: 'auto', height: '100%' }}><FactoryShipmentTab selectedFactoryId={selectedFactoryId} /></div>,
            },
          ]} />
        </div>
      </div>

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
        fetchProductionList={fetchOrders}
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
        onWorkflowSaved={() => { void fetchOrders(); }}
        onOpenInspectDrawer={(orderId: string) => inspectDrawerModal.open(orderId)}
        inspectDrawerVisible={inspectDrawerModal.visible}
        inspectDrawerOrderId={inspectDrawerModal.data ?? ''}
        closeInspectDrawer={() => inspectDrawerModal.close()}
        customFields={customFields}
        fieldConfigs={fieldConfigs}
      />
    </>
    </>
  );
};

export default ExternalFactory;
