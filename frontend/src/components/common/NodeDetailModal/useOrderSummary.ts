import { useEffect, useState } from 'react';
import api from '@/utils/api';
import { isApiSuccess, parseProductionOrderLines } from '@/utils/api';
import { productionOrderApi } from '@/services/production/productionApi';

interface UseOrderSummaryParams {
  orderId?: string;
  orderNo?: string;
}

export interface OrderSummary {
  orderNo?: string;
  styleNo?: string;
  orderQuantity?: number;
}

export interface OrderLineItem {
  color: string;
  size: string;
  quantity: number;
}

/**
 * 加载订单概要信息（NodeDetailModal 头部卡片用）。
 *
 * D-360j：修复原实现把 orderId 当 orderNo 查单导致始终查不到完整订单的问题；
 * 并按需暴露完整订单 detail + 颜色×码数矩阵 orderLines（orderDetails 为空时
 * 用 StyleInfo.sizeColorConfig 兜底解析，保证头部/矩阵有数量）。
 */
export function useOrderSummary(params: UseOrderSummaryParams) {
  const { orderId, orderNo } = params;

  const [orderDetail, setOrderDetail] = useState<Record<string, unknown> | null>(null);
  const [orderLines, setOrderLines] = useState<OrderLineItem[]>([]);
  const [orderSummary, setOrderSummary] = useState<OrderSummary>({ orderNo });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!orderId) {
        setOrderSummary({ orderNo });
        setOrderDetail(null);
        setOrderLines([]);
        return;
      }
      try {
        const res = await productionOrderApi.list({ orderNo: String(orderNo || orderId).trim(), page: 1, pageSize: 1 });
        if (!cancelled && isApiSuccess(res) && res?.data) {
          const data = res.data as { records?: unknown[] };
          const records = data?.records || [];
          if (records.length > 0) {
            const orderData = records[0] as any;
            const parsedLines = parseProductionOrderLines(orderData);
            let lines: OrderLineItem[] = parsedLines;
            let detail: Record<string, unknown> = orderData;

            // D-360j：orderDetails 为空时按款号查 StyleInfo.sizeColorConfig 解析颜色×码数矩阵兜底
            if (!parsedLines.length && String(orderData?.styleNo || '').trim()) {
              try {
                const styleRes = await api.get<{ code: number; data: { records: any[] } }>('/style/info/list', {
                  params: { page: 1, pageSize: 5, styleNo: String(orderData.styleNo).trim() },
                });
                const styleRecords = (styleRes?.code === 200 && Array.isArray(styleRes?.data?.records)) ? styleRes.data.records : [];
                const styleRecord = styleRecords.find(
                  (r) => String(r?.styleNo || '').trim() === String(orderData.styleNo || '').trim(),
                ) || styleRecords[0] || null;
                if (styleRecord) {
                  const matrix = (styleRecord.sizeColorConfig || styleRecord.sizeColorMatrix) as Record<string, unknown> | string | undefined;
                  let parsedMatrix: { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> } | null = null;
                  if (matrix && typeof matrix === 'string') {
                    try { parsedMatrix = JSON.parse(matrix); } catch { /* ignore */ }
                  } else if (matrix && typeof matrix === 'object') {
                    parsedMatrix = matrix as { sizes?: string[]; matrixRows?: Array<Record<string, unknown>> };
                  }
                  const sizes = Array.isArray(parsedMatrix?.sizes) ? (parsedMatrix!.sizes as string[]) : [];
                  const rows = Array.isArray(parsedMatrix?.matrixRows) ? (parsedMatrix!.matrixRows as Array<Record<string, unknown>>) : [];
                  const fallbackLines: OrderLineItem[] = [];
                  rows.forEach((row) => {
                    const rowColor = String(row?.color || '').trim();
                    const quantities = Array.isArray(row?.quantities) ? (row.quantities as number[]) : [];
                    sizes.forEach((sz, idx) => {
                      const q = Number(quantities[idx] || 0);
                      if (q > 0) fallbackLines.push({ color: rowColor, size: String(sz || '').trim(), quantity: q });
                    });
                  });
                  if (fallbackLines.length) lines = fallbackLines;
                  const coverFallback = String(styleRecord?.coverImage || styleRecord?.styleCover || '').trim() || null;
                  if (coverFallback && !String(detail?.styleCover || '').trim()) {
                    detail = { ...detail, styleCover: coverFallback };
                  }
                }
              } catch { /* 款式信息不可用时保持现状 */ }
            }

            if (!cancelled) {
              setOrderDetail(detail);
              setOrderLines(lines);
              setOrderSummary({
                orderNo: String(detail.orderNo || orderNo || '').trim() || undefined,
                styleNo: String(detail.styleNo || '').trim() || undefined,
                orderQuantity: Number(detail.orderQuantity ?? 0) || 0,
              });
            }
          }
        }
      } catch {
        if (!cancelled) setOrderSummary({ orderNo });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [orderId, orderNo]);

  return {
    orderSummary,
    orderDetail,
    orderLines,
  };
}
