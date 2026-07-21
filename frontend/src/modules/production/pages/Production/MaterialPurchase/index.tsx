import React, { useState, useCallback } from 'react';
import { Card, Form, Tooltip, message, Tabs } from 'antd';
import { useNavigate } from 'react-router-dom';
import { QuestionCircleOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import QuickEditModal from '@/components/common/QuickEditModal';
import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import PurchaseModal from './components/PurchaseModal';
import MaterialPurchaseAIBanner from './components/MaterialPurchaseAIBanner';
import MaterialQualityIssueModal from './components/MaterialQualityIssueModal';
import PurchaseReturnTab from './components/PurchaseReturnTab';
import OrderPickerModal from './components/OrderPickerModal';
import WarehousePickModal from './components/WarehousePickModal';
import ReturnConfirmModal from './components/ReturnConfirmModal';
import ReturnResetModal from './components/ReturnResetModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { PurchaseCartDrawer } from '@/components/common/PurchaseCartDrawer';
import { usePurchaseCartActions } from '@/hooks/usePurchaseCart';
import '../../../styles.css';
import { useMaterialPurchase } from './hooks/useMaterialPurchase';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

const MaterialPurchase: React.FC = () => {
  const navigate = useNavigate();
  const [activeMainTab, setActiveMainTab] = useState('purchase');
  const [orderPickerOpen, setOrderPickerOpen] = useState(false);
  const [warehousePickModalOpen, setWarehousePickModalOpen] = useState(false);
  const [warehousePickTarget, setWarehousePickTarget] = useState<MaterialPurchaseType | null>(null);
  const [warehousePickQty, setWarehousePickQty] = useState(0);
  const [qualityIssueOpen, setQualityIssueOpen] = useState(false);
  const [qualityIssuePurchase, setQualityIssuePurchase] = useState<MaterialPurchaseType | null>(null);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
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
    if (styleNo) {
      openDetailPage(styleNo, orderNo);
    }
    setOrderPickerOpen(false);
  }, [openDetailPage]);

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
          titleExtra={
            <Tooltip
              title={
                '合并采购逻辑：从订单生成采购单时，会自动匹配同一天创建且同款的其它订单一起生成。\n'
                + '避免重复：若某订单已存在未删除的采购记录且未选择"覆盖生成"，该订单会被自动跳过。\n'
                + '合并方式：相同物料（类型/编码/名称/规格/单位/供应商相同）会共用同一采购单号，便于采购合单。'
              }
            >
              <QuestionCircleOutlined style={{ color: 'var(--neutral-text-disabled)', cursor: 'pointer' }} />
            </Tooltip>
          }
        >

                    {/* 状态统计卡片 - 点击筛选 */}
                    <PageStatCards
                      activeKey={activeStatFilter}
                      cards={[
                        {
                          key: 'all',
                          items: [
                            { label: '采购总数', value: purchaseStats.totalCount, unit: '条', color: 'var(--color-primary)' },
                            { label: '总数量', value: purchaseStats.totalQuantity, color: 'var(--color-success)' },
                          ],
                          onClick: () => handleStatClick('all'),
                          activeColor: 'var(--color-primary)',
                        },
                        {
                          key: 'pending',
                          items: [{ label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('pending'),
                          activeColor: 'var(--color-warning)',
                        },
                        {
                          key: 'received',
                          items: [{ label: '已采购', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                          onClick: () => handleStatClick('received'),
                          activeColor: 'var(--color-primary)',
                        },
                        {
                          key: 'partial',
                          items: [{ label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('partial'),
                          activeColor: 'var(--color-warning)',
                        },
                        {
                          key: 'completed',
                          items: [{ label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' }],
                          onClick: () => handleStatClick('completed'),
                          activeColor: 'var(--color-success)',
                        },
                        {
                          key: 'overdue',
                          items: [{ label: '逆期未到', value: overdueCount, unit: '条', color: 'var(--error-color, var(--color-danger))' }],
                          onClick: () => handleStatClick('overdue'),
                          activeColor: 'var(--error-color, var(--color-danger))',
                        },
                      ]}
                      extraRight={
                        <button
                          type="button"
                          onClick={() => setShowAllPurchases(v => !v)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            border: '1px solid var(--color-border-antd)',
                            background: 'var(--color-bg-base)',
                            color: !showAllPurchases ? 'var(--color-text-secondary)' : 'var(--color-primary)',
                            borderRadius: 4,
                            padding: '4px 10px',
                            fontSize: 12,
                            fontWeight: 500,
                            cursor: 'pointer',
                            lineHeight: 1.4,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {showAllPurchases ? '只看进行中' : '显示全部'}
                        </button>
                      }
                    />

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={() => {
                        const params = new URLSearchParams(location.search);
                        const orderNo = (params.get('orderNo') || '').trim();
                        setQueryParams((prev) => ({ page: 1, pageSize: prev.pageSize, orderNo, materialType: '', factoryType: '', sourceType: '', status: '' }));
                      }}
                      onExport={handleExport}
                      onAdd={() => setOrderPickerOpen(true)}
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
                      onQualityIssue={(record) => {
                        setQualityIssuePurchase(record);
                        setQualityIssueOpen(true);
                      }}
                      isSupervisorOrAbove={isSupervisorOrAbove}
                      onOpenDetail={openDetailPage}
                      onBatchAddToCart={async (records) => {
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
                      }}
                    />
        </PageLayout>
        </>
      )}

        <PurchaseCartDrawer
          open={cartDrawerOpen}
          onClose={() => setCartDrawerOpen(false)}
          onConfirmSuccess={() => {
            fetchMaterialPurchaseList();
            reloadCurrentDetail();
          }}
        />

        <OrderPickerModal
          open={orderPickerOpen}
          isMobile={isMobile}
          onClose={() => setOrderPickerOpen(false)}
          onPickOrder={handlePickOrder}
        />

        <PurchaseModal
          visible={visible}
          dialogMode={dialogMode}
          onCancel={closeDialog}
          isMobile={isMobile}
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
          onSort={handleSort}
          onReceive={receivePurchaseTask}
          onConfirmReturn={confirmReturnPurchaseTask}
          onReturnReset={openReturnReset}
          onQualityIssue={(record) => {
            setQualityIssuePurchase(record);
            setQualityIssueOpen(true);
          }}
          onReceiveAll={handleReceiveAll}
          onBatchReturn={handleBatchReturn}
          onConfirmComplete={confirmComplete}
          confirmCompleteSubmitting={confirmCompleteSubmitting}
          isSamplePurchase={isSamplePurchaseView}
          onGeneratePurchaseSheet={openPurchaseSheet}
          onDownloadPurchaseSheet={downloadPurchaseSheet}
          onSaveCreate={handleSubmit}
          onSavePreview={handleSavePreview}
          isOrderFrozenForRecord={isOrderFrozenForRecord}
          onWarehousePick={handleWarehousePickFromDetail}
          onRefresh={async () => {
            await Promise.all([fetchMaterialPurchaseList(), reloadCurrentDetail()]);
          }}
        />

        <WarehousePickModal
          open={warehousePickModalOpen}
          target={warehousePickTarget}
          pickQty={warehousePickQty}
          isMobile={isMobile}
          user={user}
          onClose={() => setWarehousePickModalOpen(false)}
          onSuccess={() => {
            setWarehousePickModalOpen(false);
            fetchMaterialPurchaseList();
            reloadCurrentDetail();
          }}
        />

        <MaterialQualityIssueModal
          open={qualityIssueOpen}
          purchase={qualityIssuePurchase}
          onChanged={async () => {
            await Promise.all([fetchMaterialPurchaseList(), reloadCurrentDetail()]);
          }}
          onClose={() => {
            setQualityIssueOpen(false);
            setQualityIssuePurchase(null);
          }}
        />

        <ReturnConfirmModal
          open={returnConfirmModal.visible}
          data={returnConfirmModal.data}
          isMobile={isMobile}
          user={user}
          returnConfirmForm={returnConfirmForm}
          returnEvidenceFiles={returnEvidenceFiles}
          setReturnEvidenceFiles={setReturnEvidenceFiles}
          returnEvidenceRecognizing={returnEvidenceRecognizing}
          recognizeReturnEvidence={recognizeReturnEvidence}
          returnConfirmSubmitting={returnConfirmSubmitting}
          submitReturnConfirm={submitReturnConfirm}
          onCancel={() => {
            returnConfirmModal.close();
            returnConfirmForm.resetFields();
          }}
        />

        <ReturnResetModal
          open={returnResetModal.visible}
          isMobile={isMobile}
          returnResetForm={returnResetForm}
          returnResetSubmitting={returnResetSubmitting}
          submitReturnReset={submitReturnReset}
          onCancel={() => {
            returnResetModal.close();
            returnResetForm.resetFields();
          }}
        />

        <QuickEditModal
          visible={quickEditModal.visible}
          loading={quickEditSaving}
          initialValues={{
            remark: quickEditModal.data?.remark,
            expectedShipDate: quickEditModal.data?.expectedShipDate,
          }}
          onSave={handleQuickEditSave}
          onCancel={() => {
            quickEditModal.close();
          }}
        />

        <RemarkTimelineModal
          open={remarkOpen}
          onClose={() => setRemarkOpen(false)}
          targetType="order"
          targetNo={remarkOrderNo}
          canAddRemark={true}
        />

    </>
  );
};

export default MaterialPurchase;
