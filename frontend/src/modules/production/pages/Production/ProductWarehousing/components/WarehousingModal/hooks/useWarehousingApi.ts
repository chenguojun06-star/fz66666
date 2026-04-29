import React from 'react';
import { Form } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { ProductWarehousing as WarehousingType, ProductionOrder } from '@/types/production';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import {
  CuttingBundleRow,
  BundleRepairStats,
} from '../../../types';
import {
  parseUrlsValue,
  computeBundleRepairStats,
  toUploadFileList,
} from '../../../utils';
import { message } from '@/utils/antdStatic';

interface ApiStateSetters {
  setOrderOptions: React.Dispatch<React.SetStateAction<ProductionOrder[]>>;
  setOrderOptionsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setBundles: React.Dispatch<React.SetStateAction<CuttingBundleRow[]>>;
  setQualifiedWarehousedBundleQrs: React.Dispatch<React.SetStateAction<string[]>>;
  setBundleRepairStatsByQr: React.Dispatch<React.SetStateAction<Record<string, BundleRepairStats>>>;
  setBundleRepairRemainingByQr: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setProductionReadyQrs: React.Dispatch<React.SetStateAction<string[]>>;
  setQrStageHintsMap: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  setDetailWarehousingItems: React.Dispatch<React.SetStateAction<WarehousingType[]>>;
  setDetailLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setUnqualifiedFileList: React.Dispatch<React.SetStateAction<UploadFile[]>>;
}

export const useWarehousingApi = (
  form: ReturnType<typeof Form.useForm>[0],
  setters: ApiStateSetters,
) => {
  const {
    setOrderOptions, setOrderOptionsLoading, setBundles,
    setQualifiedWarehousedBundleQrs, setBundleRepairStatsByQr,
    setBundleRepairRemainingByQr, setProductionReadyQrs,
    setQrStageHintsMap, setDetailWarehousingItems,
    setDetailLoading, setUnqualifiedFileList,
  } = setters;

  const fetchOrderOptions = async () => {
    setOrderOptionsLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: ProductionOrder[]; total: number }; message?: string }>('/production/order/list', { params: { page: 1, pageSize: 500 } });
      if (res.code === 200) {
        setOrderOptions(res.data.records || []);
      } else {
        setOrderOptions([]);
        message.error(res.message || '获取订单列表失败');
      }
    } catch {
      setOrderOptions([]);
      message.error('获取订单列表失败');
    } finally {
      setOrderOptionsLoading(false);
    }
  };

  const fetchBundlesByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) { setBundles([]); return; }
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 500, orderNo: on },
      });
      if (res.code === 200) {
        setBundles((res.data?.records || []) as CuttingBundleRow[]);
      } else {
        setBundles([]);
      }
    } catch {
      setBundles([]);
    }
  };

  const fetchQualifiedWarehousedBundleQrsByOrderId = async (orderId: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) { setQualifiedWarehousedBundleQrs([]); return; }
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: { page: 1, pageSize: 500, orderId: oid },
      });
      if (res.code === 200) {
        const records = (res.data?.records || []) as any[];
        const whNo = String(records?.[0]?.warehousingNo || '').trim();
        form.setFieldsValue({ warehousingNo: whNo || undefined });
        const qrs = records
          .filter((r) => {
            const q = Number(r?.qualifiedQuantity || 0) || 0;
            if (q <= 0) return false;
            const qs = String(r?.qualityStatus || '').trim().toLowerCase();
            if (qs === 'repair_return') return false;
            const wt = String(r?.warehousingType || '').trim();
            if (wt === 'quality_scan' || wt === 'quality_scan_scrap') return false;
            const wh = String(r?.warehouse || '').trim();
            if (!wh || wh === '待分配') return false;
            return !qs || qs === 'qualified';
          })
          .map((r) => String(r?.cuttingBundleQrCode || '').trim())
          .filter(Boolean);
        setQualifiedWarehousedBundleQrs(Array.from(new Set(qrs)));
      } else {
        setQualifiedWarehousedBundleQrs([]);
        form.setFieldsValue({ warehousingNo: undefined });
      }
    } catch {
      setQualifiedWarehousedBundleQrs([]);
      form.setFieldsValue({ warehousingNo: undefined });
    }
  };

  const fetchBundleReadiness = async (orderId: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) { setProductionReadyQrs([]); return; }
    try {
      const res = await api.get<{ code: number; data: { qcReadyQrs: string[]; warehouseReadyQrs: string[]; qrStageHints?: Record<string, string[]> } }>('/production/warehousing/bundle-readiness', {
        params: { orderId: oid },
      });
      if (res.code === 200) {
        setProductionReadyQrs((res.data?.qcReadyQrs || []).map((v: string) => String(v || '').trim()).filter(Boolean));
        setQrStageHintsMap(res.data?.qrStageHints || {});
      } else {
        setProductionReadyQrs([]);
        setQrStageHintsMap({});
      }
    } catch {
      setProductionReadyQrs([]);
      setQrStageHintsMap({});
    }
  };

  const fetchBundleRepairStatsByQr = async (orderId: string, qrCode: string) => {
    const oid = String(orderId || '').trim();
    const qr = String(qrCode || '').trim();
    if (!oid || !qr) return;
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: { page: 1, pageSize: 500, orderId: oid, cuttingBundleQrCode: qr },
      });
      if (res.code !== 200) return;
      const records = (res.data?.records || []) as any[];
      const stats = computeBundleRepairStats(records);
      setBundleRepairStatsByQr((prev) => ({ ...prev, [qr]: stats }));
      setBundleRepairRemainingByQr((prev) => ({ ...prev, [qr]: Math.max(stats.remaining, stats.repairPool) }));
    } catch {
      setBundleRepairRemainingByQr((prev) => ({ ...prev, [qr]: 0 }));
    }
  };

  const fetchBundleRepairStatsBatch = async (orderId: string, qrs: string[]) => {
    const oid = String(orderId || '').trim();
    const list = Array.isArray(qrs) ? qrs.map((v) => String(v || '').trim()).filter(Boolean) : [];
    if (!oid || !list.length) return;
    try {
      const res = await api.post<{ code: number; data: Record<string, unknown>; message?: string }>('/production/warehousing/repair-stats', {
        orderId: oid, qrs: list,
      });
      if (res.code !== 200) throw new Error(res.message || '获取返修统计失败');
      const items = (res.data?.items || []) as any[];
      if (!Array.isArray(items) || !items.length) throw new Error('batch items empty');

      setBundleRepairStatsByQr((prev) => {
        const next = { ...prev };
        for (const it of items) {
          const qr = String(it?.qr || '').trim();
          if (!qr) continue;
          next[qr] = {
            repairPool: Math.max(0, Number(it?.repairPool ?? 0) || 0),
            repairedOut: Math.max(0, Number(it?.repairedOut ?? 0) || 0),
            remaining: Math.max(0, Number(it?.remaining ?? 0) || 0),
          };
        }
        return next;
      });

      setBundleRepairRemainingByQr((prev) => {
        const next = { ...prev };
        for (const it of items) {
          const qr = String(it?.qr || '').trim();
          if (!qr) continue;
          const rem = Math.max(0, Number(it?.remaining ?? 0) || 0);
          const pool = Math.max(0, Number(it?.repairPool ?? 0) || 0);
          next[qr] = Math.max(rem, pool);
        }
        return next;
      });
    } catch {
      const concurrency = 6;
      const queue = list.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const qr = queue.shift();
          if (!qr) continue;
          await fetchBundleRepairStatsByQr(oid, qr);
        }
      });
      await Promise.allSettled(workers);
    }
  };

  const loadWarehousingDetail = async (warehousing: WarehousingType) => {
    const warehousingNo = String((warehousing as any)?.warehousingNo || '').trim();
    const orderId = String((warehousing as any)?.orderId || '').trim();
    const orderNo = String((warehousing as any)?.orderNo || '').trim();

    setDetailLoading(true);
    try {
      let records: WarehousingType[] = [];
      if (warehousingNo || orderId) {
        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
          params: {
            page: 1, pageSize: 500,
            ...(warehousingNo ? { warehousingNo } : {}),
            ...(!warehousingNo && orderId ? { orderId } : {}),
          },
        });
        if (res.code === 200) records = (res.data?.records || []) as WarehousingType[];
      }
      setDetailWarehousingItems(records);
      const resolvedOrderNo = orderNo || String((records as any)?.[0]?.orderNo || '').trim();
      if (resolvedOrderNo) {
        await fetchBundlesByOrderNo(resolvedOrderNo);
      } else {
        setBundles([]);
      }
    } catch {
      setDetailWarehousingItems([]);
      setBundles([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const initDetailForm = (warehousing: WarehousingType) => {
    form.setFieldsValue({
      ...warehousing,
      createTime: formatDateTime((warehousing as any)?.createTime),
    });
    const urls = parseUrlsValue((warehousing as any)?.unqualifiedImageUrls);
    setUnqualifiedFileList(toUploadFileList(urls));
    loadWarehousingDetail(warehousing);
  };

  const initCreateForm = async (defaultOrderNo?: string, orderOptions?: ProductionOrder[]) => {
    await fetchOrderOptions();
    form.setFieldsValue({
      unqualifiedQuantity: 0,
      qualifiedQuantity: undefined,
      qualityStatus: 'qualified',
      unqualifiedImageUrls: '[]',
      defectCategory: undefined,
      defectRemark: undefined,
      repairRemark: '',
    });
    setUnqualifiedFileList([]);
    if (defaultOrderNo && orderOptions) {
      const matchOrder = orderOptions.find((o: any) => String(o?.orderNo || '').trim() === defaultOrderNo);
      if (matchOrder) form.setFieldsValue({ orderId: (matchOrder as any).id });
    }
  };

  return {
    fetchOrderOptions,
    fetchBundlesByOrderNo,
    fetchQualifiedWarehousedBundleQrsByOrderId,
    fetchBundleReadiness,
    fetchBundleRepairStatsByQr,
    fetchBundleRepairStatsBatch,
    loadWarehousingDetail,
    initDetailForm,
    initCreateForm,
  };
};
