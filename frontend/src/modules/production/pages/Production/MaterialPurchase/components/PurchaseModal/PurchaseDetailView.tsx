import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert, Button, Card, Collapse, Space, Tag, Image, Spin, Tooltip, Form, InputNumber, App, Select, Input } from 'antd';
import { FileImageOutlined, LoadingOutlined, UploadOutlined, PlusOutlined, ExclamationCircleOutlined, RollbackOutlined } from '@ant-design/icons';
import api from '@/utils/api';

import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import RowActions from '@/components/common/RowActions';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import RejectReasonModal from '@/components/common/RejectReasonModal';
import SmallModal from '@/components/common/SmallModal';
import PurchaseDocRecognizeModal from '../PurchaseDocRecognizeModal';
import PurchaseReturnModal from '../PurchaseReturnModal';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { formatMaterialSpecWidth, getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { formatMoney } from '@/utils/format';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { getStatusConfig, buildColorSummary, getOrderQtyTotal, formatMaterialQuantity, formatMaterialQuantityWithUnit, formatReferenceKilograms, subtractMaterialQuantity } from '../../utils';
import { confirmDelete } from '@/utils/confirm';

const { Option } = Select;

const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' }, { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' }, { value: 'fabricD', label: '面料D' }, { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' }, { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' }, { value: 'liningD', label: '里料D' }, { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' }, { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' }, { value: 'accessoryD', label: '辅料D' }, { value: 'accessoryE', label: '辅料E' },
];

const REQUIRED_FIELDS: (keyof MaterialPurchaseType)[] = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];

interface PurchaseDocRecord {
  id: string;
  imageUrl: string;
  uploaderName: string;
  createTime: string;
  matchCount: number;
  totalRecognized: number;
}

// 已回料确认行的样式
const confirmedRowStyle = `
  .row-confirmed-disabled {
    background-color: var(--color-bg-subtle) !important;
    color: var(--color-text-tertiary) !important;
  }
  .row-confirmed-disabled:hover {
    background-color: var(--color-border) !important;
  }
  .row-confirmed-disabled .ant-tag {
    opacity: 0.6;
  }
  .row-confirmed-disabled .ant-btn-link {
    color: var(--color-text-tertiary) !important;
  }
`;

interface PurchaseDetailViewProps {
  currentPurchase: MaterialPurchaseType | null;
  detailOrder: ProductionOrder | null;
  detailOrderLines: Array<{ color: string; size: string; quantity: number }>;
  detailPurchases: MaterialPurchaseType[];
  detailLoading: boolean;
  detailSizePairs: Array<{ size: string; quantity: number }>;
  detailFrozen: boolean;
  isMobile: boolean;
  isSupervisorOrAbove: boolean;
  sortField: string;
  sortOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
  onReceive: (record: MaterialPurchaseType) => void;
  onConfirmReturn: (record: MaterialPurchaseType) => void;
  onReturnReset: (record: MaterialPurchaseType) => void;
  onQualityIssue: (record: MaterialPurchaseType) => void;
  onReceiveAll: () => void;
  onBatchReturn: () => void;
  isSamplePurchase: boolean;
  isOrderFrozenForRecord: (record?: Record<string, unknown> | null) => boolean;
  onWarehousePick?: (record: MaterialPurchaseType, pickQty: number) => void;
  onCancelReceive?: (record: MaterialPurchaseType) => void;
  onConfirmComplete?: () => void;
  confirmCompleteSubmitting?: boolean;
  onRefresh?: () => void;
}

const PurchaseDetailView: React.FC<PurchaseDetailViewProps> = ({
  currentPurchase,
  detailOrder,
  detailOrderLines,
  detailPurchases,
  detailLoading,
  detailSizePairs,
  detailFrozen,
  isMobile,
  isSupervisorOrAbove,
  sortField: _sortField,
  sortOrder: _sortOrder,
  onSort: _onSort,
  onReceive,
  onConfirmReturn,
  onReturnReset,
  onQualityIssue,
  onReceiveAll,
  onBatchReturn,
  isSamplePurchase,
  isOrderFrozenForRecord,
  onWarehousePick,
  onCancelReceive,
  onConfirmComplete: _onConfirmComplete,
  confirmCompleteSubmitting: _confirmCompleteSubmitting,
  onRefresh,
}) => {
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();
  const { message } = App.useApp();
  const [docList, setDocList] = useState<PurchaseDocRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<MaterialPurchaseType | null>(null);
  const [cancelConfirmLoading, setCancelConfirmLoading] = useState(false);
  const [arrivalTarget, setArrivalTarget] = useState<MaterialPurchaseType | null>(null);
  const [arrivalLoading, setArrivalLoading] = useState(false);
  const [arrivalForm] = Form.useForm();
  const [docRecognizeOpen, setDocRecognizeOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editableData, setEditableData] = useState<MaterialPurchaseType[]>([]);
  const [saving, setSaving] = useState(false);

  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);

  // 采购退货弹窗状态
  const [returnModalOpen, setReturnModalOpen] = useState(false);

  // ── 发票/单据上传（复用 PurchaseCreateForm 同款上传逻辑） ──
  // invoiceUrls 从 currentPurchase.invoiceUrls（JSON字符串）解析，本地维护可编辑副本
  const parseInvoiceUrls = (raw?: string | null): string[] => {
    if (!raw) return [];
    try { return JSON.parse(raw) as string[]; }
    catch { return raw.split(',').map((s) => s.trim()).filter(Boolean); }
  };

  const [invoiceUrls, setInvoiceUrls] = useState<string[]>(() =>
    parseInvoiceUrls((currentPurchase as any)?.invoiceUrls)
  );
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const persistInvoiceUrls = useCallback(async (urls: string[]) => {
    if (!currentPurchase?.id) return;
    await api.post('/production/purchase/update-invoice-urls', {
      purchaseId: currentPurchase.id,
      invoiceUrls: JSON.stringify(urls),
    }).catch(() => { /* 非致命 */ });
  }, [currentPurchase?.id]);

  const handleInvoiceUpload = useCallback(async (file: File): Promise<string> => {
    setInvoiceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }) as any;
      if (res?.code !== 200 || !res?.data) throw new Error(res?.message || '上传失败');
      const url: string = typeof res.data === 'string' ? res.data : (res.data?.url ?? '');
      return url;
    } finally {
      setInvoiceUploading(false);
    }
  }, []);

  const handleInvoiceChange = useCallback((urls: string[]) => {
    setInvoiceUrls(urls);
    void persistInvoiceUrls(urls);
  }, [persistInvoiceUrls]);

  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls((currentPurchase as any)?.invoiceUrls));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPurchase?.id]);

  const loadDocs = useCallback(async () => {
    if (!currentPurchase?.orderNo) return;
    setDocsLoading(true);
    try {
      const res = await api.get<PurchaseDocRecord[]>(
        `/production/purchase/docs?orderNo=${encodeURIComponent(currentPurchase.orderNo)}`
      );
      setDocList(Array.isArray(res) ? res : []);
    } catch (_e) {
      // silent
    } finally {
      setDocsLoading(false);
    }
  }, [currentPurchase?.orderNo]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const styleNo = String(currentPurchase?.styleNo || '').trim();
    if (orderNo && orderNo !== '-') {
      api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    if (styleNo && styleNo !== '-') {
      api.get<any>('/production/purchase/smart-receive-preview', { params: { styleNo } })
        .then((res: any) => {
          const materials: any[] = res?.data?.materials || res?.materials || [];
          const map: Record<string, number> = {};
          materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
          setStockMap(map);
        })
        .catch(() => setStockMap({}));
      return;
    }
    setStockMap({});
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo]);

  const displayData = editing ? editableData : detailPurchases;

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    detailOrderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [detailOrderLines]);

  const isMultiColor = orderColors.length > 1;

  const missingColors = useMemo(() => {
    if (!isMultiColor) return [];
    if (detailPurchases.length === 0) return orderColors;
    const coveredColors = new Set(
      detailPurchases
        .map(item => String(item.color || '').trim())
        .filter(Boolean)
    );
    return orderColors.filter(c => !coveredColors.has(c));
  }, [isMultiColor, orderColors, detailPurchases]);

  const bomIncomplete = useMemo(() => {
    if (detailPurchases.length === 0) return true;
    return detailPurchases.some(item =>
      REQUIRED_FIELDS.some(field => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      })
    );
  }, [detailPurchases]);

  const canProcure = !bomIncomplete;

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword: materialKeyword, page: materialPage, pageSize: materialPageSize, status: 'completed' },
      });
      if ((res as any)?.code === 200) {
        setMaterialList((res as any).data?.records || []);
        setMaterialTotal((res as any).data?.total || 0);
      }
    } catch {} finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  useEffect(() => {
    if (materialModalOpen) handleSearchMaterial();
  }, [materialModalOpen, materialPage, materialPageSize, handleSearchMaterial]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, []);

  const addRow = useCallback(() => {
    const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
    const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
    const styleName = currentPurchase?.styleName || detailOrder?.styleName || '';
    const styleId = currentPurchase?.styleId || detailOrder?.styleId || '';
    const newRow: MaterialPurchaseType = {
      id: `tmp_${Date.now()}`,
      purchaseNo: '', supplierId: '', orderNo, styleNo, styleName, styleId,
      materialType: 'fabricA', materialCode: '', materialName: '', unit: '',
      color: '', size: '', specifications: '', fabricComposition: '', fabricWeight: '',
      purchaseQuantity: 0, arrivedQuantity: 0, unitPrice: 0, totalAmount: 0,
      supplierName: '', status: MATERIAL_PURCHASE_STATUS.PENDING,
    } as MaterialPurchaseType;
    setEditableData(prev => [...prev, newRow]);
  }, [currentPurchase, detailOrder]);

  const updateRow = useCallback((rowId: string, field: string, value: any) => {
    setEditableData(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setEditableData(prev => prev.filter(r => r.id !== rowId));
  }, []);

  const handleStartEdit = useCallback(() => {
    if (detailPurchases.length === 0 && isMultiColor && orderColors.length > 0) {
      const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
      const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
      const styleName = currentPurchase?.styleName || detailOrder?.styleName || '';
      const styleId = currentPurchase?.styleId || detailOrder?.styleId || '';
      const autoRows: MaterialPurchaseType[] = orderColors.map(color => ({
        id: `tmp_${Date.now()}_${color}`,
        purchaseNo: '', supplierId: '', orderNo, styleNo, styleName, styleId,
        materialType: 'fabricA', materialCode: '', materialName: '', unit: '',
        color, size: '', specifications: '', fabricComposition: '', fabricWeight: '',
        purchaseQuantity: 0, arrivedQuantity: 0, unitPrice: 0, totalAmount: 0,
        supplierName: '', status: MATERIAL_PURCHASE_STATUS.PENDING,
      } as MaterialPurchaseType));
      setEditableData(autoRows);
    } else {
      setEditableData([...detailPurchases]);
    }
    setEditing(true);
  }, [detailPurchases, isMultiColor, orderColors, currentPurchase, detailOrder]);

  const saveAll = useCallback(async () => {
    const validRows = editableData.filter(r => r.materialCode || r.materialName);
    if (validRows.length === 0) { message.warning('请至少添加一行面辅料信息'); return; }
    const incomplete = validRows.find(r =>
      REQUIRED_FIELDS.some(f => {
        const val = (r as any)[f];
        return val === undefined || val === null || String(val).trim() === '';
      })
    );
    if (incomplete) { message.warning('请完善所有面辅料的必填信息（物料类型、编码、名称、单位、供应商）'); return; }
    if (isMultiColor) {
      const noColor = validRows.find(r => !String(r.color || '').trim());
      if (noColor) { message.warning('多颜色订单中，每项面辅料都必须指定颜色'); return; }
    }
    setSaving(true);
    try {
      const orderNo = currentPurchase?.orderNo || detailOrder?.orderNo || '';
      const styleNo = currentPurchase?.styleNo || detailOrder?.styleNo || '';
      // P1-1 修复：sourceType 优先级 row > currentPurchase > 默认 'order'（带 warn）
      const ctxSourceType = String((currentPurchase as any)?.sourceType || '').trim();
      const fallbackSourceType = ctxSourceType || (() => {
        console.warn('[PurchaseDetailView] sourceType 缺失，回退为默认值 order', { rowSourceType: undefined, ctxSourceType });
        return 'order';
      })();
      for (const row of validRows) {
        const purchaseQuantity = Number(row.purchaseQuantity || 0);
        const unitPrice = Number(row.unitPrice || 0);
        const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
          ? Number((purchaseQuantity * unitPrice).toFixed(2)) : 0;
        const rowSourceType = String((row as any).sourceType || '').trim();
        const payload = { ...row, totalAmount, status: row.status || MATERIAL_PURCHASE_STATUS.PENDING, sourceType: rowSourceType || fallbackSourceType, orderNo: row.orderNo || orderNo, styleNo: row.styleNo || styleNo };
        const isTemp = !row.id || String(row.id).startsWith('tmp_');
        if (!isTemp) {
          await api.put('/production/purchase', payload);
        } else {
          const { id: _id, ...rest } = payload;
          await api.post('/production/purchase', rest);
        }
      }
      const originalIds = new Set(detailPurchases.map(p => p.id));
      const keptIds = new Set(validRows.filter(r => r.id && !String(r.id).startsWith('tmp_')).map(r => r.id));
      const deletedIds = [...originalIds].filter(id => !keptIds.has(id));
      for (const delId of deletedIds) { if (delId) await api.delete(`/production/purchase/${delId}`); }
      message.success('保存成功');
      setEditing(false);
      setEditableData([]);
      onRefresh?.();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [editableData, detailPurchases, currentPurchase, detailOrder, isMultiColor, message, onRefresh]);

  const openMaterialModal = useCallback((rowId: string) => {
    setMaterialTargetRowId(rowId);
    setMaterialModalOpen(true);
  }, []);

  const fillRowFromMaterial = useCallback((rowId: string, record: Record<string, unknown>) => {
    setEditableData(prev => prev.map(r => {
      if (r.id !== rowId) return r;
      return {
        ...r,
        materialCode: String(record.materialCode || r.materialCode || ''),
        materialName: String(record.materialName || r.materialName || ''),
        materialType: String(record.materialType || r.materialType || 'accessoryA') as MaterialPurchaseType['materialType'],
        fabricComposition: String(record.fabricComposition || r.fabricComposition || ''),
        fabricWeight: String(record.fabricWeight || r.fabricWeight || ''),
        color: String(record.color || r.color || ''),
        specifications: String(record.specifications || r.specifications || ''),
        unit: String(record.unit || r.unit || ''),
        unitPrice: Number(record.unitPrice || r.unitPrice || 0),
        supplierName: String(record.supplierName || r.supplierName || ''),
        supplierId: String(record.supplierId || r.supplierId || ''),
      };
    }));
  }, []);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    if (!materialTargetRowId) return;
    fillRowFromMaterial(materialTargetRowId, record);
    setMaterialModalOpen(false);
  }, [materialTargetRowId, fillRowFromMaterial]);

  const handleCancelConfirm = useCallback(async (reason: string) => {
    if (!cancelTarget) return;
    setCancelConfirmLoading(true);
    try {
      await api.post('/production/purchase/cancel-receive', {
        purchaseId: cancelTarget.id,
        reason,
      });
      message.success('撤回成功，采购单已恢复为待处理');
      setCancelTarget(null);
      onRefresh?.();
    } catch {
      message.error('撤回失败');
    } finally {
      setCancelConfirmLoading(false);
    }
  }, [cancelTarget, message, onRefresh]);

  const handleArrivalSubmit = useCallback(async (values: { arrivedQuantity: number }) => {
    if (!arrivalTarget) return;
    setArrivalLoading(true);
    try {
      await api.post('/production/material/inbound/confirm-arrival', {
        purchaseId: arrivalTarget.id,
        arrivedQuantity: values.arrivedQuantity,
      });
      message.success('入库成功，库存已更新');
      setArrivalTarget(null);
      arrivalForm.resetFields();
      onRefresh?.();
    } catch {
      message.error('入库失败');
    } finally {
      setArrivalLoading(false);
    }
  }, [arrivalTarget, arrivalForm, message, onRefresh]);

  return (
    <div className="purchase-detail-view">
      <style>{confirmedRowStyle}</style>
      <ProductionOrderHeader
        order={detailOrder}
        orderLines={detailOrderLines}
        orderNo={currentPurchase?.orderNo}
        styleNo={currentPurchase?.styleNo}
        styleName={currentPurchase?.styleName}
        styleId={currentPurchase?.styleId}
        styleCover={currentPurchase?.styleCover}
        color={String(detailOrder?.color || currentPurchase?.color || '').trim() || buildColorSummary(detailOrderLines) || ''}
        sizeItems={detailSizePairs.map((x) => ({ size: x.size, quantity: x.quantity }))}
        totalQuantity={getOrderQtyTotal(detailOrderLines)}
        showOrderNo={!isSamplePurchase}
        hideEmptyColor={isSamplePurchase}
        hideSizeBlockWhenNoRealSize={isSamplePurchase}
        coverSize={80}
      />

      {missingColors.length > 0 && !editing && (
        <Alert
          type="warning"
          showIcon
          title="颜色覆盖不完整"
          description={
            <span>
              订单包含 <strong>{orderColors.length}</strong> 种颜色（{orderColors.join('、')}），
              但以下颜色缺少采购物料记录：<strong style={{ color: 'var(--color-error)' }}>{missingColors.join('、')}</strong>。
              请点击「编辑面辅料」为每个颜色分别添加面辅料信息。
            </span>
          }
          style={{ marginBottom: 12 }}
        />
      )}

      <Card
        title={`需要采购的面辅料（${displayData.length}项）`}
        loading={detailLoading}
        extra={
          <Space wrap>
            {!editing && (
              <>
                <Button
                  icon={<UploadOutlined />}
                  onClick={() => setDocRecognizeOpen(true)}
                  disabled={detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
                >
                  上传采购单
                </Button>
                <Button
                  type="primary"
                  disabled={detailFrozen || !detailPurchases.some((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING) || !canProcure || detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
                  onClick={onReceiveAll}
                >
                  采购全部
                </Button>
                {bomIncomplete && (
                  <Tag icon={<ExclamationCircleOutlined />} color="warning" style={{ marginLeft: 4 }}>
                    请先编辑物料信息
                  </Tag>
                )}
                <Button
                  disabled={detailFrozen || !detailPurchases.some((p) => {
                    const status = normalizeStatus(p.status);
                    return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
                      || status === MATERIAL_PURCHASE_STATUS.PARTIAL
                      || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
                      && Number(p?.returnConfirmed || 0) !== 1;
                  })}
                  onClick={onBatchReturn}
                >
                  批量回料确认
                </Button>
                <Button
                  icon={<RollbackOutlined />}
                  disabled={detailFrozen || !detailPurchases.some((p) => {
                    const status = normalizeStatus(p.status);
                    return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
                      || status === MATERIAL_PURCHASE_STATUS.PARTIAL
                      || status === MATERIAL_PURCHASE_STATUS.COMPLETED);
                  })}
                  onClick={() => setReturnModalOpen(true)}
                >
                  采购退货
                </Button>
                <Button
                  type="primary"
                  onClick={handleStartEdit}
                  disabled={detailPurchases.some(p => Number(p?.returnConfirmed || 0) === 1)}
                >
                  编辑面辅料
                </Button>
              </>
            )}
            {editing && (
              <>
                <Button type="dashed" icon={<PlusOutlined />} onClick={addRow}>
                  添加物料
                </Button>
                <Button type="primary" loading={saving} onClick={saveAll}>
                  保存
                </Button>
                <Button onClick={cancelEditing}>
                  取消
                </Button>
              </>
            )}
          </Space>
        }
      >
        {editing ? (
          <ResizableTable<MaterialPurchaseType>
            rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
            dataSource={displayData}
            pagination={false}
            size={isMobile ? 'small' : 'middle'}
            scroll={{ x: 'max-content' }}
            emptyDescription="暂无采购明细"
            columns={[
              {
                title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 110,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Select
                    value={String(v || 'fabricA')}
                    size="small"
                    style={{ width: '100%' }}
                    onChange={(val) => updateRow(record.id!, 'materialType', val)}
                  >
                    {MATERIAL_TYPE_OPTIONS.map(opt => (
                      <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                    ))}
                  </Select>
                ),
              },
              {
                title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Input
                    value={String(v || '')}
                    size="small"
                    onChange={(e) => updateRow(record.id!, 'materialCode', e.target.value)}
                    placeholder="输入编码"
                    suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); openMaterialModal(record.id!); }}>选用</span>}
                  />
                ),
              },
              {
                title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 140, ellipsis: true,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Input
                    value={String(v || '')}
                    size="small"
                    onChange={(e) => updateRow(record.id!, 'materialName', e.target.value)}
                    placeholder="物料名称"
                  />
                ),
              },
              {
                title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 100, ellipsis: true,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Input
                    value={String(v || '')}
                    size="small"
                    onChange={(e) => updateRow(record.id!, 'fabricComposition', e.target.value)}
                    placeholder="成分"
                  />
                ),
              },
              {
                title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 80,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Input
                    value={String(v || '')}
                    size="small"
                    onChange={(e) => updateRow(record.id!, 'fabricWeight', e.target.value)}
                    placeholder="克重"
                  />
                ),
              },
              {
                title: '颜色', dataIndex: 'color', key: 'color', width: 90,
                render: (v: unknown, record: MaterialPurchaseType) =>
                  isMultiColor ? (
                    <Select
                      value={String(v || '')}
                      size="small"
                      style={{ width: '100%' }}
                      placeholder="选择颜色"
                      allowClear
                      onChange={(val) => updateRow(record.id!, 'color', val)}
                      options={orderColors.map(c => ({ label: c, value: c }))}
                    />
                  ) : (
                    <Input
                      value={String(v || '')}
                      size="small"
                      onChange={(e) => updateRow(record.id!, 'color', e.target.value)}
                      placeholder="颜色"
                    />
                  ),
              },
              {
                title: '码数', dataIndex: 'size', key: 'size', width: 90,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <DictAutoComplete
                    dictType="size"
                    value={String(v || '')}
                    onChange={(val: string) => updateRow(record.id!, 'size', val)}
                    placeholder="码数"
                    size="small"
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <Input
                    value={String(v || '')}
                    size="small"
                    onChange={(e) => updateRow(record.id!, 'specifications', e.target.value)}
                    placeholder="规格"
                  />
                ),
              },
              {
                title: '单位', dataIndex: 'unit', key: 'unit', width: 80,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <DictAutoComplete
                    dictType="material_unit"
                    value={String(v || '')}
                    onChange={(val: string) => updateRow(record.id!, 'unit', val)}
                    placeholder="单位"
                    size="small"
                    style={{ width: '100%' }}
                  />
                ),
              },
              {
                title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 90, align: 'right' as const,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <InputNumber
                    value={Number(v || 0)}
                    size="small"
                    min={0}
                    style={{ width: '100%' }}
                    onChange={(val) => updateRow(record.id!, 'purchaseQuantity', val ?? 0)}
                  />
                ),
              },
              {
                title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <InputNumber
                    value={Number(v || 0)}
                    size="small"
                    min={0}
                    precision={2}
                    style={{ width: '100%' }}
                    prefix="¥"
                    onChange={(val) => updateRow(record.id!, 'unitPrice', val ?? 0)}
                  />
                ),
              },
              {
                title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true,
                render: (v: unknown, record: MaterialPurchaseType) => (
                  <SupplierSelect
                    value={String(v || '')}
                    placeholder="供应商"
                    size="small"
                    style={{ width: '100%' }}
                    onChange={(_val: string, option: any) => {
                      updateRow(record.id!, 'supplierName', _val);
                      const sel = Array.isArray(option) ? option[0] : option;
                      if (sel) {
                        updateRow(record.id!, 'supplierId' as any, (sel as any).id || '');
                      }
                    }}
                  />
                ),
              },
              {
                title: '操作', key: 'action', width: 100, fixed: 'right' as const,
                render: (_: unknown, record: MaterialPurchaseType) => (
                  <RowActions
                    maxInline={2}
                    actions={[
                      { key: 'select', label: '选用', title: '从面辅料资料选用', onClick: () => openMaterialModal(record.id!) },
                      { key: 'delete', label: '删除', title: '删除此行', danger: true, onClick: () => { confirmDelete('该物料行', async () => removeRow(record.id!), { content: '删除此物料行？保存后将不可恢复' }); } },
                    ]}
                  />
                ),
              },
            ] as any}
          />
        ) : detailPurchases.length === 0 && !detailLoading ? (
          <div style={{ textAlign: 'center', padding: '48px 16px' }}>
            <Alert
              type="info"
              showIcon
              title="该订单尚未创建面辅料信息"
              description={
                orderColors.length > 1
                  ? `订单包含 ${orderColors.length} 种颜色（${orderColors.join('、')}），点击「编辑面辅料」按钮为每种颜色创建对应的面辅料记录。`
                  : '点击上方「编辑面辅料」按钮，为订单添加面辅料信息（物料编码、名称、单位、供应商等），完善后才可进行采购。'
              }
              style={{ maxWidth: 600, margin: '0 auto', textAlign: 'left' }}
              action={
                <Button type="primary" size="small" onClick={handleStartEdit}>
                  编辑面辅料
                </Button>
              }
            />
          </div>
        ) : (
          (() => {
            const sections = ([
              { key: 'fabric', title: '面料' },
              { key: 'lining', title: '里料' },
              { key: 'accessory', title: '辅料' },
            ] as const)
              .map((sec) => {
                const data = detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === sec.key);
                return { ...sec, data };
              })
              .filter((x) => x.data.length > 0);

            const items = sections.map((sec) => ({
              key: sec.key,
              label: `${sec.title}（${sec.data.length}）`,
              children: (
                <ResizableTable<MaterialPurchaseType>
                  rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
                  dataSource={sec.data}
                  pagination={false}
                  size={isMobile ? 'small' : 'middle'}
                  scroll={{ x: 'max-content' }}
                  emptyDescription="暂无数据"
                  rowClassName={(record: MaterialPurchaseType) => {
                    const isConfirmed = Number(record?.returnConfirmed || 0) === 1;
                    return isConfirmed ? 'row-confirmed-disabled' : '';
                  }}
                  columns={[
                    {
                      title: '物料类型',
                      dataIndex: 'materialType',
                      key: 'materialType',
                      width: 110,
                      render: (v: unknown) => <MaterialTypeTag value={v} />,
                    },
                    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: unknown) => v || '-' },
                    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
                    { title: '规格/幅宽', key: 'specWidth', width: 140, ellipsis: true, render: (_: unknown, r: MaterialPurchaseType) => formatMaterialSpecWidth(r.specifications, r.fabricWidth) },
                    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: unknown) => v || '-' },
                    { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: unknown) => formatMaterialQuantity(v) },
                    { title: '参考公斤数', key: 'referenceKilograms', width: 120, align: 'right' as const, render: (_: unknown, r: MaterialPurchaseType) => formatReferenceKilograms(r.purchaseQuantity, r.conversionRate, r.unit) },
                    { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const,
                      render: (v: unknown, r: MaterialPurchaseType) => {
                        const qty = Number(v ?? 0);
                        const purchased = Number(r.purchaseQuantity ?? 0);
                        const canArrive = purchased > qty && ['received', 'partial', 'partial_arrival'].includes(normalizeStatus(r.status));
                        return (
                          <span
                            style={{
                              color: canArrive ? 'var(--color-primary)' : undefined,
                              cursor: canArrive ? 'pointer' : undefined,
                              textDecoration: canArrive ? 'underline' : undefined,
                            }}
                            title={canArrive ? '点击到货入库' : undefined}
                            onClick={() => {
                              if (!canArrive) return;
                              const maxQty = Math.max(0.01, purchased - qty);
                              arrivalForm.setFieldsValue({ arrivedQuantity: maxQty });
                              setArrivalTarget(r);
                            }}
                          >
                            {formatMaterialQuantity(v)}
                          </span>
                        );
                      },
                    },
                    {
                      title: '待到数量',
                      key: 'remainingQuantity',
                      width: 100,
                      align: 'right' as const,
                      render: (_: any, r: MaterialPurchaseType) => {
                        const remaining = subtractMaterialQuantity(r?.purchaseQuantity, r?.arrivedQuantity);
                        return formatMaterialQuantityWithUnit(remaining, r.unit);
                      },
                    },
                    {
                      title: '仓库库存',
                      key: 'warehouseStock',
                      width: 90,
                      align: 'right' as const,
                      render: (_: unknown, r: MaterialPurchaseType) => {
                        const stock = stockMap[String(r.id)];
                        if (stock == null) return <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
                        const hasStock = stock > 0;
                        return (
                          <span
                            style={{
                              color: hasStock ? 'var(--color-primary)' : 'var(--color-text-quaternary)',
                              cursor: hasStock ? 'pointer' : undefined,
                              textDecoration: hasStock ? 'underline' : undefined,
                            }}
                            title={hasStock ? '点击出库领取' : undefined}
                            onClick={() => {
                              if (hasStock && onWarehousePick) {
                                const remaining = Math.max(0, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0));
                                const pickQty = remaining > 0 ? Math.min(stock, remaining) : Math.min(stock, Number(r.purchaseQuantity || 0));
                                onWarehousePick(r, pickQty);
                              }
                            }}
                          >
                            {stock}{r.unit ? ` ${r.unit}` : ''}
                          </span>
                        );
                      },
                    },
                    {
                      title: '单价',
                      dataIndex: 'unitPrice',
                      key: 'unitPrice',
                      width: 110,
                      align: 'right' as const,
                      render: (v: unknown) => {
                        const n = Number(v);
                        return Number.isFinite(n) ? formatMoney(n) : '-';
                      },
                    },
                    {
                      title: '金额',
                      dataIndex: 'totalAmount',
                      key: 'totalAmount',
                      width: 120,
                      align: 'right' as const,
                      render: (v: any, r: any) => {
                        const qty = Number(r?.arrivedQuantity ?? 0);
                        const price = Number(r?.unitPrice);
                        if (Number.isFinite(qty) && Number.isFinite(price)) return formatMoney(qty * price);
                        const n = Number(v);
                        return Number.isFinite(n) ? formatMoney(n) : '-';
                      },
                    },
                    {
                      title: '供应商',
                      dataIndex: 'supplierName',
                      key: 'supplierName',
                      width: 140,
                      ellipsis: true,
                      render: (_: unknown, record: MaterialPurchaseType) => (
                        <SupplierNameTooltip
                          name={record.supplierName}
                          contactPerson={(record as any).supplierContactPerson}
                          contactPhone={(record as any).supplierContactPhone}
                        />
                      ),
                    },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      key: 'status',
                      width: 100,
                      render: (status: MaterialPurchaseType['status']) => {
                        const { text, color } = getStatusConfig(status);
                        return <Tag color={color}>{text}</Tag>;
                      },
                    },
                    {
                      title: '回料时间',
                      dataIndex: 'returnConfirmTime',
                      key: 'returnConfirmTime',
                      width: 160,
                      render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(v) || '-') : '-'),
                    },
                    { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true, render: (v: unknown) => v || '-' },
                    {
                      title: '操作',
                      key: 'confirm',
                      width: 280,
                      render: (_: any, record: MaterialPurchaseType) => {
                        const frozen = isOrderFrozenForRecord(record);
                        const status = normalizeStatus(record.status);
                        const stock = stockMap[String(record.id)];
                        const hasStock = stock != null && stock > 0;
                        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
                        const isPending = status === MATERIAL_PURCHASE_STATUS.PENDING;
                        const canArrival = ['received', 'partial', 'partial_arrival'].includes(status) && !frozen;
                        const canCancelReceive = !isPending && !['completed', 'cancelled'].includes(status) && !frozen;
                        return (
                          <Space size={4} wrap>
                            {isWarehousePending ? (
                              <Tag color="blue">待仓库出库</Tag>
                            ) : (
                              <Button
                                type="link"
                                disabled={frozen || status !== MATERIAL_PURCHASE_STATUS.PENDING || Number(record?.returnConfirmed || 0) === 1}
                                onClick={() => {
                                  if (hasStock && onWarehousePick) {
                                    const remaining = Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                                    const pickQty = remaining > 0 ? Math.min(stock, remaining) : Math.min(stock, Number(record.purchaseQuantity || 0));
                                    onWarehousePick(record, pickQty);
                                  } else {
                                    onReceive(record);
                                  }
                                }}
                              >
                                {hasStock ? '出库领取' : '采购'}
                              </Button>
                            )}
                            {canArrival && (
                              <Button
                                type="link"
                                disabled={Number(record?.returnConfirmed || 0) === 1}
                                onClick={() => {
                                  const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                                  arrivalForm.setFieldsValue({ arrivedQuantity: maxQty });
                                  setArrivalTarget(record);
                                }}
                              >
                                到货入库
                              </Button>
                            )}
                            <Button
                              type="link"
                              disabled={frozen || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED) || Number(record?.returnConfirmed || 0) === 1}
                              onClick={() => onConfirmReturn(record)}
                            >
                              {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
                            </Button>
                            {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
                              <Button
                                type="link"
                                disabled={!isSupervisorOrAbove}
                                onClick={() => onReturnReset(record)}
                              >
                                退回
                              </Button>
                            )}
                            {canCancelReceive && (
                              <Button
                                type="link"
                                danger
                                onClick={() => {
                                  if (onCancelReceive) {
                                    onCancelReceive(record);
                                  } else {
                                    setCancelTarget(record);
                                  }
                                }}
                              >
                                取消领取
                              </Button>
                            )}
                            <Button
                              type="link"
                              disabled={frozen || !(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED) || Number(record?.returnConfirmed || 0) === 1}
                              onClick={() => onQualityIssue(record)}
                            >
                              品质异常
                            </Button>
                          </Space>
                        );
                      },
                    },
                  ]}
                />
              ),
            }));

            if (!items.length) return null;

            return (
              <Collapse
                collapsible="icon"
                defaultActiveKey={sections.map(s => s.key)}
                items={items}
              />
            );
          })()
        )}
      </Card>

      {(docList.length > 0 || docsLoading) && (
        <Card
         
          style={{ marginTop: 12 }}
          title={
            <Space>
              <FileImageOutlined />
              <span>历史上传单据</span>
              <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>（{docList.length}张）</span>
            </Space>
          }
        >
          <Spin spinning={docsLoading}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {docList.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    width: 160,
                    border: '1px solid var(--color-border-light)',
                    borderRadius: 6,
                    padding: 8,
                    background: 'var(--color-bg-container)',
                  }}
                >
                  <Image
                    src={getFullAuthedFileUrl(doc.imageUrl)}
                    width={144}
                    height={100}
                    style={{ objectFit: 'cover', borderRadius: 4 }}
                    preview={{ cover: '预览' }}
                  />
                  <div style={{ marginTop: 6, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                    <Tooltip title={doc.uploaderName}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.uploaderName || '未知'}
                      </div>
                    </Tooltip>
                    <div style={{ color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                      {doc.createTime ? doc.createTime.slice(0, 16).replace('T', ' ') : ''}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      识别{doc.totalRecognized}条 · 匹配{doc.matchCount}条
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Spin>
        </Card>
      )}

      {/* ── 发票/单据上传（财务留底） ── */}
      <Card
       
        style={{ marginTop: 12 }}
        title={
          <Space>
            <FileImageOutlined />
            <span>发票/单据</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal' }}>（{invoiceUrls.length}张，支持拖拽/粘贴/点击上传）</span>
          </Space>
        }
      >
        {invoiceUploading && (
          <div style={{ marginBottom: 8 }}>
            <Spin indicator={<LoadingOutlined style={{ fontSize: 16 }} />} /> 上传中...
          </div>
        )}
        <MultiImageUploadBox
          value={invoiceUrls}
          onChange={handleInvoiceChange}
          uploadFn={handleInvoiceUpload}
          maxCount={20}
          size={80}
          accept="image/jpeg,image/jpg,image/png"
          maxSizeMB={5}
          label="发票/单据"
          disabled={!currentPurchase?.id}
        />
        {invoiceUrls.length === 0 && !invoiceUploading && (
          <div style={{ color: 'var(--color-text-quaternary)', fontSize: 14, textAlign: 'center', padding: '4px 0 0' }}>
            暂无发票/单据，支持拖拽、粘贴或点击上传
          </div>
        )}
      </Card>

      <RejectReasonModal
        open={cancelTarget !== null}
        title="撤回采购"
        description={cancelTarget ? (
          <div>
            <p style={{ marginBottom: 8 }}>确定撤回「{cancelTarget.materialName || cancelTarget.materialCode}」的采购记录？</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 12, marginBottom: 4 }}>
              领取人：{cancelTarget.receiverName || '-'}，到货数量：{formatMaterialQuantityWithUnit(cancelTarget.arrivedQuantity || 0, cancelTarget.unit)}
            </p>
          </div>
        ) : null}
        fieldLabel="撤回原因"
        okText="确认撤回"
        placeholder="请填写撤回原因（必填）"
        required
        okDanger
        loading={cancelConfirmLoading}
        onOk={handleCancelConfirm}
        onCancel={() => setCancelTarget(null)}
      />

      <SmallModal
        open={Boolean(arrivalTarget)}
        title={`${arrivalTarget?.materialName || arrivalTarget?.materialCode || ''} — 到货入库`}
        okText="确认入库"
        confirmLoading={arrivalLoading}
        onOk={() => arrivalForm.submit()}
        onCancel={() => { setArrivalTarget(null); arrivalForm.resetFields(); }}
        destroyOnHidden
      >
        <Form form={arrivalForm} layout="vertical" onFinish={handleArrivalSubmit}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)', fontSize: 12 }}>
            采购 {arrivalTarget?.purchaseQuantity || '-'}{arrivalTarget?.unit ? ' ' + arrivalTarget.unit : ''}，
            已到 {arrivalTarget?.arrivedQuantity || 0}，
            待到 {arrivalTarget ? Math.max(0.01, Number(arrivalTarget.purchaseQuantity || 0) - Number(arrivalTarget.arrivedQuantity || 0)) : 0}
          </p>
          <Form.Item name="arrivedQuantity" label="到货数量" rules={[{ required: true, message: '请输入到货数量' }]}>
            <InputNumber
              min={0.01}
              max={arrivalTarget ? Math.max(0.01, Number(arrivalTarget.purchaseQuantity || 0) - Number(arrivalTarget.arrivedQuantity || 0)) : 1}
              step={0.01}
              precision={2}
              style={{ width: '100%' }}
              placeholder="请输入到货数量（支持小数）"
              autoFocus
            />
          </Form.Item>
        </Form>
      </SmallModal>

      <PurchaseDocRecognizeModal
        open={docRecognizeOpen}
        orderNo={String(currentPurchase?.orderNo || '').trim() || undefined}
        onCancel={() => setDocRecognizeOpen(false)}
        onSuccess={async () => {
          setDocRecognizeOpen(false);
          onRefresh?.();
        }}
      />

      {/* 采购退货弹窗 */}
      <PurchaseReturnModal
        visible={returnModalOpen}
        purchaseRecords={detailPurchases.filter((p) => {
          const status = normalizeStatus(p.status);
          return (status === MATERIAL_PURCHASE_STATUS.RECEIVED
            || status === MATERIAL_PURCHASE_STATUS.PARTIAL
            || status === MATERIAL_PURCHASE_STATUS.COMPLETED);
        })}
        originalPurchaseId={currentPurchase?.id || ''}
        supplierName={currentPurchase?.supplierName || ''}
        onClose={() => setReturnModalOpen(false)}
        onSuccess={async () => {
          setReturnModalOpen(false);
          onRefresh?.();
        }}
      />

      <ResizableModal
        title="面辅料选择"
        open={materialModalOpen}
        onCancel={() => setMaterialModalOpen(false)}
        footer={null}
        width="85vw"
        destroyOnHidden
      >
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <Input
            value={materialKeyword}
            onChange={(e) => setMaterialKeyword(e.target.value)}
            onPressEnter={handleSearchMaterial}
            placeholder="输入物料编码/名称"
            allowClear
          />
          <Button type="primary" onClick={handleSearchMaterial} loading={materialLoading}>搜索</Button>
        </div>
        <ResizableTable
          rowKey="id"
          dataSource={materialList}
          loading={materialLoading}
          pagination={{
            current: materialPage,
            pageSize: materialPageSize,
            total: materialTotal,
            onChange: (page, pageSize) => {
              setMaterialPage(page);
              setMaterialPageSize(pageSize);
            },
            size: 'small',
          }}
          size="small"
          scroll={{ x: 800 }}
          emptyDescription="暂无物料数据"
          columns={[
            { title: '物料编码', dataIndex: 'materialCode', width: 120 },
            { title: '物料名称', dataIndex: 'materialName', width: 160, ellipsis: true },
            { title: '物料类型', dataIndex: 'materialType', width: 100, render: (v: unknown) => <Tag>{getMaterialTypeLabel(v)}</Tag> },
            { title: '规格', dataIndex: 'specifications', width: 120, ellipsis: true },
            { title: '单位', dataIndex: 'unit', width: 60 },
            { title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right' as const, render: (v: unknown) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '-' },
            { title: '供应商', dataIndex: 'supplierName', width: 120, ellipsis: true },
            {
              title: '操作', width: 80, fixed: 'right' as const,
              render: (_: unknown, record: Record<string, unknown>) => (
                <Button type="link" size="small" onClick={() => handleUseMaterial(record)}>选用</Button>
              ),
            },
          ]}
        />
      </ResizableModal>

    </div>
  );
};

export default PurchaseDetailView;
