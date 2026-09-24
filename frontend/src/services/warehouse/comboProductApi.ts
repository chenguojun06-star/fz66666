/**
 * D-529：组合商品（套装）API。
 * 组合SKU = 任意两个及以上不同款式的SKU组合；销售时销售记录挂组合SKU，实际按子SKU出库。
 */
import api from '@/utils/api';

export interface ComboProductItem {
  id?: number;
  comboId?: number;
  skuId?: number;
  styleId?: number;
  styleNo?: string;
  styleName?: string;
  skuCode: string;
  color?: string;
  size?: string;
  quantity: number;
  sort?: number;
  /** 子SKU当前可用库存（前端展示用，非落库字段） */
  availableQty?: number;
  salesPrice?: number | null;
  costPrice?: number | null;
  styleImage?: string | null;
}

export interface ComboProduct {
  id?: number;
  comboCode: string;
  comboName: string;
  shortCode?: string;
  colorSizeDesc?: string;
  category?: string;
  tags?: string;
  salePrice?: number | null;
  costPrice?: number | null;
  autoSalePrice?: number;
  autoCostPrice?: number;
  coverUrl?: string | null;
  remark?: string;
  status?: string;
  createBy?: string;
  createTime?: string;
  updateTime?: string;
}

export interface ComboProductVO extends ComboProduct {
  items: ComboProductItem[];
  availableStock: number;
}

export interface ComboProductListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
}

const unwrap = (res: any) => res?.data ?? res;

export const comboProductApi = {
  list: async (params: ComboProductListParams) => {
    const res = await api.post('/combo-product/list', params);
    return unwrap(res) as { records: ComboProductVO[]; total: number; current: number; size: number };
  },

  detail: async (id: number) => {
    const res = await api.get(`/combo-product/${id}`);
    return unwrap(res) as ComboProductVO;
  },

  create: async (body: Record<string, unknown>) => {
    const res = await api.post('/combo-product/create', body);
    return unwrap(res) as ComboProductVO;
  },

  update: async (body: Record<string, unknown>) => {
    const res = await api.post('/combo-product/update', body);
    return unwrap(res) as ComboProductVO;
  },

  remove: async (id: number) => {
    await api.post('/combo-product/delete', { id });
    return true;
  },

  setStatus: async (id: number, status: 'ENABLED' | 'DISABLED') => {
    await api.post('/combo-product/set-status', { id, status });
    return true;
  },

  /** 套装出库（quantity=套数） */
  outbound: async (body: { comboId: number; quantity: number; salesPrice?: number | null; customerName?: string; customerPhone?: string; shippingAddress?: string; trackingNo?: string; expressCompany?: string; remark?: string; outstockType?: string }) => {
    const res = await api.post('/warehouse/finished-inventory/combo-outbound', body);
    return unwrap(res) as { outstockNo: string; sets: number; lines: number; totalQty: number };
  },
};
