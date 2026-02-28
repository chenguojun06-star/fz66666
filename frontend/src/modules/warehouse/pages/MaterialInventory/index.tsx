import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Tag,
  message,
  Select,
  Image,
  Row,
  Col,
  Form,
  InputNumber,
  Popconfirm,
  Badge,
  Tooltip,
} from 'antd';
import type { Dayjs } from 'dayjs';
import {
  WarningOutlined,
  ScanOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SupplierSelect from '@/components/common/SupplierSelect';
import { useModal, useTablePagination } from '@/hooks';
import { useAuth, isSupervisorOrAbove, isAdmin as isAdminUser } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { safePrint } from '@/utils/safePrint';
import { getMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';
import MaterialAlertRanking, { MaterialStockAlertItem } from './components/MaterialAlertRanking';
import './MaterialInventory.css';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import QRCode from 'qrcode';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { Option } = Select;

// 物料批次明细接口
interface MaterialBatchDetail {
  batchNo: string;              // 批次号
  warehouseLocation: string;    // 仓库位置
  color?: string;               // 颜色（如果有）
  availableQty: number;         // 可用库存
  lockedQty: number;            // 锁定库存
  inboundDate: string;          // 入库日期
  expiryDate?: string;          // 过期日期（如果有）
  outboundQty?: number;         // 出库数量
}

// 面辅料库存
interface MaterialInventory {
  id: string;
  materialCode: string;
  materialName: string;
  materialImage?: string;
  materialType: string;
  specification: string;
  color?: string;
  supplierName: string;
  quantity: number; // 统一用 quantity
  availableQty: number; // 暂时映射 quantity
  inTransitQty: number;
  lockedQty: number;
  safetyStock: number;
  unit: string;
  unitPrice: number;
  totalValue: number;
  warehouseLocation: string;
  lastInboundDate: string;
  lastOutboundDate: string;
  lastInboundBy?: string;     // 最后入库操作人
  lastOutboundBy?: string;    // 最后出库操作人
  remark?: string;            // 备注
  // 面料属性
  fabricWidth?: string;       // 门幅（仅面料）
  fabricWeight?: string;      // 克重（仅面料）
  fabricComposition?: string; // 成分（仅面料）
  size?: string;              // 尺码（兼容筛选/展示）
  updateTime?: string;
}

const _MaterialInventory: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<MaterialInventory[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const { user } = useAuth(); // 获取当前用户信息
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  };

  // ===== 使用 useTablePagination 管理分页 =====
  const pagination = useTablePagination(20);

  const [searchText, setSearchText] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  // ===== 使用 useModal 管理弹窗 =====
  const detailModal = useModal<MaterialInventory>();
  const inboundModal = useModal<MaterialInventory>();
  const outboundModal = useModal<MaterialInventory>();

  const [inboundForm] = Form.useForm();
  const [outboundForm] = Form.useForm();
  const [rollForm] = Form.useForm();
  const rollModal = useModal<{ inboundId: string; materialCode: string; materialName: string }>();
  const [generatingRolls, setGeneratingRolls] = useState(false);
  const [batchDetails, setBatchDetails] = useState<MaterialBatchDetail[]>([]);

  const [alertLoading, setAlertLoading] = useState(false);
  const [alertList, setAlertList] = useState<MaterialStockAlertItem[]>([]);
  const [instructionVisible, setInstructionVisible] = useState(false);
  const [instructionSubmitting, setInstructionSubmitting] = useState(false);
  const [instructionTarget, setInstructionTarget] = useState<MaterialStockAlertItem | null>(null);
  const [receiverOptions, setReceiverOptions] = useState<Array<{ label: string; value: string; name: string; roleName?: string }>>([]);
  const [instructionForm] = Form.useForm();

  // 安全库存编辑
  const [safetyStockVisible, setSafetyStockVisible] = useState(false);
  const [safetyStockTarget, setSafetyStockTarget] = useState<MaterialInventory | null>(null);
  const [safetyStockValue, setSafetyStockValue] = useState<number>(100);
  const [safetyStockSubmitting, setSafetyStockSubmitting] = useState(false);

  const [stats, setStats] = useState({
    totalValue: 0,
    totalQty: 0,
    lowStockCount: 0,
    materialTypes: 0,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const { current, pageSize } = pagination.pagination;
      const res = await api.get('/production/material/stock/list', {
        params: {
          page: current,
          pageSize: pageSize,
          materialCode: searchText,
          materialType: selectedType || undefined,
          startDate: dateRange?.[0]?.format('YYYY-MM-DD'),
          endDate: dateRange?.[1]?.format('YYYY-MM-DD'),
        }
      });

      if (res?.data?.records) {
        const list = res.data.records.map((item: any) => ({
          ...item,
          // 保留后端返回的真实数据，只做必要的字段映射和默认值处理
          availableQty: item.quantity - (item.lockedQuantity || 0), // 可用 = 总量 - 锁定
          specification: item.specifications, // 字段映射
          safetyStock: item.safetyStock || 100, // 使用后端值或默认100
          inTransitQty: 0, // 暂无在途数据
          unitPrice: item.unitPrice || 0, // 使用后端返回的单价
          totalValue: item.totalValue || (item.quantity || 0) * (item.unitPrice || 0), // 优先用后端计算值
          warehouseLocation: item.location || '默认仓',
          lastInboundDate: item.lastInboundDate || item.updateTime || '-',
          lastOutboundDate: item.lastOutboundDate || '-',
          // 保留供应商信息
          supplierName: item.supplierName || '-',
        }));
        setDataSource(list);
        pagination.setTotal(res.data.total);

        // 简单统计（计算真实总值）
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

  const fetchAlerts = async () => {
    setAlertLoading(true);
    try {
      const res = await api.get('/production/material/stock/alerts', {
        params: {
          days: 30,
          leadDays: 7,
          limit: 50,
          onlyNeed: true,
        },
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
  interface PendingPicking {
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
      // 逐项加载明细
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
      void fetchData(); // 刷新库存列表
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

  const loadReceivers = async () => {
    try {
      const res = await api.get('/system/user/list', {
        params: { page: 1, pageSize: 200 },
      });
      if (res?.code === 200 && res.data?.records) {
        const items = res.data.records.map((item: any) => {
          const name = String(item.name || item.username || item.id || '').trim();
          return {
            label: name,
            value: String(item.id || ''),
            name,
            roleName: String(item.roleName || ''),
          };
        }).filter((item: any) => item.value);
        const supervisors = items.filter((item: any) => {
          const roleName = String(item.roleName || '');
          return roleName.includes('主管') || roleName.includes('管理员');
        });
        setReceiverOptions(supervisors);
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
    const target = alert;
    setInstructionTarget(target);
    const suggested = Number(target.suggestedSafetyStock ?? target.safetyStock ?? 0);
    const current = Number(target.quantity ?? 0);
    const shortage = Math.max(0, suggested - current);
    const receiverId = String(user?.id || '').trim();
    const receiverName = String(user?.name || user?.username || '').trim();

    const materialKey = `${target.materialCode || ''}|${target.color || ''}|${target.size || ''}`;
    instructionForm.setFieldsValue({
      materialSelect: materialKey,
      purchaseQuantity: shortage > 0 ? shortage : 1,
      receiverId: receiverId || undefined,
      receiverName: receiverName || undefined,
      remark: '',
    });

    setInstructionVisible(true);
    if (!receiverOptions.length) {
      loadReceivers();
    }
  };

  const openInstructionEmpty = () => {
    if (!isSupervisorOrAbove(user) && !isAdminUser(user)) {
      message.error('仅主管可下发采购需求');
      return;
    }
    setInstructionTarget(null);
    instructionForm.resetFields();
    setInstructionVisible(true);
    if (!receiverOptions.length) {
      loadReceivers();
    }
  };

  const handleMaterialSelect = (value: string) => {
    const target = alertList.find((item) => {
      const key = `${item.materialCode || ''}|${item.color || ''}|${item.size || ''}`;
      return key === value;
    }) || null;
    setInstructionTarget(target);
    if (target) {
      const suggested = Number(target.suggestedSafetyStock ?? target.safetyStock ?? 0);
      const current = Number(target.quantity ?? 0);
      const shortage = Math.max(0, suggested - current);
      instructionForm.setFieldsValue({
        purchaseQuantity: shortage > 0 ? shortage : 1,
      });
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
        receiverId,
        receiverName,
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
    if (matched) {
      return matched;
    }
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
    };
  };

  const openInstructionFromRecord = (record: MaterialInventory) => {
    const alert = buildAlertFromRecord(record);
    openInstruction(alert);
  };

  // 打开安全库存编辑
  const handleEditSafetyStock = (record: MaterialInventory) => {
    setSafetyStockTarget(record);
    setSafetyStockValue(record.safetyStock ?? 100);
    setSafetyStockVisible(true);
  };

  // 保存安全库存
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

  // 查看详情（出入库记录）
  const handleViewDetail = (record: MaterialInventory) => {
    detailModal.open(record);
  };

  // 扫码入库
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

  // 确认入库
  const handleInboundConfirm = async () => {
    try {
      const values = await inboundForm.validateFields();

      // 调用手动入库API
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
        // 刷新库存列表
        fetchData();
        // 提示是否立即生成料卷标签
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

  // ---- 料卷标签 ----
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
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 600); }
  };

  const handleGenerateRollLabels = async () => {
    try {
      setGeneratingRolls(true);
      const values = await rollForm.validateFields();
      const { inboundId, materialCode: _materialCode, materialName: _materialName } = rollModal.data!;
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

  // 出库
  const handleOutbound = async (record: MaterialInventory) => {
    outboundForm.setFieldsValue({
      materialCode: record.materialCode,
      materialName: record.materialName,
      availableQty: record.availableQty,
    });
    outboundModal.open(record);

    // 从后端获取批次明细数据
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

  // 批次数量变化
  const handleBatchQtyChange = (index: number, value: number | null) => {
    const newDetails = [...batchDetails];
    newDetails[index].outboundQty = value || 0;
    setBatchDetails(newDetails);
  };

  // 确认出库
  const handleOutboundConfirm = async () => {
    const selectedBatches = batchDetails.filter(item => (item.outboundQty || 0) > 0);
    if (selectedBatches.length === 0) {
      message.warning('请至少输入一个批次的出库数量');
      return;
    }

    // 验证每个批次的出库数量不超过可用库存
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
  // 打印出库单
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
        <div class="header">
          <h1>物料出库单</h1>
        </div>
        <div class="info">
          <div class="info-row"><span class="info-label">出库单号：</span><span>OUT${new Date().getTime()}</span></div>
          <div class="info-row"><span class="info-label">出库日期：</span><span>${dayjs().format('YYYY-MM-DD HH:mm')}</span></div>
          <div class="info-row"><span class="info-label">面料编号：</span><span>${record.materialCode}</span></div>
          <div class="info-row"><span class="info-label">面料名称：</span><span>${record.materialName}</span></div>
          <div class="info-row"><span class="info-label">规格型号：</span><span>${record.specification}</span></div>
          <div class="info-row"><span class="info-label">供应商：</span><span>${record.supplierName}</span></div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>序号</th>
              <th>面料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th>库存数量</th>
              <th>出库数量</th>
              <th>库位</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td>${record.materialName}</td>
              <td>${record.specification}</td>
              <td>${record.unit}</td>
              <td>${record.availableQty}</td>
              <td>___________</td>
              <td>${record.warehouseLocation}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">
          <div class="info-row"><span class="info-label">备注：</span><span>_________________________________________</span></div>
        </div>
        <div class="signature">
          <div>仓库管理员：</div>
          <div>领料人：</div>
          <div>审核人：</div>
        </div>
      </body>
      </html>
    `;

    const success = safePrint(printContent, '物料出库单');
    if (!success) {
      message.error('浏览器拦截了新窗口');
    }
  };

  const columns: ColumnsType<MaterialInventory> = [
    {
      title: '图片',
      key: 'image',
      width: 72,
      fixed: 'left',
      align: 'center',
      render: (_, record) => (
        <div style={{ width: 48, height: 48, borderRadius: 4, overflow: 'hidden', background: 'var(--color-bg-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {record.materialImage ? (
            <Image
              src={getFullAuthedFileUrl(record.materialImage)}
              alt="物料"
              width={48}
              height={48}
              style={{ objectFit: 'cover' }}
              preview={false}
            />
          ) : (
            <span style={{ color: '#ccc', fontSize: 12 }}>无图</span>
          )}
        </div>
      ),
    },
    {
      title: '物料信息',
      key: 'materialInfo',
      width: 280,
      fixed: 'left',
      render: (_, record) => (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>编号：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.materialCode || '-'}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>名称：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.materialName || '-'}</span>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px', alignItems: 'center' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>分类：</span>
            <Tag
              color={getMaterialTypeCategory(record.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(record.materialType) === 'lining' ? 'cyan' : 'green'}
              style={{ fontSize: 'var(--font-size-xs)', margin: '0 0 0 8px' }}
            >
              {getMaterialTypeLabel(record.materialType)}
            </Tag>
          </div>
          <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
            <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>颜色：</span>
            <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.color || '-'}</span>
          </div>
        </Space>
      ),
    },
    {
      title: '面料属性',
      key: 'fabricProperties',
      width: 200,
      render: (_, record) => {
        if (record.materialType !== '面料') {
          return (
            <div style={{ textAlign: 'center', color: 'var(--neutral-text-disabled)', fontSize: 'var(--font-size-xs)' }}>
              -
            </div>
          );
        }

        return (
          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
            <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
              <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>幅宽：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.fabricWidth || '-'}</span>
            </div>
            <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
              <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>克重：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.fabricWeight || '-'}</span>
            </div>
            <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
              <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>成分：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }} title={record.fabricComposition || '-'}>
                {record.fabricComposition || '-'}
              </span>
            </div>
            <div style={{ display: 'flex', fontSize: 'var(--font-size-sm)', lineHeight: '22px', height: '22px' }}>
              <span style={{ color: 'var(--neutral-text-disabled)', width: '60px', textAlign: 'right', flexShrink: 0 }}>单位：</span>
              <span style={{ fontWeight: 600, marginLeft: '8px' }}>{record.unit || '-'}</span>
            </div>
          </Space>
        );
      },
    },
    {
      title: '库存状态',
      key: 'stock',
      width: 300,
      render: (_, record) => {
        const availableQty = record.availableQty ?? 0;
        const inTransitQty = record.inTransitQty ?? 0;
        const lockedQty = record.lockedQty ?? 0;
        const safetyStock = record.safetyStock ?? 0;
        const isLow = availableQty < safetyStock;
        return (
          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            <div className="stock-grid">
              <div>
                <div className="stock-label">可用库存</div>
                <div className={`stock-value ${isLow ? 'stock-value--warn' : 'stock-value--ok'}`}>
                  {availableQty.toLocaleString()}
                  {isLow && <WarningOutlined style={{ marginLeft: 4, fontSize: "var(--font-size-base)" }} />}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">在途</div>
                <div className="stock-value stock-value--info">
                  {inTransitQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
              <div>
                <div className="stock-label">锁定</div>
                <div className="stock-value stock-value--lock">
                  {lockedQty.toLocaleString()}
                </div>
                <div className="stock-unit">{record.unit}</div>
              </div>
            </div>
            <div style={{
              fontSize: "var(--font-size-sm)",
              color: 'var(--neutral-text-secondary)',
              paddingTop: 8,
              borderTop: '1px solid #f0f0f0',
              fontWeight: 500
            }}>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>安全库存:</span> {safetyStock} {record.unit}
              <span style={{ margin: '0 8px', color: 'var(--neutral-border)' }}>|</span>
              <span style={{ color: 'var(--neutral-text-disabled)' }}>库位:</span> {record.warehouseLocation || '-'}
            </div>
          </Space>
        );
      },
    },
    {
      title: '金额信息',
      key: 'price',
      width: 180,
      render: (_, record) => (
        <Space orientation="vertical" size={10} style={{ width: '100%' }}>
          <div>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>单价</div>
            <div style={{ fontSize: "var(--font-size-lg)", fontWeight: 700, color: 'var(--neutral-text)' }}>
              {canViewPrice(user) ? `¥${(record.unitPrice ?? 0).toFixed(2)}` : '***'}
            </div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)', marginTop: 2 }}>/{record.unit}</div>
          </div>
          <div style={{
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0'
          }}>
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginBottom: 4, fontWeight: 500 }}>库存总值</div>
            <div style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: 'var(--primary-color)' }}>
              {canViewPrice(user) ? `¥${(record.totalValue ?? 0).toLocaleString()}` : '***'}
            </div>
          </div>
        </Space>
      ),
    },
    {
      title: '供应商',
      key: 'supplier',
      width: 150,
      render: (_, record) => (
        <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
          {record.supplierName || '-'}
        </div>
      ),
    },
    {
      title: '出入库记录',
      key: 'records',
      width: 200,
      render: (_, record) => (
        <Space orientation="vertical" size={6} style={{ width: '100%' }}>
          <div style={{ padding: '4px 8px', background: '#f0f9ff' }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--primary-color)', marginBottom: 2 }}>📥 最后入库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastInboundDate}</div>
            {record.lastInboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastInboundBy}</div>
            )}
          </div>
          <div style={{ padding: '4px 8px', background: 'rgba(250, 140, 22, 0.1)' }}>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--warning-color-dark)', marginBottom: 2 }}>📤 最后出库</div>
            <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>{record.lastOutboundDate}</div>
            {record.lastOutboundBy && (
              <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>操作人: {record.lastOutboundBy}</div>
            )}
          </div>
        </Space>
      ),
    },
    {
      title: '备注',
      key: 'remark',
      width: 200,
      render: (_, record) => (
        <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', lineHeight: 1.5 }}>
          {record.remark || '-'}
        </div>
      ),
    },
    {
      title: '操作',
      width: 180,
      fixed: 'right',
      render: (_, record) => (
        <RowActions
          actions={[
            {
              key: 'instruction',
              label: '采购指令',
              onClick: () => openInstructionFromRecord(record)
            },
            {
              key: 'inbound',
              label: '入库',
              primary: true,
              onClick: () => handleInbound(record)
            },
            {
              key: 'rollLabel',
              label: '料卷标签',
              onClick: () => {
                rollForm.setFieldsValue({ rollCount: 1, quantityPerRoll: undefined, unit: '件' });
                rollModal.open({ inboundId: '', materialCode: record.materialCode, materialName: record.materialName });
              }
            },
            {
              key: 'outbound',
              label: '出库',
              onClick: () => handleOutbound(record)
            },
            {
              key: 'print',
              label: '打印出库单',
              onClick: () => handlePrintOutbound(record)
            },
            {
              key: 'detail',
              label: '详情',
              onClick: () => handleViewDetail(record)
            },
            {
              key: 'safetyStock',
              label: '安全库存',
              onClick: () => handleEditSafetyStock(record)
            }
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void fetchData();
              }}
            />
          </Card>
        ) : null}

        <Card size="small" className="material-summary-bar">
          <div className="material-summary-content">
            <div className="material-summary-item">
              <span className="material-summary-label">库存总值</span>
              <span className="material-summary-value">¥{Number(stats.totalValue || 0).toLocaleString()}</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">库存总量</span>
              <span className="material-summary-value">{Number(stats.totalQty || 0).toLocaleString()} 件/米</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">低于安全库存</span>
              <span className="material-summary-value">{Number(stats.lowStockCount || 0).toLocaleString()} 种</span>
            </div>
            <div className="material-summary-item">
              <span className="material-summary-label">物料种类</span>
              <span className="material-summary-value">{Number(stats.materialTypes || 0).toLocaleString()} 类</span>
            </div>
          </div>
        </Card>

        <div className="material-alerts-section">
          <MaterialAlertRanking
            loading={alertLoading}
            alerts={alertList}
            onSendInstruction={openInstruction}
          />
        </div>

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 面辅料进销存</h2>
          </div>

          <StandardToolbar
            left={(
              <StandardSearchBar
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="搜索物料编号/名称"
                dateValue={dateRange}
                onDateChange={setDateRange}
                statusValue={selectedType}
                onStatusChange={setSelectedType}
                statusOptions={[
                  { label: '全部', value: '' },
                  { label: '面料', value: '面料' },
                  { label: '辅料', value: '辅料' },
                  { label: '配件', value: '配件' },
                ]}
              />
            )}
            right={(
              <>
                <Button onClick={openInstructionEmpty}>发出采购需求</Button>
                <Button>导出</Button>
                <Button type="primary" onClick={() => handleInbound()}>入库</Button>
              </>
            )}
          />

          <ResizableTable
            storageKey="material-inventory-main"
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1600 }}
            pagination={pagination.pagination}
          />
        </Card>

        {/* ===== 待出库领料单 ===== */}
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <ClockCircleOutlined style={{ color: 'var(--color-warning, #faad14)' }} />
              <span>待出库领料</span>
              <Badge count={pendingPickings.length} style={{ backgroundColor: '#faad14' }} />
              <Tooltip title="采购侧点击「仓库领取」后，需由仓库在此处确认出库才会实际扣减库存">
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'help' }}>
                  ❓ 什么是待出库
                </span>
              </Tooltip>
            </Space>
          }
          extra={
            <Button size="small" onClick={() => void fetchPendingPickings()} loading={pendingPickingsLoading}>
              刷新
            </Button>
          }
        >
          {pendingPickings.length === 0 && !pendingPickingsLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '24px 0' }}>
              暂无待出库单
            </div>
          ) : (
            <Table
              loading={pendingPickingsLoading}
              rowKey="id"
              dataSource={pendingPickings}
              pagination={false}
              expandable={{
                expandedRowRender: (record) => (
                  <Table
                    rowKey="id"
                    dataSource={record.items || []}
                    pagination={false}
                    size="small"
                    columns={[
                      { title: '物料编号', dataIndex: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', width: 160 },
                      { title: '颜色', dataIndex: 'color', width: 80 },
                      { title: '规格', dataIndex: 'size', width: 80 },
                      {
                        title: '出库数量',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (qty, row) => `${qty} ${row.unit || '件'}`,
                      },
                    ]}
                  />
                ),
                rowExpandable: (record) => !!(record.items && record.items.length > 0),
              }}
              columns={[
                { title: '领料单号', dataIndex: 'pickingNo', width: 180 },
                { title: '订单号', dataIndex: 'orderNo', width: 160 },
                { title: '款号', dataIndex: 'styleNo', width: 130 },
                { title: '申请人', dataIndex: 'pickerName', width: 100 },
                {
                  title: '申请时间',
                  dataIndex: 'createTime',
                  width: 160,
                  render: (t) => t ? String(t).replace('T', ' ').substring(0, 16) : '-',
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (s) => s === 'pending'
                    ? <Tag color="orange" icon={<ClockCircleOutlined />}>待出库</Tag>
                    : <Tag color="green" icon={<CheckCircleOutlined />}>已出库</Tag>,
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 120,
                  render: (_, record) => (
                    <Popconfirm
                      title="确认出库"
                      description={`确认后将实际扣减库存，不可撤销。`}
                      onConfirm={() => void handleConfirmOutbound(record.id)}
                      okText="确认出库"
                      cancelText="取消"
                    >
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={confirmingPickingId === record.id}
                      >
                        确认出库
                      </Button>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          )}
        </Card>

      <StandardModal
        title="下发采购指令"
        open={instructionVisible}
        onCancel={closeInstruction}
        onOk={handleSendInstruction}
        confirmLoading={instructionSubmitting}
        okText="下发"
        centered
        size="md"
      >
        <Form form={instructionForm} layout="vertical">
          {!instructionTarget && (
            <Form.Item
              name="materialSelect"
              label="选择物料"
              rules={[{ required: true, message: '请选择物料' }]}
            >
              <Select
                showSearch
                placeholder="请选择预警物料"
                options={alertOptions}
                onChange={handleMaterialSelect}
                filterOption={(input, option) =>
                  String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                }
              />
            </Form.Item>
          )}
          <Form.Item label="物料信息">
            <Space orientation="vertical" size={8} style={{ width: '100%' }}>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>物料编号：</span>
                <span style={{ fontWeight: 600 }}>{instructionTarget?.materialCode || '-'}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>物料名称：</span>
                <span style={{ fontWeight: 600 }}>{instructionTarget?.materialName || '-'}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>类型：</span>
                <span style={{ fontWeight: 600 }}>{getMaterialTypeLabel(instructionTarget?.materialType)}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>供应商：</span>
                <span style={{ fontWeight: 600 }}>{instructionTarget?.supplierName || '-'}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>单位：</span>
                <span style={{ fontWeight: 600 }}>{instructionTarget?.unit || '-'}</span>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <span style={{ color: 'var(--neutral-text-disabled)' }}>颜色：</span>
                <span style={{ fontWeight: 600 }}>{instructionTarget?.color || '-'}</span>
              </div>
            </Space>

            {/* 面料属性（仅面料显示） */}
            {instructionTarget?.materialType === '面料' && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--primary-color)'
                }}>
                  🧵 面料属性
                </div>
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>幅宽：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricWidth || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>克重：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricWeight || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>成分：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricComposition || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>单位：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.unit || '-'}</span>
                  </div>
                </Space>
              </div>
            )}
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="purchaseQuantity"
                label="采购数量"
                rules={[{ required: true, message: '请输入采购数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="receiverId"
                label="采购人"
                rules={[{ required: true, message: '请选择采购人' }]}
              >
                <Select
                  showSearch
                  placeholder="请选择采购人"
                  options={receiverOptions}
                  onChange={(value) => {
                    const hit = receiverOptions.find((item) => item.value === value);
                    instructionForm.setFieldsValue({ receiverName: hit?.name || '' });
                  }}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="receiverName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 安全库存编辑弹窗 */}
      <StandardModal
        title="设置安全库存"
        open={safetyStockVisible}
        onCancel={() => setSafetyStockVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setSafetyStockVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={safetyStockSubmitting} onClick={handleSafetyStockSave}>
            保存
          </Button>,
        ]}
        size="sm"
      >
        {safetyStockTarget && (
          <div>
            <Card size="small" style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <div><strong>{safetyStockTarget.materialCode}</strong> <Tag color={getMaterialTypeCategory(safetyStockTarget.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(safetyStockTarget.materialType) === 'lining' ? 'cyan' : 'green'}>{getMaterialTypeLabel(safetyStockTarget.materialType)}</Tag></div>
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', marginTop: 4 }}>{safetyStockTarget.materialName}</div>
              <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4 }}>
                当前库存: <strong>{safetyStockTarget.quantity ?? 0}</strong> {safetyStockTarget.unit}
              </div>
            </Card>
            <div style={{ marginBottom: 8 }}>安全库存（低于此值将触发预警）</div>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={999999}
              value={safetyStockValue}
              onChange={(v) => setSafetyStockValue(v ?? 0)}
              addonAfter={safetyStockTarget.unit || '件'}
              placeholder="请输入安全库存"
            />
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginTop: 8 }}>
              提示：当库存低于安全库存时，系统将在仓库看板和面辅料预警中显示该物料
            </div>
          </div>
        )}
      </StandardModal>

      {/* 详情模态框 - 出入库记录 */}
      <StandardModal
        title="出入库记录"
        open={detailModal.visible}
        onCancel={detailModal.close}
        footer={[
          <Button key="close" onClick={detailModal.close}>
            关闭
          </Button>,
        ]}
        size="md"
      >
        {detailModal.data && (
          <div>
            <Card size="small" style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <strong style={{ fontSize: "var(--font-size-lg)" }}>{detailModal.data.materialCode}</strong>
                  <Tag color={getMaterialTypeCategory(detailModal.data.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(detailModal.data.materialType) === 'lining' ? 'cyan' : 'green'} style={{ marginLeft: 8 }}>{getMaterialTypeLabel(detailModal.data.materialType)}</Tag>
                </div>
                <div style={{ fontSize: "var(--font-size-base)" }}>{detailModal.data.materialName}</div>
              </Space>
            </Card>

            <ResizableTable
              storageKey="material-inventory-details"
              size="small"
              dataSource={[
                {
                  id: '1',
                  type: '入库',
                  date: detailModal.data.lastInboundDate,
                  operator: detailModal.data.lastInboundBy,
                  quantity: 2000,
                  unit: detailModal.data.unit,
                  warehouseLocation: detailModal.data.warehouseLocation,
                  remark: '正常入库',
                },
                {
                  id: '2',
                  type: '出库',
                  date: detailModal.data.lastOutboundDate,
                  operator: detailModal.data.lastOutboundBy,
                  quantity: 500,
                  unit: detailModal.data.unit,
                  warehouseLocation: detailModal.data.warehouseLocation,
                  remark: '生产领料',
                },
              ]}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'type',
                  width: 80,
                  render: (text) => (
                    <Tag color={text === '入库' ? 'blue' : 'orange'}>{text}</Tag>
                  ),
                },
                {
                  title: '日期',
                  dataIndex: 'date',
                  width: 120,
                },
                {
                  title: '数量',
                  width: 120,
                  render: (_, record) => `${record.quantity} ${record.unit}`,
                },
                {
                  title: '操作人',
                  dataIndex: 'operator',
                  width: 100,
                },
                {
                  title: '库位',
                  dataIndex: 'warehouseLocation',
                  width: 100,
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                },
              ]}
              pagination={false}
            />
          </div>
        )}
      </StandardModal>

      {/* 入库模态框 */}
      <StandardModal
        title={
          <Space>
            <ScanOutlined style={{ color: 'var(--primary-color)' }} />
            扫码入库
          </Space>
        }
        open={inboundModal.visible}
        onCancel={() => {
          inboundModal.close();
          inboundForm.resetFields();
        }}
        onOk={handleInboundConfirm}
        size="md"
      >
        <Form form={inboundForm} layout="vertical" style={{ marginTop: 8 }}>
          {/* 第一行：扫码编号（全宽） */}
          <Form.Item
            label="面料编号"
            name="materialCode"
            rules={[{ required: true, message: '请输入或扫码面料编号' }]}
          >
            <Input placeholder="请扫码或手动输入面料编号" prefix={<ScanOutlined />} size="large" />
          </Form.Item>

          {/* 第二行：名称 + 类型 + 颜色 + 规格（四欄） */}
          <Row gutter={12}>
            <Col span={9}>
              <Form.Item label="面料名称" name="materialName">
                <Input disabled placeholder="扫码后自动填充" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="物料类型" name="materialType">
                <Select disabled placeholder="自动识别">
                  <Option value="fabricA">面料A</Option>
                  <Option value="fabricB">面料B</Option>
                  <Option value="liningA">里料A</Option>
                  <Option value="accessoryA">辅料A</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="颜色" name="color">
                <Input placeholder="如: 蓝色" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="规格" name="specification">
                <Input placeholder="如: 150cm" />
              </Form.Item>
            </Col>
          </Row>

          {/* 第三行：供应商 + 入库数量 + 仓库库位（三欄） */}
          <Form.Item name="supplierId" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="供应商" name="supplierName">
                <SupplierSelect
                  placeholder="选择供应商"
                  onChange={(value, option) => {
                    if (option) {
                      inboundForm.setFieldsValue({
                        supplierId: option.id,
                        supplierContactPerson: option.supplierContactPerson,
                        supplierContactPhone: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="入库数量"
                name="quantity"
                rules={[{ required: true, message: '请输入入库数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="数量" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="仓库库位"
                name="warehouseLocation"
                rules={[{ required: true, message: '请选择仓库库位' }]}
              >
                <Select placeholder="选择库位">
                  <Option value="A-01-01">A-01-01</Option>
                  <Option value="A-01-02">A-01-02</Option>
                  <Option value="A-02-01">A-02-01</Option>
                  <Option value="B-01-01">B-01-01</Option>
                  <Option value="B-02-01">B-02-01</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 面料属性（三欄，仅面料显示） */}
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
            {({ getFieldValue }) => {
              const materialType = getFieldValue('materialType');
              if (getMaterialTypeCategory(materialType) !== 'fabric') return null;
              return (
                <Row gutter={12} style={{ background: '#f0f7ff', borderRadius: 6, padding: '8px 6px 0', marginBottom: 12 }}>
                  <Col span={24} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)' }}>🧵 面料属性</span>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="幅宽" name="fabricWidth">
                      <Input placeholder="如: 150cm" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="克重" name="fabricWeight">
                      <Input placeholder="如: 200g/m²" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="成分" name="fabricComposition">
                      <Input placeholder="如: 100%棉" />
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 出库模态框 */}
      <StandardModal
        title={
          <Space>
            <ExportOutlined style={{ color: 'var(--primary-color)' }} />
            <span>物料出库 - 批次明细</span>
          </Space>
        }
        open={outboundModal.visible}
        onCancel={() => {
          outboundModal.close();
          setBatchDetails([]);
          outboundForm.resetFields();
        }}
        onOk={handleOutboundConfirm}
        size="lg"
        okText="确认出库"
        cancelText="取消"
      >
        {outboundModal.data && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {/* 基础信息卡片 - 左右两栏 */}
            <Card size="small" style={{ background: 'var(--color-bg-subtle)' }}>
              <Row gutter={0}>
                {/* 左栏：基本信息 */}
                <Col
                  span={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? 13 : 24}
                  style={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? { borderRight: '1px solid #e8e8e8', paddingRight: 16 } : {}}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', alignItems: 'start' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>物料名称：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.materialName}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>物料编号：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.materialCode}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>类型：</span>
                      <Tag color={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(outboundModal.data.materialType) === 'lining' ? 'cyan' : 'green'} style={{ margin: 0 }}>{getMaterialTypeLabel(outboundModal.data.materialType)}</Tag>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>颜色：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.color || '-'}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>规格：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.specification || '-'}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>供应商：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.supplierName || '-'}</span>
                    </div>
                  </div>
                </Col>

                {/* 右栏：面料属性（仅面料显示） */}
                {getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' && (
                  <Col span={11} style={{ paddingLeft: 16 }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)', marginBottom: 10 }}>🧵 面料属性</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>幅宽：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricWidth || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>克重：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricWeight || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>成分：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricComposition || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>单位：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.unit || '-'}</span>
                      </div>
                    </div>
                  </Col>
                )}
              </Row>
            </Card>

            {/* 批次明细表格 */}
            <div>
              <div style={{
                fontSize: "var(--font-size-base)",
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--neutral-text)'
              }}>
                📋 请选择需要出库的批次，并输入数量：
              </div>
              <ResizableTable
                storageKey="material-inventory-batch-out"
                columns={[
                  {
                    title: '批次号',
                    dataIndex: 'batchNo',
                    key: 'batchNo',
                    width: 160,
                    render: (text: string) => (
                      <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{text}</span>
                    ),
                  },
                  {
                    title: '仓库位置',
                    dataIndex: 'warehouseLocation',
                    key: 'warehouseLocation',
                    width: 100,
                    align: 'center' as const,
                  },
                  {
                    title: '颜色',
                    dataIndex: 'color',
                    key: 'color',
                    width: 80,
                    align: 'center' as const,
                    render: (color: string) => color ? <Tag color="blue">{color}</Tag> : '-',
                  },
                  {
                    title: '入库日期',
                    dataIndex: 'inboundDate',
                    key: 'inboundDate',
                    width: 110,
                    align: 'center' as const,
                  },
                  {
                    title: '可用库存',
                    dataIndex: 'availableQty',
                    key: 'availableQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '锁定库存',
                    dataIndex: 'lockedQty',
                    key: 'lockedQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '出库数量',
                    dataIndex: 'outboundQty',
                    key: 'outboundQty',
                    width: 120,
                    align: 'center' as const,
                    render: (value: number, _record: MaterialBatchDetail, index: number) => (
                      <InputNumber
                        min={0}
                        max={_record.availableQty}
                        value={value}
                        onChange={(val) => handleBatchQtyChange(index, val)}
                        style={{ width: '100%' }}
                        placeholder="0"
                      />
                    ),
                  },
                ]}
                dataSource={batchDetails}
                rowKey="batchNo"
                pagination={false}
                scroll={{ y: 300 }}
                size="small"
                bordered
                summary={() => {
                  const totalOutbound = batchDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
                  const totalAvailable = batchDetails.reduce((sum, item) => sum + item.availableQty, 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell key="label" index={0} colSpan={4} align="right">
                          <strong>合计</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell key="available" index={1} align="center">
                          <strong style={{ color: 'var(--color-success)' }}>{totalAvailable}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell key="locked" index={2} />
                        <Table.Summary.Cell key="outbound" index={3} align="center">
                          <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-md)" }}>
                            {totalOutbound} {outboundModal.data.unit}
                          </strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </div>

            {/* 提示信息 */}
            <div style={{
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              padding: '8px 12px',
              fontSize: "var(--font-size-sm)",
              color: 'var(--primary-color)'
            }}>
              💡 提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
            </div>
          </Space>
        )}
      </StandardModal>

      {/* 料卷/箱标签生成弹窗 */}
      <StandardModal
        title="生成料卷/箱二维码标签"
        open={rollModal.visible}
        onCancel={rollModal.close}
        size="sm"
        footer={[
          <Button key="cancel" onClick={rollModal.close}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            loading={generatingRolls}
            onClick={handleGenerateRollLabels}
          >
            生成并打印
          </Button>,
        ]}
      >
        {rollModal.data && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              物料：<strong>{rollModal.data.materialName}</strong>（{rollModal.data.materialCode}）
            </p>
            <Form form={rollForm} layout="vertical">
              <Form.Item
                name="rollCount"
                label="共几卷/箱（张标签数）"
                rules={[{ required: true, message: '请填写卷数' }]}
              >
                <InputNumber min={1} max={200} style={{ width: '100%' }} placeholder="例如：5" />
              </Form.Item>
              <Form.Item
                name="quantityPerRoll"
                label="每卷/箱数量"
                rules={[{ required: true, message: '请填写每卷数量' }]}
              >
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="例如：30" />
              </Form.Item>
              <Form.Item name="unit" label="单位" initialValue="件">
                <Select>
                  <Select.Option value="件">件</Select.Option>
                  <Select.Option value="米">米</Select.Option>
                  <Select.Option value="kg">kg</Select.Option>
                  <Select.Option value="码">码</Select.Option>
                  <Select.Option value="卷">卷</Select.Option>
                  <Select.Option value="箱">箱</Select.Option>
                </Select>
              </Form.Item>
            </Form>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              生成后会弹出打印窗口，每张标签含二维码。仓管扫码（MR开头）即可确认发料。
            </p>
          </div>
        )}
      </StandardModal>
    </Layout>
  );
};

export default _MaterialInventory;
