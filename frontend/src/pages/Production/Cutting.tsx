import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Tag, Typography, message } from 'antd';
import { EyeOutlined, LoginOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableTable from '../../components/ResizableTable';
import RowActions from '../../components/RowActions';
import api, { ensureProductionOrderUnlocked, fetchProductionOrderDetail, primeProductionOrderFrozenCache } from '../../utils/api';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuth } from '../../utils/authContext';
import type { CuttingTask } from '../../types/production';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import { useNavigate, useParams } from 'react-router-dom';

const { Option } = Select;
const { Text } = Typography;

interface CuttingBundleRow {
  id?: string;
  productionOrderId?: string;
  productionOrderNo?: string;
  styleNo?: string;
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
  const { user } = useAuth();
  const navigate = useNavigate();
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
  const orderFrozenCacheRef = useRef<Map<string, boolean>>(new Map());
  const [orderFrozenVersion, setOrderFrozenVersion] = useState(0);
  const [bundlesInput, setBundlesInput] = useState<CuttingBundleRow[]>([{
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

  const [activeSummary, setActiveSummary] = useState({ totalQuantity: 0, bundleCount: 0 });

  const [sheetPreviewOpen, setSheetPreviewOpen] = useState(false);
  const [sheetPreviewLoading, setSheetPreviewLoading] = useState(false);
  const [sheetPreviewTask, setSheetPreviewTask] = useState<CuttingTask | null>(null);
  const [sheetPreviewBundles, setSheetPreviewBundles] = useState<CuttingBundleRow[]>([]);

  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskSubmitting, setCreateTaskSubmitting] = useState(false);
  const [createOrderNo, setCreateOrderNo] = useState('');
  const [createStyleOptions, setCreateStyleOptions] = useState<StyleOption[]>([]);
  const [createStyleLoading, setCreateStyleLoading] = useState(false);
  const [createStyleNo, setCreateStyleNo] = useState<string>('');
  const [createStyleName, setCreateStyleName] = useState<string>('');
  const [createBundles, setCreateBundles] = useState<CuttingBundleRow[]>([{ color: '', size: '', quantity: 0 }]);

  const resolveCuttingQty = (task: CuttingTask | null, summary: { totalQuantity: number }, bundles?: CuttingBundleRow[]) => {
    const tv = Number((task as any)?.cuttingQuantity);
    if (Number.isFinite(tv) && tv > 0) return tv;
    const sv = Number(summary?.totalQuantity ?? 0);
    if (Number.isFinite(sv) && sv > 0) return sv;
    if (bundles && bundles.length) {
      const sum = bundles.reduce((s, x) => s + (Number((x as any)?.quantity) || 0), 0);
      if (Number.isFinite(sum) && sum > 0) return sum;
    }
    return Number.isFinite(tv) ? tv : 0;
  };

  const resolveBundleCount = (task: CuttingTask | null, summary: { bundleCount: number }, bundles?: CuttingBundleRow[]) => {
    const tv = Number((task as any)?.cuttingBundleCount);
    if (Number.isFinite(tv) && tv > 0) return tv;
    const sv = Number(summary?.bundleCount ?? 0);
    if (Number.isFinite(sv) && sv > 0) return sv;
    if (bundles && bundles.length) {
      const len = bundles.length;
      if (Number.isFinite(len) && len > 0) return len;
    }
    return Number.isFinite(tv) ? tv : 0;
  };

  const fetchCuttingSummary = async (orderNo: string) => {
    const on = String(orderNo || '').trim();
    if (!on) return;
    try {
      const res = await api.get<any>('/production/cutting/summary', { params: { orderNo: on } });
      const result = res as any;
      if (result.code === 200) {
        setActiveSummary({
          totalQuantity: Number(result.data?.totalQuantity ?? 0) || 0,
          bundleCount: Number(result.data?.bundleCount ?? 0) || 0,
        });
      }
    } catch {
    }
  };

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

  const downloadSheetCsvFrom = (task: CuttingTask | null, bundles: CuttingBundleRow[]) => {
    const on = String(task?.productionOrderNo || '').trim() || 'unknown';
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
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
      lines.push(row);
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
      th, td { border: 1px solid #333; padding: 6px 8px; }
      th { background: #f3f3f3; text-align: left; }
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
    setSheetPreviewTask(task);
    setSheetPreviewOpen(true);
    setSheetPreviewLoading(true);
    try {
      const rows = await fetchAllBundlesByOrderNo(on);
      setSheetPreviewBundles(rows);
      if (afterLoad === 'download') {
        downloadSheetCsvFrom(task, rows);
      }
      if (afterLoad === 'print') {
        triggerSheetPrintFrom(task, rows);
      }
    } finally {
      setSheetPreviewLoading(false);
    }
  };

  const downloadSheetCsv = () => downloadSheetCsvFrom(sheetPreviewTask, sheetPreviewBundles);
  const triggerSheetPrint = () => triggerSheetPrintFrom(sheetPreviewTask, sheetPreviewBundles);

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

  const isAdmin = (() => {
    const role = String((user as any)?.role || '').trim();
    const username = String((user as any)?.username || '').trim();
    const lower = role.toLowerCase();
    return username === 'admin' || lower.includes('admin') || lower.includes('manager') || role.includes('管理员') || role.includes('主管') || role === '1';
  })();

  const parseOrderLines = (order: any) => {
    const detailsRaw = order?.orderDetails;
    const compareSizeAsc = (a: any, b: any) => {
      const norm = (v: any) => String(v ?? '').trim().toUpperCase();
      const parse = (v: any) => {
        const raw = norm(v);
        if (!raw || raw === '-') return { rank: 9999, num: 0, raw };
        if (raw === '均码' || raw === 'ONE SIZE' || raw === 'ONESIZE') return { rank: 55, num: 0, raw };
        if (/^\d+(\.\d+)?$/.test(raw)) return { rank: 0, num: Number(raw), raw };
        const mNumXL = raw.match(/^(\d+)XL$/);
        if (mNumXL) return { rank: 70 + (Number(mNumXL[1]) - 1) * 10, num: 0, raw };
        const mXS = raw.match(/^(X{0,4})S$/);
        if (mXS) return { rank: 40 - (mXS[1]?.length || 0) * 10, num: 0, raw };
        if (raw === 'S') return { rank: 40, num: 0, raw };
        if (raw === 'M') return { rank: 50, num: 0, raw };
        const mXL = raw.match(/^(X{1,4})L$/);
        if (mXL) return { rank: 60 + (mXL[1]?.length || 0) * 10, num: 0, raw };
        if (raw === 'L') return { rank: 60, num: 0, raw };
        if (raw === 'XL') return { rank: 70, num: 0, raw };
        if (raw === 'XXL') return { rank: 80, num: 0, raw };
        if (raw === 'XXXL') return { rank: 90, num: 0, raw };
        return { rank: 5000, num: 0, raw };
      };
      const pa = parse(a);
      const pb = parse(b);
      if (pa.rank !== pb.rank) return pa.rank - pb.rank;
      if (pa.num !== pb.num) return pa.num - pb.num;
      return String(pa.raw).localeCompare(String(pb.raw), 'zh-Hans-CN', { numeric: true });
    };
    const normalizeLine = (l: any) => {
      const color = String(l?.color ?? l?.colour ?? l?.colorName ?? '').trim();
      const size = String(l?.size ?? l?.sizeName ?? l?.spec ?? '').trim();
      const quantity = Number(l?.quantity ?? l?.qty ?? l?.count ?? l?.num ?? 0) || 0;
      return { color, size, quantity };
    };

    let parsed: any = null;
    if (detailsRaw) {
      try {
        parsed = typeof detailsRaw === 'string' ? JSON.parse(detailsRaw) : detailsRaw;
      } catch {
        parsed = null;
      }
    }

    let list: any[] = [];
    if (Array.isArray(parsed)) {
      list = parsed;
    } else if (parsed && typeof parsed === 'object') {
      const candidate = (parsed as any).lines || (parsed as any).items || (parsed as any).details || (parsed as any).list;
      if (Array.isArray(candidate)) list = candidate;
      else list = [parsed];
    }

    const normalized = list.map(normalizeLine).filter((l) => l.color || l.size || l.quantity);
    normalized.sort((a, b) => {
      const ca = String(a.color || '').trim();
      const cb = String(b.color || '').trim();
      if (ca && cb) {
        const byColor = ca.localeCompare(cb, 'zh-Hans-CN', { numeric: true });
        if (byColor !== 0) return byColor;
      }
      return compareSizeAsc(a.size, b.size);
    });
    if (normalized.length) return normalized;

    const fallbackColor = String(order?.color || '').trim();
    const fallbackSize = String(order?.size || '').trim();
    const fallbackQty = Number(order?.orderQuantity || 0) || 0;
    if (fallbackColor || fallbackSize || fallbackQty) {
      return [{ color: fallbackColor, size: fallbackSize, quantity: fallbackQty }];
    }
    return [];
  };

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

  const ensureOrderUnlockedById = async (orderId: any) => {
    return await ensureProductionOrderUnlocked(orderId, orderFrozenCacheRef.current, {
      rule: 'status',
      acceptAnyData: false,
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
        taskList
          .map((r: any) => String(r?.productionOrderId || '').trim())
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
              rule: 'status',
              acceptAnyData: false,
            })
          )
      );
      if (!cancelled) setOrderFrozenVersion((v) => v + 1);
    })();

    return () => {
      cancelled = true;
    };
  }, [taskList]);

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
        fetchCuttingSummary(activeTask.productionOrderNo);
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

  useEffect(() => {
    if (isEntryPage) return;
    fetchTasks();
  }, [isEntryPage, taskQuery]);

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
    setBundlesInput([{ color: '', size: '', quantity: 0 }]);
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
    fetchCuttingSummary(task.productionOrderNo);
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
      fetchCuttingSummary(nextTask.productionOrderNo);
      setImportLocked(false);
      setBundlesInput([{ color: '', size: '', quantity: 0 }]);
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
    Modal.confirm({
      title: '确认退回该裁剪任务？',
      content: '退回后会清空领取信息，并删除已生成的裁剪明细，可重新领取并重新生成。',
      okText: '退回',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setRollbackTaskLoading(true);
        try {
          const res = await api.post<any>('/production/cutting-task/rollback', {
            taskId: task.id,
            operatorId: user?.id,
          });
          const result = res as any;
          if (result.code === 200) {
            message.success('退回成功');
            if (activeTask?.id === task.id) {
              setActiveTask(null);
              setOrderId('');
              setImportLocked(false);
              setBundlesInput([{ color: '', size: '', quantity: 0 }]);
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
    } catch {
      message.error('领取任务失败');
    } finally {
      setReceiveTaskLoading(false);
    }
  };

  const handleAddRow = () => {
    setBundlesInput(prev => ([...prev, { color: '', size: '', quantity: 0 }]));
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

    Modal.confirm({
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

    const lines = parseOrderLines(detail);
    const next: CuttingBundleRow[] = [];
    for (const l of lines) {
      const color = String(l.color || '').trim();
      const size = String(l.size || '').trim();
      const quantity = Number(l.quantity || 0) || 0;
      if (!color || !size || quantity <= 0) continue;
      const chunks = splitQuantity(quantity, 20);
      for (const q of chunks) {
        next.push({ color, size, quantity: q });
      }
    }

    if (!next.length) {
      const fallbackQty = Number((detail as any)?.orderQuantity ?? activeTask.orderQuantity ?? 0) || 0;
      const fallbackColor = String((detail as any)?.color ?? activeTask.color ?? '').trim();
      const fallbackSize = String((detail as any)?.size ?? activeTask.size ?? '').trim();
      if (!fallbackQty || !fallbackColor || !fallbackSize) {
        message.error('订单明细未包含颜色/尺码/数量');
        return;
      }
      const chunks = splitQuantity(fallbackQty, 20);
      for (const q of chunks) {
        next.push({ color: fallbackColor, size: fallbackSize, quantity: q });
      }
    }

    setBundlesInput(next);
    setImportLocked(true);
    message.success('已按20件/扎自动生成推荐');
  };

  const totalInputQty = bundlesInput.reduce((sum, r) => sum + (Number(r?.quantity || 0) || 0), 0);

  const columns = [
    {
      title: '图片',
      key: 'cover',
      width: 72,
      render: (_: any, record: any) => (
        <StyleCoverThumb styleId={(activeTask as any)?.styleId} styleNo={record.styleNo || (activeTask as any)?.styleNo} size={48} borderRadius={6} />
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
      width: 120,
      render: (value: string) => (
        value ? <QRCodeCanvas value={value} size={84} includeMargin /> : null
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
          <div className="page-header">
            <Space>
              {isEntryPage ? (
                <Button onClick={() => resetActiveTask(true)}>返回任务列表</Button>
              ) : null}
              <h2 className="page-title" style={{ margin: 0 }}>{isEntryPage ? '裁剪明细录入' : '裁剪管理'}</h2>
            </Space>

            {isEntryPage ? null : (
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTask}>
                新建裁剪任务
              </Button>
            )}
          </div>

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

              <Card
                size="small"
                title={activeTask?.status === 'bundled' ? '裁剪任务明细' : '裁剪明细录入'}
                className="mb-sm"
                extra={
                  <Space>
                    {isAdmin && activeTask && activeTask.status !== 'pending' ? (
                      <Button
                        danger
                        onClick={() => handleRollbackTask(activeTask)}
                        loading={rollbackTaskLoading}
                        disabled={isOrderFrozenById((activeTask as any)?.productionOrderId)}
                      >
                        退回
                      </Button>
                    ) : null}
                  </Space>
                }
              >
                <Form layout="vertical">
                  <Form.Item label="当前领取任务">
                    <Space wrap className="cutting-active-task-tags">
                      <Tag color="blue">订单号：{activeTask.productionOrderNo}</Tag>
                      <Tag>款号：{activeTask.styleNo}</Tag>
                      <Tag>款名：{activeTask.styleName}</Tag>
                      <Tag>下单数：{activeTask.orderQuantity}</Tag>
                      <Tag>
                        裁剪数：
                        {String(activeTask?.status || '') === 'bundled'
                          ? resolveCuttingQty(activeTask, activeSummary, dataSource)
                          : totalInputQty}
                      </Tag>
                      <Tag>
                        扎数：
                        {String(activeTask?.status || '') === 'bundled'
                          ? resolveBundleCount(activeTask, activeSummary, dataSource)
                          : '-'}
                      </Tag>
                      <Tag>领取账号：{String(activeTask.receiverName || '').trim() || '-'}</Tag>
                      <Tag>领取时间：{formatDateTime(activeTask.receivedTime) || '-'}</Tag>
                      <Tag>完成时间：{formatDateTime(activeTask.bundledTime) || '-'}</Tag>
                    </Space>
                  </Form.Item>
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
                              setBundlesInput([{ color: '', size: '', quantity: 0 }]);
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
              </Card>

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
                rowSelection={{
                  selectedRowKeys: selectedBundleRowKeys,
                  onChange: (keys, rows) => {
                    setSelectedBundleRowKeys(keys);
                    setSelectedBundles((rows as any) || []);
                  },
                }}
                loading={listLoading}
                pagination={{
                  current: queryParams.page,
                  pageSize: queryParams.pageSize,
                  total,
                  showSizeChanger: true,
                  pageSizeOptions: ['10', '20', '50', '100', '200'],
                  onChange: (page, pageSize) => setQueryParams(prev => ({ ...prev, page, pageSize })),
                }}
              />

              <Modal
                open={printPreviewOpen}
                title={`批量打印（${printBundles.length}张）`}
                width="60vw"
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
              </Modal>

            </>
          ) : null}

          <Modal
            open={sheetPreviewOpen}
            title={`裁剪单（${String(sheetPreviewTask?.productionOrderNo || '').trim() || '-'}）`}
            width="64vw"
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
          >
            <Card size="small" loading={sheetPreviewLoading}>
              <Space wrap>
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
            </Card>

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
            />
          </Modal>

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

          <Modal
            open={createTaskOpen}
            title="新建裁剪任务"
            width={645}
            centered
            onCancel={() => setCreateTaskOpen(false)}
            okText="创建"
            confirmLoading={createTaskSubmitting}
            onOk={handleSubmitCreateTask}
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
          </Modal>


        </Card>
      </div>
    </Layout>
  );
};


export default CuttingManagement;
