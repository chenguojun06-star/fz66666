import React from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Tag, Space, Spin, Alert, Row, Col, InputNumber, Form, Dropdown } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PrinterOutlined, DownloadOutlined, ExportOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import ModalContentLayout from '@/components/common/ModalContentLayout';
import RowActions from '@/components/common/RowActions';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import PurchaseCreateForm from '../MaterialPurchase/components/PurchaseModal/PurchaseCreateForm';
import MaterialQualityIssueModal from '../MaterialPurchase/components/MaterialQualityIssueModal';
import { useViewport } from '@/utils/useViewport';
import { readPageSize } from '@/utils/pageSizeStore';
import { formatDateTime } from '@/utils/datetime';
import { formatMaterialQuantityWithUnit, getStatusConfig } from '../MaterialPurchase/utils';
import { usePurchaseDetailPage } from './hooks/usePurchaseDetailPage';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';

const MaterialPurchaseDetail: React.FC = () => {
  const { styleNo: styleNoParam } = useParams<{ styleNo: string }>();
  const [searchParams] = useSearchParams();
  const orderNo = searchParams.get('orderNo') || '';
  const styleNo = styleNoParam || '';
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const {
    loading, order, purchaseList, materialArrivalRate,
    form, receiveForm,
    addEditVisible, setAddEditVisible, editMode, submitLoading,
    receiveVisible, setReceiveVisible, receiveRecord, receiveLoading,
    qualityIssueVisible, setQualityIssueVisible, qualityIssueRecord, setQualityIssueRecord,
    confirmCompleteSubmitting,
    openAdd, openEdit, handleSave, handleDelete,
    openReceive, handleReceive,
    handleReturnConfirm, handleCancelReceive,
    handleBatchReceive, handleConfirmComplete,
    handleExport,
    headerOrderNo, headerStyleNo, headerStyleName, headerStyleId, headerStyleCover, headerColor,
  } = usePurchaseDetailPage(styleNo, orderNo);

  const columns: ColumnsType<MaterialPurchase> = [
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100, render: (v: string) => <MaterialTypeTag value={v} /> },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 140, ellipsis: true },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80, ellipsis: true },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 80, ellipsis: true },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, ellipsis: true },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: number) => Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-' },
    { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    {
      title: '金额', key: 'amount', width: 100, align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        const quantity = Number(r.purchaseQuantity || 0);
        const price = Number(r.unitPrice || 0);
        const total = quantity * price;
        return Number.isFinite(total) ? `¥${total.toFixed(2)}` : '-';
      },
    },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => <SupplierNameTooltip name={r.supplierName} contactPerson={(r as any).supplierContactPerson} contactPhone={(r as any).supplierContactPhone} />,
    },
    { title: '采购日期', dataIndex: 'receivedTime', key: 'receivedTime', width: 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    { title: '最新到货日期', dataIndex: 'expectedArrivalDate', key: 'expectedArrivalDate', width: 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 110,
      render: (status: string) => {
        const config = getStatusConfig(status as MaterialPurchase['status']);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作', key: 'action', width: 220, fixed: 'right' as const,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = String(record.status || '').toLowerCase();
        const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
        const isReceived = status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === 'received';
        const isPartial = status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.PARTIAL_ARRIVAL;
        const isCompleted = status === MATERIAL_PURCHASE_STATUS.COMPLETED || status === 'completed';
        const isCancelled = status === MATERIAL_PURCHASE_STATUS.CANCELLED || status === 'cancelled';

        return (
          <RowActions
            actions={[
              { key: 'edit', label: '编辑', onClick: () => openEdit(record), disabled: isCancelled },
              { key: 'delete', label: '删除', onClick: () => handleDelete(record), danger: true, disabled: isCancelled },
              ...(isPending || isReceived || isPartial ? [{ key: 'receive', label: isPending ? '采购/到货' : '追加到货', onClick: () => openReceive(record), primary: isPending }] : []),
              ...(!isPending && !isCancelled ? [{ key: 'return-confirm', label: '回料确认', onClick: () => handleReturnConfirm(record) }] : []),
              ...(!isPending && !isCompleted && !isCancelled ? [{ key: 'cancel-receive', label: '取消领取', onClick: () => handleCancelReceive(record), danger: true }] : []),
              { key: 'quality-issue', label: '品质异常', onClick: () => { setQualityIssueRecord(record); setQualityIssueVisible(true); } },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div style={{ padding: isMobile ? 12 : 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Button onClick={() => navigate(-1)}>返回</Button>
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>订单物料采购明细</h2>
        </Space>
        <Space>
          <Button type="primary" onClick={openAdd}>添加面辅料</Button>
          <Button onClick={handleBatchReceive}>批量采购</Button>
          <Button onClick={handleConfirmComplete} loading={confirmCompleteSubmitting}>确认回料完成</Button>
          <Dropdown menu={{
            items: [
              { key: 'print', label: '打印采购单', icon: <PrinterOutlined />, onClick: () => {
                const w = window.open('', '_blank');
                if (!w) return;
                const rows = purchaseList.map((p) => `<tr><td>${p.materialType || ''}</td><td>${p.materialName || ''}</td><td>${p.purchaseQuantity || ''}</td><td>${p.arrivedQuantity || ''}</td><td>${p.supplierName || ''}</td><td>${p.status || ''}</td></tr>`).join('');
                w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>采购单 ${styleNo}</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px}</style></head><body><h2>采购单 - ${styleNo}</h2><table><tr><th>物料类型</th><th>物料名称</th><th>采购数量</th><th>到货数量</th><th>供应商</th><th>状态</th></tr>${rows}</table></body></html>`);
                w.document.close();
                w.print();
              }},
              { key: 'download', label: '下载采购单', icon: <DownloadOutlined />, onClick: handleExport },
            ],
          }}>
            <Button>采购单生成</Button>
          </Dropdown>
          <Button icon={<ExportOutlined />} onClick={handleExport}>导出</Button>
        </Space>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : !order ? (
        <Card style={{ marginBottom: 16 }}>
          <Alert title="订单不存在或已删除" description={`款号: ${styleNo || '未知'}。该款号的订单可能已被删除。`} type="warning" showIcon />
          {purchaseList.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
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

      <Card title={`采购单明细（共 ${purchaseList.length} 项）`}>
        <ResizableTable
          columns={columns}
          dataSource={purchaseList}
          rowKey="id"
          loading={loading}
          scroll={{ x: 'max-content' }}
          size={isMobile ? 'small' : 'middle'}
          pagination={{
            defaultPageSize: readPageSize(20),
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
        />
      </Card>

      <ResizableModal
        title={editMode === 'create' ? '添加面辅料' : '编辑面辅料'}
        open={addEditVisible}
        onOk={handleSave}
        onCancel={() => { setAddEditVisible(false); form.resetFields(); }}
        confirmLoading={submitLoading}
        width="60vw"
      >
        <PurchaseCreateForm form={form} />
      </ResizableModal>

      <ResizableModal
        title={receiveRecord && String(receiveRecord.status || '').toLowerCase() === MATERIAL_PURCHASE_STATUS.PENDING ? '采购/到货' : '追加到货'}
        open={receiveVisible}
        onOk={handleReceive}
        onCancel={() => { setReceiveVisible(false); receiveForm.resetFields(); }}
        confirmLoading={receiveLoading}
        width="30vw"
      >
        {receiveRecord && (
          <ModalContentLayout.HeaderCard>
            <ModalContentLayout.FieldRow gap={24}>
              <ModalContentLayout.Field label="物料名称" value={receiveRecord.materialName} />
              <ModalContentLayout.Field label="物料编码" value={receiveRecord.materialCode} />
              <ModalContentLayout.Field label="已到货" value={formatMaterialQuantityWithUnit(receiveRecord.arrivedQuantity, receiveRecord.unit)} />
            </ModalContentLayout.FieldRow>
          </ModalContentLayout.HeaderCard>
        )}
        <Form form={receiveForm} layout="vertical">
          <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={0.01} step={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </ResizableModal>

      <MaterialQualityIssueModal
        open={qualityIssueVisible}
        purchase={qualityIssueRecord}
        onChanged={() => { qualityIssueVisible && setQualityIssueVisible(false); }}
        onClose={() => { setQualityIssueVisible(false); setQualityIssueRecord(null); }}
      />
    </div>
  );
};

export default MaterialPurchaseDetail;