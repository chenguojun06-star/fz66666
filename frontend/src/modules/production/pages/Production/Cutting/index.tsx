import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Select, Space, Tag } from 'antd';
import { EyeOutlined, LoginOutlined, PlusOutlined, RollbackOutlined, EditOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import UniversalCardView from '@/components/common/UniversalCardView';
import { useSync } from '@/utils/syncManager';
import ResizableModal, {
  useResizableModalTableScrollY,
} from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import api, { compareSizeAsc, fetchProductionOrderDetail, parseProductionOrderLines, useProductionOrderFrozenCache } from '@/utils/api';
import { QRCodeCanvas } from 'qrcode.react';
import QRCodeBox from '@/components/common/QRCodeBox';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { CuttingTask, MaterialPurchase } from '@/types/production';
import { ProductionOrderHeader, StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { useNavigate, useParams } from 'react-router-dom';
import { getMaterialTypeLabel, getMaterialTypeSortKey } from '@/utils/materialType';
import { useViewport } from '@/utils/useViewport';
import { safePrint } from '@/utils/safePrint';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import type { Dayjs } from 'dayjs';
import {
  ModalHeaderCard,
  ModalField,
  ModalPrimaryField,
  ModalFieldRow,
  ModalFieldGrid,
  ModalSideLayout,
  ModalVerticalStack,
} from '@/components/common/ModalContentLayout';
import './styles.css';

const { Option } = Select;

interface CuttingBundleRow {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleNo?: string;
  skuNo?: string;
  color: string;
  size: string;
  quantity: number;
  bundleNo?: number;
  qrCode?: string;
  status?: string;
}

interface CuttingQueryParams {
  page: number;
  pageSize: number;
}

interface StyleOption {
  id: number | string;
  styleNo: string;
  styleName?: string;
}

type CuttingPrintPageSize = 'A4' | 'A5';
type CuttingPrintOrientation = 'portrait' | 'landscape';
type CuttingPrintMode = 'grid' | 'single';

const CuttingManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { isMobile, modalWidth } = useViewport();
  const params = useParams();
  const routeOrderNo = useMemo(() => {
    const raw = String((params as Record<string, unknown>)?.orderNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
      // Intentionally empty
      // 忽略错误
      return raw;
    }
  }, [params]);

  const isEntryPage = Boolean(routeOrderNo);

  const editSectionRef = useRef<HTMLDivElement | null>(null);
  const [bundlesInput, setBundlesInput] = useState<CuttingBundleRow[]>([{
    skuNo: '',
    color: '',
    size: '',
    quantity: 0,
  }]);

  const [importLocked, setImportLocked] = useState(false);

  const [queryParams, setQueryParams] = useState<CuttingQueryParams>({
    page: 1,
    pageSize: 10,
  });

  const [listLoading, setListLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [dataSource, setDataSource] = useState<CuttingBundleRow[]>([]);
  const [total, setTotal] = useState(0);

  const [selectedBundleRowKeys, setSelectedBundleRowKeys] = useState<React.Key[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<CuttingBundleRow[]>([]);
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [printBundles, setPrintBundles] = useState<CuttingBundleRow[]>([]);
  const [printUnlocked, setPrintUnlocked] = useState(false);

  const [printConfig, setPrintConfig] = useState({
    pageSize: 'A4' as CuttingPrintPageSize,
    orientation: 'portrait' as CuttingPrintOrientation,
    mode: 'grid' as CuttingPrintMode,
    marginMm: 8,
    cols: 3,
    labelW: 48,
    labelH: 32,
    gap: 2,
    qrSize: 84,
  });

  const [cuttingSortField, setCuttingSortField] = useState<string>('receivedTime');
  const [cuttingSortOrder, setCuttingSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleCuttingSort = (field: string, order: 'asc' | 'desc') => {
    setCuttingSortField(field);
    setCuttingSortOrder(order);
  };

  const [orderId, setOrderId] = useState<string>('');
  const [activeTask, setActiveTask] = useState<CuttingTask | null>(null);

  const [taskQuery, setTaskQuery] = useState({ page: 1, pageSize: 10, status: '' as string, orderNo: '', styleNo: '' });
  const [taskDateRange, setTaskDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskList, setTaskList] = useState<CuttingTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [receiveTaskLoading, setReceiveTaskLoading] = useState(false);
  const [rollbackTaskLoading, setRollbackTaskLoading] = useState(false);

  // 快速编辑状态
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<CuttingTask | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);

  // 快速编辑保存函数
  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await api.put('/production/cutting-task/quick-edit', {
        id: quickEditRecord?.id,
        ...values,
      });
      message.success('编辑成功');
      setQuickEditVisible(false);
      setQuickEditRecord(null);
      await fetchTasks();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '编辑失败');
      throw err;
    } finally {
      setQuickEditSaving(false);
    }
  };

  // Sheet Preview states (previously from useSheetPreview hook)
  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [sheetPreviewTask, setSheetPreviewTask] = useState<CuttingTask | null>(null);
  const [sheetPreviewBundles, setSheetPreviewBundles] = useState<CuttingBundleRow[]>([]);
  const [sheetPreviewPurchaseLoading, setSheetPreviewPurchaseLoading] = useState(false);
  const [sheetPreviewPurchases, setSheetPreviewPurchases] = useState<MaterialPurchase[]>([]);
  const [sheetPreviewOrderDetail, setSheetPreviewOrderDetail] = useState<any>(null);
  const sheetPreviewTableWrapRef = useRef<HTMLDivElement>(null);
  const sheetPreviewTableScrollY = useResizableModalTableScrollY(sheetPreviewTableWrapRef);

  const [entryPurchaseLoading, setEntryPurchaseLoading] = useState(false);
  const [entryPurchases, setEntryPurchases] = useState<MaterialPurchase[]>([]);
  const entryPurchaseReqSeq = useRef(0);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createOrderNo, setCreateOrderNo] = useState('');
  const [createStyleOptions, setCreateStyleOptions] = useState<StyleOption[]>([]);
  const [createStyleLoading, setCreateStyleLoading] = useState(false);
  const [createStyleNo, setCreateStyleNo] = useState<string>('');
  const [createStyleName, setCreateStyleName] = useState<string>('');
  const [createBundles, setCreateBundles] = useState<CuttingBundleRow[]>([{ color: '', size: '', quantity: 0 }]);

  const [entryOrderDetailLoading, setEntryOrderDetailLoading] = useState(false);
  const [entryColorText, setEntryColorText] = useState('');
  const [entrySizeItems, setEntrySizeItems] = useState<Array<{ size: string; quantity: number }>>([]);

  async function fetchAllBundlesByOrderNo(orderNo: string) {
    const on = String(orderNo || '').trim();
    if (!on) return [] as CuttingBundleRow[];
    try {
      const res = await api.get<{ code: number; data: { records: CuttingBundleRow[] } }>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      if (res.code === 200) {
        return (res.data.records || []) as CuttingBundleRow[];
      }
      return [] as CuttingBundleRow[];
    } catch {
      // Intentionally empty
      // 忽略错误
      return [] as CuttingBundleRow[];
    }
  }

  async function fetchSortedPurchasesByOrderNo(orderNo: string) {
    const no = String(orderNo || '').trim();
    if (!no) return [] as MaterialPurchase[];
    try {
      const res = await api.get<{ code: number; data: { records: MaterialPurchase[] } }>('/production/purchase/list', {
        params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' },
      });
      if (res.code !== 200) return [] as MaterialPurchase[];
      const records = (res.data?.records || []) as MaterialPurchase[];
      const sorted = [...records].sort((a: any, b: any) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        const ca = String(a?.materialCode || '');
        const cb = String(b?.materialCode || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
      return sorted as Record<string, unknown>;
    } catch {
      // Intentionally empty
      // 忽略错误
      return [] as MaterialPurchase[];
    }
  }

  // Sheet Preview Functions
  const openSheetPreview = async (task: CuttingTask) => {
    setSheetPreviewTask(task);
    setSheetPreviewOpen(true);
    setSheetPreviewLoading(true);
    setSheetPreviewPurchaseLoading(true);

    try {
      const orderNo = task.productionOrderNo;
      if (orderNo) {
        // Fetch bundles
        const bundles = await fetchAllBundlesByOrderNo(orderNo);
        setSheetPreviewBundles(bundles);

        // Fetch order detail
        const detail = await fetchProductionOrderDetail(orderNo);
        setSheetPreviewOrderDetail(detail);

        // Fetch purchases
        const purchases = await fetchSortedPurchasesByOrderNo(orderNo);
        setSheetPreviewPurchases(purchases);
      }
    } catch (err) {
      message.error('加载数据失败');
    } finally {
      setSheetPreviewLoading(false);
      setSheetPreviewPurchaseLoading(false);
    }
  };

  const downloadSheetCsv = () => {
    if (!sheetPreviewTask || !sheetPreviewBundles.length) return;

    const csv = [
      ['订单号', '款号', '颜色', '尺码', '数量', '扎号', '二维码'],
      ...sheetPreviewBundles.map(b => [
        b.productionOrderNo || '',
        b.styleNo || '',
        b.color || '',
        b.size || '',
        b.quantity || '',
        b.bundleNo || '',
        b.qrCode || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `裁剪单_${sheetPreviewTask.productionOrderNo}_${Date.now()}.csv`;
    link.click();
  };

  const triggerSheetPrint = () => {
    safePrint();
  };

  const fetchStyleInfoOptions = async (keyword?: string) => {
    setCreateStyleLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records: Array<{ id: string; styleNo: string; styleName: string }> } }>('/style/info/list', {
        params: { page: 1, pageSize: 20, styleNo: String(keyword || '').trim() },
      });
      if (res.code === 200) {
        const records = (res.data?.records || []) as Record<string, unknown>[];
        setCreateStyleOptions(
          records
            .map((r) => ({
              id: r?.id,
              styleNo: String(r?.styleNo || '').trim(),
              styleName: String(r?.styleName || '').trim(),
            }))
            .filter((x) => x.styleNo)
        );
      }
    } catch {
      // Intentionally empty
      // 忽略错误
    } finally {
      setCreateStyleLoading(false);
    }
  };

  const openCreateTask = () => {
    setCreateOrderNo('');
    setCreateStyleNo('');
    setCreateStyleName('');
    setCreateBundles([{ color: '', size: '', quantity: 0 }]);
    setCreateTaskOpen(true);
    fetchStyleInfoOptions('');
  };

  const handleCreateBundleChange = (index: number, key: keyof CuttingBundleRow, value: any) => {
    setCreateBundles((prev) => {
      const next = prev.slice();
      const row = { ...next[index], [key]: value } as Record<string, unknown>;
      next[index] = row;
      return next;
    });
  };

  const handleCreateBundleAdd = () => {
    setCreateBundles((prev) => [...prev, { color: '', size: '', quantity: 0 }]);
  };

  const handleCreateBundleRemove = (index: number) => {
    setCreateBundles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmitCreateTask = async () => {
    const styleNo = String(createStyleNo || '').trim();
    if (!styleNo) {
      message.error('请选择款号');
      return;
    }
    const validItems = createBundles
      .map((x) => ({
        color: String(x.color || '').trim(),
        size: String(x.size || '').trim(),
        quantity: Number(x.quantity || 0) || 0,
      }))
      .filter((x) => x.quantity > 0);
    if (!validItems.length) {
      message.error('请至少录入一行有效的颜色/尺码/数量');
      return;
    }
    const invalid = validItems.find((x) => !x.color || !x.size);
    if (invalid) {
      message.error('颜色/尺码不能为空');
      return;
    }

    setCreateTaskSubmitting(true);
    try {
      const res = await api.post<{ code: number; message: string }>('/production/cutting-task/custom/create', {
        orderNo: String(createOrderNo || '').trim() || undefined,
        styleNo,
        receiverId: user?.id,
        receiverName: (user as Record<string, unknown>)?.name,
        bundles: validItems,
      });
      if (res.code === 200) {
        message.success('新建裁剪任务成功');
        setCreateTaskOpen(false);
        fetchTasks();
        const on = String(res.data?.productionOrderNo || '').trim();
        if (on) {
          navigate(`/production/cutting/task/${encodeURIComponent(on)}`);
        }
      } else {
        message.error(res.message || '新建失败');
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      message.error('新建失败');
    } finally {
      setCreateTaskSubmitting(false);
    }
  };

  const activeOrderNo = useMemo(() => String((activeTask as Record<string, unknown>)?.productionOrderNo ?? '').trim(), [activeTask]);

  useEffect(() => {
    if (!isEntryPage) return;
    const no = activeOrderNo;
    const seq = (entryPurchaseReqSeq.current += 1);
    if (!no) {
      setEntryPurchases([]);
      setEntryPurchaseLoading(false);
      return;
    }
    setEntryPurchaseLoading(true);
    setEntryPurchases([]);
    fetchSortedPurchasesByOrderNo(no)
      .then((list) => {
        if (seq === entryPurchaseReqSeq.current) setEntryPurchases(list);
      })
      .finally(() => {
        if (seq === entryPurchaseReqSeq.current) setEntryPurchaseLoading(false);
      });
  }, [isEntryPage, activeOrderNo]);

  const openBatchPrint = () => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!selectedBundles.length) {
      message.warning('请先勾选要打印的扎号');
      return;
    }
    setPrintBundles(selectedBundles.slice());
    setPrintPreviewOpen(true);
  };

  const clearBundleSelection = () => {
    setSelectedBundleRowKeys([]);
    setSelectedBundles([]);
  };

  const triggerPrint = () => {
    if (!printUnlocked) {
      message.warning('请先保存生成裁剪单后再打印');
      return;
    }
    if (!printBundles.length) {
      message.warning('没有可打印的内容');
      return;
    }

    try {
      const id = 'cutting-dynamic-print-page-style';
      let el = document.getElementById(id) as HTMLStyleElement | null;
      if (!el) {
        el = document.createElement('style');
        el.id = id;
        document.head.appendChild(el);
      }
      const margin = `${Number(printConfig.marginMm) || 0}mm`;
      const size =
        printConfig.mode === 'single'
          ? `${Number(printConfig.labelW) || 48}mm ${Number(printConfig.labelH) || 32}mm`
          : `${printConfig.pageSize} ${printConfig.orientation}`;
      el.textContent = `@media print { @page { size: ${size}; margin: ${margin}; } }`;
    } catch {
      // Intentionally empty
      // 忽略错误
    }

    setPrintPreviewOpen(false);
    setTimeout(() => {
      window.print();
    }, 240);
  };

  const isAdmin = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  useEffect(() => {
    if (!isEntryPage) return;
    const oid = String(orderId || (activeTask as Record<string, unknown>)?.productionOrderId || '').trim();
    if (!oid) {
      setEntryOrderDetailLoading(false);
      setEntryColorText('');
      setEntrySizeItems([]);
      return;
    }

    let cancelled = false;
    setEntryOrderDetailLoading(true);
    void (async () => {
      try {
        const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: false });
        if (cancelled) return;
        const lines = detail ? parseProductionOrderLines(detail).slice() : [];
        lines.sort((a: any, b: any) => {
          const ca = String(a?.color || '').trim();
          const cb = String(b?.color || '').trim();
          if (ca && cb) {
            const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
            if (byColor !== 0) return byColor;
          }
          return compareSizeAsc(String(a?.size || ''), String(b?.size || ''));
        });
        const activeColor = String((activeTask as Record<string, unknown>)?.color || '').trim();
        const uniqueColors = Array.from(
          new Set(lines.map((x: any) => String(x?.color || '').trim()).filter(Boolean))
        );
        const derivedColor = uniqueColors.length ? uniqueColors.join(' / ') : String((detail as Record<string, unknown>)?.color || '').trim();
        setEntryColorText(activeColor || derivedColor);

        const filtered = activeColor
          ? lines.filter((x: any) => String(x?.color || '').trim() === activeColor)
          : lines;
        const sizeMap = new Map<string, number>();
        for (const l of filtered) {
          const size = String((l as Record<string, unknown>)?.size || '').trim();
          if (!size) continue;
          const qty = Number((l as Record<string, unknown>)?.quantity ?? 0) || 0;
          sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
        }
        const items = Array.from(sizeMap.entries())
          .map(([size, quantity]) => ({ size, quantity }))
          .sort((a, b) => compareSizeAsc(a.size, b.size));
        setEntrySizeItems(items);
      } catch {
        // Intentionally empty
        // 忽略错误
        if (cancelled) return;
        setEntryColorText('');
        setEntrySizeItems([]);
      } finally {
        if (!cancelled) setEntryOrderDetailLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isEntryPage, orderId, activeTask?.id, (activeTask as Record<string, unknown>)?.color]);

  const splitQuantity = (totalQty: number, perBundle = 20) => {
    const qty = Math.max(0, Number(totalQty) || 0);
    const per = Math.max(1, Number(perBundle) || 20);
    const out: number[] = [];
    let remain = qty;
    while (remain > 0) {
      out.push(Math.min(per, remain));
      remain -= per;
    }
    return out;
  };

  const frozenOrderIds = useMemo(() => {
    return Array.from(
      new Set(
        taskList
          .map((r: Record<string, unknown>) => String(r?.productionOrderNo || '').trim())
          .filter(Boolean)
      )
    );
  }, [taskList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'status', acceptAnyData: false });

  // 添加排序逻辑
  const sortedTaskList = useMemo(() => {
    const sorted = [...taskList];
    sorted.sort((a: any, b: any) => {
      const aVal = a[cuttingSortField];
      const bVal = b[cuttingSortField];

      // 时间字段排序
      if (cuttingSortField === 'receivedTime' || cuttingSortField === 'bundledTime') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return cuttingSortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }

      return 0;
    });
    return sorted;
  }, [taskList, cuttingSortField, cuttingSortOrder]);

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById[orderId] || false;
  };

  const fetchBundles = async () => {
    if (!activeTask?.productionOrderNo) {
      setDataSource([]);
      setTotal(0);
      return;
    }
    setListLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
        params: {
          ...queryParams,
          orderNo: activeTask.productionOrderNo,
        },
      });
      if (res.code === 200) {
        setDataSource(res.data.records || []);
        setTotal(res.data.total || 0);
      } else {
        message.error(res.message || '获取裁剪列表失败');
      }
    } catch (e) {
      message.error('获取裁剪列表失败');
    } finally {
      setListLoading(false);
    }
  };

  const fetchTasks = async () => {
    setTaskLoading(true);
    try {
      const res = await api.get<{ code: number; message: string; data: { records: CuttingTask[]; total: number } }>('/production/cutting-task/list', { params: taskQuery });
      if (res.code === 200) {
        setTaskList(res.data.records || []);
        setTaskTotal(res.data.total || 0);
      } else {
        message.error(res.message || '获取裁剪任务失败');
      }
    } catch {
      // Intentionally empty
      // 忽略错误
      message.error('获取裁剪任务失败');
    } finally {
      setTaskLoading(false);
    }
  };

  useEffect(() => {
    fetchBundles();
  }, [queryParams, activeTask?.productionOrderNo]);

  // 实时同步：30秒自动轮询更新裁剪批次数据
  useSync(
    'cutting-bundles',
    async () => {
      if (!activeTask?.productionOrderNo) return null;
      try {
        const res = await api.get<{ code: number; data: { records: CuttingBundleRow[]; total: number } }>('/production/cutting/list', {
          params: { ...queryParams, orderNo: activeTask.productionOrderNo }
        });
        if (res.code === 200) {
          return {
            records: res.data.records || [],
            total: res.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取裁剪批次失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setDataSource(newData.records);
        setTotal(newData.total);
        // // console.log('[实时同步] 裁剪批次数据已更新', { oldCount: oldData.records.length, newCount: newData.records.length });
      }
    },
    {
      interval: 30000,
      enabled: !listLoading && Boolean(activeTask?.productionOrderNo),
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 裁剪批次同步错误', error)
    }
  );

  useEffect(() => {
    if (isEntryPage) return;
    fetchTasks();
  }, [isEntryPage, taskQuery]);

  // 实时同步：裁剪任务列表（30秒轮询）
  useSync(
    'cutting-tasks',
    async () => {
      try {
        const res = await api.get<{ code: number; data: { records: CuttingTask[]; total: number } }>('/production/cutting-task/list', { params: taskQuery });
        if (res.code === 200) {
          return {
            records: res.data.records || [],
            total: res.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取裁剪任务失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setTaskList(newData.records);
        setTaskTotal(newData.total);
        // // console.log('[实时同步] 裁剪任务数据已更新', { oldCount: oldData.records.length, newCount: newData.records.length });
      }
    },
    {
      interval: 30000,
      enabled: !taskLoading && !isEntryPage,
      pauseOnHidden: true,
      onError: (error) => console.error('[实时同步] 裁剪任务同步错误', error)
    }
  );

  useEffect(() => {
    if (!activeTask) return;
    setTimeout(() => {
      editSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  }, [activeTask?.id]);

  const resetActiveTask = (clearRoute?: boolean) => {
    setActiveTask(null);
    setOrderId('');
    setImportLocked(false);
    setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
    setEntryPurchases([]);
    setEntryPurchaseLoading(false);
    setDataSource([]);
    setTotal(0);
    setQueryParams((prev) => ({ ...prev, page: 1 }));
    if (clearRoute && routeOrderNo) {
      navigate('/production/cutting', { replace: true });
    }
  };

  const resolveTaskByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) return null;
    try {
      const res = await api.get<{ code: number; data: { records: CuttingTask[] } }>('/production/cutting-task/list', {
        params: { page: 1, pageSize: 10, status: '', orderNo: on, styleNo: '' },
      });
      if (res.code !== 200) return null;
      const records: CuttingTask[] = res.data.records || [];
      const matched = records.find((x) => String(x?.productionOrderNo || '').trim() === on) || records[0] || null;
      return matched;
    } catch {
      // Intentionally empty
      // 忽略错误
      return null;
    }
  };

  const syncActiveTaskByOrderNo = async (orderNo: string) => {
    const task = await resolveTaskByOrderNo(orderNo);
    if (!task) return null;
    setActiveTask(task);
    setOrderId(String(task.productionOrderId || '').trim());
    return task;
  };

  useEffect(() => {
    if (!routeOrderNo) return;
    (async () => {
      const task = await resolveTaskByOrderNo(routeOrderNo);
      if (!task) {
        message.warning('未找到对应的裁剪任务');
        return;
      }
      // 直接设置任务，不自动领取
      setActiveTask(task);
      setOrderId(String(task.productionOrderId || '').trim());
      setImportLocked(false);
      setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
      setQueryParams((prev) => ({ ...prev, page: 1 }));
    })();
  }, [routeOrderNo, user?.id, user?.name]);

  const goToEntry = (task: CuttingTask) => {
    const orderNo = String(task?.productionOrderNo || '').trim();
    if (!orderNo) {
      message.warning('未找到订单号');
      return;
    }
    navigate(`/production/cutting/task/${encodeURIComponent(orderNo)}`);
  };

  const handleRollbackTask = async (task: CuttingTask) => {
    if (!task?.id) return;
    if (!(await ensureOrderUnlockedById((task as Record<string, unknown>)?.productionOrderNo))) return;
    let reason = '';
    modal.confirm({
      title: '确认退回该裁剪任务？',
      content: (
        <div>
          <div style={{ marginBottom: 8 }}>退回后会清空领取信息，并删除已生成的裁剪明细，可重新领取并重新生成。</div>
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
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        setRollbackTaskLoading(true);
        try {
          const res = await api.post<{ code: number; message: string }>('/production/cutting-task/rollback', {
            taskId: task.id,
            operatorId: user?.id,
            reason: remark,
          });
          if (res.code === 200) {
            message.success('退回成功');
            if (activeTask?.id === task.id) {
              setActiveTask(null);
              setOrderId('');
              setImportLocked(false);
              setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
              setEntryPurchases([]);
              setEntryPurchaseLoading(false);
              setDataSource([]);
              setTotal(0);
              setQueryParams((prev) => ({ ...prev, page: 1 }));
            }
            fetchTasks();
          } else {
            message.error(res.message || '退回失败');
          }
        } catch {
          // Intentionally empty
          // 忽略错误
          message.error('退回失败');
        } finally {
          setRollbackTaskLoading(false);
        }
      },
    });
  };

  const handleReceiveTask = async (task: CuttingTask) => {
    if (!task?.id) return;
    setReceiveTaskLoading(true);
    try {
      const payload = {
        taskId: task.id,
        receiverId: user?.id,
        receiverName: user?.name,
      };
      const res = await api.post<{ code: number; message: string; data: CuttingTask }>('/production/cutting-task/receive', payload);
      if (res.code === 200) {
        message.success('领取成功，请点击「进入」填写数量生成菲号');
        fetchTasks();
        // 领取后不自动跳转，让用户手动点击「进入」
      } else {
        message.error(res.message || '领取任务失败');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || '领取任务失败';
      message.error(errMsg);
    } finally {
      setReceiveTaskLoading(false);
    }
  };

  const handleAddRow = () => {
    setBundlesInput(prev => ([...prev, { skuNo: '', color: '', size: '', quantity: 0 }]));
  };

  const handleRemoveRow = (index: number) => {
    setBundlesInput(prev => prev.filter((_, i) => i !== index));
  };

  const handleChangeRow = (index: number, key: keyof CuttingBundleRow, value: any) => {
    setBundlesInput(prev => {
      const next = [...prev];
      (next[index] as Record<string, unknown>)[key] = value;
      return next;
    });
  };

  const handleGenerate = async () => {
    let resolvedOrderId = orderId;
    if (!activeTask) {
      message.error('请先在上方裁剪任务中领取任务');
      return;
    }
    if (!resolvedOrderId) {
      message.error('未匹配到生产订单ID');
      return;
    }

    if (!(await ensureOrderUnlockedById(resolvedOrderId))) return;

    const validItems = bundlesInput
      .map((x) => ({
        color: String(x.color || '').trim(),
        size: String(x.size || '').trim(),
        quantity: Number(x.quantity || 0) || 0,
      }))
      .filter(item => item.quantity > 0);
    if (!validItems.length) {
      message.error('请至少录入一行有效的颜色/尺码/数量');
      return;
    }

    const invalid = validItems.find((x) => !x.color || !x.size);
    if (invalid) {
      message.error('颜色/尺码不能为空');
      return;
    }

    modal.confirm({
      title: '确认保存并生成二维码？',
      content: '确认后将保存裁剪单并生成二维码，保存成功后才可批量打印。',
      okText: '确认保存',
      cancelText: '取消',
      onOk: async () => {
        setGenerateLoading(true);
        try {
          const payload = {
            orderId: resolvedOrderId,
            bundles: validItems.map(item => ({
              color: item.color,
              size: item.size,
              quantity: item.quantity,
            })),
          };
          const res = await api.post<{ code: number; message: string }>('/production/cutting/receive', payload);
          if (res.code === 200) {
            message.success('保存并生成成功');
            clearBundleSelection();
            setPrintBundles([]);
            await fetchBundles();
            await syncActiveTaskByOrderNo(activeTask.productionOrderNo);
            setPrintUnlocked(true);
          } else {
            message.error(res.message || '生成失败');
          }
        } catch {
          // Intentionally empty
          // 忽略错误
          message.error('生成失败');
        } finally {
          setGenerateLoading(false);
        }
      },
    });
  };

  useEffect(() => {
    const hasQr = dataSource.some((r) => String(r?.qrCode || '').trim());
    if (hasQr) setPrintUnlocked(true);
  }, [dataSource]);

  useEffect(() => {
    setPrintUnlocked(false);
    clearBundleSelection();
    setPrintBundles([]);
    setPrintPreviewOpen(false);
  }, [activeTask?.id]);

  const handleAutoImport = async () => {
    if (!activeTask) {
      message.error('请先在上方裁剪任务中领取任务');
      return;
    }
    const oid = String(orderId || activeTask.productionOrderNo || '').trim();
    if (!oid) {
      message.error('未匹配到生产订单号');
      return;
    }

    if (!(await ensureOrderUnlockedById(oid))) return;

    const detail = await fetchProductionOrderDetail(oid, { acceptAnyData: false });
    if (!detail) {
      message.error('获取订单明细失败');
      return;
    }

    const lines = parseProductionOrderLines(detail).slice();
    lines.sort((a: any, b: any) => {
      const ca = String(a?.color || '').trim();
      const cb = String(b?.color || '').trim();
      if (ca && cb) {
        const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
        if (byColor !== 0) return byColor;
      }
      return compareSizeAsc(String(a?.size || ''), String(b?.size || ''));
    });
    const next: CuttingBundleRow[] = [];
    for (const l of lines) {
      const color = String(l.color || '').trim();
      const size = String(l.size || '').trim();
      const quantity = Number(l.quantity || 0) || 0;
      if (!color || !size || quantity <= 0) continue;
      const chunks = splitQuantity(quantity, 20);
      const skuNo = String(l.skuNo || '').trim();
      for (const q of chunks) {
        next.push({ skuNo, color, size, quantity: q });
      }
    }

    if (!next.length) {
      const fallbackQty = Number((detail as Record<string, unknown>)?.orderQuantity ?? activeTask.orderQuantity ?? 0) || 0;
      const fallbackColor = String((detail as Record<string, unknown>)?.color ?? activeTask.color ?? '').trim();
      const fallbackSize = String((detail as Record<string, unknown>)?.size ?? activeTask.size ?? '').trim();
      const fallbackOrderNo = String((detail as Record<string, unknown>)?.orderNo ?? activeTask.productionOrderNo ?? '').trim();
      const fallbackStyleNo = String((detail as Record<string, unknown>)?.styleNo ?? activeTask.styleNo ?? '').trim();
      const fallbackSkuNo = fallbackOrderNo && fallbackStyleNo && fallbackColor && fallbackSize
        ? `SKU-${fallbackOrderNo}-${fallbackStyleNo}-${fallbackColor}-${fallbackSize}`
        : '';
      if (!fallbackQty || !fallbackColor || !fallbackSize) {
        message.error('订单明细未包含颜色/尺码/数量');
        return;
      }
      const chunks = splitQuantity(fallbackQty, 20);
      for (const q of chunks) {
        next.push({ skuNo: fallbackSkuNo, color: fallbackColor, size: fallbackSize, quantity: q });
      }
    }

    setBundlesInput(next);
    setImportLocked(true);
    message.success('已按20件/扎自动生成推荐');
  };

  const purchaseColumns = useMemo(
    () =>
      [
        {
          title: '类型',
          dataIndex: 'materialType',
          key: 'materialType',
          width: 110,
          render: (v: unknown) => getMaterialTypeLabel(v),
        },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        {
          title: '规格',
          dataIndex: 'specifications',
          key: 'specifications',
          width: 180,
          ellipsis: true,
          render: (v: unknown) => String(v || '').trim() || '-',
        },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, ellipsis: true },
        {
          title: '采购数量',
          dataIndex: 'purchaseQuantity',
          key: 'purchaseQuantity',
          width: 110,
          align: 'right' as const,
          render: (v: unknown) => Number(v ?? 0) || 0,
        },
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
          title: '总费用(元)',
          dataIndex: 'totalAmount',
          key: 'totalAmount',
          width: 120,
          align: 'right' as const,
          render: (v: any, r: any) => {
            const raw = Number(v);
            if (Number.isFinite(raw)) return raw.toFixed(2);
            const qty = Number(r?.purchaseQuantity ?? 0) || 0;
            const price = Number(r?.unitPrice);
            if (Number.isFinite(price)) return (qty * price).toFixed(2);
            return '-';
          },
        },
        { title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 160, ellipsis: true },
      ] as Record<string, unknown>,
    []
  );

  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={(activeTask as Record<string, unknown>)?.styleId} styleNo={record.styleNo || (activeTask as Record<string, unknown>)?.styleNo} size={24} borderRadius={4} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 140,
      render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
    },
    {
      title: '款名',
      key: 'styleName',
      width: 160,
      ellipsis: true,
      render: () => (activeTask as Record<string, unknown>)?.styleName || '-',
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={(activeTask as Record<string, unknown>)?.styleId}
          styleNo={record.styleNo || (activeTask as Record<string, unknown>)?.styleNo}
          onlyActive
        />
      )
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 120,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
    },
    {
      title: '扎号',
      dataIndex: 'bundleNo',
      key: 'bundleNo',
      width: 80,
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '二维码内容',
      dataIndex: 'qrCode',
      key: 'qrCode',
      width: 220,
      ellipsis: true,
    },
    {
      title: '二维码',
      dataIndex: 'qrCode',
      key: 'qrCodeImage',
      width: 92,
      render: (value: string) => (
        value ? <QRCodeCanvas value={value} size={42} /> : null
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => {
        const s = String(status || '').trim();
        const map: Record<string, string> = {
          pending: '待领取',
          received: '已领取',
          bundled: '已完成',
          qualified: '合格',
          unqualified: '不合格',
        };
        const colorMap: Record<string, string> = {
          pending: 'default',
          received: 'success',
          bundled: 'default',
          qualified: 'default',
          unqualified: 'error',
        };
        return <Tag color={colorMap[s] || 'default'}>{s ? (map[s] || '未知') : '已生成'}</Tag>;
      },
    },
  ];

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          {isEntryPage ? (
            <div className="cutting-entry-nav">
              <div className="cutting-entry-nav-title">裁剪明细</div>
              <Button type="primary" className="cutting-entry-back-btn" onClick={() => resetActiveTask(true)}>
                返回
              </Button>
            </div>
          ) : (
            <div className="page-header">
              <Space>
                <h2 className="page-title" style={{ margin: 0 }}>裁剪管理</h2>
              </Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTask}>
                新建裁剪任务
              </Button>
            </div>
          )}

          {isEntryPage ? null : (
            <Card size="small" title="裁剪任务" className="mb-sm">
              <StandardToolbar
                left={(
                  <StandardSearchBar
                    searchValue={taskQuery.orderNo || ''}
                    onSearchChange={(value) => setTaskQuery(prev => ({ ...prev, orderNo: value, page: 1 }))}
                    searchPlaceholder="订单号/款号"
                    dateValue={taskDateRange}
                    onDateChange={setTaskDateRange}
                    statusValue={taskQuery.status || ''}
                    onStatusChange={(value) => setTaskQuery(prev => ({ ...prev, status: value, page: 1 }))}
                    statusOptions={[
                      { label: '待领取', value: 'pending' },
                      { label: '已领取', value: 'received' },
                      { label: '已完成', value: 'bundled' },
                    ]}
                  />
                )}
                right={(
                  <>
                    <Button type="primary" onClick={fetchTasks}>查询</Button>
                    <Button onClick={() => setTaskQuery({ page: 1, pageSize: 10, status: '', orderNo: '', styleNo: '' })}>重置</Button>
                  </>
                )}
              />

              <ResizableTable<CuttingTask>
                storageKey="cutting-task-table-v2"
                autoFixedColumns={false}
                columns={[
                  {
                    title: '图片',
                    key: 'cover',
                    width: 72,
                    render: (_: any, record: any) => (
                      <StyleCoverThumb styleId={record.styleId} styleNo={record.styleNo} size={48} borderRadius={6} />
                    )
                  },
                  {
                    title: '订单号',
                    dataIndex: 'productionOrderNo',
                    key: 'productionOrderNo',
                    width: 230,
                    render: (v: any, record: CuttingTask) => (
                      <a
                        onClick={(e) => {
                          e.stopPropagation();
                          goToEntry(record);
                        }}
                        title={String(v || '').trim() || '-'}
                        style={{ color: 'var(--primary-color)', cursor: 'pointer' }}
                      >
                        <span className="order-no-wrap">
                          {String(v || '').trim() || '-'}
                        </span>
                      </a>
                    ),
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    key: 'styleNo',
                    width: 200,
                    render: (v: unknown) => <span className="order-no-wrap">{String(v || '').trim() || '-'}</span>,
                  },
                  { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
                  {
                    title: '附件',
                    key: 'attachments',
                    width: 100,
                    render: (_: any, record: any) => (
                      <StyleAttachmentsButton
                        styleId={record.styleId}
                        styleNo={record.styleNo}
                        onlyActive
                      />
                    )
                  },
                  { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const },
                  {
                    title: '裁剪数',
                    dataIndex: 'cuttingQuantity',
                    key: 'cuttingQuantity',
                    width: 90,
                    align: 'right' as const,
                    render: (v: unknown) => Number(v ?? 0) || 0,
                  },
                  {
                    title: '扎数',
                    dataIndex: 'cuttingBundleCount',
                    key: 'cuttingBundleCount',
                    width: 80,
                    align: 'right' as const,
                    render: (v: unknown) => Number(v ?? 0) || 0,
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 120,
                    render: (value: string) => {
                      const map: unknown = {
                        pending: { text: '待领取', color: 'blue' },
                        received: { text: '已领取', color: 'gold' },
                        bundled: { text: '已完成', color: 'green' },
                      };
                      const cfg = map[value] || { text: value || '-', color: 'default' };
                      return <Tag color={cfg.color}>{cfg.text}</Tag>;
                    }
                  },
                  { title: '裁剪员', dataIndex: 'receiverName', key: 'receiverName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
                  {
                    title: <SortableColumnTitle
                      title="领取时间"
                      sortField={cuttingSortField}
                      fieldName="receivedTime"
                      sortOrder={cuttingSortOrder}
                      onSort={handleCuttingSort}
                      align="left"
                    />,
                    dataIndex: 'receivedTime',
                    key: 'receivedTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
                  },
                  {
                    title: <SortableColumnTitle
                      title="完成时间"
                      sortField={cuttingSortField}
                      fieldName="bundledTime"
                      sortOrder={cuttingSortOrder}
                      onSort={handleCuttingSort}
                      align="left"
                    />,
                    dataIndex: 'bundledTime',
                    key: 'bundledTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
                  },
                  {
                    title: '备注',
                    dataIndex: 'remarks',
                    key: 'remarks',
                    width: 150,
                    ellipsis: true,
                    render: (v: any) => v || '-',
                  },
                  {
                    title: <SortableColumnTitle title="预计出货" field="expectedShipDate" onSort={handleCuttingSort} currentField={cuttingSortField} currentOrder={cuttingSortOrder} />,
                    dataIndex: 'expectedShipDate',
                    key: 'expectedShipDate',
                    width: 120,
                    render: (v: any) => v ? formatDateTime(v) : '-',
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 120,
                    render: (_: any, record: CuttingTask) => {
                      const orderNo = String((record as Record<string, unknown>)?.productionOrderNo || '').trim();
                      const frozen = isOrderFrozenById(orderNo);
                      // 领取和进入分开：pending状态显示领取，received/bundled状态显示进入
                      const isPending = record.status === 'pending';
                      const isReceived = record.status === 'received';
                      return (
                        <RowActions
                          actions={[
                            {
                              key: 'sheet',
                              label: '裁剪单',
                              title: '裁剪单',
                              icon: <EyeOutlined />,
                              onClick: () => openSheetPreview(record),
                              primary: true,
                            },
                            {
                              key: 'edit',
                              label: '编辑',
                              title: '编辑',
                              icon: <EditOutlined />,
                              onClick: () => {
                                setQuickEditRecord(record);
                                setQuickEditVisible(true);
                              },
                            },
                            // 待领取状态：显示「领取」按钮
                            ...(isPending
                              ? [
                                {
                                  key: 'receive',
                                  label: '领取',
                                  title: '领取任务',
                                  icon: <LoginOutlined />,
                                  disabled: frozen || receiveTaskLoading,
                                  onClick: () => handleReceiveTask(record),
                                  primary: true,
                                },
                              ]
                              : []),
                            // 已领取/已完成状态：显示「进入」按钮
                            ...(!isPending
                              ? [
                                {
                                  key: 'entry',
                                  label: isReceived ? '生成菲号' : '查看',
                                  title: isReceived ? '进入填写数量生成菲号' : '查看详情',
                                  icon: <LoginOutlined />,
                                  disabled: frozen,
                                  onClick: () => goToEntry(record),
                                  primary: isReceived,
                                },
                              ]
                              : []),
                            ...(isAdmin && record.status !== 'pending'
                              ? [
                                {
                                  key: 'rollback',
                                  label: '退回',
                                  title: '退回',
                                  icon: <RollbackOutlined />,
                                  disabled: frozen || rollbackTaskLoading,
                                  danger: true,
                                  onClick: () => handleRollbackTask(record),
                                },
                              ]
                              : []),
                          ]}
                        />
                      );
                    }
                  },
                ] as Record<string, unknown>}
                dataSource={sortedTaskList}
                rowKey={(row) => row.id || row.productionOrderId}
                loading={taskLoading}
                minColumnWidth={70}
                pagination={{
                  current: taskQuery.page,
                  pageSize: taskQuery.pageSize,
                  total: taskTotal,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100', '200'],
                  onChange: (page, pageSize) => setTaskQuery(prev => ({ ...prev, page, pageSize })),
                }}
              />
            </Card>
          )}

          {isEntryPage && activeTask ? (
            <>
              <div ref={editSectionRef} />

              <div className="cutting-entry-layout mb-sm">
                <div className="cutting-entry-main">
                  <div className="cutting-entry-info">
                    <ProductionOrderHeader
                      orderNo={String(activeTask.productionOrderNo || '').trim()}
                      styleNo={String(activeTask.styleNo || '').trim()}
                      styleName={String(activeTask.styleName || '').trim()}
                      styleId={(activeTask as Record<string, unknown>)?.styleId}
                      color={String(entryColorText || activeTask.color || '').trim()}
                      sizeItems={entryOrderDetailLoading ? [] : entrySizeItems.map((x) => ({ size: x.size, quantity: Number(x.quantity || 0) || 0 }))}
                      totalQuantity={entrySizeItems.length
                        ? entrySizeItems.reduce((s, x) => s + (Number(x.quantity || 0) || 0), 0)
                        : (Number(activeTask?.orderQuantity ?? 0) || 0)}
                      qrCodeValue={activeTask?.productionOrderNo
                        ? JSON.stringify({
                          type: 'order',
                          orderNo: activeTask.productionOrderNo,
                          styleNo: activeTask.styleNo,
                          styleName: activeTask.styleName,
                        })
                        : ''}
                      coverSize={160}
                      qrSize={120}
                    />
                  </div>

                  <div>
                    {isAdmin && activeTask && activeTask.status !== 'pending' ? (
                      <div className="cutting-entry-actions">
                        <Button
                          danger
                          onClick={() => handleRollbackTask(activeTask)}
                          loading={rollbackTaskLoading}
                          disabled={isOrderFrozenById((activeTask as Record<string, unknown>)?.productionOrderNo)}
                        >
                          退回
                        </Button>
                      </div>
                    ) : null}

                    <Form layout="vertical">
                      {activeTask?.status === 'bundled' ? null : (
                        <>
                          {bundlesInput.map((row, index) => (
                            <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                              <Input
                                placeholder="颜色"
                                style={{ width: 140 }}
                                value={row.color}
                                disabled={importLocked}
                                onChange={(e) => handleChangeRow(index, 'color', e.target.value)}
                              />
                              <Input
                                placeholder="尺码"
                                style={{ width: 120 }}
                                value={row.size}
                                disabled={importLocked}
                                onChange={(e) => handleChangeRow(index, 'size', e.target.value)}
                              />
                              <Input
                                placeholder="SKU"
                                style={{ width: 200 }}
                                value={row.skuNo}
                                disabled={importLocked}
                                onChange={(e) => handleChangeRow(index, 'skuNo', e.target.value)}
                              />
                              <InputNumber
                                placeholder="数量"
                                style={{ width: 120 }}
                                min={0}
                                value={row.quantity}
                                onChange={(value) => handleChangeRow(index, 'quantity', value || 0)}
                              />
                              <Button onClick={() => handleRemoveRow(index)} disabled={importLocked || bundlesInput.length === 1}>
                                删除
                              </Button>
                            </Space>
                          ))}
                          <Form.Item>
                            <Space>
                              <Button type="dashed" onClick={handleAddRow} disabled={importLocked}>
                                新增一行
                              </Button>
                              <Button type="dashed" onClick={handleAutoImport} disabled={!activeTask}>
                                一键导入(20件/扎)
                              </Button>
                              <Button
                                onClick={() => {
                                  setImportLocked(false);
                                  setBundlesInput([{ skuNo: '', color: '', size: '', quantity: 0 }]);
                                }}
                                disabled={!activeTask}
                              >
                                清空
                              </Button>
                              <Button type="primary" loading={generateLoading} onClick={handleGenerate}>
                                生成菲号
                              </Button>
                            </Space>
                          </Form.Item>
                        </>
                      )}
                    </Form>

                    <Card size="small" title="面辅料采购明细" style={{ marginTop: 12 }} loading={entryPurchaseLoading}>
                      <ResizableTable<MaterialPurchase>
                        storageKey="cutting-entry-purchase-table"
                        columns={purchaseColumns}
                        dataSource={entryPurchases}
                        rowKey={(r) =>
                          String(
                            r?.id ??
                            `${(r as Record<string, unknown>)?.materialType || ''}-${(r as Record<string, unknown>)?.materialCode || ''}-${(r as Record<string, unknown>)?.supplierName || ''}`
                          )
                        }
                        loading={entryPurchaseLoading}
                        pagination={false as Record<string, unknown>}
                        size="small"
                        scroll={{ x: 'max-content', y: isMobile ? 220 : 260 }}
                      />
                    </Card>
                  </div>

                  <div className="cutting-entry-footer">
                    <div className="cutting-entry-footer-grid">
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">裁剪人</div>
                        <div className="cutting-entry-value">{String(activeTask.receiverName || '').trim() || '-'}</div>
                      </div>
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">领取时间</div>
                        <div className="cutting-entry-value">{formatDateTime(activeTask.receivedTime) || '-'}</div>
                      </div>
                      <div className="cutting-entry-field">
                        <div className="cutting-entry-label">完成时间</div>
                        <div className="cutting-entry-value">{formatDateTime(activeTask.bundledTime) || '-'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <Space style={{ marginBottom: 12 }}>
                <Button type="primary" onClick={openBatchPrint} disabled={!selectedBundles.length}>
                  批量打印
                </Button>
                <Button onClick={clearBundleSelection} disabled={!selectedBundles.length}>
                  清除勾选
                </Button>
                <Tag color={selectedBundles.length ? 'blue' : 'default'}>{`已选：${selectedBundles.length}`}</Tag>
              </Space>

              <ResizableTable<CuttingBundleRow>
                storageKey="cutting-bundle-table"
                columns={columns as Record<string, unknown>}
                dataSource={dataSource}
                rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}
                size="small"
                rowSelection={{
                  selectedRowKeys: selectedBundleRowKeys,
                  onChange: (keys, rows) => {
                    setSelectedBundleRowKeys(keys);
                    setSelectedBundles((rows as Record<string, unknown>) || []);
                  },
                }}
                loading={listLoading}
                scroll={{ x: 'max-content', y: isMobile ? 360 : 560 }}
                pagination={{
                  current: queryParams.page,
                  pageSize: queryParams.pageSize,
                  total,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100', '200'],
                  onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
                }}
              />

              <ResizableModal
                open={printPreviewOpen}
                title={`批量打印（${printBundles.length}张）`}
                width={modalWidth}
                centered
                onCancel={() => setPrintPreviewOpen(false)}
                footer={[
                  <Button key="clear" onClick={clearBundleSelection} disabled={!selectedBundles.length}>
                    清除勾选
                  </Button>,
                  <Button key="cancel" onClick={() => setPrintPreviewOpen(false)}>
                    关闭
                  </Button>,
                  <Button key="print" type="primary" onClick={triggerPrint} disabled={!printBundles.length}>
                    打印
                  </Button>,
                ]}
                autoFontSize={false}
                initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
                scaleWithViewport
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600 }}>模式</span>
                  <Select
                    value={printConfig.mode}
                    style={{ width: 130 }}
                    options={[
                      { label: '多张排版', value: 'grid' },
                      { label: '每张一页', value: 'single' },
                    ]}
                    onChange={(v) => setPrintConfig((p) => ({ ...p, mode: v as Record<string, unknown> }))}
                  />
                  <span style={{ fontWeight: 600 }}>纸张</span>
                  <Select
                    value={printConfig.pageSize}
                    style={{ width: 110 }}
                    options={[
                      { label: 'A4', value: 'A4' },
                      { label: 'A5', value: 'A5' },
                    ]}
                    onChange={(v) =>
                      setPrintConfig((p) => ({
                        ...p,
                        pageSize: v as Record<string, unknown>,
                        cols: v === 'A5' ? Math.min(p.cols, 2) : p.cols,
                      }))
                    }
                    disabled={printConfig.mode === 'single'}
                  />
                  <span style={{ fontWeight: 600 }}>方向</span>
                  <Select
                    value={printConfig.orientation}
                    style={{ width: 120 }}
                    options={[
                      { label: '纵向', value: 'portrait' },
                      { label: '横向', value: 'landscape' },
                    ]}
                    onChange={(v) =>
                      setPrintConfig((p) => ({
                        ...p,
                        orientation: v as Record<string, unknown>,
                        cols: v === 'landscape' ? Math.max(p.cols, 4) : p.cols,
                      }))
                    }
                    disabled={printConfig.mode === 'single'}
                  />
                  <span style={{ fontWeight: 600 }}>边距(mm)</span>
                  <InputNumber min={0} value={printConfig.marginMm} onChange={(v) => setPrintConfig((p) => ({ ...p, marginMm: Number(v) || 0 }))} />
                  <span style={{ fontWeight: 600 }}>列数</span>
                  <InputNumber min={1} max={10} value={printConfig.cols} onChange={(v) => setPrintConfig((p) => ({ ...p, cols: Math.max(1, Number(v) || 1) }))} />
                  <span style={{ fontWeight: 600 }}>标签宽(mm)</span>
                  <InputNumber min={20} max={120} value={printConfig.labelW} onChange={(v) => setPrintConfig((p) => ({ ...p, labelW: Math.max(20, Number(v) || 48) }))} />
                  <span style={{ fontWeight: 600 }}>标签高(mm)</span>
                  <InputNumber min={20} max={120} value={printConfig.labelH} onChange={(v) => setPrintConfig((p) => ({ ...p, labelH: Math.max(20, Number(v) || 32) }))} />
                  <span style={{ fontWeight: 600 }}>间距(mm)</span>
                  <InputNumber min={0} max={10} value={printConfig.gap} onChange={(v) => setPrintConfig((p) => ({ ...p, gap: Math.max(0, Number(v) || 0) }))} />
                  <span style={{ fontWeight: 600 }}>二维码(px)</span>
                  <InputNumber min={48} max={180} value={printConfig.qrSize} onChange={(v) => setPrintConfig((p) => ({ ...p, qrSize: Math.max(48, Number(v) || 84) }))} />
                </div>

                <div className="cutting-qr-print-grid cutting-qr-print-grid--screen">
                  {printBundles.map((b, idx) => (
                    <div className="cutting-qr-label" key={b.id || `${b.qrCode || ''}-${idx}`}
                      style={{ background: 'var(--neutral-white)' }}
                    >
                      <div className="cutting-qr-label-qr">
                        {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={printConfig.qrSize} includeMargin /> : null}
                      </div>
                      <div className="cutting-qr-label-text">
                        <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                        <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                        <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                        <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                        <div>{`数量：${Number(b.quantity || 0)}`}</div>
                        <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ResizableModal>

            </>
          ) : null}

          <ResizableModal
            open={sheetPreviewOpen}
            title={`裁剪单（${String(sheetPreviewTask?.productionOrderNo || '').trim() || '-'}）`}
            width={modalWidth}
            centered
            onCancel={() => setSheetPreviewOpen(false)}
            footer={[
              <Button key="close" onClick={() => setSheetPreviewOpen(false)}>
                关闭
              </Button>,
              <Button key="download" onClick={downloadSheetCsv} disabled={sheetPreviewLoading || !sheetPreviewBundles.length}>
                下载
              </Button>,
              <Button key="print" type="primary" onClick={triggerSheetPrint} disabled={sheetPreviewLoading || !sheetPreviewBundles.length}>
                打印
              </Button>,
            ]}
            autoFontSize={false}
            initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
            scaleWithViewport
          >
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0, gap: 12 }}>
              <ModalHeaderCard isMobile={isMobile}>
                <ModalSideLayout
                  left={
                    <ModalVerticalStack gap={12}>
                      {/* 款式图片 */}
                      {sheetPreviewOrderDetail?.styleCover ? (
                        <StyleCoverThumb
                          src={sheetPreviewOrderDetail.styleCover}
                          size={120}
                          style={{ marginBottom: 8 }}
                        />
                      ) : null}

                      {/* 订单二维码 */}
                      {sheetPreviewTask?.productionOrderNo && (
                        <QRCodeBox
                          value={{
                            type: 'order',
                            orderNo: sheetPreviewTask.productionOrderNo
                          }}
                          label="📱 订单扫码"
                          variant="primary"
                          size={120}
                        />
                      )}

                      {/* 裁剪单二维码 */}
                      {sheetPreviewTask?.qrCode && (
                        <QRCodeBox
                          value={sheetPreviewTask.qrCode}
                          label="裁剪单"
                          variant="default"
                          size={100}
                        />
                      )}
                    </ModalVerticalStack>
                  }
                  right={
                    <>
                      {/* 上半部分：订单信息（左）+ 尺码表格（右） */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24, marginBottom: 12 }}>
                        {/* 左侧：订单信息 */}
                        <div style={{ flex: '0 0 auto', maxWidth: '50%' }}>
                          <ModalPrimaryField
                            label="订单号"
                            value={String(sheetPreviewTask?.productionOrderNo || '').trim() || '-'}
                          />
                          <ModalFieldRow gap={24} style={{ marginTop: 8 }}>
                            <ModalField label="款号" value={String(sheetPreviewTask?.styleNo || '').trim() || '-'} />
                            <ModalField label="款名" value={String(sheetPreviewTask?.styleName || '').trim() || '-'} />
                          </ModalFieldRow>
                          <ModalFieldRow gap={24} style={{ marginTop: 8 }}>
                            <ModalField label="颜色" value={String(sheetPreviewTask?.color || sheetPreviewOrderDetail?.color || '').trim() || '-'} />
                          </ModalFieldRow>
                        </div>

                        {/* 右侧：下单数量尺码表格 */}
                        {(() => {
                          // 如果弹窗未打开或还在加载，不显示尺码表格
                          if (!sheetPreviewOpen || sheetPreviewLoading) {
                            return null;
                          }

                          // 如果没有 task 数据，也不显示
                          if (!sheetPreviewTask) {
                            return null;
                          }

                          // 优先使用订单详情的 SKU 数据
                          const orderDetail = sheetPreviewOrderDetail;
                          let sizeArray: string[] = [];
                          let sizeQuantityMap: Record<string, number> = {};
                          let totalQty = Number(sheetPreviewTask?.orderQuantity ?? 0) || 0;

                          if (orderDetail) {
                            // 从订单详情获取 SKU
                            const lines = parseProductionOrderLines(orderDetail);
                            if (lines && lines.length > 0) {
                              sizeArray = lines.map((l: any) => l.size).filter(Boolean);
                              lines.forEach((l: any) => {
                                if (l.size) {
                                  sizeQuantityMap[l.size] = l.quantity || 0;
                                }
                              });
                              totalQty = lines.reduce((sum: number, l: any) => sum + (l.quantity || 0), 0);
                            }
                          }

                          // 如果订单详情没有SKU，尝试从 bundles 统计
                          if (!sizeArray.length && sheetPreviewBundles.length > 0) {
                            const sizeMap = new Map<string, number>();
                            sheetPreviewBundles.forEach(bundle => {
                              const size = String(bundle.size || '').trim();
                              const qty = Number(bundle.quantity) || 0;
                              if (size) {
                                sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
                              }
                            });
                            sizeArray = Array.from(sizeMap.keys()).sort(compareSizeAsc);
                            sizeArray.forEach(size => {
                              sizeQuantityMap[size] = sizeMap.get(size) || 0;
                            });
                            totalQty = Array.from(sizeMap.values()).reduce((sum, qty) => sum + qty, 0);
                          }

                          // 如果都没有，尝试从 task 提取（这种情况很少，仅限单SKU订单）
                          if (!sizeArray.length && sheetPreviewTask) {
                            const taskSize = String(sheetPreviewTask.size || '').trim();
                            const taskQty = Number(sheetPreviewTask.orderQuantity) || 0;
                            if (taskSize && taskQty > 0) {
                              sizeArray = [taskSize];
                              sizeQuantityMap[taskSize] = taskQty;
                              totalQty = taskQty;
                            }
                          }

                          // 最终检查
                          if (!sizeArray.length) {
                            console.warn('❌ 无法显示尺码表格：所有数据源都无法提供SKU信息', {
                              hasOrderDetail: !!orderDetail,
                              bundlesCount: sheetPreviewBundles.length,
                              hasTask: !!sheetPreviewTask,
                              taskSize: sheetPreviewTask?.size
                            });
                            return null;
                          }

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <div style={{
                                fontSize: "var(--font-size-base)",
                                fontWeight: 600,
                                color: 'var(--neutral-text)',
                                marginBottom: 6
                              }}>
                                下单数量
                              </div>
                              <div style={{
                                padding: 6,
                                background: 'var(--neutral-white)',
                                borderRadius: 6,
                                border: '2px solid var(--table-border-color)',
                                boxShadow: 'var(--shadow-sm)',
                                flexShrink: 0
                              }}>
                                <table style={{ borderCollapse: 'collapse' }}>
                                  <tbody>
                                    {/* 第一行：码数 */}
                                    <tr>
                                      <td style={{
                                        padding: '8px 12px',
                                        fontSize: "var(--font-size-base)",
                                        color: 'var(--neutral-text)',
                                        fontWeight: 600,
                                        borderRight: '1px solid var(--table-border-color)',
                                        borderBottom: '1px solid var(--table-border-color)',
                                        width: '60px',
                                        background: 'var(--color-bg-gray)'
                                      }}>
                                        码数
                                      </td>
                                      {sizeArray.map((size: string, idx: number) => (
                                        <td key={idx} style={{
                                          padding: '8px 14px',
                                          fontSize: "var(--font-size-md)",
                                          color: 'var(--neutral-text)',
                                          fontWeight: 700,
                                          textAlign: 'center',
                                          borderRight: idx < sizeArray.length - 1 ? '1px solid var(--table-border-color)' : 'none',
                                          borderBottom: '1px solid var(--table-border-color)',
                                          minWidth: '50px'
                                        }}>
                                          {size}
                                        </td>
                                      ))}
                                      <td style={{
                                        padding: '8px 14px',
                                        fontSize: "var(--font-size-base)",
                                        color: 'var(--neutral-text)',
                                        fontWeight: 700,
                                        textAlign: 'center',
                                        borderLeft: '1px solid var(--table-border-color)',
                                        borderBottom: '1px solid var(--table-border-color)',
                                        background: 'var(--color-bg-light)',
                                        whiteSpace: 'nowrap'
                                      }} rowSpan={2}>
                                        总下单数：{totalQty}
                                      </td>
                                    </tr>
                                    {/* 第二行：数量 */}
                                    <tr>
                                      <td style={{
                                        padding: '8px 12px',
                                        fontSize: "var(--font-size-base)",
                                        color: 'var(--neutral-text)',
                                        fontWeight: 600,
                                        borderRight: '1px solid var(--table-border-color)',
                                        background: 'var(--color-bg-gray)'
                                      }}>
                                        数量
                                      </td>
                                      {sizeArray.map((size: string, idx: number) => {
                                        const qty = sizeQuantityMap[size] || 0;
                                        return (
                                          <td key={idx} style={{
                                            padding: '8px 14px',
                                            fontSize: "var(--font-size-md)",
                                            color: 'var(--neutral-text)',
                                            fontWeight: 700,
                                            textAlign: 'center',
                                            borderRight: idx < sizeArray.length - 1 ? '1px solid var(--table-border-color)' : 'none',
                                            minWidth: '50px'
                                          }}>
                                            {qty}
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <ModalFieldGrid columns={2}>
                        <ModalField
                          label="裁剪数"
                          value={(() => {
                            const tv = Number((sheetPreviewTask as Record<string, unknown>)?.cuttingQuantity);
                            if (Number.isFinite(tv) && tv > 0) return tv;
                            const sum = sheetPreviewBundles.reduce((s, x) => s + (Number((x as Record<string, unknown>)?.quantity) || 0), 0);
                            return Number(sum) || 0;
                          })()}
                          valueColor="#0891b2"
                        />
                        <ModalField
                          label="扎数"
                          value={(() => {
                            const tv = Number((sheetPreviewTask as Record<string, unknown>)?.cuttingBundleCount);
                            if (Number.isFinite(tv) && tv > 0) return tv;
                            return Number(sheetPreviewBundles.length) || 0;
                          })()}
                          valueColor="#7c3aed"
                        />
                      </ModalFieldGrid>
                    </>
                  }
                />
              </ModalHeaderCard>

              <Card size="small" title="面辅料采购明细" loading={sheetPreviewPurchaseLoading}>
                <ResizableTable<MaterialPurchase>
                  storageKey="cutting-sheet-preview-purchase-table"
                  columns={purchaseColumns}
                  dataSource={sheetPreviewPurchases}
                  rowKey={(r) => String(r?.id ?? `${(r as Record<string, unknown>)?.materialType || ''}-${(r as Record<string, unknown>)?.materialCode || ''}-${(r as Record<string, unknown>)?.supplierName || ''}`)}
                  loading={sheetPreviewPurchaseLoading}
                  pagination={false as Record<string, unknown>}
                  size="small"
                  scroll={{ x: 'max-content', y: isMobile ? 180 : 200 }}
                />
              </Card>

              <div ref={sheetPreviewTableWrapRef} style={{ flex: '1 1 auto', minHeight: 0 }}>
                <ResizableTable<CuttingBundleRow>
                  storageKey="cutting-sheet-preview-table"
                  columns={[
                    { title: 'SKU', dataIndex: 'skuNo', key: 'skuNo', width: 150, ellipsis: true },
                    { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
                    { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
                    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 90 },
                    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
                    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', ellipsis: true },
                  ] as Record<string, unknown>}
                  dataSource={sheetPreviewBundles}
                  rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}
                  loading={sheetPreviewLoading}
                  pagination={false as Record<string, unknown>}
                  scroll={{ x: 'max-content', y: sheetPreviewTableScrollY }}
                />
              </div>
            </div>
          </ResizableModal>

          <div
            className="cutting-qr-print-area"
            style={
              {
                ['--cutting-print-cols' as Record<string, unknown>]: String(printConfig.cols),
                ['--cutting-label-w' as Record<string, unknown>]: String(printConfig.labelW),
                ['--cutting-label-h' as Record<string, unknown>]: String(printConfig.labelH),
                ['--cutting-label-gap' as Record<string, unknown>]: String(printConfig.gap),
              } as Record<string, unknown>
            }
          >
            {printConfig.mode === 'single' ? (
              <div className="cutting-qr-print-single">
                {printBundles.map((b, idx) => (
                  <div className="cutting-qr-print-page" key={b.id || `${b.qrCode || ''}-${idx}`}>
                    <div className="cutting-qr-label">
                      <div className="cutting-qr-label-qr">
                        {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={printConfig.qrSize} includeMargin /> : null}
                      </div>
                      <div className="cutting-qr-label-text">
                        <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                        <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                        <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                        <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                        <div>{`数量：${Number(b.quantity || 0)}`}</div>
                        <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="cutting-qr-print-grid">
                {printBundles.map((b, idx) => (
                  <div className="cutting-qr-label" key={b.id || `${b.qrCode || ''}-${idx}`}>
                    <div className="cutting-qr-label-qr">
                      {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={printConfig.qrSize} includeMargin /> : null}
                    </div>
                    <div className="cutting-qr-label-text">
                      <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                      <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                      <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                      <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                      <div>{`数量：${Number(b.quantity || 0)}`}</div>
                      <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ResizableModal
            open={createTaskOpen}
            title="新建裁剪任务"
            width={modalWidth}
            centered
            onCancel={() => setCreateTaskOpen(false)}
            okText="创建"
            confirmLoading={createTaskSubmitting}
            onOk={handleSubmitCreateTask}
            autoFontSize={false}
            initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
          >
            <Card size="small" style={{ marginBottom: 12 }}>
              <Space wrap>
                <span>款号</span>
                <Select
                  showSearch
                  value={createStyleNo || undefined}
                  style={{ width: 320 }}
                  placeholder="输入款号搜索"
                  filterOption={false}
                  onSearch={(v) => fetchStyleInfoOptions(v)}
                  loading={createStyleLoading}
                  options={createStyleOptions.map((x) => ({
                    value: x.styleNo,
                    label: x.styleName ? `${x.styleNo}（${x.styleName}）` : x.styleNo,
                  }))}
                  onChange={(v) => {
                    const value = String(v || '').trim();
                    setCreateStyleNo(value);
                    const hit = createStyleOptions.find((x) => x.styleNo === value);
                    setCreateStyleName(String(hit?.styleName || '').trim());
                  }}
                />
                <span>裁剪单号</span>
                <Input
                  value={createOrderNo}
                  style={{ width: 260 }}
                  placeholder="不填自动生成"
                  onChange={(e) => setCreateOrderNo(e.target.value)}
                />
              </Space>
              {createStyleName ? (
                <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.65)' }}>款名：{createStyleName}</div>
              ) : null}
            </Card>

            <Card size="small" title="自定义裁剪单" extra={
              <Button type="dashed" onClick={handleCreateBundleAdd}>
                新增一行
              </Button>
            }>
              {createBundles.map((row, index) => (
                <Space key={index} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                  <Input
                    placeholder="颜色"
                    style={{ width: 160 }}
                    value={row.color}
                    onChange={(e) => handleCreateBundleChange(index, 'color', e.target.value)}
                  />
                  <Input
                    placeholder="尺码"
                    style={{ width: 140 }}
                    value={row.size}
                    onChange={(e) => handleCreateBundleChange(index, 'size', e.target.value)}
                  />
                  <InputNumber
                    placeholder="数量"
                    style={{ width: 140 }}
                    min={0}
                    value={row.quantity}
                    onChange={(value) => handleCreateBundleChange(index, 'quantity', value || 0)}
                  />
                  <Button onClick={() => handleCreateBundleRemove(index)} disabled={createBundles.length === 1}>
                    删除
                  </Button>
                </Space>
              ))}
            </Card>
          </ResizableModal>

          {/* 快速编辑弹窗 */}
          <QuickEditModal
            visible={quickEditVisible}
            loading={quickEditSaving}
            initialValues={{
              remarks: quickEditRecord?.remarks,
              expectedShipDate: quickEditRecord?.expectedShipDate,
            }}
            onSave={handleQuickEditSave}
            onCancel={() => {
              setQuickEditVisible(false);
              setQuickEditRecord(null);
            }}
          />

        </Card>
      </div>
    </Layout>
  );
};


export default CuttingManagement;
