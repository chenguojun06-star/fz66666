import { productionOrderApi } from '@/services/production/productionApi';

export const fetchNodeOperations = async (orderId: string): Promise<Record<string, any>> => {
  const id = String(orderId || '').trim();
  if (!id) return {};
  // service 已解包：直接拿到 JSON 字符串
  const raw = await productionOrderApi.getNodeOperations(id);
  if (raw) {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed || {};
  }
  return {};
};
