import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, InputNumber, Upload, message, Segmented, Dropdown, Collapse, Tabs, Modal, Tooltip } from 'antd';
import { useModal } from '@/hooks';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined, EyeOutlined, EditOutlined, UploadOutlined, QuestionCircleOutlined, DownloadOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import QRCodeBox from '@/components/common/QRCodeBox';
import Layout from '@/components/Layout';
import UniversalCardView from '@/components/common/UniversalCardView';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import QuickEditModal from '@/components/common/QuickEditModal';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { MaterialPurchase as MaterialPurchaseType, MaterialQueryParams, MaterialDatabase, MaterialDatabaseQueryParams, ProductionOrder } from '@/types/production';
import api, { parseProductionOrderLines, sortSizeNames, unwrapApiData, useProductionOrderFrozenCache } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeCategory, getMaterialTypeLabel, getMaterialTypeSortKey, normalizeMaterialType } from '@/utils/materialType';
import { ProductionOrderHeader, StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { useLocation, useNavigate } from 'react-router-dom';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/authContext';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import * as XLSX from 'xlsx';
import './styles.css';

const { Option } = Select;

type MaterialPurchaseTabKey = 'purchase' | 'materialDatabase';

const ACTIVE_TAB_STORAGE_KEY = 'MaterialPurchase.activeTabKey';
const PURCHASE_QUERY_STORAGE_KEY = 'MaterialPurchase.purchaseQueryParams';
const MATERIAL_DB_QUERY_STORAGE_KEY = 'MaterialPurchase.materialDatabaseQueryParams';

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
      // 忽略错误
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
    const base: MaterialQueryParams = { page: 1, pageSize: 10 };
    if (typeof window === 'undefined') return base;
    try {
      const raw = sessionStorage.getItem(PURCHASE_QUERY_STORAGE_KEY);
      if (!raw) return base;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return base;
      const page = Number((parsed as Record<string, unknown>).page);
      const pageSize = Number((parsed as Record<string, unknown>).pageSize);
      const materialType = (parsed as Record<string, unknown>).materialType;
      return {
        ...base,
        ...(parsed as Record<string, unknown>),
        page: Number.isFinite(page) && page > 0 ? Math.floor(page) : base.page,
        pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : base.pageSize,
        // materialType: typeof materialType === 'string' ? materialType : base.materialType,
      };
    } catch {
      // Intentionally empty
      // 忽略错误
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

  const watchedUnitPrice = Form.useWatch('unitPrice', form);
  const watchedArrivedQuantity = Form.useWatch('arrivedQuantity', form);
  const watchedStyleCover = Form.useWatch('styleCover', form);

  // 辅料数据库相关状态
  type MaterialDatabaseModalData = MaterialDatabase & { mode: 'create' | 'edit' };
  const materialDatabaseModal = useModal<MaterialDatabaseModalData>();
  const [materialDatabaseList, setMaterialDatabaseList] = useState<MaterialDatabase[]>([]);
  const [materialDatabaseLoading, setMaterialDatabaseLoading] = useState(false);
  const [materialDatabaseTotal, setMaterialDatabaseTotal] = useState(0);
  const [materialDatabaseQueryParams, setMaterialDatabaseQueryParams] = useState<MaterialDatabaseQueryParams>(() => {
    const base: MaterialDatabaseQueryParams = { page: 1, pageSize: 10 };
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
      // Intentionally empty
      // 忽略错误
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
      // 忽略错误
    }
  }, [activeTabKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(PURCHASE_QUERY_STORAGE_KEY, JSON.stringify(queryParams));
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  }, [queryParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(MATERIAL_DB_QUERY_STORAGE_KEY, JSON.stringify(materialDatabaseQueryParams));
    } catch {
      // Intentionally empty
      // 忽略错误
    }
  }, [materialDatabaseQueryParams]);

  useEffect(() => {
    if (dialogMode === 'preview') return;
    const qty = Number(watchedArrivedQuantity || 0);
    const price = Number(watchedUnitPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return;
    const next = Number((qty * price).toFixed(2));
    form.setFieldsValue({ totalAmount: next });
  }, [dialogMode, form, watchedArrivedQuantity, watchedUnitPrice]);

  const getOrderQtyTotal = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    return lines.reduce((sum, l) => sum + (Number(l?.quantity || 0) || 0), 0);
  };

  const buildSizePairs = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    const bySize = new Map<string, number>();
    for (const l of lines) {
      const s = String(l?.size || '').trim();
      const q = Number(l?.quantity || 0) || 0;
      if (!s) continue;
      bySize.set(s, (bySize.get(s) || 0) + q);
    }
    const sizes = sortSizeNames(Array.from(bySize.keys()));
    return sizes.map((s) => ({ size: s, quantity: bySize.get(s) || 0 }));
  };

  const detailSizePairs = useMemo(() => buildSizePairs(detailOrderLines), [detailOrderLines]);

  const postReturnConfirm = async (payload: { purchaseId: string; confirmerId?: string; confirmerName: string; returnQuantity: number }) => {
    return api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm', payload);
  };

  const postReturnConfirmReset = async (payload: { purchaseId: string; reason?: string }) => {
    return api.post<{ code: number; message: string; data: boolean }>('/production/purchase/return-confirm/reset', payload);
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

  const buildColorSummary = (lines: Array<{ color: string; size: string; quantity: number }>) => {
    const set = new Set<string>();
    for (const l of lines) {
      const c = String(l?.color || '').trim();
      if (c) set.add(c);
    }
    return Array.from(set.values()).join(' / ');
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
      const orderRecord = orderResult?.code === 200 ? (orderResult?.data?.records?.[0] || null) : null;
      setDetailOrder(orderRecord);
      const parsedLines = parseProductionOrderLines(orderRecord);
      if (parsedLines.length) {
        setDetailOrderLines(parsedLines);
      } else {
        const fallbackColor = String(orderRecord?.color || '').trim();
        const fallbackSize = String(orderRecord?.size || '').trim();
        const fallbackQty = Number(orderRecord?.orderQuantity || 0) || 0;
        if (fallbackColor || fallbackSize || fallbackQty) {
          setDetailOrderLines([{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty }]);
        } else {
          setDetailOrderLines([{ color: '-', size: '-', quantity: 0 }]);
        }
      }

      const records = purchaseRes?.code === 200 ? (purchaseRes?.data?.records || []) : [];
      const sorted = [...records].sort((a: MaterialPurchaseType, b: MaterialPurchaseType) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        return String(a?.materialName || '').localeCompare(String(b?.materialName || ''), 'zh');
      });
      setDetailPurchases(sorted);
    } catch {
      // Intentionally empty
      // 忽略错误
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
    const orderNos = Array.from(
      new Set(records.map((r) => String(r.orderNo || '').trim()).filter(Boolean))
    );
    if (!orderNos.length) return records;
    await ensureOrderExistCache(orderNos);
    const cache = orderExistCacheRef.current;
    return records.filter((r) => {
      const no = String(r.orderNo || '').trim();
      if (!no) return true;
      const exists = cache.get(no);
      return exists !== false;
    });
  }, [ensureOrderExistCache]);

  useEffect(() => {
    if (!visible) return;
    if (dialogMode !== 'view') return;
    const no = String(currentPurchase?.orderNo || '').trim();
    if (!no) return;
    loadDetailByOrderNo(no);
  }, [currentPurchase?.orderNo, dialogMode, visible]);

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

  // 实时同步：30秒自动轮询更新物料采购数据
  // 采购状态需要实时更新，确保采购进度及时同步
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
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setPurchaseList(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 物料采购数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 30000, // 30秒轮询，采购状态实时性要求高
      enabled: !loading && activeTabKey === 'purchase' && !visible, // 加载中、非采购页签或弹窗打开时暂停
      pauseOnHidden: true, // 页面隐藏时暂停
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

  const toLocalDateTimeInputValue = (v?: Date) => {
    const d = v || new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const mm = pad2(d.getMonth() + 1);
    const dd = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };

  const toDateTimeLocalValue = (v: unknown) => {
    const s = String(v || '').trim();
    if (!s) return undefined;

    const cleaned = s.replace(' ', 'T').replace(/(\.\d+)?Z$/, '');
    const m = cleaned.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/);
    if (m?.[1]) return m[1];
    return undefined;
  };

  const buildImageFileList = (url: any): UploadFile[] => {
    const u = String(url || '').trim();
    if (!u) return [];
    return [{ uid: 'image-1', name: '图片', status: 'done', url: u } as UploadFile];
  };

  const uploadMaterialDatabaseImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('图片过大，最大5MB');
      return;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const url = String(unwrapApiData<string>(await api.post<{ code: number; message: string; data: string }>('/common/upload', formData), '上传失败') || '').trim();
      if (!url) {
        message.error('上传失败');
        return;
      }
      materialDatabaseForm.setFieldsValue({ image: url });
      setMaterialDatabaseImageFiles(buildImageFileList(url));
      message.success('上传成功');
    } catch (e: unknown) {
      const errMessage = (e as Error)?.message;
      message.error(errMessage || '上传失败');
    }
  };

  // 打开辅料数据库对话框
  const openMaterialDatabaseDialog = (mode: 'create' | 'edit', material?: MaterialDatabase) => {
    if (mode === 'create') {
      // 设置当前时间为创建时间默认值
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

  // 关闭辅料数据库对话框
  const closeMaterialDatabaseDialog = () => {
    materialDatabaseModal.close();
    materialDatabaseForm.resetFields();
    setMaterialDatabaseImageFiles([]);
  };

  // 提交面辅料数据库表单
  const handleMaterialDatabaseSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = (await materialDatabaseForm.validateFields()) as Record<string, unknown>;
      const status = String(values?.status || 'pending').trim();

      const { createTime: _createTime, completedTime: _completedTime, ...rest } = values as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        ...rest,
        materialType: normalizeMaterialType(values?.materialType || 'accessory'),
        status: status === 'completed' ? 'completed' : 'pending',
        image: String(values?.image || '').trim() || undefined,
      };

      if (materialDatabaseModal.data?.mode === 'create') {
        unwrapApiData<boolean>(await api.post<{ code: number; message: string; data: boolean }>('/material/database', payload), '新增失败');
      } else {
        unwrapApiData<boolean>(
          await api.put<{ code: number; message: string; data: boolean }>('/material/database', { ...payload, id: materialDatabaseModal.data?.id }),
          '保存失败'
        );
      }

      message.success(materialDatabaseModal.data?.mode === 'edit' ? '保存成功' : '新增成功');
      closeMaterialDatabaseDialog();
      fetchMaterialDatabaseList();
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

  const handleMaterialDatabaseDelete = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    Modal.confirm({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        unwrapApiData<boolean>(await api.delete<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}`), '删除失败');
        message.success('删除成功');
        fetchMaterialDatabaseList();
      },
    });
  };

  const handleMaterialDatabaseComplete = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    Modal.confirm({
      title: '确认完成',
      content: '确认将该物料标记为已完成？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        unwrapApiData<boolean>(await api.post<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/complete`), '操作失败');
        message.success('已标记为已完成');
        fetchMaterialDatabaseList();
      },
    });
  };

  const handleMaterialDatabaseReturn = async (record: MaterialDatabase) => {
    const id = String(record?.id || '').trim();
    if (!id) {
      message.error('记录缺少ID');
      return;
    }
    let reason = '';
    Modal.confirm({
      title: '退回编辑',
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>退回原因</div>
          <Input.TextArea
            placeholder="请输入退回原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!String(reason).trim()) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        unwrapApiData<boolean>(
          await api.post<{ code: number; message: string; data: boolean }>(`/material/database/${encodeURIComponent(id)}/return`, { reason: String(reason).trim() }),
          '操作失败'
        );
        message.success('已退回为可编辑状态');
        fetchMaterialDatabaseList();
      },
    });
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
        materialType: normalizeMaterialType(queryParams.materialType || 'fabric'),
        arrivedQuantity: 0,
        status: 'pending'
      });
    } else if (purchase) {
      form.setFieldsValue(purchase);
    } else {
      form.resetFields();
    }
    setVisible(true);
  };

  const ensureOrderUnlocked = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
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
    return orderFrozen.isFrozenById(orderNo) || orderFrozen.isFrozenById(orderId);
  };

  const openQuickEditSafe = async (record: MaterialPurchaseType) => {
    const orderKey = String(record?.orderId || record?.orderNo || '').trim();
    if (orderKey) {
      const ok = await ensureOrderUnlocked(orderKey);
      if (!ok) return;
    }
    quickEditModal.open(record);
  };

  const escapeHtml = (v: unknown) => {
    const s = String(v ?? '');
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  const buildPurchaseSheetHtml = () => {
    const orderNo = String(currentPurchase?.orderNo || '').trim();
    const purchaseNo = String(currentPurchase?.purchaseNo || '').trim();
    const styleNo = String(currentPurchase?.styleNo || '').trim();
    const styleName = String(currentPurchase?.styleName || '').trim();
    const colorText = String(detailOrder?.color || '').trim() || buildColorSummary(detailOrderLines) || '';
    const totalOrderQty = getOrderQtyTotal(detailOrderLines);

    const group: { fabric: MaterialPurchaseType[]; lining: MaterialPurchaseType[]; accessory: MaterialPurchaseType[] } = {
      fabric: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'fabric'),
      lining: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'lining'),
      accessory: detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === 'accessory'),
    };

    const buildSizeTable = () => {
      if (!detailSizePairs.length) {
        return '<div class="size-empty">-</div>';
      }
      const headCells = detailSizePairs.map((x) => `<th>${escapeHtml(x.size)}</th>`).join('');
      const qtyCells = detailSizePairs.map((x) => `<td>${escapeHtml(x.quantity)}</td>`).join('');
      return `
        <table class="size-table">
          <tr>
            <th class="row-head">码数</th>
            ${headCells}
            <th class="total-cell"></th>
          </tr>
          <tr>
            <th class="row-head">数量</th>
            ${qtyCells}
            <th class="total-cell">总下单数：${escapeHtml(totalOrderQty)}</th>
          </tr>
        </table>
      `;
    };

    const buildRows = (list: readonly MaterialPurchaseType[]) => {
      const rows = list.map((r) => {
        const typeLabel = getMaterialTypeLabel(r?.materialType);
        const purchaseQty = Number(r?.purchaseQuantity) || 0;
        const arrivedQty = Number(r?.arrivedQuantity) || 0;
        const unitPrice = Number(r?.unitPrice);
        const amountText = Number.isFinite(unitPrice) ? (arrivedQty * unitPrice).toFixed(2) : '-';
        const unitPriceText = Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : '-';
        const statusText = getStatusConfig(r?.status).text;
        const returnTime = Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(r?.returnConfirmTime) || '-') : '-';
        const returnBy = Number(r?.returnConfirmed || 0) === 1 ? (String(r?.returnConfirmerName || '').trim() || '-') : '-';
        return `
          <tr>
            <td>${escapeHtml(typeLabel)}</td>
            <td>${escapeHtml(r?.materialCode || '')}</td>
            <td>${escapeHtml(r?.materialName || '')}</td>
            <td>${escapeHtml(r?.specifications || '')}</td>
            <td>${escapeHtml(r?.unit || '')}</td>
            <td class="num">${escapeHtml(purchaseQty)}</td>
            <td class="num">${escapeHtml(arrivedQty)}</td>
            <td class="num">${escapeHtml(unitPriceText)}</td>
            <td class="num">${escapeHtml(amountText)}</td>
            <td>${escapeHtml(r?.supplierName || '')}</td>
            <td>${escapeHtml(statusText || '')}</td>
            <td>${escapeHtml(returnTime)}</td>
            <td>${escapeHtml(returnBy)}</td>
          </tr>
        `;
      }).join('');

      return `
        <table class="data-table">
          <thead>
            <tr>
              <th>类型</th>
              <th>物料编码</th>
              <th>物料名称</th>
              <th>规格</th>
              <th>单位</th>
              <th class="num">采购数</th>
              <th class="num">到货数</th>
              <th class="num">单价(元)</th>
              <th class="num">金额(元)</th>
              <th>供应商</th>
              <th>状态</th>
              <th>回料时间</th>
              <th>回料人</th>
            </tr>
          </thead>
          <tbody>
            ${rows || `<tr><td colspan="13" class="empty">-</td></tr>`}
          </tbody>
        </table>
      `;
    };

    const now = new Date();
    const ts = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    return `
      <!doctype html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(purchaseNo || orderNo || '采购单')}</title>
        <style>
          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;margin:20px;color:#111}
          .top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
          .title{font-size:18px;font-weight:700}
          .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 16px;margin-top:10px}
          .kv{font-size:12px;color:#555}
          .kv b{display:block;color:#111;margin-top:2px;font-size:13px}
          .block{margin-top:14px}
          .size-table{border-collapse:collapse;font-size:12px}
          .size-table th,.size-table td{border:1px solid #d1d5db;padding:6px 8px;white-space:nowrap;vertical-align:middle;text-align:center}
          .size-table .row-head{background:#fafafa}
          .size-table .total-cell{min-width:140px;text-align:center;background:#fafafa}
          .section{margin-top:18px}
          .section h3{margin:0 0 8px 0;font-size:14px}
          .data-table{width:100%;border-collapse:collapse;font-size:12px}
          .data-table th,.data-table td{border:1px solid #d1d5db;padding:6px 8px;vertical-align:middle;text-align:center}
          .data-table th{background:#fafafa;text-align:center}
          .data-table .num{text-align:right;white-space:nowrap}
          .empty{text-align:center;color:#999}
          .actions{display:flex;gap:8px;justify-content:flex-end}
          .ant-btn{font-family:inherit}
          @media print{.no-print{display:none} body{margin:0}}
        </style>
      </head>
      <body>
        <div class="top">
          <div>
            <div class="title">采购单</div>
            <div class="meta">
              <div class="kv">订单号<b>${escapeHtml(orderNo || '-')}</b></div>
              <div class="kv">采购单号<b>${escapeHtml(purchaseNo || '-')}</b></div>
              <div class="kv">款号<b>${escapeHtml(styleNo || '-')}</b></div>
              <div class="kv">款名<b>${escapeHtml(styleName || '-')}</b></div>
              <div class="kv">颜色<b>${escapeHtml(colorText || '-')}</b></div>
              <div class="kv">生成时间<b>${escapeHtml(ts)}</b></div>
            </div>
          </div>
          <div class="actions no-print">
            <button class="ant-btn ant-btn-default" onclick="window.print()">打印</button>
            <button class="ant-btn ant-btn-primary" onclick="window.close()">关闭</button>
          </div>
        </div>

        <div class="block">
          ${buildSizeTable()}
        </div>

        <div class="section">
          <h3>面料</h3>
          ${buildRows(group.fabric)}
        </div>
        <div class="section">
          <h3>里料</h3>
          ${buildRows(group.lining)}
        </div>
        <div class="section">
          <h3>辅料</h3>
          ${buildRows(group.accessory)}
        </div>
      </body>
      </html>
    `;
  };

  const openPurchaseSheet = (autoPrint: boolean) => {
    const html = buildPurchaseSheetHtml();
    const w = window.open('', '_blank');
    if (!w) {
      message.error('浏览器拦截了新窗口，请允许弹窗');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    if (autoPrint) {
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch {
          // Intentionally empty
          // 忽略错误
          null;
        }
      }, 250);
    }
  };

  const downloadPurchaseSheet = () => {
    const html = buildPurchaseSheetHtml();
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

  // 表单提交
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
      const computedStatus = values.status === 'cancelled'
        ? 'cancelled'
        : arrivedQuantity <= 0
          ? 'pending'
          : arrivedQuantity < purchaseQuantity
            ? 'partial'
            : 'completed';

      const payload = {
        ...values,
        totalAmount,
        status: values.status || computedStatus,
      };
      const response = await api.post<{ code: number; message?: string }>('/production/purchase', payload);

      if (response.code === 200) {
        message.success('新增采购单成功');
        // 关闭弹窗
        closeDialog();
        // 刷新采购单列表
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

  const getStatusConfig = (status: MaterialPurchaseType['status']) => {
    const statusMap: Record<MaterialPurchaseType['status'], { text: string; color: string }> = {
      pending: { text: '待采购', color: 'default' },
      received: { text: '已领取', color: 'warning' },
      partial: { text: '部分到货', color: 'warning' },
      completed: { text: '全部到货', color: 'default' },
      cancelled: { text: '已取消', color: 'error' }
    };
    return statusMap[status] || { text: '未知', color: 'default' };
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

  // 快速编辑保存
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

  // 添加排序逻辑
  const sortedPurchaseList = useMemo(() => {
    const sorted = [...purchaseList];
    sorted.sort((a: any, b: any) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // 时间字段排序
      if (sortField === 'createTime' || sortField === 'returnConfirmTime') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }

      return 0;
    });
    return sorted;
  }, [purchaseList, sortField, sortOrder]);

  // 物料采购表格列定义（明细视图）
  const purchaseColumns: ColumnsType<MaterialPurchaseType> = [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: MaterialPurchaseType) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      render: (v: any, record: MaterialPurchaseType) => (
        <a
          onClick={() => {
            if (record.orderId) {
              navigate(`/production/material/${record.orderId}`);
            }
          }}
          className="order-no-wrap"
          style={{ cursor: 'pointer', color: '#1890ff' }}
        >
          {String(v || '').trim() || '-'}
        </a>
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      ellipsis: true,
      render: (v: string) => v || '-',
    },
    {
      title: '下单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number) => v ? `${v} 件` : '-',
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: string) => (
        <Tag color={
          getMaterialTypeCategory(v) === 'accessory' ? 'purple' :
            getMaterialTypeCategory(v) === 'lining' ? 'cyan' : 'geekblue'
        }>
          {getMaterialTypeLabel(v)}
        </Tag>
      ),
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
      ellipsis: true,
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 120,
      ellipsis: true,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '待到数量',
      key: 'remainingQuantity',
      width: 100,
      align: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const total = Number(record?.purchaseQuantity || 0);
        const arrived = Number(record?.arrivedQuantity || 0);
        const remaining = Math.max(0, total - arrived);
        return `${remaining} ${record.unit || ''}`;
      },
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (v: number) => Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: MaterialPurchaseType['status'] | string) => {
        const config = getStatusConfig(status as MaterialPurchaseType['status']);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '来源',
      dataIndex: 'sourceType',
      key: 'sourceType',
      width: 80,
      render: (v: string) => {
        if (v === 'sample') {
          return <Tag color="orange">样衣</Tag>;
        }
        return <Tag color="blue">订单</Tag>;
      },
    },
    {
      title: <SortableColumnTitle
        title="下单时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
      />,
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-',
    },
    {
      title: (
        <SortableColumnTitle
          title="预计出货"
          sortField={purchaseSortField}
          fieldName="expectedShipDate"
          sortOrder={purchaseSortOrder}
          onSort={handlePurchaseSort}
          align="left"
        />
      ),
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '采购时间',
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-',
    },
    {
      title: '采购完成',
      dataIndex: 'actualArrivalDate',
      key: 'actualArrivalDate',
      width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) : '-',
    },
    {
      title: '采购员',
      dataIndex: 'receiverName',
      key: 'receiverName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true,
      render: (v: string) => <span title={v}>{v || '-'}</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => {
        const frozen = isOrderFrozenForRecord(record);
        return (
          <RowActions
            actions={[
              {
                key: 'view',
                label: '查看',
                icon: <EyeOutlined />,
                onClick: () => void openDialogSafe('view', record),
                primary: true,
              },
              {
                key: 'quickEdit',
                label: '编辑',
                icon: <EditOutlined />,
                disabled: frozen,
                onClick: () => void openQuickEditSafe(record),
              },
            ]}
          />
        );
      },
    },
  ];

  // 面辅料数据库表格列定义
  const materialDatabaseColumns: ColumnsType<MaterialDatabase> = [
    {
      title: '图片',
      dataIndex: 'image',
      key: 'image',
      width: 80,
      render: (image: string) => {
        if (!image) return null;
        return (
          <img
            src={image}
            alt="物料图片"
            style={{
              width: 40,
              height: 40,
              borderRadius: 4,
              objectFit: 'cover'
            }}
          />
        );
      }
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
      ellipsis: true,
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 120,
      render: (v: unknown) => {
        const type = String(v || '').trim();
        const category = getMaterialTypeCategory(type);
        const text = getMaterialTypeLabel(type);
        const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 80,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单价(元)',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right' as const,
      render: (value: unknown) => {
        const n = Number(value);
        return Number.isFinite(n) ? n.toFixed(2) : '-';
      },
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },

    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: unknown) => {
        const st = String(v || 'pending').trim().toLowerCase();
        if (st === 'completed') return <Tag color="default">已完成</Tag>;
        return <Tag color="warning">待完成</Tag>;
      },
    },

    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 160,
      render: (v: unknown) => {
        const raw = String(v ?? '').trim();
        if (!raw) return '-';
        return formatDateTime(v) || '-';
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (v: unknown) => {
        const raw = String(v ?? '').trim();
        if (!raw) return '-';
        return formatDateTime(v) || '-';
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      fixed: 'right',
      render: (_: any, record: MaterialDatabase) => {
        const isCompleted = record.status === 'completed';
        const moreItems = (() => {
          const items: MenuProps['items'] = [];
          if (!isCompleted) {
            items.push({
              key: 'complete',
              label: '标记完成',
              onClick: () => void handleMaterialDatabaseComplete(record),
            });
            items.push({
              key: 'delete',
              label: '删除',
              danger: true,
              onClick: () => void handleMaterialDatabaseDelete(record),
            });
          }
          if (isCompleted) {
            items.push({
              key: 'return',
              label: '退回编辑',
              danger: true,
              onClick: () => void handleMaterialDatabaseReturn(record),
            });
          }
          return items;
        })();

        return (
          <RowActions
            actions={[
              {
                key: 'edit',
                label: '编辑',
                title: isCompleted ? '已完成，需先退回后编辑' : '编辑',
                icon: <EditOutlined />,
                disabled: isCompleted,
                onClick: () => openMaterialDatabaseDialog('edit', record),
                primary: true,
              },
              ...(moreItems.length
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: moreItems,
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  const detailFrozen = isOrderFrozenForRecord(detailOrder || currentPurchase);

  return (
    <Layout>
      {contextHolder}
      <div>
        <Card className="page-card">
          {/* 页签切换 */}
          <Tabs
            activeKey="purchase"
            items={[
              {
                key: 'purchase',
                label: '面料采购',
                children: (
                  <div>
                    {/* 页面标题和操作区 */}
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
                          <QuestionCircleOutlined style={{ color: '#999', cursor: 'pointer' }} />
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
                              params: {
                                page: 1,
                                pageSize: 1,
                                orderNo: targetOrderNo,
                              }
                            });
                            const orderResult = orderRes;
                            const records = orderResult?.data?.records || [];
                            if (orderResult.code !== 200 || !records.length) {
                              message.error(orderResult?.message || '未找到该订单');
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

                    {/* 筛选区 */}
                    <Card size="small" className="filter-card mb-sm">
                      <Form layout="inline" size="small">
                        <Form.Item label="面料辅料类型">
                          <Select
                            placeholder="请选择面料辅料类型"
                            value={queryParams.materialType || ''}
                            onChange={(value) => setQueryParams({ ...queryParams, materialType: value, page: 1 })}
                            style={{ width: 160 }}
                          >
                            <Option value="">全部</Option>
                            <Option value="fabric">面料</Option>
                            <Option value="fabricA">面料A</Option>
                            <Option value="fabricB">面料B</Option>
                            <Option value="fabricC">面料C</Option>
                            <Option value="fabricD">面料D</Option>
                            <Option value="fabricE">面料E</Option>
                            <Option value="lining">里料</Option>
                            <Option value="liningA">里料A</Option>
                            <Option value="liningB">里料B</Option>
                            <Option value="liningC">里料C</Option>
                            <Option value="liningD">里料D</Option>
                            <Option value="liningE">里料E</Option>
                            <Option value="accessory">辅料</Option>
                            <Option value="accessoryA">辅料A</Option>
                            <Option value="accessoryB">辅料B</Option>
                            <Option value="accessoryC">辅料C</Option>
                            <Option value="accessoryD">辅料D</Option>
                            <Option value="accessoryE">辅料E</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item label="订单号">
                          <Input
                            placeholder="请输入订单号"
                            value={queryParams.orderNo}
                            onChange={(e) => setQueryParams({ ...queryParams, orderNo: e.target.value })}
                            style={{ width: 150 }}
                          />
                        </Form.Item>
                        <Form.Item label="采购单号">
                          <Input
                            placeholder="请输入采购单号"
                            onChange={(e) => setQueryParams({ ...queryParams, purchaseNo: e.target.value })}
                            style={{ width: 150 }}
                          />
                        </Form.Item>
                        <Form.Item label="物料编码">
                          <Input
                            placeholder="请输入物料编码"
                            onChange={(e) => setQueryParams({ ...queryParams, materialCode: e.target.value })}
                            style={{ width: 120 }}
                          />
                        </Form.Item>
                        <Form.Item label="物料名称">
                          <Input
                            placeholder="请输入物料名称"
                            onChange={(e) => setQueryParams({ ...queryParams, materialName: e.target.value })}
                            style={{ width: 120 }}
                          />
                        </Form.Item>
                        <Form.Item label="供应商">
                          <Input
                            placeholder="请输入供应商"
                            onChange={(e) => setQueryParams({ ...queryParams, supplier: e.target.value })}
                            style={{ width: 120 }}
                          />
                        </Form.Item>
                        <Form.Item label="状态">
                          <Select
                            placeholder="请选择状态"
                            onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                            style={{ width: 100 }}
                          >
                            <Option value="">全部</Option>
                            <Option value="pending">待采购</Option>
                            <Option value="received">已领取</Option>
                            <Option value="partial">部分到货</Option>
                            <Option value="completed">全部到货</Option>
                            <Option value="cancelled">已取消</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item label="来源">
                          <Select
                            placeholder="请选择来源"
                            value={queryParams.sourceType || ''}
                            onChange={(value) => setQueryParams({ ...queryParams, sourceType: value, page: 1 })}
                            style={{ width: 100 }}
                          >
                            <Option value="">全部</Option>
                            <Option value="order">订单</Option>
                            <Option value="sample">样衣</Option>
                          </Select>
                        </Form.Item>
                        <Form.Item className="filter-actions">
                          <Space>
                            <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchMaterialPurchaseList()}>
                              查询
                            </Button>
                            <Button onClick={() => {
                              const params = new URLSearchParams(location.search);
                              const orderNo = (params.get('orderNo') || '').trim();
                              setQueryParams({ page: 1, pageSize: 10, orderNo, materialType: '' });
                            }}>
                              重置
                            </Button>
                          </Space>
                        </Form.Item>
                      </Form>
                    </Card>

                    {/* 表格区 */}
                    <ResizableTable<MaterialPurchaseType>
                      columns={purchaseColumns}
                      dataSource={sortedPurchaseList}
                      rowKey="id"
                      loading={loading}
                      scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
                      size={isMobile ? 'small' : 'middle'}
                      pagination={{
                        current: queryParams.page,
                        pageSize: queryParams.pageSize,
                        total: total,
                        onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
                        showTotal: (total) => `共 ${total} 条`,
                        showSizeChanger: true,
                        size: isMobile ? 'small' : 'default',
                      }}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>

        {/* 采购单详情弹窗 */}
        <ResizableModal
          title={dialogMode === 'preview' ? '采购清单预览' : dialogMode === 'create' ? '新增采购单' : '采购单详情'}
          open={visible}
          onCancel={closeDialog}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          tableDensity={isMobile ? 'dense' : 'auto'}
          footer={
            dialogMode === 'view'
              ? [
                <Button
                  key="receiveAll"
                  disabled={!detailPurchases.some((p) => p.status === 'pending')}
                  loading={submitLoading}
                  onClick={async () => {
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
                      // Intentionally empty
                      // 忽略错误
                      message.error('领取失败');
                    } finally {
                      setSubmitLoading(false);
                    }
                  }}
                >
                  采购领取
                </Button>,
                <Button
                  key="returnAll"
                  disabled={!detailPurchases.some((p) => p.status === 'received' || p.status === 'partial' || p.status === 'completed')}
                  loading={submitLoading}
                  onClick={async () => {
                    const targets = detailPurchases.filter((p) =>
                      (p.status === 'received' || p.status === 'partial' || p.status === 'completed')
                      && String(p.id || '').trim()
                      && Number(p.returnConfirmed || 0) !== 1
                    );
                    if (!targets.length) {
                      message.info('没有可回料确认的采购任务');
                      return;
                    }

                    openReturnConfirm(targets);
                  }}
                >
                  回料确认
                </Button>,
                <Dropdown
                  key="sheet"
                  trigger={['click']}
                  menu={{
                    items: [
                      {
                        key: 'print',
                        label: '打印采购单',
                        onClick: () => openPurchaseSheet(true),
                      },
                      {
                        key: 'download',
                        label: '下载采购单',
                        onClick: () => downloadPurchaseSheet(),
                      },
                    ],
                  }}
                >
                  <Button disabled={detailLoading || !detailPurchases.length}>
                    采购单生成
                  </Button>
                </Dropdown>,
                <Button key="close" type="primary" onClick={closeDialog}>
                  关闭
                </Button>
              ]
              : dialogMode === 'preview'
                ? [
                  <Button key="cancel" onClick={closeDialog}>
                    取消
                  </Button>,
                  <Button
                    key="submit"
                    type="primary"
                    loading={submitLoading}
                    onClick={async () => {
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
                    }}
                  >
                    保存生成
                  </Button>
                ]
                : [
                  <Button key="cancel" onClick={closeDialog}>
                    取消
                  </Button>,
                  <Button key="submit" type="primary" onClick={() => handleSubmit()} loading={submitLoading}>
                    保存
                  </Button>
                ]
          }
        >
          {dialogMode === 'preview' ? (
            <div className="purchase-preview">
              <ResizableTable
                columns={[
                  {
                    title: '图片',
                    dataIndex: 'styleCover',
                    key: 'styleCover',
                    width: 72,
                    render: (_: any, record: any) => (
                      <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} src={record.styleCover || null} size={48} borderRadius={6} />
                    )
                  },
                  {
                    title: '订单号',
                    dataIndex: 'orderNo',
                    key: 'orderNo',
                    width: 120,
                    render: (v: unknown) => (
                      <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>
                    ),
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    key: 'styleNo',
                    width: 100,
                    ellipsis: true,
                  },
                  {
                    title: '款名',
                    dataIndex: 'styleName',
                    key: 'styleName',
                    width: 140,
                    ellipsis: true,
                  },
                  {
                    title: '附件',
                    key: 'attachments',
                    width: 100,
                    render: (_: any, record: any) => (
                      <StyleAttachmentsButton
                        styleId={record.styleId}
                        styleNo={record.styleNo}
                        modalTitle={record.styleNo ? `放码纸样（${record.styleNo}）` : '放码纸样'}
                        onlyGradingPattern={true}
                      />
                    )
                  },
                  {
                    title: '面料辅料类型',
                    dataIndex: 'materialType',
                    key: 'materialType',
                    width: 120,
                    render: (v: unknown) => {
                      const type = String(v || '').trim();
                      const category = getMaterialTypeCategory(type);
                      const text = getMaterialTypeLabel(type);
                      const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
                      return <Tag color={color}>{text}</Tag>;
                    },
                  },
                  {
                    title: '物料编码',
                    dataIndex: 'materialCode',
                    key: 'materialCode',
                  },
                  {
                    title: '物料名称',
                    dataIndex: 'materialName',
                    key: 'materialName',
                  },
                  {
                    title: '规格',
                    dataIndex: 'specifications',
                    key: 'specifications',
                  },
                  {
                    title: '单位',
                    dataIndex: 'unit',
                    key: 'unit',
                  },
                  {
                    title: '采购数量',
                    dataIndex: 'purchaseQuantity',
                    key: 'purchaseQuantity',
                    align: 'right' as const,
                  },
                  {
                    title: '供应商',
                    dataIndex: 'supplierName',
                    key: 'supplierName',
                  },
                ]}
                dataSource={previewList}
                rowKey={(_, index) => index || 0}
                pagination={false}
                scroll={{ x: 'max-content', y: 420 }}
                size={isMobile ? 'small' : 'middle'}
              />
              <div className="mt-sm" style={{ color: '#999' }}>
                小提示：保存生成后可在列表中查看并补充单价等信息
              </div>
            </div>
          ) : (
            dialogMode === 'view' ? (
              <div className="purchase-detail-view">
                <ProductionOrderHeader
                  orderNo={currentPurchase?.orderNo}
                  styleNo={currentPurchase?.styleNo}
                  styleName={currentPurchase?.styleName}
                  styleId={currentPurchase?.styleId}
                  styleCover={currentPurchase?.styleCover}
                  color={String(detailOrder?.color || '').trim() || buildColorSummary(detailOrderLines) || ''}
                  sizeItems={detailSizePairs.map((x) => ({ size: x.size, quantity: x.quantity }))}
                  totalQuantity={getOrderQtyTotal(detailOrderLines)}
                  qrCodeValue={currentPurchase?.orderNo
                    ? JSON.stringify({
                      type: 'order',
                      orderNo: currentPurchase.orderNo,
                      styleNo: currentPurchase.styleNo,
                      styleName: currentPurchase.styleName,
                      purchaseCount: detailPurchases.length,
                    })
                    : ''}
                  coverSize={160}
                  qrSize={120}
                />

                <Card
                  size="small"
                  title="需要采购的面辅料（只读）"
                  loading={detailLoading}
                  extra={
                    <Space>
                      <Button
                        size="small"
                        type="primary"
                        disabled={detailFrozen || !detailPurchases.some((p) => p.status === 'pending')}
                        onClick={async () => {
                          if (detailFrozen) return;
                          const orderKey = String(currentPurchase?.orderId || currentPurchase?.orderNo || detailOrder?.id || detailOrder?.orderNo || '').trim();
                          if (orderKey) {
                            const ok = await ensureOrderUnlocked(orderKey);
                            if (!ok) return;
                          }
                          const targets = detailPurchases.filter((p) => p.status === 'pending' && String(p.id || '').trim());
                          if (!targets.length) {
                            message.info('没有待领取的采购任务');
                            return;
                          }
                          try {
                            const res = await api.post('/production/purchase/batch-receive', {
                              purchaseIds: targets.map((t) => t.id),
                            });
                            const result = res as Record<string, unknown>;
                            if (result.code === 200) {
                              message.success(`成功领取${targets.length}个采购任务`);
                              const no = String(currentPurchase?.orderNo || '').trim();
                              if (no) loadDetailByOrderNo(no);
                              fetchMaterialPurchaseList();
                            } else {
                              message.error(String(result.message || '领取失败'));
                            }
                          } catch (e) {
                            message.error('领取失败');
                          }
                        }}
                      >
                        一键领取全部
                      </Button>
                      <Button
                        size="small"
                        disabled={detailFrozen || !detailPurchases.some((p) => p.status === 'received' || p.status === 'partial' || p.status === 'completed')}
                        onClick={() => {
                          const targets = detailPurchases.filter((p) =>
                            (p.status === 'received' || p.status === 'partial' || p.status === 'completed') &&
                            Number(p?.returnConfirmed || 0) !== 1 &&
                            String(p?.id || '').trim()
                          );
                          if (!targets.length) {
                            message.info('没有可回料确认的采购任务');
                            return;
                          }
                          void openReturnConfirm(targets);
                        }}
                      >
                        批量回料确认
                      </Button>
                    </Space>
                  }
                >
                  {(() => {
                    const sections = ([
                      { key: 'fabric', title: '面料' },
                      { key: 'lining', title: '里料' },
                      { key: 'accessory', title: '辅料' },
                    ] as const)
                      .map((sec) => {
                        const data = detailPurchases.filter((p) => getMaterialTypeCategory(p.materialType) === sec.key);
                        return { ...sec, data };
                      })
                      .filter((x) => x.data.length > 0);

                    const items = sections.map((sec) => ({
                      key: sec.key,
                      label: `${sec.title}（${sec.data.length}）`,
                      children: (
                        <ResizableTable<MaterialPurchaseType>
                          rowKey={(r: MaterialPurchaseType) => String(r.id || `${r.purchaseNo}-${r.materialType}-${r.materialCode}`)}
                          dataSource={sec.data}
                          pagination={false}
                          size={isMobile ? 'small' : 'middle'}
                          scroll={{ x: 'max-content', y: 320 }}
                          columns={[
                            {
                              title: '二维码',
                              key: 'qrcode',
                              width: 100,
                              align: 'center' as const,
                              render: (_: any, record: any) => {
                                const qrValue = {
                                  purchaseNo: record.purchaseNo,
                                  materialCode: record.materialCode,
                                  materialName: record.materialName,
                                  materialType: record.materialType,
                                  id: record.id
                                };
                                return (
                                  <QRCodeBox
                                    value={qrValue}
                                    size={60}
                                    variant="default"
                                  />
                                );
                              },
                            },
                            {
                              title: '类型',
                              dataIndex: 'materialType',
                              key: 'materialType',
                              width: 110,
                              render: (v: unknown) => {
                                const type = String(v || '').trim();
                                const category = getMaterialTypeCategory(type);
                                const text = getMaterialTypeLabel(type);
                                const color = category === 'accessory' ? 'purple' : category === 'lining' ? 'cyan' : 'geekblue';
                                return <Tag color={color}>{text}</Tag>;
                              },
                            },
                            { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: unknown) => v || '-' },
                            { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: unknown) => v || '-' },
                            { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 140, ellipsis: true, render: (v: unknown) => v || '-' },
                            { title: '单位', dataIndex: 'unit', key: 'unit', width: 80, render: (v: unknown) => v || '-' },
                            { title: '采购数量', dataIndex: 'purchaseQuantity', key: 'purchaseQuantity', width: 110, align: 'right' as const, render: (v: unknown) => Number(v) || 0 },
                            { title: '到货数量', dataIndex: 'arrivedQuantity', key: 'arrivedQuantity', width: 110, align: 'right' as const, render: (v: unknown) => Number(v) || 0 },
                            {
                              title: '单价(元)',
                              dataIndex: 'unitPrice',
                              key: 'unitPrice',
                              width: 110,
                              align: 'right' as const,
                              render: (v: unknown) => {
                                const n = Number(v);
                                return Number.isFinite(n) ? n.toFixed(2) : '-';
                              },
                            },
                            {
                              title: '金额(元)',
                              dataIndex: 'totalAmount',
                              key: 'totalAmount',
                              width: 120,
                              align: 'right' as const,
                              render: (v: any, r: any) => {
                                const qty = Number(r?.arrivedQuantity ?? 0);
                                const price = Number(r?.unitPrice);
                                if (Number.isFinite(qty) && Number.isFinite(price)) return (qty * price).toFixed(2);
                                const n = Number(v);
                                return Number.isFinite(n) ? n.toFixed(2) : '-';
                              },
                            },
                            { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 140, ellipsis: true, render: (v: unknown) => v || '-' },
                            {
                              title: '状态',
                              dataIndex: 'status',
                              key: 'status',
                              width: 100,
                              render: (status: MaterialPurchaseType['status']) => {
                                const { text, color } = getStatusConfig(status);
                                return <Tag color={color}>{text}</Tag>;
                              },
                            },
                            {
                              title: <SortableColumnTitle
                                title="回料时间"
                                sortField={sortField}
                                fieldName="returnConfirmTime"
                                sortOrder={sortOrder}
                                onSort={handleSort}
                                align="left"
                              />,
                              dataIndex: 'returnConfirmTime',
                              key: 'returnConfirmTime',
                              width: 160,
                              render: (v: any, r: any) => (Number(r?.returnConfirmed || 0) === 1 ? (formatDateTime(v) || '-') : '-'),
                            },
                            { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true, render: (v: unknown) => v || '-' },
                            {
                              title: '确认',
                              key: 'confirm',
                              width: 140,
                              render: (_: any, record: MaterialPurchaseType) => {
                                const frozen = isOrderFrozenForRecord(record);
                                return (
                                  <Space size={4}>
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={frozen || record.status !== 'pending'}
                                      onClick={() => receivePurchaseTask(record)}
                                    >
                                      领取
                                    </Button>
                                    <Button
                                      type="link"
                                      size="small"
                                      disabled={
                                        frozen
                                        || !(record.status === 'received' || record.status === 'partial' || record.status === 'completed')
                                        || Number(record?.returnConfirmed || 0) === 1
                                      }
                                      onClick={() => confirmReturnPurchaseTask(record)}
                                    >
                                      {Number(record?.returnConfirmed || 0) === 1 ? '已回料' : '回料确认'}
                                    </Button>
                                    {Number(record?.returnConfirmed || 0) === 1 && (
                                      <Button
                                        type="link"
                                        size="small"
                                        disabled={frozen || !isSupervisorOrAbove}
                                        onClick={() => void openReturnReset(record)}
                                      >
                                        退回
                                      </Button>
                                    )}
                                  </Space>
                                );
                              },
                            },
                          ]}
                        />
                      ),
                    }));

                    if (!items.length) return null;

                    return (
                      <Collapse
                        size="small"
                        collapsible="icon"
                        items={items}
                      />
                    );
                  })()}
                </Card>
              </div>
            ) : (
              <Form
                form={form}
                layout="horizontal"
                labelCol={{ span: 8 }}
                wrapperCol={{ span: 16 }}
              >
                <Row gutter={[16, 0]}>
                  <Col xs={24} lg={12}>
                    <Form.Item label="图片">
                      {watchedStyleCover ? (
                        <img
                          src={watchedStyleCover}
                          alt=""
                          style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, display: 'block' }}
                        />
                      ) : (
                        <div style={{ width: 96, height: 96, background: '#f5f5f5', borderRadius: 6 }} />
                      )}
                    </Form.Item>
                    <Form.Item name="purchaseNo" label="采购单号">
                      <Input disabled placeholder="自动生成" />
                    </Form.Item>
                    <Form.Item name="styleNo" label="款号">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="styleName" label="款名">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="materialType" label="面料辅料类型" rules={[{ required: true, message: '请选择面料辅料类型' }]}>
                      <Select>
                        <Option value="fabricA">面料A</Option>
                        <Option value="fabricB">面料B</Option>
                        <Option value="fabricC">面料C</Option>
                        <Option value="fabricD">面料D</Option>
                        <Option value="fabricE">面料E</Option>
                        <Option value="liningA">里料A</Option>
                        <Option value="liningB">里料B</Option>
                        <Option value="liningC">里料C</Option>
                        <Option value="liningD">里料D</Option>
                        <Option value="liningE">里料E</Option>
                        <Option value="accessoryA">辅料A</Option>
                        <Option value="accessoryB">辅料B</Option>
                        <Option value="accessoryC">辅料C</Option>
                        <Option value="accessoryD">辅料D</Option>
                        <Option value="accessoryE">辅料E</Option>
                      </Select>
                    </Form.Item>
                    <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="specifications" label="规格">
                      <Input />
                    </Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请输入单位' }]}>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col xs={24} lg={12}>
                    <Form.Item name="orderNo" label="订单号">
                      <Input disabled />
                    </Form.Item>
                    <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '请输入采购数量' }]}>
                      <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="arrivedQuantity" label="到货数量">
                      <InputNumber style={{ width: '100%' }} min={0} />
                    </Form.Item>
                    <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}>
                      <Input />
                    </Form.Item>
                    <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '请输入单价' }]}>
                      <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
                    </Form.Item>
                    <Form.Item name="totalAmount" label="金额(元)">
                      <InputNumber disabled style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
                      <Select>
                        <Option value="pending">待采购</Option>
                        <Option value="partial">部分到货</Option>
                        <Option value="completed">全部到货</Option>
                        <Option value="cancelled">已取消</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name="remark" label="备注">
                  <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
                </Form.Item>
              </Form>
            )
          )}
        </ResizableModal>

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
            <div style={{ marginBottom: 12, color: '#1f1f1f' }}>
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
                          <div style={{ fontWeight: 600, color: '#1f1f1f' }}>{String(t?.materialName || '-')}</div>
                          <div style={{ fontSize: 'var(--font-size-sm)', color: '#8c8c8c' }}>{String(t?.materialCode || '')}</div>
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

        {/* 快速编辑弹窗 */}
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
