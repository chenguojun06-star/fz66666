import { useCallback, useState } from 'react';
import { message } from '@/utils/antdStatic';
import shopAdminApi, { shopProductApi } from '@/services/shop/shopApi';
import { unwrap } from '../unwrap';
import type { ListingFilter, ListingRow, ShopSkuSummary } from '../types';

/** 一次拉取的最大款式数（后端 pageSize 上限 500），筛选与分页在前端做，保证「已上架/未上架」口径一致 */
const FETCH_SIZE = 200;

/**
 * 店铺商品列表数据：款式列表 + 款式维度的 SKU 聚合（售价区间/可售量/颜色数）。
 * 聚合走 /shop/admin/sku/summary 一次批量查询，避免逐行 N+1。
 */
export function useShopListing() {
  const [rows, setRows] = useState<ListingRow[]>([]);
  const [summary, setSummary] = useState<Record<string, ShopSkuSummary>>({});
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  const load = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const raw = await shopProductApi.listStyles({
        keyword: keyword || undefined,
        page: 1,
        pageSize: FETCH_SIZE,
      });
      const body = unwrap<{ records?: ListingRow[]; total?: number }>(raw);
      const records: ListingRow[] = Array.isArray(body?.records) ? body.records : [];
      setRows(records);
      setTruncated((body?.total ?? 0) > records.length);

      if (records.length) {
        const sumRaw = await shopAdminApi.skuSummary(records.map((r) => r.id));
        const sumBody = unwrap<{ items?: Record<string, ShopSkuSummary> }>(sumRaw);
        setSummary(sumBody?.items ?? {});
      } else {
        setSummary({});
      }
    } catch (e: unknown) {
      setRows([]);
      setSummary({});
      message.error(e instanceof Error ? e.message : '商品列表加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  /** 上架/下架后就地更新，避免整表重拉 */
  const patchListed = useCallback((styleId: number, listed: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === styleId ? { ...r, shopListed: listed ? 1 : 0 } : r)));
  }, []);

  return { rows, summary, loading, truncated, load, patchListed };
}

export function filterRows(rows: ListingRow[], filter: ListingFilter): ListingRow[] {
  if (filter === 'listed') return rows.filter((r) => r.shopListed === 1);
  if (filter === 'unlisted') return rows.filter((r) => r.shopListed !== 1);
  return rows;
}