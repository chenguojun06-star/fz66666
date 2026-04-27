import { useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import type { PendingPicking as PendingPickingType, PendingPickingItem } from '@/types/warehouse';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import { message } from '@/utils/antdStatic';

/** 待出库领料单（含明细 items） */
export interface PendingPicking {
  id: string;
  pickingNo: string;
  orderNo: string;
  styleNo: string;
  factoryId?: string;
  factoryName?: string;
  factoryType?: string;
  pickerName: string;
  pickupType?: string;
  usageType?: string;
  createTime: string;
  status: string;
  remark?: string;
  items?: Array<{
    id: string;
    materialCode: string;
    materialName: string;
    color?: string;
    size?: string;
    quantity: number;
    unit?: string;
    specification?: string;
    unitPrice?: number;
    supplierName?: string;
    warehouseLocation?: string;
    materialType?: string;
    fabricWidth?: string;
    fabricWeight?: string;
    fabricComposition?: string;
  }>;
}

interface PendingPickingsDeps {
  user: { name?: string; username?: string; id?: string } | null | undefined;
  fetchData: () => void;
  openPrintModal: (payload: MaterialOutboundPrintPayload) => void;
}

export function usePendingPickings({ user, fetchData, openPrintModal }: PendingPickingsDeps) {
  const [pendingPickings, setPendingPickings] = useState<PendingPicking[]>([]);
  const [pendingPickingsLoading, setPendingPickingsLoading] = useState(false);
  const [confirmingPickingId, setConfirmingPickingId] = useState<string | null>(null);
  const [cancellingPickingId, setCancellingPickingId] = useState<string | null>(null);

  const buildPickingPrintPayload = (record: PendingPicking): MaterialOutboundPrintPayload => ({
    outboundNo: record.pickingNo,
    outboundTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
    materialCode: record.items?.[0]?.materialCode || '-',
    materialName: record.items?.[0]?.materialName || '面辅料',
    specification: record.items?.[0]?.specification || record.items?.[0]?.size,
    color: record.items?.[0]?.color,
    orderNo: record.orderNo,
    styleNo: record.styleNo,
    factoryName: record.factoryName,
    factoryType: record.factoryType,
    pickupType: record.pickupType,
    usageType: record.usageType,
    receiverName: record.pickerName,
    issuerName: user?.name || user?.username || '系统',
    remark: record.remark,
    supplierName: record.items?.[0]?.supplierName,
    fabricWidth: record.items?.[0]?.fabricWidth,
    fabricWeight: record.items?.[0]?.fabricWeight,
    fabricComposition: record.items?.[0]?.fabricComposition,
    items: (record.items || []).map((item) => ({
      batchNo: item.warehouseLocation || '-',
      warehouseLocation: item.warehouseLocation || '',
      quantity: item.quantity,
      unit: item.unit,
      materialName: item.materialName,
      specification: item.specification || item.size,
      color: item.color,
      unitPrice: item.unitPrice,
    })),
  });

  const fetchPendingPickings = useCallback(async () => {
    setPendingPickingsLoading(true);
    try {
      const res = await materialInventoryApi.listPendingPickings({ status: 'pending', pageSize: 100 });
      const records = res?.data?.records || [];
      const withItems = (records as PendingPickingType[]).map((p) => {
        const items: PendingPickingItem[] = Array.isArray((p as any).items) ? (p as any).items : [];
        return { ...p, items };
      });
      setPendingPickings(withItems as any);
    } catch {
      // silent
    } finally {
      setPendingPickingsLoading(false);
    }
  }, []);

  useEffect(() => { void fetchPendingPickings(); }, [fetchPendingPickings]);

  const handleConfirmOutbound = async (record: PendingPicking) => {
    if (confirmingPickingId) return;
    setConfirmingPickingId(record.id);
    try {
      await materialInventoryApi.confirmOutbound(record.id);
      message.success('出库确认成功！库存已扣减。');
      setPendingPickings(prev => prev.filter(p => p.id !== record.id));
      openPrintModal(buildPickingPrintPayload(record));
      void fetchPendingPickings();
      void fetchData();
    } catch (e: unknown) {
      const respMsg = typeof e === 'object' && e !== null && 'response' in e
        ? String((e as Record<string, any>).response?.data?.message || '') : '';
      const msg = respMsg || (e instanceof Error ? e.message : '确认出库失败');
      if (msg.includes('不是待出库')) {
        message.warning('该出库单已确认过，正在刷新列表…');
        void fetchPendingPickings();
      } else {
        message.error(msg);
      }
    } finally {
      setConfirmingPickingId(null);
    }
  };

  const handleCancelPending = async (record: PendingPicking) => {
    if (cancellingPickingId) return;
    setCancellingPickingId(record.id);
    try {
      await materialInventoryApi.cancelPending(record.id);
      message.success('已取消该出库单');
      setPendingPickings(prev => prev.filter(p => p.id !== record.id));
      void fetchPendingPickings();
    } catch (e: unknown) {
      const respMsg = typeof e === 'object' && e !== null && 'response' in e
        ? String((e as Record<string, any>).response?.data?.message || '') : '';
      message.error(respMsg || '取消失败');
    } finally {
      setCancellingPickingId(null);
    }
  };

  const handlePendingPickingPrint = (record: PendingPicking) => {
    openPrintModal(buildPickingPrintPayload(record));
  };

  return {
    pendingPickings, pendingPickingsLoading, confirmingPickingId, cancellingPickingId,
    fetchPendingPickings, handleConfirmOutbound, handleCancelPending, handlePendingPickingPrint,
  };
}
