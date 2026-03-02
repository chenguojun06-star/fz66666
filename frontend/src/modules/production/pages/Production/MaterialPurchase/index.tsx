import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Input, Select, Form, InputNumber, message as antdMessage, Segmented, Tooltip, Tabs, Modal } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { UploadFile } from 'antd/es/upload/interface';
import { useModal } from '@/hooks';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams, MaterialDatabase, MaterialDatabaseQueryParams, ProductionOrder } from '@/types/production';
import api, { parseProductionOrderLines, unwrapApiData, useProductionOrderFrozenCache } from '@/utils/api';
import { getMaterialTypeSortKey, normalizeMaterialType, getMaterialTypeLabel } from '@/utils/materialType';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import '../../../styles.css';
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
  buildSizePairs,
  getStatusConfig
} from './utils';
import { formatDateTime } from '@/utils/datetime';
import { MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES, DEFAULT_PAGE_SIZE } from '@/constants/business';
import { useLocation, useNavigate } from 'react-router-dom';

import MaterialSearchForm from './components/MaterialSearchForm';
import MaterialTable from './components/MaterialTable';
import PurchaseModal from './components/PurchaseModal';
import SmartReceiveModal from './components/SmartReceiveModal';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const MaterialPurchase: React.FC = () => {
  const [messageApi, contextHolder] = antdMessage.useMessage();
  const message = messageApi;
  const location = useLocation();
  const _navigate = useNavigate();
  const { user } = useAuth();
  const { isMobile, modalWidth } = useViewport();

  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  // 页签切换状态
  const [activeTabKey, _setActiveTabKey] = useState<MaterialPurchaseTabKey>(() => {
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
      const page = Number((parsed as any).page);
      const pageSize = Number((parsed as any).pageSize);
      return {
        ...base,
        ...(parsed as any),
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
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  // 智能领取弹窗
  const [smartReceiveOpen, setSmartReceiveOpen] = useState(false);
  const [smartReceiveOrderNo, setSmartReceiveOrderNo] = useState('');

  // 状态统计卡片
  const [purchaseStats, setPurchaseStats] = useState<{
    totalCount: number;
    totalQuantity: number;
    pendingCount: number;
    receivedCount: number;
    partialCount: number;
    completedCount: number;
    cancelledCount: number;
  }>({ totalCount: 0, totalQuantity: 0, pendingCount: 0, receivedCount: 0, partialCount: 0, completedCount: 0, cancelledCount: 0 });
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'pending' | 'received' | 'partial' | 'completed'>('all');

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
  const [_materialDatabaseList, setMaterialDatabaseList] = useState<MaterialDatabase[]>([]);
  const [_materialDatabaseLoading, setMaterialDatabaseLoading] = useState(false);
  const [_materialDatabaseTotal, setMaterialDatabaseTotal] = useState(0);
  const [materialDatabaseQueryParams, _setMaterialDatabaseQueryParams] = useState<MaterialDatabaseQueryParams>(() => {
    const base: MaterialDatabaseQueryParams = { page: 1, pageSize: DEFAULT_PAGE_SIZE };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(MATERIAL_DB_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as any).page);
      const pageSize = Number((parsed as any).pageSize);
      return {
        ...base,
        ...(parsed as any),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
      };
    } catch {
      return base;
    }
  });
  const [materialDatabaseForm] = Form.useForm();
  const [_materialDatabaseImageFiles, setMaterialDatabaseImageFiles] = useState<UploadFile[]>([]);

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
  const handleExport = async () => {
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

      const ExcelJS = await import('exceljs');

      // 创建工作簿和工作表
      const workbook = new ExcelJS.default.Workbook();
      const worksheet = workbook.addWorksheet('面辅料采购');

      // 设置表头
      worksheet.columns = [
        { header: '序号', key: '序号', width: 8 },
        { header: '订单号', key: '订单号', width: 20 },
        { header: '采购单号', key: '采购单号', width: 22 },
        { header: '物料类型', key: '物料类型', width: 14 },
        { header: '物料名称', key: '物料名称', width: 22 },
        { header: '物料编码', key: '物料编码', width: 20 },
        { header: '规格', key: '规格', width: 17 },
        { header: '供应商', key: '供应商', width: 20 },
        { header: '采购数量（kg/件）', key: '采购数量（kg/件）', width: 18 },
        { header: '到货数量（kg/件）', key: '到货数量（kg/件）', width: 18 },
        { header: '待到数量（kg/件）', key: '待到数量（kg/件）', width: 18 },
        { header: '单价（元）', key: '单价（元）', width: 14 },
        { header: '总金额（元）', key: '总金额（元）', width: 14 },
        { header: '状态', key: '状态', width: 14 },
        { header: '领取人', key: '领取人', width: 14 },
        { header: '创建时间', key: '创建时间', width: 22 },
      ];

      // 添加数据
      worksheet.addRows(exportData);

      // 设置表头样式
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // 生成文件名
      const fileName = `面辅料采购_${new Date().toLocaleDateString().replace(/\//g, '')}_${new Date().toLocaleTimeString().replace(/:/g, '')}.xlsx`;

      // 导出文件
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch (error: any) {
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

  const unwrapPurchaseRecords = (purchaseRes: any): MaterialPurchaseType[] => {
    if (purchaseRes?.code !== 200) return [];
    return (
      (Array.isArray(purchaseRes?.data?.records) && purchaseRes?.data?.records)
      || (Array.isArray((purchaseRes?.data as any)?.list) && (purchaseRes?.data as any)?.list)
      || (Array.isArray((purchaseRes?.data as any)?.items) && (purchaseRes?.data as any)?.items)
      || (Array.isArray((purchaseRes?.data as any)?.rows) && (purchaseRes?.data as any)?.rows)
      || (Array.isArray(purchaseRes?.data) && purchaseRes?.data)
      || []
    );
  };

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

      const orderRecords = orderResult?.code === 200
        ? (
          (Array.isArray(orderResult?.data?.records) && orderResult?.data?.records)
          || (Array.isArray((orderResult?.data as any)?.list) && (orderResult?.data as any)?.list)
          || (Array.isArray((orderResult?.data as any)?.items) && (orderResult?.data as any)?.items)
          || (Array.isArray((orderResult?.data as any)?.rows) && (orderResult?.data as any)?.rows)
          || (Array.isArray(orderResult?.data) && orderResult?.data)
          || []
        )
        : [];
      const orderRecord = orderRecords[0] || null;

      setDetailOrder(orderRecord);

      const records = purchaseRes?.code === 200
        ? (
          (Array.isArray(purchaseRes?.data?.records) && purchaseRes?.data?.records)
          || (Array.isArray((purchaseRes?.data as any)?.list) && (purchaseRes?.data as any)?.list)
          || (Array.isArray((purchaseRes?.data as any)?.items) && (purchaseRes?.data as any)?.items)
          || (Array.isArray((purchaseRes?.data as any)?.rows) && (purchaseRes?.data as any)?.rows)
          || (Array.isArray(purchaseRes?.data) && purchaseRes?.data)
          || []
        )
        : [];
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

  // 样衣采购详情：优先按款号聚合加载（恢复单款聚合），仅在无款号时按采购单号兜底
  const loadDetailByStyleNo = async (styleNo: string, purchaseNo?: string) => {
    const no = String(styleNo || '').trim();
    const pNo = String(purchaseNo || '').trim();
    if (!no && !pNo) return;
    setDetailLoading(true);
    try {
      const purchaseRes = await api.get<{ code: number; data: { records: MaterialPurchaseType[]; total: number } }>(
        '/production/purchase/list',
        {
          params: no
            ? { page: 1, pageSize: 200, styleNo: no, sourceType: 'sample', materialType: '', status: '' }
            : { page: 1, pageSize: 200, purchaseNo: pNo, sourceType: 'sample', materialType: '', status: '' }
        }
      );

      const records = unwrapPurchaseRecords(purchaseRes)
        .filter((r) => String((r as any)?.sourceType || '').trim().toLowerCase() === 'sample');
      const sorted = [...records].sort((a: MaterialPurchaseType, b: MaterialPurchaseType) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        return String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
      });
      setDetailPurchases(sorted);
      setDetailOrder(null);

      // 从采购单中提取颜色和尺码信息（样衣优先使用下单颜色/下单数量）
      if (sorted.length > 0) {
        const colors = new Set<string>();
        const sizes = new Set<string>();
        let totalQty = 0;
        let orderQty = 0;
        let orderColor = '';

        sorted.forEach((p: any) => {
          const color = String(p?.color || '').trim();
          const sourceColor = String(p?.orderColor || '').trim();
          const size = String(p?.size || '').trim();
          const qty = Number(p?.purchaseQuantity || 0);
          const oq = Number(p?.orderQuantity || 0);

          if (color && color !== '-') colors.add(color);
          if (size && size !== '-') sizes.add(size);
          if (qty > 0) totalQty += qty;
          if (!orderColor && sourceColor && sourceColor !== '-') orderColor = sourceColor;
          if (oq > 0 && orderQty <= 0) orderQty = oq;
        });

        const fallbackOrderQty = Number((currentPurchase as any)?.orderQuantity || 0);
        const finalOrderQty = orderQty > 0 ? orderQty : (fallbackOrderQty > 0 ? fallbackOrderQty : totalQty);

        const colorStr = orderColor || Array.from(colors).join(',');
        const sizeStr = Array.from(sizes).join(',') || (finalOrderQty > 0 ? '总数' : '');

        setDetailOrderLines([{
          color: colorStr || String((currentPurchase as any)?.orderColor || currentPurchase?.color || ''),
          size: sizeStr,
          quantity: finalOrderQty || 0
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

  const _ensureOrderExistCache = useCallback(async (orderNos: string[]) => {
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
    // ⚠️ 设计决策：采购列表不过滤订单，显示所有采购记录（包括已删除订单的采购记录用于追溯）
    // 订单存在性检查仅在订单列表页面进行
    return records;
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (dialogMode !== 'view') return;
    const no = String(currentPurchase?.orderNo || '').trim();
    // 样衣采购单没有订单号（或订单号为"-"），按款号加载
    if (no && no !== '-') {
      loadDetailByOrderNo(no);
    } else if (currentPurchase) {
      const styleNo = String(currentPurchase?.styleNo || '').trim();
      const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
      if (styleNo) {
        loadDetailByStyleNo(styleNo, purchaseNo);
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
        if (showSmartErrorNotice) setSmartError(null);
      } else {
        reportSmartError('物料采购列表加载失败', response.message || '服务返回异常，请稍后重试', 'MATERIAL_PURCHASE_LIST_FAILED');
        message.error(response.message || '获取物料采购列表失败');
      }
    } catch (error) {
      reportSmartError('物料采购列表加载失败', (error as Error)?.message || '网络异常或服务不可用，请稍后重试', 'MATERIAL_PURCHASE_LIST_EXCEPTION');
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
      const data = unwrapApiData<{ records?: MaterialDatabase[]; total?: number }>(res as any, '获取面辅料数据库列表失败');
      const records = Array.isArray(data?.records) ? data.records : [];
      setMaterialDatabaseList(records as MaterialDatabase[]);
      setMaterialDatabaseTotal(Number(data?.total || 0) || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error) {
      const errMessage = (error as Error)?.message;
      reportSmartError('面辅料数据库加载失败', errMessage || '网络异常或服务不可用，请稍后重试', 'MATERIAL_DATABASE_LIST_FAILED');
      message.error(errMessage || '获取面辅料数据库列表失败');
    } finally {
      setMaterialDatabaseLoading(false);
    }
  }, [materialDatabaseQueryParams]);

  // 获取采购任务状态统计（不受分页影响）
  const fetchPurchaseStats = useCallback(async () => {
    try {
      const filterParams: Record<string, string> = {};
      if (queryParams.materialType) filterParams.materialType = queryParams.materialType;
      if (queryParams.sourceType) filterParams.sourceType = queryParams.sourceType;
      if (queryParams.orderNo) filterParams.orderNo = queryParams.orderNo;
      const res = await api.get<{ code: number; data: typeof purchaseStats }>('/production/purchase/stats', { params: filterParams });
      if (res.code === 200 && res.data) {
        setPurchaseStats(res.data);
      }
    } catch (error) {
      console.error('获取采购统计失败', error);
    }
  }, [queryParams.materialType, queryParams.sourceType, queryParams.orderNo]);

  // 页面加载时获取物料采购列表
  useEffect(() => {
    if (activeTabKey === 'purchase') {
      fetchMaterialPurchaseList();
    } else if (activeTabKey === 'materialDatabase') {
      fetchMaterialDatabaseList();
    }
  }, [activeTabKey, fetchMaterialDatabaseList, fetchMaterialPurchaseList, queryParams, materialDatabaseQueryParams]);

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    if (activeTabKey === 'purchase') {
      fetchPurchaseStats();
    }
  }, [activeTabKey, fetchPurchaseStats]);

  // 同步搜索栏 status dropdown → 统计卡片高亮
  useEffect(() => {
    const s = (queryParams.status || '').trim().toLowerCase();
    if (!s || s === 'cancelled') {
      setActiveStatFilter('all');
    } else if (s === 'pending' || s === 'received' || s === 'partial' || s === 'completed') {
      setActiveStatFilter(s);
    } else {
      setActiveStatFilter('all');
    }
  }, [queryParams.status]);

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
        // 同步更新统计数据
        fetchPurchaseStats();
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
  const _openMaterialDatabaseDialog = (mode: 'create' | 'edit', material?: MaterialDatabase) => {
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
    const status = String(record?.status || '').trim().toLowerCase();
    if (status === 'completed') return true;

    // 样衣采购单（无订单号）不检查订单冻结状态
    const sourceType = String(record?.sourceType || '').trim();
    const orderNo = String(record?.orderNo || '').trim();
    if (sourceType === 'sample' || !orderNo || orderNo === '-') {
      return false; // 样衣采购单只根据自身状态判断
    }

    // 订单采购单需要检查订单冻结状态
    const orderId = String(record?.orderId || record?.id || '').trim();
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

  const openPurchaseSheet = (_autoPrint: boolean) => {
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
        // 手动新增的采购单，若无订单关联则标记为批量采购
        sourceType: values.sourceType || (!values.orderId ? 'batch' : 'order'),
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

    const receiverId = String(user?.id || '').trim();

    try {
      // 1. 检查当天是否有同款面辅料的可合并采购任务
      const mergeRes = await api.get<{
        code: number;
        data: {
          currentId: string;
          mergeableCount: number;
          mergeableItems: Array<{
            id: string;
            purchaseNo: string;
            materialName: string;
            materialCode: string;
            materialType: string;
            specifications: string;
            purchaseQuantity: number;
            unit: string;
            orderNo: string;
            styleNo: string;
            supplierName: string;
          }>;
        };
      }>('/production/purchase/check-mergeable', { params: { purchaseId: id } });

      const mergeableCount = mergeRes?.code === 200 ? (mergeRes.data?.mergeableCount || 0) : 0;
      const mergeableItems = mergeRes?.code === 200 ? (mergeRes.data?.mergeableItems || []) : [];

      if (mergeableCount > 0) {
        // 2. 有可合并的任务，弹出确认提示
        const materialInfo = String(record?.materialName || '').trim();
        const _mergeDetail = mergeableItems.map((item) => {
          const orderLabel = item.orderNo ? `订单${item.orderNo}` : (item.styleNo ? `款号${item.styleNo}` : '');
          return `${orderLabel} ${item.materialName || ''} ${item.purchaseQuantity || 0}${item.unit || ''}`;
        }).join('\n');

        Modal.confirm({
          title: '发现当天同款面辅料采购任务',
          content: (
            <div>
              <p style={{ marginBottom: 8 }}>
                当天有 <strong>{mergeableCount}</strong> 条相同面辅料（<strong>{materialInfo}</strong>）的待采购任务，是否合并采购一键领取？
              </p>
              <div style={{ maxHeight: 200, overflow: 'auto', background: 'var(--color-bg-subtle)', padding: '8px 12px', borderRadius: 4, fontSize: 13 }}>
                {mergeableItems.map((item, i) => (
                  <div key={item.id} style={{ marginBottom: 4, borderBottom: i < mergeableItems.length - 1 ? '1px solid #e8e8e8' : 'none', paddingBottom: 4 }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{item.orderNo || item.styleNo || '-'}</span>
                    {' '}
                    <span>{item.materialName}</span>
                    {' '}
                    <span style={{ color: 'var(--color-primary)' }}>{item.purchaseQuantity}{item.unit || ''}</span>
                    {item.supplierName ? <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8 }}>{item.supplierName}</span> : null}
                  </div>
                ))}
              </div>
            </div>
          ),
          okText: '合并领取全部',
          cancelText: '仅领取当前',
          width: 480,
          onOk: async () => {
            // 合并领取：当前 + 所有可合并的
            const allIds = [id, ...mergeableItems.map((item) => item.id)];
            try {
              setSubmitLoading(true);
              const batchRes = await api.post<{
                code: number;
                message?: string;
                data: { successCount: number; skipCount: number; failCount: number; failMessages: string[] };
              }>('/production/purchase/batch-receive', {
                purchaseIds: allIds,
                receiverId,
                receiverName: String(receiverName).trim(),
              });
              if (batchRes.code === 200) {
                const { successCount, skipCount } = batchRes.data || {};
                message.success(`已合并领取 ${successCount || 0} 条采购任务${skipCount ? `，跳过 ${skipCount} 条` : ''}`);
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else {
                message.error(batchRes.message || '合并领取失败');
              }
            } catch (err: any) {
              message.error((err as Error)?.message || '合并领取失败');
            } finally {
              setSubmitLoading(false);
            }
          },
          onCancel: async () => {
            // 仅领取当前一条
            try {
              const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', {
                purchaseId: id,
                receiverId,
                receiverName: String(receiverName).trim(),
              });
              if (res.code === 200) {
                message.success('已领取采购任务');
                fetchMaterialPurchaseList();
                const no = String(currentPurchase?.orderNo || record?.orderNo || '').trim();
                if (no) loadDetailByOrderNo(no);
              } else {
                message.error(res.message || '领取失败');
              }
            } catch (err: any) {
              message.error((err as Error)?.message || '领取失败');
            }
          },
        });
        return;
      }

      // 3. 没有可合并的任务，直接领取
      const res = await api.post<{ code: number; message?: string; data: boolean }>('/production/purchase/receive', {
        purchaseId: id,
        receiverId,
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
    } catch (e: any) {
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
      const confirmerName = String(user?.name || user?.username || '系统操作员').trim() || '系统操作员';
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
    } catch (e: any) {
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
    } catch (e: any) {
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

  // 点击统计卡片筛选
  const handleStatClick = (type: 'all' | 'pending' | 'received' | 'partial' | 'completed') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setQueryParams(prev => ({ ...prev, status: '', page: 1 }));
    } else {
      setQueryParams(prev => ({ ...prev, status: type, page: 1 }));
    }
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

  const isSamplePurchaseView = useMemo(() => {
    const sourceType = String(currentPurchase?.sourceType || '').trim().toLowerCase();
    if (sourceType === 'sample') return true;
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    return !orderNo || orderNo === '-';
  }, [currentPurchase?.sourceType, currentPurchase?.orderNo]);

  // 样衣采购单（无订单号）不检查冻结状态
  const orderNo = String(currentPurchase?.orderNo || '').trim();
  const detailFrozen = (orderNo && orderNo !== '-') ? isOrderFrozenForRecord(detailOrder || currentPurchase) : false;
  const normalizeStatus = (status?: MaterialPurchaseType['status'] | string) => String(status || '').trim().toLowerCase();

  const handleReceiveAll = async () => {
    if (isSamplePurchaseView) {
      const targets = detailPurchases.filter((p) => normalizeStatus(p.status) === MATERIAL_PURCHASE_STATUS.PENDING && String(p.id || '').trim());
      if (!targets.length) {
        message.info('没有可领取的采购任务');
        return;
      }

      const receiverName = String(user?.name || user?.username || '').trim() || window.prompt('请输入领取人姓名') || '';
      if (!String(receiverName).trim()) {
        message.error('未填写领取人');
        return;
      }

      const receiverId = String(user?.id || '').trim();
      try {
        setSubmitLoading(true);
        const batchRes = await api.post<{
          code: number;
          message?: string;
          data: { successCount: number; skipCount: number; failCount: number; failMessages: string[] };
        }>('/production/purchase/batch-receive', {
          purchaseIds: targets.map((item) => String(item.id)),
          receiverId,
          receiverName: String(receiverName).trim(),
        });

        if (batchRes.code === 200) {
          const { successCount, skipCount } = batchRes.data || {};
          message.success(`已领取 ${successCount || 0} 条采购任务${skipCount ? `，跳过 ${skipCount} 条` : ''}`);
          fetchMaterialPurchaseList();
          const styleNo = String(currentPurchase?.styleNo || '').trim();
          const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
          if (styleNo || purchaseNo) {
            loadDetailByStyleNo(styleNo, purchaseNo);
          }
        } else {
          message.error(batchRes.message || '领取失败');
        }
      } catch (e: any) {
        message.error((e as Error)?.message || '领取失败');
      } finally {
        setSubmitLoading(false);
      }
      return;
    }

    const orderNo = String(currentPurchase?.orderNo || '').trim();
    if (!orderNo || orderNo === '-') {
      message.error('缺少订单号');
      return;
    }

    // 打开智能领取弹窗（替代旧的 Modal.info 弹窗）
    setSmartReceiveOrderNo(orderNo);
    setSmartReceiveOpen(true);
  };

  const handleSmartReceiveSuccess = () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    fetchMaterialPurchaseList();
    if (orderNo && orderNo !== '-') {
      loadDetailByOrderNo(orderNo);
    }
  };

  const handleBatchReturn = async () => {
    const targets = detailPurchases.filter((p) => {
      const status = normalizeStatus(p.status);
      return (status === MATERIAL_PURCHASE_STATUS.RECEIVED || status === MATERIAL_PURCHASE_STATUS.PARTIAL || status === MATERIAL_PURCHASE_STATUS.COMPLETED)
      && String(p.id || '').trim()
      && Number(p.returnConfirmed || 0) !== 1
    });
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
      <Form form={form} component={false} />
      <Form form={materialDatabaseForm} component={false} />
        <Card className="page-card">
          <Tabs
            activeKey="purchase"
            items={[
              {
                key: 'purchase',
                label: '面料采购',
                children: (
                  <div>
                    {showSmartErrorNotice && smartError ? (
                      <Card size="small" style={{ marginBottom: 12 }}>
                        <SmartErrorNotice error={smartError} onFix={fetchMaterialPurchaseList} />
                      </Card>
                    ) : null}
                    <div className="page-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <Select
                          value={queryParams.sourceType || ''}
                          onChange={(value) => setQueryParams(prev => ({ ...prev, sourceType: value as 'order' | 'sample' | 'batch' | '', page: 1 }))}
                          options={[
                            { label: '全部', value: '' },
                            { label: '订单', value: 'order' },
                            { label: '样衣', value: 'sample' },
                            { label: '批量采购', value: 'batch' },
                          ]}
                          style={{ width: 120 }}
                          placeholder="订单类型"
                        />
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
                    </div>

                    {/* 状态统计卡片 - 点击筛选 */}
                    <PageStatCards
                      activeKey={activeStatFilter}
                      cards={[
                        {
                          key: 'all',
                          items: [
                            { label: '采购总数', value: purchaseStats.totalCount, unit: '条', color: 'var(--color-primary)' },
                            { label: '总数量', value: purchaseStats.totalQuantity, color: 'var(--color-success)' },
                          ],
                          onClick: () => handleStatClick('all'),
                          activeColor: 'var(--color-primary)',
                          activeBg: 'rgba(45, 127, 249, 0.1)',
                        },
                        {
                          key: 'pending',
                          items: [{ label: '待采购', value: purchaseStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('pending'),
                          activeColor: 'var(--color-warning)',
                          activeBg: '#fff7e6',
                        },
                        {
                          key: 'received',
                          items: [{ label: '已领取', value: purchaseStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                          onClick: () => handleStatClick('received'),
                          activeColor: 'var(--color-primary)',
                          activeBg: 'rgba(45, 127, 249, 0.1)',
                        },
                        {
                          key: 'partial',
                          items: [{ label: '部分到货', value: purchaseStats.partialCount, unit: '条', color: 'var(--color-warning)' }],
                          onClick: () => handleStatClick('partial'),
                          activeColor: '#fa8c16',
                          activeBg: '#fff2e8',
                        },
                        {
                          key: 'completed',
                          items: [{ label: '全部到货', value: purchaseStats.completedCount, unit: '条', color: 'var(--color-success)' }],
                          onClick: () => handleStatClick('completed'),
                          activeColor: 'var(--color-success)',
                          activeBg: 'rgba(34, 197, 94, 0.15)',
                        },
                      ]}
                    />

                    <MaterialSearchForm
                      queryParams={queryParams}
                      setQueryParams={setQueryParams}
                      onSearch={fetchMaterialPurchaseList}
                      onReset={() => {
                        const params = new URLSearchParams(location.search);
                        const orderNo = (params.get('orderNo') || '').trim();
                        setQueryParams({ page: 1, pageSize: 10, orderNo, materialType: '' });
                      }}
                      onExport={handleExport}
                      onAdd={() => openDialog('create')}
                      loading={loading}
                      hasData={purchaseList && purchaseList.length > 0}
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
                      onRefresh={() => setQueryParams(p => ({ ...p }))}
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
          modalWidth={modalWidth as any}
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
          isSamplePurchase={isSamplePurchaseView}
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
              确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
            </div>
            <ResizableTable
              storageKey="material-purchase-return"
              dataSource={(returnConfirmModal.data || []).map((t, idx) => ({
                key: String(t?.id || idx),
                id: t?.id,
                materialName: t?.materialName,
                materialCode: t?.materialCode,
                purchaseQuantity: Number(t?.purchaseQuantity || 0) || 0,
                arrivedQuantity: Number(t?.arrivedQuantity || 0) || 0,
                returnQuantity: t?.returnQuantity,
                index: idx,
              }))}
              columns={[
                {
                  title: '物料',
                  dataIndex: 'materialName',
                  key: 'materialName',
                  render: (_, record) => (
                    <>
                      <div style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{String(record.materialName || '-')}</div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>{String(record.materialCode || '')}</div>
                      <Form.Item name={['items', record.index, 'purchaseId']} initialValue={String(record.id || '')} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'purchaseQuantity']} initialValue={record.purchaseQuantity} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'arrivedQuantity']} initialValue={record.arrivedQuantity} hidden>
                        <Input />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  title: '采购数',
                  dataIndex: 'purchaseQuantity',
                  key: 'purchaseQuantity',
                  width: 100,
                  align: 'right' as const,
                },
                {
                  title: '到货数',
                  dataIndex: 'arrivedQuantity',
                  key: 'arrivedQuantity',
                  width: 100,
                  align: 'right' as const,
                },
                {
                  title: '实际回料数',
                  key: 'returnQuantity',
                  width: 180,
                  align: 'right' as const,
                  render: (_, record) => {
                    const max = record.arrivedQuantity > 0 ? record.arrivedQuantity : record.purchaseQuantity;
                    return (
                      <Form.Item
                        name={['items', record.index, 'returnQuantity']}
                        initialValue={Number(record.returnQuantity || 0) || (max || 0)}
                        style={{ margin: 0 }}
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
                    );
                  },
                },
              ]}
              pagination={false}
              size="small"
              bordered
            />
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

        {/* 智能领取弹窗 */}
        <SmartReceiveModal
          open={smartReceiveOpen}
          orderNo={smartReceiveOrderNo}
          onCancel={() => setSmartReceiveOpen(false)}
          onSuccess={handleSmartReceiveSuccess}
          isSupervisorOrAbove={isSupervisorOrAbove}
          userId={String(user?.id || '').trim()}
          userName={String(user?.name || user?.username || '').trim()}
        />
    </Layout>
  );
};

export default MaterialPurchase;
