import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Card, Form, Input, InputNumber, Select, Space, Tag, Table } from 'antd';
import { EyeOutlined, PlusOutlined, EditOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
import { useSync } from '@/utils/syncManager';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import QuickEditModal from '@/components/common/QuickEditModal';
import api, { compareSizeAsc, fetchProductionOrderDetail, parseProductionOrderLines, useProductionOrderFrozenCache } from '@/utils/api';
import { QRCodeCanvas } from 'qrcode.react';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
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
} from '@/components/common/ModalContentLayout';
import '../../../styles.css';

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

  // 菲号打印配置：固定两种纸张规格
  const [printConfig, setPrintConfig] = useState<{
    paperSize: '7x4' | '10x5';
    qrSize: number;
  }>({
    paperSize: '7x4',  // 默认 7cm x 4cm
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

  // 状态统计卡片
  const [cuttingStats, setCuttingStats] = useState<{
    totalCount: number; totalQuantity: number; pendingCount: number; receivedCount: number; bundledCount: number;
  }>({ totalCount: 0, totalQuantity: 0, pendingCount: 0, receivedCount: 0, bundledCount: 0 });
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'pending' | 'received' | 'bundled'>('all');

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

    // 使用 iframe 打印，完全隔离打印内容，解决主页面CSS干扰问题
    const labelW = printConfig.paperSize === '7x4' ? 70 : 100;
    const labelH = printConfig.paperSize === '7x4' ? 40 : 50;
    const pageSize = printConfig.paperSize === '7x4' ? '70mm 40mm' : '100mm 50mm';
    const qrSize = printConfig.qrSize;

    // 使用在线API生成二维码（稳定可靠）
    const getQRUrl = (code: string) => {
      if (!code) return '';
      return `https://api.qrserver.com/v1/create-qr-code/?size=${qrSize}x${qrSize}&data=${encodeURIComponent(code)}`;
    };

    const labelsHtml = printBundles.map((b) => `
      <div class="print-page">
        <div class="label">
          <div class="qr">
            <img src="${getQRUrl(b.qrCode || '')}" width="${qrSize}" height="${qrSize}" />
          </div>
          <div class="text">
            <div>订单：${String(b.productionOrderNo || '').trim() || '-'}</div>
            <div>款号：${String(b.styleNo || '').trim() || '-'}</div>
            <div>颜色：${String(b.color || '').trim() || '-'}</div>
            <div>码数：${String(b.size || '').trim() || '-'}</div>
            <div>数量：${Number(b.quantity || 0)}</div>
            <div>扎号：${Number(b.bundleNo || 0) || '-'}</div>
          </div>
        </div>
      </div>
    `).join('');

    // 计算打印时QR码尺寸（与预览保持一致比例）
    const printQrSize = Math.min(labelH - 8, qrSize * 0.28); // mm为单位，与预览比例一致

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>菲号标签打印</title>
        <style>
          @page {
            size: ${pageSize};
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: ${labelW}mm;
            height: ${labelH}mm;
            font-family: Arial, "Microsoft YaHei", sans-serif;
          }
          .print-page {
            width: ${labelW}mm;
            height: ${labelH}mm;
            padding: 2mm;
            page-break-after: always;
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .print-page:last-child {
            page-break-after: auto;
          }
          .label {
            width: ${labelW - 4}mm;
            height: ${labelH - 4}mm;
            border: 1px solid #000;
            display: flex;
            flex-direction: row;
            padding: 1.5mm;
            gap: 1.5mm;
            background: white;
          }
          .qr {
            flex: 0 0 auto;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .qr img {
            width: ${printQrSize}mm;
            height: ${printQrSize}mm;
          }
          .text {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: space-around;
            font-size: ${labelH > 45 ? '9pt' : '7pt'};
            font-weight: normal;
            line-height: 1.3;
            color: #000;
          }
          .text > div {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
      </body>
      </html>
    `;

    // 创建隐藏的 iframe 进行打印
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:none;';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      // 等待图片加载完成后打印
      const images = iframeDoc.querySelectorAll('img');
      let loadedCount = 0;
      const totalImages = images.length;

      const doPrint = () => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        // 打印完成后移除 iframe
        setTimeout(() => {
          try { document.body.removeChild(iframe); } catch {}
        }, 1000);
      };

      const onImageLoad = () => {
        loadedCount++;
        if (loadedCount >= totalImages) {
          setTimeout(doPrint, 100);
        }
      };

      if (totalImages === 0) {
        setTimeout(doPrint, 100);
      } else {
        images.forEach(img => {
          if (img.complete) {
            onImageLoad();
          } else {
            img.onload = onImageLoad;
            img.onerror = onImageLoad; // 即使加载失败也继续打印
          }
        });
        // 超时保护：5秒后强制打印
        setTimeout(() => {
          if (loadedCount < totalImages) {
            doPrint();
          }
        }, 5000);
      }
    }

    setPrintPreviewOpen(false);
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

  // 获取裁剪任务状态统计
  const fetchCuttingStats = useCallback(async () => {
    try {
      const filterParams: Record<string, string> = {};
      if (taskQuery.orderNo) filterParams.orderNo = taskQuery.orderNo;
      if (taskQuery.styleNo) filterParams.styleNo = taskQuery.styleNo;
      const res = await api.get<{ code: number; data: typeof cuttingStats }>('/production/cutting-task/stats', { params: filterParams });
      if (res.code === 200 && res.data) {
        setCuttingStats(res.data);
      }
    } catch (error) {
      console.error('获取裁剪统计失败', error);
    }
  }, [taskQuery.orderNo, taskQuery.styleNo]);

  // 点击统计卡片筛选
  const handleStatClick = (type: 'all' | 'pending' | 'received' | 'bundled') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setTaskQuery(prev => ({ ...prev, status: '', page: 1 }));
    } else {
      setTaskQuery(prev => ({ ...prev, status: type, page: 1 }));
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

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    if (!isEntryPage) {
      fetchCuttingStats();
    }
  }, [isEntryPage, fetchCuttingStats]);

  // 同步搜索栏 status dropdown → 统计卡片高亮
  useEffect(() => {
    const s = (taskQuery.status || '').trim().toLowerCase();
    if (!s) {
      setActiveStatFilter('all');
    } else if (s === 'pending' || s === 'received' || s === 'bundled') {
      setActiveStatFilter(s);
    } else {
      setActiveStatFilter('all');
    }
  }, [taskQuery.status]);

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
        fetchCuttingStats();
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
            if (!canViewPrice(user)) return '***';
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
            if (!canViewPrice(user)) return '***';
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
              <h2 className="page-title" style={{ margin: 0 }}>裁剪管理</h2>
            </div>
          )}

          {isEntryPage ? null : (
            <Card size="small" title="裁剪任务" className="mb-sm">
              {/* 状态统计卡片 - 点击筛选 */}
              <PageStatCards
                activeKey={activeStatFilter}
                cards={[
                  {
                    key: 'all',
                    items: [
                      { label: '任务总数', value: cuttingStats.totalCount, unit: '条', color: 'var(--color-primary)' },
                      { label: '总数量', value: cuttingStats.totalQuantity, color: 'var(--color-success)' },
                    ],
                    onClick: () => handleStatClick('all'),
                    activeColor: 'var(--color-primary)',
                    activeBg: 'rgba(45, 127, 249, 0.1)',
                  },
                  {
                    key: 'pending',
                    items: [{ label: '待领取', value: cuttingStats.pendingCount, unit: '条', color: 'var(--color-warning)' }],
                    onClick: () => handleStatClick('pending'),
                    activeColor: '#faad14',
                    activeBg: '#fff7e6',
                  },
                  {
                    key: 'received',
                    items: [{ label: '已领取', value: cuttingStats.receivedCount, unit: '条', color: 'var(--color-primary)' }],
                    onClick: () => handleStatClick('received'),
                    activeColor: 'var(--color-primary)',
                    activeBg: 'rgba(45, 127, 249, 0.1)',
                  },
                  {
                    key: 'bundled',
                    items: [{ label: '已完成', value: cuttingStats.bundledCount, unit: '条', color: 'var(--color-success)' }],
                    onClick: () => handleStatClick('bundled'),
                    activeColor: '#52c41a',
                    activeBg: 'rgba(34, 197, 94, 0.15)',
                  },
                ]}
              />

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
                      { label: '全部', value: '' },
                      { label: '待领取', value: 'pending' },
                      { label: '已领取', value: 'received' },
                      { label: '已完成', value: 'bundled' },
                    ]}
                    showSearchButton
                    onSearch={() => fetchTasks()}
                    showResetButton
                    onReset={() => {
                      setTaskQuery({ page: 1, pageSize: 10, status: '', orderNo: '', styleNo: '' });
                      setTaskDateRange(null);
                    }}
                  />
                )}
                right={(
                  <Button type="primary" onClick={openCreateTask}>
                    新建裁剪任务
                  </Button>
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
                  { title: '下单人', dataIndex: 'orderCreatorName', key: 'orderCreatorName', width: 110, render: (v: unknown) => String(v || '').trim() || '-' },
                  {
                    title: '下单时间',
                    dataIndex: 'orderTime',
                    key: 'orderTime',
                    width: 170,
                    render: (v: unknown) => (String(v ?? '').trim() ? (formatDateTime(v) || '-') : '-')
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
                              key: 'edit',
                              label: '编辑',
                              title: frozen ? '编辑（订单已关单）' : '编辑',
                              disabled: frozen,
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
                  showTotal: (total) => `共 ${total} 条`,
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
                      coverSize={160}
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
                        scroll={{ x: 'max-content' }}
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
                scroll={{ x: 'max-content' }}
                pagination={{
                  current: queryParams.page,
                  pageSize: queryParams.pageSize,
                  total,
                  showTotal: (total) => `共 ${total} 条`,
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
                    下载/打印
                  </Button>,
                ]}
                autoFontSize={false}
                initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
                scaleWithViewport
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 16, alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)' }}>打印纸规格</span>
                  <Select
                    value={printConfig.paperSize}
                    style={{ width: 150 }}
                    options={[
                      { label: '7cm × 4cm', value: '7x4' },
                      { label: '10cm × 5cm', value: '10x5' },
                    ]}
                    onChange={(v) => setPrintConfig((p) => ({ ...p, paperSize: v as '7x4' | '10x5' }))}
                  />
                  <span style={{ fontWeight: 600, fontSize: 'var(--font-size-base)', marginLeft: 16 }}>二维码大小</span>
                  <InputNumber
                    min={60}
                    max={150}
                    value={printConfig.qrSize}
                    onChange={(v) => setPrintConfig((p) => ({ ...p, qrSize: Math.max(60, Number(v) || 84) }))}
                    addonAfter="px"
                    style={{ width: 120 }}
                  />
                  <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)', marginLeft: 16 }}>💡 每页打印一张菲号标签</span>
                </div>

                {/* 预览区域 - 单张滚动显示，模拟真实打印效果 */}
                <div
                  style={{
                    padding: '12px 16px',
                    background: 'var(--primary-color)',
                    color: '#fff',
                    marginBottom: '8px',
                    borderRadius: '4px',
                    textAlign: 'center',
                    fontSize: '14px',
                    fontWeight: 600,
                  }}
                >
                  共 {printBundles.length} 张菲号标签，实际尺寸：{printConfig.paperSize === '7x4' ? '7cm × 4cm' : '10cm × 5cm'}（一页一张，居中显示）
                </div>
                <div
                  style={{
                    padding: '10px 16px',
                    background: '#d4edda',
                    color: '#155724',
                    marginBottom: '16px',
                    borderRadius: '4px',
                    border: '1px solid #28a745',
                    fontSize: '13px',
                    lineHeight: '1.6',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '4px' }}>✅ 使用说明：</div>
                  <div>• 点击"下载/打印"后直接选择打印机或"另存为PDF"即可</div>
                  <div>• 标签已按固定尺寸设置，无需手动调整纸张大小</div>
                  <div>• 每张标签独占一页，居中显示，方便裁剪</div>
                  <div>• 建议使用专用标签打印机或A4纸打印后裁剪</div>
                </div>
                <div
                  style={{
                    maxHeight: 'calc(85vh - 310px)',
                    overflowY: 'auto',
                    padding: '16px',
                    background: 'var(--color-bg-subtle)',
                  }}
                >
                  {printBundles.map((b, idx) => {
                    const paperRatio = printConfig.paperSize === '7x4' ? (70 / 40) : (100 / 50);
                    const previewWidth = 280; // 预览宽度固定280px
                    const previewHeight = previewWidth / paperRatio;

                    return (
                      <div
                        key={b.id || `${b.qrCode || ''}-${idx}`}
                        style={{
                          width: `${previewWidth}px`,
                          height: `${previewHeight}px`,
                          margin: '0 auto 16px',
                          background: 'var(--neutral-white)',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                          display: 'flex',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '8px',
                        }}
                      >
                        <div style={{
                          width: '100%',
                          height: '100%',
                          border: '1px solid #000',
                          padding: '6px',
                          display: 'flex',
                          gap: '6px',
                        }}>
                          <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center' }}>
                            {b.qrCode ? <QRCodeCanvas value={b.qrCode} size={Math.min(previewHeight - 20, printConfig.qrSize)} includeMargin /> : null}
                          </div>
                          <div style={{
                            flex: '1 1 auto',
                            fontSize: '11px',
                            lineHeight: '1.3',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-around',
                          }}>
                            <div>{`订单：${String(b.productionOrderNo || '').trim() || '-'}`}</div>
                            <div>{`款号：${String(b.styleNo || '').trim() || '-'}`}</div>
                            <div>{`颜色：${String(b.color || '').trim() || '-'}`}</div>
                            <div>{`码数：${String(b.size || '').trim() || '-'}`}</div>
                            <div>{`数量：${Number(b.quantity || 0)}`}</div>
                            <div>{`扎号：${Number(b.bundleNo || 0) || '-'}`}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ResizableModal>

            </>
          ) : null}

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
