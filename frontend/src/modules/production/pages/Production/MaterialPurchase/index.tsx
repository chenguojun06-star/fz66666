import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Card, Form, message, Tabs, Button, Drawer, Table, Tag, Tooltip, Space, Alert, Input, Statistic } from 'antd';
import { RobotOutlined, SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import MaterialPurchaseAIBanner from './components/MaterialPurchaseAIBanner';
import PurchaseReturnTab from './components/PurchaseReturnTab';
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
  const [smartSourcingOrderNo, setSmartSourcingOrderNo] = useState('');
  const [netDemandLoading, setNetDemandLoading] = useState(false);
  const [netDemandData, setNetDemandData] = useState<any[]>([]);
  const [pushToCartLoading, setPushToCartLoading] = useState(false);
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
        setSmartSourcingOrderNo(orderNo);
        // 选中后自动分析，少点一次按钮
        setNetDemandLoading(true);
        purchaseCartApi.getNetDemand(orderNo)
          .then((data) => setNetDemandData(data || []))
          .catch(() => { message.error('分析需求失败'); setNetDemandData([]); })
          .finally(() => setNetDemandLoading(false));
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

  // 分析需求（预览，不写入购物车）
  const handleAnalyzeNetDemand = useCallback(async () => {
    const orderNo = smartSourcingOrderNo.trim();
    if (!orderNo) {
      message.warning('请输入订单号');
      return;
    }
    setNetDemandLoading(true);
    try {
      const data = await purchaseCartApi.getNetDemand(orderNo);
      setNetDemandData(data || []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '分析需求失败');
      setNetDemandData([]);
    } finally {
      setNetDemandLoading(false);
    }
  }, [smartSourcingOrderNo]);

  // 确认推送到购物车
  const handlePushToCart = useCallback(async () => {
    const orderNo = smartSourcingOrderNo.trim();
    if (!orderNo) {
      message.warning('订单号不能为空');
      return;
    }
    const needPurchaseCount = netDemandData.filter(d => d.needPurchase).length;
    if (needPurchaseCount === 0) {
      message.info('所有物料库存充足，无需采购');
      return;
    }
    setPushToCartLoading(true);
    try {
      await purchaseCartApi.generateSmartSourcing(orderNo);
      message.success(`已将 ${needPurchaseCount} 项缺料加入购物车草稿`);
      setSmartSourcingDrawerOpen(false);
      setSmartSourcingOrderNo('');
      setNetDemandData([]);
      setCartDrawerOpen(true);
    } catch (e) {
      message.error(e instanceof Error ? e.message : '推送购物车失败');
    } finally {
      setPushToCartLoading(false);
    }
  }, [smartSourcingOrderNo, netDemandData]);

  // 关闭 Drawer 时清空状态
  const handleCloseSmartSourcing = useCallback(() => {
    setSmartSourcingDrawerOpen(false);
    setSmartSourcingOrderNo('');
    setNetDemandData([]);
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

      <Drawer
        title="智能采购推荐"
        open={smartSourcingDrawerOpen}
        onClose={handleCloseSmartSourcing}
        width={Math.min(1200, typeof window !== 'undefined' ? window.innerWidth - 48 : 1000)}
        destroyOnClose
        extra={
          netDemandData.length > 0 ? (
            <Space>
              <Statistic
                title="需采购"
                value={netDemandData.filter(d => d.needPurchase).length}
                valueStyle={{ color: 'var(--color-error)', fontSize: 18 }}
              />
              <Statistic
                title="库存充足"
                value={netDemandData.filter(d => !d.needPurchase).length}
                valueStyle={{ color: 'var(--color-success)', fontSize: 18 }}
              />
            </Space>
          ) : null
        }
        footer={
          netDemandData.length > 0 ? (
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={handleCloseSmartSourcing}>取消</Button>
              <Button
                type="primary"
                icon={<ShoppingCartOutlined />}
                loading={pushToCartLoading}
                onClick={handlePushToCart}
                disabled={netDemandData.filter(d => d.needPurchase).length === 0}
              >
                确认推送缺料到购物车
              </Button>
            </Space>
          ) : null
        }
      >
        {/* 步骤1：选择/输入订单号 */}
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="选择或输入生产订单号"
            value={smartSourcingOrderNo}
            onChange={(e) => setSmartSourcingOrderNo(e.target.value)}
            onPressEnter={handleAnalyzeNetDemand}
            allowClear
            prefix={<SearchOutlined />}
          />
          <Button
            onClick={() => { setOrderPickerContext('smart'); setOrderPickerOpen(true); }}
          >
            选择订单
          </Button>
          <Button
            type="primary"
            onClick={handleAnalyzeNetDemand}
            loading={netDemandLoading}
          >
            分析需求
          </Button>
        </Space.Compact>

        {netDemandData.length === 0 && !netDemandLoading && (
          <Alert
            type="info"
            showIcon
            message="智能采购推荐说明"
            description={
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <p style={{ margin: '0 0 4px' }}><strong>功能说明：</strong>输入生产订单号，系统自动分析该订单的物料清单，计算每个物料的净需求。</p>
                <p style={{ margin: '0 0 4px' }}><strong>计算公式：</strong>净需求 = 物料用量 × 订单数量 × (1 + 损耗率) - 可用库存 - 在途采购</p>
                <p style={{ margin: '0 0 4px' }}><strong>智能推荐：</strong>仅净需求 &gt; 0 的物料（库存不够的）才会推送购物车，并自动推荐供应商（优先物料清单指定 → S/A 级供应商 → 任意活跃供应商）。</p>
                <p style={{ margin: 0 }}><strong>操作流程：</strong>输入订单号 → 点「分析需求」查看明细 → 确认后点「推送缺料到购物车」。</p>
              </div>
            }
          />
        )}

        {netDemandData.length > 0 && (
          <Table
            size="small"
            dataSource={netDemandData}
            rowKey="materialCode"
            pagination={false}
            scroll={{ x: 1400 }}
            rowClassName={(record) => record.needPurchase ? '' : 'smart-sourcing-no-need'}
            columns={[
              {
                title: '状态',
                dataIndex: 'needPurchase',
                width: 80,
                fixed: 'left',
                render: (need: boolean) =>
                  need
                    ? <Tag color="red">需采购</Tag>
                    : <Tag color="green">充足</Tag>,
              },
              {
                title: '物料信息',
                dataIndex: 'materialCode',
                width: 200,
                fixed: 'left',
                render: (_: string, r: any) => (
                  <div>
                    <div style={{ fontWeight: 500 }}>{r.materialName || '-'}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                      {r.materialCode}
                      {r.specification ? ` | ${r.specification}` : ''}
                      {r.color ? ` | ${r.color}` : ''}
                    </div>
                  </div>
                ),
              },
              {
                title: '物料用量',
                dataIndex: 'bomUsageAmount',
                width: 100,
                render: (v: any, r: any) => (
                  <span>{v} {r.unit || ''}</span>
                ),
              },
              {
                title: '损耗率',
                dataIndex: 'lossRate',
                width: 70,
                render: (v: any) => v ? `${v}%` : '-',
              },
              {
                title: '总需求',
                dataIndex: 'demand',
                width: 100,
                render: (v: any, r: any) => (
                  <span style={{ fontWeight: 500 }}>{v} {r.unit || ''}</span>
                ),
              },
              {
                title: '可用库存',
                dataIndex: 'availableStock',
                width: 80,
                render: (v: number) => (
                  <span style={{ color: v > 0 ? 'var(--color-success)' : 'var(--color-text-quaternary)' }}>
                    {v}
                  </span>
                ),
              },
              {
                title: '在途',
                dataIndex: 'inTransit',
                width: 80,
                render: (v: any) => v || 0,
              },
              {
                title: '净需求',
                dataIndex: 'netDemand',
                width: 100,
                render: (v: any, r: any) => (
                  <span style={{
                    color: r.needPurchase ? 'var(--color-error)' : 'var(--color-text-quaternary)',
                    fontWeight: r.needPurchase ? 600 : 400,
                  }}>
                    {v} {r.unit || ''}
                  </span>
                ),
              },
              {
                title: '推荐供应商',
                dataIndex: 'recommendedSupplier',
                width: 160,
                render: (supplier: any) => {
                  if (!supplier || !supplier.supplierName) return <span style={{ color: 'var(--color-text-quaternary)' }}>暂无</span>;
                  const tierColor = supplier.supplierTier === 'S' ? 'gold' : supplier.supplierTier === 'A' ? 'green' : 'default';
                  return (
                    <div>
                      <div style={{ fontWeight: 500 }}>
                        {supplier.supplierName}
                        {supplier.isBomDesignated && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>物料清单指定</Tag>}
                      </div>
                      <div style={{ fontSize: 11 }}>
                        {supplier.supplierTier && <Tag color={tierColor} style={{ fontSize: 10 }}>{supplier.supplierTier}级</Tag>}
                        {supplier.overallScore && <span style={{ color: 'var(--color-text-secondary)' }}>评分 {supplier.overallScore}</span>}
                      </div>
                    </div>
                  );
                },
              },
              {
                title: '价格参考',
                width: 140,
                render: (_: any, r: any) => (
                  <div style={{ fontSize: 12 }}>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>物料清单预估：</span>
                      {r.bomUnitPrice ? `¥${r.bomUnitPrice}` : '-'}
                    </div>
                    <div>
                      <span style={{ color: 'var(--color-text-secondary)' }}>上次采购：</span>
                      {r.lastPurchasePrice ? `¥${r.lastPurchasePrice}` : '-'}
                      {r.lastPurchaseSupplier ? ` (${r.lastPurchaseSupplier})` : ''}
                    </div>
                    {r.priceAlert && (
                      <Tag color="orange" style={{ fontSize: 10, marginTop: 2 }}>{r.priceAlert}</Tag>
                    )}
                  </div>
                ),
              },
              {
                title: '推荐理由',
                dataIndex: 'recommendReason',
                width: 200,
                ellipsis: { showTitle: false },
                render: (reason: string) => (
                  <Tooltip title={reason} placement="topLeft">
                    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{reason}</span>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </Drawer>

    </>
  );
};

export default MaterialPurchase;
