import React from 'react';
import { Card, Input, Select, Form, InputNumber, Segmented, Tooltip, Tabs } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import PurchaseModal from './components/PurchaseModal';
import SmartReceiveModal from './components/SmartReceiveModal';
import MaterialPurchaseAIBanner from './components/MaterialPurchaseAIBanner';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import '../../../styles.css';
import { useMaterialPurchase } from './hooks/useMaterialPurchase';

const MaterialPurchase: React.FC = () => {
  const {
    contextHolder,
    user, isMobile, modalWidth, isSupervisorOrAbove,
    purchaseList, loading, total,
    queryParams, setQueryParams,
    sortField, sortOrder, handleSort,
    purchaseSortField, purchaseSortOrder, handlePurchaseSort,
    sortedPurchaseList,
    purchaseStats, activeStatFilter, handleStatClick, overdueCount,
    smartError, showSmartErrorNotice, showPurchaseAI,
    fetchMaterialPurchaseList,
    isOrderFrozenForRecord,
    handleExport,
    location,
    visible, dialogMode, currentPurchase,
    previewList, previewOrderId,
    form, materialDatabaseForm,
    submitLoading, modalInitialHeight,
    detailOrder, detailOrderLines, detailPurchases, detailLoading, detailSizePairs,
    detailFrozen,
    smartReceiveOpen, smartReceiveOrderNo, setSmartReceiveOpen,
    returnConfirmModal, returnConfirmForm, returnConfirmSubmitting,
    returnResetModal, returnResetForm, returnResetSubmitting,
    quickEditModal, quickEditSaving,
    openDialog, openDialogSafe, closeDialog,
    handleSubmit, handleSavePreview,
    receivePurchaseTask, confirmReturnPurchaseTask,
    openReturnReset, submitReturnConfirm, submitReturnReset,
    handleReceiveAll, handleSmartReceiveSuccess, handleBatchReturn,
    openPurchaseSheet, downloadPurchaseSheet,
    openQuickEditSafe, handleQuickEditSave,
    isSamplePurchaseView,
  } = useMaterialPurchase();

  return (
    <Layout>
      {contextHolder}
      <Form form={form} component={false} />
      <Form form={materialDatabaseForm} component={false} />
        <Card className="page-card">
          <Tabs
            activeKey="purchase"
            items={[
              {
                key: 'purchase',
                label: '面料采购',
                children: (
                  <div>
                    {showSmartErrorNotice && smartError ? (
                      <Card size="small" style={{ marginBottom: 12 }}>
                        <SmartErrorNotice error={smartError} onFix={fetchMaterialPurchaseList} />
                      </Card>
                    ) : null}
                    <div className="page-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Select
                          value={queryParams.sourceType || ''}
                          onChange={(value) => setQueryParams(prev => ({ ...prev, sourceType: value as 'order' | 'sample' | 'batch' | '', page: 1 }))}
                          options={[
                            { label: '全部', value: '' },
                            { label: '订单', value: 'order' },
                            { label: '样衣', value: 'sample' },
                            { label: '批量采购', value: 'batch' },
                          ]}
                          style={{ width: 120 }}
                          placeholder="订单类型"
                        />
                        <Segmented
                          value={queryParams.materialType || ''}
                          options={[
                            { label: '面料', value: 'fabric' },
                            { label: '里料', value: 'lining' },
                            { label: '辅料', value: 'accessory' },
                            { label: '全部', value: '' },
                          ]}
                          onChange={(value) => setQueryParams(prev => ({ ...prev, materialType: String(value), page: 1 }))}
                        />
                        <Tooltip
                          title={
                            '合并采购逻辑：从订单生成采购单时，会自动匹配同一天创建且同款的其它订单一起生成。\n'
                            + '避免重复：若某订单已存在未删除的采购记录且未选择"覆盖生成"，该订单会被自动跳过。\n'
                            + '合并方式：相同物料（类型/编码/名称/规格/单位/供应商相同）会共用同一采购单号，便于采购合单。'
                          }
                        >
                          <QuestionCircleOutlined style={{ color: 'var(--neutral-text-disabled)', cursor: 'pointer' }} />
                        </Tooltip>
                      </div>
                    </div>

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
                          activeBg: 'rgba(45, 127, 249, 0.1)',
                        },
                        {
                          key: 'pending',
                          items: [{ label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('pending'),
                          activeColor: 'var(--color-warning)',
                          activeBg: '#fff7e6',
                        },
                        {
                          key: 'received',
                          items: [{ label: '已领取', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                          onClick: () => handleStatClick('received'),
                          activeColor: 'var(--color-primary)',
                          activeBg: 'rgba(45, 127, 249, 0.1)',
                        },
                        {
                          key: 'partial',
                          items: [{ label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('partial'),
                          activeColor: '#fa8c16',
                          activeBg: '#fff2e8',
                        },
                        {
                          key: 'completed',
                          items: [{ label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' }],
                          onClick: () => handleStatClick('completed'),
                          activeColor: 'var(--color-success)',
                          activeBg: 'rgba(34, 197, 94, 0.15)',
                        },
                        {
                          key: 'overdue',
                          items: [{ label: '逆期未到', value: overdueCount, unit: '条', color: 'var(--error-color, #ff4d4f)' }],
                          onClick: () => handleStatClick('overdue'),
                          activeColor: 'var(--error-color, #ff4d4f)',
                          activeBg: '#fff1f0',
                        },
                      ]}
                    />

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={() => {
                        const params = new URLSearchParams(location.search);
                        const orderNo = (params.get('orderNo') || '').trim();
                        setQueryParams({ page: 1, pageSize: 10, orderNo, materialType: '' });
                      }}
                      onExport={handleExport}
                      onAdd={() => openDialog('create')}
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
                      onRefresh={() => setQueryParams(p => ({ ...p }))}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      purchaseSortField={purchaseSortField}
                      purchaseSortOrder={purchaseSortOrder}
                      onPurchaseSort={handlePurchaseSort}
                      isOrderFrozenForRecord={isOrderFrozenForRecord}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <PurchaseModal
          visible={visible}
          dialogMode={dialogMode}
          onCancel={closeDialog}
          modalWidth={modalWidth as any}
          modalInitialHeight={modalInitialHeight}
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
          onReceiveAll={handleReceiveAll}
          onBatchReturn={handleBatchReturn}
          isSamplePurchase={isSamplePurchaseView}
          onGeneratePurchaseSheet={openPurchaseSheet}
          onDownloadPurchaseSheet={downloadPurchaseSheet}
          onSaveCreate={handleSubmit}
          onSavePreview={handleSavePreview}
          isOrderFrozenForRecord={isOrderFrozenForRecord}
        />

        <ResizableModal
          open={returnConfirmModal.visible}
          title="回料确认"
          okText="确认回料"
          cancelText="取消"
          width={isMobile ? '96vw' : 570}
          centered
          onCancel={() => {
            returnConfirmModal.close();
            returnConfirmForm.resetFields();
          }}
          okButtonProps={{ loading: returnConfirmSubmitting }}
          onOk={submitReturnConfirm}
          destroyOnHidden
          autoFontSize={false}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          scaleWithViewport
        >
          <Form form={returnConfirmForm} layout="vertical" preserve={false}>
            <div style={{ marginBottom: 12, color: 'var(--neutral-text)' }}>
              确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
            </div>
            <ResizableTable
              storageKey="material-purchase-return"
              dataSource={(returnConfirmModal.data || []).map((t, idx) => ({
                key: String(t?.id || idx),
                id: t?.id,
                materialName: t?.materialName,
                materialCode: t?.materialCode,
                purchaseQuantity: Number(t?.purchaseQuantity || 0) || 0,
                arrivedQuantity: Number(t?.arrivedQuantity || 0) || 0,
                returnQuantity: t?.returnQuantity,
                index: idx,
              }))}
              columns={[
                {
                  title: '物料',
                  dataIndex: 'materialName',
                  key: 'materialName',
                  render: (_, record) => (
                    <>
                      <div style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{String(record.materialName || '-')}</div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>{String(record.materialCode || '')}</div>
                      <Form.Item name={['items', record.index, 'purchaseId']} initialValue={String(record.id || '')} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'purchaseQuantity']} initialValue={record.purchaseQuantity} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'arrivedQuantity']} initialValue={record.arrivedQuantity} hidden>
                        <Input />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  title: '采购数',
                  dataIndex: 'purchaseQuantity',
                  key: 'purchaseQuantity',
                  width: 100,
                  align: 'right' as const,
                },
                {
                  title: '到货数',
                  dataIndex: 'arrivedQuantity',
                  key: 'arrivedQuantity',
                  width: 100,
                  align: 'right' as const,
                },
                {
                  title: '实际回料数',
                  key: 'returnQuantity',
                  width: 180,
                  align: 'right' as const,
                  render: (_, record) => {
                    const max = record.arrivedQuantity > 0 ? record.arrivedQuantity : record.purchaseQuantity;
                    return (
                      <Form.Item
                        name={['items', record.index, 'returnQuantity']}
                        initialValue={Number(record.returnQuantity || 0) || (max || 0)}
                        style={{ margin: 0 }}
                        rules={[
                          { required: true, message: '请输入实际回料数量' },
                          {
                            validator: async (_, v) => {
                              const n = Number(v);
                              if (!Number.isFinite(n)) throw new Error('请输入数字');
                              if (n < 0) throw new Error('不能小于0');
                              if (!Number.isInteger(n)) throw new Error('请输入整数');
                              if (n > max) throw new Error(`不能大于${max}`);
                            },
                          },
                        ]}
                      >
                        <InputNumber min={0} precision={0} step={1} style={{ width: 140 }} />
                      </Form.Item>
                    );
                  },
                },
              ]}
              pagination={false}
              size="small"
              bordered
            />
          </Form>
        </ResizableModal>

        <ResizableModal
          open={returnResetModal.visible}
          title="退回回料确认"
          okText="确认退回"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: returnResetSubmitting }}
          width={isMobile ? '96vw' : 520}
          onCancel={() => {
            returnResetModal.close();
            returnResetForm.resetFields();
          }}
          onOk={submitReturnReset}
          destroyOnHidden
          autoFontSize={false}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          scaleWithViewport
        >
          <Form form={returnResetForm} layout="vertical" preserve={false}>
            <Form.Item
              name="reason"
              label="退回原因"
              rules={[{ required: true, message: '请输入退回原因' }]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          </Form>
        </ResizableModal>

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

        {/* 智能领取弹窗 */}
        <SmartReceiveModal
          open={smartReceiveOpen}
          orderNo={smartReceiveOrderNo}
          onCancel={() => setSmartReceiveOpen(false)}
          onSuccess={handleSmartReceiveSuccess}
          isSupervisorOrAbove={isSupervisorOrAbove}
          userId={String(user?.id || '').trim()}
          userName={String(user?.name || user?.username || '').trim()}
        />
    </Layout>
  );
};

export default MaterialPurchase;
