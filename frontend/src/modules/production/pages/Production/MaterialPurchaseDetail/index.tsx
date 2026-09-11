import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Tag, Space, Alert, Row, Col, App, Tooltip } from 'antd';
import { ExportOutlined, ExclamationCircleOutlined, UploadOutlined, FileImageOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import SkeletonLoader from '@/components/common/SkeletonLoader';
import api from '@/utils/api';
import { buildStockMap } from '@/components/common/NodeDetailModal/utils';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { PurchaseActionBar, PurchaseEditActions } from '@/components/common/purchase/PurchaseActionBar';
import MaterialQualityIssueModal from '../MaterialPurchase/components/MaterialQualityIssueModal';
import PurchaseDocDrawer from '../MaterialPurchase/components/PurchaseDocDrawer';
import { useUser } from '@/utils/AuthContext';
import { useViewport } from '@/utils/useViewport';
import { usePurchaseDetailPage } from './hooks/usePurchaseDetailPage';
import type { MaterialPurchase } from '@/types/production';
import { buildEditColumns, buildViewColumns } from './columns';
import MaterialSelectModal from './components/MaterialSelectModal';
import BatchPurchaseModal, { type BatchPurchaseItem } from './components/BatchPurchaseModal';
import SizeUsageSummaryPanel from './components/SizeUsageSummaryPanel';
import PurchasePrintModal from './components/PurchasePrintModal';
import ConfirmCompleteModal from '../MaterialPurchase/components/ConfirmCompleteModal';
import type { ConfirmCompleteOptions } from '../MaterialPurchase/hooks/usePurchaseConfirmCompleteActions';
import { ReceiveModal, InboundModal, ReturnConfirmModal } from './components/PurchaseActionModals';
import { filterPendingPurchases, filterReturnablePurchases, filterAwaitingConfirmPurchases } from './hooks/utils';
import { isPurchaseRowComplete } from './hooks/types';
import { getMaterialTypeLabel } from '@/utils/materialType';

export interface MaterialPurchaseDetailProps {
  styleNo?: string;
  orderNo?: string;
  embedded?: boolean;
  onClose?: () => void;
  /** 样衣采购场景：无生产订单，跳过订单查询与警告，标题改为"采购管理" */
  sampleMode?: boolean;
  /** 样衣款式ID，用于从BOM生成采购单 */
  styleId?: string | number;
}

const MaterialPurchaseDetail: React.FC<MaterialPurchaseDetailProps> = ({ styleNo: propStyleNo, orderNo: propOrderNo, embedded, onClose, sampleMode, styleId: propStyleId }) => {
  const { styleNo: styleNoParam } = useParams<{ styleNo: string }>();
  const [searchParams] = useSearchParams();
  const orderNo = propOrderNo ?? searchParams.get('orderNo') ?? '';
  const styleNo = propStyleNo ?? styleNoParam ?? '';
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const { message } = App.useApp();
  const { user } = useUser();

  const {
    loading, order, purchaseList, materialArrivalRate,
    receiveForm, returnConfirmForm, inboundForm,
    receiveVisible, setReceiveVisible, receiveRecord, receiveLoading,
    inboundVisible, setInboundVisible, inboundRecord,
    returnConfirmVisible, setReturnConfirmVisible, returnConfirmRecord, returnConfirmLoading,
    qualityIssueVisible, setQualityIssueVisible, qualityIssueRecord, setQualityIssueRecord,
    confirmCompleteSubmitting,
    handleDelete,
    openReceive, handleReceive,
    openInbound, doInbound,
    handleReturnConfirm, doReturnConfirm, handleCancelReceive,
    handleBatchReceive, handleBatchReturnConfirm, handleConfirmComplete,
    handleReturnReset, handleWarehousePick: _handleWarehousePick,
    handleExport,
    headerOrderNo, headerStyleNo, headerStyleName, headerStyleId, headerStyleCover, headerColor,
    editing, editableData, saving,
    handleStartEdit, handleCancelEdit, handleAddRow,
    handleUpdateRow, handleRemoveRow, handleSaveAll,
    materialModalOpen, setMaterialModalOpen,
    handleOpenMaterialModal, handleUseMaterial, handleCreateMaterial,
    colorList, isMultiColor, bomIncomplete, missingColors,
    sampleBomLocked, sampleBomCompletedTime,
    sampleOrderLines,
    loadData,
  } = usePurchaseDetailPage(styleNo, orderNo, sampleMode, propStyleId);

  const [docDrawerOpen, setDocDrawerOpen] = useState(false);
  // D-360h：确认完成时选择物料去向（入库到仓库/直接使用/暂不登记）
  const [confirmCompleteModalOpen, setConfirmCompleteModalOpen] = useState(false);
  const [confirmCompleteSubmittingLocal, setConfirmCompleteSubmittingLocal] = useState(false);
  const [batchPurchaseLoading, setBatchPurchaseLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printAutoDownload, setPrintAutoDownload] = useState(false);

  // D-272：仓库库存映射——「出库领取」只在仓库真有库存（做过入库）时显示。
  // 直采直用（登记到货但未入库）的采购不该出现该按钮，误点必报"仓库库存不足"。
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  useEffect(() => {
    const no = String(orderNo || '').trim();
    const sn = String(styleNo || '').trim();
    if (!no && !sn) return;
    api
      .get<any>('/production/purchase/smart-receive-preview', { params: no ? { orderNo: no } : { styleNo: sn } })
      .then((res: any) => {
        const materials: any[] = res?.data?.materials || res?.materials || [];
        setStockMap(buildStockMap(materials));
      })
      .catch(() => setStockMap({}));
  }, [orderNo, styleNo]);
  const [batchPurchaseOpen, setBatchPurchaseOpen] = useState(false);
  const [batchPurchaseItems, setBatchPurchaseItems] = useState<BatchPurchaseItem[]>([]);
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);

  /** 批量采购入口（D-104）：校验后打开可编辑确认弹窗（物料编码/规格/单价/供应商全展示，数量可调） */
  const onBatchPurchase = () => {
    // 修复：只批量领取本体信息完整的行（缺编码/名称/单位的行跳过并提示，不再一票否决整单）
    const allPending = filterPendingPurchases(purchaseList);
    const pending = allPending.filter((p) => isPurchaseRowComplete(p));
    const skipped = allPending.length - pending.length;
    if (!pending.length) {
      message.warning(allPending.length > 0 ? '待采购物料均缺少物料编码/名称/单位，请先编辑补全' : '没有待采购的项目');
      return;
    }
    if (skipped > 0) {
      message.info(`已跳过 ${skipped} 项信息不全物料（缺编码/名称/单位）`);
    }
    setBatchPurchaseItems(pending.map((p) => ({
      id: String(p.id),
      materialType: p.materialType,
      materialName: p.materialName || p.materialCode,
      materialCode: p.materialCode || '',
      specifications: p.specifications,
      color: p.color,
      unit: p.unit,
      unitPrice: p.unitPrice != null ? Number(p.unitPrice) : undefined,
      supplierName: p.supplierName,
      requiredQty: Number(p.purchaseQuantity) || 0,
    })));
    setBatchPurchaseOpen(true);
  };

  const onBatchPurchaseConfirm = async (editedQty: Record<string, number>) => {
    setBatchPurchaseLoading(true);
    try {
      await handleBatchReceive(purchaseList.filter((p) => editedQty[String(p.id)] !== undefined), editedQty);
      setBatchPurchaseOpen(false);
    } finally {
      setBatchPurchaseLoading(false);
    }
  };

  const submitConfirmCompleteLocal = async (options: ConfirmCompleteOptions) => {
    const targets = filterAwaitingConfirmPurchases(purchaseList);
    if (!targets.length) { message.info('没有待确认完成的采购项目'); return; }
    setConfirmCompleteSubmittingLocal(true);
    try {
      for (const t of targets) {
        const payload: Record<string, unknown> = { purchaseId: String(t.id) };
        if (options.movementAction !== 'none') {
          payload.movementAction = options.movementAction;
          if (targets.length === 1 && options.movementQuantity) payload.movementQuantity = options.movementQuantity;
          if (options.movementAction === 'inbound' && options.warehouseLocation) payload.warehouseLocation = options.warehouseLocation;
          if (options.movementAction === 'direct_use' && options.receiverName) payload.receiverName = options.receiverName;
        }
        await api.post('/production/purchase/confirm-complete', payload);
      }
      const actionText = options.movementAction === 'inbound' ? '，已登记入库'
        : options.movementAction === 'direct_use' ? '，已记采购直用流水' : '';
      message.success(`确认完成成功${actionText}`);
      setConfirmCompleteModalOpen(false);
      await loadData();
    } catch (e) {
      message.error(e instanceof Error ? e.message : '确认完成失败');
    } finally {
      setConfirmCompleteSubmittingLocal(false);
    }
  };

  const onBatchReturnConfirm = async () => {
    setBatchReturnLoading(true);
    try { await handleBatchReturnConfirm(); }
    finally { setBatchReturnLoading(false); }
  };

  const onExport = async () => { await handleExport(); };

  const displayData = editing ? editableData : purchaseList;

  /** 批量采购可用：存在至少一行"待采购且本体信息完整"的物料（缺编码/名称/单位的行自动跳过） */
  const batchPurchaseDisabled = !filterPendingPurchases(purchaseList).some((p) => isPurchaseRowComplete(p));
  // D-122：批量动作与单条操作条件联动——无符合行时按钮置灰（与行级 disabled 同一判定源）
  const hasReturnable = filterReturnablePurchases(purchaseList).length > 0;
  const hasAwaitingConfirm = filterAwaitingConfirmPurchases(purchaseList).length > 0;

  const viewColumnsMobile = isMobile;
  const colWidth = viewColumnsMobile ? 80 : undefined;

  const editColumns = buildEditColumns({
    isMultiColor, colorList,
    handleUpdateRow, handleOpenMaterialModal, handleRemoveRow,
  });

  const viewColumns = buildViewColumns({
    colWidth, editing, sampleMode,
    locked: sampleBomLocked,
    stockMap,
    handleStartEdit, handleDelete,
    openReceive, openInbound,
    handleReturnConfirm, handleReturnReset, handleCancelReceive,
    handleWarehousePick: _handleWarehousePick,
    setQualityIssueRecord, setQualityIssueVisible,
  });

  const columns = editing ? editColumns : viewColumns;

  // D-124：任一行已回料确认 → 整表编辑面辅料锁定（与大货 Drawer hasReturnConfirmed 同规则）
  const hasReturnConfirmedRow = purchaseList.some((p) => Number((p as any)?.returnConfirmed || 0) === 1);
  const toolbarEditLocked = sampleBomLocked || hasReturnConfirmedRow;
  const toolbarEditLockTitle = sampleBomLocked
    ? '物料清单已完成，请先在样衣详情-物料清单退回'
    : (hasReturnConfirmedRow ? '已有物料回料确认，如需调整请先在操作中退回' : undefined);

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 12 : 24) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          {!embedded && (
            <Button onClick={() => navigate(-1)}>返回</Button>
          )}
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>{sampleMode ? '采购管理' : '订单物料采购明细'}</h2>
        </Space>
      </div>

      {loading ? (
        <SkeletonLoader type="table" rows={6} />
      ) : !order ? (
        <>
          {/* D-364：样衣采购（无生产订单）也要有完整款式信息头，与大货/节点弹窗同款布局 */}
          {sampleMode ? (
            <Card
              style={{ marginBottom: 16 }}
              extra={
                sampleBomLocked ? (
                  <Tooltip
                    title={`物料清单已完成${sampleBomCompletedTime ? `（${sampleBomCompletedTime}）` : ''}，采购数据已锁定。如需修改物料（编辑/删除/新增），请先到样衣详情 → 物料清单点击「退回」，退回后此处自动解锁。收货、回料确认等采购执行操作不受影响。`}
                  >
                    <ExclamationCircleOutlined style={{ color: 'var(--color-success)', fontSize: 16, cursor: 'pointer' }} />
                  </Tooltip>
                ) : null
              }
            >
              <ProductionOrderHeader
                order={null}
                orderLines={sampleOrderLines.length ? (sampleOrderLines as any) : undefined}
                styleNo={headerStyleNo}
                styleName={headerStyleName}
                styleId={headerStyleId ?? propStyleId}
                styleCover={headerStyleCover}
                color={headerColor}
                coverSize={160}
                showOrderNo={false}
                hideSizeBlockWhenNoRealSize
              />
              <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
                <Col xs={24} sm={8} md={6}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>来源</div>
                  <div><Tag color="blue">样衣(开发)</Tag></div>
                </Col>
                <Col xs={24} sm={8} md={6}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>采购单数</div>
                  <div>{purchaseList.length} 个</div>
                </Col>
                <Col xs={24} sm={8} md={6}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>物料到货率</div>
                  <div><Tag color={materialArrivalRate >= 100 ? 'green' : materialArrivalRate >= 50 ? 'orange' : 'red'}>{materialArrivalRate}%</Tag></div>
                </Col>
                <Col xs={24} sm={8} md={6}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>BOM 状态</div>
                  <div>{sampleBomLocked ? <Tag color="success">已完成 · 已锁定</Tag> : <Tag color="default">未完成</Tag>}</div>
                </Col>
              </Row>
            </Card>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
              marginBottom: 16, padding: '10px 14px',
              border: '1px solid var(--color-border)', borderRadius: 12,
              fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)',
            }}>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>款号：</strong>{styleNo || '-'}</span>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>采购单数：</strong>{purchaseList.length} 个</span>
              <span><strong style={{ color: 'var(--color-text-primary)' }}>到货率：</strong>
                <Tag color={materialArrivalRate >= 100 ? 'green' : materialArrivalRate >= 50 ? 'orange' : 'red'}>{materialArrivalRate}%</Tag>
              </span>
            </div>
          )}
          {purchaseList.length === 0 && !sampleMode ? (
            <Alert title="订单不存在或已删除" description={`款号: ${styleNo || '未知'}。该款号的订单可能已被删除。`} type="warning" showIcon style={{ marginBottom: 16 }} />
          ) : null}
        </>
      ) : (
        <Card style={{ marginBottom: 16 }}>
          <ProductionOrderHeader order={order} orderNo={headerOrderNo} styleNo={headerStyleNo} styleName={headerStyleName} styleId={headerStyleId} styleCover={headerStyleCover} color={headerColor} coverSize={160} />
          <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
            <Col xs={24} sm={8} md={6}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>工厂</div>
              <div>{order?.factoryName || '-'}</div>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>采购单数</div>
              <div>{purchaseList.length} 个</div>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>物料到货率</div>
              <div><Tag color={materialArrivalRate >= 100 ? 'green' : materialArrivalRate >= 50 ? 'orange' : 'red'}>{materialArrivalRate}%</Tag></div>
            </Col>
            <Col xs={24} sm={8} md={6}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>回料完成状态</div>
              <div>{order?.procurementManuallyCompleted === 1 ? <Tag color="success">已确认</Tag> : materialArrivalRate >= 95 ? <Tag color="success">已自动完成</Tag> : <Tag color="default">未确认</Tag>}</div>
            </Col>
          </Row>
        </Card>
      )}

      {missingColors.length > 0 && (
        <Alert
          type="warning"
          showIcon
          title="颜色覆盖不完整"
          description={
            <span>
              订单包含 <strong>{colorList.length}</strong> 种颜色（{colorList.join('、')}），
              但以下颜色缺少采购物料记录：<strong style={{ color: 'var(--color-error)' }}>{missingColors.join('、')}</strong>。
              请点击「编辑物料」为每个颜色分别添加面料信息。
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {!sampleMode && order?.id ? (
        <SizeUsageSummaryPanel orderId={order.id} purchaseList={purchaseList} />
      ) : null}

      <Card
        title={`面辅料信息（共 ${displayData.length} 项）`}
        loading={loading}
        styles={{ body: { padding: '0 16px 16px' } }}
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
                  disabled: batchPurchaseDisabled || batchPurchaseLoading,
                  loading: batchPurchaseLoading,
                  title: batchPurchaseDisabled ? '无可领取项' : '打开可编辑确认弹窗，逐行核对数量后领取',
                  onClick: onBatchPurchase,
                }}
                batchReturn={{
                  disabled: batchReturnLoading || !hasReturnable,
                  loading: batchReturnLoading,
                  title: hasReturnable ? undefined : '无可确认项',
                  onClick: onBatchReturnConfirm,
                }}
                confirmComplete={{
                  disabled: confirmCompleteSubmitting || !hasAwaitingConfirm,
                  loading: confirmCompleteSubmitting,
                  title: hasAwaitingConfirm ? undefined : '无待完成项',
                  onClick: () => setConfirmCompleteModalOpen(true),
                }}
                edit={{
                  disabled: toolbarEditLocked,
                  title: toolbarEditLockTitle,
                  onClick: handleStartEdit,
                }}
                extraTags={
                  hasReturnConfirmedRow ? (
                    <Tag color="success">已回料确认 · 编辑已锁定</Tag>
                  ) : bomIncomplete ? (
                    <Tag icon={<ExclamationCircleOutlined />} color="warning">
                      {isMultiColor ? '部分物料信息不全（缺供应商可领取，缺编码/名称/单位需补全）' : '部分物料信息不全：缺供应商仍可领取，缺编码/名称/单位的行需补全'}
                    </Tag>
                  ) : null
                }
                sheet={{
                  disabled: loading || !purchaseList.length,
                  onPrint: () => setPrintOpen(true),
                  onDownload: () => { setPrintAutoDownload(true); setPrintOpen(true); },
                }}
                extraButtons={(
                  <>
                    {/* D-360f：上传+查看合并一个入口（50%侧滑抽屉，含历史单据与上传识别） */}
                    {(orderNo || headerStyleNo) ? (
                      <Button size="small" icon={<FileImageOutlined />} onClick={() => setDocDrawerOpen(true)}>
                        采购单据
                      </Button>
                    ) : null}
                    <Button size="small" icon={<ExportOutlined />} onClick={onExport}>
                      导出
                    </Button>
                  </>
                )}
              />
            </Space>
          )
        }
      >
        {displayData.length === 0 && !editing ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Alert
              type="info"
              showIcon
              title={sampleMode ? '该款式暂无物料清单' : '该订单尚未创建面辅料信息'}
              description={sampleMode
                ? '请先在样衣详情页配置物料清单，配置后打开采购管理将自动同步物料数据。'
                : isMultiColor
                  ? `订单包含 ${colorList.length} 种颜色（${colorList.join('、')}），需要为每种颜色分别创建对应的面辅料记录。`
                  : `请为订单编辑物料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。`
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                !sampleMode ? (
                  <Button size="small" onClick={handleStartEdit}>
                    编辑物料
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ResizableTable
            storageKey="material-purchase-detail-table"
            emptyDescription="暂无采购明细"
            columns={columns as any}
            dataSource={displayData}
            rowKey={(r: MaterialPurchase) => r.id || `${r.purchaseNo || ''}-${r.materialCode || ''}`}
            loading={loading}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={false}
          />
        )}
      </Card>

      <MaterialSelectModal
        open={materialModalOpen}
        onClose={() => setMaterialModalOpen(false)}
        onUseMaterial={handleUseMaterial}
        onCreateMaterial={handleCreateMaterial}
      />

      <ReceiveModal
        visible={receiveVisible}
        record={receiveRecord}
        form={receiveForm}
        loading={receiveLoading}
        onOk={handleReceive}
        onCancel={() => { setReceiveVisible(false); receiveForm.resetFields(); }}
      />

      <InboundModal
        visible={inboundVisible}
        record={inboundRecord}
        form={inboundForm}
        onOk={doInbound}
        onCancel={() => { setInboundVisible(false); inboundForm.resetFields(); }}
      />

      <ReturnConfirmModal
        visible={returnConfirmVisible}
        record={returnConfirmRecord}
        form={returnConfirmForm}
        loading={returnConfirmLoading}
        onOk={doReturnConfirm}
        onCancel={() => { setReturnConfirmVisible(false); returnConfirmForm.resetFields(); }}
      />

      <MaterialQualityIssueModal
        open={qualityIssueVisible}
        purchase={qualityIssueRecord}
        onChanged={() => { qualityIssueVisible && setQualityIssueVisible(false); }}
        onClose={() => { setQualityIssueVisible(false); setQualityIssueRecord(null); }}
      />

      <ConfirmCompleteModal
        visible={confirmCompleteModalOpen}
        targets={filterAwaitingConfirmPurchases(purchaseList)}
        submitting={confirmCompleteSubmittingLocal}
        onCancel={() => setConfirmCompleteModalOpen(false)}
        onConfirm={(options) => { void submitConfirmCompleteLocal(options); }}
      />

      <PurchaseDocDrawer
        open={docDrawerOpen}
        orderNo={orderNo || undefined}
        styleNo={orderNo ? undefined : (headerStyleNo || undefined)}
        onClose={() => setDocDrawerOpen(false)}
        onChanged={() => { void loadData(); }}
      />

      <BatchPurchaseModal
        open={batchPurchaseOpen}
        items={batchPurchaseItems}
        submitting={batchPurchaseLoading}
        onCancel={() => setBatchPurchaseOpen(false)}
        onConfirm={onBatchPurchaseConfirm}
      />

      <PurchasePrintModal
        open={printOpen}
        autoDownload={printAutoDownload}
        companyName={user?.tenantName}
        onClose={() => { setPrintOpen(false); setPrintAutoDownload(false); }}
        order={order}
        purchaseList={purchaseList}
        orderNo={headerOrderNo}
        styleNo={headerStyleNo}
        styleName={headerStyleName}
        styleCover={headerStyleCover}
        color={headerColor}
        materialArrivalRate={materialArrivalRate}
        orderLines={sampleOrderLines}
      />
    </div>
  );
};

export default MaterialPurchaseDetail;
