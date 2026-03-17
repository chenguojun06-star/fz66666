import { useState, useEffect, useMemo, useCallback } from 'react';
import { Form } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useModal, useTablePagination } from '@/hooks';
import { useAuth, isSupervisorOrAbove, isAdmin as isAdminUser } from '@/utils/AuthContext';
import api from '@/utils/api';
import { safePrint } from '@/utils/safePrint';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import type { MaterialInventory } from '../types';
import type { MaterialStockAlertItem } from '../components/MaterialAlertRanking';
import QRCode from 'qrcode';
import { message } from '@/utils/antdStatic';

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
  pickerName: string;
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
  }>;
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

  const pagination = useTablePagination(20);
  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const detailModal = useModal<MaterialInventory>();
  const inboundModal = useModal<MaterialInventory>();
  const outboundModal = useModal<MaterialInventory>();

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
  const [dbMaterialOptions, setDbMaterialOptions] = useState<Array<{ label: string; value: string; dbRecord?: any }>>([]);
  const [dbSearchLoading, setDbSearchLoading] = useState(false);
  const [instructionVisible, setInstructionVisible] = useState(false);
  const [instructionSubmitting, setInstructionSubmitting] = useState(false);
  const [instructionTarget, setInstructionTarget] = useState<MaterialStockAlertItem | null>(null);
  const [receiverOptions, setReceiverOptions] = useState<Array<{ label: string; value: string; name: string; roleName?: string }>>([]);
  const [instructionForm] = Form.useForm();

  const [safetyStockVisible, setSafetyStockVisible] = useState(false);
  const [safetyStockTarget, setSafetyStockTarget] = useState<MaterialInventory | null>(null);
  const [safetyStockValue, setSafetyStockValue] = useState<number>(100);
  const [safetyStockSubmitting, setSafetyStockSubmitting] = useState(false);

  const [stats, setStats] = useState({ totalValue: 0, totalQty: 0, lowStockCount: 0, materialTypes: 0 });

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
          materialTypes: list.length
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

  const handleConfirmOutbound = async (pickingId: string) => {
    setConfirmingPickingId(pickingId);
    try {
      await api.post(`/production/picking/${pickingId}/confirm-outbound`);
      message.success('出库确认成功！库存已扣减。');
      void fetchPendingPickings();
      void fetchData();
    } catch (e: any) {
      message.error(e?.response?.data?.message || e?.message || '确认出库失败');
    } finally {
      setConfirmingPickingId(null);
    }
  };

  const alertOptions = useMemo(() => {
    return alertList.map((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      const label = `${item.materialName || item.materialCode || '物料'}${item.color ? `/${item.color}` : ''}${item.size ? `/${item.size}` : ''}`;
      return { label, value: key };
    });
  }, [alertList]);

  // 搜索面辅料数据库（全量，不限于预警列表）
  const searchMaterialFromDatabase = async (keyword: string) => {
    if (!keyword?.trim()) {
      setDbMaterialOptions([]);
      return;
    }
    setDbSearchLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword: keyword.trim(), pageSize: 30 },
      });
      const records: any[] = res?.data?.records || [];
      const opts = records.map((m: any) => {
        const isAlert = alertList.some((a) => a.materialCode === m.materialCode);
        const labelBase = `${m.materialName || ''}（${m.materialCode || ''}）`;
        return {
          label: isAlert ? `${labelBase} ⚠️库存不足` : labelBase,
          value: m.materialCode,
          dbRecord: m,
        };
      });
      setDbMaterialOptions(opts);
    } catch {
      setDbMaterialOptions([]);
    } finally {
      setDbSearchLoading(false);
    }
  };

  const loadReceivers = async () => {
    try {
      const res = await api.get('/system/user/list', { params: { page: 1, pageSize: 200 } });
      if (res?.code === 200 && res.data?.records) {
        const items = res.data.records.map((item: any) => {
          const name = String(item.name || item.username || item.id || '').trim();
          return { label: name, value: String(item.id || ''), name, roleName: String(item.roleName || '') };
        }).filter((item: any) => item.value);
        setReceiverOptions(items);
      }
    } catch (e) {
      message.error('加载接收人失败');
    }
  };

  const openInstruction = (alert: MaterialStockAlertItem) => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(alert);
    const suggested = Number(alert.suggestedSafetyStock ?? alert.safetyStock ?? 0);
    const current = Number(alert.quantity ?? 0);
    const shortage = Math.max(0, suggested - current);
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    const materialKey = `${alert.materialCode || ''}|${alert.color || ''}|${alert.size || ''}`;
    instructionForm.setFieldsValue({
      materialSelect: materialKey,
      purchaseQuantity: shortage > 0 ? shortage : 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });
    // 立即将当前用户插入 options，确保 Select 能显示名字（不等异步加载）
    if (receiverId) {
      const selfOption = { label: receiverName || receiverId, value: receiverId, name: receiverName || receiverId, roleName: String((user as any)?.roleName || '') };
      setReceiverOptions(prev => prev.some(o => o.value === receiverId) ? prev : [selfOption, ...prev]);
    }
    setInstructionVisible(true);
    loadReceivers();
  };

  const openInstructionEmpty = () => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(null);
    // 自动回填当前登录用户为采购人
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();
    instructionForm.setFieldsValue({
      purchaseQuantity: 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });
    // 立即将当前用户插入 options，确保 Select 能显示名字（不等异步加载）
    if (receiverId) {
      const selfOption = { label: receiverName || receiverId, value: receiverId, name: receiverName || receiverId, roleName: String((user as any)?.roleName || '') };
      setReceiverOptions(prev => prev.some(o => o.value === receiverId) ? prev : [selfOption, ...prev]);
    }
    setInstructionVisible(true);
    loadReceivers();
  };

  const handleMaterialSelect = async (value: string) => {
    // value 为 materialCode（来自 DB 搜索结果）
    // 优先检查该物料是否有预警记录（有则自动填充缺口数量）
    const alertMatch = alertList.find((item) => item.materialCode === value) || null;
    if (alertMatch) {
      setInstructionTarget(alertMatch);
      const suggested = Number(alertMatch.suggestedSafetyStock ?? alertMatch.safetyStock ?? 0);
      const current = Number(alertMatch.quantity ?? 0);
      const shortage = Math.max(0, suggested - current);
      instructionForm.setFieldsValue({ purchaseQuantity: shortage > 0 ? shortage : 1 });
    } else {
      // 无预警记录，从 DB 搜索结果中构建 instructionTarget，并实时查询进销存库存
      const dbOpt = dbMaterialOptions.find((opt) => opt.value === value);
      const m = dbOpt?.dbRecord;
      if (m) {
        // 先设置基本信息
        setInstructionTarget({
          materialId: String(m.id || ''),
          materialCode: m.materialCode || '',
          materialName: m.materialName || '',
          materialType: m.materialType || '',
          unit: m.unit || '',
          supplierName: m.supplierName || '',
          fabricWidth: m.fabricWidth || '',
          fabricWeight: m.fabricWeight || '',
          fabricComposition: m.fabricComposition || '',
        });
        // 查询进销存获取真实库存，计算采购缺口
        try {
          const stockRes = await api.get('/production/material/stock/list', {
            params: { materialCode: value, page: 1, pageSize: 1 },
          });
          const stockRecord = stockRes?.data?.records?.[0];
          if (stockRecord) {
            const availableQty =
              Number(stockRecord.quantity || 0) - Number(stockRecord.lockedQuantity || 0);
            const safetyStock = Number(stockRecord.safetyStock || 0);
            const shortage = Math.max(0, safetyStock - availableQty);
            instructionForm.setFieldsValue({ purchaseQuantity: shortage > 0 ? shortage : 1 });
            // 同时更新 instructionTarget 中的库存字段，供提交时参考
            setInstructionTarget((prev) =>
              prev
                ? {
                    ...prev,
                    quantity: availableQty,
                    safetyStock,
                    lockedQuantity: Number(stockRecord.lockedQuantity || 0),
                  }
                : prev,
            );
          } else {
            // 进销存中暂无记录（物料刚建档未入库），采购量默认 1
            instructionForm.setFieldsValue({ purchaseQuantity: 1 });
          }
        } catch {
          // 查询失败不影响选料，采购量默认 1
          instructionForm.setFieldsValue({ purchaseQuantity: 1 });
        }
      }
    }
  };

  const closeInstruction = () => {
    setInstructionVisible(false);
    setInstructionTarget(null);
    instructionForm.resetFields();
  };

  const handleSendInstruction = async () => {
    if (!instructionTarget) {
      message.error('请选择物料');
      return;
    }
    try {
      const values = await instructionForm.validateFields();
      const receiverId = String(values.receiverId || '').trim();
      const receiverName = String(values.receiverName || '').trim();
      if (!receiverId || !receiverName) {
        message.error('请选择采购人');
        return;
      }
      setInstructionSubmitting(true);
      const payload = {
        materialId: instructionTarget.materialId,
        materialCode: instructionTarget.materialCode,
        materialName: instructionTarget.materialName,
        materialType: instructionTarget.materialType,
        unit: instructionTarget.unit,
        color: instructionTarget.color,
        size: instructionTarget.size,
        purchaseQuantity: values.purchaseQuantity,
        receiverId, receiverName,
        remark: values.remark || '',
      };
      const res = await api.post('/production/purchase/instruction', payload);
      if (res?.code === 200) {
        message.success('指令已下发');
        closeInstruction();
      } else {
        message.error(res?.message || '指令下发失败');
      }
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '指令下发失败');
    } finally {
      setInstructionSubmitting(false);
    }
  };

  const buildAlertFromRecord = (record: MaterialInventory): MaterialStockAlertItem => {
    const key = `${record.materialCode || ''}|${record.color || ''}|${record.size || ''}`;
    const matched = alertList.find((item) => {
      const itemKey = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      return itemKey === key;
    });
    if (matched) return matched;
    return {
      materialId: record.id,
      materialCode: record.materialCode,
      materialName: record.materialName,
      materialType: record.materialType,
      unit: record.unit,
      color: record.color,
      size: record.size,
      quantity: record.quantity,
      safetyStock: record.safetyStock,
      suggestedSafetyStock: record.safetyStock,
      supplierName: record.supplierName,
      fabricWidth: record.fabricWidth,
      fabricWeight: record.fabricWeight,
      fabricComposition: record.fabricComposition,
    };
  };

  const openInstructionFromRecord = (record: MaterialInventory) => {
    const alert = buildAlertFromRecord(record);
    openInstruction(alert);
  };

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
    });
    outboundModal.open(record);
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
    try {
      const res = await api.post('/production/material/stock/manual-outbound', {
        stockId,
        quantity: totalQty,
        reason: outboundForm.getFieldValue('reason') || '手动出库',
        operatorName: user?.name || user?.username || '系统',
      });
      if (res?.code === 200 || res?.data?.code === 200) {
        message.success(`成功出库 ${totalQty} ${outboundModal.data?.unit || '件'}`);
        outboundModal.close();
        setBatchDetails([]);
        outboundForm.resetFields();
        fetchData();
      } else {
        message.error(res?.message || res?.data?.message || '出库失败');
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || error.message || '出库操作失败，请重试');
    }
  };

  const handlePrintOutbound = (record: MaterialInventory) => {
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>物料出库单</title>
        <style>
          body { font-family: SimHei, Arial; padding: 40px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; font-size: 28px; }
          .info { margin: 20px 0; }
          .info-row { display: flex; margin: 10px 0; }
          .info-label { width: 120px; font-weight: bold; }
          .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          .table th, .table td { border: 1px solid #000; padding: 8px; text-align: left; }
          .table th { background: #f0f0f0; font-weight: bold; }
          .footer { margin-top: 40px; }
          .signature { display: flex; justify-content: space-between; margin-top: 60px; }
          .signature div { width: 200px; border-bottom: 1px solid #000; text-align: center; padding-top: 80px; }
        </style>
      </head>
      <body>
        <div class="header"><h1>物料出库单</h1></div>
        <div class="info">
          <div class="info-row"><span class="info-label">出库单号：</span><span>OUT${new Date().getTime()}</span></div>
          <div class="info-row"><span class="info-label">出库日期：</span><span>${dayjs().format('YYYY-MM-DD HH:mm')}</span></div>
          <div class="info-row"><span class="info-label">面料编号：</span><span>${record.materialCode}</span></div>
          <div class="info-row"><span class="info-label">面料名称：</span><span>${record.materialName}</span></div>
          <div class="info-row"><span class="info-label">规格型号：</span><span>${record.specification}</span></div>
          <div class="info-row"><span class="info-label">供应商：</span><span>${record.supplierName}</span></div>
        </div>
        <table class="table">
          <thead><tr><th>序号</th><th>面料名称</th><th>规格</th><th>单位</th><th>库存数量</th><th>出库数量</th><th>库位</th><th>备注</th></tr></thead>
          <tbody><tr><td>1</td><td>${record.materialName}</td><td>${record.specification}</td><td>${record.unit}</td><td>${record.availableQty}</td><td>___________</td><td>${record.warehouseLocation}</td><td></td></tr></tbody>
        </table>
        <div class="footer"><div class="info-row"><span class="info-label">备注：</span><span>_________________________________________</span></div></div>
        <div class="signature"><div>仓库管理员：</div><div>领料人：</div><div>审核人：</div></div>
      </body></html>`;
    const success = safePrint(printContent, '物料出库单');
    if (!success) message.error('浏览器拦截了新窗口');
  };

  return {
    // data & loading
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination, user,
    // search filters
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    // modals
    detailModal, inboundModal, outboundModal, rollModal,
    // forms
    inboundForm, outboundForm, rollForm, instructionForm,
    // tx
    txLoading, txList,
    // batch
    batchDetails, setBatchDetails, generatingRolls,
    // alerts
    alertLoading, alertList, alertOptions,
    dbMaterialOptions, dbSearchLoading, searchMaterialFromDatabase,
    // instruction
    instructionVisible, instructionSubmitting, instructionTarget, receiverOptions,
    // safety stock
    safetyStockVisible, setSafetyStockVisible, safetyStockTarget, safetyStockValue, setSafetyStockValue, safetyStockSubmitting,
    // pending pickings
    pendingPickings, pendingPickingsLoading, confirmingPickingId,
    // actions
    fetchData, fetchPendingPickings,
    handleConfirmOutbound, handleMaterialSelect,
    openInstruction, openInstructionEmpty, closeInstruction, handleSendInstruction,
    openInstructionFromRecord,
    handleEditSafetyStock, handleSafetyStockSave,
    handleViewDetail, handleInbound, handleInboundConfirm,
    handleGenerateRollLabels,
    handleOutbound, handleBatchQtyChange, handleOutboundConfirm,
    handlePrintOutbound,
  };
}
