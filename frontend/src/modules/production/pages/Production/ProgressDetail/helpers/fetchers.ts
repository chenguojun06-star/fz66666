import { productionCuttingApi, productionScanApi } from '@/services/production/productionApi';
import { styleProcessApi } from '@/services/style/styleApi';
import type { CuttingBundle, ProductionOrder, ScanRecord } from '@/types/production';
import type { StyleProcess } from '@/types/style';

interface MessageLike {
  error: (content: string) => void;
}

export const fetchScanHistory = async (args: {
  order: ProductionOrder;
  setScanHistory: (records: ScanRecord[]) => void;
  message: MessageLike;
  options?: { silent?: boolean };
}): Promise<ScanRecord[]> => {
  const { order, setScanHistory, message, options } = args;
  const silent = options?.silent === true;
  if (!order.id) {
    setScanHistory([]);
    return [];
  }
  try {
    const response = await productionScanApi.listByOrderId(String(order.id), { page: 1, pageSize: 1000 });
    const result = response as any;
    if (result.code === 200) {
      const records = Array.isArray(result.data?.records) ? result.data.records : [];
      setScanHistory(records);
      return records;
    } else if (!silent) {
      message.error(result.message || '获取扫码记录失败');
    }
  } catch {
    if (!silent) {
      message.error('获取扫码记录失败');
    }
  }
  return [];
};

export const fetchCuttingBundles = async (args: {
  order: ProductionOrder;
  setCuttingBundles: (records: CuttingBundle[]) => void;
  setCuttingBundlesLoading: (loading: boolean) => void;
  message: MessageLike;
}): Promise<CuttingBundle[]> => {
  const { order, setCuttingBundles, setCuttingBundlesLoading, message } = args;
  const orderNo = String(order?.orderNo || '').trim();
  const orderId = String(order?.id || '').trim();
  if (!orderNo && !orderId) {
    setCuttingBundles([]);
    return [];
  }
  setCuttingBundlesLoading(true);
  try {
    const res = await productionCuttingApi.list({
      page: 1,
      pageSize: 10000,
      productionOrderId: orderId || undefined,
      productionOrderNo: orderNo || undefined,
    });
    const result = res as any;
    if (result.code === 200) {
      const data = result.data;
      const records = Array.isArray(data)
        ? (data as CuttingBundle[])
        : Array.isArray(data?.records)
          ? (data.records as CuttingBundle[])
          : Array.isArray(data?.list)
            ? (data.list as CuttingBundle[])
            : [];
      records.sort((a, b) => (Number(a?.bundleNo) || 0) - (Number(b?.bundleNo) || 0));
      setCuttingBundles(records);
      return records;
    }
    message.error(result.message || '获取扎号列表失败');
  } catch (e: any) {
    message.error((e as any)?.result?.message || (e as any)?.message || '获取扎号列表失败');
  } finally {
    setCuttingBundlesLoading(false);
  }
  setCuttingBundles([]);
  return [];
};

export const fetchPricingProcesses = async (args: {
  order: ProductionOrder;
  setPricingProcesses: (records: StyleProcess[]) => void;
  setPricingProcessLoading: (loading: boolean) => void;
}): Promise<StyleProcess[]> => {
  const { order, setPricingProcesses, setPricingProcessLoading } = args;
  const styleId = String((order as any)?.styleId || '').trim();
  if (!styleId) {
    setPricingProcesses([]);
    return [];
  }
  setPricingProcessLoading(true);
  try {
    const res = await styleProcessApi.listByStyleId(styleId);
    const result = res as any;
    if (result.code === 200) {
      const list = Array.isArray(result.data) ? (result.data as StyleProcess[]) : [];
      setPricingProcesses(list);
      return list;
    }
    setPricingProcesses([]);
    return [];
  } catch {
    setPricingProcesses([]);
    return [];
  } finally {
    setPricingProcessLoading(false);
  }
};
