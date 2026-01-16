import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Col, Collapse, Form, Image, Input, InputNumber, Modal, Row, Select, Space, Table, Tag, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import { PlusOutlined, SearchOutlined, EyeOutlined, InboxOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/ResizableModal';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import { ProductWarehousing as WarehousingType, ProductionOrder, WarehousingQueryParams } from '../../types/production';
import api, { ensureProductionOrderUnlocked, primeProductionOrderFrozenCache } from '../../utils/api';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import { useLocation } from 'react-router-dom';
import './styles.css';

const { Option } = Select;

const COVER_SIZE = 120;
const MAX_UNQUALIFIED_IMAGES = 4;
const MAX_UNQUALIFIED_IMAGE_MB = 5;
const BATCH_LIST_MAX_HEIGHT = 360;

type CuttingBundleRow = {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleId?: string;
  styleNo?: string;
  color?: string;
  size?: string;
  quantity?: number;
  bundleNo?: number;
  qrCode?: string;
  status?: string;
};

type BatchSelectBundleRow = {
  key: string;
  qr: string;
  bundleNo?: number;
  color?: string;
  size?: string;
  quantity?: number;
  statusText: string;
  disabled?: boolean;
  rawStatus?: string;
};

type SizeQuantityRow = {
  key: string;
  qr: string;
  size: string;
  quantity: number;
};

const isBundleBlockedForWarehousing = (rawStatus: any) => {
  const status = String(rawStatus || '').trim();
  if (!status) return false;
  const s = status.toLowerCase();

  const isRepaired =
    s === 'repaired' ||
    status === '返修完成' ||
    status === '已返修' ||
    status === '返修合格' ||
    status === '已修复';

  const isUnqualified =
    s === 'unqualified' ||
    status === '不合格' ||
    status === '次品' ||
    status === '次品待返修' ||
    status === '待返修';

  if (isRepaired) return false;
  return isUnqualified;
};

const parseUrlsValue = (value: any): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v || '').trim()).filter(Boolean);
    }
  } catch {
  }
  return raw
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
};

const toUploadFileList = (urls: string[]): UploadFile[] => {
  return urls
    .map((u, idx) => {
      const url = String(u || '').trim();
      if (!url) return null;
      return {
        uid: `u-${idx}-${url}`,
        name: `图片${idx + 1}`,
        status: 'done',
        url,
      } as UploadFile;
    })
    .filter(Boolean) as UploadFile[];
};

const ProductWarehousing: React.FC = () => {
  const location = useLocation();
  const [visible, setVisible] = useState(false);
  const [currentWarehousing, setCurrentWarehousing] = useState<WarehousingType | null>(null);
  const [queryParams, setQueryParams] = useState<WarehousingQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [form] = Form.useForm();

  // 真实数据状态
  const [warehousingList, setWarehousingList] = useState<WarehousingType[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [submitLoading, setSubmitLoading] = useState(false);

  const orderFrozenCacheRef = useRef<Map<string, boolean>>(new Map());
  const [orderFrozenVersion, setOrderFrozenVersion] = useState(0);

  const [orderOptions, setOrderOptions] = useState<ProductionOrder[]>([]);
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(false);

  const [qualifiedWarehousedBundleQrs, setQualifiedWarehousedBundleQrs] = useState<string[]>([]);

  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);

  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);

  const [batchSelectedBundleQrs, setBatchSelectedBundleQrs] = useState<string[]>([]);
  const [batchQtyByQr, setBatchQtyByQr] = useState<Record<string, number>>({});

  const [detailWarehousingItems, setDetailWarehousingItems] = useState<WarehousingType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  const watchedStyleId = Form.useWatch('styleId', form);
  const watchedBundleQr = Form.useWatch('cuttingBundleQrCode', form);
  const watchedWarehousingQty = Form.useWatch('warehousingQuantity', form);

  const modalWidth = useMemo(() => {
    if (typeof window === 'undefined') return '60vw';
    const w = window.innerWidth;
    if (w < 768) return '96vw';
    if (w < 1024) return '66vw';
    return '60vw';
  }, []);

  const modalInitialHeight = useMemo(() => {
    if (typeof window === 'undefined') return 520;
    const w = window.innerWidth;
    const ratio = w < 768 ? 0.86 : w < 1024 ? 0.78 : 0.72;
    return Math.round(window.innerHeight * ratio);
  }, []);

  const singleSelectedQr = useMemo(() => {
    if (batchSelectedBundleQrs.length !== 1) return '';
    return String(batchSelectedBundleQrs[0] || '').trim();
  }, [batchSelectedBundleQrs]);

  const singleSelectedBundle = useMemo(() => {
    if (!singleSelectedQr) return null;
    return bundles.find((b) => String(b.qrCode || '').trim() === singleSelectedQr) || null;
  }, [bundles, singleSelectedQr]);

  const qualifiedWarehousedBundleQrSet = useMemo(() => {
    return new Set(
      qualifiedWarehousedBundleQrs
        .map((v) => String(v || '').trim())
        .filter(Boolean)
    );
  }, [qualifiedWarehousedBundleQrs]);

  const fetchOrderOptions = async () => {
    setOrderOptionsLoading(true);
    try {
      const res = await api.get<any>('/production/order/list', { params: { page: 1, pageSize: 5000 } });
      const result = res as any;
      if (result.code === 200) {
        const records: ProductionOrder[] = result.data.records || [];
        setOrderOptions(records);
      } else {
        setOrderOptions([]);
        message.error(result.message || '获取订单列表失败');
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
    if (!on) {
      setBundles([]);
      return;
    }
    try {
      const res = await api.get<any>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      const result = res as any;
      if (result.code === 200) {
        setBundles((result.data?.records || []) as CuttingBundleRow[]);
      } else {
        setBundles([]);
      }
    } catch {
      setBundles([]);
    }
  };

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await ensureProductionOrderUnlocked(orderId, orderFrozenCacheRef.current, {
      rule: 'statusOrStock',
      acceptAnyData: true,
      onCacheUpdated: () => setOrderFrozenVersion((v) => v + 1),
      onFrozen: () => message.error('订单已完成，无法操作'),
    });
  };

  const isOrderFrozenById = (orderId: any) => {
    void orderFrozenVersion;
    const oid = String(orderId || '').trim();
    if (!oid) return false;
    return orderFrozenCacheRef.current.get(oid) === true;
  };

  useEffect(() => {
    const ids = Array.from(
      new Set(
        warehousingList
          .map((r: any) => String(r?.orderId || '').trim())
          .filter(Boolean)
      )
    );
    const missing = ids.filter((id) => !orderFrozenCacheRef.current.has(id));
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      await Promise.allSettled(
        missing
          .slice(0, 50)
          .map((id) =>
            primeProductionOrderFrozenCache(id, orderFrozenCacheRef.current, {
              rule: 'statusOrStock',
              acceptAnyData: true,
            })
          )
      );
      if (!cancelled) setOrderFrozenVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [warehousingList]);

  const fetchQualifiedWarehousedBundleQrsByOrderId = async (orderId: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) {
      setQualifiedWarehousedBundleQrs([]);
      return;
    }
    try {
      const res = await api.get<any>('/production/warehousing/list', {
        params: { page: 1, pageSize: 10000, orderId: oid },
      });
      const result = res as any;
      if (result.code === 200) {
        const records = (result.data?.records || []) as any[];
        const whNo = String(records?.[0]?.warehousingNo || '').trim();
        form.setFieldsValue({ warehousingNo: whNo || undefined });
        const qrs = records
          .filter((r) => {
            const q = Number(r?.qualifiedQuantity || 0) || 0;
            if (q <= 0) return false;
            const qs = String(r?.qualityStatus || '').trim().toLowerCase();
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

  const loadWarehousingDetail = async (warehousing: WarehousingType) => {
    const warehousingNo = String((warehousing as any)?.warehousingNo || '').trim();
    const orderId = String((warehousing as any)?.orderId || '').trim();
    const orderNo = String((warehousing as any)?.orderNo || '').trim();

    setDetailLoading(true);
    try {
      let records: WarehousingType[] = [];

      if (warehousingNo || orderId) {
        const res = await api.get<any>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            ...(warehousingNo ? { warehousingNo } : {}),
            ...(!warehousingNo && orderId ? { orderId } : {}),
          },
        });
        const result = res as any;
        if (result.code === 200) {
          records = (result.data?.records || []) as WarehousingType[];
        }
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

  // 获取质检入库列表
  const fetchWarehousingList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/production/warehousing/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setWarehousingList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取质检入库列表失败');
      }
    } catch (error) {
      message.error('获取质检入库列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteProduction = async (orderId?: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) {
      message.error('缺少订单ID');
      return;
    }
    if (!(await ensureOrderUnlockedById(oid))) return;
    try {
      const res = await api.post<any>('/production/order/complete', {
        id: oid,
        tolerancePercent: 0.1,
      });
      const result = res as any;
      if (result.code === 200) {
        message.success('入库完成');
        fetchWarehousingList();
        fetchOrderOptions();
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (e) {
      message.error((e as Error).message || '操作失败');
    }
  };

  // 页面加载时获取质检入库列表
  useEffect(() => {
    fetchWarehousingList();
  }, [queryParams]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const styleNo = (params.get('styleNo') || '').trim();
    const orderNo = (params.get('orderNo') || '').trim();
    if (styleNo || orderNo) {
      setQueryParams((prev) => ({
        ...prev,
        page: 1,
        styleNo: styleNo || prev.styleNo,
        orderNo: orderNo || prev.orderNo,
      }));
    }
  }, [location.search]);

  useEffect(() => {
    fetchOrderOptions();
  }, []);

  const openDialog = (warehousing?: WarehousingType) => {
    setCurrentWarehousing(warehousing || null);
    setBundles([]);
    setQualifiedWarehousedBundleQrs([]);
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
    setDetailWarehousingItems([]);
    setDetailLoading(false);

    if (warehousing) {
      form.setFieldsValue({
        ...warehousing,
        createTime: formatDateTime((warehousing as any)?.createTime),
      });
      const urls = parseUrlsValue((warehousing as any)?.unqualifiedImageUrls);
      setUnqualifiedFileList(toUploadFileList(urls));
      setVisible(true);
      loadWarehousingDetail(warehousing);
      return;
    }

    fetchOrderOptions();
    form.resetFields();
    form.setFieldsValue({
      unqualifiedQuantity: 0,
      qualifiedQuantity: undefined,
      qualityStatus: 'qualified',
      unqualifiedImageUrls: '[]',
      repairRemark: '',
    });
    setUnqualifiedFileList([]);
    setVisible(true);
  };

  const closeDialog = () => {
    setVisible(false);
    setCurrentWarehousing(null);
    form.resetFields();
    setBundles([]);
    setUnqualifiedFileList([]);
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
    setDetailWarehousingItems([]);
    setDetailLoading(false);
  };

  const handleBatchQualifiedSubmit = async () => {
    if (!batchSelectedBundleQrs.length) {
      message.warning('请先添加菲号');
      return;
    }
    try {
      setSubmitLoading(true);
      const values = await form.validateFields(['orderId', 'warehouse']);

      if (!(await ensureOrderUnlockedById(values.orderId))) return;

      const items = batchSelectedBundleQrs
        .map((qr) => {
          const qty = Number(batchQtyByQr[qr] || 0) || 0;
          return { cuttingBundleQrCode: qr, warehousingQuantity: qty };
        })
        .filter((it) => (Number(it.warehousingQuantity || 0) || 0) > 0);

      if (!items.length) {
        message.error('质检数量必须大于0');
        return;
      }

      const res = await api.post<any>('/production/warehousing/batch', {
        orderId: values.orderId,
        warehouse: values.warehouse,
        warehousingType: 'manual',
        items,
      });
      const result = res as any;
      if (result.code === 200) {
        message.success('批量合格质检成功');
        closeDialog();
        fetchWarehousingList();
      } else {
        message.error(result.message || '批量入库失败');
      }
    } catch (error) {
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '批量入库失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  // 表单提交
  const handleSubmit = async () => {
    try {
      setSubmitLoading(true);
      const values = await form.validateFields();

      if (!(await ensureOrderUnlockedById(values.orderId))) return;

      const urls = unqualifiedFileList
        .map((f) => String((f as any)?.url || '').trim())
        .filter(Boolean)
        .slice(0, 4);
      const warehousingQty = Number(values.warehousingQuantity || 0) || 0;
      const unqualifiedQty = Math.max(0, Math.min(warehousingQty, Number(values.unqualifiedQuantity || 0) || 0));
      const qualifiedQty = Math.max(0, warehousingQty - unqualifiedQty);
      const qualityStatus = unqualifiedQty > 0 ? 'unqualified' : 'qualified';

      const payload = {
        ...values,
        unqualifiedQuantity: unqualifiedQty,
        qualifiedQuantity: qualifiedQty,
        warehousingQuantity: warehousingQty,
        qualityStatus,
        unqualifiedImageUrls: JSON.stringify(urls),
      };

      let response;
      if (currentWarehousing?.id) {
        // 编辑入库单
        response = await api.put('/production/warehousing', { ...payload, id: currentWarehousing.id });
      } else {
        // 新增质检入库
        response = await api.post('/production/warehousing', { ...payload, warehousingType: 'manual' });
      }

      const result = response as any;
      if (result.code === 200) {
        message.success(currentWarehousing?.id ? '编辑质检入库成功' : '新增质检入库成功');
        // 关闭弹窗
        closeDialog();
        // 刷新入库单列表
        fetchWarehousingList();
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      // 处理表单验证错误
      if ((error as any).errorFields) {
        const firstError = (error as any).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const getQualityStatusConfig = (status: WarehousingType['qualityStatus']) => {
    const statusMap = {
      qualified: { text: '合格', color: 'success' },
      unqualified: { text: '不合格', color: 'error' }
    };
    return statusMap[status];
  };

  const batchSelectRows = useMemo((): BatchSelectBundleRow[] => {
    return bundles
      .map((b) => {
        const qr = String(b.qrCode || '').trim();
        if (!qr) return null;
        const color = String(b.color || '').trim();
        const size = String(b.size || '').trim();
        const qty = Number(b.quantity || 0) || 0;
        const bundleNo = Number(b.bundleNo || 0) || 0;
        const rawStatus = String((b as any)?.status || '').trim();
        const isBlocked = isBundleBlockedForWarehousing(rawStatus);
        const isUsed = qualifiedWarehousedBundleQrSet.has(qr);
        const disabled = isBlocked || isUsed;

        let statusText = '';
        if (isUsed) {
          statusText = '已合格质检';
        } else if (rawStatus) {
          statusText = isBlocked ? '次品待返修' : rawStatus;
        } else {
          statusText = '可入库';
        }

        return {
          key: qr,
          qr,
          bundleNo: bundleNo || undefined,
          color: color || undefined,
          size: size || undefined,
          quantity: qty || 0,
          statusText,
          disabled,
          rawStatus,
        };
      })
      .filter(Boolean) as BatchSelectBundleRow[];
  }, [bundles, qualifiedWarehousedBundleQrSet]);

  const batchSelectableQrs = useMemo(() => {
    return batchSelectRows.filter((r) => !r.disabled).map((r) => r.qr);
  }, [batchSelectRows]);

  const handleBatchSelectionChange = (nextKeys: React.Key[], selectedRows: BatchSelectBundleRow[]) => {
    const nextQrs = nextKeys
      .map((k) => String(k || '').trim())
      .filter(Boolean);

    setBatchSelectedBundleQrs(nextQrs);
    setBatchQtyByQr((prev) => {
      const next: Record<string, number> = {};
      for (const qr of nextQrs) {
        const keep = Number(prev[qr] || 0) || 0;
        const row = selectedRows.find((r) => r.qr === qr) || batchSelectRows.find((r) => r.qr === qr);
        const maxQty = Math.max(0, Number(row?.quantity || 0) || 0);
        const base = keep > 0 ? keep : maxQty;
        next[qr] = Math.max(0, Math.min(maxQty || base, base));
      }
      return next;
    });
  };

  useEffect(() => {
    if (currentWarehousing) return;
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    if (!qrs.length) {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
        warehousingQuantity: undefined,
        qualifiedQuantity: undefined,
        unqualifiedQuantity: 0,
        qualityStatus: 'qualified',
      });
      return;
    }

    if (qrs.length === 1) {
      const qr = qrs[0];
      const b = bundles.find((x) => String(x.qrCode || '').trim() === qr) || null;
      form.setFieldsValue({
        cuttingBundleQrCode: qr,
        cuttingBundleId: (b as any)?.id,
        cuttingBundleNo: (b as any)?.bundleNo,
      });
    } else {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
      });
    }

    const total = qrs.reduce((sum, qr) => sum + (Number(batchQtyByQr[qr] || 0) || 0), 0);
    const baseUnq = qrs.length === 1 ? Number(form.getFieldValue('unqualifiedQuantity') || 0) || 0 : 0;
    const unq = qrs.length === 1 ? Math.max(0, Math.min(total, baseUnq)) : 0;
    const qual = Math.max(0, total - unq);
    form.setFieldsValue({
      warehousingQuantity: total,
      unqualifiedQuantity: unq,
      qualifiedQuantity: qual,
      qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
    });
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, currentWarehousing, form]);

  const bundleByQr = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String(b?.qrCode || '').trim();
      if (!qr) continue;
      m.set(qr, b);
    }
    return m;
  }, [bundles]);

  const sizeQuantityRows = useMemo((): SizeQuantityRow[] => {
    return detailWarehousingItems
      .map((it) => {
        const qr = String((it as any)?.cuttingBundleQrCode || '').trim();
        const b = qr ? bundleByQr.get(qr) : undefined;
        const size = String((b as any)?.size || '').trim() || '-';
        const qty = Number((it as any)?.warehousingQuantity || 0) || 0;
        return {
          key: String((it as any)?.id || qr || Math.random()),
          qr: qr || '-',
          size,
          quantity: qty,
        };
      })
      .sort((a, b) => {
        const bySize = a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
        if (bySize !== 0) return bySize;
        return a.qr.localeCompare(b.qr, 'zh-Hans-CN', { numeric: true });
      });
  }, [bundleByQr, detailWarehousingItems]);

  const handleBatchSelectAll = () => {
    const nextQrs = batchSelectableQrs.slice();
    const selectedRows = nextQrs
      .map((qr) => batchSelectRows.find((r) => r.qr === qr))
      .filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectInvert = () => {
    const current = new Set(batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean));
    const nextQrs = batchSelectableQrs.filter((qr) => !current.has(qr));
    const selectedRows = nextQrs
      .map((qr) => batchSelectRows.find((r) => r.qr === qr))
      .filter(Boolean) as BatchSelectBundleRow[];
    handleBatchSelectionChange(nextQrs, selectedRows);
  };

  const handleBatchSelectClear = () => {
    setBatchSelectedBundleQrs([]);
    setBatchQtyByQr({});
  };

  const uploadOneUnqualifiedImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_UNQUALIFIED_IMAGE_MB * 1024 * 1024) {
      message.error(`图片过大，最大${MAX_UNQUALIFIED_IMAGE_MB}MB`);
      return Upload.LIST_IGNORE;
    }
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post<any>('/common/upload', formData);
      const result = res as any;
      if (result.code !== 200) {
        message.error(result.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      const url = String(result.data || '').trim();
      if (!url) {
        message.error('上传失败');
        return Upload.LIST_IGNORE;
      }

      setUnqualifiedFileList((prev) => {
        const next = [...prev, { uid: `${Date.now()}-${Math.random()}`, name: file.name, status: 'done', url } as UploadFile].slice(0, MAX_UNQUALIFIED_IMAGES);
        form.setFieldsValue({
          unqualifiedImageUrls: JSON.stringify(
            next
              .map((f) => String((f as any)?.url || '').trim())
              .filter(Boolean)
              .slice(0, MAX_UNQUALIFIED_IMAGES)
          ),
        });
        return next;
      });
      message.success('上传成功');
    } catch (e: any) {
      message.error(e?.message || '上传失败');
    }
    return Upload.LIST_IGNORE;
  };


  // 表格列定义
  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={48} borderRadius={6} />
      )
    },
    {
      title: '质检入库号',
      dataIndex: 'warehousingNo',
      key: 'warehousingNo',
      width: 120,
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      ellipsis: true,
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} modalTitle={record.styleNo ? `附件（${record.styleNo}）` : '附件'} />
      )
    },
    {
      title: '质检数量',
      dataIndex: 'warehousingQuantity',
      key: 'warehousingQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '合格数量',
      dataIndex: 'qualifiedQuantity',
      key: 'qualifiedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '不合格数量',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '仓库',
      dataIndex: 'warehouse',
      key: 'warehouse',
      width: 80,
    },
    {
      title: '质检状态',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 100,
      render: (status: WarehousingType['qualityStatus']) => {
        const { text, color } = getQualityStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '质检时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as any)?.orderId || '').trim();
        const frozen = isOrderFrozenById(orderId);

        return (
          <RowActions
            actions={[
              {
                key: 'detail',
                label: '详情',
                title: '详情',
                icon: <EyeOutlined />,
                onClick: () => openDialog(record),
                primary: true,
              },
              {
                key: 'complete',
                label: '入库',
                title: '入库',
                icon: <InboxOutlined />,
                disabled: frozen || !orderId,
                onClick: () => handleCompleteProduction(orderId),
                primary: true,
              },
            ]}
          />
        );
      },
    },
  ];

  return (
    <Layout>
      <div className="warehousing-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">质检入库</h2>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
              新增质检入库
            </Button>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
              <Form.Item label="质检入库号">
                <Input
                  placeholder="请输入质检入库号"
                  onChange={(e) => setQueryParams({ ...queryParams, warehousingNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="订单号">
                <Input
                  placeholder="请输入订单号"
                  onChange={(e) => setQueryParams({ ...queryParams, orderNo: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="款号">
                <Input
                  placeholder="请输入款号"
                  onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value })}
                  style={{ width: 120 }}
                />
              </Form.Item>
              <Form.Item label="仓库">
                <Select
                  placeholder="请选择仓库"
                  onChange={(value) => setQueryParams({ ...queryParams, warehouse: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="A仓">A仓</Option>
                  <Option value="B仓">B仓</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchWarehousingList()}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    setQueryParams({ page: 1, pageSize: 10 });
                    fetchWarehousingList();
                  }}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格区 */}
          <ResizableTable
            columns={columns}
            dataSource={warehousingList}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            pagination={{
              current: queryParams.page,
              pageSize: queryParams.pageSize,
              total: total,
              onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
            }}
          />
        </Card>

        {/* 质检入库详情弹窗 */}
        <ResizableModal
          title={currentWarehousing ? '质检入库详情' : '新增质检入库'}
          open={visible}
          onCancel={closeDialog}
          onOk={handleSubmit}
          okText="保存"
          cancelText="取消"
          footer={currentWarehousing ? null : [
            <Button key="cancel" onClick={closeDialog}>
              取消
            </Button>,
            <Button
              key="batch"
              onClick={() => handleBatchQualifiedSubmit()}
              disabled={!batchSelectedBundleQrs.length}
              loading={submitLoading}
            >
              批量合格质检
            </Button>,
            <Button key="submit" type="primary" onClick={() => handleSubmit()} loading={submitLoading}>
              保存
            </Button>
          ]}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          scaleWithViewport
        >
          {currentWarehousing ? (
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="warehousingNo" label="质检入库号">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="orderNo" label="订单号">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="styleNo" label="款号">
                    <Input disabled />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="styleName" label="款名">
                    <Input disabled />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="warehousingQuantity" label="质检数量">
                    <InputNumber disabled style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="qualifiedQuantity" label="合格数量">
                    <InputNumber disabled style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="unqualifiedQuantity" label="不合格数量">
                    <InputNumber disabled style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="warehouse" label="仓库">
                    <Input disabled />
                  </Form.Item>
                </Col>

                <Col xs={24} sm={12} lg={6}>
                  <Form.Item name="qualityStatus" label="质检状态">
                    <Select disabled>
                      <Option value="qualified">合格</Option>
                      <Option value="unqualified">不合格</Option>
                    </Select>
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12} lg={18}>
                  <Form.Item name="createTime" label="质检时间">
                    <Input disabled />
                  </Form.Item>
                </Col>
              </Row>

              <div style={{ marginTop: 8 }}>
                <div className="wh-detail-box">
                  <Table
                    size="small"
                    rowKey="key"
                    loading={detailLoading}
                    pagination={false}
                    dataSource={sizeQuantityRows}
                    bordered
                    className="wh-detail-table"
                    columns={[
                      { title: '菲号', dataIndex: 'qr', key: 'qr', width: 260, ellipsis: true },
                      { title: '码数', dataIndex: 'size', key: 'size', width: 180 },
                      { title: '数量', dataIndex: 'quantity', key: 'quantity', align: 'right' as const, width: 160 },
                    ]}
                    summary={(pageData) => {
                      const totalQty = pageData.reduce((sum, r) => sum + (Number((r as any)?.quantity || 0) || 0), 0);
                      return (
                        <Table.Summary>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0}>汇总</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} />
                            <Table.Summary.Cell index={2} align="right">{totalQty}</Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      );
                    }}
                  />
                </div>
              </div>
            </Form>
          ) : (
            <Form
              form={form}
              layout="vertical"
            >
              <Form.Item name="orderNo" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="styleId" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="cuttingBundleId" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="cuttingBundleNo" hidden>
                <InputNumber />
              </Form.Item>
              <Form.Item name="cuttingBundleQrCode" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="qualityStatus" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="unqualifiedImageUrls" hidden>
                <Input />
              </Form.Item>

              <div className="wh-form-grid">
                <div className="wh-thumb">
                  <StyleCoverThumb styleId={watchedStyleId} size={COVER_SIZE} borderRadius={10} />
                </div>
                <div className="wh-lines">
                  <div className="wh-line">
                    <div className="wh-label">质检编号</div>
                    <div className="wh-control">
                      <Form.Item name="warehousingNo" style={{ marginBottom: 0 }}>
                        <Input placeholder="自动生成" disabled />
                      </Form.Item>
                    </div>
                  </div>

                  <div className="wh-line">
                    <div className="wh-label">订单号</div>
                    <div className="wh-control" style={{ flex: 1 }}>
                      <Form.Item name="orderId" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请选择订单号' }]}>
                        <Select
                          placeholder="请选择已裁剪的订单（裁剪数>0）"
                          showSearch
                          optionFilterProp="label"
                          loading={orderOptionsLoading}
                          notFoundContent={orderOptionsLoading ? '加载中…' : '暂无数据'}
                          options={orderOptions
                            .filter((o) => {
                              const st = String((o as any)?.status || '').trim().toLowerCase();
                              if (st === 'completed') return false;
                              const cuttingQty = Number((o as any)?.cuttingQuantity || 0) || 0;
                              return cuttingQty > 0;
                            })
                            .map((o) => ({
                              value: o.id!,
                              label: String(o.orderNo || ''),
                              data: o,
                            }))}
                          onChange={async (value: any, option: any) => {
                            if (!value) {
                              form.setFieldsValue({
                                warehousingNo: undefined,
                                orderNo: undefined,
                                styleId: undefined,
                                styleNo: undefined,
                                styleName: undefined,
                                cuttingBundleId: undefined,
                                cuttingBundleNo: undefined,
                                cuttingBundleQrCode: undefined,
                                warehousingQuantity: undefined,
                                qualifiedQuantity: undefined,
                                unqualifiedQuantity: 0,
                                qualityStatus: 'qualified',
                              });
                              setBundles([]);
                              setQualifiedWarehousedBundleQrs([]);
                              setBatchSelectedBundleQrs([]);
                              setBatchQtyByQr({});
                              return;
                            }
                            const order = (option as any)?.data || orderOptions.find((o) => o.id === value);
                            if (!order) return;

                            form.setFieldsValue({
                              orderNo: order.orderNo,
                              styleId: order.styleId,
                              styleNo: order.styleNo,
                              styleName: order.styleName,
                            });
                            form.setFieldsValue({
                              cuttingBundleId: undefined,
                              cuttingBundleNo: undefined,
                              cuttingBundleQrCode: undefined,
                              warehousingQuantity: undefined,
                              qualifiedQuantity: undefined,
                              unqualifiedQuantity: 0,
                              qualityStatus: 'qualified',
                              unqualifiedImageUrls: JSON.stringify(
                                unqualifiedFileList.map((f) => String((f as any)?.url || '').trim()).filter(Boolean).slice(0, 4)
                              ),
                            });
                            setQualifiedWarehousedBundleQrs([]);
                            setBatchSelectedBundleQrs([]);
                            setBatchQtyByQr({});
                            await Promise.all([
                              fetchBundlesByOrderNo(order.orderNo),
                              fetchQualifiedWarehousedBundleQrsByOrderId(order.id),
                            ]);
                          }}
                        />
                      </Form.Item>
                    </div>

                    <div className="wh-label" style={{ width: 56 }}>款号</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Form.Item name="styleNo" style={{ marginBottom: 0 }} rules={[{ required: true, message: '款号缺失' }]}>
                        <Input disabled />
                      </Form.Item>
                    </div>

                    <div className="wh-label" style={{ width: 56 }}>款名</div>
                    <div className="wh-control" style={{ minWidth: 240, flex: 2 }}>
                      <Form.Item name="styleName" style={{ marginBottom: 0 }} rules={[{ required: true, message: '款名缺失' }]}>
                        <Input disabled />
                      </Form.Item>
                    </div>
                  </div>

                  <div className="wh-line" style={{ alignItems: 'flex-start' }}>
                    <div className="wh-label">批量选择</div>
                    <div className="wh-control" style={{ flex: 1 }}>
                      <Collapse
                        size="small"
                        items={[
                          {
                            key: 'batch-select',
                            label: (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  点击展开批量多选
                                </div>
                                <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
                                  已选 {batchSelectedBundleQrs.length}
                                </Tag>
                              </div>
                            ),
                            children: (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <Space wrap>
                                  <Button onClick={handleBatchSelectAll} disabled={!batchSelectableQrs.length}>
                                    一键全选(可入库)
                                  </Button>
                                  <Button onClick={handleBatchSelectInvert} disabled={!batchSelectableQrs.length}>
                                    反选
                                  </Button>
                                  <Button onClick={handleBatchSelectClear} disabled={!batchSelectedBundleQrs.length}>
                                    清空已选
                                  </Button>
                                </Space>

                                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                                  <Table<BatchSelectBundleRow>
                                    size="small"
                                    rowKey="qr"
                                    pagination={false}
                                    dataSource={batchSelectRows}
                                    rowSelection={{
                                      selectedRowKeys: batchSelectedBundleQrs,
                                      onChange: (keys, rows) => handleBatchSelectionChange(keys, rows as BatchSelectBundleRow[]),
                                      getCheckboxProps: (record) => ({ disabled: !!record.disabled }),
                                    }}
                                    columns={[
                                      {
                                        title: '菲号',
                                        dataIndex: 'qr',
                                        width: 220,
                                        ellipsis: true,
                                      },
                                      {
                                        title: '扎号',
                                        dataIndex: 'bundleNo',
                                        width: 80,
                                        render: (v: any) => (v ? String(v) : '-'),
                                      },
                                      {
                                        title: '颜色',
                                        dataIndex: 'color',
                                        width: 100,
                                        render: (v: any) => (String(v || '').trim() ? String(v) : '-'),
                                      },
                                      {
                                        title: '码数',
                                        dataIndex: 'size',
                                        width: 100,
                                        render: (v: any) => (String(v || '').trim() ? String(v) : '-'),
                                      },
                                      {
                                        title: '数量',
                                        dataIndex: 'quantity',
                                        width: 80,
                                        render: (v: any) => String(Number(v || 0) || 0),
                                      },
                                      {
                                        title: '状态',
                                        dataIndex: 'statusText',
                                        width: 140,
                                        ellipsis: true,
                                        render: (v: any, record: BatchSelectBundleRow) => {
                                          const rawText = String(v || '').trim();
                                          const key = rawText.toLowerCase();
                                          const mapped = (key === 'qualified' || key === 'unqualified')
                                            ? getQualityStatusConfig(key as WarehousingType['qualityStatus'])
                                            : undefined;
                                          const text = mapped?.text || rawText || '-';

                                          if (record.disabled) return <Tag color="default">{text}</Tag>;
                                          return <Tag color="success">{text}</Tag>;
                                        },
                                      },
                                    ]}
                                  />
                                </div>
                              </div>
                            ),
                          },
                        ]}
                      />
                    </div>
                  </div>

                  {batchSelectedBundleQrs.length ? (
                    <div className="wh-line" style={{ alignItems: 'flex-start' }}>
                      <div className="wh-label">批量菲号</div>
                      <div className="wh-control" style={{ flex: 1 }}>
                        <Collapse
                          size="small"
                          items={[
                            {
                              key: 'batch-list',
                              label: (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    点击展开查看已选菲号
                                  </div>
                                  <Tag color={batchSelectedBundleQrs.length ? 'blue' : 'default'}>
                                    已选 {batchSelectedBundleQrs.length}
                                  </Tag>
                                </div>
                              ),
                              children: (
                                <div
                                  style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 8,
                                    maxHeight: BATCH_LIST_MAX_HEIGHT,
                                    overflowY: 'auto',
                                    paddingRight: 8,
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    borderRadius: 8,
                                    padding: 8,
                                  }}
                                >
                                  {batchSelectedBundleQrs.map((qr) => {
                                    const b = bundles.find((x) => String(x.qrCode || '').trim() === qr);
                                    const maxQty = Math.max(0, Number(b?.quantity || 0) || 0);
                                    const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));
                                    return (
                                      <div key={qr} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                        <div style={{ flex: 1, minWidth: 240 }}>
                                          {`菲号：${qr}`}
                                          {b?.bundleNo ? `｜扎号：${b.bundleNo}` : ''}
                                          {b?.color ? `｜颜色：${b.color}` : ''}
                                          {b?.size ? `｜码数：${b.size}` : ''}
                                        </div>
                                        <div style={{ width: 140 }}>
                                          <InputNumber
                                            style={{ width: '100%' }}
                                            min={1}
                                            max={maxQty || undefined}
                                            value={currentQty || undefined}
                                            onChange={(v) => {
                                              const next = Math.max(0, Math.min(maxQty, Number(v || 0) || 0));
                                              setBatchQtyByQr((prev) => ({ ...prev, [qr]: next }));
                                            }}
                                          />
                                        </div>
                                        <Button
                                          danger
                                          onClick={() => {
                                            setBatchSelectedBundleQrs((prev) => prev.filter((x) => x !== qr));
                                            setBatchQtyByQr((prev) => {
                                              const next = { ...prev };
                                              delete next[qr];
                                              return next;
                                            });
                                          }}
                                        >
                                          移除
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="wh-line">
                    <div className="wh-label">颜色</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Input value={String(singleSelectedBundle?.color || '').trim() || '-'} disabled />
                    </div>
                    <div className="wh-label" style={{ width: 56 }}>码数</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Input value={String(singleSelectedBundle?.size || '').trim() || '-'} disabled />
                    </div>
                    <div className="wh-label" style={{ width: 72 }}>质检数量</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Form.Item name="warehousingQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '质检数量缺失' }]}>
                        <InputNumber style={{ width: '100%' }} min={1} disabled />
                      </Form.Item>
                    </div>
                    <div className="wh-label" style={{ width: 56 }}>仓库</div>
                    <div className="wh-control" style={{ width: 140 }}>
                      <Form.Item name="warehouse" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请选择仓库' }]}>
                        <Select placeholder="请选择仓库">
                          <Option value="A仓">A仓</Option>
                          <Option value="B仓">B仓</Option>
                        </Select>
                      </Form.Item>
                    </div>
                  </div>

                  <div className="wh-line">
                    <div className="wh-label">合格数量</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Form.Item name="qualifiedQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '合格数量缺失' }]}>
                        <InputNumber style={{ width: '100%' }} min={0} disabled />
                      </Form.Item>
                    </div>
                    <div className="wh-label" style={{ width: 84 }}>不合格数量</div>
                    <div className="wh-control" style={{ width: 160 }}>
                      <Form.Item name="unqualifiedQuantity" style={{ marginBottom: 0 }} rules={[{ required: true, message: '请输入不合格数量' }]}>
                        <InputNumber
                          style={{ width: '100%' }}
                          min={0}
                          max={Math.max(0, Number(watchedWarehousingQty || 0) || 0)}
                          disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1}
                          onChange={(v) => {
                            const total = Number(form.getFieldValue('warehousingQuantity') || 0) || 0;
                            const uq = Math.max(0, Math.min(total, Number(v || 0) || 0));
                            const q = Math.max(0, total - uq);
                            form.setFieldsValue({
                              unqualifiedQuantity: uq,
                              qualifiedQuantity: q,
                              qualityStatus: uq > 0 ? 'unqualified' : 'qualified',
                            });
                          }}
                        />
                      </Form.Item>
                    </div>
                  </div>

                  <div className="wh-line wh-line-bottom">
                    <div className="wh-label">不合格图片</div>
                    <div className="wh-control wh-upload">
                      <Upload
                        accept="image/*"
                        listType="picture-card"
                        fileList={unqualifiedFileList}
                        multiple
                        maxCount={MAX_UNQUALIFIED_IMAGES}
                        beforeUpload={(file, fileList) => {
                          const current = Array.isArray(unqualifiedFileList) ? unqualifiedFileList : [];
                          const remaining = Math.max(0, MAX_UNQUALIFIED_IMAGES - current.length);
                          if (remaining <= 0) {
                            message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
                            return Upload.LIST_IGNORE;
                          }
                          const batch = Array.isArray(fileList) ? fileList : [];
                          const idx = batch.indexOf(file);
                          if (idx >= remaining) {
                            if (idx === remaining) {
                              message.error(`最多上传${MAX_UNQUALIFIED_IMAGES}张图片`);
                            }
                            return Upload.LIST_IGNORE;
                          }
                          return uploadOneUnqualifiedImage(file as any);
                        }}
                        onPreview={(file) => {
                          const url = String((file as any)?.url || (file as any)?.thumbUrl || '').trim();
                          if (!url) return;
                          setPreviewUrl(url);
                          setPreviewTitle(String((file as any)?.name || '图片预览'));
                          setPreviewOpen(true);
                        }}
                        onRemove={(file) => {
                          setUnqualifiedFileList((prev) => {
                            const next = prev.filter((f) => f.uid !== file.uid);
                            form.setFieldsValue({
                              unqualifiedImageUrls: JSON.stringify(
                                next
                                  .map((f) => String((f as any)?.url || '').trim())
                                  .filter(Boolean)
                                  .slice(0, MAX_UNQUALIFIED_IMAGES)
                              ),
                            });
                            return next;
                          });
                          return true;
                        }}
                      >
                        {unqualifiedFileList.length >= MAX_UNQUALIFIED_IMAGES ? null : <div>上传</div>}
                      </Upload>
                    </div>

                    <div className="wh-label" style={{ width: 72 }}>返修备注</div>
                    <div className="wh-control" style={{ flex: 1, minWidth: 240 }}>
                      <Form.Item name="repairRemark" style={{ marginBottom: 0 }}>
                        <Input.TextArea rows={2} placeholder="请输入返修备注" />
                      </Form.Item>
                    </div>
                  </div>
                </div>
              </div>
            </Form>
          )}
        </ResizableModal>

        <Modal
          open={previewOpen}
          title={previewTitle}
          footer={null}
          centered
          onCancel={() => {
            setPreviewOpen(false);
            setPreviewUrl('');
            setPreviewTitle('');
          }}
          width={615}
        >
          {previewUrl ? <Image src={previewUrl} style={{ width: '100%' }} /> : null}
        </Modal>
      </div>
    </Layout>
  );
};

export default ProductWarehousing;
