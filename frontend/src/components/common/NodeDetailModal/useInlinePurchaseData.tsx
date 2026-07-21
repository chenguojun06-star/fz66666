import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import api, { parseProductionOrderLines } from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { buildSizePairs } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import {
  InlinePurchasePanelProps,
  normalizeStatus,
  sortPurchases,
  unwrapRecords,
} from './InlinePurchasePanel.helpers';

const useInlinePurchaseData = (props: InlinePurchasePanelProps) => {
  const { orderId, orderNo, patternId, sourceType = 'order', styleNo, color: propColor, quantity: propQuantity } = props;
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
        } catch (e) { console.error('[InlinePurchasePanel] 加载样衣采购列表失败:', e); }

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

  return {
    // state
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
    // computed
    firstPurchase,
    orderColors,
    orderColorSet,
    purchaseColorSet,
    missingColors,
    bomIncomplete,
    canProcure,
    sections,
    displayData,
    // actions
    loadData,
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
  };
};

export default useInlinePurchaseData;
