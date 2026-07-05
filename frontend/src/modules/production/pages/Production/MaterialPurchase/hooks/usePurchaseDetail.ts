/**
 * usePurchaseDetail — 采购单详情面板状态：订单信息/采购记录/颜码行
 * ~135 lines (target ≤ 200)
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import api, { parseProductionOrderLines } from '@/utils/api';
import { productionPatternApi } from '@/services/production/productionApi';
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

      // 样衣模式下没有大货订单，需要查样衣详情构造订单头信息（款号/款名/颜色/码数/下单数量/封面图）
      // 否则订单头区域全部显示 '-'，用户看不到基础信息
      // 参考 InlinePurchasePanel.tsx 的修复模式
      const patternProductionId = String((currentPurchase as any)?.patternProductionId || '').trim();
      let orderRecord: ProductionOrder | null = null;
      if (patternProductionId) {
        try {
          const patternRes = await productionPatternApi.getPatternDetail(patternProductionId);
          if (patternRes?.code === 200 && patternRes?.data) {
            const p = patternRes.data;
            let pColor = String(p.color || (currentPurchase as any)?.orderColor || currentPurchase?.color || '').trim();
            let pSize = String(p.size || '').trim();
            let pQty = Number(p.quantity || (currentPurchase as any)?.orderQuantity || 0);

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
              // 如果解析出明细，汇总给 pColor/pSize/pQty 用于订单头兜底显示
              if (orderDetails.length > 0) {
                if (!pColor) {
                  const colors = Array.from(new Set(orderDetails.map(d => d.color).filter(Boolean)));
                  pColor = colors.length === 1 ? colors[0] : (colors.length > 1 ? `${colors.length}色：${colors.join(' / ')}` : '');
                }
                if (!pSize) {
                  const sizes2 = Array.from(new Set(orderDetails.map(d => d.size).filter(Boolean)));
                  pSize = sizes2.length === 1 ? sizes2[0] : (sizes2.length > 1 ? `${sizes2.length}码：${sizes2.join(' / ')}` : '');
                }
                if (!pQty) pQty = orderDetails.reduce((s, d) => s + d.quantity, 0);
              }
            }

            // 构造伪 order，字段对齐订单头期望的形状
            // orderDetails 让 parseProductionOrderLines 能正常解析出 lines
            orderRecord = {
              id: String(p.id || patternProductionId),
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
          }
        } catch (e: unknown) {
          console.warn('[usePurchaseDetail] 查询样衣详情失败:', (e as Error)?.message || e);
        }
      }
      setDetailOrder(orderRecord);

      // 优先用样衣详情解析出的明细行；没有再用采购记录汇总；最后兜底 '-'
      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setDetailOrderLines(parsedLines);
      } else if (records.length > 0) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo, currentPurchase?.id, dialogMode, visible, loadDetailByOrderNo, loadDetailByStyleNo]);

  return {
    detailOrder, detailOrderLines, detailPurchases, detailLoading, detailSizePairs,
    loadDetailByOrderNo, loadDetailByStyleNo,
  };
}
