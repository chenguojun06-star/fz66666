import React, { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Tag, Space, Spin, Alert, Row, Col, Dropdown, App } from 'antd';
import { PlusOutlined, PrinterOutlined, DownloadOutlined, ExportOutlined, ExclamationCircleOutlined, UploadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import MaterialQualityIssueModal from '../MaterialPurchase/components/MaterialQualityIssueModal';
import PurchaseDocRecognizeModal from '../MaterialPurchase/components/PurchaseDocRecognizeModal';
import { useViewport } from '@/utils/useViewport';
import { usePurchaseDetailPage } from './hooks/usePurchaseDetailPage';
import type { MaterialPurchase } from '@/types/production';
import { buildEditColumns, buildViewColumns } from './columns';
import MaterialSelectModal from './components/MaterialSelectModal';
import { ReceiveModal, InboundModal, ReturnConfirmModal } from './components/PurchaseActionModals';
import api from '@/utils/api';
import { confirmAction } from '@/utils/confirm';
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
    colorList, isMultiColor, canProcure, bomIncomplete, missingColors,
    loadData,
  } = usePurchaseDetailPage(styleNo, orderNo, sampleMode);

  const [docRecognizeOpen, setDocRecognizeOpen] = useState(false);
  const [batchPurchaseLoading, setBatchPurchaseLoading] = useState(false);
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [generatingFromBom, setGeneratingFromBom] = useState(false);
  const { message } = App.useApp();

  const onBatchPurchase = async () => {
    setBatchPurchaseLoading(true);
    try { await handleBatchReceive(); }
    finally { setBatchPurchaseLoading(false); }
  };

  const onBatchReturnConfirm = async () => {
    setBatchReturnLoading(true);
    try { await handleBatchReturnConfirm(); }
    finally { setBatchReturnLoading(false); }
  };

  const onExport = async () => {
    setExportLoading(true);
    try { await handleExport(); }
    finally { setExportLoading(false); }
  };

  // 从BOM生成采购单：调用 /style/bom/generate-purchase 接口
  // 把样衣详情的BOM物料需求同步到采购管理，实现数据互通
  const effectiveStyleId = propStyleId ?? headerStyleId;
  const handleGenerateFromBom = async () => {
    const sid = Number(effectiveStyleId);
    if (!Number.isFinite(sid) || sid <= 0) {
      message.error('无效的款式ID，无法从BOM生成采购单');
      return;
    }

    const doGenerate = async (force: boolean) => {
      setGeneratingFromBom(true);
      try {
        const result = await api.post<{ code: number; message: string; data: number }>('/style/bom/generate-purchase', {
          styleId: sid,
          force,
        });
        if (result.code === 200) {
          const count = Number(result.data) || 0;
          message.success(`成功从BOM生成 ${count} 条物料采购记录`);
          await loadData();
          return;
        }

        const errorMessage = String(result.message || '生成失败');
        if (errorMessage.includes('已生成过') && !force) {
          confirmAction(
            '已存在样衣采购记录',
            '该款式已生成过样衣采购记录。是否删除旧的【待采购】记录并重新生成？（已领取/已完成的记录不会被删除）',
            () => doGenerate(true),
            { okText: '重新生成', danger: true },
          );
          return;
        }

        message.error(errorMessage);
      } catch (error: unknown) {
        message.error(`生成失败：${error instanceof Error ? error.message : '请求失败'}`);
      } finally {
        setGeneratingFromBom(false);
      }
    };

    confirmAction(
      '确认从BOM生成采购单',
      `将根据样衣BOM物料需求生成物料采购记录，实现BOM与采购数据互通，是否继续？`,
      () => doGenerate(false),
    );
  };

  const displayData = editing ? editableData : purchaseList;

  const viewColumnsMobile = isMobile;
  const colWidth = viewColumnsMobile ? 80 : undefined;

  const editColumns = buildEditColumns({
    isMultiColor, colorList,
    handleUpdateRow, handleOpenMaterialModal, handleRemoveRow,
  });

  const viewColumns = buildViewColumns({
    colWidth, editing, canProcure,
    handleStartEdit, handleDelete,
    openReceive, openInbound,
    handleReturnConfirm, handleReturnReset, handleCancelReceive,
    handleWarehousePick: _handleWarehousePick,
    setQualityIssueRecord, setQualityIssueVisible,
  });

  const columns = editing ? editColumns : viewColumns;

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 12 : 24) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Button onClick={() => embedded && onClose ? onClose() : navigate(-1)}>返回</Button>
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>{sampleMode ? '采购管理' : '订单物料采购明细'}</h2>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : !order ? (
        <Card style={{ marginBottom: 16 }}>
          {!sampleMode && (
            <Alert title="订单不存在或已删除" description={`款号: ${styleNo || '未知'}。该款号的订单可能已被删除。`} type="warning" showIcon />
          )}
          {purchaseList.length > 0 && (
            <div style={{ marginTop: sampleMode ? 0 : 12, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
              <div><strong>款号：</strong>{styleNo || '-'}</div>
              <div><strong>采购单数：</strong>{purchaseList.length} 个</div>
              <div style={{ marginTop: 4 }}><strong>物料到货率：</strong><Tag color={materialArrivalRate >= 100 ? 'green' : materialArrivalRate >= 50 ? 'orange' : 'red'}>{materialArrivalRate}%</Tag></div>
            </div>
          )}
        </Card>
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
              请点击「编辑面辅料」为每个颜色分别添加面料信息。
            </span>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <Card
        title={`面辅料信息（共 ${displayData.length} 项）`}
        loading={loading}
        styles={{ body: { padding: '0 16px 16px' } }}
        extra={
          <Space wrap>
            <Button icon={<UploadOutlined />} onClick={() => setDocRecognizeOpen(true)} size="small">
              上传采购单
            </Button>
            <Button onClick={onBatchPurchase} disabled={!canProcure} loading={batchPurchaseLoading} title={!canProcure ? '请先完善面辅料信息再批量采购' : ''} size="small">
              批量采购
            </Button>
            <Button onClick={onBatchReturnConfirm} loading={batchReturnLoading} size="small">
              批量回料确认
            </Button>
            <Button onClick={handleConfirmComplete} loading={confirmCompleteSubmitting} size="small">确认回料完成</Button>
            <Dropdown menu={{
              items: [
                { key: 'print', label: '打印采购单', icon: <PrinterOutlined />, onClick: () => {
                  const w = window.open('', '_blank');
                  if (!w) return;
                  const rows = purchaseList.map((p) => `<tr><td>${getMaterialTypeLabel(p.materialType)}</td><td>${p.materialName || ''}</td><td>${p.purchaseQuantity || ''}</td><td>${p.arrivedQuantity || ''}</td><td>${p.supplierName || ''}</td><td>${p.status || ''}</td></tr>`).join('');
                  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>采购单 ${styleNo}</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid var(--color-zinc-300);padding:6px 8px}</style></head><body><h2>采购单 - ${styleNo}</h2><table><tr><th>物料类型</th><th>物料名称</th><th>采购数量</th><th>到货数量</th><th>供应商</th><th>状态</th></tr>${rows}</table></body></html>`);
                  w.document.close();
                  w.print();
                }},
                { key: 'download', label: '下载采购单', icon: <DownloadOutlined />, onClick: handleExport },
              ],
            }}>
              <Button size="small">采购单生成</Button>
            </Dropdown>
            <Button icon={<ExportOutlined />} onClick={onExport} loading={exportLoading} size="small">导出</Button>
            {editing ? (
              <>
                <Button type="dashed" icon={<PlusOutlined />} onClick={handleAddRow} size="small">
                  添加物料
                </Button>
                <Button loading={saving} onClick={handleSaveAll} size="small">
                  保存
                </Button>
                <Button onClick={handleCancelEdit} size="small">
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button icon={<PlusOutlined />} onClick={handleStartEdit} size="small">
                  编辑面辅料
                </Button>
                {bomIncomplete && (
                  <Tag icon={<ExclamationCircleOutlined />} color="warning">
                    {isMultiColor ? '多颜色订单需完善面辅料信息后才可采购' : '请完善面辅料信息'}
                  </Tag>
                )}
              </>
            )}
          </Space>
        }
      >
        {displayData.length === 0 && !editing ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Alert
              type={sampleMode && effectiveStyleId ? 'warning' : 'info'}
              showIcon
              title={sampleMode && effectiveStyleId ? '该款式尚未生成采购单' : '该订单尚未创建面辅料信息'}
              description={sampleMode && effectiveStyleId
                ? '该样衣已配置BOM物料需求，但尚未同步到采购管理。可一键从BOM生成采购单，实现数据互通；或手动创建面辅料信息。'
                : isMultiColor
                  ? `订单包含 ${colorList.length} 种颜色（${colorList.join('、')}），需要为每种颜色分别创建对应的面辅料记录。`
                  : `请为订单创建面辅料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。`
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                <Space direction="vertical" size={8}>
                  {sampleMode && effectiveStyleId && (
                    <Button
                      type="primary"
                      size="small"
                      icon={<ThunderboltOutlined />}
                      loading={generatingFromBom}
                      onClick={handleGenerateFromBom}
                    >
                      从BOM生成采购单
                    </Button>
                  )}
                  <Button size="small" onClick={handleStartEdit}>
                    手动创建面辅料
                  </Button>
                </Space>
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

      <PurchaseDocRecognizeModal
        open={docRecognizeOpen}
        orderNo={orderNo || undefined}
        onCancel={() => setDocRecognizeOpen(false)}
        onSuccess={async () => {
          setDocRecognizeOpen(false);
          await loadData();
        }}
      />
    </div>
  );
};

export default MaterialPurchaseDetail;
