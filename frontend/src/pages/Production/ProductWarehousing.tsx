import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Collapse, Form, Input, InputNumber, Row, Select, Space, Table, Tag, Upload, message } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SearchOutlined, EyeOutlined, InboxOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import { ProductWarehousing as WarehousingType, ProductionOrder, WarehousingQueryParams } from '../../types/production';
import api, { fetchProductionOrderDetail, parseProductionOrderLines, toNumberSafe, useProductionOrderFrozenCache } from '../../utils/api';
import { ProductionOrderHeader, StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { paths } from '../../routeConfig';
import { useSync } from '../../utils/syncManager';
import { useViewport } from '../../utils/useViewport';
import './styles.css';

const { Option } = Select;

const COVER_SIZE = 120;
const MAX_UNQUALIFIED_IMAGES = 4;
const MAX_UNQUALIFIED_IMAGE_MB = 5;
const BATCH_LIST_MAX_HEIGHT = 360;

const DEFECT_CATEGORY_OPTIONS = [
  { label: '外观完整性问题', value: 'appearance_integrity' },
  { label: '尺寸精度问题', value: 'size_accuracy' },
  { label: '工艺规范性问题', value: 'process_compliance' },
  { label: '功能有效性问题', value: 'functional_effectiveness' },
  { label: '其他问题', value: 'other' },
];

const DEFECT_REMARK_OPTIONS = [
  { label: '返修', value: '返修' },
  { label: '报废', value: '报废' },
];

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
  availableQty?: number;
  statusText: string;
  disabled?: boolean;
  rawStatus?: string;
};

type BundleRepairStats = {
  repairPool: number;
  repairedOut: number;
  remaining: number;
};

type OrderLine = {
  color: string;
  size: string;
  quantity: number;
};

const isBundleBlockedForWarehousing = (rawStatus: unknown) => {
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

const parseUrlsValue = (value: unknown): string[] => {
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
    // Intentionally empty
      // 忽略错误
  }
  return raw
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
};

const computeBundleRepairStats = (records: unknown[]): BundleRepairStats => {
  let repairPool = 0;
  let repairedOut = 0;
  for (const r of Array.isArray(records) ? records : []) {
    if (!r) continue;
    const uq = Number((r as Record<string, unknown>)?.unqualifiedQuantity ?? 0) || 0;
    if (uq > 0) repairPool += uq;

    const rr = String((r as Record<string, unknown>)?.repairRemark || '').trim();
    if (rr) {
      const q = Number((r as Record<string, unknown>)?.qualifiedQuantity ?? 0) || 0;
      if (q > 0) repairedOut += q;
    }
  }
  const remaining = Math.max(0, repairPool - repairedOut);
  return { repairPool, repairedOut, remaining };
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

const getDefectCategoryLabel = (value: unknown) => {
  const v = String(value || '').trim();
  if (!v) return '-';
  const hit = DEFECT_CATEGORY_OPTIONS.find((o) => o.value === v);
  return hit ? hit.label : v;
};

const getDefectRemarkLabel = (value: unknown) => {
  const v = String(value || '').trim();
  if (!v) return '-';
  const hit = DEFECT_REMARK_OPTIONS.find((o) => o.value === v);
  return hit ? hit.label : v;
};

const ProductWarehousing: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();

  const routeWarehousingNo = useMemo(() => {
    const raw = String((params as Record<string, unknown>)?.warehousingNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
    // Intentionally empty
      // 忽略错误
      return raw;
    }
  }, [params]);

  const isEntryPage = Boolean(routeWarehousingNo);

  const [entryWarehousing, setEntryWarehousing] = useState<WarehousingType | null>(null);
  const [entryLoading, setEntryLoading] = useState(false);
  const [visible, setVisible] = useState(false);
  const [currentWarehousing, setCurrentWarehousing] = useState<WarehousingType | null>(null);
  const [warehousingModalOpen, setWarehousingModalOpen] = useState(false);
  const [warehousingModalLoading, setWarehousingModalLoading] = useState(false);
  const [warehousingModalOrderId, setWarehousingModalOrderId] = useState<string>('');
  const [warehousingModalWarehousingNo, setWarehousingModalWarehousingNo] = useState<string>('');
  const [warehousingModalOrderNo, setWarehousingModalOrderNo] = useState<string>('');
  const [warehousingModalWarehouse, setWarehousingModalWarehouse] = useState<string>('');
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

  const frozenOrderIds = useMemo(() => {
    return Array.from(new Set(warehousingList.map((r: Record<string, unknown>) => String(r?.orderId || '').trim()).filter(Boolean)));
  }, [warehousingList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'statusOrStock', acceptAnyData: true });

  const [orderOptions, setOrderOptions] = useState<ProductionOrder[]>([]);
  const [orderOptionsLoading, setOrderOptionsLoading] = useState(false);

  const [qualifiedWarehousedBundleQrs, setQualifiedWarehousedBundleQrs] = useState<string[]>([]);

  const [bundles, setBundles] = useState<CuttingBundleRow[]>([]);

  const [bundleRepairRemainingByQr, setBundleRepairRemainingByQr] = useState<Record<string, number>>({});
  const [bundleRepairStatsByQr, setBundleRepairStatsByQr] = useState<Record<string, BundleRepairStats>>({});

  const [unqualifiedFileList, setUnqualifiedFileList] = useState<UploadFile[]>([]);

  const [batchSelectedBundleQrs, setBatchSelectedBundleQrs] = useState<string[]>([]);
  const [batchQtyByQr, setBatchQtyByQr] = useState<Record<string, number>>({});

  const [detailWarehousingItems, setDetailWarehousingItems] = useState<WarehousingType[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const [orderDetail, setOrderDetail] = useState<ProductionOrder | null>(null);
  const [orderWarehousingRecords, setOrderWarehousingRecords] = useState<any[]>([]);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // 独立弹窗（与“点击入库号跳转详情页”完全分离）的状态
  // - 只负责弹窗展示，不复用/不改动现有跳转逻辑
  // - 使用独立的入库单号（warehousingNo）作为数据加载入口
  const [independentDetailOpen, setIndependentDetailOpen] = useState(false);
  const [independentDetailWarehousingNo, setIndependentDetailWarehousingNo] = useState<string>('');
  const [independentDetailSummary, setIndependentDetailSummary] = useState<WarehousingType | null>(null);

  const watchedStyleId = Form.useWatch('styleId', form);
  const watchedOrderId = Form.useWatch('orderId', form);
  const watchedBundleQr = Form.useWatch('cuttingBundleQrCode', form);
  const watchedWarehousingQty = Form.useWatch('warehousingQuantity', form);
  const watchedUnqualifiedQty = Form.useWatch('unqualifiedQuantity', form);

  const { modalWidth, isMobile } = useViewport();

  const modalInitialHeight = useMemo(() => {
    return typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  }, []);

  const detailPopupWidth = modalWidth;

  const detailPopupInitialHeight = useMemo(() => {
    return typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;
  }, []);

  const singleSelectedQr = useMemo(() => {
    if (batchSelectedBundleQrs.length !== 1) return '';
    return String(batchSelectedBundleQrs[0] || '').trim();
  }, [batchSelectedBundleQrs]);

  const singleSelectedBundle = useMemo(() => {
    if (!singleSelectedQr) return null;
    return bundles.find((b) => String(b.qrCode || '').trim() === singleSelectedQr) || null;
  }, [bundles, singleSelectedQr]);

  const isSingleSelectedBundleBlocked = useMemo(() => {
    const rawStatus = String((singleSelectedBundle as Record<string, unknown>)?.status || '').trim();
    return Boolean(singleSelectedQr && isBundleBlockedForWarehousing(rawStatus));
  }, [singleSelectedBundle, singleSelectedQr]);

  const singleSelectedBundleRepairStats = useMemo(() => {
    if (!singleSelectedQr) return undefined;
    return bundleRepairStatsByQr[singleSelectedQr];
  }, [bundleRepairStatsByQr, singleSelectedQr]);

  const bundleByQrForSummary = useMemo(() => {
    const m = new Map<string, CuttingBundleRow>();
    for (const b of bundles) {
      const qr = String((b as Record<string, unknown>)?.qrCode || '').trim();
      if (!qr) continue;
      m.set(qr, b);
    }
    return m;
  }, [bundles]);

  const batchSelectedSummary = useMemo(() => {
    const qrs = batchSelectedBundleQrs.map((v) => String(v || '').trim()).filter(Boolean);
    let totalQty = 0;
    let blockedCount = 0;
    let blockedQty = 0;
    let nonBlockedQty = 0;
    let blockedRemainingSum = 0;
    let blockedMissing = 0;
    let repairPoolSum = 0;
    let repairedOutSum = 0;
    let statsMissing = 0;

    for (const qr of qrs) {
      const b = bundleByQrForSummary.get(qr);
      const rawStatus = String((b as Record<string, unknown>)?.status || '').trim();
      const isBlocked = isBundleBlockedForWarehousing(rawStatus);
      const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
      const maxQty = isBlocked
        ? Math.max(0, Number(remaining === undefined ? 0 : remaining) || 0)
        : Math.max(0, Number((b as Record<string, unknown>)?.quantity ?? 0) || 0);
      const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));

      totalQty += currentQty;
      if (isBlocked) {
        blockedCount += 1;
        blockedQty += currentQty;
        if (remaining === undefined) blockedMissing += 1;
        else blockedRemainingSum += Math.max(0, Number(remaining || 0) || 0);

        const st = bundleRepairStatsByQr[qr];
        if (!st) statsMissing += 1;
        else {
          repairPoolSum += Math.max(0, Number(st.repairPool || 0) || 0);
          repairedOutSum += Math.max(0, Number(st.repairedOut || 0) || 0);
        }
      } else {
        nonBlockedQty += currentQty;
      }
    }

    return {
      selectedCount: qrs.length,
      totalQty,
      blockedCount,
      blockedQty,
      nonBlockedQty,
      blockedRemainingSum,
      blockedMissing,
      repairPoolSum,
      repairedOutSum,
      statsMissing,
    };
  }, [batchQtyByQr, batchSelectedBundleQrs, bundleByQrForSummary, bundleRepairRemainingByQr, bundleRepairStatsByQr]);

  const batchSelectedHasBlocked = useMemo(() => {
    return batchSelectedSummary.blockedCount > 0;
  }, [batchSelectedSummary.blockedCount]);

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
      const res = await api.get<{ code: number; data: { records: ProductionOrder[]; total: number } }>('/production/order/list', { params: { page: 1, pageSize: 5000 } });
      if (res.code === 200) {
        const records: ProductionOrder[] = res.data.records || [];
        setOrderOptions(records);
      } else {
        setOrderOptions([]);
        message.error(res.message || '获取订单列表失败');
      }
    } catch {
    // Intentionally empty
      // 忽略错误
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
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      if (res.code === 200) {
        setBundles((res.data?.records || []) as CuttingBundleRow[]);
      } else {
        setBundles([]);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
      setBundles([]);
    }
  };

  const fetchBundleRepairStatsByQr = async (orderId: string, qrCode: string) => {
    const oid = String(orderId || '').trim();
    const qr = String(qrCode || '').trim();
    if (!oid || !qr) return;

    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: {
          page: 1,
          pageSize: 10000,
          orderId: oid,
          cuttingBundleQrCode: qr,
        },
      });
      if (res.code !== 200) return;
      const records = (res.data?.records || []) as Record<string, unknown>[];
      const stats = computeBundleRepairStats(records);
      setBundleRepairStatsByQr((prev) => ({ ...prev, [qr]: stats }));
      setBundleRepairRemainingByQr((prev) => ({ ...prev, [qr]: stats.remaining }));
    } catch {
    // Intentionally empty
      // 忽略错误
    }
  };

  const fetchBundleRepairStatsBatch = async (orderId: string, qrs: string[]) => {
    const oid = String(orderId || '').trim();
    const list = Array.isArray(qrs) ? qrs.map((v) => String(v || '').trim()).filter(Boolean) : [];
    if (!oid || !list.length) return;
    try {
      const res = await api.post<{ code: number; data: Record<string, unknown> }>('/production/warehousing/repair-stats/batch', {
        orderId: oid,
        qrs: list,
      });
      if (res.code !== 200) {
        throw new Error(res.message || '获取返修统计失败');
      }
      const items = (res.data?.items || []) as Record<string, unknown>[];
      if (!Array.isArray(items) || !items.length) return;

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
          next[qr] = Math.max(0, Number(it?.remaining ?? 0) || 0);
        }
        return next;
      });
    } catch {
    // Intentionally empty
      // 忽略错误
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

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById(orderId);
  };

  useEffect(() => {
    if (currentWarehousing) return;
    const oid = String(watchedOrderId || '').trim();
    if (!oid) return;
    const blockedQrs = bundles
      .map((b: unknown) => {
        const qr = String(b?.qrCode || '').trim();
        if (!qr) return '';
        const rawStatus = String(b?.status || '').trim();
        if (!isBundleBlockedForWarehousing(rawStatus)) return '';
        return qr;
      })
      .filter(Boolean);
    const missing = blockedQrs.filter((qr) => bundleRepairRemainingByQr[qr] === undefined);
    if (!missing.length) return;

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await fetchBundleRepairStatsBatch(oid, missing);
    })();

    return () => {
      cancelled = true;
    };
  }, [bundles, bundleRepairRemainingByQr, currentWarehousing, fetchBundleRepairStatsBatch, watchedOrderId]);

  const fetchQualifiedWarehousedBundleQrsByOrderId = async (orderId: string) => {
    const oid = String(orderId || '').trim();
    if (!oid) {
      setQualifiedWarehousedBundleQrs([]);
      return;
    }
    try {
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: { page: 1, pageSize: 10000, orderId: oid },
      });
      if (res.code === 200) {
        const records = (res.data?.records || []) as Record<string, unknown>[];
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
    // Intentionally empty
      // 忽略错误
      setQualifiedWarehousedBundleQrs([]);
      form.setFieldsValue({ warehousingNo: undefined });
    }
  };

  const loadWarehousingDetail = async (warehousing: WarehousingType) => {
    const warehousingNo = String((warehousing as Record<string, unknown>)?.warehousingNo || '').trim();
    const orderId = String((warehousing as Record<string, unknown>)?.orderId || '').trim();
    const orderNo = String((warehousing as Record<string, unknown>)?.orderNo || '').trim();

    setDetailLoading(true);
    try {
      let records: WarehousingType[] = [];

      if (warehousingNo || orderId) {
        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            ...(warehousingNo ? { warehousingNo } : {}),
            ...(!warehousingNo && orderId ? { orderId } : {}),
          },
        });
        if (res.code === 200) {
          records = (res.data?.records || []) as WarehousingType[];
        }
      }

      setDetailWarehousingItems(records);
      const resolvedOrderNo = orderNo || String((records as Record<string, unknown>)?.[0]?.orderNo || '').trim();
      if (resolvedOrderNo) {
        await fetchBundlesByOrderNo(resolvedOrderNo);
      } else {
        setBundles([]);
      }
    } catch {
    // Intentionally empty
      // 忽略错误
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
      const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
      if (response.code === 200) {
        setWarehousingList(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取质检入库列表失败');
      }
    } catch (error) {
      message.error('获取质检入库列表失败');
    } finally {
      setLoading(false);
    }
  };

  const openWarehousingModal = (record: WarehousingType) => {
    const oid = String((record as Record<string, unknown>)?.orderId || '').trim();
    const whNo = String((record as Record<string, unknown>)?.warehousingNo || '').trim();
    const on = String((record as Record<string, unknown>)?.orderNo || '').trim();
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    setWarehousingModalOrderId(oid);
    setWarehousingModalWarehousingNo(whNo);
    setWarehousingModalOrderNo(on);
    setWarehousingModalWarehouse('');
    setWarehousingModalOpen(true);
  };

  const closeWarehousingModal = () => {
    setWarehousingModalOpen(false);
    setWarehousingModalLoading(false);
    setWarehousingModalOrderId('');
    setWarehousingModalWarehousingNo('');
    setWarehousingModalOrderNo('');
    setWarehousingModalWarehouse('');
  };

  const submitWarehousing = async () => {
    const oid = String(warehousingModalOrderId || '').trim();
    const whNo = String(warehousingModalWarehousingNo || '').trim();
    const warehouse = String(warehousingModalWarehouse || '').trim();
    if (!warehouse) {
      message.error('请选择仓库');
      return;
    }
    if (!oid && !whNo) {
      message.error('缺少订单信息');
      return;
    }
    if (oid && !(await ensureOrderUnlockedById(oid))) return;

    try {
      setWarehousingModalLoading(true);
      const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
        params: {
          page: 1,
          pageSize: 10000,
          ...(whNo ? { warehousingNo: whNo } : {}),
          ...(!whNo && oid ? { orderId: oid } : {}),
        },
      });
      if (res.code !== 200) {
        message.error(res.message || '获取质检记录失败');
        return;
      }
      const records = (res.data?.records || []) as WarehousingType[];
      const targets = records.filter((r) => {
        const qs = String((r as Record<string, unknown>)?.qualityStatus || '').trim().toLowerCase();
        const qualified = !qs || qs === 'qualified';
        const q = Number((r as Record<string, unknown>)?.qualifiedQuantity || 0) || 0;
        const hasWarehouse = String((r as Record<string, unknown>)?.warehouse || '').trim();
        return qualified && q > 0 && !hasWarehouse;
      });

      if (!targets.length) {
        message.info('该订单暂无可入库的合格质检记录');
        return;
      }

      const concurrency = 5;
      const queue = targets.slice();
      const workers = Array.from({ length: Math.min(concurrency, queue.length) }).map(async () => {
        while (queue.length) {
          const r = queue.shift();
          if (!r) continue;
          await api.put<{ code: number; message: string; data: boolean }>('/production/warehousing', { id: (r as Record<string, unknown>)?.id, warehouse });
        }
      });
      await Promise.all(workers);

      message.success('入库完成');
      closeWarehousingModal();
      fetchWarehousingList();
    } catch (e) {
      message.error((e as Error).message || '入库失败');
    } finally {
      setWarehousingModalLoading(false);
    }
  };

  // 页面加载时获取质检入库列表
  useEffect(() => {
    if (isEntryPage) return;
    fetchWarehousingList();
  }, [isEntryPage, queryParams]);

  // 实时同步：30秒自动轮询更新质检入库数据
  // 质检入库页面数据实时性要求高，需要及时看到最新的入库状态
  useSync(
    'product-warehousing-list',
    async () => {
      try {
        const response = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取质检入库列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setWarehousingList(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 质检入库数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 30000, // 30秒轮询，入库数据实时性要求高
      enabled: !loading && !isEntryPage && !visible && !warehousingModalOpen && !independentDetailOpen, // 加载中、详情页、弹窗打开时暂停
      pauseOnHidden: true, // 页面隐藏时暂停
      onError: (error) => {
        console.error('[实时同步] 质检入库数据同步错误', error);
      }
    }
  );

  useEffect(() => {
    if (!isEntryPage) {
      setEntryWarehousing(null);
      setEntryLoading(false);
      setDetailWarehousingItems([]);
      setDetailLoading(false);
      setBundles([]);
      setOrderDetailLoading(false);
      setOrderDetail(null);
      setOrderWarehousingRecords([]);
      return;
    }

    let cancelled = false;
    const whNo = String(routeWarehousingNo || '').trim();
    if (!whNo) return;

    const run = async () => {
      setEntryLoading(true);
      setDetailLoading(true);
      setOrderDetailLoading(false);
      try {
        const stateSummary = (location.state as Record<string, unknown>)?.warehousingSummary as WarehousingType | undefined;
        if (stateSummary && String((stateSummary as Record<string, unknown>)?.warehousingNo || '').trim() === whNo) {
          setEntryWarehousing(stateSummary);
        } else {
          setEntryWarehousing(null);
        }

        const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
          params: {
            page: 1,
            pageSize: 10000,
            warehousingNo: whNo,
          },
        });
        if (res.code !== 200) {
          throw new Error(res.message || '获取质检入库详情失败');
        }
        const records = (res.data?.records || []) as WarehousingType[];
        if (!records.length) {
          throw new Error('未找到质检入库详情');
        }

        if (cancelled) return;
        setDetailWarehousingItems(records);

        const totals = records.reduce(
          (acc, r: any) => {
            acc.warehousingQuantity += Number(r?.warehousingQuantity || 0) || 0;
            acc.qualifiedQuantity += Number(r?.qualifiedQuantity || 0) || 0;
            acc.unqualifiedQuantity += Number(r?.unqualifiedQuantity || 0) || 0;
            if (String(r?.qualityStatus || '').trim() === 'unqualified') acc.hasUnqualified = true;
            return acc;
          },
          {
            warehousingQuantity: 0,
            qualifiedQuantity: 0,
            unqualifiedQuantity: 0,
            hasUnqualified: false,
          }
        );

        const base = (records[0] || {}) as Record<string, unknown>;
        const merged = {
          ...(stateSummary && String((stateSummary as Record<string, unknown>)?.warehousingNo || '').trim() === whNo ? (stateSummary as Record<string, unknown>) : {}),
          ...base,
          warehousingNo: whNo,
          warehousingQuantity: Math.max(0, totals.warehousingQuantity),
          qualifiedQuantity: Math.max(0, totals.qualifiedQuantity),
          unqualifiedQuantity: Math.max(0, totals.unqualifiedQuantity),
          qualityStatus: totals.hasUnqualified ? 'unqualified' : (String(base?.qualityStatus || '').trim() === 'unqualified' ? 'unqualified' : 'qualified'),
        } as WarehousingType;

        setEntryWarehousing(merged);
        setUnqualifiedFileList(toUploadFileList(parseUrlsValue((merged as Record<string, unknown>)?.unqualifiedImageUrls)));

        const resolvedOrderNo = String((merged as Record<string, unknown>)?.orderNo || '').trim() || String((records as Record<string, unknown>)?.[0]?.orderNo || '').trim();
        if (resolvedOrderNo) {
          await fetchBundlesByOrderNo(resolvedOrderNo);
        } else {
          setBundles([]);
        }

        const resolvedOrderId = String((merged as Record<string, unknown>)?.orderId || '').trim();
        if (resolvedOrderId) {
          setOrderDetailLoading(true);
          try {
            const detail = await fetchProductionOrderDetail(resolvedOrderId, { acceptAnyData: true });
            if (!cancelled) {
              setOrderDetail((detail || null) as ProductionOrder | null);
            }
          } catch {
    // Intentionally empty
      // 忽略错误
            if (!cancelled) setOrderDetail(null);
          } finally {
            if (!cancelled) setOrderDetailLoading(false);
          }

          try {
            const whRes = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
              params: { page: 1, pageSize: 10000, orderId: resolvedOrderId },
            });
            if (!cancelled) {
              const list = (whRes?.data?.records || []) as Record<string, unknown>[];
              setOrderWarehousingRecords(Array.isArray(list) ? list : []);
            }
          } catch {
    // Intentionally empty
      // 忽略错误
            if (!cancelled) {
              setOrderWarehousingRecords([]);
            }
          }
        } else {
          setOrderDetailLoading(false);
          setOrderDetail(null);
          setOrderWarehousingRecords([]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          message.error(e?.message || '获取质检入库详情失败');
          navigate(paths.warehousing, { replace: true });
        }
      } finally {
        if (!cancelled) {
          setEntryLoading(false);
          setDetailLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isEntryPage, location.state, navigate, routeWarehousingNo]);

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
        createTime: formatDateTime((warehousing as Record<string, unknown>)?.createTime),
      });
      const urls = parseUrlsValue((warehousing as Record<string, unknown>)?.unqualifiedImageUrls);
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
      defectCategory: undefined,
      defectRemark: undefined,
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
    if (batchSelectedHasBlocked) {
      message.warning('次品待返修菲号请单条处理（保存时填写返修备注）');
      return;
    }
    try {
      setSubmitLoading(true);
      const orderId = String(form.getFieldValue('orderId') || '').trim();
      if (!orderId) {
        message.error('请选择订单号');
        return;
      }

      if (!(await ensureOrderUnlockedById(orderId))) return;

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

      const res = await api.post<{ code: number; message: string; data: boolean }>('/production/warehousing/batch', {
        orderId,
        warehousingType: 'manual',
        items,
      });
      if (res.code === 200) {
        message.success('批量合格质检成功');
        closeDialog();
        fetchWarehousingList();
      } else {
        message.error(res.message || '批量入库失败');
      }
    } catch (error) {
      if ((error as Record<string, unknown>).errorFields) {
        const firstError = (error as Record<string, unknown>).errorFields[0];
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
        .map((f) => String((f as Record<string, unknown>)?.url || '').trim())
        .filter(Boolean)
        .slice(0, 4);
      const warehousingQty = Number(values.warehousingQuantity || 0) || 0;
      const unqualifiedQty = Math.max(0, Math.min(warehousingQty, Number(values.unqualifiedQuantity || 0) || 0));
      const qualifiedQty = Math.max(0, warehousingQty - unqualifiedQty);
      const qualityStatus = unqualifiedQty > 0 ? 'unqualified' : 'qualified';

      const defectCategory = String(values.defectCategory || '').trim();
      const defectRemark = String(values.defectRemark || '').trim();

      const payload: unknown = {
        ...values,
        unqualifiedQuantity: unqualifiedQty,
        qualifiedQuantity: qualifiedQty,
        warehousingQuantity: warehousingQty,
        qualityStatus,
        unqualifiedImageUrls: JSON.stringify(urls),
      };

      if (unqualifiedQty > 0) {
        payload.defectCategory = defectCategory;
        payload.defectRemark = defectRemark;
      } else {
        payload.defectCategory = '';
        payload.defectRemark = '';
      }

      let response;
      if (currentWarehousing?.id) {
        // 编辑入库单
        response = await api.put('/production/warehousing', { ...payload, id: currentWarehousing.id });
      } else {
        // 新增质检入库
        const { warehouse: _warehouse, ...safePayload } = payload as Record<string, unknown>;
        response = await api.post('/production/warehousing', { ...safePayload, warehousingType: 'manual' });
      }

      const result = response as Record<string, unknown>;
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
      if ((error as Record<string, unknown>).errorFields) {
        const firstError = (error as Record<string, unknown>).errorFields[0];
        message.error(firstError.errors[0] || '表单验证失败');
      } else {
        message.error((error as Error).message || '保存失败');
      }
    } finally {
      setSubmitLoading(false);
    }
  };

  const getQualityStatusConfig = (status: WarehousingType['qualityStatus']) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      qualified: { text: '合格', color: 'success' },
      unqualified: { text: '不合格', color: 'error' },
      repaired: { text: '返修完成', color: 'processing' },
    };
    const key = String(status || '').trim().toLowerCase();
    if (!key) return { text: '未开始', color: 'default' };
    return statusMap[key] || { text: '未知', color: 'default' };
  };

  const mapBundleStatusText = (rawStatus: unknown) => {
    const s = String(rawStatus || '').trim();
    if (!s) return '';
    const key = s.toLowerCase();
    const map: Record<string, string> = {
      pending: '未开始',
      not_started: '未开始',
      created: '已创建',
      in_progress: '进行中',
      completed: '已完成',
      qualified: '已合格',
      unqualified: '次品待返修',
      repaired: '返修完成',
      repairing: '返修中',
      returned: '已退回',
    };
    return map[key] || s;
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
        const rawStatus = String((b as Record<string, unknown>)?.status || '').trim();
        const isBlocked = isBundleBlockedForWarehousing(rawStatus);
        const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
        const availableQty = isBlocked ? (remaining === undefined ? 0 : Math.max(0, Number(remaining || 0) || 0)) : qty;
        const isUsed = qualifiedWarehousedBundleQrSet.has(qr);
        const disabled = isUsed || (isBlocked && (remaining === undefined || availableQty <= 0));

        let statusText = '';
        if (isUsed) {
          statusText = '已合格质检';
        } else if (isBlocked) {
          if (remaining === undefined) statusText = '次品待返修（计算中）';
          else statusText = availableQty > 0 ? `次品待返修｜可入库${availableQty}` : '次品待返修｜无可入库';
        } else if (rawStatus) {
          statusText = mapBundleStatusText(rawStatus);
        } else {
          statusText = '未开始';
        }

        return {
          key: qr,
          qr,
          bundleNo: bundleNo || undefined,
          color: color || undefined,
          size: size || undefined,
          quantity: qty || 0,
          availableQty,
          statusText,
          disabled,
          rawStatus,
        };
      })
      .filter(Boolean) as BatchSelectBundleRow[];
  }, [bundleRepairRemainingByQr, bundles, qualifiedWarehousedBundleQrSet]);

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
        const maxQty = Math.max(0, Number((row as Record<string, unknown>)?.availableQty ?? row?.quantity ?? 0) || 0);
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
        cuttingBundleId: (b as Record<string, unknown>)?.id,
        cuttingBundleNo: (b as Record<string, unknown>)?.bundleNo,
      });
    } else {
      form.setFieldsValue({
        cuttingBundleQrCode: undefined,
        cuttingBundleId: undefined,
        cuttingBundleNo: undefined,
      });
    }

    const total = qrs.reduce((sum, qr) => sum + (Number(batchQtyByQr[qr] || 0) || 0), 0);
    const rawStatus = qrs.length === 1 ? String((bundles.find((x) => String(x.qrCode || '').trim() === qrs[0]) as Record<string, unknown>)?.status || '').trim() : '';
    const isRepairFlow = qrs.length === 1 && isBundleBlockedForWarehousing(rawStatus);
    const baseUnq = qrs.length === 1 ? Number(form.getFieldValue('unqualifiedQuantity') || 0) || 0 : 0;
    const unq = isRepairFlow ? 0 : (qrs.length === 1 ? Math.max(0, Math.min(total, baseUnq)) : 0);
    const qual = Math.max(0, total - unq);
    form.setFieldsValue({
      warehousingQuantity: total,
      unqualifiedQuantity: unq,
      qualifiedQuantity: qual,
      qualityStatus: unq > 0 ? 'unqualified' : 'qualified',
    });
  }, [batchQtyByQr, batchSelectedBundleQrs, bundles, currentWarehousing, form]);


  type OrderLineWarehousingRow = {
    key: string;
    orderNo: string;
    styleNo: string;
    color: string;
    size: string;
    quantity: number;
    warehousedQuantity: number;
    unwarehousedQuantity: number;
  };

  const orderLineWarehousingRows = useMemo((): OrderLineWarehousingRow[] => {
    if (!isEntryPage) return [];

    const orderNo = String((orderDetail as Record<string, unknown>)?.orderNo || (entryWarehousing as Record<string, unknown>)?.orderNo || '').trim();
    const styleNo = String((orderDetail as Record<string, unknown>)?.styleNo || (entryWarehousing as Record<string, unknown>)?.styleNo || '').trim();
    const lines = parseProductionOrderLines(orderDetail) as OrderLine[];
    if (!lines.length) return [];

    const warehousedByKey = new Map<string, number>();
    for (const r of Array.isArray(orderWarehousingRecords) ? orderWarehousingRecords : []) {
      if (!r) continue;
      const qs = String(r?.qualityStatus || '').trim().toLowerCase();
      if (qs && qs !== 'qualified') continue;
      const q = toNumberSafe(r?.qualifiedQuantity);
      if (q <= 0) continue;
      const hasWarehouse = Boolean(String(r?.warehouse || '').trim());
      if (!hasWarehouse) continue;

      const qr = String(r?.cuttingBundleQrCode || r?.qrCode || '').trim();
      const b = qr ? bundleByQrForSummary.get(qr) : undefined;
      const color = String((b as Record<string, unknown>)?.color || r?.color || r?.colour || '').trim();
      const size = String((b as Record<string, unknown>)?.size || r?.size || '').trim();
      if (!color || !size) continue;

      const k = `${color}@@${size}`;
      warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
    }

    return lines
      .map((l, idx) => {
        const color = String(l?.color || '').trim();
        const size = String(l?.size || '').trim();
        const quantity = Math.max(0, toNumberSafe(l?.quantity));
        const k = `${color}@@${size}`;
        const warehousedQuantity = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
        const unwarehousedQuantity = Math.max(0, quantity - warehousedQuantity);
        return {
          key: `${idx}-${k}`,
          orderNo: orderNo || '-',
          styleNo: styleNo || '-',
          color: color || '-',
          size: size || '-',
          quantity,
          warehousedQuantity,
          unwarehousedQuantity,
        };
      })
      .sort((a, b) => {
        const byColor = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
        if (byColor !== 0) return byColor;
        return a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
      });
  }, [bundleByQrForSummary, entryWarehousing, isEntryPage, orderDetail, orderWarehousingRecords]);

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
      const res = await api.post<{ code: number; message: string; data: string }>('/common/upload', formData);
      if (res.code !== 200) {
        message.error(res.message || '上传失败');
        return Upload.LIST_IGNORE;
      }
      const url = String(res.data || '').trim();
      if (!url) {
        message.error('上传失败');
        return Upload.LIST_IGNORE;
      }

      setUnqualifiedFileList((prev) => {
        const next = [...prev, { uid: `${Date.now()}-${Math.random()}`, name: file.name, status: 'done', url } as UploadFile].slice(0, MAX_UNQUALIFIED_IMAGES);
        form.setFieldsValue({
          unqualifiedImageUrls: JSON.stringify(
            next
              .map((f) => String((f as Record<string, unknown>)?.url || '').trim())
              .filter(Boolean)
              .slice(0, MAX_UNQUALIFIED_IMAGES)
          ),
        });
        return next;
      });
      message.success('上传成功');
    } catch (e: unknown) {
      message.error(e?.message || '上传失败');
    }
    return Upload.LIST_IGNORE;
  };


  // 表格列定义
  const buildWarehousingDetailPath = (warehousingNo: string) => {
    const whNo = String(warehousingNo || '').trim();
    return paths.warehousingDetail.replace(':warehousingNo', encodeURIComponent(whNo));
  };

  const goToWarehousingDetail = (record: WarehousingType) => {
    const whNo = String((record as Record<string, unknown>)?.warehousingNo || '').trim();
    if (!whNo) return;
    navigate(buildWarehousingDetailPath(whNo), { state: { warehousingSummary: record } });
  };

  const openIndependentDetailPopup = (record: WarehousingType) => {
    const whNo = String((record as Record<string, unknown>)?.warehousingNo || '').trim();
    if (!whNo) {
      message.warning('质检入库号为空');
      return;
    }
    setIndependentDetailWarehousingNo(whNo);
    setIndependentDetailSummary(record);
    setIndependentDetailOpen(true);
  };

  const closeIndependentDetailPopup = () => {
    setIndependentDetailOpen(false);
    setIndependentDetailWarehousingNo('');
    setIndependentDetailSummary(null);
  };

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
      render: (v: any, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        return (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => goToWarehousingDetail(record)}>
            {text}
          </Button>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 120,
      ellipsis: true,
      render: (v: unknown) => (
        <span className="order-no-compact">{String(v || '').trim() || '-'}</span>
      ),
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
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 100,
      render: (v: unknown) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      render: (v: unknown) => v || '-',
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
      title: '菲号',
      dataIndex: 'scanCode',
      key: 'scanCode',
      width: 200,
      ellipsis: true,
      render: (v: unknown) => v || '-',
    },
    {
      title: '次品处理',
      key: 'defectHandling',
      width: 120,
      render: (_: any, record: any) => {
        const unqualified = Number(record?.unqualifiedQuantity || 0);
        if (unqualified <= 0) return '-';

        const category = String(record?.defectCategory || '').trim();
        const remark = String(record?.repairRemark || '').trim();

        return (
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            {category && <div>类型：{category}</div>}
            {remark && <div>方式：{remark}</div>}
          </div>
        );
      },
    },
    {
      title: '质检人员',
      dataIndex: 'qualityOperatorName',
      key: 'qualityOperatorName',
      width: 120,
      render: (v: unknown) => v || '-',
    },
    {
      title: '质检时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库开始时间',
      dataIndex: 'warehousingStartTime',
      key: 'warehousingStartTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库完成时间',
      dataIndex: 'warehousingEndTime',
      key: 'warehousingEndTime',
      width: 150,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '入库人员',
      dataIndex: 'warehousingOperatorName',
      key: 'warehousingOperatorName',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: WarehousingType) => {
        const orderId = String((record as Record<string, unknown>)?.orderId || '').trim();
        const frozen = isOrderFrozenById(orderId);

        return (
          <RowActions
            actions={[
              {
                key: 'detail',
                label: '详情',
                title: '弹窗查看',
                icon: <EyeOutlined />,
                onClick: () => openIndependentDetailPopup(record),
                primary: true,
              },
              {
                key: 'complete',
                label: '入库',
                title: '入库',
                icon: <InboxOutlined />,
                disabled: frozen || !orderId,
                onClick: () => openWarehousingModal(record),
                primary: true,
              },
            ]}
          />
        );
      },
    },
  ];

  const tableData = useMemo(() => {
    const m = new Map<string, unknown>();
    for (const r of warehousingList) {
      if (!r) continue;
      const whNo = String((r as Record<string, unknown>)?.warehousingNo || '').trim();
      const oid = String((r as Record<string, unknown>)?.orderId || '').trim();
      const key = whNo || oid || String((r as Record<string, unknown>)?.id || '').trim() || String(Math.random());
      const existed = m.get(key);
      const wq = Number((r as Record<string, unknown>)?.warehousingQuantity || 0) || 0;
      const qq = Number((r as Record<string, unknown>)?.qualifiedQuantity || 0) || 0;
      const uq = Number((r as Record<string, unknown>)?.unqualifiedQuantity || 0) || 0;
      const qs = String((r as Record<string, unknown>)?.qualityStatus || '').trim().toLowerCase();

      if (!existed) {
        m.set(key, {
          ...r,
          id: key,
          warehousingQuantity: Math.max(0, wq),
          qualifiedQuantity: Math.max(0, qq),
          unqualifiedQuantity: Math.max(0, uq),
          qualityStatus: qs === 'unqualified' ? 'unqualified' : 'qualified',
          warehouse: String((r as Record<string, unknown>)?.warehouse || '').trim() || undefined,
        });
        continue;
      }

      existed.warehousingQuantity = (Number(existed.warehousingQuantity || 0) || 0) + Math.max(0, wq);
      existed.qualifiedQuantity = (Number(existed.qualifiedQuantity || 0) || 0) + Math.max(0, qq);
      existed.unqualifiedQuantity = (Number(existed.unqualifiedQuantity || 0) || 0) + Math.max(0, uq);
      if (qs === 'unqualified') {
        existed.qualityStatus = 'unqualified';
      }
      if (!String(existed.warehouse || '').trim()) {
        const wh = String((r as Record<string, unknown>)?.warehouse || '').trim();
        if (wh) existed.warehouse = wh;
      }
      if (!String(existed.warehousingStartTime || '').trim()) {
        const t = (r as Record<string, unknown>)?.warehousingStartTime;
        if (t) existed.warehousingStartTime = t;
      }
      if (!String(existed.warehousingEndTime || '').trim()) {
        const t = (r as Record<string, unknown>)?.warehousingEndTime;
        if (t) existed.warehousingEndTime = t;
      }
      if (!String(existed.warehousingOperatorName || '').trim()) {
        const n = String((r as Record<string, unknown>)?.warehousingOperatorName || '').trim();
        if (n) existed.warehousingOperatorName = n;
      }
    }
    return Array.from(m.values());
  }, [warehousingList]);

  const warehousingDetailColumns: ColumnsType<WarehousingType> = [
    { title: '菲号', dataIndex: 'cuttingBundleQrCode', key: 'cuttingBundleQrCode', width: 260, ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '扎号', dataIndex: 'cuttingBundleNo', key: 'cuttingBundleNo', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) || '-' },
    { title: '尺码', dataIndex: 'size', key: 'size', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '质检数量', dataIndex: 'warehousingQuantity', key: 'warehousingQuantity', width: 110, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '合格', dataIndex: 'qualifiedQuantity', key: 'qualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    { title: '不合格', dataIndex: 'unqualifiedQuantity', key: 'unqualifiedQuantity', width: 90, align: 'right', render: (v: unknown) => toNumberSafe(v) },
    {
      title: '质检',
      dataIndex: 'qualityStatus',
      key: 'qualityStatus',
      width: 110,
      render: (status: WarehousingType['qualityStatus']) => {
        const s = String(status || '').trim();
        if (!s) return '-';
        const { text, color } = getQualityStatusConfig(s as Record<string, unknown>);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    { title: '仓库', dataIndex: 'warehouse', key: 'warehouse', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '入库人员', dataIndex: 'warehousingOperatorName', key: 'warehousingOperatorName', width: 120, render: (v: unknown) => String(v || '').trim() || '-' },
    { title: '入库开始', dataIndex: 'warehousingStartTime', key: 'warehousingStartTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '入库完成', dataIndex: 'warehousingEndTime', key: 'warehousingEndTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '质检时间', dataIndex: 'createTime', key: 'createTime', width: 170, render: (v: unknown) => (String(v || '').trim() ? formatDateTime(v) : '-') },
    { title: '次品类别', dataIndex: 'defectCategory', key: 'defectCategory', width: 150, ellipsis: true, render: (v: unknown) => getDefectCategoryLabel(v) },
    { title: '处理方式', dataIndex: 'defectRemark', key: 'defectRemark', width: 110, ellipsis: true, render: (v: unknown) => getDefectRemarkLabel(v) },
    { title: '返修备注', dataIndex: 'repairRemark', key: 'repairRemark', ellipsis: true, render: (v: unknown) => String(v || '').trim() || '-' },
  ];

  const IndependentWarehousingDetailPopup = () => {
    // 这是一个“完全独立”的弹窗模块：
    // - 触发方式：仅通过列表操作栏的“弹窗”按钮
    // - 不复用现有“点击入库号跳转详情页”的路由逻辑
    // - 弹窗关闭后会清空自身状态，避免影响页面其它功能（新增/编辑质检等）

    const open = independentDetailOpen;
    const whNo = String(independentDetailWarehousingNo || '').trim();

    const [popupEntryWarehousing, setPopupEntryWarehousing] = useState<WarehousingType | null>(null);
    const [popupEntryLoading, setPopupEntryLoading] = useState(false);
    const [popupBundles, setPopupBundles] = useState<CuttingBundleRow[]>([]);
    const [popupOrderDetailLoading, setPopupOrderDetailLoading] = useState(false);
    const [popupOrderDetail, setPopupOrderDetail] = useState<ProductionOrder | null>(null);
    const [popupOrderWarehousingRecords, setPopupOrderWarehousingRecords] = useState<any[]>([]);

    const popupBundleByQr = useMemo(() => {
      const m = new Map<string, CuttingBundleRow>();
      for (const b of Array.isArray(popupBundles) ? popupBundles : []) {
        const qr = String((b as Record<string, unknown>)?.qrCode || '').trim();
        if (!qr) continue;
        if (!m.has(qr)) m.set(qr, b);
      }
      return m;
    }, [popupBundles]);

    const popupOrderLineWarehousingRows = useMemo(() => {
      const orderNo = String((popupOrderDetail as Record<string, unknown>)?.orderNo || (popupEntryWarehousing as Record<string, unknown>)?.orderNo || '').trim();
      const styleNo = String((popupOrderDetail as Record<string, unknown>)?.styleNo || (popupEntryWarehousing as Record<string, unknown>)?.styleNo || '').trim();
      const lines = parseProductionOrderLines(popupOrderDetail) as OrderLine[];
      if (!lines.length) return [] as Array<{
        key: string;
        orderNo: string;
        styleNo: string;
        color: string;
        size: string;
        quantity: number;
        warehousedQuantity: number;
        unwarehousedQuantity: number;
      }>;

      const warehousedByKey = new Map<string, number>();
      for (const r of Array.isArray(popupOrderWarehousingRecords) ? popupOrderWarehousingRecords : []) {
        if (!r) continue;
        const qs = String(r?.qualityStatus || '').trim().toLowerCase();
        if (qs && qs !== 'qualified') continue;
        const q = toNumberSafe(r?.qualifiedQuantity);
        if (q <= 0) continue;
        const hasWarehouse = Boolean(String(r?.warehouse || '').trim());
        if (!hasWarehouse) continue;

        const qr = String(r?.cuttingBundleQrCode || r?.qrCode || '').trim();
        const b = qr ? popupBundleByQr.get(qr) : undefined;
        const color = String((b as Record<string, unknown>)?.color || r?.color || r?.colour || '').trim();
        const size = String((b as Record<string, unknown>)?.size || r?.size || '').trim();
        if (!color || !size) continue;

        const k = `${color}@@${size}`;
        warehousedByKey.set(k, (warehousedByKey.get(k) || 0) + q);
      }

      return lines
        .map((l, idx) => {
          const color = String(l?.color || '').trim();
          const size = String(l?.size || '').trim();
          const quantity = Math.max(0, toNumberSafe(l?.quantity));
          const k = `${color}@@${size}`;
          const warehousedQuantity = Math.max(0, toNumberSafe(warehousedByKey.get(k) || 0));
          const unwarehousedQuantity = Math.max(0, quantity - warehousedQuantity);
          return {
            key: `${idx}-${k}`,
            orderNo: orderNo || '-',
            styleNo: styleNo || '-',
            color: color || '-',
            size: size || '-',
            quantity,
            warehousedQuantity,
            unwarehousedQuantity,
          };
        })
        .sort((a, b) => {
          const byColor = a.color.localeCompare(b.color, 'zh-Hans-CN', { numeric: true });
          if (byColor !== 0) return byColor;
          return a.size.localeCompare(b.size, 'zh-Hans-CN', { numeric: true });
        });
    }, [popupBundleByQr, popupEntryWarehousing, popupOrderDetail, popupOrderWarehousingRecords]);

    const fetchPopupBundlesByOrderNo = React.useCallback(async (orderNo: string) => {
      const on = String(orderNo || '').trim();
      if (!on) {
        setPopupBundles([]);
        return;
      }
      try {
        const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
          params: { page: 1, pageSize: 10000, orderNo: on },
        });
        if (res.code === 200) {
          setPopupBundles((res.data?.records || []) as CuttingBundleRow[]);
        } else {
          setPopupBundles([]);
        }
      } catch {
    // Intentionally empty
      // 忽略错误
        setPopupBundles([]);
      }
    }, []);

    useEffect(() => {
      if (!open) {
        setPopupEntryWarehousing(null);
        setPopupEntryLoading(false);
        setPopupBundles([]);
        setPopupOrderDetailLoading(false);
        setPopupOrderDetail(null);
        setPopupOrderWarehousingRecords([]);
        return;
      }
      if (!whNo) return;

      let cancelled = false;
      const run = async () => {
        // 这里复用与“详情页”一致的取数逻辑，确保弹窗内容与原图排版一致：
        // 1) 按 warehousingNo 拉取所有明细记录
        // 2) 计算汇总信息（质检数量/合格/不合格）并展示在顶部摘要
        // 3) 通过订单信息补齐菲号、下单详情与已/未入库数
        setPopupEntryLoading(true);
        setPopupOrderDetailLoading(false);
        try {
          const stateSummary = independentDetailSummary;
          if (stateSummary && String((stateSummary as Record<string, unknown>)?.warehousingNo || '').trim() === whNo) {
            setPopupEntryWarehousing(stateSummary);
          } else {
            setPopupEntryWarehousing(null);
          }

          const res = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
            params: {
              page: 1,
              pageSize: 10000,
              warehousingNo: whNo,
            },
          });
          if (res.code !== 200) {
            throw new Error(res.message || '获取质检入库详情失败');
          }
          const records = (res.data?.records || []) as WarehousingType[];
          if (!records.length) {
            throw new Error('未找到质检入库详情');
          }
          if (cancelled) return;

          const totals = records.reduce(
            (acc, r: any) => {
              acc.warehousingQuantity += Number(r?.warehousingQuantity || 0) || 0;
              acc.qualifiedQuantity += Number(r?.qualifiedQuantity || 0) || 0;
              acc.unqualifiedQuantity += Number(r?.unqualifiedQuantity || 0) || 0;
              if (String(r?.qualityStatus || '').trim() === 'unqualified') acc.hasUnqualified = true;
              return acc;
            },
            {
              warehousingQuantity: 0,
              qualifiedQuantity: 0,
              unqualifiedQuantity: 0,
              hasUnqualified: false,
            }
          );

          const base = (records[0] || {}) as Record<string, unknown>;
          const merged = {
            ...(stateSummary && String((stateSummary as Record<string, unknown>)?.warehousingNo || '').trim() === whNo ? (stateSummary as Record<string, unknown>) : {}),
            ...base,
            warehousingNo: whNo,
            warehousingQuantity: Math.max(0, totals.warehousingQuantity),
            qualifiedQuantity: Math.max(0, totals.qualifiedQuantity),
            unqualifiedQuantity: Math.max(0, totals.unqualifiedQuantity),
            qualityStatus: totals.hasUnqualified
              ? 'unqualified'
              : (String(base?.qualityStatus || '').trim() === 'unqualified' ? 'unqualified' : 'qualified'),
          } as WarehousingType;

          setPopupEntryWarehousing(merged);

          const resolvedOrderNo = String((merged as Record<string, unknown>)?.orderNo || '').trim() || String((records as Record<string, unknown>)?.[0]?.orderNo || '').trim();
          if (resolvedOrderNo) {
            await fetchPopupBundlesByOrderNo(resolvedOrderNo);
          } else {
            setPopupBundles([]);
          }

          const resolvedOrderId = String((merged as Record<string, unknown>)?.orderId || '').trim();
          if (resolvedOrderId) {
            setPopupOrderDetailLoading(true);
            try {
              const detail = await fetchProductionOrderDetail(resolvedOrderId, { acceptAnyData: true });
              if (!cancelled) {
                setPopupOrderDetail((detail || null) as ProductionOrder | null);
              }
            } catch {
    // Intentionally empty
      // 忽略错误
              if (!cancelled) setPopupOrderDetail(null);
            } finally {
              if (!cancelled) setPopupOrderDetailLoading(false);
            }

            try {
              const whRes = await api.get<{ code: number; data: { records: WarehousingType[]; total: number } }>('/production/warehousing/list', {
                params: { page: 1, pageSize: 10000, orderId: resolvedOrderId },
              });
              if (!cancelled) {
                const list = (whRes?.data?.records || []) as Record<string, unknown>[];
                setPopupOrderWarehousingRecords(Array.isArray(list) ? list : []);
              }
            } catch {
    // Intentionally empty
      // 忽略错误
              if (!cancelled) {
                setPopupOrderWarehousingRecords([]);
              }
            }
          } else {
            setPopupOrderDetailLoading(false);
            setPopupOrderDetail(null);
            setPopupOrderWarehousingRecords([]);
          }
        } catch (e: unknown) {
          if (!cancelled) {
            message.error(e?.message || '获取质检入库详情失败');
            setPopupEntryWarehousing(null);
            setPopupBundles([]);
            setPopupOrderDetail(null);
            setPopupOrderWarehousingRecords([]);
          }
        } finally {
          if (!cancelled) {
            setPopupEntryLoading(false);
          }
        }
      };

      void run();
      return () => {
        cancelled = true;
      };
    }, [fetchPopupBundlesByOrderNo, independentDetailSummary, open, whNo]);

    return (
      <ResizableModal
        title="质检入库详情"
        open={open}
        onCancel={closeIndependentDetailPopup}
        footer={null}
        width={detailPopupWidth}
        initialHeight={detailPopupInitialHeight}
        scaleWithViewport
        destroyOnHidden
        styles={{
          body: {
            height: 'calc(100% - 56px)',
            display: 'flex',
            flexDirection: 'column',
          },
        }}
      >
        <div style={{ flex: 1, minHeight: 0 }}>
          <Card size="small" className="order-flow-detail" style={{ marginTop: 0, height: '100%' }} loading={popupEntryLoading}>
            <div style={{ marginBottom: 12 }}>
              <ProductionOrderHeader
                order={popupOrderDetail || (popupEntryWarehousing as Record<string, unknown>)}
                orderNo={String((popupOrderDetail as Record<string, unknown>)?.orderNo || (popupEntryWarehousing as Record<string, unknown>)?.orderNo || '').trim()}
                styleNo={String((popupOrderDetail as Record<string, unknown>)?.styleNo || (popupEntryWarehousing as Record<string, unknown>)?.styleNo || '').trim()}
                styleName={String((popupOrderDetail as Record<string, unknown>)?.styleName || (popupEntryWarehousing as Record<string, unknown>)?.styleName || '').trim()}
                styleId={(popupOrderDetail as Record<string, unknown>)?.styleId || (popupEntryWarehousing as Record<string, unknown>)?.styleId}
                styleCover={(popupOrderDetail as Record<string, unknown>)?.styleCover || (popupEntryWarehousing as Record<string, unknown>)?.styleCover || null}
                color={String((popupOrderDetail as Record<string, unknown>)?.color || (popupEntryWarehousing as Record<string, unknown>)?.color || '').trim()}
                totalQuantity={toNumberSafe((popupOrderDetail as Record<string, unknown>)?.orderQuantity)}
                coverSize={160}
                qrSize={120}
              />
            </div>
            <div className="order-flow-section">
              <div className="order-flow-section-title">本次质检入库</div>
              <div className="order-flow-summary-top">
                <div className="order-flow-summary-left">
                  <StyleCoverThumb
                    styleId={(popupEntryWarehousing as Record<string, unknown>)?.styleId}
                    styleNo={(popupEntryWarehousing as Record<string, unknown>)?.styleNo}
                    src={(popupOrderDetail as Record<string, unknown>)?.styleCover || (popupEntryWarehousing as Record<string, unknown>)?.styleCover || null}
                    size={84}
                    borderRadius={12}
                  />
                  <div className="order-flow-summary-meta">
                    <div className="order-flow-summary-title-row">
                      <div className="order-flow-summary-title">{String((popupEntryWarehousing as Record<string, unknown>)?.warehousingNo || whNo || '').trim() || '-'}</div>
                      {(() => {
                        const s = String((popupEntryWarehousing as Record<string, unknown>)?.qualityStatus || '').trim();
                        if (!s) return null;
                        const { text, color } = getQualityStatusConfig(s as Record<string, unknown>);
                        return <Tag color={color}>{text}</Tag>;
                      })()}
                    </div>
                    <div className="order-flow-summary-sub">
                      <span>订单号：{String((popupEntryWarehousing as Record<string, unknown>)?.orderNo || '').trim() || '-'}</span>
                      <span>仓库：{String((popupEntryWarehousing as Record<string, unknown>)?.warehouse || '').trim() || '-'}</span>
                      <span>质检时间：{String((popupEntryWarehousing as Record<string, unknown>)?.createTime || '').trim() ? formatDateTime((popupEntryWarehousing as Record<string, unknown>)?.createTime) : '-'}</span>
                      <span>完成时间：{String((popupEntryWarehousing as Record<string, unknown>)?.warehousingEndTime || '').trim() ? formatDateTime((popupEntryWarehousing as Record<string, unknown>)?.warehousingEndTime) : '-'}</span>
                    </div>
                  </div>
                </div>

                <div className="order-flow-metrics">
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">质检数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((popupEntryWarehousing as Record<string, unknown>)?.warehousingQuantity)}</div>
                  </div>
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">合格数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((popupEntryWarehousing as Record<string, unknown>)?.qualifiedQuantity)}</div>
                  </div>
                  <div className="order-flow-metric">
                    <div className="order-flow-metric-label">不合格数量</div>
                    <div className="order-flow-metric-value">{toNumberSafe((popupEntryWarehousing as Record<string, unknown>)?.unqualifiedQuantity)}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="order-flow-section" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div className="order-flow-section-title">下单详细信息</div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <Table
                  size="small"
                  rowKey="key"
                  loading={popupOrderDetailLoading}
                  pagination={false}
                  dataSource={popupOrderLineWarehousingRows}
                  sticky
                  scroll={{ x: 920, y: 260 }}
                  columns={[
                    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span> },
                    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140, ellipsis: true },
                    { title: '颜色', dataIndex: 'color', key: 'color', width: 120, ellipsis: true },
                    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
                    { title: '码数', dataIndex: 'size', key: 'size', width: 120, ellipsis: true },
                    { title: '已入库数', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 110, align: 'right' as const },
                    { title: '未入库数', dataIndex: 'unwarehousedQuantity', key: 'unwarehousedQuantity', width: 110, align: 'right' as const },
                  ]}
                  summary={(pageData) => {
                    const totals = pageData.reduce(
                      (acc, r) => {
                        acc.quantity += toNumberSafe((r as Record<string, unknown>)?.quantity);
                        acc.warehousedQuantity += toNumberSafe((r as Record<string, unknown>)?.warehousedQuantity);
                        acc.unwarehousedQuantity += toNumberSafe((r as Record<string, unknown>)?.unwarehousedQuantity);
                        return acc;
                      },
                      { quantity: 0, warehousedQuantity: 0, unwarehousedQuantity: 0 }
                    );
                    return (
                      <Table.Summary>
                        <Table.Summary.Row>
                          <Table.Summary.Cell index={0}>汇总</Table.Summary.Cell>
                          <Table.Summary.Cell index={1} />
                          <Table.Summary.Cell index={2} />
                          <Table.Summary.Cell index={3} align="right">{totals.quantity}</Table.Summary.Cell>
                          <Table.Summary.Cell index={4} />
                          <Table.Summary.Cell index={5} align="right">{totals.warehousedQuantity}</Table.Summary.Cell>
                          <Table.Summary.Cell index={6} align="right">{totals.unwarehousedQuantity}</Table.Summary.Cell>
                        </Table.Summary.Row>
                      </Table.Summary>
                    );
                  }}
                />
              </div>
            </div>

            <div className="order-flow-section">
              <div className="order-flow-section-title">不合格信息</div>
              <div style={{ padding: 12 }}>
                <div className="order-flow-field" style={{ marginBottom: 10 }}>
                  <div className="order-flow-field-label">次品类别</div>
                  <div className="order-flow-field-value">{getDefectCategoryLabel((popupEntryWarehousing as Record<string, unknown>)?.defectCategory)}</div>
                </div>
                <div className="order-flow-field" style={{ marginBottom: 10 }}>
                  <div className="order-flow-field-label">处理方式</div>
                  <div className="order-flow-field-value">{getDefectRemarkLabel((popupEntryWarehousing as Record<string, unknown>)?.defectRemark)}</div>
                </div>
                <div className="order-flow-field" style={{ marginBottom: 10 }}>
                  <div className="order-flow-field-label">返修备注</div>
                  <div className="order-flow-field-value">{String((popupEntryWarehousing as Record<string, unknown>)?.repairRemark || '').trim() || '-'}</div>
                </div>

                {(() => {
                  const urls = parseUrlsValue((popupEntryWarehousing as Record<string, unknown>)?.unqualifiedImageUrls);
                  if (!urls.length) return <div style={{ color: 'rgba(0,0,0,0.45)' }}>-</div>;
                  return (
                    <Space wrap size={10}>
                      {urls.map((url) => (
                        <img
                          key={url}
                          src={url}
                          alt=""
                          width={84}
                          height={84}
                          style={{ objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
                          onClick={() => {
                            setPreviewUrl(url);
                            setPreviewTitle('图片预览');
                            setPreviewOpen(true);
                          }}
                        />
                      ))}
                    </Space>
                  );
                })()}
              </div>
            </div>
          </Card>
        </div>
      </ResizableModal>
    );
  };

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">{isEntryPage ? '质检入库详情' : '质检入库'}</h2>
            <Space wrap>
              {isEntryPage ? (
                <Button type="primary" onClick={() => navigate(paths.warehousing, { replace: true })}>
                  返回
                </Button>
              ) : (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openDialog()}>
                  新增质检
                </Button>
              )}
            </Space>
          </div>

          {isEntryPage ? (
            <>
              <Card size="small" className="order-flow-detail" style={{ marginTop: 12 }} loading={entryLoading}>
                <div style={{ marginBottom: 12 }}>
                  <ProductionOrderHeader
                    order={orderDetail || (entryWarehousing as Record<string, unknown>)}
                    orderNo={String((orderDetail as Record<string, unknown>)?.orderNo || (entryWarehousing as Record<string, unknown>)?.orderNo || '').trim()}
                    styleNo={String((orderDetail as Record<string, unknown>)?.styleNo || (entryWarehousing as Record<string, unknown>)?.styleNo || '').trim()}
                    styleName={String((orderDetail as Record<string, unknown>)?.styleName || (entryWarehousing as Record<string, unknown>)?.styleName || '').trim()}
                    styleId={(orderDetail as Record<string, unknown>)?.styleId || (entryWarehousing as Record<string, unknown>)?.styleId}
                    styleCover={(orderDetail as Record<string, unknown>)?.styleCover || (entryWarehousing as Record<string, unknown>)?.styleCover || null}
                    color={String((orderDetail as Record<string, unknown>)?.color || (entryWarehousing as Record<string, unknown>)?.color || '').trim()}
                    totalQuantity={toNumberSafe((orderDetail as Record<string, unknown>)?.orderQuantity)}
                    coverSize={160}
                    qrSize={120}
                  />
                </div>
                <div className="order-flow-section">
                  <div className="order-flow-section-title">本次质检入库</div>
                  <div className="order-flow-summary-top">
                    <div className="order-flow-summary-left">
                      <StyleCoverThumb
                        styleId={(entryWarehousing as Record<string, unknown>)?.styleId}
                        styleNo={(entryWarehousing as Record<string, unknown>)?.styleNo}
                        src={(orderDetail as Record<string, unknown>)?.styleCover || (entryWarehousing as Record<string, unknown>)?.styleCover || null}
                        size={84}
                        borderRadius={12}
                      />
                      <div className="order-flow-summary-meta">
                        <div className="order-flow-summary-title-row">
                          <div className="order-flow-summary-title">{String((entryWarehousing as Record<string, unknown>)?.warehousingNo || routeWarehousingNo || '').trim() || '-'}</div>
                          {(() => {
                            const s = String((entryWarehousing as Record<string, unknown>)?.qualityStatus || '').trim();
                            if (!s) return null;
                            const { text, color } = getQualityStatusConfig(s as Record<string, unknown>);
                            return <Tag color={color}>{text}</Tag>;
                          })()}
                        </div>
                        <div className="order-flow-summary-sub">
                          <span>订单号：{String((entryWarehousing as Record<string, unknown>)?.orderNo || '').trim() || '-'}</span>
                          <span>仓库：{String((entryWarehousing as Record<string, unknown>)?.warehouse || '').trim() || '-'}</span>
                          <span>质检时间：{String((entryWarehousing as Record<string, unknown>)?.createTime || '').trim() ? formatDateTime((entryWarehousing as Record<string, unknown>)?.createTime) : '-'}</span>
                          <span>完成时间：{String((entryWarehousing as Record<string, unknown>)?.warehousingEndTime || '').trim() ? formatDateTime((entryWarehousing as Record<string, unknown>)?.warehousingEndTime) : '-'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="order-flow-metrics">
                      <div className="order-flow-metric">
                        <div className="order-flow-metric-label">质检数量</div>
                        <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as Record<string, unknown>)?.warehousingQuantity)}</div>
                      </div>
                      <div className="order-flow-metric">
                        <div className="order-flow-metric-label">合格数量</div>
                        <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as Record<string, unknown>)?.qualifiedQuantity)}</div>
                      </div>
                      <div className="order-flow-metric">
                        <div className="order-flow-metric-label">不合格数量</div>
                        <div className="order-flow-metric-value">{toNumberSafe((entryWarehousing as Record<string, unknown>)?.unqualifiedQuantity)}</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="order-flow-section">
                  <div className="order-flow-section-title">下单详细信息</div>
                  <Table
                    size="small"
                    rowKey="key"
                    loading={orderDetailLoading}
                    pagination={false}
                    dataSource={orderLineWarehousingRows}
                    scroll={{ x: 920 }}
                    columns={[
                      { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 170, render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span> },
                      { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140, ellipsis: true },
                      { title: '颜色', dataIndex: 'color', key: 'color', width: 120, ellipsis: true },
                      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 90, align: 'right' as const },
                      { title: '码数', dataIndex: 'size', key: 'size', width: 120, ellipsis: true },
                      { title: '已入库数', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 110, align: 'right' as const },
                      { title: '未入库数', dataIndex: 'unwarehousedQuantity', key: 'unwarehousedQuantity', width: 110, align: 'right' as const },
                    ]}
                    summary={(pageData) => {
                      const totals = pageData.reduce(
                        (acc, r) => {
                          acc.quantity += toNumberSafe((r as Record<string, unknown>)?.quantity);
                          acc.warehousedQuantity += toNumberSafe((r as Record<string, unknown>)?.warehousedQuantity);
                          acc.unwarehousedQuantity += toNumberSafe((r as Record<string, unknown>)?.unwarehousedQuantity);
                          return acc;
                        },
                        { quantity: 0, warehousedQuantity: 0, unwarehousedQuantity: 0 }
                      );
                      return (
                        <Table.Summary>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0}>汇总</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} />
                            <Table.Summary.Cell index={2} />
                            <Table.Summary.Cell index={3} align="right">{totals.quantity}</Table.Summary.Cell>
                            <Table.Summary.Cell index={4} />
                            <Table.Summary.Cell index={5} align="right">{totals.warehousedQuantity}</Table.Summary.Cell>
                            <Table.Summary.Cell index={6} align="right">{totals.unwarehousedQuantity}</Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      );
                    }}
                  />
                </div>
              </Card>

              <Card size="small" className="order-flow-tabs-card" style={{ marginTop: 12 }} loading={entryLoading || detailLoading}>
                <div className="order-flow-module-stack">
                  <div className="order-flow-module">
                    <div className="order-flow-module-title">明细记录</div>
                    <Table
                      size="small"
                      rowKey={(r) => String((r as Record<string, unknown>)?.id || `${(r as Record<string, unknown>)?.cuttingBundleQrCode || ''}-${(r as Record<string, unknown>)?.size || ''}-${(r as Record<string, unknown>)?.createTime || ''}`)}
                      columns={warehousingDetailColumns}
                      dataSource={detailWarehousingItems}
                      pagination={{ pageSize: 20, showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], simple: true }}
                      scroll={{ x: 1520 }}
                    />
                  </div>

                  <div className="order-flow-module">
                    <div className="order-flow-module-title">不合格图片</div>
                    <div style={{ padding: 12 }}>
                      <div className="order-flow-field" style={{ marginBottom: 10 }}>
                        <div className="order-flow-field-label">次品类别</div>
                        <div className="order-flow-field-value">{getDefectCategoryLabel((entryWarehousing as Record<string, unknown>)?.defectCategory)}</div>
                      </div>
                      <div className="order-flow-field" style={{ marginBottom: 10 }}>
                        <div className="order-flow-field-label">处理方式</div>
                        <div className="order-flow-field-value">{getDefectRemarkLabel((entryWarehousing as Record<string, unknown>)?.defectRemark)}</div>
                      </div>
                      <div className="order-flow-field" style={{ marginBottom: 10 }}>
                        <div className="order-flow-field-label">返修备注</div>
                        <div className="order-flow-field-value">{String((entryWarehousing as Record<string, unknown>)?.repairRemark || '').trim() || '-'}</div>
                      </div>
                      {unqualifiedFileList.length ? (
                        <Space wrap size={10}>
                          {unqualifiedFileList
                            .map((f) => String((f as Record<string, unknown>)?.url || '').trim())
                            .filter(Boolean)
                            .map((url) => (
                              <img
                                key={url}
                                src={url}
                                alt=""
                                width={84}
                                height={84}
                                style={{ objectFit: 'cover', borderRadius: 10, cursor: 'pointer' }}
                                onClick={() => {
                                  setPreviewUrl(url);
                                  setPreviewTitle('图片预览');
                                  setPreviewOpen(true);
                                }}
                              />
                            ))}
                        </Space>
                      ) : (
                        <div style={{ color: 'rgba(0,0,0,0.45)' }}>-</div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </>
          ) : (
            <>
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
                      }}>
                        重置
                      </Button>
                    </Space>
                  </Form.Item>
                </Form>
              </Card>

              <ResizableTable
                storageKey="warehousing-table"
                columns={columns}
                dataSource={tableData}
                rowKey="id"
                loading={loading}
                scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
                rowClassName={() => 'clickable-row'}
                onRow={(record: unknown) => {
                  return {
                    onClick: (e) => {
                      const target = e.target as HTMLElement | null;
                      if (!target) return;
                      const interactive = target.closest(
                        'a,button,input,textarea,select,option,[role="button"],[role="menuitem"],.ant-dropdown-trigger,.ant-btn'
                      );
                      if (interactive) return;
                      goToWarehousingDetail(record as Record<string, unknown>);
                    },
                  };
                }}
                pagination={{
                  current: queryParams.page,
                  pageSize: queryParams.pageSize,
                  total: total,
                  onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })
                }}
              />
            </>
          )}
        </Card>
      </div>

      <IndependentWarehousingDetailPopup />

      {/* 质检入库详情弹窗 */}
      <ResizableModal
        title={currentWarehousing ? '质检详情' : '新增质检'}
        open={visible}
        onCancel={closeDialog}
        footer={null}
        width={modalWidth}
        initialHeight={modalInitialHeight}
        tableDensity="auto"
        contentShiftX={12}
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
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="defectCategory" label="次品类别">
                  <Select disabled options={DEFECT_CATEGORY_OPTIONS} placeholder="-" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="defectRemark" label="处理方式">
                  <Select disabled options={DEFECT_REMARK_OPTIONS} placeholder="-" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={6}>
                <Form.Item name="repairRemark" label="返修备注">
                  <Input disabled />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} lg={18}>
                <Form.Item name="createTime" label="质检时间">
                  <Input disabled />
                </Form.Item>
              </Col>
            </Row>
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
                            const st = String((o as Record<string, unknown>)?.status || '').trim().toLowerCase();
                            if (st === 'completed') return false;
                            const cuttingQty = Number((o as Record<string, unknown>)?.cuttingQuantity || 0) || 0;
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
                              defectCategory: undefined,
                              defectRemark: undefined,
                              repairRemark: '',
                            });
                            setBundles([]);
                            setQualifiedWarehousedBundleQrs([]);
                            setBatchSelectedBundleQrs([]);
                            setBatchQtyByQr({});
                            return;
                          }
                          const order = (option as Record<string, unknown>)?.data || orderOptions.find((o) => o.id === value);
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
                              unqualifiedFileList.map((f) => String((f as Record<string, unknown>)?.url || '').trim()).filter(Boolean).slice(0, 4)
                            ),
                            defectCategory: undefined,
                            defectRemark: undefined,
                            repairRemark: '',
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
                              <Tag color={batchSelectedBundleQrs.length ? 'geekblue' : 'default'}>
                                数量 {batchSelectedBundleQrs.length ? batchSelectedSummary.totalQty : 0}
                              </Tag>
                            </div>
                          ),
                          children: (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <Space wrap>
                                <Button onClick={handleBatchSelectAll} disabled={!batchSelectableQrs.length}>
                                  全选
                                </Button>
                                <Button onClick={handleBatchSelectInvert} disabled={!batchSelectableQrs.length}>
                                  反选
                                </Button>
                                <Button onClick={handleBatchSelectClear} disabled={!batchSelectedBundleQrs.length}>
                                  清空已选
                                </Button>
                              </Space>

                              {batchSelectedBundleQrs.length ? (
                                <div
                                  style={{
                                    border: '1px solid rgba(0,0,0,0.06)',
                                    borderRadius: 8,
                                    padding: '8px 10px',
                                    background: 'rgba(0,0,0,0.02)',
                                  }}
                                >
                                  <Space wrap size={6}>
                                    <Tag color="geekblue">合计数量 {batchSelectedSummary.totalQty}</Tag>
                                    <Tag color="success">非返修数量 {batchSelectedSummary.nonBlockedQty}</Tag>
                                    <Tag color={batchSelectedSummary.blockedCount ? 'warning' : 'default'}>
                                      次品待返修 {batchSelectedSummary.blockedCount}
                                    </Tag>
                                    <Tag color={batchSelectedSummary.blockedCount ? 'processing' : 'default'}>
                                      次品已选数量 {batchSelectedSummary.blockedQty}
                                    </Tag>
                                    <Tag color={batchSelectedSummary.blockedCount ? 'cyan' : 'default'}>
                                      次品剩余可入库合计 {batchSelectedSummary.blockedRemainingSum}
                                    </Tag>
                                    {batchSelectedSummary.blockedMissing ? (
                                      <Tag color="default">返修统计计算中 {batchSelectedSummary.blockedMissing}</Tag>
                                    ) : null}
                                    {batchSelectedSummary.blockedCount && !batchSelectedSummary.statsMissing ? (
                                      <>
                                        <Tag color="processing">返修池合计 {batchSelectedSummary.repairPoolSum}</Tag>
                                        <Tag color="geekblue">已返修入库合计 {batchSelectedSummary.repairedOutSum}</Tag>
                                      </>
                                    ) : null}
                                    {batchSelectedHasBlocked ? (
                                      <Tag color="error">包含次品待返修，无法批量合格质检</Tag>
                                    ) : null}
                                  </Space>
                                </div>
                              ) : null}

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
                                      render: (v: unknown) => (v ? String(v) : '-'),
                                    },
                                    {
                                      title: '颜色',
                                      dataIndex: 'color',
                                      width: 100,
                                      render: (v: unknown) => (String(v || '').trim() ? String(v) : '-'),
                                    },
                                    {
                                      title: '码数',
                                      dataIndex: 'size',
                                      width: 100,
                                      render: (v: unknown) => (String(v || '').trim() ? String(v) : '-'),
                                    },
                                    {
                                      title: '数量',
                                      dataIndex: 'quantity',
                                      width: 80,
                                      render: (v: unknown) => String(Number(v || 0) || 0),
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
                                <Tag color={batchSelectedBundleQrs.length ? 'geekblue' : 'default'}>
                                  数量 {batchSelectedBundleQrs.length ? batchSelectedSummary.totalQty : 0}
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
                                  const rawStatus = String((b as Record<string, unknown>)?.status || '').trim();
                                  const isBlocked = isBundleBlockedForWarehousing(rawStatus);
                                  const remaining = isBlocked ? bundleRepairRemainingByQr[qr] : undefined;
                                  const maxQty = isBlocked
                                    ? Math.max(0, Number(remaining === undefined ? 0 : remaining) || 0)
                                    : Math.max(0, Number(b?.quantity || 0) || 0);
                                  const currentQty = Math.max(0, Math.min(maxQty, Number(batchQtyByQr[qr] || 0) || 0));
                                  return (
                                    <div key={qr} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                      <div style={{ flex: 1, minWidth: 240 }}>
                                        {`菲号：${qr}`}
                                        {b?.bundleNo ? `｜扎号：${b.bundleNo}` : ''}
                                        {b?.color ? `｜颜色：${b.color}` : ''}
                                        {b?.size ? `｜码数：${b.size}` : ''}
                                        {isBlocked ? `｜可入库：${maxQty}` : ''}
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
                </div>

                {isSingleSelectedBundleBlocked ? (
                  <div className="wh-line">
                    <div className="wh-label">返修统计</div>
                    <div className="wh-control" style={{ flex: 1, minWidth: 280 }}>
                      <Space wrap size={6}>
                        <Tag color="processing">
                          返修池 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.repairPool : '-'}
                        </Tag>
                        <Tag color="geekblue">
                          已返修入库 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.repairedOut : '-'}
                        </Tag>
                        <Tag color="success">
                          剩余可入库 {singleSelectedBundleRepairStats ? singleSelectedBundleRepairStats.remaining : '-'}
                        </Tag>
                      </Space>
                    </div>
                  </div>
                ) : null}

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
                        max={isSingleSelectedBundleBlocked ? 0 : Math.max(0, Number(watchedWarehousingQty || 0) || 0)}
                        disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked}
                        onChange={(v) => {
                          const total = Number(form.getFieldValue('warehousingQuantity') || 0) || 0;
                          const uq = Math.max(0, Math.min(total, Number(v || 0) || 0));
                          const q = Math.max(0, total - uq);
                          form.setFieldsValue({
                            unqualifiedQuantity: uq,
                            qualifiedQuantity: q,
                            qualityStatus: uq > 0 ? 'unqualified' : 'qualified',
                            defectCategory: uq > 0 ? form.getFieldValue('defectCategory') : undefined,
                            defectRemark: uq > 0 ? form.getFieldValue('defectRemark') : undefined,
                            unqualifiedImageUrls: uq > 0 ? form.getFieldValue('unqualifiedImageUrls') : '[]',
                          });
                          if (uq <= 0) {
                            setUnqualifiedFileList([]);
                          }
                        }}
                      />
                    </Form.Item>
                  </div>
                </div>

                <div className="wh-line">
                  <div className="wh-label">次品类别</div>
                  <div className="wh-control" style={{ width: 240 }}>
                    <Form.Item
                      name="defectCategory"
                      style={{ marginBottom: 0 }}
                      rules={[
                        ({ getFieldValue }) => ({
                          validator: async (_: any, value: any) => {
                            const uq = Number(getFieldValue('unqualifiedQuantity') || 0) || 0;
                            if (uq > 0 && !String(value || '').trim()) {
                              throw new Error('请选择次品类别');
                            }
                          },
                        }),
                      ]}
                    >
                      <Select
                        placeholder="请选择"
                        options={DEFECT_CATEGORY_OPTIONS}
                        disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked || (Number(watchedUnqualifiedQty || 0) || 0) <= 0}
                        allowClear
                      />
                    </Form.Item>
                  </div>
                  <div className="wh-label" style={{ width: 72 }}>处理方式</div>
                  <div className="wh-control" style={{ flex: 1, minWidth: 240 }}>
                    <Form.Item
                      name="defectRemark"
                      style={{ marginBottom: 0 }}
                      rules={[
                        ({ getFieldValue }) => ({
                          validator: async (_: any, value: any) => {
                            const uq = Number(getFieldValue('unqualifiedQuantity') || 0) || 0;
                            if (uq > 0 && !String(value || '').trim()) {
                              throw new Error('请选择处理方式');
                            }
                          },
                        }),
                      ]}
                    >
                      <Select
                        placeholder="请选择"
                        options={DEFECT_REMARK_OPTIONS}
                        disabled={!watchedBundleQr || batchSelectedBundleQrs.length !== 1 || isSingleSelectedBundleBlocked || (Number(watchedUnqualifiedQty || 0) || 0) <= 0}
                        allowClear
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
                      disabled={(Number(watchedUnqualifiedQty || 0) || 0) <= 0}
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
                        return uploadOneUnqualifiedImage(file as Record<string, unknown>);
                      }}
                      onPreview={(file) => {
                        const url = String((file as Record<string, unknown>)?.url || (file as Record<string, unknown>)?.thumbUrl || '').trim();
                        if (!url) return;
                        setPreviewUrl(url);
                        setPreviewTitle(String((file as Record<string, unknown>)?.name || '图片预览'));
                        setPreviewOpen(true);
                      }}
                      onRemove={(file) => {
                        setUnqualifiedFileList((prev) => {
                          const next = prev.filter((f) => f.uid !== file.uid);
                          form.setFieldsValue({
                            unqualifiedImageUrls: JSON.stringify(
                              next
                                .map((f) => String((f as Record<string, unknown>)?.url || '').trim())
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
                    <Form.Item
                      name="repairRemark"
                      style={{ marginBottom: 0 }}
                      rules={isSingleSelectedBundleBlocked ? [{ required: true, message: '请输入返修备注' }] : undefined}
                    >
                      <Input.TextArea rows={2} placeholder="请输入返修备注" />
                    </Form.Item>
                  </div>
                </div>

              </div>

              <div className="modal-sticky-footer">
                <Button onClick={closeDialog}>取消</Button>
                <Button
                  onClick={() => handleBatchQualifiedSubmit()}
                  disabled={!batchSelectedBundleQrs.length || batchSelectedHasBlocked}
                  loading={submitLoading}
                >
                  批量合格质检
                </Button>
                <Button type="primary" onClick={() => handleSubmit()} loading={submitLoading}>
                  保存
                </Button>
              </div>
            </div>
          </Form>
        )}
      </ResizableModal>

      <ResizableModal
        open={previewOpen}
        title={previewTitle}
        footer={
          <div className="modal-footer-actions">
            <Button
              onClick={() => {
                setPreviewOpen(false);
                setPreviewUrl('');
                setPreviewTitle('');
              }}
            >
              关闭
            </Button>
          </div>
        }
        onCancel={() => {
          setPreviewOpen(false);
          setPreviewUrl('');
          setPreviewTitle('');
        }}
        width={600}
        minWidth={600}
        minHeight={600}
        initialHeight={600}
        autoFontSize={false}
        scaleWithViewport={false}
      >
        {previewUrl ? (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <img
              src={previewUrl}
              alt=""
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          </div>
        ) : null}
      </ResizableModal>

      <ResizableModal
        title="入库"
        open={warehousingModalOpen}
        onCancel={closeWarehousingModal}
        onOk={submitWarehousing}
        okText="入库"
        cancelText="取消"
        confirmLoading={warehousingModalLoading}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        autoFontSize={false}
        destroyOnHidden
      >
        <Form layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="订单号">
                <Input value={warehousingModalOrderNo || '-'} disabled />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="质检入库号">
                <Input value={warehousingModalWarehousingNo || '-'} disabled />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="仓库" required>
                <Select
                  placeholder="请选择仓库"
                  value={warehousingModalWarehouse || undefined}
                  onChange={(v) => setWarehousingModalWarehouse(String(v || '').trim())}
                >
                  <Option value="A仓">A仓</Option>
                  <Option value="B仓">B仓</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

export default ProductWarehousing;
