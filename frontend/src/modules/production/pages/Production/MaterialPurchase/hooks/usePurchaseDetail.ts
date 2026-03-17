/**
 * usePurchaseDetail — 采购单详情面板状态：订单信息/采购记录/颜码行
 * ~135 lines (target ≤ 200)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api, { parseProductionOrderLines } from '@/utils/api';
import type { MaterialPurchase as MaterialPurchaseType, ProductionOrder } from '@/types/production';
import { getMaterialTypeSortKey } from '@/utils/materialType';
import { buildSizePairs } from '../utils';

interface UsePurchaseDetailOptions {
  currentPurchase: MaterialPurchaseType | null;
  visible: boolean;
  dialogMode: 'view' | 'create' | 'preview';
}

const unwrapPurchaseRecords = (res: any): MaterialPurchaseType[] => {
  if (res?.code !== 200) return [];
  return (
    (Array.isArray(res?.data?.records) && res.data.records) ||
    (Array.isArray(res?.data?.list) && res.data.list) ||
    (Array.isArray(res?.data?.items) && res.data.items) ||
    (Array.isArray(res?.data?.rows) && res.data.rows) ||
    (Array.isArray(res?.data) && res.data) ||
    []
  );
};

const sortPurchases = (arr: MaterialPurchaseType[]) =>
  [...arr].sort((a, b) => {
    const ka = getMaterialTypeSortKey(a?.materialType);
    const kb = getMaterialTypeSortKey(b?.materialType);
    return ka !== kb ? ka.localeCompare(kb) : String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
  });

export function usePurchaseDetail({ currentPurchase, visible, dialogMode }: UsePurchaseDetailOptions) {
  const [detailOrder, setDetailOrder] = useState<ProductionOrder | null>(null);
  const [detailOrderLines, setDetailOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [detailPurchases, setDetailPurchases] = useState<MaterialPurchaseType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const _orderExistCacheRef = useRef<Map<string, boolean>>(new Map());

  const detailSizePairs = useMemo(() => buildSizePairs(detailOrderLines), [detailOrderLines]);

  const loadDetailByOrderNo = useCallback(async (orderNo: string) => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    setDetailLoading(true);
    try {
      const [orderRes, purchaseRes] = await Promise.all([
        api.get<{ code: number; data: { records: ProductionOrder[] } }>('/production/order/list', { params: { page: 1, pageSize: 1, orderNo: no } }),
        api.get<{ code: number; data: { records: MaterialPurchaseType[] } }>('/production/purchase/list', { params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' } }),
      ]);
      const orderRecords: ProductionOrder[] = (orderRes?.code === 200 ? (
        (Array.isArray(orderRes?.data?.records) && orderRes.data.records) ||
        (Array.isArray((orderRes?.data as any)?.list) && (orderRes?.data as any).list) ||
        []
      ) : []);
      const orderRecord = orderRecords[0] || null;
      setDetailOrder(orderRecord);

      const records = sortPurchases(unwrapPurchaseRecords(purchaseRes));
      setDetailPurchases(records);

      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setDetailOrderLines(parsedLines);
      } else if (orderRecord) {
        const fc = String(orderRecord?.color || '').trim();
        const fs = String(orderRecord?.size || '').trim();
        const fq = Number(orderRecord?.orderQuantity || 0);
        setDetailOrderLines([(fc || fs || fq) ? { color: fc, size: fs, quantity: fq } : { color: '-', size: '-', quantity: 0 }]);
      } else if (records.length > 0) {
        const colors = new Set<string>(); const sizes = new Set<string>(); let totalQty = 0;
        records.forEach((p: any) => {
          const c = String(p?.color || '').trim(); const s = String(p?.size || '').trim();
          if (c && c !== '-') colors.add(c); if (s && s !== '-') sizes.add(s);
          if (Number(p?.purchaseQuantity || 0) > 0) totalQty += Number(p?.purchaseQuantity || 0);
        });
        setDetailOrderLines([{ color: Array.from(colors).join(',') || '-', size: Array.from(sizes).join(',') || '-', quantity: totalQty || 0 }]);
      } else {
        setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      }
    } catch {
      setDetailOrder(null); setDetailOrderLines([]); setDetailPurchases([]);
    } finally { setDetailLoading(false); }
  }, []);

  // 样衣采购单：按款号加载
  const loadDetailByStyleNo = useCallback(async (styleNo: string, purchaseNo?: string) => {
    const no = String(styleNo || '').trim();
    const pNo = String(purchaseNo || '').trim();
    if (!no && !pNo) return;
    setDetailLoading(true);
    try {
      const purchaseRes = await api.get<{ code: number; data: { records: MaterialPurchaseType[] } }>(
        '/production/purchase/list',
        { params: no ? { page: 1, pageSize: 200, styleNo: no, sourceType: 'sample', materialType: '', status: '' }
                      : { page: 1, pageSize: 200, purchaseNo: pNo, sourceType: 'sample', materialType: '', status: '' } },
      );
      const records = sortPurchases(
        unwrapPurchaseRecords(purchaseRes).filter(r => String((r as any)?.sourceType || '').trim().toLowerCase() === 'sample'),
      );
      setDetailPurchases(records);
      setDetailOrder(null);

      if (records.length > 0) {
        const colors = new Set<string>(); const sizes = new Set<string>();
        let totalQty = 0; let orderQty = 0; let orderColor = '';
        records.forEach((p: any) => {
          const c = String(p?.color || '').trim(); const sc = String(p?.orderColor || '').trim();
          const s = String(p?.size || '').trim(); const q = Number(p?.purchaseQuantity || 0); const oq = Number(p?.orderQuantity || 0);
          if (c && c !== '-') colors.add(c); if (s && s !== '-') sizes.add(s);
          if (q > 0) totalQty += q; if (!orderColor && sc && sc !== '-') orderColor = sc;
          if (oq > 0 && orderQty <= 0) orderQty = oq;
        });
        const fallbackOQ = Number((currentPurchase as any)?.orderQuantity || 0);
        const finalQty = orderQty > 0 ? orderQty : (fallbackOQ > 0 ? fallbackOQ : totalQty);
        setDetailOrderLines([{
          color: orderColor || Array.from(colors).join(',') || String((currentPurchase as any)?.orderColor || currentPurchase?.color || ''),
          size: Array.from(sizes).join(',') || (finalQty > 0 ? '总数' : ''),
          quantity: finalQty || 0,
        }]);
      } else {
        setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      }
    } catch {
      setDetailOrder(null); setDetailOrderLines([]); setDetailPurchases([]);
    } finally { setDetailLoading(false); }
  }, [currentPurchase]);

  // 每次弹窗打开/切换记录时自动加载详情
  useEffect(() => {
    if (!visible || dialogMode !== 'view') return;
    const no = String(currentPurchase?.orderNo || '').trim();
    if (no && no !== '-') {
      loadDetailByOrderNo(no);
    } else if (currentPurchase) {
      const styleNo = String(currentPurchase?.styleNo || '').trim();
      const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
      if (styleNo) {
        loadDetailByStyleNo(styleNo, purchaseNo);
      } else {
        setDetailLoading(true);
        setDetailOrder(null);
        setDetailOrderLines([{ color: String(currentPurchase?.color || '-'), size: String(currentPurchase?.size || '-'), quantity: Number(currentPurchase?.purchaseQuantity || 0) }]);
        setDetailPurchases([currentPurchase]);
        setDetailLoading(false);
      }
    }
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo, currentPurchase?.id, dialogMode, visible, loadDetailByOrderNo, loadDetailByStyleNo]);

  return {
    detailOrder, detailOrderLines, detailPurchases, detailLoading, detailSizePairs,
    loadDetailByOrderNo, loadDetailByStyleNo,
  };
}
