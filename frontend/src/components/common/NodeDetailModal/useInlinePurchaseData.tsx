import { useCallback, useEffect, useState } from 'react';
import { App, Form } from 'antd';
import { useNavigate } from 'react-router-dom';
import api, { parseProductionOrderLines } from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
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
import { usePurchaseStock } from './hooks/usePurchaseStock';
import { usePurchaseComputed } from './hooks/usePurchaseComputed';
import {
  buildFakeOrderFromPattern,
  deriveOrderLinesFromOrder,
  deriveOrderLinesFromPurchases,
} from './utils';

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

  const firstPurchase = purchases[0] || null;

  const { stockMap } = usePurchaseStock({ orderNo });

  const computed = usePurchaseComputed({
    purchases,
    orderLines,
    editing,
    editableData,
  });

  const loadSamplePurchases = useCallback(async (): Promise<{ records: MaterialPurchase[]; orderRecord: ProductionOrder | null }> => {
    let records: MaterialPurchase[] = [];
    let orderRecord: ProductionOrder | null = null;

    try {
      const sampleRes = await api.get<{ code: number; data: { records: MaterialPurchase[] } }>(
        '/production/purchase/list',
        { params: { page: 1, pageSize: 200, patternProductionId: patternId, sourceType: 'sample', materialType: '', status: '' } }
      );
      records = sortPurchases(unwrapRecords(sampleRes));
    } catch (e) { console.error('[InlinePurchasePanel] 加载样衣采购列表失败:', e); }

    try {
      const patternRes = await api.get<{ code: number; data: Record<string, unknown> }>(
        `/production/pattern/${patternId}`
      );
      if (patternRes?.code === 200 && patternRes?.data) {
        orderRecord = buildFakeOrderFromPattern(
          patternRes.data,
          patternId!,
          styleNo,
          propColor,
          propQuantity
        );
        setOrder(orderRecord);
      }
    } catch (e: any) {
      console.warn('[InlinePurchasePanel] 查询样衣详情失败:', e?.message || e);
    }

    return { records, orderRecord };
  }, [patternId, styleNo, propColor, propQuantity]);

  const loadOrderPurchases = useCallback(async (): Promise<{ records: MaterialPurchase[]; orderRecord: ProductionOrder | null }> => {
    const no = String(orderNo || '').trim();
    if (!no) {
      return { records: [], orderRecord: null };
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
    const orderRecord = orderRecords[0] || null;
    setOrder(orderRecord);

    let records = sortPurchases(unwrapRecords(purchaseRes));

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

    return { records, orderRecord };
  }, [orderNo]);

  const updateOrderLinesAndSizes = useCallback((orderRecord: ProductionOrder | null, records: MaterialPurchase[]) => {
    const parsedLines = parseProductionOrderLines(orderRecord);
    if (parsedLines.length) {
      setOrderLines(parsedLines);
      setSizePairs(buildSizePairs(parsedLines));
    } else if (orderRecord) {
      const lines = deriveOrderLinesFromOrder(orderRecord);
      setOrderLines(lines);
      setSizePairs(buildSizePairs(lines));
    } else if (records.length > 0) {
      const lines = deriveOrderLinesFromPurchases(records);
      setOrderLines(lines);
      setSizePairs(buildSizePairs(lines));
    } else {
      setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      setSizePairs([]);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let records: MaterialPurchase[] = [];
      let orderRecord: ProductionOrder | null = null;

      if (sourceType === 'sample' && patternId) {
        const result = await loadSamplePurchases();
        records = result.records;
        orderRecord = result.orderRecord;
      } else {
        const result = await loadOrderPurchases();
        records = result.records;
        orderRecord = result.orderRecord;
        if (!orderNo) {
          setLoading(false);
          return;
        }
      }

      setPurchases(records);
      updateOrderLinesAndSizes(orderRecord, records);
    } catch {
      setPurchases([]);
      setOrder(null);
      setOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      setSizePairs([]);
    } finally {
      setLoading(false);
    }
  }, [sourceType, patternId, orderNo, loadSamplePurchases, loadOrderPurchases, updateOrderLinesAndSizes]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const getOrderStyleInfo = useCallback(() => {
    return {
      orderId: orderId || order?.id || firstPurchase?.orderId || '',
      orderNo: String(orderNo || firstPurchase?.orderNo || '').trim(),
      styleNo: order?.styleNo || firstPurchase?.styleNo || styleNo || '',
      styleName: order?.styleName || firstPurchase?.styleName || '',
      styleId: order?.styleId || firstPurchase?.styleId || '',
      styleCover: order?.styleCover || firstPurchase?.styleCover || '',
    };
  }, [orderId, orderNo, order, firstPurchase, styleNo]);

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
    orderColorSet: computed.orderColorSet,
    orderNo,
  });

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

  return {
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
    orderColors: computed.orderColors,
    orderColorSet: computed.orderColorSet,
    purchaseColorSet: computed.purchaseColorSet,
    missingColors: computed.missingColors,
    bomIncomplete: computed.bomIncomplete,
    canProcure: computed.canProcure,
    sections: computed.sections,
    displayData: computed.displayData,
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
