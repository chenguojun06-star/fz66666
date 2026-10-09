import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, Form, message, Tabs, Button, Space, Dropdown, Modal } from 'antd';
import { RobotOutlined, PlusOutlined, DownOutlined, ExportOutlined } from '@ant-design/icons';
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
import api from '@/utils/api';
import '../../../styles.css';
import { useMaterialPurchase } from './hooks/useMaterialPurchase';
import { normalizeStatus } from './hooks/purchaseActionsHelpers';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { buildStatCards } from './statCardsConfig';
import TitleExtraTooltip from './TitleExtraTooltip';
import PurchaseModals from './PurchaseModals';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { usePersistentTab } from '@/hooks/usePersistentTab';

const MaterialPurchase: React.FC = () => {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = usePersistentTab<string>('tab', 'purchase');
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
    showAllPurchases: _showAllPurchases, setShowAllPurchases: _setShowAllPurchases,
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
    openReturnConfirm,
    openReturnReset, submitReturnConfirm, submitReturnReset,
    handleReceiveAll, handleSmartReceiveSuccess: _handleSmartReceiveSuccess, handleBatchReturn,
    openPurchaseSheet, downloadPurchaseSheet,
    openQuickEditSafe, handleQuickEditSave,
    isSamplePurchaseView,
    confirmComplete, confirmCompleteSubmitting,
    confirmCompleteFrom,
    confirmCompleteModalOpen, closeConfirmCompleteModal, submitConfirmComplete, confirmCompleteTargets,
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

  // 订单级冻结判断（不看采购行自身状态：COMPLETED 采购行仍允许回料，与详情页口径一致）
  const isOrderFrozen = useCallback((r: MaterialPurchaseType) =>
    isOrderFrozenForRecord({ orderNo: r.orderNo, orderId: r.orderId, sourceType: r.sourceType } as Record<string, unknown>),
  [isOrderFrozenForRecord]);

  // 列表页批量领取：选中行过滤待采购(pending)且订单未冻结，走后端 /batch-receive
  const handleBatchReceiveRows = useCallback((records: MaterialPurchaseType[]) => {
    const pending = records.filter((r) =>
      String(r.id || '').trim()
      && normalizeStatus(r.status) === MATERIAL_PURCHASE_STATUS.PENDING
      && !isOrderFrozen(r));
    if (!pending.length) {
      message.info('选中行中没有可领取的待采购任务');
      return;
    }
    const receiverName = String(user?.name || user?.username || '').trim();
    if (!receiverName) { message.error('未填写领取人'); return; }
    const receiverId = String(user?.id || '').trim();
    const skipped = records.length - pending.length;
    Modal.confirm({
      width: '46vw',
      title: '确认批量领取',
      content: (
        <div>
          <p>将领取以下 <strong>{pending.length}</strong> 项待采购任务（有库存自动出库，无库存按外采登记）：</p>
          {skipped > 0 && <p className="u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>另有 {skipped} 项非待采购或订单已完成，将自动跳过</p>}
          <div className="u-ov-auto u-mt-8 u-fs-13" style={{ maxHeight: 260 }}>
            {pending.map((p, i) => (
              <div key={String(p.id)} className="u-d-flex u-jc-between u-ai-center u-gap-8" style={{ padding: '6px 0', borderBottom: i < pending.length - 1 ? '1px solid var(--color-border-light)' : 'none' }}>
                <span className="u-flex-1">
                  <div className="u-fw-500">{p.materialName || p.materialCode}</div>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
                    {[p.orderNo, p.materialCode, p.color].filter(Boolean).join(' | ') || '-'}
                  </div>
                </span>
                <span className="u-ws-nowrap" style={{ color: 'var(--color-primary)' }}>
                  {p.purchaseQuantity}{p.unit || ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      ),
      okText: '确认领取',
      cancelText: '取消',
      onOk: async () => {
        try {
          const res = await api.post<{ code: number; message?: string; data?: { successCount?: number; skipCount?: number; failCount?: number; failMessages?: string[] } }>(
            '/production/purchase/batch-receive',
            { purchaseIds: pending.map((r) => String(r.id)), receiverId, receiverName },
          );
          if (res.code === 200) {
            const { successCount = 0, skipCount = 0, failCount = 0, failMessages = [] } = res.data || {};
            if (failCount > 0) {
              message.warning(`领取完成：成功 ${successCount} 项，跳过 ${skipCount} 项，失败 ${failCount} 项（${failMessages[0] || ''}）`);
            } else {
              message.success(`领取完成：成功 ${successCount} 项${skipCount ? `，跳过 ${skipCount} 项` : ''}`);
            }
            fetchMaterialPurchaseList();
          } else {
            message.error(res.message || '批量领取失败');
          }
        } catch (err: unknown) {
          message.error(err instanceof Error ? err.message : '批量领取失败');
        }
      },
    });
  }, [user, isOrderFrozen, fetchMaterialPurchaseList]);

  // 列表页批量回料确认：与采购节点弹窗同口径 D-368（非取消、未回料确认、到货数量>0），
  // 复用 ReturnConfirmModal 多行编辑回料数弹窗
  const handleBatchReturnRows = useCallback((records: MaterialPurchaseType[]) => {
    const targets = records.filter((r) =>
      String(r.id || '').trim()
      && normalizeStatus(r.status) !== MATERIAL_PURCHASE_STATUS.CANCELLED
      && Number(r.returnConfirmed || 0) !== 1
      && Number(r.arrivedQuantity || 0) > 0
      && !isOrderFrozen(r));
    if (!targets.length) {
      message.info('选中行中没有可回料确认的采购任务（需先登记到货）');
      return;
    }
    openReturnConfirm(targets);
  }, [isOrderFrozen, openReturnConfirm]);

  // 列表页批量确认完成：与详情页共用 ConfirmCompleteModal（物料去向选择）
  const handleBatchCompleteRows = useCallback((records: MaterialPurchaseType[]) => {
    const targets = records.filter((r) => !isOrderFrozen(r));
    if (!targets.length) {
      message.info('选中行中没有待确认完成的采购任务');
      return;
    }
    confirmCompleteFrom(targets);
  }, [isOrderFrozen, confirmCompleteFrom]);

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
                        <Space wrap size={8}>
                          {/* D-360 统一动作区：新增采购(primary) / 智能采购推荐 / 更多▾(导出) */}
                          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => { setOrderPickerContext('add'); setOrderPickerOpen(true); }}>
                            新增采购
                          </Button>
                          <Button
                            icon={<RobotOutlined />}
                            size="small"
                            style={{ color: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
                            onClick={() => setSmartSourcingDrawerOpen(true)}
                          >
                            智能采购推荐
                          </Button>
                          <Dropdown
                            trigger={['hover']}
                            menu={{
                              items: [
                                { key: 'export', label: '导出', icon: <ExportOutlined />, onClick: handleExport, disabled: loading || !purchaseList?.length },
                              ],
                            }}
                          >
                            <Button size="small">
                              更多 <DownOutlined />
                            </Button>
                          </Dropdown>
                        </Space>
                      }
                    />

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={handleSearchReset}
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
                      onBatchReceive={handleBatchReceiveRows}
                      onBatchReturn={handleBatchReturnRows}
                      onBatchComplete={handleBatchCompleteRows}
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
        confirmCompleteModalOpen={confirmCompleteModalOpen}
        closeConfirmCompleteModal={closeConfirmCompleteModal}
        submitConfirmComplete={submitConfirmComplete}
        confirmCompleteTargets={confirmCompleteTargets}
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
