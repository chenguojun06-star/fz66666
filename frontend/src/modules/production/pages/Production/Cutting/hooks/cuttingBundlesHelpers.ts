import api from '@/utils/api';
import { getMaterialTypeSortKey } from '@/utils/materialType';
import type { MaterialPurchase } from '@/types/production';

export interface CuttingBundleRow {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleNo?: string;
  skuNo?: string;
  color: string;
  size: string;
  quantity: number;
  bundleNo?: number;
  bundleLabel?: string;
  bedNo?: number; // 床号（裁剪批次编号）
  bedSubNo?: number; // 子床次编号（同一订单追加时递增，null 表示首次）
  qrCode?: string;
  status?: string;
  creatorId?: string; // 创建人ID
  creatorName?: string; // 创建人姓名
  operatorId?: string; // 操作人ID（最后操作人）
  operatorName?: string; // 操作人姓名（最后操作人）
}

export interface CuttingQueryParams {
  page: number;
  pageSize: number;
}

export type EntryOrderLine = {
  color: string;
  size: string;
  quantity: number;
  skuNo?: string;
};

export interface UseCuttingBundlesOptions {
  message: any;
  modal: any;
  activeTask: any;
  orderId: string;
  isEntryPage: boolean;
  ensureOrderUnlockedById: (id: any) => Promise<boolean>;
  syncActiveTaskByOrderNo: (orderNo: string) => Promise<any>;
}

/** 菲号列表 pageSize 本地存储 key */
export const BUNDLES_PAGE_SIZE_KEY = 'Cutting.bundlesPageSize';

/** 从 localStorage 加载 pageSize，失败回退到 20 */
export function loadBundlesPageSize(): number {
  try {
    const raw = window.localStorage.getItem(BUNDLES_PAGE_SIZE_KEY);
    if (raw) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch { /* ignore */ }
  return 20;
}

/** 把总量按每扎数量拆分 */
export function splitQuantity(totalQty: number, perBundle = 20): number[] {
  const qty = Math.max(0, Number(totalQty) || 0);
  const per = Math.max(1, Number(perBundle) || 20);
  const out: number[] = [];
  let remain = qty;
  while (remain > 0) {
    out.push(Math.min(per, remain));
    remain -= per;
  }
  return out;
}

/** 按物料类型/编码/ID 排序的采购列表查询 */
export async function fetchSortedPurchasesByOrderNo(
  orderNo: string,
  fallbackStyleNo?: string,
): Promise<MaterialPurchase[]> {
  const no = String(orderNo || '').trim();
  if (!no) return [] as MaterialPurchase[];
  const fetchAndSort = async (params: Record<string, any>) => {
    const res = await api.get<{ code: number; data: { records: MaterialPurchase[] } }>('/production/purchase/list', {
      params: { page: 1, pageSize: 200, ...params },
    });
    if (res.code !== 200) return null;
    const records = (res.data?.records || []) as MaterialPurchase[];
    const sorted = [...records].sort((a: any, b: any) => {
      const ka = getMaterialTypeSortKey(a?.materialType);
      const kb = getMaterialTypeSortKey(b?.materialType);
      if (ka !== kb) return ka.localeCompare(kb);
      const ca = String(a?.materialCode || '');
      const cb = String(b?.materialCode || '');
      if (ca !== cb) return ca.localeCompare(cb);
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    });
    return sorted as unknown as MaterialPurchase[];
  };
  try {
    const result = await fetchAndSort({ orderNo: no, materialType: '', status: '' });
    if (result && result.length > 0) return result;
    const styleNo = String(fallbackStyleNo || '').trim();
    if (!styleNo) return result || [];
    const fallbackResult = await fetchAndSort({ styleNo, sourceType: 'sample', materialType: '', status: '' });
    return fallbackResult || result || [];
  } catch {
    return [] as MaterialPurchase[];
  }
}
