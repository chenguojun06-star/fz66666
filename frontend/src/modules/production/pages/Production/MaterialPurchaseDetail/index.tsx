import React, { useCallback, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Tag, Space, Spin, Alert, Row, Col, InputNumber, Form, Dropdown, Input, Select, Image, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, PrinterOutlined, DownloadOutlined, ExportOutlined, ExclamationCircleOutlined, UploadOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import ModalContentLayout from '@/components/common/ModalContentLayout';
import RowActions from '@/components/common/RowActions';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { confirmDelete } from '@/utils/confirm';
import MaterialQualityIssueModal from '../MaterialPurchase/components/MaterialQualityIssueModal';
import PurchaseDocRecognizeModal from '../MaterialPurchase/components/PurchaseDocRecognizeModal';
import { useViewport } from '@/utils/useViewport';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import { formatDateTime } from '@/utils/datetime';
import { formatMoney } from '@/utils/format';
import { formatMaterialQuantityWithUnit, getStatusConfig } from '../MaterialPurchase/utils';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { usePurchaseDetailPage } from './hooks/usePurchaseDetailPage';
import type { MaterialPurchase } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import api from '@/utils/api';

const { Option } = Select;

const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' }, { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' }, { value: 'fabricD', label: '面料D' }, { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' }, { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' }, { value: 'liningD', label: '里料D' }, { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' }, { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' }, { value: 'accessoryD', label: '辅料D' }, { value: 'accessoryE', label: '辅料E' },
];

export interface MaterialPurchaseDetailProps {
  styleNo?: string;
  orderNo?: string;
  embedded?: boolean;
  onClose?: () => void;
}

const MaterialPurchaseDetail: React.FC<MaterialPurchaseDetailProps> = ({ styleNo: propStyleNo, orderNo: propOrderNo, embedded, onClose }) => {
  const { styleNo: styleNoParam } = useParams<{ styleNo: string }>();
  const [searchParams] = useSearchParams();
  const orderNo = propOrderNo ?? searchParams.get('orderNo') ?? '';
  const styleNo = propStyleNo ?? styleNoParam ?? '';
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const {
    loading, order, purchaseList, materialArrivalRate,
    receiveForm, returnConfirmForm,
    receiveVisible, setReceiveVisible, receiveRecord, receiveLoading,
    returnConfirmVisible, setReturnConfirmVisible, returnConfirmRecord, returnConfirmLoading,
    qualityIssueVisible, setQualityIssueVisible, qualityIssueRecord, setQualityIssueRecord,
    confirmCompleteSubmitting,
    handleDelete,
    openReceive, handleReceive,
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
  } = usePurchaseDetailPage(styleNo, orderNo);

  const [materialTab, setMaterialTab] = useState<'select' | 'create'>('select');
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);
  const [docRecognizeOpen, setDocRecognizeOpen] = useState(false);
  const [batchPurchaseLoading, setBatchPurchaseLoading] = useState(false);
  const [batchReturnLoading, setBatchReturnLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [materialCreateForm] = Form.useForm();

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

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword: materialKeyword, page: materialPage, pageSize: materialPageSize },
      });
      if (res.code === 200) {
        setMaterialList(res.data?.records || []);
        setMaterialTotal(res.data?.total || 0);
      }
    } catch { /* ignore */ }
    finally { setMaterialLoading(false); }
  }, [materialKeyword, materialPage, materialPageSize]);

  React.useEffect(() => {
    if (materialModalOpen) handleSearchMaterial();
  }, [materialModalOpen, materialPage, materialPageSize, handleSearchMaterial]);

  const displayData = editing ? editableData : purchaseList;

  const viewColumnsMobile = isMobile;
  const colWidth = viewColumnsMobile ? 80 : undefined;

  const editColumns: ColumnsType<MaterialPurchase> = [
    {
      title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 110,
      render: (v: unknown, record: MaterialPurchase) => (
        <Select
          value={String(v || 'fabricA')}
          size="small"
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(record.id!, 'materialType', val)}
        >
          {MATERIAL_TYPE_OPTIONS.map((opt) => (
            <Option key={opt.value} value={opt.value}>{opt.label}</Option>
          ))}
        </Select>
      ),
    },
    {
      title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'materialCode', e.target.value)}
          placeholder="输入编码"
          suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleOpenMaterialModal(record.id!); }}>选用</span>}
        />
      ),
    },
    {
      title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 130, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'materialName', e.target.value)}
          placeholder="物料名称"
        />
      ),
    },
    {
      title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 100, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'fabricComposition', e.target.value)}
          placeholder="成分"
        />
      ),
    },
    {
      title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 80,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'fabricWeight', e.target.value)}
          placeholder="克重"
        />
      ),
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 90,
      render: (v: unknown, record: MaterialPurchase) =>
        isMultiColor && colorList.length > 0 ? (
          <Select
            value={String(v || '')}
            size="small"
            style={{ width: '100%' }}
            placeholder="选择颜色"
            allowClear
            onChange={(val) => handleUpdateRow(record.id!, 'color', val)}
            options={colorList.map((c: string) => ({ label: c, value: c }))}
          />
        ) : (
          <Input
            value={String(v || '')}
            size="small"
            onChange={(e) => handleUpdateRow(record.id!, 'color', e.target.value)}
            placeholder="颜色"
          />
        ),
    },
    {
      title: '码数', dataIndex: 'size', key: 'size', width: 90,
      render: (v: unknown, record: MaterialPurchase) => (
        <DictAutoComplete
          dictType="size"
          value={String(v || '')}
          onChange={(val: string) => handleUpdateRow(record.id!, 'size', val)}
          placeholder="码数"
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '规格', dataIndex: 'specification', key: 'specification', width: 100,
      render: (v: unknown, record: MaterialPurchase) => (
        <Input
          value={String(v || '')}
          size="small"
          onChange={(e) => handleUpdateRow(record.id!, 'specification', e.target.value)}
          placeholder="规格"
        />
      ),
    },
    {
      title: '单位', dataIndex: 'unit', key: 'unit', width: 80,
      render: (v: unknown, record: MaterialPurchase) => (
        <DictAutoComplete
          dictType="material_unit"
          value={String(v || '')}
          onChange={(val: string) => handleUpdateRow(record.id!, 'unit', val)}
          placeholder="单位"
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 90, align: 'right' as const,
      render: (v: unknown, record: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          size="small"
          min={0}
          style={{ width: '100%' }}
          onChange={(val) => handleUpdateRow(record.id!, 'purchaseQuantity', val ?? 0)}
        />
      ),
    },
    {
      title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const,
      render: (v: unknown, record: MaterialPurchase) => (
        <InputNumber
          value={Number(v || 0)}
          size="small"
          min={0}
          precision={2}
          style={{ width: '100%' }}
          prefix="¥"
          onChange={(val) => handleUpdateRow(record.id!, 'unitPrice', val ?? 0)}
        />
      ),
    },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true,
      render: (v: unknown, record: MaterialPurchase) => (
        <SupplierSelect
          value={String(v || '')}
          placeholder="供应商"
          size="small"
          style={{ width: '100%' }}
          onChange={(_val: string, option: any) => {
            handleUpdateRow(record.id!, 'supplierName', _val);
            const sel = Array.isArray(option) ? option[0] : option;
            if (sel) {
              handleUpdateRow(record.id!, 'supplierId', (sel as any).id || '');
              handleUpdateRow(record.id!, 'supplierContactPerson' as any, (sel as any).supplierContactPerson || '');
              handleUpdateRow(record.id!, 'supplierContactPhone' as any, (sel as any).supplierContactPhone || '');
            }
          }}
        />
      ),
    },
    {
      title: '操作', key: 'action', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: MaterialPurchase) => (
        <RowActions
          maxInline={2}
          actions={[
            { key: 'select', label: '选用', title: '从面辅料资料选用', onClick: () => handleOpenMaterialModal(record.id!) },
            { key: 'delete', label: '删除', title: '删除此行', danger: true, onClick: () => { confirmDelete('该物料行', async () => handleRemoveRow(record.id!), { content: '删除此物料行？保存后将不可恢复' }); } },
          ]}
        />
      ),
    },
  ];

  const viewColumns: ColumnsType<MaterialPurchase> = [
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: colWidth || 100, render: (v: string) => <MaterialTypeTag value={v} /> },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: colWidth || 140, ellipsis: true },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: colWidth || 120, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: colWidth || 80, ellipsis: true },
    { title: '尺码', dataIndex: 'size', key: 'size', width: colWidth || 80, ellipsis: true },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: colWidth || 70, ellipsis: true },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: colWidth || 90, align: 'right' as const, render: (v: number) => Number.isFinite(Number(v)) ? formatMoney(v) : '-' },
    { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: colWidth || 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: colWidth || 100, align: 'right' as const, render: (v: number, r: MaterialPurchase) => formatMaterialQuantityWithUnit(v, r.unit) },
    {
      title: '金额', key: 'amount', width: colWidth || 100, align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
        const quantity = Number(r.purchaseQuantity || 0);
        const price = Number(r.unitPrice || 0);
        const total = quantity * price;
        return Number.isFinite(total) ? formatMoney(total) : '-';
      },
    },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: colWidth || 140, ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => <SupplierNameTooltip name={r.supplierName} contactPerson={(r as any).supplierContactPerson} contactPhone={(r as any).supplierContactPhone} />,
    },
    { title: '采购日期', dataIndex: 'receivedTime', key: 'receivedTime', width: colWidth || 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    { title: '最新到货日期', dataIndex: 'expectedArrivalDate', key: 'expectedArrivalDate', width: colWidth || 120, render: (v: string) => v ? formatDateTime(v) : '-' },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: colWidth || 110,
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

        const isReturnConfirmed = Number((record as any)?.returnConfirmed || 0) === 1;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING || status === 'warehouse_pending';

        return (
          <RowActions
            actions={[
              ...(editing ? [] : [
                { key: 'edit', label: '编辑', onClick: () => handleStartEdit(), disabled: isCancelled },
              ]),
              { key: 'delete', label: '删除', onClick: () => handleDelete(record), danger: true, disabled: isCancelled },
              ...(isWarehousePending ? [{ key: 'warehouse-pending', label: '待仓库出库', disabled: true }] : []),
              ...(!isWarehousePending && (isPending || isReceived || isPartial) ? [{ key: 'receive', label: isPending ? '采购/到货' : '追加到货', onClick: () => openReceive(record), primary: isPending, disabled: !canProcure, title: !canProcure ? '请先完善面辅料信息' : undefined }] : []),
              ...(!isPending && !isCancelled ? [{ key: 'return-confirm', label: isReturnConfirmed ? '追加回料' : '回料确认', onClick: () => handleReturnConfirm(record) }] : []),
              ...((isReturnConfirmed || isCompleted) ? [{ key: 'return-reset', label: '退回', onClick: () => handleReturnReset(record), danger: true }] : []),
              ...(!isPending && !isCompleted && !isCancelled && !isReturnConfirmed ? [{ key: 'cancel-receive', label: '取消领取', onClick: () => handleCancelReceive(record), danger: true }] : []),
              { key: 'quality-issue', label: '品质异常', onClick: () => { setQualityIssueRecord(record); setQualityIssueVisible(true); } },
            ]}
          />
        );
      },
    },
  ];

  const columns = editing ? editColumns : viewColumns;

  return (
    <div style={{ padding: embedded ? 0 : (isMobile ? 12 : 24) }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <Space>
          <Button onClick={() => embedded && onClose ? onClose() : navigate(-1)}>返回</Button>
          <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>订单物料采购明细</h2>
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
                  const rows = purchaseList.map((p) => `<tr><td>${p.materialType || ''}</td><td>${p.materialName || ''}</td><td>${p.purchaseQuantity || ''}</td><td>${p.arrivedQuantity || ''}</td><td>${p.supplierName || ''}</td><td>${p.status || ''}</td></tr>`).join('');
                  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>采购单 ${styleNo}</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px}</style></head><body><h2>采购单 - ${styleNo}</h2><table><tr><th>物料类型</th><th>物料名称</th><th>采购数量</th><th>到货数量</th><th>供应商</th><th>状态</th></tr>${rows}</table></body></html>`);
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
                <Button type="primary" loading={saving} onClick={handleSaveAll} size="small">
                  保存
                </Button>
                <Button onClick={handleCancelEdit} size="small">
                  取消
                </Button>
              </>
            ) : (
              <>
                <Button type="primary" icon={<PlusOutlined />} onClick={handleStartEdit} size="small">
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
              type="info"
              showIcon
              title="该订单尚未创建面辅料信息"
              description={isMultiColor
                ? `订单包含 ${colorList.length} 种颜色（${colorList.join('、')}），需要为每种颜色分别创建对应的面辅料记录。`
                : `请为订单创建面辅料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。`
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                <Button type="primary" size="small" onClick={handleStartEdit}>
                  创建面辅料
                </Button>
              }
            />
          </div>
        ) : (
          <ResizableTable
            storageKey="material-purchase-detail-table"
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

      <ResizableModal
        title="面辅料选择"
        open={materialModalOpen}
        onCancel={() => setMaterialModalOpen(false)}
        footer={null}
        width="85vw"
        destroyOnHidden
      >
        <Tabs
          activeKey={materialTab}
          onChange={(key) => setMaterialTab(key as 'select' | 'create')}
          items={[
            {
              key: 'select', label: '选择已有',
              children: (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <Input
                      value={materialKeyword}
                      onChange={(e) => setMaterialKeyword(e.target.value)}
                      onPressEnter={handleSearchMaterial}
                      placeholder="输入物料编码/名称"
                      allowClear
                    />
                    <Button onClick={handleSearchMaterial} loading={materialLoading}>搜索</Button>
                  </div>
                  <ResizableTable
                    storageKey="purchase-detail-material-select"
                    loading={materialLoading}
                    dataSource={materialList}
                    rowKey={(record) => String(record.id || record.materialCode || '')}
                    pagination={{
                      current: materialPage,
                      pageSize: materialPageSize,
                      total: materialTotal,
                      showTotal: (total) => `共 ${total} 条`,
                      onChange: (p, ps) => { setMaterialPage(p); setMaterialPageSize(ps); },
                      showSizeChanger: true,
                      pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
                    }}
                    onRow={(record) => ({
                      onDoubleClick: async () => {
                        await handleUseMaterial(record);
                      },
                    })}
                    columns={[
                      {
                        title: '图片', dataIndex: 'image', width: 80,
                        render: (value: unknown) => {
                          const raw = String(value || '').trim();
                          if (!raw) return null;
                          const url = getFullAuthedFileUrl(raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`);
                          return <Image src={url} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }} preview={{ src: url }} />;
                        },
                      },
                      { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
                      { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 140, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
                      { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 90, render: (v: unknown) => String(v || '').trim() || '-' },
                      { title: '物料类型', dataIndex: 'materialType', width: 90, render: (v: unknown) => getMaterialTypeLabel(v) },
                      { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
                      { title: '规格/幅宽', dataIndex: 'specifications', width: 120, ellipsis: true },
                      { title: '单位', dataIndex: 'unit', width: 70 },
                      {
                        title: '供应商', dataIndex: 'supplierName', width: 140, ellipsis: true,
                        render: (_: unknown, record: Record<string, unknown>) => (
                          <SupplierNameTooltip name={record.supplierName} contactPerson={record.supplierContactPerson} contactPhone={record.supplierContactPhone} />
                        ),
                      },
                      { title: '单价', dataIndex: 'unitPrice', width: 90, render: (value: unknown) => formatMoney((value as number | string) || 0) },
                      {
                        title: '操作', dataIndex: 'operation', width: 90,
                        render: (_: unknown, record: Record<string, unknown>) => (
                          <RowActions maxInline={1} actions={[
                            { key: 'use', label: '选用', title: '选用', onClick: async () => { await handleUseMaterial(record); }, primary: true },
                          ]} />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              key: 'create', label: '新建并使用',
              children: (
                <Form form={materialCreateForm} layout="vertical" onFinish={handleCreateMaterial}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                    <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
                      <DictAutoComplete dictType="material_unit" placeholder="请输入或选择单位" />
                    </Form.Item>
                    <Form.Item name="supplierId" hidden><Input /></Form.Item>
                    <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
                    <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
                      <SupplierSelect
                        placeholder="选择供应商"
                        onChange={(_value, option) => {
                          const selectedOption = Array.isArray(option) ? option[0] : option;
                          if (selectedOption) {
                            materialCreateForm.setFieldsValue({
                              supplierId: (selectedOption as any).id,
                              supplierContactPerson: (selectedOption as any).supplierContactPerson,
                              supplierContactPhone: (selectedOption as any).supplierContactPhone,
                            });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="materialType" label="物料类型" initialValue="accessory">
                      <Select options={[
                        { value: 'fabric', label: 'fabric' },
                        { value: 'lining', label: 'lining' },
                        { value: 'accessory', label: 'accessory' },
                      ]} />
                    </Form.Item>
                    <Form.Item name="color" label="颜色">
                      <DictAutoComplete dictType="color" placeholder="请输入或选择颜色" />
                    </Form.Item>
                    <Form.Item name="specifications" label="规格">
                      <DictAutoComplete dictType="material_specification" placeholder="请输入或选择规格" />
                    </Form.Item>
                    <Form.Item name="fabricComposition" label="成分">
                      <Input placeholder="如：100%棉" />
                    </Form.Item>
                    <Form.Item name="fabricWeight" label="克重">
                      <Input placeholder="如：220g" />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价" initialValue={0}>
                      <InputNumber min={0} step={0.01} style={{ width: '100%' }} prefix="¥" />
                    </Form.Item>
                    <Form.Item name="remark" label="备注">
                      <Input />
                    </Form.Item>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <Button onClick={() => setMaterialModalOpen(false)}>取消</Button>
                    <Button type="primary" htmlType="submit">创建并填入</Button>
                  </div>
                </Form>
              ),
            },
          ]}
        />
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

      <ResizableModal
        title="回料确认"
        open={returnConfirmVisible}
        onOk={doReturnConfirm}
        onCancel={() => { setReturnConfirmVisible(false); returnConfirmForm.resetFields(); }}
        confirmLoading={returnConfirmLoading}
        width="30vw"
      >
        {returnConfirmRecord && (
          <ModalContentLayout.HeaderCard>
            <ModalContentLayout.FieldRow gap={24}>
              <ModalContentLayout.Field label="物料名称" value={returnConfirmRecord.materialName} />
              <ModalContentLayout.Field label="物料编码" value={returnConfirmRecord.materialCode} />
              <ModalContentLayout.Field label="已到货" value={formatMaterialQuantityWithUnit(returnConfirmRecord.arrivedQuantity, returnConfirmRecord.unit)} />
            </ModalContentLayout.FieldRow>
          </ModalContentLayout.HeaderCard>
        )}
        <Form form={returnConfirmForm} layout="vertical">
          <Form.Item name="quantity" label="实际回料数量" rules={[{ required: true, message: '请输入实际回料数量' }]}>
            <InputNumber min={0} step={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </ResizableModal>

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