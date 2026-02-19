/**
 * Shared hook for warehousing detail data fetching and derived computations.
 * Used by both WarehousingDetail (full page) and IndependentDetailModal (popup).
 */
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import api, { toNumberSafe, parseProductionOrderLines, fetchProductionOrderDetail } from '@/utils/api';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import { CuttingBundleRow, OrderLine, WarehousingDetailRecord, OrderLineWarehousingRow } from '../types';
import { parseUrlsValue } from '../utils';

export interface UseWarehousingDataOptions {
  /** Warehousing number to load detail for */
  warehousingNo: string;
  /** Optional pre-loaded summary to use as initial state */
  summary?: WarehousingType | null;
  /** Whether data fetching is enabled (e.g. modal is open, or route param present) */
  enabled?: boolean;
  /** Callback when a fatal error occurs during fetching */
  onError?: (errorMessage: string) => void;
}

export interface UseWarehousingDataResult {
  /** Merged warehousing entry with totals and summary info */
  entryWarehousing: WarehousingDetailRecord | null;
  /** Individual warehousing detail records */
  detailItems: WarehousingDetailRecord[];
  /** Production order detail */
  orderDetail: ProductionOrder | null;
  /** Cutting bundles for the order */
  bundles: CuttingBundleRow[];
  /** All warehousing records for the same order */
  orderWarehousingRecords: WarehousingDetailRecord[];
  /** Loading states */
  entryLoading: boolean;
  detailLoading: boolean;
  orderDetailLoading: boolean;
  /** Computed order line rows with warehousing status */
  orderLineWarehousingRows: OrderLineWarehousingRow[];
  /** Parsed unqualified image URLs */
  imageUrls: string[];
}

export function useWarehousingData(options: UseWarehousingDataOptions): UseWarehousingDataResult {
  const { warehousingNo, summary = null, enabled = true, onError } = options;
  const whNo = String(warehousingNo || '').trim();

  // Use refs for values that should not trigger re-fetching
  const summaryRef = useRef(summary);
  summaryRef.current = summary;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const [entryWarehousing, setEntryWarehousing] = useState<WarehousingDetailRecord | null>(null);
  const [detailItems, setDetailItems] = useState<WarehousingDetailRecord[]>([]);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);
  const [orderWarehousingRecords, setOrderWarehousingRecords] = useState<WarehousingDetailRecord[]>([]);
  const [entryLoading, setEntryLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);

  const fetchBundlesByOrderNo = useCallback(async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) { setBundles([]); return; }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>(
        '/production/cutting/list',
        { params: { page: 1, pageSize: 10000, orderNo: on } },
      );
      setBundles(res.code === 200 ? ((res.data?.records || []) as CuttingBundleRow[]) : []);
    } catch {
      setBundles([]);
    }
  }, []);

  // Main data fetching effect
  useEffect(() => {
    if (!enabled || !whNo) {
      if (!enabled) {
        setEntryWarehousing(null);
        setDetailItems([]);
        setOrderDetail(null);
        setBundles([]);
        setOrderWarehousingRecords([]);
        setEntryLoading(false);
        setDetailLoading(false);
        setOrderDetailLoading(false);
      }
      return;
    }

    let cancelled = false;

    const run = async () => {
      setEntryLoading(true);
      setDetailLoading(true);
      setOrderDetailLoading(false);

      try {
        // Use summary if its warehousingNo matches
        const stateSummary = summaryRef.current;
        let initialEntry: WarehousingDetailRecord | null = null;
        if (stateSummary && String(stateSummary.warehousingNo || '').trim() === whNo) {
          initialEntry = stateSummary as WarehousingDetailRecord;
          setEntryWarehousing(initialEntry);
        } else {
          setEntryWarehousing(null);
        }

        // Fetch detail records by warehousingNo
        const res = await api.get<{
          code: number;
          data: { records: WarehousingType[]; total: number };
          message?: string;
        }>('/production/warehousing/list', {
          params: { page: 1, pageSize: 10000, warehousingNo: whNo },
        });
        if (res.code !== 200) throw new Error(res.message || '获取质检入库详情失败');

        const records = (res.data?.records || []) as WarehousingDetailRecord[];
        if (!records.length) throw new Error('未找到质检入库详情');
        if (cancelled) return;

        setDetailItems(records);

        // Compute totals from all records
        const totals = records.reduce<{
          warehousingQuantity: number;
          qualifiedQuantity: number;
          unqualifiedQuantity: number;
          hasUnqualified: boolean;
        }>(
          (acc, r) => {
            acc.warehousingQuantity += Number(r.warehousingQuantity || 0) || 0;
            acc.qualifiedQuantity += Number(r.qualifiedQuantity || 0) || 0;
            acc.unqualifiedQuantity += Number(r.unqualifiedQuantity || 0) || 0;
            if (String(r.qualityStatus || '').trim() === 'unqualified') acc.hasUnqualified = true;
            return acc;
          },
          { warehousingQuantity: 0, qualifiedQuantity: 0, unqualifiedQuantity: 0, hasUnqualified: false },
        );

        const base: WarehousingDetailRecord = records[0] || {};
        const merged: WarehousingDetailRecord = {
          ...(initialEntry || {}),
          ...base,
          warehousingNo: whNo,
          warehousingQuantity: Math.max(0, totals.warehousingQuantity),
          qualifiedQuantity: Math.max(0, totals.qualifiedQuantity),
          unqualifiedQuantity: Math.max(0, totals.unqualifiedQuantity),
          qualityStatus: totals.hasUnqualified
            ? 'unqualified'
            : String(base.qualityStatus || '').trim() === 'unqualified'
              ? 'unqualified'
              : 'qualified',
        };

        if (!cancelled) setEntryWarehousing(merged);

        // Fetch cutting bundles by orderNo
        const resolvedOrderNo = String(merged.orderNo || '').trim() || String(records[0]?.orderNo || '').trim();
        if (resolvedOrderNo) {
          await fetchBundlesByOrderNo(resolvedOrderNo);
        } else {
          setBundles([]);
        }

        // Fetch order detail and all order-level warehousing records
        const resolvedOrderId = String(merged.orderId || '').trim();
        if (resolvedOrderId) {
          setOrderDetailLoading(true);
          try {
            const detail = await fetchProductionOrderDetail(resolvedOrderId, { acceptAnyData: true });
            if (!cancelled) setOrderDetail((detail || null) as unknown as ProductionOrder | null);
          } catch {
            if (!cancelled) setOrderDetail(null);
          } finally {
            if (!cancelled) setOrderDetailLoading(false);
          }

          try {
            const whRes = await api.get<{
              code: number;
              data: { records: WarehousingType[]; total: number };
            }>('/production/warehousing/list', {
              params: { page: 1, pageSize: 10000, orderId: resolvedOrderId },
            });
            if (!cancelled) {
              const list = (whRes?.data?.records || []) as WarehousingDetailRecord[];
              setOrderWarehousingRecords(Array.isArray(list) ? list : []);
            }
          } catch {
            if (!cancelled) setOrderWarehousingRecords([]);
          }
        } else {
          setOrderDetailLoading(false);
          setOrderDetail(null);
          setOrderWarehousingRecords([]);
        }
      } catch (e: any) {
        if (!cancelled) {
          const errMsg = (e as Error)?.message || '获取质检入库详情失败';
          message.error(errMsg);
          onErrorRef.current?.(errMsg);
          setEntryWarehousing(null);
          setDetailItems([]);
          setOrderDetail(null);
          setBundles([]);
          setOrderWarehousingRecords([]);
        }
      } finally {
        if (!cancelled) {
          setEntryLoading(false);
          setDetailLoading(false);
        }
      }
    };

    void run();
    return () => { cancelled = true; };
  }, [whNo, enabled, fetchBundlesByOrderNo]);

  // Derived: bundleByQr map
  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b.qrCode || '').trim();
      if (qr && !m.has(qr)) m.set(qr, b);
    }
    return m;
  }, [bundles]);

  // Derived: order line warehousing rows (与 InspectionDetail 保持一致的计算逻辑)
  const orderLineWarehousingRows = useMemo<OrderLineWarehousingRow[]>(() => {
    const orderNo = String(orderDetail?.orderNo || entryWarehousing?.orderNo || '').trim();
    const styleNo = String(orderDetail?.styleNo || entryWarehousing?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];

    // 统计已入库的合格数量（只计算已分配仓库的合格品）
    const warehousedByKey = new Map<string, number>();
    // 统计不合格数量（包括所有不合格记录，无论是否已入库）
    const unqualifiedByKey = new Map<string, number>();

    for (const r of Array.isArray(orderWarehousingRecords) ? orderWarehousingRecords : []) {
      if (!r) continue;
      const qr = String(r.cuttingBundleQrCode || r.qrCode || '').trim();
      const b = qr ? bundleByQr.get(qr) : undefined;
      const color = String(b?.color || r.color || r.colour || '').trim();
      const size = String(b?.size || r.size || '').trim();
      if (!color || !size) continue;
      const k = `${color}@@${size}`;

      // 统计合格已入库
      const qs = String(r.qualityStatus || '').trim().toLowerCase();
      if ((!qs || qs === 'qualified') && String(r.warehouse || '').trim()) {
        const q = toNumberSafe(r.qualifiedQuantity);
        if (q > 0) {
          warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
        }
      }

      // 统计不合格数量（所有不合格记录）
      const uq = toNumberSafe(r.unqualifiedQuantity);
      if (uq > 0) {
        unqualifiedByKey.set(k, (unqualifiedByKey.get(k) || 0) + uq);
      }
    }

    return lines
      .map((l, idx) => {
        const color = String(l?.color || '').trim();
        const size = String(l?.size || '').trim();
        const quantity = Math.max(0, toNumberSafe(l?.quantity));
        const k = `${color}@@${size}`;
        const wq = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
        const uq = Math.max(0, toNumberSafe(unqualifiedByKey.get(k) || 0));
        return {
          key: `${idx}-${k}`,
          orderNo: orderNo || '-',
          styleNo: styleNo || '-',
          color: color || '-',
          size: size || '-',
          quantity,
          warehousedQuantity: wq,
          unqualifiedQuantity: uq,
          unwarehousedQuantity: Math.max(0, quantity - wq - uq),
        };
      })
      .sort((a, b) => {
        const byColor = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
        return byColor !== 0 ? byColor : a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
      });
  }, [bundleByQr, entryWarehousing, orderDetail, orderWarehousingRecords]);

  // Derived: parsed image URLs
  const imageUrls = useMemo(() => parseUrlsValue(entryWarehousing?.unqualifiedImageUrls), [entryWarehousing]);

  return {
    entryWarehousing,
    detailItems,
    orderDetail,
    bundles,
    orderWarehousingRecords,
    entryLoading,
    detailLoading,
    orderDetailLoading,
    orderLineWarehousingRows,
    imageUrls,
  };
}
