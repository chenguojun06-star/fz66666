import { useState, useCallback, useEffect } from 'react';
import { useTablePagination } from '@/hooks';
import { useUser } from '@/utils/AuthContext';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { materialInventoryApi } from '@/services/warehouse/materialInventoryApi';
import type { PendingPicking as PickingRecord } from '@/types/warehouse';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import { message } from '@/utils/antdStatic';

export interface PickingItem {
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
}

export type PickingStatus = 'pending' | 'completed' | 'cancelled';

export interface PickupRecordBrief {
  id: string;
  pickupNo: string;
  auditStatus: string;
  financeStatus: string;
  financeRemark: string;
  factoryType: string;
  receivableNo: string;
  receivableStatus: string;
  receivedAmount: number;
  amount: number;
  unitPrice: number;
  quantity: number;
  materialCode: string;
  materialName: string;
}

export interface PickingRow extends PickingRecord {
  items?: PickingItem[];
  pickupRecords?: PickupRecordBrief[];
}

export function useMaterialPickupData() {
  const { user } = useUser();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<PickingRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [keyword, setKeyword] = useState('');
  const [pickupType, setPickupType] = useState<string | undefined>(undefined);
  const [usageType, setUsageType] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs] | null>(null);

  const pagination = useTablePagination(20, 'material-picking-records');
  const { current, pageSize } = pagination.pagination;
  const { setTotal } = pagination;

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [auditingId, setAuditingId] = useState<string | null>(null);

  const [printPayload, setPrintPayload] = useState<MaterialOutboundPrintPayload | null>(null);
  const [printVisible, setPrintVisible] = useState(false);

  const fetchData = useCallback(async (opt?: { silent?: boolean; page?: number }) => {
    if (!opt?.silent) setLoading(true);
    try {
      const params: Record<string, any> = {
        page: opt?.page ?? current ?? 1,
        pageSize: pageSize ?? 20,
      };
      if (statusFilter) params.status = statusFilter;
      if (keyword) params.keyword = keyword;
      if (pickupType) params.pickupType = pickupType;
      if (usageType) params.usageType = usageType;
      if (dateRange?.[0]) params.startDate = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.endDate = dateRange[1].format('YYYY-MM-DD');

      const res = await materialInventoryApi.listPendingPickings(params);
      const records = res?.data?.records || [];
      const withItems = (records as PickingRow[]).map((p) => {
        const items: PickingItem[] = Array.isArray((p as any).items) ? (p as any).items : [];
        return { ...p, items };
      });

      const completedPickings = withItems.filter((p) => p.status === 'completed');
      if (completedPickings.length > 0) {
        try {
          const pickupRecordResults = await Promise.all(
            completedPickings.map(async (p) => {
              try {
                const prRes: any = await materialInventoryApi.listPickupRecordsBySource(p.id);
                const prRecords = Array.isArray(prRes?.data) ? prRes.data : (prRes?.data?.records || []);
                return { pickingId: p.id, records: prRecords as PickupRecordBrief[] };
              } catch {
                return { pickingId: p.id, records: [] as PickupRecordBrief[] };
              }
            })
          );
          const prMap = new Map(pickupRecordResults.map((r) => [r.pickingId, r.records]));
          for (const p of withItems) {
            if (p.status === 'completed') {
              p.pickupRecords = prMap.get(p.id) || [];
            }
          }
        } catch {
          // silent
        }
      }

      setDataSource(withItems);
      setTotal(Number(res?.data?.total ?? 0));
    } catch {
      message.error('加载领料记录失败');
    } finally {
      if (!opt?.silent) setLoading(false);
    }
  }, [current, pageSize, statusFilter, keyword, pickupType, usageType, dateRange, setTotal]);

  useEffect(() => {
    void fetchData({ silent: true });
  }, [fetchData]);

  const buildPrintPayload = (record: PickingRow): MaterialOutboundPrintPayload => ({
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

  const handleConfirmOutbound = async (record: PickingRow) => {
    if (confirmingId) return;
    setConfirmingId(record.id);
    try {
      await materialInventoryApi.confirmOutbound(record.id);
      message.success('出库确认成功！库存已扣减。');
      setPrintPayload(buildPrintPayload({ ...record, status: 'completed' }));
      setPrintVisible(true);
      void fetchData();
    } catch (e: unknown) {
      const respMsg = typeof e === 'object' && e !== null && 'response' in e
        ? String((e as Record<string, any>).response?.data?.message || '') : '';
      const msg = respMsg || (e instanceof Error ? e.message : '确认出库失败');
      if (msg.includes('不是待出库')) {
        message.warning('该出库单已确认过，正在刷新列表…');
        void fetchData();
      } else {
        message.error(msg);
      }
    } finally {
      setConfirmingId(null);
    }
  };

  const handleCancelPending = async (record: PickingRow) => {
    if (cancellingId) return;
    setCancellingId(record.id);
    try {
      await materialInventoryApi.cancelPending(record.id);
      message.success('已取消该出库单');
      void fetchData();
    } catch (e: unknown) {
      const respMsg = typeof e === 'object' && e !== null && 'response' in e
        ? String((e as Record<string, any>).response?.data?.message || '') : '';
      message.error(respMsg || '取消失败');
    } finally {
      setCancellingId(null);
    }
  };

  const handleAudit = async (pickupRecordId: string, action: 'approve' | 'reject', remark?: string) => {
    if (auditingId) return;
    setAuditingId(pickupRecordId);
    try {
      await materialInventoryApi.auditPickupRecord(pickupRecordId, { action, remark });
      message.success(action === 'approve' ? '审核通过' : '已拒绝');
      void fetchData();
    } catch (e: unknown) {
      const respMsg = typeof e === 'object' && e !== null && 'response' in e
        ? String((e as Record<string, any>).response?.data?.message || '') : '';
      message.error(respMsg || '审核失败');
    } finally {
      setAuditingId(null);
    }
  };

  const handleBatchAudit = async (pickupRecordIds: string[], action: 'approve' | 'reject', remark?: string) => {
    let successCount = 0;
    let failCount = 0;
    for (const id of pickupRecordIds) {
      try {
        await materialInventoryApi.auditPickupRecord(id, { action, remark });
        successCount++;
      } catch {
        failCount++;
      }
    }
    if (failCount > 0) {
      message.warning(`审核完成：${successCount}条成功，${failCount}条失败`);
    } else {
      message.success(`审核成功（${successCount}条）`);
    }
    void fetchData();
  };

  const handlePrint = (record: PickingRow) => {
    setPrintPayload(buildPrintPayload(record));
    setPrintVisible(true);
  };

  const closePrint = () => {
    setPrintVisible(false);
    setPrintPayload(null);
  };

  return {
    loading,
    dataSource,
    keyword,
    setKeyword,
    statusFilter,
    setStatusFilter,
    pickupType,
    setPickupType,
    usageType,
    setUsageType,
    dateRange,
    setDateRange,
    pagination,
    confirmingId,
    cancellingId,
    auditingId,
    printPayload,
    printVisible,
    fetchData,
    handleConfirmOutbound,
    handleCancelPending,
    handleAudit,
    handleBatchAudit,
    handlePrint,
    closePrint,
  };
}
