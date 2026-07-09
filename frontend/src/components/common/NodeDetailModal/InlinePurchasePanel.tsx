import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Alert, App, Button, Card, Collapse, Form, Image, Input, InputNumber, Select, Space, Spin, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import RowActions from '@/components/common/RowActions';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import api, { parseProductionOrderLines } from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { getMaterialTypeCategory, getMaterialTypeLabel, getMaterialTypeSortKey } from '@/utils/materialType';
import { formatMoney } from '@/utils/format';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';
import {
  formatMaterialQuantity,
  formatReferenceKilograms,
  getStatusConfig,
  buildColorSummary,
  getOrderQtyTotal,
  buildSizePairs,
} from '@/modules/production/pages/Production/MaterialPurchase/utils';

interface InlinePurchasePanelProps {
  orderId?: string;
  orderNo?: string;
  patternId?: string;
  sourceType?: 'order' | 'sample';
  styleNo?: string;
  color?: string;
  quantity?: number;
}

const MATERIAL_TYPE_OPTIONS = [
  { value: 'fabricA', label: '面料A' },
  { value: 'fabricB', label: '面料B' },
  { value: 'fabricC', label: '面料C' },
  { value: 'fabricD', label: '面料D' },
  { value: 'fabricE', label: '面料E' },
  { value: 'liningA', label: '里料A' },
  { value: 'liningB', label: '里料B' },
  { value: 'liningC', label: '里料C' },
  { value: 'liningD', label: '里料D' },
  { value: 'liningE', label: '里料E' },
  { value: 'accessoryA', label: '辅料A' },
  { value: 'accessoryB', label: '辅料B' },
  { value: 'accessoryC', label: '辅料C' },
  { value: 'accessoryD', label: '辅料D' },
  { value: 'accessoryE', label: '辅料E' },
];

const unwrapRecords = (res: any): MaterialPurchase[] => {
  if (res?.code !== 200) return [];
  return (
    (Array.isArray(res?.data?.records) && res.data.records) ||
    (Array.isArray(res?.data) && res.data) ||
    []
  );
};

const sortPurchases = (arr: MaterialPurchase[]) =>
  [...arr].sort((a, b) => {
    const ka = getMaterialTypeSortKey(a?.materialType);
    const kb = getMaterialTypeSortKey(b?.materialType);
    return ka !== kb ? ka.localeCompare(kb) : String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
  });

const normalizeStatus = (status?: MaterialPurchase['status'] | string) =>
  String(status || '').trim().toLowerCase();

const InlinePurchasePanel: React.FC<InlinePurchasePanelProps> = ({ orderId, orderNo, patternId, sourceType = 'order', styleNo, color: propColor, quantity: propQuantity }) => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { user } = useUser();

  const [purchases, setPurchases] = useState<MaterialPurchase[]>([]);
  const [order, setOrder] = useState<ProductionOrder | null>(null);
  const [orderLines, setOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [sizePairs, setSizePairs] = useState<Array<{ size: string; quantity: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmCompleteLoading, setConfirmCompleteLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editableData, setEditableData] = useState<MaterialPurchase[]>([]);
  const [saving, setSaving] = useState(false);
  const [materialModalOpen, setMaterialModalOpen] = useState(false);
  const [materialTargetRowId, setMaterialTargetRowId] = useState<string | null>(null);
  const [materialKeyword, setMaterialKeyword] = useState('');
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialList, setMaterialList] = useState<Record<string, unknown>[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialPage, setMaterialPage] = useState(1);
  const [materialPageSize, setMaterialPageSize] = useState(10);

  const [receiveModalVisible, setReceiveModalVisible] = useState(false);
  const [receiveModalRecord, setReceiveModalRecord] = useState<MaterialPurchase | null>(null);
  const [inboundModalVisible, setInboundModalVisible] = useState(false);
  const [inboundModalRecord, setInboundModalRecord] = useState<MaterialPurchase | null>(null);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [returnModalRecord, setReturnModalRecord] = useState<MaterialPurchase | null>(null);
  const [receiveForm] = Form.useForm();
  const [inboundForm] = Form.useForm();
  const [returnForm] = Form.useForm();

  const orderColors = useMemo(() => {
    const colors = new Set<string>();
    orderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return Array.from(colors);
  }, [orderLines]);

  const firstPurchase = purchases[0] || null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let records: MaterialPurchase[] = [];
      let orderRecord: ProductionOrder | null = null;

      if (sourceType === 'sample' && patternId) {
        // 样衣采购模式：只按 patternId 精确查当前样衣的物料
        // 不能按 styleNo 模糊查，否则会把同款号其它样衣版本的物料也拉过来
        try {
          const sampleRes = await api.get<{ code: number; data: { records: MaterialPurchase[] } }>(
            '/production/purchase/list',
            { params: { page: 1, pageSize: 200, patternProductionId: patternId, sourceType: 'sample', materialType: '', status: '' } }
          );
          records = sortPurchases(unwrapRecords(sampleRes));
        } catch {}

        // 样衣模式没有大货订单，需要查样衣详情构造订单头信息（款号/款名/颜色/码数/下单数量/封面图）
        // 否则 ProductionOrderHeader 全显示 '-'，用户看不到基础信息
        try {
          const patternRes = await api.get<{ code: number; data: Record<string, unknown> }>(
            `/production/pattern/${patternId}`
          );
          if (patternRes?.code === 200 && patternRes?.data) {
            const p = patternRes.data;
            let pColor = String(p.color || propColor || '').trim();
            let pSize = String(p.size || '').trim();
            let pQty = Number(p.quantity || propQuantity || 0);

            // PatternProduction 的 color/size/quantity 可能为空（老数据未填）
            // 兜底：从 StyleInfo 的 sizeColorMatrix 解析出完整的颜色×尺码×数量明细
            // matrixRows 结构: [{color:"白色", quantities:[1,0,0]}], sizes: ["S(160/84A)", "M", "L"]
            const orderDetails: Array<{ color: string; size: string; quantity: number }> = [];
            if (pColor && pSize) {
              orderDetails.push({ color: pColor, size: pSize, quantity: pQty });
            } else {
              const matrix = (p.sizeColorMatrix || p.sizeColorConfig) as Record<string, unknown> | string | undefined;
              let parsedMatrix: { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> } | null = null;
              if (matrix && typeof matrix === 'string') {
                try { parsedMatrix = JSON.parse(matrix); } catch { /* ignore */ }
              } else if (matrix && typeof matrix === 'object') {
                parsedMatrix = matrix as { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> };
              }
              const sizes = Array.isArray(parsedMatrix?.sizes) ? (parsedMatrix!.sizes as string[]) : [];
              const rows = Array.isArray(parsedMatrix?.matrixRows) ? (parsedMatrix!.matrixRows as Array<Record<string, unknown>>) : [];
              rows.forEach((row) => {
                const rowColor = String(row?.color || '').trim();
                const quantities = Array.isArray(row?.quantities) ? (row.quantities as number[]) : [];
                sizes.forEach((sz, idx) => {
                  const q = Number(quantities[idx] || 0);
                  if (q > 0) {
                    orderDetails.push({ color: rowColor, size: String(sz || '').trim(), quantity: q });
                  }
                });
              });
              // 如果解析出明细，汇总给 pColor/pSize/pQty 用于 ProductionOrderHeader 兜底显示
              if (orderDetails.length > 0) {
                if (!pColor) {
                  const colors = Array.from(new Set(orderDetails.map(d => d.color).filter(Boolean)));
                  pColor = colors.length === 1 ? colors[0] : (colors.length > 1 ? `${colors.length}色：${colors.join(' / ')}` : '');
                }
                if (!pSize) {
                  const sizes = Array.from(new Set(orderDetails.map(d => d.size).filter(Boolean)));
                  pSize = sizes.length === 1 ? sizes[0] : (sizes.length > 1 ? `${sizes.length}码：${sizes.join(' / ')}` : '');
                }
                if (!pQty) pQty = orderDetails.reduce((s, d) => s + d.quantity, 0);
              }
            }

            // 构造伪 order，字段对齐 ProductionOrderHeader 期望的形状
            // orderDetails 让 parseProductionOrderLines 能正常解析出 lines
            orderRecord = {
              id: String(p.id || patternId),
              styleNo: String(p.styleNo || styleNo || ''),
              styleName: String(p.styleName || ''),
              styleId: String(p.styleId || ''),
              styleCover: (p.coverImage as string) || null,
              color: pColor,
              size: pSize,
              orderQuantity: pQty,
              orderNo: '',
              orderDetails,
            } as unknown as ProductionOrder;
            setOrder(orderRecord);
          }
        } catch (e: any) {
          console.warn('[InlinePurchasePanel] 查询样衣详情失败:', e?.message || e);
        }
      } else {
        // 大货采购模式
        const no = String(orderNo || '').trim();
        if (!no) {
          setLoading(false);
          return;
        }
        const [orderRes, purchaseRes] = await Promise.all([
          api.get<{ code: number; data: { records: ProductionOrder[] } }>('/production/order/list', {
            params: { page: 1, pageSize: 1, orderNo: no },
          }),
          api.get<{ code: number; data: { records: MaterialPurchase[] } }>('/production/purchase/list', {
            params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' },
          }),
        ]);
        const orderRecords = orderRes?.code === 200
          ? (Array.isArray(orderRes?.data?.records) ? orderRes.data.records : [])
          : [];
        orderRecord = orderRecords[0] || null;
        setOrder(orderRecord);

        records = sortPurchases(unwrapRecords(purchaseRes));

        if (records.length === 0 && orderRecord?.id) {
          try {
            const previewRes = await api.get<{ code: number; data: MaterialPurchase[] }>(
              '/production/purchase/demand/preview',
              { params: { orderId: orderRecord.id } }
            );
            if (previewRes?.code === 200 && Array.isArray(previewRes?.data)) {
              records = sortPurchases(previewRes.data);
            }
          } catch (e: any) {
            console.warn('[InlinePurchasePanel] demand/preview请求失败:', e?.message || e);
          }
        }
      }

      setPurchases(records);

      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setOrderLines(parsedLines);
        setSizePairs(buildSizePairs(parsedLines));
      } else if (orderRecord) {
        const fc = String(orderRecord?.color || '').trim();
        const fs = String(orderRecord?.size || '').trim();
        const fq = Number(orderRecord?.orderQuantity || 0);
        const lines = [(fc || fs || fq) ? { color: fc, size: fs, quantity: fq } : { color: '-', size: '-', quantity: 0 }];
        setOrderLines(lines);
        setSizePairs(buildSizePairs(lines));
      } else if (records.length > 0) {
        const colors = new Set<string>(); const sizes = new Set<string>(); let totalQty = 0;
        records.forEach((p: any) => {
          const c = String(p?.color || '').trim(); const s = String(p?.size || '').trim();
          if (c && c !== '-') colors.add(c); if (s && s !== '-') sizes.add(s);
          if (Number(p?.purchaseQuantity || 0) > 0) totalQty += Number(p?.purchaseQuantity || 0);
        });
        const lines = [{ color: Array.from(colors).join(',') || '-', size: Array.from(sizes).join(',') || '-', quantity: totalQty || 0 }];
        setOrderLines(lines);
        setSizePairs(buildSizePairs(lines));
      } else {
        setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
        setSizePairs([]);
      }
    } catch {
      setPurchases([]);
      setOrder(null);
      setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      setSizePairs([]);
    } finally {
      setLoading(false);
    }
  }, [orderNo, patternId, sourceType, styleNo, propColor, propQuantity]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    api.get<any>('/production/purchase/smart-receive-preview', { params: { orderNo: no } })
      .then((res: any) => {
        const materials: any[] = res?.data?.materials || res?.materials || [];
        const map: Record<string, number> = {};
        materials.forEach((m: any) => { if (m.purchaseId != null) map[String(m.purchaseId)] = Number(m.availableStock ?? 0); });
        setStockMap(map);
      })
      .catch(() => setStockMap({}));
  }, [orderNo]);

  const getOrderStyleInfo = useCallback(() => {
    return {
      orderId: orderId || order?.id || firstPurchase?.orderId || '',
      orderNo: String(orderNo || firstPurchase?.orderNo || '').trim(),
      // 样衣模式 order 可能为空时，用 propStyleNo 兜底，保证款号不丢
      styleNo: order?.styleNo || firstPurchase?.styleNo || styleNo || '',
      styleName: order?.styleName || firstPurchase?.styleName || '',
      styleId: order?.styleId || firstPurchase?.styleId || '',
      styleCover: order?.styleCover || firstPurchase?.styleCover || '',
    };
  }, [orderId, orderNo, order, firstPurchase, styleNo]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setEditableData([]);
  }, []);

  const handleAddRow = useCallback(() => {
    const info = getOrderStyleInfo();
    const newRow: MaterialPurchase = {
      id: `tmp_${Date.now()}`,
      purchaseNo: '',
      supplierId: '',
      orderNo: info.orderNo,
      styleNo: info.styleNo,
      styleName: info.styleName,
      styleId: info.styleId,
      materialType: 'fabricA',
      materialCode: '',
      materialName: '',
      unit: '',
      color: '',
      size: '',
      specifications: '',
      fabricComposition: '',
      fabricWeight: '',
      purchaseQuantity: 0,
      arrivedQuantity: 0,
      unitPrice: 0,
      totalAmount: 0,
      supplierName: '',
      status: MATERIAL_PURCHASE_STATUS.PENDING,
    } as MaterialPurchase;
    setEditableData(prev => [...prev, newRow]);
  }, [getOrderStyleInfo]);

  const handleUpdateRow = useCallback((rowId: string, field: string, value: any) => {
    setEditableData(prev => prev.map(r => r.id === rowId ? { ...r, [field]: value } : r));
  }, []);

  const handleRemoveRow = useCallback((rowId: string) => {
    setEditableData(prev => prev.filter(r => r.id !== rowId));
  }, []);

  const handleSaveAll = useCallback(async () => {
    const validRows = editableData.filter(r => r.materialCode || r.materialName);
    if (validRows.length === 0) { message.warning('请至少添加一行物料'); return; }
    const REQUIRED = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'];
    const incomplete = validRows.find(r => REQUIRED.some(f => { const v = (r as any)[f]; return v === undefined || v === null || String(v).trim() === ''; }));
    if (incomplete) { message.warning('请完善所有物料的必填信息'); return; }
    setSaving(true);
    try {
      for (const row of validRows) {
        const purchaseQuantity = Number(row.purchaseQuantity || 0);
        const unitPrice = Number(row.unitPrice || 0);
        const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice) ? Number((purchaseQuantity * unitPrice).toFixed(2)) : 0;
        const resolvedSourceType = sourceType === 'sample' ? 'sample' : (order?.sourceBizType === 'SAMPLE' ? 'sample' : 'order');
        const payload = {
          ...row,
          totalAmount,
          status: row.status || MATERIAL_PURCHASE_STATUS.PENDING,
          sourceType: resolvedSourceType,
          ...(resolvedSourceType === 'sample' && patternId ? { patternProductionId: patternId } : {}),
        };
        const isTemp = !row.id || String(row.id).startsWith('tmp_');
        if (!isTemp) {
          await api.put('/production/purchase', payload);
        } else {
          const { id: _id, ...rest } = payload;
          await api.post('/production/purchase', rest);
        }
      }
      const originalIds = new Set(purchases.map(p => p.id));
      const keptIds = new Set(validRows.filter(r => r.id && !String(r.id).startsWith('tmp_')).map(r => r.id));
      const deletedIds = [...originalIds].filter(id => !keptIds.has(id));
      for (const delId of deletedIds) { if (delId) await api.delete(`/production/purchase/${delId}`); }
      message.success('保存成功');
      setEditing(false);
      setEditableData([]);
      loadData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }, [editableData, purchases, message, loadData, order?.sourceBizType, patternId, sourceType]);

  const handleOpenMaterialModal = useCallback((rowId: string) => {
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
        materialType: String(record.materialType || r.materialType || 'accessoryA') as MaterialPurchase['materialType'],
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

  const handleSearchMaterial = useCallback(async () => {
    setMaterialLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword: materialKeyword, page: materialPage, pageSize: materialPageSize, status: 'completed' },
      });
      if (res?.code === 200) {
        setMaterialList(res.data?.records || []);
        setMaterialTotal(res.data?.total || 0);
      }
    } catch {} finally {
      setMaterialLoading(false);
    }
  }, [materialKeyword, materialPage, materialPageSize]);

  useEffect(() => {
    if (materialModalOpen) handleSearchMaterial();
  }, [materialModalOpen, materialPage, materialPageSize, handleSearchMaterial]);

  const handleReceive = useCallback(async (record: MaterialPurchase) => {
    setReceiveModalRecord(record);
    receiveForm.setFieldsValue({ quantity: Number(record.purchaseQuantity || 0) });
    setReceiveModalVisible(true);
  }, [receiveForm]);

  const doReceive = useCallback(async () => {
    try {
      const values = await receiveForm.validateFields();
      const record = receiveModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const receiverId = String(user?.id || '').trim();
      const receiverName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/receive', {
        purchaseId,
        receiverId,
        receiverName,
        arrivedQuantity: values.quantity,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 到货确认成功`);
        setReceiveModalVisible(false);
        loadData();
      } else {
        message.error(res?.message || '到货确认失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // form validation
      message.error((e as Error)?.message || '到货确认失败');
    }
  }, [receiveModalRecord, receiveForm, user, message, loadData]);

  // 到货入库：将物料入库到仓库库存
  const handleInbound = useCallback(async (record: MaterialPurchase) => {
    setInboundModalRecord(record);
    const maxQty = Math.max(0.01, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
    inboundForm.setFieldsValue({ arrivedQuantity: maxQty });
    setInboundModalVisible(true);
  }, [inboundForm]);

  const doInbound = useCallback(async () => {
    try {
      const values = await inboundForm.validateFields();
      const record = inboundModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const operatorId = String(user?.id || '').trim();
      const operatorName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/material/inbound/confirm-arrival', {
        purchaseId,
        arrivedQuantity: values.arrivedQuantity,
        operatorId,
        operatorName,
        warehouseLocation: values.warehouseLocation,
        remark: values.remark,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 到货入库成功，库存已更新`);
        setInboundModalVisible(false);
        inboundForm.resetFields();
        loadData();
      } else {
        message.error(res?.message || '到货入库失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return; // form validation
      message.error((e as Error)?.message || '到货入库失败');
    }
  }, [inboundModalRecord, inboundForm, user, message, loadData]);

  const handleReceiveAll = useCallback(async () => {
    if (actionLoading) return; // 防重入
    const pendingItems = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING);
    if (pendingItems.length === 0) {
      message.info('没有待采购的物料');
      return;
    }
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    if (!receiverId && !receiverName) {
      message.error('领取人信息缺失，请重新登录');
      return;
    }
    setActionLoading(true);
    try {
      const purchaseIds = pendingItems.map(p => String(p.id || '')).filter(Boolean);
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-receive', {
        purchaseIds,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`已批量领取 ${pendingItems.length} 项物料`);
        loadData();
      } else {
        message.error(res?.message || '批量领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '批量领取失败');
    } finally {
      setActionLoading(false);
    }
  }, [actionLoading, purchases, user, message, loadData]);

  const handleConfirmReturn = useCallback(async (record: MaterialPurchase) => {
    setReturnModalRecord(record);
    returnForm.setFieldsValue({ quantity: Number(record.arrivedQuantity || record.purchaseQuantity || 0) });
    setReturnModalVisible(true);
  }, [returnForm]);

  const doReturnConfirm = useCallback(async () => {
    try {
      const values = await returnForm.validateFields();
      const record = returnModalRecord;
      if (!record) return;
      const purchaseId = String(record?.id || '').trim();
      if (!purchaseId) return;
      const confirmerId = String(user?.id || '').trim();
      const confirmerName = String(user?.name || user?.username || '').trim();
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm', {
        purchaseId,
        returnQuantity: values.quantity,
        confirmerId,
        confirmerName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 回料确认成功`);
        setReturnModalVisible(false);
        loadData();
      } else {
        message.error(res?.message || '回料确认失败');
      }
    } catch (e) {
      if (e && typeof e === 'object' && 'errorFields' in e) return;
      message.error((e as Error)?.message || '回料确认失败');
    }
  }, [returnModalRecord, returnForm, user, message, loadData]);

  const handleReturnReset = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/return-confirm/reset', {
        purchaseId,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已退回`);
        loadData();
      } else {
        message.error(res?.message || '退回失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '退回失败');
    }
  }, [message, loadData]);

  const handleCancelReceive = useCallback(async (record: MaterialPurchase) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/cancel-receive', {
        purchaseId,
        reason: '手动取消领取',
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已取消领取`);
        loadData();
      } else {
        message.error(res?.message || '取消领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '取消领取失败');
    }
  }, [message, loadData]);

  const handleBatchReturn = useCallback(async () => {
    const returnable = purchases.filter(p => {
      const s = normalizeStatus(p.status);
      return (s === MATERIAL_PURCHASE_STATUS.RECEIVED || s === MATERIAL_PURCHASE_STATUS.PARTIAL || s === MATERIAL_PURCHASE_STATUS.COMPLETED)
        && Number(p?.returnConfirmed || 0) !== 1;
    });
    if (returnable.length === 0) {
      message.info('没有可回料确认的物料');
      return;
    }
    const contentEl = (
      <div>
        <p>确认回料以下 {returnable.length} 项物料：</p>
        <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 8, fontSize: 12 }}>
          {returnable.map((item, idx) => (
            <div key={idx} style={{ padding: '6px 0', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between' }}>
              <span>{item.materialName || item.materialCode} · {item.color || '-'}</span>
              <span style={{ color: 'var(--color-primary)' }}>到货 {item.arrivedQuantity || item.purchaseQuantity}{item.unit || ''}</span>
            </div>
          ))}
        </div>
      </div>
    );
    modal.confirm({
      title: '批量回料确认',
      content: contentEl,
      okText: '确认回料',
      cancelText: '取消',
      width: '40vw',
      onOk: async () => {
        setActionLoading(true);
        try {
          const confirmerId = String(user?.id || '').trim();
          const confirmerName = String(user?.name || user?.username || '').trim();
          const purchaseIds = returnable.map(p => String(p.id || '')).filter(Boolean);
          const res = await api.post<{ code: number; message?: string }>('/production/purchase/batch-return-confirm', {
            purchaseIds,
            confirmerId,
            confirmerName,
          });
          if (res?.code === 200) {
            message.success(`已批量回料确认 ${returnable.length} 项`);
            loadData();
          } else {
            message.error(res?.message || '批量回料确认失败');
          }
        } catch (e) {
          message.error((e as Error)?.message || '批量回料确认失败');
        } finally {
          setActionLoading(false);
        }
      },
    });
  }, [purchases, user, message, modal, loadData]);

  const handleConfirmComplete = useCallback(async () => {
    const awaiting = purchases.filter(p => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.AWAITING_CONFIRM);
    if (awaiting.length === 0) {
      message.info('没有待确认完成的物料');
      return;
    }
    setConfirmCompleteLoading(true);
    try {
      for (const record of awaiting) {
        await api.post('/production/purchase/confirm-complete', { purchaseId: record.id });
      }
      message.success(`已确认完成 ${awaiting.length} 项`);
      loadData();
    } catch (e) {
      message.error((e as Error)?.message || '确认完成失败');
    } finally {
      setConfirmCompleteLoading(false);
    }
  }, [purchases, message, loadData]);

  const handleWarehousePick = useCallback(async (record: MaterialPurchase, pickQty: number) => {
    const purchaseId = String(record?.id || '').trim();
    if (!purchaseId) return;
    const safePickQty = Number.isFinite(pickQty) ? Math.floor(pickQty) : 0;
    if (safePickQty <= 0) {
      message.error('领取数量无效，请检查库存数据');
      return;
    }
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    try {
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/warehouse-pick', {
        purchaseId,
        pickQty: safePickQty,
        receiverId,
        receiverName,
      });
      if (res?.code === 200) {
        message.success(`${record.materialName || record.materialCode} 已提交出库申请`);
        loadData();
      } else {
        message.error(res?.message || '出库领取失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '出库领取失败');
    }
  }, [user, message, loadData]);

  const handleQualityIssue = useCallback((record: MaterialPurchase) => {
    message.info(`品质异常：${record.materialName || record.materialCode}，请前往物料采购页面处理`);
  }, [message]);

  const orderColorSet = useMemo(() => {
    const colors = new Set<string>();
    orderLines.forEach(line => {
      const c = String(line?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return colors;
  }, [orderLines]);

  const purchaseColorSet = useMemo(() => {
    const colors = new Set<string>();
    purchases.forEach(p => {
      const c = String(p?.color || '').trim();
      if (c && c !== '-') colors.add(c);
    });
    return colors;
  }, [purchases]);

  const missingColors = useMemo(() => {
    if (orderColorSet.size <= 1) return [];
    const missing: string[] = [];
    orderColorSet.forEach(c => {
      if (!purchaseColorSet.has(c)) missing.push(c);
    });
    return missing;
  }, [orderColorSet, purchaseColorSet]);

  const bomIncomplete = useMemo(() => {
    if (purchases.length === 0) return true;
    const REQUIRED = ['materialType', 'materialCode', 'materialName', 'unit', 'supplierName'] as (keyof MaterialPurchase)[];
    return purchases.some((item) =>
      REQUIRED.some((field) => {
        const val = item[field];
        return val === undefined || val === null || String(val).trim() === '';
      })
    );
  }, [purchases]);

  const canProcure = !bomIncomplete;

  const handleStartEdit = useCallback(() => {
    if (purchases.length === 0 && orderColorSet.size > 1) {
      const autoRows: MaterialPurchase[] = Array.from(orderColorSet).map((color) => ({
        id: `tmp_${Date.now()}_${color}`,
        purchaseNo: '',
        supplierId: '',
        orderNo: orderNo || order?.orderNo || '',
        styleNo: order?.styleNo || '',
        styleName: order?.styleName || '',
        styleId: order?.styleId || '',
        materialType: 'fabricA',
        materialCode: '',
        materialName: '',
        unit: '',
        color,
        size: '',
        specifications: '',
        fabricComposition: '',
        fabricWeight: '',
        purchaseQuantity: 0,
        arrivedQuantity: 0,
        unitPrice: 0,
        totalAmount: 0,
        supplierName: '',
        status: MATERIAL_PURCHASE_STATUS.PENDING,
      } as MaterialPurchase));
      setEditableData(autoRows);
    } else {
      setEditableData([...purchases]);
    }
    setEditing(true);
  }, [purchases, orderColorSet, orderNo, order]);

  const sections = useMemo(() => {
    return ([
      { key: 'fabric', title: '面料' },
      { key: 'lining', title: '里料' },
      { key: 'accessory', title: '辅料' },
    ] as const).map(sec => {
      const data = purchases.filter(p => getMaterialTypeCategory(p.materialType) === sec.key);
      return { ...sec, data };
    }).filter(x => x.data.length > 0);
  }, [purchases]);

  const displayData = editing ? editableData : purchases;

  const editColumns = useMemo(() => {
    const rid = (r: MaterialPurchase) => String(r.id || '');
    return [
      {
        title: '物料类型',
        dataIndex: 'materialType',
        key: 'materialType',
        width: 110,
        render: (v: unknown, r: MaterialPurchase) => (
          <Select
            value={String(v || 'fabricA')}
            options={MATERIAL_TYPE_OPTIONS}
            onChange={(val) => handleUpdateRow(rid(r), 'materialType', val)}
            style={{ width: '100%' }}
            size="small"
          />
        ),
      },
      {
        title: '物料编码',
        dataIndex: 'materialCode',
        key: 'materialCode',
        width: 130,
        render: (v: unknown, r: MaterialPurchase) => (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'materialCode', e.target.value)}
            placeholder="输入编码"
            size="small"
            suffix={<span style={{ fontSize: 10, color: 'var(--color-primary)', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); handleOpenMaterialModal(rid(r)); }}>选用</span>}
          />
        ),
      },
      {
        title: '物料名称',
        dataIndex: 'materialName',
        key: 'materialName',
        width: 160,
        ellipsis: true,
        render: (v: unknown, r: MaterialPurchase) => (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'materialName', e.target.value)}
            placeholder="物料名称"
            size="small"
          />
        ),
      },
      {
        title: '成分',
        dataIndex: 'fabricComposition',
        key: 'fabricComposition',
        width: 120,
        ellipsis: true,
        render: (v: unknown, r: MaterialPurchase) => (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'fabricComposition', e.target.value)}
            placeholder="成分"
            size="small"
          />
        ),
      },
      {
        title: '克重',
        dataIndex: 'fabricWeight',
        key: 'fabricWeight',
        width: 80,
        render: (v: unknown, r: MaterialPurchase) => (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'fabricWeight', e.target.value)}
            placeholder="克重"
            size="small"
          />
        ),
      },
      {
        title: '颜色',
        dataIndex: 'color',
        key: 'color',
        width: 90,
        render: (v: unknown, r: MaterialPurchase) =>
          orderColors.length > 1 ? (
            <Select
              value={String(v || '') || undefined}
              options={orderColors.filter(Boolean).map(c => ({ label: c, value: c }))}
              onChange={(val) => handleUpdateRow(rid(r), 'color', val)}
              placeholder="颜色"
              allowClear
              style={{ width: '100%' }}
              size="small"
            />
          ) : (
            <Input
              value={String(v || '')}
              onChange={(e) => handleUpdateRow(rid(r), 'color', e.target.value)}
              placeholder="颜色"
              size="small"
            />
          ),
      },
      {
        title: '规格',
        dataIndex: 'specifications',
        key: 'specifications',
        width: 100,
        render: (v: unknown, r: MaterialPurchase) => (
          <Input
            value={String(v || '')}
            onChange={(e) => handleUpdateRow(rid(r), 'specifications', e.target.value)}
            placeholder="规格"
            size="small"
          />
        ),
      },
      {
        title: '单位',
        dataIndex: 'unit',
        key: 'unit',
        width: 80,
        render: (v: unknown, r: MaterialPurchase) => (
          <DictAutoComplete
            dictType="material_unit"
            value={String(v || '')}
            onChange={(val: string) => handleUpdateRow(rid(r), 'unit', val)}
            placeholder="单位"
            style={{ width: '100%' }}
            size="small"
          />
        ),
      },
      {
        title: '采购数量',
        dataIndex: 'purchaseQuantity',
        key: 'purchaseQuantity',
        width: 100,
        align: 'right' as const,
        render: (v: unknown, r: MaterialPurchase) => (
          <InputNumber
            value={Number(v || 0)}
            min={0}
            precision={2}
            style={{ width: '100%' }}
            onChange={(val) => handleUpdateRow(rid(r), 'purchaseQuantity', val ?? 0)}
            size="small"
          />
        ),
      },
      {
        title: '单价',
        dataIndex: 'unitPrice',
        key: 'unitPrice',
        width: 100,
        align: 'right' as const,
        render: (v: unknown, r: MaterialPurchase) => (
          <InputNumber
            value={Number(v || 0)}
            min={0}
            precision={2}
            style={{ width: '100%' }}
            onChange={(val) => handleUpdateRow(rid(r), 'unitPrice', val ?? 0)}
            size="small"
            addonAfter="元"
          />
        ),
      },
      {
        title: '供应商',
        dataIndex: 'supplierName',
        key: 'supplierName',
        width: 140,
        ellipsis: true,
        render: (v: unknown, r: MaterialPurchase) => (
          <SupplierSelect
            value={String(v || '')}
            placeholder="供应商"
            style={{ width: '100%' }}
            onChange={(_val: string, option: any) => {
              handleUpdateRow(rid(r), 'supplierName', _val);
              const sel = Array.isArray(option) ? option[0] : option;
              if (sel) {
                handleUpdateRow(rid(r), 'supplierId', sel.id || '');
                handleUpdateRow(rid(r), 'supplierContactPerson', sel.supplierContactPerson || '');
                handleUpdateRow(rid(r), 'supplierContactPhone', sel.supplierContactPhone || '');
              }
            }}
          />
        ),
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        render: (_: unknown, r: MaterialPurchase) => (
          <RowActions
            maxInline={2}
            actions={[
              {
                key: 'select',
                label: '选用',
                title: '从物料资料选用',
                onClick: () => handleOpenMaterialModal(rid(r)),
              },
              {
                key: 'delete',
                label: '删除',
                title: '删除',
                danger: true as const,
                onClick: () => handleRemoveRow(rid(r)),
              },
            ]}
          />
        ),
      },
    ];
  }, [handleUpdateRow, handleOpenMaterialModal, handleRemoveRow, orderColors]);

  const columns = useMemo(() => [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: unknown) => <MaterialTypeTag value={v} />,
    },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 110, render: (v: unknown) => v || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 80,
      render: (v: unknown) => {
        const c = String(v || '').trim();
        return c || <span style={{ color: 'var(--color-text-quaternary)' }}>-</span>;
      },
    },
    {
      title: '规格/幅宽',
      key: 'specWidth',
      width: 130,
      ellipsis: true,
      render: (_: unknown, r: MaterialPurchase) => {
        const spec = String(r.specifications || '').trim();
        const w = String((r as any).fabricWidth || '').trim();
        if (spec && w) return `${spec} / ${w}`;
        return spec || w || '-';
      },
    },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, render: (v: unknown) => v || '-' },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => formatMaterialQuantity(v),
    },
    {
      title: '参考公斤数',
      key: 'referenceKilograms',
      width: 110,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => formatReferenceKilograms(r.purchaseQuantity, (r as any).conversionRate, r.unit),
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown, r: MaterialPurchase) => {
        const qty = Number(v ?? 0);
        const purchased = Number(r.purchaseQuantity ?? 0);
        const canReceive = purchased > qty;
        return (
          <span
            style={{
              color: canReceive ? 'var(--color-primary)' : undefined,
              cursor: canReceive ? 'pointer' : undefined,
              textDecoration: canReceive ? 'underline' : undefined,
            }}
            title={canReceive ? '点击到货入库' : undefined}
            onClick={() => { if (canReceive) handleReceive(r); }}
          >
            {formatMaterialQuantity(v)}
          </span>
        );
      },
    },
    {
      title: '仓库库存',
      key: 'warehouseStock',
      width: 90,
      align: 'right' as const,
      render: (_: unknown, r: MaterialPurchase) => {
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
              if (hasStock) {
                const safeStock = Number.isFinite(stock) ? Math.floor(stock as number) : 0;
                const remaining = Math.max(0, Number(r.purchaseQuantity || 0) - Number(r.arrivedQuantity || 0));
                const requiredQty = remaining > 0
                  ? Math.floor(remaining)
                  : (Number.isFinite(Number(r.purchaseQuantity)) && Number(r.purchaseQuantity) > 0
                      ? Math.floor(Number(r.purchaseQuantity))
                      : safeStock);
                const pickQty = Math.min(safeStock, requiredQty);
                if (pickQty > 0) {
                  handleWarehousePick(r, pickQty);
                }
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
      width: 100,
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
      width: 110,
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
      width: 130,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchase) => (
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
      render: (status: MaterialPurchase['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '回料时间',
      dataIndex: 'returnConfirmTime',
      key: 'returnConfirmTime',
      width: 140,
      render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (String(v || '').slice(0, 16).replace('T', ' ') || '-') : '-'),
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record: MaterialPurchase) => {
        const status = normalizeStatus(record.status);
        const stock = stockMap[String(record.id)];
        const hasStock = stock != null && stock > 0;
        const isWarehousePending = status === MATERIAL_PURCHASE_STATUS.WAREHOUSE_PENDING;
        return (
          <Space size={4}>
            {isWarehousePending ? (
              <Tag color="blue">待仓库出库</Tag>
            ) : (
              <Button
                type="link"
                size="small"
                disabled={status !== MATERIAL_PURCHASE_STATUS.PENDING || (bomIncomplete && !hasStock)}
                onClick={() => {
                  if (hasStock) {
                    const safeStock = Number.isFinite(stock) ? Math.floor(stock as number) : 0;
                    const remaining = Math.max(0, Number(record.purchaseQuantity || 0) - Number(record.arrivedQuantity || 0));
                    const requiredQty = remaining > 0
                      ? Math.floor(remaining)
                      : (Number.isFinite(Number(record.purchaseQuantity)) && Number(record.purchaseQuantity) > 0
                          ? Math.floor(Number(record.purchaseQuantity))
                          : safeStock);
                    const pickQty = Math.min(safeStock, requiredQty);
                    if (pickQty > 0) {
                      handleWarehousePick(record, pickQty);
                    }
                  } else {
                    handleReceive(record);
                  }
                }}
              >
                {hasStock ? '出库领取' : (bomIncomplete ? '采购（信息不全）' : '采购')}
              </Button>
            )}
            {/* 到货入库按钮：将物料入库到仓库库存 */}
            {status === MATERIAL_PURCHASE_STATUS.PENDING && (
              <Button
                type="link"
                size="small"
                onClick={() => handleInbound(record)}
              >
                到货入库
              </Button>
            )}
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleQualityIssue(record)}
            >
              品质异常
            </Button>
            <Button
              type="link"
              size="small"
              disabled={!(status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)}
              onClick={() => handleConfirmReturn(record)}
            >
              {Number(record?.returnConfirmed || 0) === 1 ? '追加回料' : '回料确认'}
            </Button>
            {(Number(record?.returnConfirmed || 0) === 1 || status === MATERIAL_PURCHASE_STATUS.COMPLETED) && (
              <Button
                type="link"
                size="small"
                onClick={() => handleReturnReset(record)}
              >
                退回
              </Button>
            )}
            {status !== MATERIAL_PURCHASE_STATUS.PENDING && status !== MATERIAL_PURCHASE_STATUS.COMPLETED && status !== MATERIAL_PURCHASE_STATUS.CANCELLED && Number(record?.returnConfirmed || 0) !== 1 && (
              <Button
                type="link"
                size="small"
                danger
                onClick={() => handleCancelReceive(record)}
              >
                取消领取
              </Button>
            )}
          </Space>
        );
      },
    },
  ], [handleReceive, handleInbound, handleConfirmReturn, handleReturnReset, handleCancelReceive, handleWarehousePick, handleQualityIssue, stockMap, bomIncomplete]);

  return (
    <Spin spinning={loading}>
      <ProductionOrderHeader
        order={order}
        orderLines={orderLines}
        orderNo={firstPurchase?.orderNo || orderNo}
        styleNo={firstPurchase?.styleNo || order?.styleNo || styleNo}
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
            columns={editColumns as any}
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
                  columns={columns}
                />
              ),
            }))}
          />
        )}
      </Card>

      <ResizableModal
        title="面辅料选择"
        open={materialModalOpen}
        onCancel={() => setMaterialModalOpen(false)}
        footer={null}
        width="60vw"
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
          <Button onClick={handleSearchMaterial} loading={materialLoading}>搜索</Button>
        </div>
        <ResizableTable
          storageKey="purchase-inline-material-select"
          loading={materialLoading}
          dataSource={materialList}
          rowKey={(record: Record<string, unknown>) => String(record.id || record.materialCode || '')}
          pagination={{
            current: materialPage,
            pageSize: materialPageSize,
            total: materialTotal,
            showTotal: (total) => `共 ${total} 条`,
            onChange: (page, pageSize) => { setMaterialPage(page); setMaterialPageSize(pageSize); },
            showSizeChanger: true,
            pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
          }}
          onRow={(record) => ({
            onDoubleClick: async () => {
              await handleUseMaterial(record as Record<string, unknown>);
            },
          })}
          columns={[
            {
              title: '图片',
              dataIndex: 'image',
              width: 80,
              render: (value: unknown) => {
                const raw = String(value || '').trim();
                if (!raw) return null;
                const url = getFullAuthedFileUrl(raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`);
                return (
                  <Image
                    src={url}
                    width={40}
                    height={40}
                    style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border)' }}
                    preview={{ src: url }}
                  />
                );
              },
            },
            { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
            {
              title: '成分',
              dataIndex: 'fabricComposition',
              key: 'fabricComposition',
              width: 140,
              ellipsis: true,
              render: (value: unknown) => String(value || '').trim() || '-',
            },
            {
              title: '克重',
              dataIndex: 'fabricWeight',
              key: 'fabricWeight',
              width: 90,
              render: (value: unknown) => String(value || '').trim() || '-',
            },
            {
              title: '物料类型',
              dataIndex: 'materialType',
              width: 90,
              render: (value: unknown) => getMaterialTypeLabel(value),
            },
            { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
            { title: '规格/幅宽', dataIndex: 'specifications', width: 120, ellipsis: true },
            { title: '单位', dataIndex: 'unit', width: 70 },
            {
              title: '供应商',
              dataIndex: 'supplierName',
              width: 140,
              ellipsis: true,
              render: (_: unknown, record: Record<string, unknown>) => (
                <SupplierNameTooltip
                  name={record.supplierName}
                  contactPerson={record.supplierContactPerson}
                  contactPhone={record.supplierContactPhone}
                />
              ),
            },
            {
              title: '单价',
              dataIndex: 'unitPrice',
              width: 90,
              render: (value: unknown) => `¥${Number(value || 0).toFixed(2)}`,
            },
            {
              title: '操作',
              dataIndex: 'operation',
              width: 90,
              render: (_: unknown, record: Record<string, unknown>) => (
                <RowActions
                  maxInline={1}
                  actions={[
                    {
                      key: 'use',
                      label: '选用',
                      title: '选用',
                      onClick: async () => { await handleUseMaterial(record); },
                      primary: true,
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </ResizableModal>

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
