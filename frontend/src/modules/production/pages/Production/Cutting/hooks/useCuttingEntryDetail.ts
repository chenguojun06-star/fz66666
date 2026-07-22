import { useEffect, useMemo, useRef, useState } from 'react';
import api, { compareSizeAsc, fetchProductionOrderDetail, parseProductionOrderLines } from '@/utils/api';
import type { StyleBom } from '@/types/style';
import type { MaterialPurchase } from '@/types/production';
import {
  fetchSortedPurchasesByOrderNo,
  type EntryOrderLine,
} from './cuttingBundlesHelpers';

interface UseCuttingEntryDetailOptions {
  activeTask: any;
  orderId: string;
  isEntryPage: boolean;
}

/**
 * 裁剪菲号订单详情子 Hook
 * 管理面辅料采购列表、款式 BOM 纸样用量、订单明细（颜色/尺码/数量）
 */
export function useCuttingEntryDetail({
  activeTask,
  orderId,
  isEntryPage,
}: UseCuttingEntryDetailOptions) {
  // 面辅料采购
  const [entryPurchaseLoading, setEntryPurchaseLoading] = useState(false);
  const [entryPurchases, setEntryPurchases] = useState<MaterialPurchase[]>([]);
  const entryPurchaseReqSeq = useRef(0);

  // 纸样用量（来自款式 BOM sizeUsageMap，按码 m/件）
  const [entrySizeUsageMap, setEntrySizeUsageMap] = useState<Record<string, number>>({});
  const [entryFabricUsageRows, setEntryFabricUsageRows] = useState<Array<{ materialName: string; materialType: string; sizeUsageMap: Record<string, number> }>>([]);
  const entryBomReqSeq = useRef(0);

  // 订单明细
  const [entryOrderDetailLoading, setEntryOrderDetailLoading] = useState(false);
  const [entryColorText, setEntryColorText] = useState('');
  const [entrySizeItems, setEntrySizeItems] = useState<Array<{ size: string; quantity: number }>>([]);
  const [entryOrderLines, setEntryOrderLines] = useState<EntryOrderLine[]>([]);

  const activeOrderNo = useMemo(() => String((activeTask as unknown as any)?.productionOrderNo ?? '').trim(), [activeTask]);
  const activeStyleId = (activeTask as unknown as any)?.styleId;
  const activeStyleNo = (activeTask as unknown as any)?.styleNo;
  const activeTaskId = (activeTask as any)?.id;
  const activeProductionOrderId = (activeTask as unknown as any)?.productionOrderId;

  // 加载款式 BOM 纸样用量（sizeUsageMap）
  useEffect(() => {
    if (!isEntryPage) return;
    const styleRef = String(activeStyleId || '').trim();
    const styleNo = String(activeStyleNo || '').trim();
    const seq = (entryBomReqSeq.current += 1);
    const bomQuery = styleRef
      ? (/^\d+$/.test(styleRef) ? `styleId=${styleRef}` : `styleNo=${encodeURIComponent(styleNo)}`)
      : (styleNo ? `styleNo=${encodeURIComponent(styleNo)}` : '');
    if (!bomQuery) { setEntrySizeUsageMap({}); return; }
    void api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?${bomQuery}`)
      .then((res) => {
        if (seq !== entryBomReqSeq.current) return;
        if (res.code !== 200) { setEntrySizeUsageMap({}); setEntryFabricUsageRows([]); return; }
        const boms = res.data || [];
        const fabricBom = boms.find(
          (b) => String(b?.materialType || '').startsWith('fabric') && b?.sizeUsageMap
        );
        if (!fabricBom?.sizeUsageMap) { setEntrySizeUsageMap({}); } else {
          try {
            const raw = typeof fabricBom.sizeUsageMap === 'string'
              ? JSON.parse(fabricBom.sizeUsageMap as string)
              : fabricBom.sizeUsageMap;
            const clean: Record<string, number> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
              const n = Number(v);
              if (!isNaN(n) && n > 0) clean[k] = n;
            }
            setEntrySizeUsageMap(clean);
          } catch {
            setEntrySizeUsageMap({});
          }
        }
        const fabricRows: Array<{ materialName: string; materialType: string; sizeUsageMap: Record<string, number> }> = [];
        for (const b of boms) {
          if (!b?.sizeUsageMap) continue;
          const mt = String(b?.materialType || '').trim();
          if (!mt.startsWith('fabric') && !mt.includes('rib') && !mt.includes('螺纹') && !mt.includes('罗纹')) continue;
          try {
            const raw = typeof b.sizeUsageMap === 'string' ? JSON.parse(b.sizeUsageMap as string) : b.sizeUsageMap;
            const clean: Record<string, number> = {};
            for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
              const n = Number(v);
              if (!isNaN(n) && n > 0) clean[k] = n;
            }
            if (Object.keys(clean).length > 0) {
              fabricRows.push({
                materialName: String(b?.materialName || b?.materialCode || mt),
                materialType: mt,
                sizeUsageMap: clean,
              });
            }
          } catch { /* skip */ }
        }
        setEntryFabricUsageRows(fabricRows);
      })
      .catch(() => { if (seq === entryBomReqSeq.current) { setEntrySizeUsageMap({}); setEntryFabricUsageRows([]); } });
  }, [isEntryPage, activeStyleId, activeStyleNo]);

  // 加载面辅料采购
  useEffect(() => {
    if (!isEntryPage) return;
    const no = activeOrderNo;
    const seq = (entryPurchaseReqSeq.current += 1);
    if (!no) {
      setEntryPurchases([]);
      setEntryPurchaseLoading(false);
      return;
    }
    setEntryPurchaseLoading(true);
    setEntryPurchases([]);
    fetchSortedPurchasesByOrderNo(no, activeStyleNo)
      .then((list) => { if (seq === entryPurchaseReqSeq.current) setEntryPurchases(list); })
      .finally(() => { if (seq === entryPurchaseReqSeq.current) setEntryPurchaseLoading(false); });
  }, [isEntryPage, activeOrderNo, activeStyleNo]);

  // 加载订单明细
  useEffect(() => {
    if (!isEntryPage) return;
    const detailKey = String(
      orderId
      || activeProductionOrderId
      || activeOrderNo
      || ''
    ).trim();
    if (!detailKey) {
      setEntryOrderDetailLoading(false);
      setEntryColorText('');
      setEntrySizeItems([]);
      setEntryOrderLines([]);
      return;
    }

    let cancelled = false;
    setEntryOrderDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchProductionOrderDetail(detailKey, { acceptAnyData: false });
        if (cancelled) return;
        const lines = detail ? parseProductionOrderLines(detail).slice() : [];
        lines.sort((a: any, b: any) => {
          const ca = String(a?.color || '').trim();
          const cb = String(b?.color || '').trim();
          if (ca && cb) {
            const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
            if (byColor !== 0) return byColor;
          }
          return compareSizeAsc(String(a?.size || ''), String(b?.size || ''));
        });
        const uniqueColors = Array.from(
          new Set(lines.map((x: any) => String(x?.color || '').trim()).filter(Boolean))
        );
        const derivedColor = uniqueColors.length ? uniqueColors.join(' / ') : String((detail as any)?.color || '').trim();
        setEntryColorText(derivedColor);
        setEntryOrderLines(lines.map((line) => ({
          color: String(line?.color || '').trim(),
          size: String(line?.size || '').trim(),
          quantity: Number(line?.quantity || 0) || 0,
          skuNo: String(line?.skuNo || '').trim(),
        })));

        const sizeMap = new Map<string, number>();
        for (const l of lines) {
          const size = String((l as any)?.size || '').trim();
          if (!size) continue;
          const qty = Number((l as any)?.quantity ?? 0) || 0;
          sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
        }
        const items = Array.from(sizeMap.entries())
          .map(([size, quantity]) => ({ size, quantity }))
          .sort((a, b) => compareSizeAsc(a.size, b.size));
        setEntrySizeItems(items);
      } catch {
        if (cancelled) return;
        setEntryColorText('');
        setEntrySizeItems([]);
        setEntryOrderLines([]);
      } finally {
        if (!cancelled) setEntryOrderDetailLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [isEntryPage, orderId, activeTaskId, activeProductionOrderId, activeOrderNo]);

  return {
    activeOrderNo,
    // 面辅料采购
    entryPurchaseLoading,
    entryPurchases,
    // 订单明细
    entryOrderDetailLoading,
    entryColorText,
    entrySizeItems,
    entryOrderLines,
    // 纸样用量
    entrySizeUsageMap,
    entryFabricUsageRows,
  };
}
