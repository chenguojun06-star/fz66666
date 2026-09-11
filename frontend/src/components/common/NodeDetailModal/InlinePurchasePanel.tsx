import React, { useMemo } from 'react';
import { Alert, App, Button, Card, Collapse, Form, Input, InputNumber, Space, Spin, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { buildColorSummary, buildPurchaseSheetHtml, getOrderQtyTotal } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import { safePrint } from '@/utils/safePrint';
import { PurchaseActionBar, PurchaseEditActions, PURCHASE_ACTION_LABELS } from '@/components/common/purchase/PurchaseActionBar';
import type { MaterialPurchase } from '@/types/production';
import { InlinePurchasePanelProps, normalizeStatus } from './InlinePurchasePanel.helpers';
import { isPurchaseRowComplete } from './utils';
import { buildDisplayColumns, buildEditColumns } from './InlinePurchasePanel.columns';
import MaterialPickerModal from './MaterialPickerModal';
import useInlinePurchaseData from './useInlinePurchaseData';

const InlinePurchasePanel: React.FC<InlinePurchasePanelProps> = (props) => {
  const {
    orderNo,
    sourceType = 'order',
    styleNo: propStyleNo,
    color: propColor,
    quantity: propQuantity,
    embedded,
  } = props;

  const { message } = App.useApp();
  const h = useInlinePurchaseData(props);
  const {
    purchases,
    order,
    orderLines,
    sizePairs,
    loading,
    stockMap,
    actionLoading,
    confirmCompleteLoading,
    editing,
    saving,
    materialModalOpen,
    receiveModalVisible,
    receiveModalRecord,
    inboundModalVisible,
    inboundModalRecord,
    returnModalVisible,
    returnModalRecord,
    receiveForm,
    inboundForm,
    returnForm,
    firstPurchase,
    orderColors,
    orderColorSet,
    missingColors,
    bomIncomplete,
    sections,
    displayData,
    navigate,
    handleCancelEdit,
    handleAddRow,
    handleUpdateRow,
    handleRemoveRow,
    handleSaveAll,
    handleOpenMaterialModal,
    handleUseMaterial,
    setMaterialModalOpen,
    handleReceive,
    doReceive,
    setReceiveModalVisible,
    handleInbound,
    doInbound,
    setInboundModalVisible,
    handleReceiveAll,
    handleConfirmReturn,
    doReturnConfirm,
    setReturnModalVisible,
    handleReturnReset,
    handleCancelReceive,
    handleBatchReturn,
    handleConfirmComplete,
    handleWarehousePick,
    handleQualityIssue,
    handleStartEdit,
  } = h;

  // 编辑模式列定义
  const editColumns = useMemo(
    () => buildEditColumns({ handleUpdateRow, handleOpenMaterialModal, handleRemoveRow, orderColors }),
    [handleUpdateRow, handleOpenMaterialModal, handleRemoveRow, orderColors]
  );

  // 展示模式列定义
  const columns = useMemo(
    () => buildDisplayColumns({
      handleReceive,
      handleInbound,
      handleConfirmReturn,
      handleReturnReset,
      handleCancelReceive,
      handleWarehousePick,
      handleQualityIssue,
      stockMap,
    }),
    [
      handleReceive,
      handleInbound,
      handleConfirmReturn,
      handleReturnReset,
      handleCancelReceive,
      handleWarehousePick,
      handleQualityIssue,
      stockMap,
    ]
  );

  // D-360c：节点弹窗补齐打印/下载采购单（与采购管理列表弹窗/物料详情页同一套前端生成逻辑）
  const handlePrintPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml(firstPurchase || null, order || null, orderLines, purchases, sizePairs);
    if (!safePrint(html, '采购单')) {
      message.error('打印失败，请重试');
    }
  };

  const handleDownloadPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml(firstPurchase || null, order || null, orderLines, purchases, sizePairs);
    const orderNoText = String(firstPurchase?.orderNo || orderNo || '').trim();
    const purchaseNo = String(firstPurchase?.purchaseNo || '').trim();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `采购单_${purchaseNo || orderNoText || 'sheet'}_${ts}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    message.success('采购单已下载');
  };

  return (
    <Spin spinning={loading}>
      {/* D-360g：嵌入 NodeDetailModal 时统一头由 NodeDetailBody 渲染，这里不再重复 */}
      {embedded ? null : (
      <ProductionOrderHeader
        order={order}
        orderLines={orderLines}
        orderNo={firstPurchase?.orderNo || orderNo}
        styleNo={firstPurchase?.styleNo || order?.styleNo || propStyleNo}
        styleName={firstPurchase?.styleName || order?.styleName}
        styleId={firstPurchase?.styleId || order?.styleId}
        styleCover={firstPurchase?.styleCover || order?.styleCover}
        color={String(order?.color || firstPurchase?.color || propColor || '').trim() || buildColorSummary(orderLines) || ''}
        sizeItems={sizePairs.map(x => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(orderLines) || propQuantity || 0}
        // 样衣模式没有订单号，隐藏"订单号"字段避免显示"订单号 -"
        showOrderNo={sourceType !== 'sample'}
        coverSize={80}
      />
      )}

      {missingColors.length > 0 && !editing && (
        <Alert
          type="warning"
          showIcon
          title="颜色覆盖不完整"
          description={
            <span>
              订单包含 <strong>{orderColorSet.size}</strong> 种颜色（{Array.from(orderColorSet).join('、')}），
              但以下颜色缺少采购物料记录：<strong style={{ color: 'var(--color-error)' }}>{missingColors.join('、')}</strong>。
              请前往<a href={`/production/material/${encodeURIComponent(String(order?.styleNo || firstPurchase?.styleNo || ''))}?orderNo=${encodeURIComponent(String(orderNo || ''))}`}>物料采购详情页</a>为每个颜色分别添加面料信息。
            </span>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Card
        size="small"
        title={`需要采购的面辅料（${displayData.length}项）`}
        loading={loading}
        extra={
          editing ? (
            <PurchaseEditActions
              onAdd={handleAddRow}
              onSave={handleSaveAll}
              saving={saving}
              onCancel={handleCancelEdit}
            />
          ) : (
            <Space wrap size={8}>
              <PurchaseActionBar
                receive={{
                  disabled: actionLoading || !purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING && isPurchaseRowComplete(p)),
                  loading: actionLoading,
                  onClick: handleReceiveAll,
                }}
                batchReturn={{
                  disabled: !purchases.some(p => {
                    const s = normalizeStatus(p.status);
                    return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
                      && Number(p?.returnConfirmed || 0) !== 1;
                  }),
                  loading: actionLoading,
                  onClick: handleBatchReturn,
                }}
                confirmComplete={{
                  disabled: !purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM),
                  loading: confirmCompleteLoading,
                  onClick: handleConfirmComplete,
                }}
                edit={{ onClick: handleStartEdit }}
                sheet={{
                  disabled: loading || !purchases.length,
                  onPrint: handlePrintPurchaseSheet,
                  onDownload: handleDownloadPurchaseSheet,
                }}
                linkAction={{
                  label: PURCHASE_ACTION_LABELS.goMaterialDetail,
                  onClick: () => navigate(`/production/material/${encodeURIComponent(String(order?.styleNo || firstPurchase?.styleNo || ''))}?orderNo=${encodeURIComponent(String(orderNo || ''))}`),
                }}
              />
              {bomIncomplete && (
                <Tag color="warning" style={{ marginLeft: 0 }}>
                  {(() => {
                    const noSupplier = purchases.filter(p => isPurchaseRowComplete(p) && !String(p.supplierName || '').trim());
                    const criticalMissing = purchases.filter(p => !isPurchaseRowComplete(p));
                    if (criticalMissing.length > 0) {
                      return `${criticalMissing.length} 项缺物料编码/名称/单位，无法领取`;
                    }
                    return noSupplier.length > 0 ? `${noSupplier.length} 项未填供应商，可领取建议补全` : '请先编辑物料信息';
                  })()}
                </Tag>
              )}
            </Space>
          )
        }
      >
        {editing ? (
          <ResizableTable<MaterialPurchase>
            rowKey={(r: MaterialPurchase) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
            dataSource={displayData}
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            emptyDescription="暂无采购明细"
            columns={editColumns}
          />
        ) : purchases.length === 0 && !loading ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Alert
              type="info"
              showIcon
              title="该订单尚未创建面辅料信息"
              description={
                orderColorSet.size > 1
                  ? `订单包含 ${orderColorSet.size} 种颜色（${Array.from(orderColorSet).join('、')}），点击「编辑物料」按钮为每种颜色创建对应的面辅料记录。`
                  : '点击上方「编辑物料」按钮，为订单添加面辅料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。'
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                <Button type="primary" size="small" onClick={handleStartEdit}>
                  编辑物料
                </Button>
              }
            />
          </div>
        ) : (
          <Collapse
            collapsible="icon"
            defaultActiveKey={sections.map(s => s.key)}
            items={sections.map(sec => ({
              key: sec.key,
              label: `${sec.title}（${sec.data.length}）`,
              children: (
                <ResizableTable<MaterialPurchase>
                  rowKey={(r: MaterialPurchase) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
                  dataSource={sec.data}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content' }}
                  emptyDescription="暂无采购明细"
                  columns={columns}
                />
              ),
            }))}
          />
        )}
      </Card>

      <MaterialPickerModal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        onPick={handleUseMaterial}
      />

      <ResizableModal
        title="领取到货"
        open={receiveModalVisible}
        onCancel={() => setReceiveModalVisible(false)}
        onOk={doReceive}
        width="40vw"
        destroyOnHidden
      >
        <Form form={receiveForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="物料">{receiveModalRecord?.materialName || receiveModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="物料编码">{receiveModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="颜色/规格">{`${receiveModalRecord?.color || '-'} / ${receiveModalRecord?.specifications || '-'}`}</Form.Item>
          <Form.Item label="采购数量">{receiveModalRecord?.purchaseQuantity || 0} {receiveModalRecord?.unit || ''}</Form.Item>
          <Form.Item
            label="实际到货数量"
            name="quantity"
            rules={[
              { required: true, message: '请输入实际到货数量' },
              { type: 'number', min: 1, message: '数量必须大于 0' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={1} precision={0} addonAfter={receiveModalRecord?.unit || ''} />
          </Form.Item>
        </Form>
      </ResizableModal>

      {/* 到货入库弹窗：将物料入库到仓库库存 */}
      <ResizableModal
        title="到货入库"
        open={inboundModalVisible}
        onCancel={() => setInboundModalVisible(false)}
        onOk={doInbound}
        width="40vw"
        destroyOnHidden
      >
        <Form form={inboundForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="物料">{inboundModalRecord?.materialName || inboundModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="物料编码">{inboundModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="颜色/规格">{`${inboundModalRecord?.color || '-'} / ${inboundModalRecord?.specifications || '-'}`}</Form.Item>
          <Form.Item label="采购数量">{inboundModalRecord?.purchaseQuantity || 0} {inboundModalRecord?.unit || ''}</Form.Item>
          <Form.Item label="已入库数量">{inboundModalRecord?.arrivedQuantity || 0} {inboundModalRecord?.unit || ''}</Form.Item>
          <Form.Item label="待入库数量">{inboundModalRecord ? Math.max(0, Number(inboundModalRecord.purchaseQuantity || 0) - Number(inboundModalRecord.arrivedQuantity || 0)) : 0} {inboundModalRecord?.unit || ''}</Form.Item>
          <Form.Item
            label="本次入库数量"
            name="arrivedQuantity"
            rules={[
              { required: true, message: '请输入入库数量' },
              { type: 'number', min: 1, message: '数量必须大于 0' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={1} precision={0} addonAfter={inboundModalRecord?.unit || ''} />
          </Form.Item>
          <Form.Item
            label="仓库库位"
            name="warehouseLocation"
          >
            <Input placeholder="请输入库位（如 A区-01）" />
          </Form.Item>
          <Form.Item
            label="备注"
            name="remark"
          >
            <Input.TextArea rows={3} placeholder="可选备注" />
          </Form.Item>
        </Form>
      </ResizableModal>

      <ResizableModal
        title="确认回料"
        open={returnModalVisible}
        onCancel={() => setReturnModalVisible(false)}
        onOk={doReturnConfirm}
        width="40vw"
        destroyOnHidden
      >
        <Form form={returnForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item label="物料">{returnModalRecord?.materialName || returnModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="物料编码">{returnModalRecord?.materialCode || '-'}</Form.Item>
          <Form.Item label="颜色/规格">{`${returnModalRecord?.color || '-'} / ${returnModalRecord?.specifications || '-'}`}</Form.Item>
          <Form.Item label="到货数量">{returnModalRecord?.arrivedQuantity || 0} {returnModalRecord?.unit || ''}</Form.Item>
          <Form.Item
            label="实际回料数量"
            name="quantity"
            rules={[
              { required: true, message: '请输入实际回料数量' },
              { type: 'number', min: 0, message: '不能为负数' },
            ]}
          >
            <InputNumber style={{ width: '100%' }} min={0} precision={0} addonAfter={returnModalRecord?.unit || ''} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </Spin>
  );
};

export default InlinePurchasePanel;
