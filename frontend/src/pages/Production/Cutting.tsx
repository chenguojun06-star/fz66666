import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tag, Typography } from 'antd';
import { EyeOutlined, LoginOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import { useSync } from '../../utils/syncManager';
import ResizableModal, {
  ResizableModalFlex,
  ResizableModalFlexFill,
  useResizableModalTableScrollY,
} from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import api, { compareSizeAsc, fetchProductionOrderDetail, parseProductionOrderLines, useProductionOrderFrozenCache } from '../../utils/api';
import { QRCodeCanvas } from 'qrcode.react';
import { isSupervisorOrAboveUser, useAuth } from '../../utils/authContext';
import type { CuttingTask, MaterialPurchase } from '../../types/production';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import { useNavigate, useParams } from 'react-router-dom';
import { getMaterialTypeLabel, getMaterialTypeSortKey } from '../../utils/materialType';
import { useViewport } from '../../utils/useViewport';
import './styles.css';

const { Option } = Select;
const { Text } = Typography;

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
    const raw = String((params as any)?.orderNo || '').trim();
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch {
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

  const [orderId, setOrderId] = useState<string>('');
  const [activeTask, setActiveTask] = useState<CuttingTask | null>(null);

  const [taskQuery, setTaskQuery] = useState({ page: 1, pageSize: 10, status: '' as string, orderNo: '', styleNo: '' });
  const [taskLoading, setTaskLoading] = useState(false);
  const [taskList, setTaskList] = useState<CuttingTask[]>([]);
  const [taskTotal, setTaskTotal] = useState(0);
  const [receiveTaskLoading, setReceiveTaskLoading] = useState(false);
  const [rollbackTaskLoading, setRollbackTaskLoading] = useState(false);

  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [sheetPreviewTask, setSheetPreviewTask] = useState<CuttingTask | null>(null);
  const [sheetPreviewBundles, setSheetPreviewBundles] = useState<CuttingBundleRow[]>([]);
  const [sheetPreviewPurchaseLoading, setSheetPreviewPurchaseLoading] = useState(false);
  const [sheetPreviewPurchases, setSheetPreviewPurchases] = useState<MaterialPurchase[]>([]);
  const sheetPreviewPurchaseReqSeq = useRef(0);

  const sheetPreviewTableWrapRef = useRef<HTMLDivElement | null>(null);
  const sheetPreviewTableScrollY = useResizableModalTableScrollY({ open: sheetPreviewOpen, ref: sheetPreviewTableWrapRef });

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

  const fetchAllBundlesByOrderNo = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) return [] as CuttingBundleRow[];
    try {
      const res = await api.get<any>('/production/cutting/list', {
        params: { page: 1, pageSize: 10000, orderNo: on },
      });
      const result = res as any;
      if (result.code === 200) {
        return (result.data.records || []) as CuttingBundleRow[];
      }
      return [] as CuttingBundleRow[];
    } catch {
      return [] as CuttingBundleRow[];
    }
  };

  const fetchSortedPurchasesByOrderNo = async (orderNo: string) => {
    const no = String(orderNo || '').trim();
    if (!no) return [] as MaterialPurchase[];
    try {
      const res = await api.get<any>('/production/purchase/list', {
        params: { page: 1, pageSize: 200, orderNo: no, materialType: '', status: '' },
      });
      const result = res as any;
      if (result.code !== 200) return [] as MaterialPurchase[];
      const records = (result.data?.records || []) as MaterialPurchase[];
      const sorted = [...records].sort((a: any, b: any) => {
        const ka = getMaterialTypeSortKey(a?.materialType);
        const kb = getMaterialTypeSortKey(b?.materialType);
        if (ka !== kb) return ka.localeCompare(kb);
        const ca = String(a?.materialCode || '');
        const cb = String(b?.materialCode || '');
        if (ca !== cb) return ca.localeCompare(cb);
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
      return sorted as any;
    } catch {
      return [] as MaterialPurchase[];
    }
  };

  const fetchStyleInfoOptions = async (keyword?: string) => {
    setCreateStyleLoading(true);
    try {
      const res = await api.get<any>('/style/info/list', {
        params: { page: 1, pageSize: 20, styleNo: String(keyword || '').trim() },
      });
      const result = res as any;
      if (result.code === 200) {
        const records = (result.data?.records || []) as any[];
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
      const row = { ...next[index], [key]: value } as any;
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
      const res = await api.post<any>('/production/cutting-task/custom/create', {
        orderNo: String(createOrderNo || '').trim() || undefined,
        styleNo,
        receiverId: user?.id,
        receiverName: (user as any)?.name,
        bundles: validItems,
      });
      const result = res as any;
      if (result.code === 200) {
        message.success('新建裁剪任务成功');
        setCreateTaskOpen(false);
        fetchTasks();
        const on = String(result.data?.productionOrderNo || '').trim();
        if (on) {
          navigate(`/production/cutting/task/${encodeURIComponent(on)}`);
        }
      } else {
        message.error(result.message || '新建失败');
      }
    } catch {
      message.error('新建失败');
    } finally {
      setCreateTaskSubmitting(false);
    }
  };

  const downloadSheetCsvFrom = (task: CuttingTask | null, bundles: CuttingBundleRow[], purchases?: MaterialPurchase[]) => {
    const on = String(task?.productionOrderNo || '').trim() || 'unknown';
    const escapeCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const headers = ['订单号', '款号', '颜色', '尺码', '扎号', '数量', '二维码内容'];
    const lines = [headers.join(',')];
    for (const r of bundles) {
      const row = [
        String(r.productionOrderNo || ''),
        String(r.styleNo || ''),
        String(r.color || ''),
        String(r.size || ''),
        String(r.bundleNo ?? ''),
        String(r.quantity ?? ''),
        String(r.qrCode || ''),
      ]
        .map(escapeCsv)
        .join(',');
      lines.push(row);
    }

    const purchaseRows = (purchases || []).filter(Boolean);
    if (purchaseRows.length) {
      lines.push('');
      lines.push(escapeCsv('面辅料采购明细'));
      const purchaseHeaders = ['类型', '物料编码', '物料名称', '规格', '单位', '采购数量', '单价(元)', '总费用(元)', '供应商'];
      lines.push(purchaseHeaders.map(escapeCsv).join(','));
      for (const r of purchaseRows as any[]) {
        const qty = Number(r?.purchaseQuantity ?? 0) || 0;
        const unitPrice = Number(r?.unitPrice);
        const unitPriceText = Number.isFinite(unitPrice) ? unitPrice.toFixed(2) : '';
        const totalAmountRaw = Number(r?.totalAmount);
        const totalAmount = Number.isFinite(totalAmountRaw)
          ? totalAmountRaw
          : (Number.isFinite(unitPrice) ? qty * unitPrice : NaN);
        const totalText = Number.isFinite(totalAmount) ? Number(totalAmount).toFixed(2) : '';

        const row = [
          getMaterialTypeLabel(r?.materialType),
          String(r?.materialCode || ''),
          String(r?.materialName || ''),
          String(r?.specifications || ''),
          String(r?.unit || ''),
          String(qty),
          String(unitPriceText),
          String(totalText),
          String(r?.supplierName || ''),
        ]
          .map(escapeCsv)
          .join(',');
        lines.push(row);
      }
    }
    const csv = `\uFEFF${lines.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `裁剪单_${on}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const triggerSheetPrintFrom = (task: CuttingTask | null, bundles: CuttingBundleRow[]) => {
    const on = String(task?.productionOrderNo || '').trim();
    if (!on) {
      message.warning('未找到订单号');
      return;
    }
    if (!bundles.length) {
      message.warning('没有可打印的裁剪单内容');
      return;
    }

    const title = `裁剪单 - ${on}`;
    const safe = (v: any) => String(v ?? '').replace(/[<>&]/g, (s) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' } as any)[s] || s);

    const rowsHtml = bundles
      .map(
        (r, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${safe(r.color)}</td>
            <td>${safe(r.size)}</td>
            <td>${safe(r.bundleNo)}</td>
            <td style="text-align:right">${safe(r.quantity)}</td>
            <td style="word-break:break-all">${safe(r.qrCode)}</td>
          </tr>`
      )
      .join('');

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${safe(title)}</title>
    <style>
      @page { margin: 10mm; }
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; color: #111; }
      h1 { font-size: 16px; margin: 0 0 8px; }
      .meta { font-size: 12px; margin: 0 0 10px; display: flex; flex-wrap: wrap; gap: 12px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #d1d5db; padding: 6px 8px; vertical-align: middle; text-align: center; }
      th { background: #f3f3f3; text-align: center; }
      .right { text-align: right; }
    </style>
  </head>
  <body>
    <h1>${safe(title)}</h1>
    <div class="meta">
      <div>款号：${safe(task?.styleNo || '')}</div>
      <div>款名：${safe(task?.styleName || '')}</div>
      <div>下单数：${safe(task?.orderQuantity ?? '')}</div>
      <div>裁剪数：${safe(task?.cuttingQuantity ?? bundles.reduce((s, x) => s + (Number(x.quantity) || 0), 0))}</div>
      <div>扎数：${safe(task?.cuttingBundleCount ?? bundles.length)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th style="width:48px">序号</th>
          <th style="width:90px">颜色</th>
          <th style="width:80px">尺码</th>
          <th style="width:70px">扎号</th>
          <th style="width:80px" class="right">数量</th>
          <th>二维码内容</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    <script>
      window.onload = function(){ window.print(); };
    </script>
  </body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      message.error('浏览器拦截了新窗口，请允许弹窗后重试');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const openSheetPreview = async (task: CuttingTask, afterLoad?: 'download' | 'print') => {
    const on = String(task?.productionOrderNo || '').trim();
    if (!on) {
      message.warning('未找到订单号');
      return;
    }

    const purchaseSeq = (sheetPreviewPurchaseReqSeq.current += 1);
    setSheetPreviewTask(task);
    setSheetPreviewOpen(true);
    setSheetPreviewLoading(true);
    setSheetPreviewPurchaseLoading(true);
    setSheetPreviewPurchases([]);
    try {
      const purchasePromise = fetchSortedPurchasesByOrderNo(on);

      const [rows, purchases] = await Promise.all([
        fetchAllBundlesByOrderNo(on),
        purchasePromise,
      ]);
      setSheetPreviewBundles(rows);
      if (purchaseSeq === sheetPreviewPurchaseReqSeq.current) setSheetPreviewPurchases(purchases);
      if (afterLoad === 'download') {
        downloadSheetCsvFrom(task, rows, purchases);
      }
      if (afterLoad === 'print') {
        triggerSheetPrintFrom(task, rows);
      }
    } finally {
      setSheetPreviewLoading(false);
      if (purchaseSeq === sheetPreviewPurchaseReqSeq.current) setSheetPreviewPurchaseLoading(false);
    }
  };

  const downloadSheetCsv = () => downloadSheetCsvFrom(sheetPreviewTask, sheetPreviewBundles, sheetPreviewPurchases);
  const triggerSheetPrint = () => triggerSheetPrintFrom(sheetPreviewTask, sheetPreviewBundles);

  const activeOrderNo = useMemo(() => String((activeTask as any)?.productionOrderNo ?? '').trim(), [activeTask]);

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
    }

    setPrintPreviewOpen(false);
    setTimeout(() => {
      window.print();
    }, 240);
  };

  const isAdmin = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  useEffect(() => {
    if (!isEntryPage) return;
    const oid = String(orderId || (activeTask as any)?.productionOrderId || '').trim();
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
        const activeColor = String((activeTask as any)?.color || '').trim();
        const uniqueColors = Array.from(
          new Set(lines.map((x: any) => String(x?.color || '').trim()).filter(Boolean))
        );
        const derivedColor = uniqueColors.length ? uniqueColors.join(' / ') : String((detail as any)?.color || '').trim();
        setEntryColorText(activeColor || derivedColor);

        const filtered = activeColor
          ? lines.filter((x: any) => String(x?.color || '').trim() === activeColor)
          : lines;
        const sizeMap = new Map<string, number>();
        for (const l of filtered) {
          const size = String((l as any)?.size || '').trim();
          if (!size) continue;
          const qty = Number((l as any)?.quantity ?? 0) || 0;
          sizeMap.set(size, (sizeMap.get(size) || 0) + qty);
        }
        const items = Array.from(sizeMap.entries())
          .map(([size, quantity]) => ({ size, quantity }))
          .sort((a, b) => compareSizeAsc(a.size, b.size));
        setEntrySizeItems(items);
      } catch {
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
  }, [isEntryPage, orderId, activeTask?.id, (activeTask as any)?.color]);

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
          .map((r: any) => String(r?.productionOrderId || '').trim())
          .filter(Boolean)
      )
    );
  }, [taskList]);

  const orderFrozen = useProductionOrderFrozenCache(frozenOrderIds, { rule: 'status', acceptAnyData: false });

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await orderFrozen.ensureUnlocked(orderId, () => message.error('订单已完成，无法操作'));
  };

  const isOrderFrozenById = (orderId: any) => {
    return orderFrozen.isFrozenById(orderId);
  };

  const fetchBundles = async () => {
    if (!activeTask?.productionOrderNo) {
      setDataSource([]);
      setTotal(0);
      return;
    }
    setListLoading(true);
    try {
      const res = await api.get<any>('/production/cutting/list', {
        params: {
          ...queryParams,
          orderNo: activeTask.productionOrderNo,
        },
      });
      const result = res as any;
      if (result.code === 200) {
        setDataSource(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取裁剪列表失败');
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
      const res = await api.get<any>('/production/cutting-task/list', { params: taskQuery });
      const result = res as any;
      if (result.code === 200) {
        setTaskList(result.data.records || []);
        setTaskTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取裁剪任务失败');
      }
    } catch {
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
        const res = await api.get<any>('/production/cutting/list', {
          params: { ...queryParams, orderNo: activeTask.productionOrderNo }
        });
        const result = res as any;
        if (result.code === 200) {
          return {
            records: result.data.records || [],
            total: result.data.total || 0
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
        const res = await api.get<any>('/production/cutting-task/list', { params: taskQuery });
        const result = res as any;
        if (result.code === 200) {
          return {
            records: result.data.records || [],
            total: result.data.total || 0
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
      const res = await api.get<any>('/production/cutting-task/list', {
        params: { page: 1, pageSize: 10, status: '', orderNo: on, styleNo: '' },
      });
      const result = res as any;
      if (result.code !== 200) return null;
      const records: CuttingTask[] = result.data.records || [];
      const matched = records.find((x) => String(x?.productionOrderNo || '').trim() === on) || records[0] || null;
      return matched;
    } catch {
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
      let nextTask = task;
      if (String(task.status || '') === 'pending') {
        if (!user?.id || !user?.name) {
          message.error('未获取到当前登录人员信息');
          return;
        }
        try {
          const res = await api.post<any>('/production/cutting-task/receive', {
            taskId: task.id,
            receiverId: user?.id,
            receiverName: user?.name,
          });
          const result = res as any;
          if (result.code === 200) {
            nextTask = result.data || task;
          } else {
            message.error(result.message || '领取任务失败');
          }
        } catch {
          message.error('领取任务失败');
        }
      }
      setActiveTask(nextTask);
      setOrderId(String(nextTask.productionOrderId || '').trim());
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
    if (!(await ensureOrderUnlockedById((task as any)?.productionOrderId))) return;
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
          const res = await api.post<any>('/production/cutting-task/rollback', {
            taskId: task.id,
            operatorId: user?.id,
            reason: remark,
          });
          const result = res as any;
          if (result.code === 200) {
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
            message.error(result.message || '退回失败');
          }
        } catch {
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
      const res = await api.post<any>('/production/cutting-task/receive', payload);
      const result = res as any;
      if (result.code === 200) {
        message.success('领取任务成功');
        fetchTasks();
        goToEntry(result.data || task);
      } else {
        message.error(result.message || '领取任务失败');
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
      (next[index] as any)[key] = value;
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
          const res = await api.post<any>('/production/cutting/receive', payload);
          const result = res as any;
          if (result.code === 200) {
            message.success('保存并生成成功');
            clearBundleSelection();
            setPrintBundles([]);
            await fetchBundles();
            await syncActiveTaskByOrderNo(activeTask.productionOrderNo);
            setPrintUnlocked(true);
          } else {
            message.error(result.message || '生成失败');
          }
        } catch {
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
    const oid = String(orderId || activeTask.productionOrderId || '').trim();
    if (!oid) {
      message.error('未匹配到生产订单ID');
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
      const fallbackQty = Number((detail as any)?.orderQuantity ?? activeTask.orderQuantity ?? 0) || 0;
      const fallbackColor = String((detail as any)?.color ?? activeTask.color ?? '').trim();
      const fallbackSize = String((detail as any)?.size ?? activeTask.size ?? '').trim();
      const fallbackOrderNo = String((detail as any)?.orderNo ?? activeTask.productionOrderNo ?? '').trim();
      const fallbackStyleNo = String((detail as any)?.styleNo ?? activeTask.styleNo ?? '').trim();
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
          render: (v: any) => getMaterialTypeLabel(v),
        },
        { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, ellipsis: true },
        { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
        {
          title: '规格',
          dataIndex: 'specifications',
          key: 'specifications',
          width: 180,
          ellipsis: true,
          render: (v: any) => String(v || '').trim() || '-',
        },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 90, ellipsis: true },
        {
          title: '采购数量',
          dataIndex: 'purchaseQuantity',
          key: 'purchaseQuantity',
          width: 110,
          align: 'right' as const,
          render: (v: any) => Number(v ?? 0) || 0,
        },
        {
          title: '单价(元)',
          dataIndex: 'unitPrice',
          key: 'unitPrice',
          width: 110,
          align: 'right' as const,
          render: (v: any) => {
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
      ] as any,
    []
  );

  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={(activeTask as any)?.styleId} styleNo={record.styleNo || (activeTask as any)?.styleNo} size={24} borderRadius={4} />
      )
    },
    {
      title: '订单号',
      dataIndex: 'productionOrderNo',
      key: 'productionOrderNo',
      width: 140,
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
      render: () => (activeTask as any)?.styleName || '-',
    },
    {
      title: '附件',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={(activeTask as any)?.styleId}
          styleNo={record.styleNo || (activeTask as any)?.styleNo}
          modalTitle={(record.styleNo || (activeTask as any)?.styleNo) ? `附件（${record.styleNo || (activeTask as any)?.styleNo}）` : '附件'}
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
        return <Tag color="blue">{s ? (map[s] || '未知') : '已生成'}</Tag>;
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
              <Form layout="inline" size="small" style={{ marginBottom: 12 }}>
                <Form.Item label="状态">
                  <Select
                    value={taskQuery.status}
                    style={{ width: 140 }}
                    onChange={(value) => setTaskQuery(prev => ({ ...prev, status: value, page: 1 }))}
                  >
                    <Option value="">全部</Option>
                    <Option value="pending">待领取</Option>
                    <Option value="received">已领取</Option>
                    <Option value="bundled">已完成</Option>
                  </Select>
                </Form.Item>
                <Form.Item label="订单号">
                  <Input
                    value={taskQuery.orderNo}
                    style={{ width: 180 }}
                    placeholder="订单号"
                    onChange={(e) => setTaskQuery(prev => ({ ...prev, orderNo: e.target.value, page: 1 }))}
                  />
                </Form.Item>
                <Form.Item label="款号">
                  <Input
                    value={taskQuery.styleNo}
                    style={{ width: 160 }}
                    placeholder="款号"
                    onChange={(e) => setTaskQuery(prev => ({ ...prev, styleNo: e.target.value, page: 1 }))}
                  />
                </Form.Item>
                <Form.Item className="filter-actions">
                  <Space>
                    <Button type="primary" onClick={fetchTasks}>查询</Button>
                    <Button onClick={() => setTaskQuery({ page: 1, pageSize: 10, status: '', orderNo: '', styleNo: '' })}>重置</Button>
                  </Space>
                </Form.Item>
              </Form>

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
                      <Button
                        type="link"
                        size="small"
                        onClick={() => goToEntry(record)}
                        title={String(v || '').trim() || '-'}
                        style={{ padding: 0, height: 'auto', color: '#2D7FF9' }}
                      >
                        <span
                          style={{
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            width: '100%',
                          }}
                        >
                          {String(v || '').trim() || '-'}
                        </span>
                      </Button>
                    ),
                  },
                  {
                    title: '款号',
                    dataIndex: 'styleNo',
                    key: 'styleNo',
                    width: 200,
                    render: (v: any) => (
                      <Text ellipsis={{ tooltip: String(v || '').trim() || '-' }} style={{ width: '100%', display: 'inline-block' }}>
                        {String(v || '').trim() || '-'}
                      </Text>
                    ),
                  },
                  { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
                  {
                    title: '附件',
                    key: 'attachments',
                    width: 100,
                    render: (_: any, record: any) => (
                      <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} modalTitle={record.styleNo ? `附件（${record.styleNo}）` : '附件'} />
                    )
                  },
                  { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 90, align: 'right' as const },
                  {
                    title: '裁剪数',
                    dataIndex: 'cuttingQuantity',
                    key: 'cuttingQuantity',
                    width: 90,
                    align: 'right' as const,
                    render: (v: any) => Number(v ?? 0) || 0,
                  },
                  {
                    title: '扎数',
                    dataIndex: 'cuttingBundleCount',
                    key: 'cuttingBundleCount',
                    width: 80,
                    align: 'right' as const,
                    render: (v: any) => Number(v ?? 0) || 0,
                  },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    key: 'status',
                    width: 120,
                    render: (value: string) => {
                      const map: any = {
                        pending: { text: '待领取', color: 'blue' },
                        received: { text: '已领取', color: 'gold' },
                        bundled: { text: '已完成', color: 'green' },
                      };
                      const cfg = map[value] || { text: value || '-', color: 'default' };
                      return <Tag color={cfg.color}>{cfg.text}</Tag>;
                    }
                  },
                  { title: '领取账号', dataIndex: 'receiverName', key: 'receiverName', width: 110, render: (v: any) => String(v || '').trim() || '-' },
                  { title: '账号ID', dataIndex: 'receiverId', key: 'receiverId', width: 120, render: (v: any) => String(v || '').trim() || '-' },
                  { title: '领取时间', dataIndex: 'receivedTime', key: 'receivedTime', width: 170, render: (v: any) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-') },
                  { title: '完成时间', dataIndex: 'bundledTime', key: 'bundledTime', width: 170, render: (v: any) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-') },
                  {
                    title: '操作',
                    key: 'action',
                    width: 92,
                    render: (_: any, record: CuttingTask) => {
                      const orderId = String((record as any)?.productionOrderId || '').trim();
                      const frozen = isOrderFrozenById(orderId);
                      const entryLabel = record.status === 'pending' ? '领取并进入' : '进入';
                      const entryDisabled = frozen || (record.status === 'pending' && receiveTaskLoading);
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
                              key: 'entry',
                              label: entryLabel,
                              title: entryLabel,
                              icon: <LoginOutlined />,
                              disabled: entryDisabled,
                              onClick: () => {
                                if (record.status === 'pending') {
                                  return handleReceiveTask(record);
                                }
                                return goToEntry(record);
                              },
                              primary: true,
                            },
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
                ] as any}
                dataSource={taskList}
                rowKey={(row) => row.id || row.productionOrderId}
                loading={taskLoading}
                minColumnWidth={110}
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
                    <Row gutter={16} className="purchase-detail-top">
                      <Col xs={24} md={8} lg={6}>
                        <div className="purchase-detail-right">
                          <StyleCoverThumb
                            styleId={(activeTask as any)?.styleId}
                            styleNo={activeTask?.styleNo}
                            size={160}
                            borderRadius={8}
                          />
                          {activeTask?.productionOrderNo ? (
                            <div style={{ marginTop: 12, textAlign: 'center' }}>
                              <QRCodeCanvas
                                value={JSON.stringify({
                                  type: 'order',
                                  orderNo: activeTask.productionOrderNo,
                                  styleNo: activeTask.styleNo,
                                  styleName: activeTask.styleName,
                                })}
                                size={120}
                                level="M"
                                includeMargin
                              />
                              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>订单号</div>
                              <div style={{ fontSize: 10, color: '#999', marginTop: 2 }}>{String(activeTask.productionOrderNo || '').trim() || '-'}</div>
                            </div>
                          ) : null}
                        </div>
                      </Col>
                      <Col xs={24} md={16} lg={18}>
                        <div className="purchase-detail-left">
                          <Row gutter={16}>
                            <Col xs={24} sm={12} lg={8}>
                              <div className="purchase-detail-field">
                                <div className="purchase-detail-label">订单号</div>
                                <div className="purchase-detail-value order-no-compact">{String(activeTask.productionOrderNo || '').trim() || '-'}</div>
                              </div>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <div className="purchase-detail-field">
                                <div className="purchase-detail-label">款号</div>
                                <div className="purchase-detail-value">{String(activeTask.styleNo || '').trim() || '-'}</div>
                              </div>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <div className="purchase-detail-field">
                                <div className="purchase-detail-label">款名</div>
                                <div className="purchase-detail-value">{String(activeTask.styleName || '').trim() || '-'}</div>
                              </div>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <div className="purchase-detail-field">
                                <div className="purchase-detail-label">颜色</div>
                                <div className="purchase-detail-value">{String(entryColorText || activeTask.color || '').trim() || '-'}</div>
                              </div>
                            </Col>
                          </Row>

                          <div className="purchase-detail-size-block">
                            {entryOrderDetailLoading ? (
                              <div className="purchase-detail-size-row">
                                <span className="purchase-detail-size-item">加载中...</span>
                              </div>
                            ) : (
                              <div className="purchase-detail-size-table-wrap">
                                <table className="purchase-detail-size-table">
                                  <tbody>
                                    <tr>
                                      <th className="purchase-detail-size-th">码数</th>
                                      {entrySizeItems.length
                                        ? entrySizeItems.map((x) => (
                                          <td key={x.size} className="purchase-detail-size-td">{x.size}</td>
                                        ))
                                        : <td className="purchase-detail-size-td">-</td>
                                      }
                                      <td className="purchase-detail-size-total-cell" />
                                    </tr>
                                    <tr>
                                      <th className="purchase-detail-size-th">数量</th>
                                      {entrySizeItems.length
                                        ? entrySizeItems.map((x) => (
                                          <td key={x.size} className="purchase-detail-size-td">{Number(x.quantity || 0) || 0}</td>
                                        ))
                                        : <td className="purchase-detail-size-td">-</td>
                                      }
                                      <td className="purchase-detail-size-total-cell">
                                        总下单数：{entrySizeItems.length
                                          ? entrySizeItems.reduce((s, x) => s + (Number(x.quantity || 0) || 0), 0)
                                          : (Number(activeTask?.orderQuantity ?? 0) || 0)}
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  </div>

                  <div>
                    {isAdmin && activeTask && activeTask.status !== 'pending' ? (
                      <div className="cutting-entry-actions">
                        <Button
                          danger
                          onClick={() => handleRollbackTask(activeTask)}
                          loading={rollbackTaskLoading}
                          disabled={isOrderFrozenById((activeTask as any)?.productionOrderId)}
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
                                领取裁剪单并生成二维码
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
                            `${(r as any)?.materialType || ''}-${(r as any)?.materialCode || ''}-${(r as any)?.supplierName || ''}`
                          )
                        }
                        loading={entryPurchaseLoading}
                        pagination={false as any}
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
                columns={columns as any}
                dataSource={dataSource}
                rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}
                size="small"
                rowSelection={{
                  selectedRowKeys: selectedBundleRowKeys,
                  onChange: (keys, rows) => {
                    setSelectedBundleRowKeys(keys);
                    setSelectedBundles((rows as any) || []);
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
                    onChange={(v) => setPrintConfig((p) => ({ ...p, mode: v as any }))}
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
                        pageSize: v as any,
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
                        orientation: v as any,
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
                      style={{ background: '#fff' }}
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
            <ResizableModalFlex style={{ gap: 12 }}>
              <Card
                size="small"
                loading={sheetPreviewLoading}
                style={{
                  background: 'linear-gradient(135deg, #f6f8fb 0%, #ffffff 100%)',
                  border: '1px solid #e8edf5'
                }}
              >
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  {/* 订单扫码二维码 - 左侧 */}
                  {sheetPreviewTask?.productionOrderNo && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '8px',
                      background: '#e6f7ff',
                      borderRadius: '8px',
                      border: '2px solid #1890ff',
                      boxShadow: '0 4px 12px rgba(24, 144, 255, 0.15)',
                      flexShrink: 0
                    }}>
                      <QRCodeCanvas
                        value={JSON.stringify({
                          type: 'order',
                          orderNo: sheetPreviewTask.productionOrderNo
                        })}
                        size={120}
                        level="M"
                        includeMargin={false}
                      />
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#1890ff',
                        fontWeight: 600
                      }}>
                        📱 订单扫码
                      </div>
                    </div>
                  )}

                  {/* 订单信息 - 中间 */}
                  <div style={{ flex: 1, minWidth: 300 }}>
                    <Space wrap size="small">
                      <Tag color="blue">订单号：{String(sheetPreviewTask?.productionOrderNo || '').trim() || '-'}</Tag>
                      <Tag>款号：{String(sheetPreviewTask?.styleNo || '').trim() || '-'}</Tag>
                      <Tag>款名：{String(sheetPreviewTask?.styleName || '').trim() || '-'}</Tag>
                      <Tag>下单数：{Number(sheetPreviewTask?.orderQuantity ?? 0) || 0}</Tag>
                      <Tag>
                        裁剪数：
                        {(() => {
                          const tv = Number((sheetPreviewTask as any)?.cuttingQuantity);
                          if (Number.isFinite(tv) && tv > 0) return tv;
                          const sum = sheetPreviewBundles.reduce((s, x) => s + (Number((x as any)?.quantity) || 0), 0);
                          return Number(sum) || 0;
                        })()}
                      </Tag>
                      <Tag>
                        扎数：
                        {(() => {
                          const tv = Number((sheetPreviewTask as any)?.cuttingBundleCount);
                          if (Number.isFinite(tv) && tv > 0) return tv;
                          return Number(sheetPreviewBundles.length) || 0;
                        })()}
                      </Tag>
                    </Space>
                  </div>

                  {/* 裁剪单二维码 - 右侧 */}
                  {sheetPreviewTask?.qrCode && (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#ffffff',
                      borderRadius: '8px',
                      border: '1px solid #e8edf5',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                      flexShrink: 0
                    }}>
                      <div style={{
                        padding: '8px',
                        background: '#ffffff',
                        borderRadius: '6px',
                        border: '2px solid #e8edf5'
                      }}>
                        <QRCodeCanvas
                          value={sheetPreviewTask.qrCode}
                          size={100}
                          level="M"
                          includeMargin={false}
                        />
                      </div>
                      <div style={{
                        marginTop: '8px',
                        fontSize: '12px',
                        color: '#666',
                        fontWeight: 500
                      }}>
                        裁剪单二维码
                      </div>
                      <div style={{
                        fontSize: '11px',
                        color: '#999',
                        maxWidth: '120px',
                        textAlign: 'center',
                        wordBreak: 'break-all',
                        marginTop: '4px'
                      }}>
                        {sheetPreviewTask.qrCode}
                      </div>
                    </div>
                  )}
                </div>
              </Card>

              <Card size="small" title="面辅料采购明细" loading={sheetPreviewPurchaseLoading}>
                <ResizableTable<MaterialPurchase>
                  storageKey="cutting-sheet-preview-purchase-table"
                  columns={purchaseColumns}
                  dataSource={sheetPreviewPurchases}
                  rowKey={(r) => String(r?.id ?? `${(r as any)?.materialType || ''}-${(r as any)?.materialCode || ''}-${(r as any)?.supplierName || ''}`)}
                  loading={sheetPreviewPurchaseLoading}
                  pagination={false as any}
                  size="small"
                  scroll={{ x: 'max-content', y: isMobile ? 180 : 200 }}
                />
              </Card>

              <ResizableModalFlexFill ref={sheetPreviewTableWrapRef}>
                <ResizableTable<CuttingBundleRow>
                  storageKey="cutting-sheet-preview-table"
                  columns={[
                    { title: '颜色', dataIndex: 'color', key: 'color', width: 120 },
                    { title: '尺码', dataIndex: 'size', key: 'size', width: 90 },
                    { title: '扎号', dataIndex: 'bundleNo', key: 'bundleNo', width: 90 },
                    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100, align: 'right' as const },
                    { title: '二维码内容', dataIndex: 'qrCode', key: 'qrCode', ellipsis: true },
                  ] as any}
                  dataSource={sheetPreviewBundles}
                  rowKey={(row) => row.id || `${row.productionOrderNo}-${row.bundleNo}-${row.color}-${row.size}`}
                  loading={sheetPreviewLoading}
                  pagination={false as any}
                  scroll={{ x: 'max-content', y: sheetPreviewTableScrollY }}
                />
              </ResizableModalFlexFill>
            </ResizableModalFlex>
          </ResizableModal>

          <div
            className="cutting-qr-print-area"
            style={
              {
                ['--cutting-print-cols' as any]: String(printConfig.cols),
                ['--cutting-label-w' as any]: String(printConfig.labelW),
                ['--cutting-label-h' as any]: String(printConfig.labelH),
                ['--cutting-label-gap' as any]: String(printConfig.gap),
              } as any
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


        </Card>
      </div>
    </Layout>
  );
};


export default CuttingManagement;
