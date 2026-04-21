import React, { useState } from 'react';
import { Card, Input, Form, InputNumber, Tooltip, Upload, Button, message } from 'antd';
import { QuestionCircleOutlined, InboxOutlined, FileSearchOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import PageLayout from '@/components/common/PageLayout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import PurchaseModal from './components/PurchaseModal';
import MaterialPurchaseAIBanner from './components/MaterialPurchaseAIBanner';
import MaterialQualityIssueModal from './components/MaterialQualityIssueModal';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import '../../../styles.css';
import { useMaterialPurchase } from './hooks/useMaterialPurchase';
import { formatMaterialQuantity } from './utils';
import type { MaterialPurchase as MaterialPurchaseType } from '@/types/production';

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
    reloadCurrentDetail,
    isOrderFrozenForRecord,
    handleDeleteOrphan,
    handleExport,
    location,
    visible, dialogMode, currentPurchase,
    previewList, previewOrderId,
    form, materialDatabaseForm,
    submitLoading, modalInitialHeight,
    detailOrder, detailOrderLines, detailPurchases, detailLoading, detailSizePairs,
    detailFrozen,
    returnConfirmModal, returnConfirmForm, returnConfirmSubmitting,
    returnEvidenceFiles, setReturnEvidenceFiles, returnEvidenceRecognizing, recognizeReturnEvidence,
    returnResetModal, returnResetForm, returnResetSubmitting,
    quickEditModal, quickEditSaving,
    openDialog, openDialogSafe, closeDialog,
    handleSubmit, handleSavePreview,
    receivePurchaseTask, confirmReturnPurchaseTask,
    openReturnReset, submitReturnConfirm, submitReturnReset,
    handleReceiveAll, handleSmartReceiveSuccess: _handleSmartReceiveSuccess, handleBatchReturn,
    openPurchaseSheet, downloadPurchaseSheet,
    openQuickEditSafe, handleQuickEditSave,
    isSamplePurchaseView,
    confirmComplete, confirmCompleteSubmitting,
  } = useMaterialPurchase();

  // 本弹窗用于 AI 识别时传递给 recognizeReturnEvidence 的文件引用
  const [returnRecognizeFile, setReturnRecognizeFile] = useState<File | null>(null);
  const [qualityIssueOpen, setQualityIssueOpen] = useState(false);
  const [qualityIssuePurchase, setQualityIssuePurchase] = useState<MaterialPurchaseType | null>(null);
  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkOrderNo, setRemarkOrderNo] = useState('');

  return (
    <>
      {contextHolder}
      <Form form={form} component={false} />
      <Form form={materialDatabaseForm} component={false} />
        <PageLayout
          title="面料采购"
          headerContent={
            showSmartErrorNotice && smartError ? (
              <Card size="small" style={{ marginBottom: 12 }}>
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
                          activeColor: '#fa8c16',
                        },
                        {
                          key: 'completed',
                          items: [{ label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' }],
                          onClick: () => handleStatClick('completed'),
                          activeColor: 'var(--color-success)',
                        },
                        {
                          key: 'overdue',
                          items: [{ label: '逆期未到', value: overdueCount, unit: '条', color: 'var(--error-color, #ff4d4f)' }],
                          onClick: () => handleStatClick('overdue'),
                          activeColor: 'var(--error-color, #ff4d4f)',
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
                        setQueryParams((prev) => ({ page: 1, pageSize: prev.pageSize, orderNo, materialType: '', factoryType: '', sourceType: '', status: '' }));
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
                      onRemark={(record) => { setRemarkOrderNo(record.orderNo); setRemarkOpen(true); }}
                      onRefresh={() => setQueryParams(p => ({ ...p }))}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      purchaseSortField={purchaseSortField}
                      purchaseSortOrder={purchaseSortOrder}
                      onPurchaseSort={handlePurchaseSort}
                      isOrderFrozenForRecord={isOrderFrozenForRecord}
                      onDelete={handleDeleteOrphan}
                    />
        </PageLayout>

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
        />
        <MaterialQualityIssueModal
          open={qualityIssueOpen}
          purchase={qualityIssuePurchase}
          onChanged={async () => {
            await fetchMaterialPurchaseList();
            await reloadCurrentDetail();
          }}
          onClose={() => {
            setQualityIssueOpen(false);
            setQualityIssuePurchase(null);
          }}
        />

        <ResizableModal
          open={returnConfirmModal.visible}
          title="回料确认 / 追加回料"
          okText="提交回料"
          cancelText="取消"
          width={isMobile ? '96vw' : '60vw'}
          centered
          onCancel={() => {
            returnConfirmModal.close();
            returnConfirmForm.resetFields();
            setReturnRecognizeFile(null);
          }}
          okButtonProps={{ loading: returnConfirmSubmitting }}
          onOk={submitReturnConfirm}
          destroyOnHidden
          autoFontSize={false}
          initialHeight={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.78) : 700}
          scaleWithViewport
        >
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* 左侧：凭证上传 + AI识别 */}
            {!isMobile && (
              <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: 'var(--neutral-text)', fontSize: 'var(--font-size-sm)', marginBottom: 2 }}>
                  确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
                </div>
                <Upload.Dragger
                  accept="image/*"
                  multiple
                  maxCount={5}
                  fileList={returnEvidenceFiles}
                  onChange={({ fileList }) => setReturnEvidenceFiles(fileList)}
                  beforeUpload={(f) => {
                    setReturnRecognizeFile(f);
                    return false;
                  }}
                  listType="picture"
                  style={{ padding: '8px 4px' }}
                >
                  <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
                    <InboxOutlined style={{ fontSize: 24, color: 'var(--primary-color)' }} />
                  </p>
                  <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text)', margin: 0 }}>上传回料凭据图片</p>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-disabled)', margin: '2px 0 0' }}>支持多张，最多5张</p>
                </Upload.Dragger>
                <Button
                  type="dashed"
                  icon={<FileSearchOutlined />}
                  block
                  loading={returnEvidenceRecognizing}
                  disabled={!returnRecognizeFile}
                  onClick={async () => {
                    if (!returnRecognizeFile) return;
                    const orderNo = String(returnConfirmModal.data?.[0]?.orderNo || '');
                    const qtys = await recognizeReturnEvidence(returnRecognizeFile, orderNo);
                    if (!Object.keys(qtys).length) {
                      message.warning('未识别到匹配物料');
                      return;
                    }
                    const current = returnConfirmForm.getFieldValue('items') || [];
                    returnConfirmForm.setFieldsValue({
                      items: (current as Array<any>).map((it) => ({
                        ...it,
                        returnQuantity: qtys[String(it.purchaseId)] ?? it.returnQuantity,
                      })),
                    });
                    message.success(`AI已识别并填入 ${Object.keys(qtys).length} 项回料数量`);
                  }}
                >
                  {returnEvidenceRecognizing ? 'AI识别中…' : '上传单据·AI识别回料数'}
                </Button>
              </div>
            )}

            {/* 右侧：物料明细表 */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {isMobile && (
                <div style={{ marginBottom: 8, color: 'var(--neutral-text)', fontSize: 'var(--font-size-sm)' }}>
                  确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
                </div>
              )}
              <Form form={returnConfirmForm} layout="vertical" preserve={false}>
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
                      width: 90,
                      align: 'right' as const,
                      render: (v: number) => formatMaterialQuantity(v),
                    },
                    {
                      title: '到货数',
                      dataIndex: 'arrivedQuantity',
                      key: 'arrivedQuantity',
                      width: 90,
                      align: 'right' as const,
                      render: (v: number) => formatMaterialQuantity(v),
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
            </div>
          </div>
        </ResizableModal>

        <ResizableModal
          open={returnResetModal.visible}
          title="退回回料确认"
          okText="确认退回"
          cancelText="取消"
          okButtonProps={{ danger: true, type: 'default', loading: returnResetSubmitting }}
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
