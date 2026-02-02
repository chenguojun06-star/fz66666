import { productionOrderApi } from '@/services/production/productionApi';

export const fetchNodeOperations = async (orderId: string): Promise<Record<string, any>> => {
  const id = String(orderId || '').trim();
  if (!id) return {};
  const res = await productionOrderApi.getNodeOperations(id);
  if ((res as any)?.code === 200 && (res as any)?.data) {
    const parsed = typeof (res as any).data === 'string' ? JSON.parse((res as any).data) : (res as any).data;
    return parsed || {};
  }
  return {};
};
