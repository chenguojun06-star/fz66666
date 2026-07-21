import React, { useMemo } from 'react';
import { Alert, Button, Card, Collapse, Form, Input, InputNumber, Space, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { buildColorSummary, getOrderQtyTotal } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import type { MaterialPurchase } from '@/types/production';
import { InlinePurchasePanelProps, normalizeStatus } from './InlinePurchasePanel.helpers';
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
  } = props;

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
    editableData,
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
    canProcure,
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
      bomIncomplete,
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
      bomIncomplete,
    ]
  );

  return (
    <Spin spinning={loading}>
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
          <Space>
            {!editing && (
              <>
                <Button
                  type="primary"
                  size="small"
                  disabled={actionLoading || !purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING) || !canProcure}
                  loading={actionLoading}
                  onClick={handleReceiveAll}
                >
                  采购全部
                </Button>
                {bomIncomplete && (
                  <Tag color="warning" style={{ marginLeft: 4 }}>请先编辑物料信息</Tag>
                )}
                <Button
                  size="small"
                  disabled={!purchases.some(p => {
                    const s = normalizeStatus(p.status);
                    return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
                      && Number(p?.returnConfirmed || 0) !== 1;
                  })}
                  loading={actionLoading}
                  onClick={handleBatchReturn}
                >
                  回料确认
                </Button>
                <Button
                  size="small"
                  disabled={!purchases.some(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM)}
                  loading={confirmCompleteLoading}
                  onClick={handleConfirmComplete}
                >
                  确认完成
                </Button>
                <Button
                  size="small"
                  type="primary"
                  onClick={handleStartEdit}
                >
                  编辑物料
                </Button>
              </>
            )}
            {editing && (
              <>
                <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddRow} size="small">
                  添加物料
                </Button>
                <Button type="primary" loading={saving} onClick={handleSaveAll} size="small">
                  保存
                </Button>
                <Button onClick={handleCancelEdit} size="small">
                  取消
                </Button>
              </>
            )}
            <Button
              size="small"
              onClick={() => navigate(`/production/material/${encodeURIComponent(String(order?.styleNo || firstPurchase?.styleNo || ''))}?orderNo=${encodeURIComponent(String(orderNo || ''))}`)}
            >
              前往物料采购 →
            </Button>
          </Space>
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
        title="确认到货"
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
            <Input.TextArea rows={2} placeholder="可选备注" />
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
