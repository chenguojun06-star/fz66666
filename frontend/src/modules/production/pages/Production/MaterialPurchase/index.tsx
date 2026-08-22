import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, Form, message, Tabs, Button, Table, Tag, Tooltip, Space, Alert, Statistic } from 'antd';
import { RobotOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import MaterialPurchaseAIBanner from './components/MaterialPurchaseAIBanner';
import PurchaseReturnTab from './components/PurchaseReturnTab';
import SmartSourcingDrawer from './components/SmartSourcingDrawer';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { usePurchaseCartActions, usePurchaseCart } from '@/hooks/usePurchaseCart';
import { purchaseCartApi } from '@/services/purchaseCartApi';
import '../../../styles.css';
import { useMaterialPurchase } from './hooks/useMaterialPurchase';
import { buildStatCards } from './statCardsConfig';
import TitleExtraTooltip from './TitleExtraTooltip';
import PurchaseModals from './PurchaseModals';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

const MaterialPurchase: React.FC = () => {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState('purchase');
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  // 订单选择器用途：add=新增采购跳详情；smart=智能采购推荐带回订单号并自动分析
  const [orderPickerContext, setOrderPickerContext] = useState<'add' | 'smart'>('add');
  const [warehousePickModalOpen, setWarehousePickModalOpen] = useState(false);
  const [warehousePickTarget, setWarehousePickTarget] = useState<MaterialPurchaseType | null>(null);
  const [warehousePickQty, setWarehousePickQty] = useState(0);
  const [qualityIssueOpen, setQualityIssueOpen] = useState(false);
  const [qualityIssuePurchase, setQualityIssuePurchase] = useState<MaterialPurchaseType | null>(null);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [smartSourcingDrawerOpen, setSmartSourcingDrawerOpen] = useState(false);
  // V2 新组件：由 SmartSourcingDrawer 组件内部管理订单号/分析结果等状态
  //   同时保留 handlePickOrder 里选择单订单时可直接打开"单订单分析"Tab并自动聚焦
  const [smartDefaultOrderNo, setSmartDefaultOrderNo] = useState('');
  const { cartVersion } = usePurchaseCart();
  const {
    contextHolder, modalContextHolder,
    user, isMobile, isSupervisorOrAbove,
    purchaseList, loading, total,
    queryParams, setQueryParams,
    sortField, sortOrder, handleSort,
    purchaseSortField, purchaseSortOrder, handlePurchaseSort,
    sortedPurchaseList,
    purchaseStats, activeStatFilter, handleStatClick, overdueCount,
    showAllPurchases, setShowAllPurchases,
    smartError, showSmartErrorNotice, showPurchaseAI,
    fetchMaterialPurchaseList,
    reloadCurrentDetail,
    isOrderFrozenForRecord,
    handleDeleteOrphan,
    handleExport,
    location,
    visible, dialogMode, currentPurchase,
    previewList, previewOrderId,
    form, materialDatabaseForm,
    submitLoading,
    detailOrder, detailOrderLines, detailPurchases, detailLoading, detailSizePairs,
    detailFrozen,
    returnConfirmModal, returnConfirmForm, returnConfirmSubmitting,
    returnEvidenceFiles, setReturnEvidenceFiles, returnEvidenceRecognizing, recognizeReturnEvidence,
    returnResetModal, returnResetForm, returnResetSubmitting,
    quickEditModal, quickEditSaving,
    openDialog: _openDialog, openDialogSafe, closeDialog,
    handleSubmit, handleSavePreview,
    receivePurchaseTask, confirmReturnPurchaseTask,
    openReturnReset, submitReturnConfirm, submitReturnReset,
    handleReceiveAll, handleSmartReceiveSuccess: _handleSmartReceiveSuccess, handleBatchReturn,
    openPurchaseSheet, downloadPurchaseSheet,
    openQuickEditSafe, handleQuickEditSave,
    isSamplePurchaseView,
    confirmComplete, confirmCompleteSubmitting,
  } = useMaterialPurchase();

  const { batchAddItems } = usePurchaseCartActions();

  const statCards = useMemo(
    () => buildStatCards(purchaseStats, overdueCount, handleStatClick),
    [purchaseStats, overdueCount, handleStatClick],
  );

  const openDetailPage = useCallback((styleNo: string, orderNo?: string) => {
    if (styleNo && styleNo !== '_') {
      const qs = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : '';
      navigate(`/production/material/${encodeURIComponent(styleNo)}${qs}`);
    } else if (orderNo) {
      navigate(`/production/material/_?purchaseNo=${encodeURIComponent(orderNo)}`);
    }
  }, [navigate]);

  const handleWarehousePickFromDetail = useCallback(async (record: MaterialPurchaseType, pickQty: number) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) { message.error('采购任务缺少ID'); return; }
    setWarehousePickTarget(record);
    setWarehousePickQty(pickQty);
    setWarehousePickModalOpen(true);
  }, []);

  const handlePickOrder = useCallback((order: any) => {
    const styleNo = String(order.styleNo || '').trim();
    const orderNo = String(order.orderNo || '').trim();
    if (orderPickerContext === 'smart') {
      if (orderNo) {
        // V2 升级：从外部选单后，将 Drawer 打开并自动切到"单订单分析"Tab并预填订单号
        setSmartDefaultOrderNo(orderNo);
        setSmartSourcingDrawerOpen(true);
      }
    } else if (styleNo) {
      openDetailPage(styleNo, orderNo);
    }
    setOrderPickerOpen(false);
  }, [orderPickerContext, openDetailPage]);

  const handleQualityIssue = useCallback((record: MaterialPurchaseType) => {
    setQualityIssuePurchase(record);
    setQualityIssueOpen(true);
  }, []);

  const handleBatchAddToCart = useCallback(async (records: MaterialPurchaseType[]) => {
    if (!records.length) return;
    const requests = records.map(record => ({
      materialCode: record.materialCode || '',
      materialName: record.materialName || '',
      materialType: (record.materialType || 'FABRIC') as any,
      unit: record.unit || '米',
      quantity: Number(record.purchaseQuantity || 0),
      supplierId: record.supplierId || '',
      supplierName: record.supplierName || '',
      sourceType: 'PURCHASE_TASK',
      sourceId: record.id || '',
      sourceNo: record.purchaseNo || '',
      sourceQuantity: Number(record.purchaseQuantity || 0),
      color: record.color || '',
      specifications: record.specifications || '',
    })) as any;
    await batchAddItems(requests);
    setCartDrawerOpen(true);
  }, [batchAddItems]);

  // （已将原有单订单分析迁移到 SmartSourcingDrawer 组件内部 V1 Tab）
  //   handleAnalyzeNetDemand / handlePushToCart 仅保留引用兼容性
  //   旧 Drawer 状态全部删除，避免与新组件重复维护

  // 关闭 Drawer 时清空默认预填订单号（不强制，下次可带）
  const handleCloseSmartSourcing = useCallback(() => {
    setSmartSourcingDrawerOpen(false);
  }, []);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([fetchMaterialPurchaseList(), reloadCurrentDetail()]);
  }, [fetchMaterialPurchaseList, reloadCurrentDetail]);

  // 监听购物车 cartVersion 变化（确认采购后自动刷新列表）
  useEffect(() => {
    if (cartVersion > 0) {
      fetchMaterialPurchaseList();
      reloadCurrentDetail();
    }
  }, [cartVersion, fetchMaterialPurchaseList, reloadCurrentDetail]);

  const handleSearchReset = useCallback(() => {
    const params = new URLSearchParams(location.search);
    const orderNo = (params.get('orderNo') || '').trim();
    setQueryParams((prev) => ({ page: 1, pageSize: prev.pageSize, orderNo, materialType: '', factoryType: '', sourceType: '', status: '' }));
  }, [location.search, setQueryParams]);

  return (
    <>
      {contextHolder}
      {modalContextHolder}
      <Form form={form} component={false} />
      <Form form={materialDatabaseForm} component={false} />
      <Tabs
        activeKey={activeMainTab}
        onChange={setActiveMainTab}
        type="card"
        style={{ marginBottom: 0 }}
        items={[
          { key: 'purchase', label: '采购管理', children: null },
          { key: 'return', label: '退货记录', children: null },
        ]}
      />
      {activeMainTab === 'return' ? (
        <Card bordered={false} style={{ borderTop: 'none' }}>
          <PurchaseReturnTab />
        </Card>
      ) : (
        <>
        <PageLayout
          title="物料采购"
          headerContent={
            showSmartErrorNotice && smartError ? (
              <Card style={{ marginBottom: 12 }}>
                <SmartErrorNotice error={smartError} onFix={fetchMaterialPurchaseList} />
              </Card>
            ) : null
          }
          titleExtra={<TitleExtraTooltip />}
        >

                    <PageStatCards
                      activeKey={activeStatFilter}
                      cards={statCards}
                      extraRight={
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <Button
                            icon={<RobotOutlined />}
                            size="small"
                            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                            onClick={() => setSmartSourcingDrawerOpen(true)}
                          >
                            智能采购推荐
                          </Button>
                        </div>
                      }
                    />

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={handleSearchReset}
                      onExport={handleExport}
                      onAdd={() => { setOrderPickerContext('add'); setOrderPickerOpen(true); }}
                      loading={loading}
                      hasData={purchaseList && purchaseList.length > 0}
                    />

                    {showPurchaseAI && (
                      <MaterialPurchaseAIBanner
                        purchaseList={purchaseList}
                        currentOrderNo={String(queryParams.orderNo || '').trim() || undefined}
                      />
                    )}

                    <MaterialTable
                      loading={loading}
                      dataSource={sortedPurchaseList}
                      total={total}
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      isMobile={isMobile}
                      onView={(record) => openDialogSafe('view', record)}
                      onEdit={(record) => openQuickEditSafe(record)}
                      onRemark={(record) => { setRemarkOrderNo(record.orderNo ?? ''); setRemarkOpen(true); }}
                      onRefresh={() => setQueryParams(p => ({ ...p }))}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      purchaseSortField={purchaseSortField}
                      purchaseSortOrder={purchaseSortOrder}
                      onPurchaseSort={handlePurchaseSort}
                      isOrderFrozenForRecord={isOrderFrozenForRecord}
                      onDelete={handleDeleteOrphan}
                      onConfirmReturn={confirmReturnPurchaseTask}
                      onReturnReset={openReturnReset}
                      onQualityIssue={handleQualityIssue}
                      isSupervisorOrAbove={isSupervisorOrAbove}
                      onOpenDetail={openDetailPage}
                      onBatchAddToCart={handleBatchAddToCart}
                    />
        </PageLayout>
        </>
      )}

      <PurchaseModals
        cartDrawerOpen={cartDrawerOpen}
        setCartDrawerOpen={setCartDrawerOpen}
        fetchMaterialPurchaseList={fetchMaterialPurchaseList}
        reloadCurrentDetail={reloadCurrentDetail}
        orderPickerOpen={orderPickerOpen}
        isMobile={isMobile}
        setOrderPickerOpen={setOrderPickerOpen}
        handlePickOrder={handlePickOrder}
        visible={visible}
        dialogMode={dialogMode}
        closeDialog={closeDialog}
        submitLoading={submitLoading}
        currentPurchase={currentPurchase}
        detailOrder={detailOrder}
        detailOrderLines={detailOrderLines}
        detailPurchases={detailPurchases}
        detailLoading={detailLoading}
        detailSizePairs={detailSizePairs}
        detailFrozen={detailFrozen}
        previewList={previewList}
        previewOrderId={previewOrderId}
        isSupervisorOrAbove={isSupervisorOrAbove}
        form={form}
        user={user}
        sortField={sortField}
        sortOrder={sortOrder}
        handleSort={handleSort}
        receivePurchaseTask={receivePurchaseTask}
        confirmReturnPurchaseTask={confirmReturnPurchaseTask}
        openReturnReset={openReturnReset}
        handleQualityIssue={handleQualityIssue}
        handleReceiveAll={handleReceiveAll}
        handleBatchReturn={handleBatchReturn}
        confirmComplete={confirmComplete}
        confirmCompleteSubmitting={confirmCompleteSubmitting}
        isSamplePurchaseView={isSamplePurchaseView}
        openPurchaseSheet={openPurchaseSheet}
        downloadPurchaseSheet={downloadPurchaseSheet}
        handleSubmit={handleSubmit}
        handleSavePreview={handleSavePreview}
        isOrderFrozenForRecord={isOrderFrozenForRecord}
        handleWarehousePickFromDetail={handleWarehousePickFromDetail}
        handleRefreshAll={handleRefreshAll}
        warehousePickModalOpen={warehousePickModalOpen}
        warehousePickTarget={warehousePickTarget}
        warehousePickQty={warehousePickQty}
        setWarehousePickModalOpen={setWarehousePickModalOpen}
        qualityIssueOpen={qualityIssueOpen}
        qualityIssuePurchase={qualityIssuePurchase}
        setQualityIssueOpen={setQualityIssueOpen}
        setQualityIssuePurchase={setQualityIssuePurchase}
        returnConfirmModal={returnConfirmModal}
        returnConfirmForm={returnConfirmForm}
        returnEvidenceFiles={returnEvidenceFiles}
        setReturnEvidenceFiles={setReturnEvidenceFiles}
        returnEvidenceRecognizing={returnEvidenceRecognizing}
        recognizeReturnEvidence={recognizeReturnEvidence}
        returnConfirmSubmitting={returnConfirmSubmitting}
        submitReturnConfirm={submitReturnConfirm}
        returnResetModal={returnResetModal}
        returnResetForm={returnResetForm}
        returnResetSubmitting={returnResetSubmitting}
        submitReturnReset={submitReturnReset}
        quickEditModal={quickEditModal}
        quickEditSaving={quickEditSaving}
        handleQuickEditSave={handleQuickEditSave}
        remarkOpen={remarkOpen}
        setRemarkOpen={setRemarkOpen}
        remarkOrderNo={remarkOrderNo}
      />

      {/* V2 智能采购推荐 Drawer：Tab1 待采购订单列表 + Tab2 单订单分析（兼容旧操作） */}
      <SmartSourcingDrawer
        open={smartSourcingDrawerOpen}
        onClose={handleCloseSmartSourcing}
        defaultOrderNo={smartDefaultOrderNo}
        onOpenOrderPicker={() => { setOrderPickerContext('smart'); setOrderPickerOpen(true); }}
        onPushedToCart={() => setCartDrawerOpen(true)}
      />

    </>
  );
};

export default MaterialPurchase;
