import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import api, { parseProductionOrderLines } from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { getMaterialTypeCategory } from '@/utils/materialType';
import { buildSizePairs } from '@/modules/production/pages/Production/MaterialPurchase/utils';
import type { MaterialPurchase, ProductionOrder } from '@/types/production';
import {
  InlinePurchasePanelProps,
  sortPurchases,
  unwrapRecords,
} from './InlinePurchasePanel.helpers';
import { usePurchaseEditActions } from './hooks/usePurchaseEditActions';
import { usePurchaseReceiveActions } from './hooks/usePurchaseReceiveActions';
import { usePurchaseReturnActions } from './hooks/usePurchaseReturnActions';

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

  // ── 编辑相关 actions（拆分到 ./hooks/usePurchaseEditActions）──
  const editActions = usePurchaseEditActions({
    message,
    editableData,
    setEditableData,
    editing,
    setEditing,
    saving,
    setSaving,
    materialTargetRowId,
    setMaterialTargetRowId,
    materialModalOpen,
    setMaterialModalOpen,
    purchases,
    loadData,
    getOrderStyleInfo,
    sourceType,
    patternId,
    order,
    orderColorSet,
    orderNo,
  });

  // ── 到货/入库/取消/出库 actions（拆分到 ./hooks/usePurchaseReceiveActions）──
  const receiveActions = usePurchaseReceiveActions({
    message,
    user,
    purchases,
    loadData,
    receiveModalRecord,
    setReceiveModalRecord,
    receiveModalVisible,
    setReceiveModalVisible,
    receiveForm,
    inboundModalRecord,
    setInboundModalRecord,
    inboundModalVisible,
    setInboundModalVisible,
    inboundForm,
    actionLoading,
    setActionLoading,
  });

  // ── 回料/确认完成/品质异常 actions（拆分到 ./hooks/usePurchaseReturnActions）──
  const returnActions = usePurchaseReturnActions({
    message,
    modal,
    user,
    purchases,
    loadData,
    returnModalRecord,
    setReturnModalRecord,
    returnModalVisible,
    setReturnModalVisible,
    returnForm,
    actionLoading,
    setActionLoading,
    confirmCompleteLoading,
    setConfirmCompleteLoading,
  });

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
    ...editActions,
    setMaterialModalOpen,
    ...receiveActions,
    setReceiveModalVisible,
    setInboundModalVisible,
    ...returnActions,
    setReturnModalVisible,
  };
};

export default useInlinePurchaseData;
