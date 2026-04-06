import { useState, useEffect, useMemo, useCallback } from 'react';
import { Form } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useModal, useTablePagination } from '@/hooks';
import { useAuth, isSupervisorOrAbove, isAdmin as isAdminUser } from '@/utils/AuthContext';
import api from '@/utils/api';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import factoryApi from '@/services/system/factoryApi';
import type { MaterialInventory } from '../types';
import type { MaterialStockAlertItem } from '../components/MaterialAlertRanking';
import type { MaterialOutboundPrintPayload } from '../components/MaterialOutboundPrintModal';
import QRCode from 'qrcode';
import { message } from '@/utils/antdStatic';
import { useInstructionManager } from './useInstructionManager';

// 物料批次明细接口
export interface MaterialBatchDetail {
  batchNo: string;
  warehouseLocation: string;
  color?: string;
  availableQty: number;
  lockedQty: number;
  inboundDate: string;
  expiryDate?: string;
  outboundQty?: number;
}

// 待出库领料单
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

interface OutboundFactoryOption {
  value: string;
  label: string;
  factoryId?: string;
  factoryName: string;
  factoryType?: string;
}

interface OutboundOrderOption {
  value: string;
  label: string;
  orderNo: string;
  styleNo?: string;
  factoryId?: string;
  factoryName?: string;
  factoryType?: string;
}

export function useMaterialInventoryData() {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<MaterialInventory[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const { user } = useAuth();
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);
  const showMaterialAI = useMemo(() => isSmartFeatureEnabled('smart.material.inventory.ai.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const pagination = useTablePagination(20, 'material-inventory-main');
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const detailModal = useModal<MaterialInventory>();
  const inboundModal = useModal<MaterialInventory>();
  const outboundModal = useModal<MaterialInventory>();
  const printModal = useModal<MaterialOutboundPrintPayload>();

  const [txLoading, setTxLoading] = useState(false);
  const [txList, setTxList] = useState<Array<{
    type: string; typeLabel: string; operationTime: string | null;
    quantity: number; operatorName: string; warehouseLocation: string; remark: string;
  }>>([]);

  const [inboundForm] = Form.useForm();
  const [outboundForm] = Form.useForm();
  const [rollForm] = Form.useForm();
  const rollModal = useModal<{ inboundId: string; materialCode: string; materialName: string }>();
  const [generatingRolls, setGeneratingRolls] = useState(false);
  const [batchDetails, setBatchDetails] = useState<MaterialBatchDetail[]>([]);

  const [alertLoading, setAlertLoading] = useState(false);
  const [alertList, setAlertList] = useState<MaterialStockAlertItem[]>([]);
  const instruction = useInstructionManager({ alertList, user });
  const [factoryOptions, setFactoryOptions] = useState<OutboundFactoryOption[]>([]);
  const [outboundOrderOptions, setOutboundOrderOptions] = useState<OutboundOrderOption[]>([]);

  const [safetyStockVisible, setSafetyStockVisible] = useState(false);
  const [safetyStockTarget, setSafetyStockTarget] = useState<MaterialInventory | null>(null);
  const [safetyStockValue, setSafetyStockValue] = useState<number>(100);
  const [safetyStockSubmitting, setSafetyStockSubmitting] = useState(false);

  const [stats, setStats] = useState({ totalValue: 0, totalQty: 0, lowStockCount: 0, materialTypes: 0, todayInCount: 0, todayOutCount: 0 });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { current, pageSize } = pagination.pagination;
      const res = await api.get('/production/material/stock/list', {
        params: {
          page: current, pageSize,
          materialCode: searchText,
          materialType: selectedType || undefined,
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        }
      });
      if (res?.data?.records) {
        const list = res.data.records.map((item: any) => ({
          ...item,
          availableQty: (item.quantity || 0) - (item.lockedQuantity || 0),
          lockedQty: item.lockedQuantity || 0,
          specification: item.specifications,
          safetyStock: item.safetyStock || 100,
          inTransitQty: 0,
          conversionRate: item.conversionRate != null ? Number(item.conversionRate) : undefined,
          unitPrice: Number(item.unitPrice) || 0,
          totalValue: Number(item.totalValue) || (item.quantity || 0) * (Number(item.unitPrice) || 0),
          warehouseLocation: item.location || '默认仓',
          lastInboundDate: item.lastInboundDate ? String(item.lastInboundDate).replace('T', ' ').substring(0, 16) : (item.updateTime ? String(item.updateTime).replace('T', ' ').substring(0, 16) : '-'),
          lastOutboundDate: item.lastOutboundDate ? String(item.lastOutboundDate).replace('T', ' ').substring(0, 16) : '-',
          supplierName: item.supplierName || '-',
        }));
        setDataSource(list);
        pagination.setTotal(res.data.total);
        setStats({
          totalValue: list.reduce((sum: number, i: any) => sum + (i.totalValue || 0), 0),
          totalQty: list.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0),
          lowStockCount: list.filter((i: any) => (i.quantity || 0) < (i.safetyStock || 100)).length,
          materialTypes: list.length,
          todayInCount: res.data?.todayInCount || 0,
          todayOutCount: res.data?.todayOutCount || 0,
        });
        if (showSmartErrorNotice) setSmartError(null);
      }
    } catch (e) {
      reportSmartError('面辅料库存加载失败', '网络异常或服务不可用，请稍后重试', 'WAREHOUSE_MATERIAL_STOCK_LOAD_FAILED');
      message.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (pagination.pagination.pageSize < 20) {
      pagination.setPageSize(20);
    }
  }, [pagination, pagination.pagination.pageSize]);

  useEffect(() => {
    fetchData();
  }, [pagination.pagination.current, pagination.pagination.pageSize, searchText, selectedType, dateRange]);

  useEffect(() => {
    if (!detailModal.visible || !detailModal.data?.materialCode) {
      setTxList([]);
      return;
    }
    const code = detailModal.data.materialCode;
    setTxLoading(true);
    api.get('/production/material/stock/transactions', {
      params: { materialCode: code }
    }).then((res: any) => {
      setTxList(Array.isArray(res) ? res : (res?.data ? res.data : []));
    }).catch(() => {
      message.error('加载出入库记录失败');
    }).finally(() => {
      setTxLoading(false);
    });
  }, [detailModal.visible, detailModal.data?.materialCode]);

  const fetchAlerts = async () => {
    setAlertLoading(true);
    try {
      const res = await api.get('/production/material/stock/alerts', {
        params: { days: 30, leadDays: 7, limit: 50, onlyNeed: true },
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        setAlertList(res.data as MaterialStockAlertItem[]);
      } else {
        setAlertList([]);
      }
    } catch (e) {
      setAlertList([]);
    } finally {
      setAlertLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 60000);
    return () => clearInterval(timer);
  }, []);

  // ===== 待出库领料单 =====
  const [pendingPickings, setPendingPickings] = useState<PendingPicking[]>([]);
  const [pendingPickingsLoading, setPendingPickingsLoading] = useState(false);
  const [confirmingPickingId, setConfirmingPickingId] = useState<string | null>(null);

  const openPrintModal = (payload: MaterialOutboundPrintPayload) => {
    printModal.open(payload);
  };

  const buildManualOutboundPrintPayload = (
    record: MaterialInventory,
    values: Record<string, any>,
    outboundNo: string,
  ): MaterialOutboundPrintPayload => {
    const selectedBatches = batchDetails.filter((item) => (item.outboundQty || 0) > 0);
    return {
      outboundNo,
      outboundTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      materialCode: record.materialCode,
      materialName: record.materialName,
      materialType: record.materialType,
      specification: record.specification,
      color: record.color,
      unit: record.unit,
      supplierName: record.supplierName,
      fabricWidth: record.fabricWidth,
      fabricWeight: record.fabricWeight,
      fabricComposition: record.fabricComposition,
      orderNo: values.orderNo,
      styleNo: values.styleNo,
      factoryName: values.factoryName,
      factoryType: values.factoryType || values.pickupType,
      pickupType: values.pickupType,
      usageType: values.usageType,
      receiverName: values.receiverName,
      issuerName: user?.name || user?.username || '系统',
      warehouseLocation: record.warehouseLocation,
      remark: values.reason || '手动出库',
      items: selectedBatches.map((item) => ({
        batchNo: item.batchNo,
        warehouseLocation: item.warehouseLocation,
        quantity: item.outboundQty || 0,
        unit: record.unit,
        materialName: record.materialName,
        specification: record.specification,
        color: record.color,
        unitPrice: record.unitPrice,
      })),
    };
  };

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
      batchNo: '',
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
      const res = await api.get('/production/picking/list', {
        params: { status: 'pending', pageSize: 100 },
      });
      const records = res?.data?.records || res?.records || [];
      const withItems = await Promise.all(
        (records as PendingPicking[]).map(async (p) => {
          try {
            const itemRes = await api.get(`/production/picking/${p.id}/items`);
            return { ...p, items: itemRes?.data || itemRes || [] };
          } catch {
            return { ...p, items: [] };
          }
        })
      );
      setPendingPickings(withItems);
    } catch {
      // silent
    } finally {
      setPendingPickingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPendingPickings();
  }, [fetchPendingPickings]);

  const handleConfirmOutbound = async (record: PendingPicking) => {
    if (confirmingPickingId) return;
    setConfirmingPickingId(record.id);
    try {
      await api.post(`/production/picking/${record.id}/confirm-outbound`);
      message.success('出库确认成功！库存已扣减。');
      setPendingPickings(prev => prev.filter(p => p.id !== record.id));
      openPrintModal(buildPickingPrintPayload(record));
      void fetchPendingPickings();
      void fetchData();
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || '确认出库失败';
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

  const [cancellingPickingId, setCancellingPickingId] = useState<string | null>(null);
  const handleCancelPending = async (record: PendingPicking) => {
    if (cancellingPickingId) return;
    setCancellingPickingId(record.id);
    try {
      await api.post(`/production/picking/${record.id}/cancel-pending`);
      message.success('已取消该出库单');
      setPendingPickings(prev => prev.filter(p => p.id !== record.id));
      void fetchPendingPickings();
    } catch (e: any) {
      message.error(e?.response?.data?.message || '取消失败');
    } finally {
      setCancellingPickingId(null);
    }
  };

  const alertOptions = useMemo(() => {
    return alertList.map((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      const label = `${item.materialName || item.materialCode || '物料'}${item.color ? `/${item.color}` : ''}${item.size ? `/${item.size}` : ''}`;
      return { label, value: key };
    });
  }, [alertList]);

  const loadFactories = useCallback(async () => {
    try {
      const res = await factoryApi.list({ page: 1, pageSize: 200, status: 'active' });
      const records = res?.data?.records || [];
      const nextOptions: OutboundFactoryOption[] = records.map((item: any) => {
        const factoryName = String(item.factoryName || '').trim();
        const factoryCode = String(item.factoryCode || '').trim();
        const factoryType = String(item.factoryType || '').trim().toUpperCase();
        return {
          value: factoryName,
          label: factoryCode ? `${factoryName}（${factoryCode}）` : factoryName,
          factoryId: String(item.id || '').trim() || undefined,
          factoryName,
          factoryType: factoryType || undefined,
        };
      }).filter((item: OutboundFactoryOption) => item.factoryName);
      setFactoryOptions(nextOptions);
    } catch {
      message.error('加载工厂列表失败');
    }
  }, []);

  const searchOutboundOrders = useCallback(async (factoryName?: string, factoryType?: string, keyword?: string) => {
    if (!factoryName && !keyword) {
      setOutboundOrderOptions([]);
      return [];
    }
    try {
      const res = await api.get('/production/orders/list', {
        params: {
          page: 1,
          pageSize: 50,
          factoryName: factoryName || undefined,
          factoryType: factoryType || undefined,
          orderNo: keyword || undefined,
          excludeTerminal: true,
        },
      });
      const records = res?.data?.records || res?.records || [];
      const options: OutboundOrderOption[] = records.map((item: any) => ({
        value: String(item.orderNo || ''),
        label: `${item.orderNo || '-'} / ${item.styleNo || '-'} / ${item.factoryName || factoryName || '-'}`,
        orderNo: String(item.orderNo || ''),
        styleNo: String(item.styleNo || ''),
        factoryId: item.factoryId ? String(item.factoryId) : undefined,
        factoryName: item.factoryName ? String(item.factoryName) : factoryName,
        factoryType: item.factoryType ? String(item.factoryType).toUpperCase() : factoryType,
      })).filter((item: OutboundOrderOption) => item.orderNo);
      setOutboundOrderOptions(options);
      return options;
    } catch {
      setOutboundOrderOptions([]);
      return [];
    }
  }, []);

  const handleOutboundFactoryInput = async (factoryName: string) => {
    const trimmedName = factoryName.trim();
    const matched = factoryOptions.find((item) => item.factoryName === trimmedName);
    const currentOrderNo = outboundForm.getFieldValue('orderNo');
    outboundForm.setFieldsValue({
      factoryName,
      factoryId: matched?.factoryId,
      factoryType: matched?.factoryType,
      pickupType: matched?.factoryType || outboundForm.getFieldValue('pickupType') || 'INTERNAL',
    });
    if (trimmedName) {
      await searchOutboundOrders(trimmedName, matched?.factoryType, currentOrderNo);
    } else {
      setOutboundOrderOptions([]);
    }
  };

  const handleOutboundOrderInput = async (orderNo: string) => {
    outboundForm.setFieldValue('orderNo', orderNo);
    const factoryName = outboundForm.getFieldValue('factoryName');
    const factoryType = outboundForm.getFieldValue('factoryType');
    await searchOutboundOrders(factoryName, factoryType, orderNo.trim());
  };

  const handleOutboundOrderSelect = (orderNo: string) => {
    const matched = outboundOrderOptions.find((item) => item.orderNo === orderNo);
    if (!matched) {
      outboundForm.setFieldValue('orderNo', orderNo);
      return;
    }
    outboundForm.setFieldsValue({
      orderNo: matched.orderNo,
      styleNo: matched.styleNo,
      factoryId: matched.factoryId,
      factoryName: matched.factoryName,
      factoryType: matched.factoryType,
      pickupType: matched.factoryType || outboundForm.getFieldValue('pickupType') || 'INTERNAL',
    });
  };

  const autoMatchOutboundContext = useCallback(async (record: MaterialInventory, extra?: {
    receiverId?: string;
    receiverName?: string;
    factoryName?: string;
    factoryType?: string;
  }) => {
    try {
      const factoryName = extra?.factoryName || outboundForm.getFieldValue('factoryName') || '';
      const factoryType = extra?.factoryType || outboundForm.getFieldValue('factoryType') || '';
      const receiverId = extra?.receiverId || outboundForm.getFieldValue('receiverId') || '';
      const receiverName = extra?.receiverName || outboundForm.getFieldValue('receiverName') || '';

      if (factoryName) {
        await searchOutboundOrders(factoryName, factoryType);
      }

      const res = await api.get('/production/material/list', {
        params: {
          page: 1,
          pageSize: 20,
          materialCode: record.materialCode,
          receiverId: receiverId || undefined,
          receiverName: receiverName || undefined,
          factoryName: factoryName || undefined,
          factoryType: factoryType || undefined,
        },
      });
      const records = res?.data?.records || res?.records || [];
      const candidates = records.filter((item: any) => item?.orderNo || item?.styleNo);
      if (candidates.length === 0) {
        return;
      }
      const sameFactoryCandidates = factoryName
        ? candidates.filter((item: any) => String(item.factoryName || '').trim() === String(factoryName).trim())
        : candidates;
      const sameReceiverCandidates = receiverId
        ? sameFactoryCandidates.filter((item: any) => String(item.receiverId || '').trim() === String(receiverId).trim())
        : sameFactoryCandidates;
      const picked = sameReceiverCandidates[0] || sameFactoryCandidates[0] || candidates[0];
      if (!picked) {
        return;
      }
      const resolvedFactoryType = String(picked.factoryType || factoryType || '').trim().toUpperCase();
      const resolvedFactoryName = String(picked.factoryName || factoryName || '').trim();
      const matchedFactory = factoryOptions.find((item) => item.factoryName === resolvedFactoryName);
      const resolvedUsageType = picked.sourceType === 'sample'
        ? 'SAMPLE'
        : picked.sourceType === 'stock'
          ? 'STOCK'
          : 'BULK';
      outboundForm.setFieldsValue({
        orderNo: picked.orderNo || outboundForm.getFieldValue('orderNo'),
        styleNo: picked.styleNo || outboundForm.getFieldValue('styleNo'),
        factoryId: matchedFactory?.factoryId || outboundForm.getFieldValue('factoryId'),
        factoryName: resolvedFactoryName || outboundForm.getFieldValue('factoryName'),
        factoryType: resolvedFactoryType || outboundForm.getFieldValue('factoryType'),
        pickupType: resolvedFactoryType || outboundForm.getFieldValue('pickupType') || 'INTERNAL',
        usageType: outboundForm.getFieldValue('usageType') || resolvedUsageType,
      });
    } catch {
      // silent
    }
  }, [factoryOptions, outboundForm, searchOutboundOrders]);

  const handleEditSafetyStock = (record: MaterialInventory) => {
    setSafetyStockTarget(record);
    setSafetyStockValue(record.safetyStock ?? 100);
    setSafetyStockVisible(true);
  };

  const handleSafetyStockSave = async () => {
    if (!safetyStockTarget) return;
    setSafetyStockSubmitting(true);
    try {
      const res = await api.post<{ code: number }>('/production/material/stock/update-safety-stock', {
        stockId: safetyStockTarget.id,
        safetyStock: safetyStockValue,
      });
      if (res.code === 200) {
        message.success('安全库存已更新');
        setSafetyStockVisible(false);
        fetchData();
        fetchAlerts();
      } else {
        message.error('更新失败');
      }
    } catch {
      message.error('更新安全库存失败');
    } finally {
      setSafetyStockSubmitting(false);
    }
  };

  const handleViewDetail = (record: MaterialInventory) => {
    detailModal.open(record);
  };

  const handleInbound = (record?: MaterialInventory) => {
    if (record) {
      inboundForm.setFieldsValue({
        materialCode: record.materialCode,
        materialName: record.materialName,
        warehouseLocation: record.warehouseLocation,
      });
    }
    inboundModal.open(record || null);
  };

  const handleInboundConfirm = async () => {
    try {
      const values = await inboundForm.validateFields();
      const response = await api.post('/production/material/inbound/manual', {
        materialCode: values.materialCode,
        materialName: values.materialName || '',
        materialType: values.materialType || '面料',
        color: values.color || '',
        size: values.size || '',
        quantity: values.quantity,
        warehouseLocation: values.warehouseLocation || '默认仓',
        supplierName: values.supplierName || '',
        supplierId: values.supplierId || '',
        supplierContactPerson: values.supplierContactPerson || '',
        supplierContactPhone: values.supplierContactPhone || '',
        operatorId: user?.id || '',
        operatorName: user?.name || user?.username || '系统',
        remark: values.remark || '',
      });
      if (response.data.code === 200) {
        const { inboundNo, inboundId } = response.data.data;
        inboundModal.close();
        inboundForm.resetFields();
        fetchData();
        const mat = inboundModal.data;
        rollForm.setFieldsValue({ rollCount: 1, quantityPerRoll: values.quantity, unit: '件' });
        rollModal.open({ inboundId: inboundId || '', materialCode: mat?.materialCode || values.materialCode || '', materialName: mat?.materialName || values.materialName || '' });
        message.success(`入库成功！单号：${inboundNo}，请在弹窗中生成料卷标签`);
      } else {
        message.error(response.data.message || '入库失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '入库操作失败，请重试');
    }
  };

  const printRollQrLabels = async (rolls: any[]) => {
    const items = await Promise.all(
      rolls.map(async (r) => {
        const qrUrl = await QRCode.toDataURL(r.rollCode, { width: 200, margin: 1 });
        return { ...r, qrUrl };
      })
    );
    const html = `<!DOCTYPE html><html><head><title>料卷二维码标签</title><style>
      body{font-family:sans-serif;padding:10px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
      .card{border:1px solid #ddd;border-radius:6px;padding:8px;text-align:center;break-inside:avoid}
      .code{font-size:11px;color:#666;margin:2px 0}
      .name{font-size:12px;font-weight:bold;margin:2px 0}
      .qty{font-size:12px;color:#333;margin:2px 0}
      img{width:140px;height:140px}
      @media print{body{padding:0}.grid{gap:8px}}
    </style></head><body>
      <h2 style="text-align:center;margin-bottom:12px">面辅料料卷二维码标签</h2>
      <div class="grid">${items.map(r => `
        <div class="card">
          <img src="${r.qrUrl}" />
          <div class="code">${r.rollCode}</div>
          <div class="name">${r.materialName}</div>
          <div class="qty">${r.quantity} ${r.unit}</div>
          <div class="code">${r.warehouseLocation}</div>
        </div>`).join('')}
      </div>
    </body></html>`;
    const w = window.open('', '_blank', 'width=900,height=700');
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => { w.focus(); w.print(); w.addEventListener('afterprint', () => w.close()); }, 600);
    }
  };

  const handleGenerateRollLabels = async () => {
    try {
      setGeneratingRolls(true);
      const values = await rollForm.validateFields();
      const { inboundId } = rollModal.data!;
      const res = await api.post('/production/material/roll/generate', {
        inboundId: inboundId || undefined,
        rollCount: values.rollCount,
        quantityPerRoll: values.quantityPerRoll,
        unit: values.unit,
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        rollModal.close();
        rollForm.resetFields();
        void printRollQrLabels(res.data);
        message.success(`已生成 ${values.rollCount} 张料卷标签！`);
      } else {
        message.error(res?.message || '生成失败');
      }
    } catch (e: any) {
      message.error(e.message || '操作失败');
    } finally {
      setGeneratingRolls(false);
    }
  };

  const handleOutbound = async (record: MaterialInventory) => {
    outboundForm.setFieldsValue({
      materialCode: record.materialCode,
      materialName: record.materialName,
      availableQty: record.availableQty,
      pickupType: 'INTERNAL',
      usageType: 'BULK',
      issuerName: user?.name || user?.username || '系统',
      factoryName: '',
      factoryId: undefined,
      factoryType: undefined,
      orderNo: '',
      styleNo: '',
      receiverId: undefined,
      receiverName: '',
    });
    outboundModal.open(record);
    if (instruction.receiverOptions.length === 0) {
      void instruction.loadReceivers();
    }
    if (factoryOptions.length === 0) {
      void loadFactories();
    }
    setOutboundOrderOptions([]);
    void autoMatchOutboundContext(record);
    try {
      const res = await api.get('/production/material/stock/batches', {
        params: {
          materialCode: record.materialCode,
          color: record.color || undefined,
          size: record.size || undefined,
        },
      });
      if (res?.code === 200 && Array.isArray(res.data)) {
        const batchList: MaterialBatchDetail[] = res.data.map((item: any) => ({
          batchNo: item.batchNo || '',
          warehouseLocation: item.warehouseLocation || '默认仓',
          color: item.color || '',
          availableQty: item.availableQty || 0,
          lockedQty: item.lockedQty || 0,
          inboundDate: item.inboundDate ? dayjs(item.inboundDate).format('YYYY-MM-DD') : '',
          expiryDate: item.expiryDate ? dayjs(item.expiryDate).format('YYYY-MM-DD') : undefined,
          outboundQty: 0,
        }));
        setBatchDetails(batchList);
      } else {
        message.warning('未找到该物料的批次记录');
        setBatchDetails([]);
      }
    } catch (e) {
      message.error('加载批次明细失败');
      setBatchDetails([]);
    }
  };

  const handleBatchQtyChange = (index: number, value: number | null) => {
    const newDetails = [...batchDetails];
    newDetails[index].outboundQty = value || 0;
    setBatchDetails(newDetails);
  };

  const handleOutboundConfirm = async () => {
    try {
      const values = await outboundForm.validateFields();
      const selectedBatches = batchDetails.filter(item => (item.outboundQty || 0) > 0);
      if (selectedBatches.length === 0) {
        message.warning('请至少输入一个批次的出库数量');
        return;
      }
      const invalidBatches = selectedBatches.filter(item => (item.outboundQty || 0) > item.availableQty);
      if (invalidBatches.length > 0) {
        message.error(`批次 ${invalidBatches[0].batchNo} 的出库数量超过可用库存`);
        return;
      }
      const totalQty = selectedBatches.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
      const stockId = outboundModal.data?.id;
      if (!stockId) {
        message.error('库存记录ID缺失，无法出库');
        return;
      }
      const res = await api.post('/production/material/stock/manual-outbound', {
        stockId,
        quantity: totalQty,
        reason: values.reason || '手动出库',
        orderNo: values.orderNo,
        styleNo: values.styleNo,
        factoryId: values.factoryId,
        factoryName: values.factoryName,
        factoryType: values.factoryType || values.pickupType,
        receiverId: values.receiverId,
        receiverName: values.receiverName,
        pickupType: values.pickupType,
        usageType: values.usageType,
      });
      if (res?.code === 200 || res?.data?.code === 200) {
        const outboundNo = res?.data?.outboundNo || `MOB-${Date.now()}`;
        message.success(`成功出库 ${totalQty} ${outboundModal.data?.unit || '件'}`);
        if (outboundModal.data) {
          openPrintModal(buildManualOutboundPrintPayload(outboundModal.data, values, outboundNo));
        }
        outboundModal.close();
        setBatchDetails([]);
        outboundForm.resetFields();
        void fetchData();
      } else {
        message.error(res?.message || res?.data?.message || '出库失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '出库操作失败，请重试');
    }
  };

  const handlePrintOutbound = (record: MaterialInventory) => {
    openPrintModal({
      outboundNo: `PREVIEW-${dayjs().format('YYYYMMDDHHmmss')}`,
      outboundTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      materialCode: record.materialCode,
      materialName: record.materialName,
      materialType: record.materialType,
      specification: record.specification,
      color: record.color,
      unit: record.unit,
      supplierName: record.supplierName,
      fabricWidth: record.fabricWidth,
      fabricWeight: record.fabricWeight,
      fabricComposition: record.fabricComposition,
      receiverName: '',
      issuerName: user?.name || user?.username || '系统',
      warehouseLocation: record.warehouseLocation,
      remark: '请先执行正式出库后再打印正式单据',
      items: [
        {
          quantity: record.availableQty,
          unit: record.unit,
          materialName: record.materialName,
          specification: record.specification,
          warehouseLocation: record.warehouseLocation,
          color: record.color,
          unitPrice: record.unitPrice,
        },
      ],
    });
  };

  const handlePendingPickingPrint = (record: PendingPicking) => {
    openPrintModal(buildPickingPrintPayload(record));
  };

  return {
    // data & loading
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination, user,
    // search filters
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    // modals
    detailModal, inboundModal, outboundModal, rollModal, printModal,
    // forms
    inboundForm, outboundForm, rollForm,
    // tx
    txLoading, txList,
    // batch
    batchDetails, setBatchDetails, generatingRolls,
    // alerts
    alertLoading, alertList, alertOptions,
    // instruction (from useInstructionManager)
    ...instruction,
    // safety stock
    safetyStockVisible, setSafetyStockVisible, safetyStockTarget, safetyStockValue, setSafetyStockValue, safetyStockSubmitting,
    // pending pickings
    pendingPickings, pendingPickingsLoading, confirmingPickingId, cancellingPickingId,
    // actions
    fetchData, fetchPendingPickings,
    handleConfirmOutbound, handleCancelPending,
    handleEditSafetyStock, handleSafetyStockSave,
    handleViewDetail, handleInbound, handleInboundConfirm,
    handleGenerateRollLabels,
    factoryOptions, outboundOrderOptions,
    handleOutboundFactoryInput, handleOutboundOrderInput, handleOutboundOrderSelect,
    autoMatchOutboundContext,
    handleOutbound, handleBatchQtyChange, handleOutboundConfirm,
    handlePrintOutbound, handlePendingPickingPrint,
  };
}
