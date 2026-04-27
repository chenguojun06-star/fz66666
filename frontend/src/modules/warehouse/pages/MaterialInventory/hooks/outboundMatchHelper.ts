import api from '@/utils/api';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import type { MaterialInventory } from '../types';

export interface OutboundFactoryOption {
  value: string;
  label: string;
  factoryId?: string;
  factoryName: string;
  factoryType?: string;
}

export interface OutboundOrderOption {
  value: string;
  label: string;
  orderNo: string;
  styleNo?: string;
  factoryId?: string;
  factoryName?: string;
  factoryType?: string;
}

/** 出库批次明细（批次库存信息 + 本次出库数量） */
export interface MaterialBatchDetail {
  batchNo: string;
  warehouseLocation: string;
  color?: string;
  availableQty: number;
  lockedQty?: number;
  inboundDate?: string;
  expiryDate?: string;
  outboundQty?: number;
}

/** 通过工厂/关键词搜索生产订单，返回选项列表（纯数据，不更新 state） */
export async function fetchOrderOptions(
  factoryName?: string,
  factoryType?: string,
  keyword?: string,
): Promise<OutboundOrderOption[]> {
  if (!factoryName && !keyword) return [];
  try {
    const res = await api.get('/production/orders/list', {
      params: {
        page: 1, pageSize: 50,
        factoryName: factoryName || undefined,
        factoryType: factoryType || undefined,
        orderNo: keyword || undefined,
        excludeTerminal: true,
      },
    });
    const records = res?.data?.records || res?.records || [];
    return (records as any[]).map((item) => ({
      value: String(item.orderNo || ''),
      label: `${item.orderNo || '-'} / ${item.styleNo || '-'} / ${item.factoryName || factoryName || '-'}`,
      orderNo: String(item.orderNo || ''),
      styleNo: String(item.styleNo || ''),
      factoryId: item.factoryId ? String(item.factoryId) : undefined,
      factoryName: item.factoryName ? String(item.factoryName) : factoryName,
      factoryType: item.factoryType ? String(item.factoryType).toUpperCase() : factoryType,
    })).filter((item: OutboundOrderOption) => item.orderNo);
  } catch {
    return [];
  }
}

interface MatchCtx {
  factoryOptions: OutboundFactoryOption[];
  searchOrdersFn: (factoryName?: string, factoryType?: string) => Promise<OutboundOrderOption[]>;
}
interface MatchExtra {
  receiverId?: string;
  receiverName?: string;
  factoryName?: string;
  factoryType?: string;
}
interface FormLike { getFieldValue: (k: string) => any; }

/** 自动匹配出库上下文（工厂/订单/款号），返回 setFieldsValues 所需对象，无匹配时返回 null */
export async function matchOutboundContext(
  record: MaterialInventory,
  form: FormLike,
  ctx: MatchCtx,
  extra?: MatchExtra,
): Promise<Record<string, any> | null> {
  try {
    const factoryName = extra?.factoryName || form.getFieldValue('factoryName') || '';
    const factoryType = extra?.factoryType || form.getFieldValue('factoryType') || '';
    const receiverId = extra?.receiverId || form.getFieldValue('receiverId') || '';
    const receiverName = extra?.receiverName || form.getFieldValue('receiverName') || '';
    if (factoryName) { await ctx.searchOrdersFn(factoryName, factoryType); }
    const res = await materialInventoryApi.searchMaterialList({
      page: 1, pageSize: 20,
      materialCode: record.materialCode,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      factoryName: factoryName || undefined,
      factoryType: factoryType || undefined,
    });
    const records = res?.data?.records || res?.records || [];
    const candidates = (records as any[]).filter((item) => item?.orderNo || item?.styleNo);
    if (candidates.length === 0) return null;
    const sameFactory = factoryName
      ? candidates.filter((item) => String(item.factoryName || '').trim() === String(factoryName).trim())
      : candidates;
    const sameReceiver = receiverId
      ? sameFactory.filter((item) => String(item.receiverId || '').trim() === String(receiverId).trim())
      : sameFactory;
    const picked = sameReceiver[0] || sameFactory[0] || candidates[0];
    if (!picked) return null;
    const resolvedFactoryType = String(picked.factoryType || factoryType || '').trim().toUpperCase();
    const resolvedFactoryName = String(picked.factoryName || factoryName || '').trim();
    const matchedFactory = ctx.factoryOptions.find((item) => item.factoryName === resolvedFactoryName);
    const resolvedUsageType = picked.sourceType === 'sample' ? 'SAMPLE'
      : picked.sourceType === 'stock' ? 'STOCK' : 'BULK';
    return {
      orderNo: picked.orderNo || form.getFieldValue('orderNo'),
      styleNo: picked.styleNo || form.getFieldValue('styleNo'),
      factoryId: matchedFactory?.factoryId || form.getFieldValue('factoryId'),
      factoryName: resolvedFactoryName || form.getFieldValue('factoryName'),
      factoryType: resolvedFactoryType || form.getFieldValue('factoryType'),
      pickupType: resolvedFactoryType || form.getFieldValue('pickupType') || 'INTERNAL',
      usageType: form.getFieldValue('usageType') || resolvedUsageType,
    };
  } catch {
    return null;
  }
}
