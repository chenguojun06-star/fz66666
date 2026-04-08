import { productionOrderApi } from '@/services/production/productionApi';
import { isApiSuccess } from '@/utils/api';
import type { ApiResult } from '@/utils/api';

export const fetchNodeOperations = async (orderId: string): Promise<Record<string, any>> => {
  const id = String(orderId || '').trim();
  if (!id) return {};
  const res = await productionOrderApi.getNodeOperations(id) as ApiResult<any>;
  if (isApiSuccess(res) && res?.data) {
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    return parsed || {};
  }
  return {};
};
