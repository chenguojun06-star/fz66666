import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Select, Space, Form, InputNumber, Upload, message, Segmented, Tooltip, Tabs, Modal, Collapse } from 'antd';
import { PlusOutlined, DownloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { useModal } from '@/hooks';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams, MaterialDatabase, MaterialDatabaseQueryParams, ProductionOrder } from '@/types/production';
import api, { parseProductionOrderLines, unwrapApiData, useProductionOrderFrozenCache } from '@/utils/api';
import { getMaterialTypeCategory, getMaterialTypeSortKey, normalizeMaterialType, getMaterialTypeLabel } from '@/utils/materialType';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import * as XLSX from 'xlsx';
import './styles.css';
import { safePrint } from '@/utils/safePrint';

// New Imports
import {
  MaterialPurchaseTabKey,
  ACTIVE_TAB_STORAGE_KEY,
  PURCHASE_QUERY_STORAGE_KEY,
  MATERIAL_DB_QUERY_STORAGE_KEY,
  MaterialDatabaseModalData
} from './types';
import {
  toLocalDateTimeInputValue,
  toDateTimeLocalValue,
  buildImageFileList,
  buildPurchaseSheetHtml,
  buildSizePairs
} from './utils';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES, DEFAULT_PAGE_SIZE } from '@/constants/business';
import { useLocation, useNavigate } from 'react-router-dom';

import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import PurchaseModal from './components/PurchaseModal';

const MaterialPurchase: React.FC = () => {
  const [messageApi, contextHolder] = message.useMessage();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isMobile, modalWidth } = useViewport();

  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 页签切换状态
  const [activeTabKey, setActiveTabKey] = useState<MaterialPurchaseTabKey>(() => {
    if (typeof window === 'undefined') return 'purchase';
    try {
      const cached = sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (cached === 'purchase' || cached === 'materialDatabase') return cached;
    } catch {
      // Intentionally empty
    }
    return 'purchase';
  });

  // 采购单相关状态
  const [visible, setVisible] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<MaterialPurchaseType | null>(null);
  const [dialogMode, setDialogMode] = useState<'view' | 'create' | 'preview'>('view');
  const [previewList, setPreviewList] = useState<MaterialPurchaseType[]>([]);
  const [previewOrderId, setPreviewOrderId] = useState<string>('');
  const [queryParams, setQueryParams] = useState<MaterialQueryParams>(() => {
    const base: MaterialQueryParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(PURCHASE_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as Record<string, unknown>).page);
      const pageSize = Number((parsed as Record<string, unknown>).pageSize);
      return {
        ...base,
        ...(parsed as Record<string, unknown>),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
      };
    } catch {
      return base;
    }
  });
  const [form] = Form.useForm();

  const [sortField, setSortField] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };

  // 真实数据状态
  const [purchaseList, setPurchaseList] = useState<MaterialPurchaseType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const returnConfirmModal = useModal<MaterialPurchaseType[]>();
  const [returnConfirmSubmitting, setReturnConfirmSubmitting] = useState(false);
  const returnResetModal = useModal<MaterialPurchaseType>();
  const [returnResetSubmitting, setReturnResetSubmitting] = useState(false);
  const [returnConfirmForm] = Form.useForm();
  const [returnResetForm] = Form.useForm();

  // 快速编辑状态
  const quickEditModal = useModal<MaterialPurchaseType>();
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  const [purchaseSortField, setPurchaseSortField] = useState<string>('createTime');
  const [purchaseSortOrder, setPurchaseSortOrder] = useState<'asc' | 'desc'>('desc');

  const handlePurchaseSort = (field: string, order: 'asc' | 'desc') => {
    setPurchaseSortField(field);
    setPurchaseSortOrder(order);
  };

  const [detailOrder, setDetailOrder] = useState<ProductionOrder | null>(null);
  const [detailOrderLines, setDetailOrderLines] = useState<Array<{ color: string; size: string; quantity: number }>>([]);
  const [detailPurchases, setDetailPurchases] = useState<MaterialPurchaseType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const orderExistCacheRef = useRef<Map<string, boolean>>(new Map());

  const frozenOrderIds = useMemo(() => {
    return Array.from(new Set(purchaseList.map((r) => String(r.orderNo || '').trim()).filter(Boolean)));
  }, [purchaseList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'status', acceptAnyData: true });

  // 辅料数据库相关状态
  const materialDatabaseModal = useModal<MaterialDatabaseModalData>();
  const [materialDatabaseList, setMaterialDatabaseList] = useState<MaterialDatabase[]>([]);
  const [materialDatabaseLoading, setMaterialDatabaseLoading] = useState(false);
  const [materialDatabaseTotal, setMaterialDatabaseTotal] = useState(0);
  const [materialDatabaseQueryParams, setMaterialDatabaseQueryParams] = useState<MaterialDatabaseQueryParams>(() => {
    const base: MaterialDatabaseQueryParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(MATERIAL_DB_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as Record<string, unknown>).page);
      const pageSize = Number((parsed as Record<string, unknown>).pageSize);
      return {
        ...base,
        ...(parsed as Record<string, unknown>),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
      };
    } catch {
      return base;
    }
  });
  const [materialDatabaseForm] = Form.useForm();
  const [materialDatabaseImageFiles, setMaterialDatabaseImageFiles] = useState<UploadFile[]>([]);

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabKey);
    } catch {
      // Intentionally empty
    }
  }, [activeTabKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(PURCHASE_QUERY_STORAGE_KEY, JSON.stringify(queryParams));
    } catch {
      // Intentionally empty
    }
  }, [queryParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(MATERIAL_DB_QUERY_STORAGE_KEY, JSON.stringify(materialDatabaseQueryParams));
    } catch {
      // Intentionally empty
    }
  }, [materialDatabaseQueryParams]);

  const detailSizePairs = useMemo(() => buildSizePairs(detailOrderLines), [detailOrderLines]);

  const postReturnConfirm = async (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number }) => {
    return api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm', payload);
  };

  const postReturnConfirmReset = async (payload: { purchaseId: string; reason?: string }) => {
    return api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm/reset', payload);
  };

  const ensureOrderUnlocked = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const openReturnConfirm = async (targets: MaterialPurchaseType[]) => {
    const list = targets.filter((t) => String(t?.id || '').trim());
    if (!list.length) {
      message.info('没有可回料确认的采购任务');
      return;
    }
    const orderKey = String(list[0]?.orderId || list[0]?.orderNo || '').trim();
    if (orderKey) {
      const ok = await ensureOrderUnlocked(orderKey);
      if (!ok) return;
    }
    returnConfirmModal.open(list);
  };

  const openReturnReset = async (target: MaterialPurchaseType) => {
    const orderKey = String(target?.orderId || target?.orderNo || '').trim();
    if (orderKey) {
      const ok = await ensureOrderUnlocked(orderKey);
      if (!ok) return;
    }
    returnResetModal.open(target);
  };

  // 导出采购单数据到 Excel
  const handleExport = () => {
    if (!purchaseList || purchaseList.length === 0) {
      message.warning('当前没有数据可导出');
      return;
    }

    try {
      // 准备导出数据
      const exportData = purchaseList.map((item, index) => ({
        '序号': index + 1,
        '订单号': item.orderNo || '-',
        '采购单号': item.purchaseNo || '-',
        '物料类型': getMaterialTypeLabel(item.materialType),
        '物料名称': item.materialName || '-',
        '物料编码': item.materialCode || '-',
        '规格': item.specifications || '-',
        '供应商': item.supplierName || '-',
        '采购数量': `${item.purchaseQuantity || 0} ${item.unit || ''}`,
        '到货数量': `${item.arrivedQuantity || 0} ${item.unit || ''}`,
        '待到数量': `${Math.max(0, (item.purchaseQuantity || 0) - (item.arrivedQuantity || 0))} ${item.unit || ''}`,
        '单价': Number.isFinite(Number(item.unitPrice)) ? `¥${Number(item.unitPrice).toFixed(2)}` : '-',
        '总金额': Number.isFinite(Number(item.purchaseQuantity) * Number(item.unitPrice))
          ? `¥${(Number(item.purchaseQuantity) * Number(item.unitPrice)).toFixed(2)}`
          : '-',
        '状态': getStatusConfig(item.status).text,
        '领取人': item.receiverName || '-',
        '创建时间': item.createTime ? formatDateTime(item.createTime) : '-',
      }));

      // 创建工作簿
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '面辅料采购');

      // 设置列宽
      const colWidths = [
        { wch: 6 },  // 序号
        { wch: 18 }, // 订单号
        { wch: 20 }, // 采购单号
        { wch: 12 }, // 物料类型
        { wch: 20 }, // 物料名称
        { wch: 18 }, // 物料编码
        { wch: 15 }, // 规格
        { wch: 18 }, // 供应商
        { wch: 15 }, // 采购数量
        { wch: 15 }, // 到货数量
        { wch: 15 }, // 待到数量
        { wch: 12 }, // 单价
        { wch: 12 }, // 总金额
        { wch: 12 }, // 状态
        { wch: 12 }, // 领取人
        { wch: 20 }, // 创建时间
      ];
      ws['!cols'] = colWidths;

      // 生成文件名
      const fileName = `面辅料采购_${new Date().toLocaleDateString().replace(/\//g, '')}_${new Date().toLocaleTimeString().replace(/:/g, '')}.xlsx`;

      // 导出文件
      XLSX.writeFile(wb, fileName);
      message.success('导出成功');
    } catch (error: unknown) {
      const errMessage = (error as Error)?.message;
      message.error(errMessage || '导出失败');
      console.error('Export error:', error);
    }
  };

  useEffect(() => {
    if (!returnConfirmModal.visible) {
      return;
    }
    const list = (returnConfirmModal.data || []).filter((t) => String(t?.id || '').trim());
    returnConfirmForm.setFieldsValue({
      items: list.map((t) => ({
        purchaseId: String(t.id),
        materialName: t.materialName,
        purchaseQuantity: Number(t.purchaseQuantity || 0) || 0,
        arrivedQuantity: Number(t.arrivedQuantity || 0) || 0,
        returnQuantity:
          Number(t.returnQuantity || 0)
          || (Number(t.arrivedQuantity || 0) || Number(t.purchaseQuantity || 0) || 0),
      })),
    });
  }, [returnConfirmForm, returnConfirmModal.visible, returnConfirmModal.data]);

  useEffect(() => {
    if (!returnResetModal.visible) {
      return;
    }
    returnResetForm.setFieldsValue({ reason: '' });
  }, [returnResetForm, returnResetModal.visible]);

  const loadDetailByOrderNo = async (orderNo: string) => {
    const no = String(orderNo || '').trim();
    if (!no) return;
    setDetailLoading(true);
    try {
      const [orderRes, purchaseRes] = await Promise.all([
        api.get<{ code: number; data: { records: ProductionOrder[]; total: number } }>('/production/order/list', { params: { page: 1, pageSize: 1, orderNo: no } }),
        api.get<{ code: number; data: { records: MaterialPurchaseType[]; total: number } }>('/production/purchase/list', { params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' } }),
      ]);

      const orderResult = orderRes;
      const orderRecord = orderResult?.code === 200 ? (orderResult?.data?.records?.[0] || null) : null;
      setDetailOrder(orderRecord);

      const records = purchaseRes?.code === 200 ? (purchaseRes?.data?.records || []) : [];
      const sorted = [...records].sort((a: MaterialPurchaseType, b: MaterialPurchaseType) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        return String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
      });
      setDetailPurchases(sorted);

      // 解析订单行：优先从生产订单，否则从采购单中提取颜色和尺码
      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setDetailOrderLines(parsedLines);
      } else if (orderRecord) {
        // 有订单但没有明细行，使用订单的颜色和尺码
        const fallbackColor = String(orderRecord?.color || '').trim();
        const fallbackSize = String(orderRecord?.size || '').trim();
        const fallbackQty = Number(orderRecord?.orderQuantity || 0) || 0;
        if (fallbackColor || fallbackSize || fallbackQty) {
          setDetailOrderLines([{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty }]);
        } else {
          setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
        }
      } else if (sorted.length > 0) {
        // 没有生产订单，从采购单中提取颜色和尺码信息
        const colors = new Set<string>();
        const sizes = new Set<string>();
        let totalQty = 0;

        sorted.forEach((p: any) => {
          const color = String(p?.color || '').trim();
          const size = String(p?.size || '').trim();
          const qty = Number(p?.purchaseQuantity || 0);

          if (color && color !== '-') colors.add(color);
          if (size && size !== '-') sizes.add(size);
          if (qty > 0) totalQty += qty;
        });

        const colorStr = Array.from(colors).join(',') || '-';
        const sizeStr = Array.from(sizes).join(',') || '-';

        setDetailOrderLines([{
          color: colorStr,
          size: sizeStr,
          quantity: totalQty || 0
        }]);
      } else {
        setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      }
    } catch {
      setDetailOrder(null);
      setDetailOrderLines([]);
      setDetailPurchases([]);
    } finally {
      setDetailLoading(false);
    }
  };

  // 按款号加载采购单详情（用于没有订单号的样衣采购）
  const loadDetailByStyleNo = async (styleNo: string) => {
    const no = String(styleNo || '').trim();
    if (!no) return;
    setDetailLoading(true);
    try {
      const purchaseRes = await api.get<{ code: number; data: { records: MaterialPurchaseType[]; total: number } }>(
        '/production/purchase/list',
        { params: { page: 1, pageSize: 200, styleNo: no, materialType: '', status: '' } }
      );

      const records = purchaseRes?.code === 200 ? (purchaseRes?.data?.records || []) : [];
      const sorted = [...records].sort((a: MaterialPurchaseType, b: MaterialPurchaseType) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        return String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
      });
      setDetailPurchases(sorted);
      setDetailOrder(null);

      // 从采购单中提取颜色和尺码信息
      if (sorted.length > 0) {
        const colors = new Set<string>();
        const sizes = new Set<string>();
        let totalQty = 0;

        sorted.forEach((p: any) => {
          const color = String(p?.color || '').trim();
          const size = String(p?.size || '').trim();
          const qty = Number(p?.purchaseQuantity || 0);

          if (color && color !== '-') colors.add(color);
          if (size && size !== '-') sizes.add(size);
          if (qty > 0) totalQty += qty;
        });

        const colorStr = Array.from(colors).join(',') || '-';
        const sizeStr = Array.from(sizes).join(',') || '-';

        setDetailOrderLines([{
          color: colorStr,
          size: sizeStr,
          quantity: totalQty || 0
        }]);
      } else {
        setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
      }
    } catch {
      setDetailOrder(null);
      setDetailOrderLines([]);
      setDetailPurchases([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const ensureOrderExistCache = useCallback(async (orderNos: string[]) => {
    const cache = orderExistCacheRef.current;
    const pending = orderNos.filter((no) => !cache.has(no));
    if (!pending.length) return;

    await Promise.allSettled(
      pending.map(async (no) => {
        try {
          const res = await api.get<{ code: number; data: { records: ProductionOrder[]; total: number } }>(
            '/production/order/list',
            { params: { page: 1, pageSize: 1, orderNo: no } }
          );
          const exists = res.code === 200 && Array.isArray(res.data?.records) && res.data.records.length > 0;
          cache.set(no, exists);
        } catch {
          cache.set(no, false);
        }
      })
    );
  }, []);

  const filterOutMissingOrders = useCallback(async (records: MaterialPurchaseType[]) => {
    // ⚠️ 临时禁用订单存在性检查，避免过滤掉有效的采购记录
    // TODO: 后续优化 - 只在订单列表页面进行过滤，采购列表应显示所有记录
    return records;

    // 原有逻辑（已注释）
    // const orderNos = Array.from(
    //   new Set(records.map((r) => String(r.orderNo || '').trim()).filter(Boolean))
    // );
    // if (!orderNos.length) return records;
    // await ensureOrderExistCache(orderNos);
    // const cache = orderExistCacheRef.current;
    // return records.filter((r) => {
    //   const no = String(r.orderNo || '').trim();
    //   if (!no) return true;
    //   const exists = cache.get(no);
    //   return exists !== false;
    // });
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (dialogMode !== 'view') return;
    const no = String(currentPurchase?.orderNo || '').trim();
    if (no) {
      loadDetailByOrderNo(no);
    } else if (currentPurchase) {
      const styleNo = String(currentPurchase?.styleNo || '').trim();
      if (styleNo) {
        loadDetailByStyleNo(styleNo);
      } else {
        setDetailLoading(true);
        setDetailOrder(null);
        setDetailOrderLines([{
          color: String(currentPurchase?.color || '-'),
          size: String(currentPurchase?.size || '-'),
          quantity: Number(currentPurchase?.purchaseQuantity || 0)
        }]);
        setDetailPurchases([currentPurchase]);
        setDetailLoading(false);
      }
    }
  }, [currentPurchase?.orderNo, currentPurchase?.styleNo, currentPurchase?.id, dialogMode, visible]);

  // 获取物料采购列表
  const fetchMaterialPurchaseList = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<{ code: number; message?: string; data: { records: MaterialPurchaseType[]; total: number } }>('/production/purchase/list', { params: queryParams });
      if (response.code === 200) {
        const records = response.data.records || [];
        const filtered = await filterOutMissingOrders(records);
        const removed = records.length - filtered.length;
        setPurchaseList(filtered);
        setTotal(Math.max(Number(response.data.total || 0) - Math.max(removed, 0), 0));
      } else {
        message.error(response.message || '获取物料采购列表失败');
      }
    } catch (error) {
      message.error('获取物料采购列表失败');
    } finally {
      setLoading(false);
    }
  }, [filterOutMissingOrders, queryParams]);

  // 获取面辅料数据库列表
  const fetchMaterialDatabaseList = useCallback(async () => {
    setMaterialDatabaseLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: MaterialDatabase[]; total: number } }>('/material/database/list', { params: materialDatabaseQueryParams });
      const data = unwrapApiData<{ records?: MaterialDatabase[]; total?: number }>(res as Record<string, unknown>, '获取面辅料数据库列表失败');
      const records = Array.isArray(data?.records) ? data.records : [];
      setMaterialDatabaseList(records as MaterialDatabase[]);
      setMaterialDatabaseTotal(Number(data?.total || 0) || 0);
    } catch (error) {
      const errMessage = (error as Error)?.message;
      message.error(errMessage || '获取面辅料数据库列表失败');
    } finally {
      setMaterialDatabaseLoading(false);
    }
  }, [materialDatabaseQueryParams]);

  // 页面加载时获取物料采购列表
  useEffect(() => {
    if (activeTabKey === 'purchase') {
      fetchMaterialPurchaseList();
    } else if (activeTabKey === 'materialDatabase') {
      fetchMaterialDatabaseList();
    }
  }, [activeTabKey, fetchMaterialDatabaseList, fetchMaterialPurchaseList]);

  // 实时同步
  useSync(
    'material-purchase-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: MaterialPurchaseType[]; total: number } }>('/production/purchase/list', { params: queryParams });
        if (response.code === 200) {
          const rawRecords = Array.isArray(response.data?.records) ? response.data?.records || [] : [];
          const filtered = await filterOutMissingOrders(rawRecords);
          const removed = rawRecords.length - filtered.length;
          return {
            records: filtered,
            total: Math.max(Number(response.data?.total || 0) - Math.max(removed, 0), 0)
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取物料采购列表失败', error);
        return null;
      }
    },
    (newData) => {
      // ⚠️ 修复：无论首次加载还是更新，都应该设置数据
      if (newData) {
        setPurchaseList(newData.records);
        setTotal(newData.total);
      }
    },
    {
      interval: 30000,
      enabled: !loading && activeTabKey === 'purchase' && !visible,
      pauseOnHidden: true,
      onError: (error) => {
        console.error('[实时同步] 物料采购数据同步错误', error);
      }
    }
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const orderNo = (params.get('orderNo') || '').trim();
    if (orderNo) {
      setQueryParams(prev => ({ ...prev, page: 1, orderNo }));
    }
  }, [location.search]);

  // 面辅料数据库 helper
  const openMaterialDatabaseDialog = (mode: 'create' | 'edit', material?: MaterialDatabase) => {
    if (mode === 'create') {
      const formattedNow = toLocalDateTimeInputValue();
      materialDatabaseForm.setFieldsValue({
        materialType: 'accessory',
        status: 'pending',
        createTime: formattedNow,
        completedTime: undefined,
        image: undefined,
      });
      setMaterialDatabaseImageFiles([]);
      materialDatabaseModal.open({ mode } as MaterialDatabaseModalData);
    } else if (material) {
      const formattedMaterial = {
        ...material,
        createTime: toDateTimeLocalValue(material?.createTime),
        completedTime: toDateTimeLocalValue(material?.completedTime),
      };
      materialDatabaseForm.setFieldsValue(formattedMaterial);
      setMaterialDatabaseImageFiles(buildImageFileList(material?.image));
      materialDatabaseModal.open({ ...material, mode } as MaterialDatabaseModalData);
    } else {
      materialDatabaseForm.resetFields();
      setMaterialDatabaseImageFiles([]);
      materialDatabaseModal.open({ mode } as MaterialDatabaseModalData);
    }
  };

  const openDialog = (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    setDialogMode(mode);
    setCurrentPurchase(purchase || null);
    if (mode !== 'preview') {
      setPreviewList([]);
      setPreviewOrderId('');
    }
    if (mode === 'create') {
      form.setFieldsValue({
        materialType: normalizeMaterialType(queryParams.materialType || MATERIAL_TYPES.FABRIC),
        arrivedQuantity: 0,
        status: MATERIAL_PURCHASE_STATUS.PENDING
      });
    } else if (purchase) {
      form.setFieldsValue(purchase);
    } else {
      form.resetFields();
    }
    setVisible(true);
  };

  const openDialogSafe = async (mode: 'view' | 'create' | 'preview', purchase?: MaterialPurchaseType) => {
    if (mode !== 'view') {
      const orderKey = String(purchase?.orderId || purchase?.orderNo || '').trim();
      if (orderKey) {
        const ok = await ensureOrderUnlocked(orderKey);
        if (!ok) return;
      }
    }
    openDialog(mode, purchase);
  };

  const isOrderFrozenForRecord = (record?: Record<string, unknown> | null) => {
    if (!record) return false;
    const orderNo = String(record?.orderNo || '').trim();
    const orderId = String(record?.orderId || record?.id || '').trim();
    const status = String(record?.status || '').trim().toLowerCase();
    if (status === 'completed') return true;
    // isFrozenById 是 Record<string, boolean>，不是函数
    return orderFrozen.isFrozenById[orderNo] || orderFrozen.isFrozenById[orderId] || false;
  };

  const openQuickEditSafe = async (record: MaterialPurchaseType) => {
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) {
      const ok = await ensureOrderUnlocked(orderKey);
      if (!ok) return;
    }
    quickEditModal.open(record);
  };

  const openPurchaseSheet = (autoPrint: boolean) => {
    const html = buildPurchaseSheetHtml(currentPurchase, detailOrder, detailOrderLines, detailPurchases, detailSizePairs);
    const success = safePrint(html, '采购单');
    if (!success) {
      message.error('浏览器拦截了新窗口，请允许弹窗');
      return;
    }
  };

  const downloadPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml(currentPurchase, detailOrder, detailOrderLines, detailPurchases, detailSizePairs);
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `采购单_${purchaseNo || orderNo || 'sheet'}_${ts}.html`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentPurchase(null);
    setDialogMode('view');
    setPreviewList([]);
    setPreviewOrderId('');
    form.resetFields();
  };

  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();
      const purchaseQuantity = Number(values.purchaseQuantity || 0);
      const unitPrice = Number(values.unitPrice || 0);
      const totalAmount = Number.isFinite(purchaseQuantity) && Number.isFinite(unitPrice)
        ? Number((purchaseQuantity * unitPrice).toFixed(2))
        : undefined;
      const arrivedQuantity = Number(values.arrivedQuantity || 0);
      const computedStatus = values.status === MATERIAL_PURCHASE_STATUS.CANCELLED
        ? MATERIAL_PURCHASE_STATUS.CANCELLED
        : arrivedQuantity <= 0
          ? MATERIAL_PURCHASE_STATUS.PENDING
          : arrivedQuantity < purchaseQuantity
            ? MATERIAL_PURCHASE_STATUS.PARTIAL
            : MATERIAL_PURCHASE_STATUS.COMPLETED;

      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
      };
      const response = await api.post<{ code: number; message?: string }>('/production/purchase', payload);

      if (response.code === 200) {
        message.success('新增采购单成功');
        closeDialog();
        fetchMaterialPurchaseList();
      } else {
        message.error(response.message || '保存失败');
      }
    } catch (error) {
      const formError = error as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) {
        const firstError = formError.errorFields[0];
        message.error(firstError?.errors?.[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const receivePurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('采购任务缺少ID');
      return;
    }

    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) {
      const ok = await ensureOrderUnlocked(orderKey);
      if (!ok) return;
    }

    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
    if (!String(receiverName).trim()) {
      message.error('未填写领取人');
      return;
    }

    try {
      const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', {
        purchaseId: id,
        receiverId: String(user?.id || '').trim(),
        receiverName: String(receiverName).trim(),
      });
      if (res.code === 200) {
        message.success('已领取采购任务');
        fetchMaterialPurchaseList();
        const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
        if (no) loadDetailByOrderNo(no);
        return;
      }
      message.error(res.message || '领取失败');
    } catch (e: unknown) {
      message.error((e as Error)?.message || '领取失败');
    }
  };

  const submitReturnConfirm = async () => {
    try {
      setReturnConfirmSubmitting(true);
      const orderKey = String(returnConfirmModal.data?.[0]?.orderId || returnConfirmModal.data?.[0]?.orderNo || '').trim();
      if (orderKey) {
        const ok = await ensureOrderUnlocked(orderKey);
        if (!ok) return;
      }
      const values = (await returnConfirmForm.validateFields()) as { items?: Array<{ purchaseId?: string; returnQuantity?: number }> };
      const confirmerName = String(user?.name || user?.username || '未命名').trim() || '未命名';
      const items = Array.isArray(values?.items) ? values.items : [];
      const confirmerId = String(user?.id || '').trim() || undefined;

      if (!items.length) {
        message.error('没有可回料确认的采购任务');
        return;
      }

      const validItems = items.filter((it) => String(it?.purchaseId || '').trim());
      if (!validItems.length) {
        message.error('采购任务缺少ID');
        return;
      }

      for (const it of validItems) {
        const purchaseId = String(it?.purchaseId || '').trim();
        const returnQuantity = Number(it?.returnQuantity);
        const res = await postReturnConfirm({ purchaseId, confirmerId, confirmerName, returnQuantity });
        const result = res as { code?: number; message?: string };
        if (result?.code !== 200) {
          throw new Error(result?.message || '回料确认失败');
        }
      }

      message.success('回料确认成功');
      returnConfirmModal.close();
      returnConfirmForm.resetFields();
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: unknown) {
      const formError = e as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) return;
      message.error((e as Error)?.message || '回料确认失败');
    } finally {
      setReturnConfirmSubmitting(false);
    }
  };

  const submitReturnReset = async () => {
    if (!returnResetModal.data) return;
    if (!isSupervisorOrAbove) {
      message.error('仅主管级别及以上可执行退回');
      return;
    }
    try {
      setReturnResetSubmitting(true);
      const orderKey = String(returnResetModal.data?.orderId || returnResetModal.data?.orderNo || '').trim();
      if (orderKey) {
        const ok = await ensureOrderUnlocked(orderKey);
        if (!ok) return;
      }
      const values = (await returnResetForm.validateFields()) as { reason?: string };
      const purchaseId = String(returnResetModal.data?.id || '').trim();
      if (!purchaseId) {
        message.error('采购任务缺少ID');
        return;
      }
      const res = await postReturnConfirmReset({ purchaseId, reason: String(values?.reason || '').trim() });
      const result = res as { code?: number; message?: string };
      if (result?.code !== 200) {
        throw new Error(result?.message || '退回失败');
      }
      message.success('退回成功');
      returnResetModal.close();
      returnResetForm.resetFields();
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (visible && dialogMode === 'view' && no) loadDetailByOrderNo(no);
    } catch (e: unknown) {
      const formError = e as { errorFields?: Array<{ errors?: string[] }> };
      if (formError?.errorFields?.length) return;
      message.error((e as Error)?.message || '退回失败');
    } finally {
      setReturnResetSubmitting(false);
    }
  };

  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await api.put('/production/purchase/quick-edit', {
        id: quickEditModal.data?.id,
        remark: values.remarks,
        expectedShipDate: values.expectedShipDate,
      });
      messageApi.success('保存成功');
      quickEditModal.close();
      fetchMaterialPurchaseList();
    } catch (error: any) {
      messageApi.error(error?.response?.data?.message || '保存失败');
      throw error;
    } finally {
      setQuickEditSaving(false);
    }
  };

  const confirmReturnPurchaseTask = async (record: MaterialPurchaseType) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('采购任务缺少ID');
      return;
    }
    if (Number(record?.returnConfirmed || 0) === 1) {
      message.info('该采购任务已回料确认，如需调整请主管退回处理');
      return;
    }
    openReturnConfirm([record]);
  };

  const sortedPurchaseList = useMemo(() => {
    const sorted = [...purchaseList];
    sorted.sort((a: any, b: any) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      if (sortField === 'createTime' || sortField === 'returnConfirmTime') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }
      return 0;
    });
    return sorted;
  }, [purchaseList, sortField, sortOrder]);

  const detailFrozen = isOrderFrozenForRecord(detailOrder || currentPurchase);

  const handleReceiveAll = async () => {
    const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
    if (!String(receiverName).trim()) {
      message.error('未填写领取人');
      return;
    }
    const targets = detailPurchases.filter((p) => p.status === 'pending' && String(p.id || '').trim());
    if (!targets.length) {
      message.info('没有可领取的采购任务');
      return;
    }
    try {
      setSubmitLoading(true);
      for (const t of targets) {
        await api.post<{ code: number; message: string; data: boolean }>('/production/purchase/receive', {
          purchaseId: String(t.id),
          receiverId: String(user?.id || '').trim(),
          receiverName: String(receiverName).trim(),
        });
      }
      message.success('已领取该订单待采购任务');
      fetchMaterialPurchaseList();
      const no = String(currentPurchase?.orderNo || '').trim();
      if (no) loadDetailByOrderNo(no);
    } catch {
      message.error('领取失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleBatchReturn = async () => {
    const targets = detailPurchases.filter((p) =>
      (p.status === MATERIAL_PURCHASE_STATUS.RECEIVED || p.status === MATERIAL_PURCHASE_STATUS.PARTIAL || p.status === MATERIAL_PURCHASE_STATUS.COMPLETED)
      && String(p.id || '').trim()
      && Number(p.returnConfirmed || 0) !== 1
    );
    if (!targets.length) {
      message.info('没有可回料确认的采购任务');
      return;
    }
    openReturnConfirm(targets);
  };

  const handleSavePreview = async () => {
    try {
      setSubmitLoading(true);
      if (!previewOrderId) {
        message.error('缺少订单ID，无法生成采购单');
        return;
      }
      const res = await api.post<{ code: number; message?: string }>('/production/purchase/demand/generate', {
        orderId: previewOrderId,
        overwrite: false,
      });
      if (res.code === 200) {
        message.success('生成采购单成功');
        closeDialog();
        fetchMaterialPurchaseList();
      } else {
        message.error(res.message || '生成失败');
      }
    } catch (e) {
      message.error((e as Error)?.message || '生成失败');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <Layout>
      {contextHolder}
      <div>
        <Card className="page-card">
          <Tabs
            activeKey="purchase"
            items={[
              {
                key: 'purchase',
                label: '面料采购',
                children: (
                  <div>
                    <div className="page-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Segmented
                          value={queryParams.materialType || ''}
                          options={[
                            { label: '面料', value: 'fabric' },
                            { label: '里料', value: 'lining' },
                            { label: '辅料', value: 'accessory' },
                            { label: '全部', value: '' },
                          ]}
                          onChange={(value) => setQueryParams(prev => ({ ...prev, materialType: String(value), page: 1 }))}
                        />
                        <Tooltip
                          title={
                            '合并采购逻辑：从订单生成采购单时，会自动匹配同一天创建且同款的其它订单一起生成。\n'
                            + '避免重复：若某订单已存在未删除的采购记录且未选择"覆盖生成"，该订单会被自动跳过。\n'
                            + '合并方式：相同物料（类型/编码/名称/规格/单位/供应商相同）会共用同一采购单号，便于采购合单。'
                          }
                        >
                          <QuestionCircleOutlined style={{ color: 'var(--neutral-text-disabled)', cursor: 'pointer' }} />
                        </Tooltip>
                      </div>
                      <Space wrap>
                        <Button
                          icon={<DownloadOutlined />}
                          onClick={handleExport}
                          disabled={loading || !purchaseList || purchaseList.length === 0}
                        >
                          导出
                        </Button>
                        <Button type="default" onClick={async () => {
                          const targetOrderNo = (queryParams.orderNo || '').trim() || window.prompt('请输入订单号以生成采购单');
                          if (!targetOrderNo) return;
                          try {
                            const orderRes = await api.get<{ code: number; message?: string; data: { records: ProductionOrder[]; total: number } }>('/production/order/list', {
                              params: { page: 1, pageSize: 1, orderNo: targetOrderNo }
                            });
                            const records = orderRes?.data?.records || [];
                            if (orderRes.code !== 200 || !records.length) {
                              message.error(orderRes?.message || '未找到该订单');
                              return;
                            }
                            const order = records[0];
                            if (!order?.id) {
                              message.error('订单数据缺少ID');
                              return;
                            }
                            if (String(order?.status || '').trim().toLowerCase() === 'completed') {
                              message.error('订单已完成，无法生成采购单');
                              return;
                            }
                            setPreviewOrderId(String(order.id));
                            setQueryParams(prev => ({ ...prev, orderNo: String(order.orderNo || targetOrderNo), page: 1 }));
                            const previewRes = await api.get<{ code: number; message?: string; data: MaterialPurchaseType[] }>('/production/purchase/demand/preview', {
                              params: { orderId: order.id }
                            });
                            if (previewRes.code === 200) {
                              const preview = previewRes.data || [];
                              setPreviewList(preview as MaterialPurchaseType[]);
                              openDialog('preview');
                              message.success(`已生成 ${preview.length} 条采购单预览，确认后保存生成`);
                            } else {
                              message.error(previewRes.message || '生成采购单预览失败');
                            }
                          } catch (e: unknown) {
                            message.error((e as Error)?.message || '生成采购单失败');
                          }
                        }}>
                          从订单生成采购单
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog('create')}>
                          新增采购单
                        </Button>
                      </Space>
                    </div>

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={() => {
                        const params = new URLSearchParams(location.search);
                        const orderNo = (params.get('orderNo') || '').trim();
                        setQueryParams({ page: 1, pageSize: 10, orderNo, materialType: '' });
                      }}
                    />

                    <MaterialTable
                      loading={loading}
                      dataSource={sortedPurchaseList}
                      total={total}
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      isMobile={isMobile}
                      onView={(record) => openDialogSafe('view', record)}
                      onEdit={(record) => openQuickEditSafe(record)}
                      sortField={sortField}
                      sortOrder={sortOrder}
                      onSort={handleSort}
                      purchaseSortField={purchaseSortField}
                      purchaseSortOrder={purchaseSortOrder}
                      onPurchaseSort={handlePurchaseSort}
                      isOrderFrozenForRecord={isOrderFrozenForRecord}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>

        <PurchaseModal
          visible={visible}
          dialogMode={dialogMode}
          onCancel={closeDialog}
          modalWidth={modalWidth}
          modalInitialHeight={modalInitialHeight}
          isMobile={isMobile}
          submitLoading={submitLoading}
          currentPurchase={currentPurchase}
          detailOrder={detailOrder}
          detailOrderLines={detailOrderLines}
          detailPurchases={detailPurchases}
          detailLoading={detailLoading}
          detailSizePairs={detailSizePairs}
          detailFrozen={detailFrozen}
          previewList={previewList}
          previewOrderId={previewOrderId}
          isSupervisorOrAbove={isSupervisorOrAbove}
          form={form}
          user={user}
          sortField={sortField}
          sortOrder={sortOrder}
          onSort={handleSort}
          onReceive={receivePurchaseTask}
          onConfirmReturn={confirmReturnPurchaseTask}
          onReturnReset={openReturnReset}
          onReceiveAll={handleReceiveAll}
          onBatchReturn={handleBatchReturn}
          onGeneratePurchaseSheet={openPurchaseSheet}
          onDownloadPurchaseSheet={downloadPurchaseSheet}
          onSaveCreate={handleSubmit}
          onSavePreview={handleSavePreview}
          isOrderFrozenForRecord={isOrderFrozenForRecord}
        />

        <ResizableModal
          open={returnConfirmModal.visible}
          title="回料确认"
          okText="确认回料"
          cancelText="取消"
          width={isMobile ? '96vw' : 570}
          centered
          onCancel={() => {
            returnConfirmModal.close();
            returnConfirmForm.resetFields();
          }}
          okButtonProps={{ loading: returnConfirmSubmitting }}
          onOk={submitReturnConfirm}
          destroyOnHidden
          autoFontSize={false}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          scaleWithViewport
        >
          <Form form={returnConfirmForm} layout="vertical" preserve={false}>
            <div style={{ marginBottom: 12, color: 'var(--neutral-text)' }}>
              确认人：{String(user?.name || user?.username || '未命名').trim() || '未命名'}
            </div>
            <div style={{ border: '1px solid #f0f0f0', borderRadius: 6 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid #f0f0f0' }}>物料</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 100 }}>采购数</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 100 }}>到货数</th>
                    <th style={{ textAlign: 'right', padding: '8px 10px', borderBottom: '1px solid #f0f0f0', width: 180 }}>实际回料数</th>
                  </tr>
                </thead>
                <tbody>
                  {(returnConfirmModal.data || []).map((t, idx) => {
                    const purchaseQty = Number(t?.purchaseQuantity || 0) || 0;
                    const arrivedQty = Number(t?.arrivedQuantity || 0) || 0;
                    const max = arrivedQty > 0 ? arrivedQty : purchaseQty;
                    return (
                      <tr key={String(t?.id || idx)}>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5' }}>
                          <div style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{String(t?.materialName || '-')}</div>
                          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>{String(t?.materialCode || '')}</div>
                          <Form.Item name={['items', idx, 'purchaseId']} initialValue={String(t?.id || '')} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={['items', idx, 'purchaseQuantity']} initialValue={purchaseQty} hidden>
                            <Input />
                          </Form.Item>
                          <Form.Item name={['items', idx, 'arrivedQuantity']} initialValue={arrivedQty} hidden>
                            <Input />
                          </Form.Item>
                        </td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{purchaseQty}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>{arrivedQty}</td>
                        <td style={{ padding: '8px 10px', borderBottom: '1px solid #f5f5f5', textAlign: 'right' }}>
                          <Form.Item
                            name={['items', idx, 'returnQuantity']}
                            initialValue={Number(t?.returnQuantity || 0) || (max || 0)}
                            style={{ margin: 0, display: 'inline-block' }}
                            rules={[
                              { required: true, message: '请输入实际回料数量' },
                              {
                                validator: async (_, v) => {
                                  const n = Number(v);
                                  if (!Number.isFinite(n)) throw new Error('请输入数字');
                                  if (n < 0) throw new Error('不能小于0');
                                  if (!Number.isInteger(n)) throw new Error('请输入整数');
                                  if (n > max) throw new Error(`不能大于${max}`);
                                },
                              },
                            ]}
                          >
                            <InputNumber min={0} precision={0} step={1} style={{ width: 140 }} />
                          </Form.Item>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Form>
        </ResizableModal>

        <ResizableModal
          open={returnResetModal.visible}
          title="退回回料确认"
          okText="确认退回"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: returnResetSubmitting }}
          width={isMobile ? '96vw' : 520}
          onCancel={() => {
            returnResetModal.close();
            returnResetForm.resetFields();
          }}
          onOk={submitReturnReset}
          destroyOnHidden
          autoFontSize={false}
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          scaleWithViewport
        >
          <Form form={returnResetForm} layout="vertical" preserve={false}>
            <Form.Item
              name="reason"
              label="退回原因"
              rules={[{ required: true, message: '请输入退回原因' }]}
            >
              <Input.TextArea rows={3} maxLength={200} showCount />
            </Form.Item>
          </Form>
        </ResizableModal>

        <QuickEditModal
          visible={quickEditModal.visible}
          loading={quickEditSaving}
          initialValues={{
            remark: quickEditModal.data?.remark,
            expectedShipDate: quickEditModal.data?.expectedShipDate,
          }}
          onSave={handleQuickEditSave}
          onCancel={() => {
            quickEditModal.close();
          }}
        />
      </div>
    </Layout>
  );
};

export default MaterialPurchase;
