import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Table, App, Dropdown, Checkbox } from 'antd';
import { SearchOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined, SettingOutlined, FileSearchOutlined, AppstoreOutlined, UnorderedListOutlined, PrinterOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import { ProductionOrder, ProductionQueryParams, ScanRecord } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import api, {
  isOrderFrozenByStatus,
  isOrderFrozenByStatusOrStock,
  parseProductionOrderLines,
  toNumberSafe,
  withQuery,
  isApiSuccess,
} from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import './styles.css';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import UniversalCardView from '@/components/common/UniversalCardView';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCodeBox from '@/components/common/QRCodeBox';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';

const { Option } = Select;

// 工具函数
const safeString = (value: any, defaultValue: string = '-') => {
  const str = String(value || '').trim();
  return str || defaultValue;
};

const ProductionList: React.FC = () => {
  // 使用 App Context 以支持动态主题
  const { message, modal } = App.useApp();

  // 状态管理
  const { isMobile, modalWidth } = useViewport();
  const orderModal = useModal<ProductionOrder>();
  const quickEditModal = useModal<ProductionOrder>();
  const logModal = useModal();

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: 10
  });

  const [sortField, setSortField] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };

  const openLogModal = async (order: ProductionOrder) => {
    const orderId = String(order?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空');
      return;
    }
    const orderNo = String(order?.orderNo || '').trim();
    setLogTitle(orderNo ? `订单 ${orderNo} 日志` : '订单日志');
    logModal.open();
    setLogLoading(true);
    try {
      const res = await productionScanApi.listByOrderId(orderId, { page: 1, pageSize: 200 });
      const result = res as { code?: number; message?: string; data?: { records?: ScanRecord[] } };
      if (result.code === 200) {
        const records = Array.isArray(result.data?.records) ? result.data?.records ?? [] : [];
        setLogRecords(records);
      } else {
        message.error(result.message || '获取日志失败');
        setLogRecords([]);
      }
    } catch (e: unknown) {
      const errMsg = (e as { message?: unknown })?.message;
      message.error(typeof errMsg === 'string' && errMsg ? errMsg : '获取日志失败');
      setLogRecords([]);
    } finally {
      setLogLoading(false);
    }
  };

  // 真实数据状态
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  // 快速编辑和日志状态
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<ScanRecord[]>([]);
  const [logTitle, setLogTitle] = useState('日志');

  // 工序详情弹窗状态
  const [processDetailVisible, setProcessDetailVisible] = useState(false);
  const [processDetailRecord, setProcessDetailRecord] = useState<ProductionOrder | null>(null);
  const [processDetailType, setProcessDetailType] = useState<string>('');

  // 默认显示的核心列（其他列默认隐藏，用户可以添加）
  const defaultVisibleColumns: Record<string, boolean> = {
    styleCover: true,          // 图片
    styleNo: true,             // 款号
    styleName: true,           // 款名
    attachments: true,         // 附件
    factoryName: true,         // 加工厂
    orderQuantity: true,       // 订单数量
    orderOperatorName: false,  // 下单人
    createTime: false,         // 下单时间
    remarks: false,            // 备注
    expectedShipDate: true,    // 预计出货
    procurementStartTime: false,
    procurementEndTime: false,
    procurementOperatorName: false,
    procurementCompletionRate: false,
    cuttingStartTime: false,
    cuttingEndTime: false,
    cuttingOperatorName: false,
    cuttingCompletionRate: false,
    carSewingStartTime: false,
    carSewingEndTime: false,
    carSewingOperatorName: false,
    carSewingCompletionRate: false,
    ironingStartTime: false,
    ironingEndTime: false,
    ironingOperatorName: false,
    ironingCompletionRate: false,
    packagingStartTime: false,
    packagingEndTime: false,
    packagingOperatorName: false,
    packagingCompletionRate: false,
    qualityStartTime: false,
    qualityEndTime: false,
    qualityOperatorName: false,
    qualityCompletionRate: false,
    warehousingStartTime: false,
    warehousingEndTime: false,
    warehousingOperatorName: false,
    warehousingCompletionRate: false,
    cuttingQuantity: false,    // 裁剪数量
    cuttingBundleCount: false, // 扎数
    completedQuantity: false,  // 完成数量
    warehousingQualifiedQuantity: true,  // 入库数量
    outstockQuantity: false,   // 出库数量
    inStockQuantity: false,    // 库存
    productionProgress: true,  // 生产进度
    status: true,              // 状态
    plannedEndDate: true,      // 订单交期
  };

  // 列显示/隐藏状态
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('production-list-visible-columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return defaultVisibleColumns;
      }
    }
    return defaultVisibleColumns;
  });

  // 保存列显示状态到 localStorage
  useEffect(() => {
    localStorage.setItem('production-list-visible-columns', JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // 切换列显示/隐藏
  const toggleColumnVisible = (key: string) => {
    setVisibleColumns(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // 列设置选项配置
  const columnOptions = [
    { key: 'styleCover', label: '图片' },
    { key: 'styleNo', label: '款号' },
    { key: 'styleName', label: '款名' },
    { key: 'attachments', label: '附件' },
    { key: 'factoryName', label: '加工厂' },
    { key: 'orderQuantity', label: '订单数量' },
    { key: 'orderOperatorName', label: '下单人' },
    { key: 'createTime', label: '下单时间' },
    { key: 'remarks', label: '备注' },
    { key: 'expectedShipDate', label: '预计出货' },
    { key: 'procurementStartTime', label: '采购时间' },
    { key: 'procurementEndTime', label: '采购完成' },
    { key: 'procurementOperatorName', label: '采购员' },
    { key: 'procurementCompletionRate', label: '采购完成率' },
    { key: 'cuttingStartTime', label: '裁剪时间' },
    { key: 'cuttingEndTime', label: '裁剪完成' },
    { key: 'cuttingOperatorName', label: '裁剪员' },
    { key: 'cuttingCompletionRate', label: '裁剪完成率' },
    { key: 'carSewingStartTime', label: '车缝开始' },
    { key: 'carSewingEndTime', label: '车缝完成' },
    { key: 'carSewingOperatorName', label: '车缝员' },
    { key: 'carSewingCompletionRate', label: '车缝完成率' },
    { key: 'ironingStartTime', label: '大烫开始' },
    { key: 'ironingEndTime', label: '大烫完成' },
    { key: 'ironingOperatorName', label: '大烫员' },
    { key: 'ironingCompletionRate', label: '大烫完成率' },
    { key: 'packagingStartTime', label: '包装开始' },
    { key: 'packagingEndTime', label: '包装完成' },
    { key: 'packagingOperatorName', label: '包装员' },
    { key: 'packagingCompletionRate', label: '包装完成率' },
    { key: 'qualityStartTime', label: '质检时间' },
    { key: 'qualityEndTime', label: '质检完成' },
    { key: 'qualityOperatorName', label: '质检员' },
    { key: 'qualityCompletionRate', label: '质检完成率' },
    { key: 'warehousingStartTime', label: '入库时间' },
    { key: 'warehousingEndTime', label: '入库完成' },
    { key: 'warehousingOperatorName', label: '入库员' },
    { key: 'warehousingCompletionRate', label: '入库完成率' },
    { key: 'cuttingQuantity', label: '裁剪数量' },
    { key: 'cuttingBundleCount', label: '扎数' },
    { key: 'completedQuantity', label: '完成数量' },
    { key: 'warehousingQualifiedQuantity', label: '入库数量' },
    { key: 'outstockQuantity', label: '出库数量' },
    { key: 'inStockQuantity', label: '库存' },
    { key: 'productionProgress', label: '生产进度' },
    { key: 'status', label: '状态' },
    { key: 'plannedEndDate', label: '订单交期' },
  ];

  // 重置列显示为默认值
  const resetColumnSettings = () => {
    setVisibleColumns(defaultVisibleColumns);
    localStorage.removeItem('production-list-visible-columns');
  };

  // 列设置下拉菜单(已删除,改用工序展开功能)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _columnSettingsMenu = {
    items: [
      {
        key: 'column-settings-title',
        label: <div style={{ fontWeight: 600, color: '#666', padding: '0 4px' }}>选择要显示的列</div>,
        disabled: true,
      },
      { type: 'divider' as const },
      ...columnOptions.map(opt => ({
        key: opt.key,
        label: (
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={visibleColumns[opt.key] === true}
              onChange={() => toggleColumnVisible(opt.key)}
            >
              {opt.label}
            </Checkbox>
          </div>
        ),
      })),
      { type: 'divider' as const },
      {
        key: 'reset-columns',
        label: (
          <div
            style={{ color: '#1890ff', textAlign: 'center', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              resetColumnSettings();
            }}
          >
            重置为默认
          </div>
        ),
      },
    ],
  };

  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const navigate = useNavigate();
  const location = useLocation();

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const orderDetailLines = orderModal.data ? parseProductionOrderLines(orderModal.data, { includeWarehousedQuantity: true }) : [];
  const detailColors = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => safeString(l?.color, ''))
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    return joined || safeString((orderModal.data as Record<string, unknown>)?.color);
  })();

  const detailSizes = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => safeString(l?.size, ''))
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    return joined || safeString((orderModal.data as Record<string, unknown>)?.size);
  })();

  const detailQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.quantity) || 0), 0);
    if (sum > 0) return sum;
    const q = Number((orderModal.data as Record<string, unknown>)?.orderQuantity);
    return Number.isFinite(q) && q > 0 ? q : 0;
  })();

  const detailWarehousedQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.warehousedQuantity) || 0), 0);
    if (sum > 0) return sum;
    const q = toNumberSafe((orderModal.data as Record<string, unknown>)?.warehousingQualifiedQuantity);
    return q > 0 ? q : 0;
  })();

  const detailSkuRows = (() => {
    const map = new Map<string, { color: string; size: string; orderQuantity: number; cuttingQuantity?: number; warehousedQuantity?: number }>();
    for (const l of orderDetailLines) {
      const color = safeString(l?.color, '');
      const size = safeString(l?.size, '');
      const orderQuantity = Number(l?.quantity) || 0;
      const cuttingQuantity = Number((l as Record<string, unknown>)?.cuttingQuantity) || 0;
      const warehousedQuantity = Number(l?.warehousedQuantity) || 0;
      if (!color || !size) continue;
      if (orderQuantity <= 0 && cuttingQuantity <= 0 && warehousedQuantity <= 0) continue;
      const key = `${color}|||${size}`;
      const prev = map.get(key);
      map.set(key, {
        color,
        size,
        orderQuantity: (prev?.orderQuantity || 0) + orderQuantity,
        cuttingQuantity: (prev?.cuttingQuantity || 0) + cuttingQuantity,
        warehousedQuantity: (prev?.warehousedQuantity || 0) + warehousedQuantity,
      });
    }

    const rows = Array.from(map.values())
      .map((r) => {
        const c = Number(r.cuttingQuantity) || 0;
        const hasC = c > 0;
        const w = Number(r.warehousedQuantity) || 0;
        const hasW = w > 0;
        return {
          key: `${r.color}|||${r.size}`,
          sku: `${r.color}-${r.size}`,
          color: r.color,
          size: r.size,
          orderQuantity: Math.max(0, Number(r.orderQuantity) || 0),
          cuttingQuantity: hasC ? c : undefined,
          warehousedQuantity: hasW ? w : undefined,
          unwarehousedQuantity: hasW ? Math.max(0, (Number(r.orderQuantity) || 0) - w) : undefined,
        };
      })
      .filter((r) => r.orderQuantity > 0 || (Number(r.cuttingQuantity) || 0) > 0 || (Number(r.warehousedQuantity) || 0) > 0);

    if (rows.length) return rows;

    const color = safeString((orderModal.data as Record<string, unknown>)?.color);
    const size = safeString((orderModal.data as Record<string, unknown>)?.size);
    const orderQuantity = Math.max(0, toNumberSafe((orderModal.data as Record<string, unknown>)?.orderQuantity) || detailQuantity);
    const c = toNumberSafe((orderModal.data as Record<string, unknown>)?.cuttingQuantity) || 0;
    const w = detailWarehousedQuantity;
    return [
      {
        key: '_single',
        sku: `${color}-${size}`,
        color,
        size,
        orderQuantity,
        cuttingQuantity: c > 0 ? c : undefined,
        warehousedQuantity: w > 0 ? w : undefined,
        unwarehousedQuantity: w > 0 ? Math.max(0, orderQuantity - w) : undefined,
      },
    ];
  })();

  const detailSkuHasCutting = detailSkuRows.some((r) => (Number((r as Record<string, unknown>)?.cuttingQuantity) || 0) > 0);
  const detailSkuHasWarehoused = detailSkuRows.some((r) => (Number((r as Record<string, unknown>)?.warehousedQuantity) || 0) > 0);
  const detailSkuTotals = (() => {
    const totalOrder = detailSkuRows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.orderQuantity) || 0), 0);
    const totalCutting = detailSkuHasCutting
      ? detailSkuRows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.cuttingQuantity) || 0), 0)
      : 0;
    const totalWarehoused = detailSkuHasWarehoused
      ? detailSkuRows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)?.warehousedQuantity) || 0), 0)
      : detailWarehousedQuantity;
    const totalUnwarehoused = Math.max(0, totalOrder - totalWarehoused);
    return { totalOrder, totalCutting, totalWarehoused, totalUnwarehoused };
  })();



  // 获取生产订单列表
  const fetchProductionList = async () => {
    setLoading(true);
    try {
      const response = await api.get<PaginatedResponse<ProductionOrder>>(
        '/production/order/list',
        { params: queryParams }
      );
      if (isApiSuccess(response)) {
        setProductionList(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(
          typeof response === 'object' && response !== null && 'message' in response
            ? String(response.message) || '获取生产订单列表失败'
            : '获取生产订单列表失败'
        );
      }
    } catch (error) {
      message.error('获取生产订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 页面加载时获取生产订单列表
  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    fetchProductionList();
  }, [queryParams]);

  // 实时同步：30秒自动轮询更新数据
  useSync(
    'production-orders',
    async () => {
      try {
        const response = await api.get<PaginatedResponse<ProductionOrder>>(
          '/production/order/list',
          { params: queryParams }
        );
        if (isApiSuccess(response)) {
          return response.data.records || [];
        }
        return [];
      } catch (error) {
        console.error('[实时同步] 获取生产订单列表失败', error);
        return [];
      }
    },
    (newData, oldData) => {
      if (oldData !== null) {
        // 不是首次加载，说明数据有变化
        setProductionList(newData);
        // console.log('[实时同步] 生产订单数据已更新', {
        //   oldCount: oldData.length,
        //   newCount: newData.length
        // });

        // 可选：显示提示（不打扰用户的情况下）
        // message.info('订单数据已自动更新', 1);
      }
    },
    {
      interval: 30000, // 30秒轮询
      enabled: !loading && !orderModal.visible && !quickEditModal.visible && !logModal.visible, // 加载中或弹窗打开时暂停同步
      pauseOnHidden: true, // 页面隐藏时暂停
      onError: (error) => {
        console.error('[实时同步] 错误', error);
      }
    }
  );

  const formatCsvCell = (value: unknown) => {
    const v = value == null ? '' : String(value);
    const escaped = v.replace(/"/g, '""');
    return `"${escaped}"`;
  };

  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob(["\uFEFF", content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const buildOrdersCsv = (rows: ProductionOrder[]) => {
    const headers = [
      '订单号',
      '款号',
      '款名',
      '加工厂',
      '订单数量',
      '下单人',
      '下单时间',
      '采购时间',
      '采购完成',
      '采购员',
      '采购完成率',
      '裁剪时间',
      '裁剪完成',
      '裁剪员',
      '裁剪完成率',
      '缝制开始',
      '缝制完成',
      '缝制完成率',
      '质检时间',
      '质检完成',
      '质检员',
      '质检完成率',
      '入库时间',
      '入库完成',
      '入库员',
      '入库完成率',
      '生产进度',
      '状态',
    ];

    const lines = [headers.map(formatCsvCell).join(',')];
    for (const r of rows) {
      const line = [
        r.orderNo,
        r.styleNo,
        r.styleName,
        r.factoryName,
        r.orderQuantity,
        (r as Record<string, unknown>).orderOperatorName || '',
        formatDateTime((r as Record<string, unknown>).createTime),
        formatDateTime((r as Record<string, unknown>).procurementStartTime),
        formatDateTime((r as Record<string, unknown>).procurementEndTime),
        (r as Record<string, unknown>).procurementOperatorName || '',
        (r as Record<string, unknown>).procurementCompletionRate == null ? '' : `${(r as Record<string, unknown>).procurementCompletionRate}%`,
        formatDateTime((r as Record<string, unknown>).cuttingStartTime),
        formatDateTime((r as Record<string, unknown>).cuttingEndTime),
        (r as Record<string, unknown>).cuttingOperatorName || '',
        (r as Record<string, unknown>).cuttingCompletionRate == null ? '' : `${(r as Record<string, unknown>).cuttingCompletionRate}%`,
        formatDateTime((r as Record<string, unknown>).sewingStartTime),
        formatDateTime((r as Record<string, unknown>).sewingEndTime),
        (r as Record<string, unknown>).sewingCompletionRate == null ? '' : `${(r as Record<string, unknown>).sewingCompletionRate}%`,
        formatDateTime((r as Record<string, unknown>).qualityStartTime),
        formatDateTime((r as Record<string, unknown>).qualityEndTime),
        (r as Record<string, unknown>).qualityOperatorName || '',
        (r as Record<string, unknown>).qualityCompletionRate == null ? '' : `${(r as Record<string, unknown>).qualityCompletionRate}%`,
        formatDateTime((r as Record<string, unknown>).warehousingStartTime),
        formatDateTime((r as Record<string, unknown>).warehousingEndTime),
        (r as Record<string, unknown>).warehousingOperatorName || '',
        (r as Record<string, unknown>).warehousingCompletionRate == null ? '' : `${(r as Record<string, unknown>).warehousingCompletionRate}%`,
        r.productionProgress == null ? '' : `${r.productionProgress}%`,
        getStatusConfig(r.status).text,
      ].map(formatCsvCell).join(',');
      lines.push(line);
    }
    return lines.join('\n');
  };

  const exportSelected = () => {
    if (!selectedRows.length) {
      message.warning('请先勾选要导出的订单');
      return;
    }
    const csv = buildOrdersCsv(selectedRows);
    const filename = `我的订单_勾选_${dayjs().format('YYYYMMDDHHmmss')}.csv`;
    downloadTextFile(filename, csv);
  };

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

  // 打开弹窗
  const openDialog = (order?: ProductionOrder) => {
    if (!order) return;
    orderModal.open(order);
  };

  // 关闭弹窗
  const closeDialog = () => {
    orderModal.close();
  };

  // 获取状态文本和标签颜色
  const getStatusConfig = (status: ProductionOrder['status'] | string | undefined | null) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待生产', color: 'default' },
      production: { text: '生产中', color: 'success' },
      completed: { text: '已完成', color: 'default' },
      delayed: { text: '已逾期', color: 'warning' },
    };
    const key = safeString(status, '');
    return statusMap[key] || { text: '未知', color: 'default' };
  };

  const getCloseMinRequired = (cuttingQuantity: number) => {
    const cq = Number(cuttingQuantity ?? 0);
    if (!Number.isFinite(cq) || cq <= 0) return 0;
    return Math.ceil(cq * 0.9);
  };

  // 快速编辑保存
  const handleQuickEditSave = async (values: { remarks: string; expectedShipDate: string | null }) => {
    setQuickEditSaving(true);
    try {
      await productionOrderApi.quickEdit({
        id: quickEditModal.data?.id,
        ...values,
      });
      message.success('保存成功');
      quickEditModal.close();
      await fetchProductionList();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '保存失败');
      throw error;
    } finally {
      setQuickEditSaving(false);
    }
  };

  const handleCloseOrder = (order: ProductionOrder) => {
    const orderId = safeString((order as Record<string, unknown>)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as Record<string, unknown>)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as Record<string, unknown>)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as Record<string, unknown>)?.warehousingQualifiedQuantity ?? 0) || 0;

    if ((order as Record<string, unknown>)?.status === 'completed') {
      message.info('该订单已完成，无需关单');
      return;
    }

    if (minRequired <= 0) {
      message.warning('裁剪数量异常，无法关单');
      return;
    }

    if (warehousingQualified < minRequired) {
      message.warning(`关单条件未满足：合格入库${warehousingQualified}/${minRequired}（裁剪${cuttingQty}，允许差异10%）`);
      return;
    }

    modal.confirm({
      title: `确认关单：${safeString((order as Record<string, unknown>)?.orderNo)}`,
      okText: '确认关单',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div>订单数量：{orderQty}</div>
          <div>关单阈值（裁剪数90%）：{minRequired}</div>
          <div>当前裁剪数：{cuttingQty}</div>
          <div>当前合格入库：{warehousingQualified}</div>
          <div style={{ marginTop: 8 }}>关单后订单状态将变为“已完成”，并自动生成对账记录。</div>
        </div>
      ),
      onOk: async () => {
        const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
          '/production/order/close',
          { id: orderId, sourceModule: 'myOrders' }
        );
        if (!isApiSuccess(result)) {
          const msg = typeof result === 'object' && result !== null && 'message' in result
            ? String(result.message) || '关单失败'
            : '关单失败';
          throw new Error(msg);
        }
        message.success('关单成功');
        fetchProductionList();
      },
    });
  };

  const handleScrapOrder = (order: ProductionOrder) => {
    if (!isSupervisorOrAbove) {
      message.error('无权限报废');
      return;
    }
    const orderId = safeString((order as Record<string, unknown>)?.id, '');
    if (!orderId) {
      message.error('订单ID为空，无法报废');
      return;
    }
    if (isOrderFrozenByStatus(order)) {
      message.error('订单已完成，无法报废');
      return;
    }

    let remark = '';
    modal.confirm({
      title: `确认报废：${safeString((order as Record<string, unknown>)?.orderNo)}`,
      okText: '确认报废',
      cancelText: '取消',
      okButtonProps: { danger: true },
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>报废原因</div>
          <Input.TextArea
            placeholder="请输入报废原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              remark = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      onOk: async () => {
        const opRemark = String(remark || '').trim();
        if (!opRemark) {
          message.error('请输入报废原因');
          return Promise.reject(new Error('请输入报废原因'));
        }
        const result = await api.post<{ code: number; message?: string; data: ProductionOrder }>(
          '/production/order/scrap',
          { id: orderId, remark: opRemark }
        );
        if (!isApiSuccess(result)) {
          const msg = typeof result === 'object' && result !== null && 'message' in result
            ? String(result.message) || '报废失败'
            : '报废失败';
          throw new Error(msg);
        }
        message.success('报废成功');
        fetchProductionList();
      },
    });
  };

  // 表格列定义
  const renderStageTime = (value: unknown) => {
    return value ? formatDateTime(value) : '-';
  };

  const renderStageText = (value: unknown) => {
    return safeString(value);
  };

  const renderStageRate = (value: unknown) => {
    if (value === null || value === undefined || String(value).trim() === '') return '-';
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : '-';
  };

  // 添加排序逻辑
  const sortedProductionList = useMemo(() => {
    const sorted = [...productionList];
    sorted.sort((a: any, b: any) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      // 时间字段排序
      if (sortField === 'createTime') {
        const aTime = aVal ? new Date(aVal).getTime() : 0;
        const bTime = bVal ? new Date(bVal).getTime() : 0;
        return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
      }

      return 0;
    });
    return sorted;
  }, [productionList, sortField, sortOrder]);

  // 工序列函数(已改用工序汇总+点击展开)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _stageColumns = (
    prefix: string,
    titles: { start: string; end: string; operator: string; rate: string },
    options?: { includeOperator?: boolean }
  ) => {
    const includeOperator = options?.includeOperator !== false;
    return [
      {
        title: titles.start,
        dataIndex: `${prefix}StartTime`,
        key: `${prefix}StartTime`,
        width: 170,
        render: renderStageTime,
      },
      {
        title: titles.end,
        dataIndex: `${prefix}EndTime`,
        key: `${prefix}EndTime`,
        width: 170,
        render: renderStageTime,
      },
      ...(includeOperator
        ? [
          {
            title: titles.operator,
            dataIndex: `${prefix}OperatorName`,
            key: `${prefix}OperatorName`,
            width: 120,
            render: (value: unknown, record: ProductionOrder) => {
              const operatorName = renderStageText(value);
              if (!operatorName || operatorName === '-') return '-';
              const orderNo = String((record as Record<string, unknown>)?.orderNo || '').trim();
              const processName = titles.operator.replace('员', '');
              return (
                <a
                  style={{ cursor: 'pointer', color: '#1890ff' }}
                  onClick={() => {
                    if (orderNo) {
                      navigate(`/finance/payroll-operator-summary?orderNo=${orderNo}&processName=${processName}`);
                    }
                  }}
                >
                  {operatorName}
                </a>
              );
            },
          },
        ]
        : []),
      {
        title: titles.rate,
        dataIndex: `${prefix}CompletionRate`,
        key: `${prefix}CompletionRate`,
        width: 110,
        align: 'right' as const,
        render: renderStageRate,
      },
    ];
  };

  const scanTypeLabel: Record<string, string> = {
    material: '物料',
    procurement: '采购',
    cutting: '裁剪',
    production: '生产',
    sewing: '车缝',
    ironing: '整烫',
    packaging: '包装',
    quality: '质检',
    warehouse: '入库',
    shipment: '出货',
  };

  const logColumns = [
    {
      title: '类型',
      dataIndex: 'scanType',
      key: 'scanType',
      width: 90,
      render: (v: unknown) => scanTypeLabel[String(v || '')] || String(v || '-'),
    },
    {
      title: '环节',
      dataIndex: 'progressStage',
      key: 'progressStage',
      width: 140,
      render: (v: unknown, record: ScanRecord) => String(v || record.processName || '-') || '-',
    },
    {
      title: '操作人',
      dataIndex: 'operatorName',
      key: 'operatorName',
      width: 120,
      render: (v: unknown) => String(v || '-') || '-',
    },
    {
      title: '结果',
      dataIndex: 'scanResult',
      key: 'scanResult',
      width: 90,
      render: (v: unknown) => {
        const text = String(v || '').trim();
        if (text === 'success') return <Tag color="success">成功</Tag>;
        if (text === 'failure') return <Tag color="error">失败</Tag>;
        return String(v || '-') || '-';
      },
    },
    {
      title: '时间',
      dataIndex: 'scanTime',
      key: 'scanTime',
      width: 170,
      render: (v: unknown) => formatDateTime(v),
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      render: (v: unknown) => String(v || '-') || '-',
    },
  ];

  // 打开工序详情弹窗
  const openProcessDetail = (record: ProductionOrder, type: string) => {
    setProcessDetailRecord(record);
    setProcessDetailType(type);
    setProcessDetailVisible(true);
  };

  // 从模板同步工序单价到订单
  const syncProcessFromTemplate = async (record: ProductionOrder) => {
    const styleNo = String(record.styleNo || '').trim();
    if (!styleNo) {
      message.error('订单款号为空，无法同步');
      return;
    }

    try {
      // 从模板库获取最新工序数据
      const res = await templateLibraryApi.progressNodeUnitPrices(styleNo);
      const result = res as Record<string, unknown>;
      if (result.code !== 200) {
        message.error('获取工序模板失败');
        return;
      }

      const rows = Array.isArray(result.data) ? result.data : [];
      if (rows.length === 0) {
        message.warning('未找到该款号的工序模板');
        return;
      }

      // 构建新的 progressWorkflowJson
      const allProcesses = rows.map((item: any, idx: number) => ({
        id: String(item.id || item.processCode || item.name || '').trim(),
        name: String(item.name || item.processName || '').trim(),
        unitPrice: Number(item.unitPrice) || 0,
        progressStage: String(item.progressStage || item.name || '').trim(),
        machineType: String(item.machineType || '').trim(),
        standardTime: Number(item.standardTime) || 0,
        sortOrder: idx,
      }));

      // 按 progressStage 分组
      const processesByNode: Record<string, typeof allProcesses> = {};
      for (const p of allProcesses) {
        const stage = p.progressStage || p.name;
        if (!processesByNode[stage]) {
          processesByNode[stage] = [];
        }
        processesByNode[stage].push(p);
      }

      const progressWorkflowJson = JSON.stringify({
        nodes: allProcesses,
        processesByNode,
      });

      console.log('[同步工序] 新的工序数据:', allProcesses.map(p => `${p.name}(${p.progressStage}): ¥${p.unitPrice}`));

      // 使用 quickEdit API 更新订单
      const updateRes = await productionOrderApi.quickEdit({
        id: record.id,
        progressWorkflowJson,
      });

      if (updateRes.code !== 200) {
        message.error(updateRes.message || '同步失败');
        return;
      }

      message.success(`已同步 ${allProcesses.length} 个工序`);
      // 刷新列表
      fetchProductionList();
    } catch (e) {
      console.error('同步工序失败:', e);
      message.error('同步工序失败');
    }
  };

  const allColumns = [
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
      render: (v: any, record: ProductionOrder) => {
        const orderNo = safeString(v, '');
        const styleNo = safeString((record as Record<string, unknown>)?.styleNo, '');
        const orderId = safeString((record as Record<string, unknown>)?.id, '');
        return (
          <a
            className="order-no-wrap"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.preventDefault();
              navigate(withQuery('/production/order-flow', { orderId, orderNo, styleNo }));
            }}
          >
            {orderNo || '-'}
          </a>
        );
      },
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
      width: 150,
      ellipsis: true,
    },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (v: any) => v || '-',
    },
    {
      title: '公司',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 120,
      ellipsis: true,
      render: (v: any) => v || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 100,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
        />
      )
    },
    {
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
    },
    {
      title: '跟单员',
      dataIndex: 'merchandiser',
      key: 'merchandiser',
      width: 100,
      render: (v: any) => v || '-',
    },
    {
      title: '纸样师',
      dataIndex: 'patternMaker',
      key: 'patternMaker',
      width: 100,
      render: (v: any) => v || '-',
    },
    {
      title: '订单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '下单人',
      dataIndex: 'orderOperatorName',
      key: 'orderOperatorName',
      width: 120,
      render: renderStageText,
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
      width: 170,
      render: renderStageTime,
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
      title: <SortableColumnTitle title="预计出货" field="expectedShipDate" onSort={handleSort} currentField={sortField} order={sortOrder} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'procurement');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={12}
            />
            <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
              {rate || 0}%
            </span>
          </div>
        );
      },
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'cutting');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={12}
            />
            <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
              {rate || 0}%
            </span>
          </div>
        );
      },
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        // 智能检测是否有二次工艺配置
        const hasSecondaryProcess = (() => {
          const nodes = record.progressNodeUnitPrices;
          if (!Array.isArray(nodes) || nodes.length === 0) return false;
          // 检查是否有包含"二次工艺"或"工艺"关键词的节点
          return nodes.some((n: any) => {
            const name = String(n.name || n.processName || '').trim();
            return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
          });
        })();

        // 如果没有二次工艺配置，显示占位符
        if (!hasSecondaryProcess) {
          return (
            <span style={{ color: '#999', fontSize: '12px' }}>-</span>
          );
        }

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'secondaryProcess');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={12}
            />
            <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
              {rate || 0}%
            </span>
          </div>
        );
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'carSewing');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={12}
            />
            <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
              {rate || 0}%
            </span>
          </div>
        );
      },
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 100,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'tailProcess');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={12}
            />
            <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
              {rate || 0}%
            </span>
          </div>
        );
      },
    },
    {
      title: '裁剪数量',
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
      title: '完成数量',
      dataIndex: 'completedQuantity',
      key: 'completedQuantity',
      width: 100,
      align: 'right' as const,
    },
    {
      title: '入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 140,
      align: 'left' as const,
      render: (_: unknown, record: ProductionOrder) => {
        const qualified = Number(record.warehousingQualifiedQuantity ?? 0) || 0;
        const total = Number(record.cuttingQuantity || record.orderQuantity) || 1;
        const rate = Math.min(100, Math.round((qualified / total) * 100));

        // 颜色根据进度变化
        const getColor = () => {
          if (rate === 100) return '#059669'; // 绿色
          if (rate > 0) return '#3b82f6'; // 蓝色
          return '#e5e7eb'; // 灰色
        };

        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              cursor: 'pointer',
              padding: '4px 0',
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'warehousing');
            }}
          >
            {/* 进度圆环 */}
            <div style={{ position: 'relative', width: '36px', height: '36px' }}>
              <svg width="36" height="36" style={{ transform: 'rotate(-90deg)' }}>
                {/* 背景圆环 */}
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke="#f3f4f6"
                  strokeWidth="3"
                />
                {/* 进度圆环 */}
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  fill="none"
                  stroke={getColor()}
                  strokeWidth="3"
                  strokeDasharray={`${(rate / 100) * 100.53} 100.53`}
                  strokeLinecap="round"
                  style={{
                    transition: 'stroke-dasharray 0.3s ease',
                  }}
                />
              </svg>
              {/* 中间百分比文字 */}
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  fontSize: '10px',
                  fontWeight: 700,
                  color: getColor(),
                }}
              >
                {rate}%
              </div>
            </div>

            {/* 数字信息 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                {qualified}/{total}
              </span>
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                {qualified > 0 ? '已入库' : '未入库'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      title: '次品数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '返修数',
      dataIndex: 'repairQuantity',
      key: 'repairQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '库存',
      dataIndex: 'inStockQuantity',
      key: 'inStockQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
    },
    {
      title: '生产进度',
      dataIndex: 'productionProgress',
      key: 'productionProgress',
      width: 100,
      render: (value: number) => `${value}%`,
      align: 'right' as const,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: ProductionOrder['status']) => {
        const { text, color } = getStatusConfig(status);
        return <Tag color={color}>{text}</Tag>;
      },
    },
    {
      title: '订单交期',
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 120,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right' as const,
      width: 110,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);

        // 列设置下拉菜单
        const columnSettingsMenu = {
          items: [
            { type: 'divider' as const },
            {
              key: 'column-settings-title',
              label: <div style={{ fontWeight: 600, color: '#666', padding: '0 4px' }}>显示列</div>,
              disabled: true,
            },
            { type: 'divider' as const },
            {
              key: 'styleCover',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.styleCover !== false} onChange={() => toggleColumnVisible('styleCover')}>
                    图片
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'styleNo',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.styleNo !== false} onChange={() => toggleColumnVisible('styleNo')}>
                    款号
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'styleName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.styleName !== false} onChange={() => toggleColumnVisible('styleName')}>
                    款名
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'category',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.category !== false} onChange={() => toggleColumnVisible('category')}>
                    品类
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'companyName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.companyName !== false} onChange={() => toggleColumnVisible('companyName')}>
                    公司
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'attachments',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.attachments !== false} onChange={() => toggleColumnVisible('attachments')}>
                    附件
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'factoryName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.factoryName !== false} onChange={() => toggleColumnVisible('factoryName')}>
                    加工厂
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'merchandiser',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.merchandiser !== false} onChange={() => toggleColumnVisible('merchandiser')}>
                    跟单员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'patternMaker',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.patternMaker !== false} onChange={() => toggleColumnVisible('patternMaker')}>
                    纸样师
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'orderQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.orderQuantity !== false} onChange={() => toggleColumnVisible('orderQuantity')}>
                    订单数量
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'orderOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.orderOperatorName !== false} onChange={() => toggleColumnVisible('orderOperatorName')}>
                    下单人
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'createTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.createTime !== false} onChange={() => toggleColumnVisible('createTime')}>
                    下单时间
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'remarks',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.remarks !== false} onChange={() => toggleColumnVisible('remarks')}>
                    备注
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'expectedShipDate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.expectedShipDate !== false} onChange={() => toggleColumnVisible('expectedShipDate')}>
                    预计出货
                  </Checkbox>
                </div>
              ),
            },
            { type: 'divider' as const },
            {
              key: 'process-summary-title',
              label: <div style={{ fontWeight: 600, color: '#666', padding: '0 4px' }}>工序汇总</div>,
              disabled: true,
            },
            { type: 'divider' as const },
            {
              key: 'procurementSummary',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.procurementSummary !== false} onChange={() => toggleColumnVisible('procurementSummary')}>
                    采购
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingSummary',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingSummary !== false} onChange={() => toggleColumnVisible('cuttingSummary')}>
                    裁剪
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'secondaryProcessSummary',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.secondaryProcessSummary !== false} onChange={() => toggleColumnVisible('secondaryProcessSummary')}>
                    二次工艺
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'carSewingSummary',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.carSewingSummary !== false} onChange={() => toggleColumnVisible('carSewingSummary')}>
                    车缝
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'tailProcessSummary',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.tailProcessSummary !== false} onChange={() => toggleColumnVisible('tailProcessSummary')}>
                    尾部
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingQuantity !== false} onChange={() => toggleColumnVisible('cuttingQuantity')}>
                    裁剪数量
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingBundleCount',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingBundleCount !== false} onChange={() => toggleColumnVisible('cuttingBundleCount')}>
                    扎数
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'completedQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.completedQuantity !== false} onChange={() => toggleColumnVisible('completedQuantity')}>
                    完成数量
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'warehousingQualifiedQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.warehousingQualifiedQuantity !== false} onChange={() => toggleColumnVisible('warehousingQualifiedQuantity')}>
                    合格入库
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'unqualifiedQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.unqualifiedQuantity !== false} onChange={() => toggleColumnVisible('unqualifiedQuantity')}>
                    次品数
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'repairQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.repairQuantity !== false} onChange={() => toggleColumnVisible('repairQuantity')}>
                    返修数
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'inStockQuantity',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.inStockQuantity !== false} onChange={() => toggleColumnVisible('inStockQuantity')}>
                    库存
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'productionProgress',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.productionProgress !== false} onChange={() => toggleColumnVisible('productionProgress')}>
                    生产进度
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'status',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.status !== false} onChange={() => toggleColumnVisible('status')}>
                    状态
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'plannedEndDate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.plannedEndDate !== false} onChange={() => toggleColumnVisible('plannedEndDate')}>
                    订单交期
                  </Checkbox>
                </div>
              ),
            },
          ],
        };

        return (
          <RowActions
            className="table-actions"
            maxInline={1}
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
                key: 'print',
                label: '打印',
                title: '打印生产制单',
                icon: <PrinterOutlined />,
                onClick: () => {
                  setPrintingRecord(record);
                  setPrintModalVisible(true);
                },
              },
              {
                key: 'process',
                label: '工序',
                title: '查看工序详情',
                icon: <UnorderedListOutlined />,
                children: [
                  {
                    key: 'all',
                    label: '📋 全部工序',
                    onClick: () => openProcessDetail(record, 'all'),
                  },
                  { type: 'divider' },
                  {
                    key: 'procurement',
                    label: '采购',
                    onClick: () => openProcessDetail(record, 'procurement'),
                  },
                  {
                    key: 'cutting',
                    label: '裁剪',
                    onClick: () => openProcessDetail(record, 'cutting'),
                  },
                  {
                    key: 'carSewing',
                    label: '车缝',
                    onClick: () => openProcessDetail(record, 'carSewing'),
                  },
                  // 二次工艺：仅当款式配置了二次工艺时才显示
                  ...(() => {
                    const nodes = record.progressNodeUnitPrices;
                    if (!Array.isArray(nodes)) return [];
                    const hasSecondary = nodes.some((n: any) => {
                      const name = String(n.name || n.processName || '').trim();
                      return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
                    });
                    return hasSecondary ? [{
                      key: 'secondaryProcess',
                      label: '二次工艺',
                      onClick: () => openProcessDetail(record, 'secondaryProcess'),
                    }] : [];
                  })(),
                  {
                    key: 'tailProcess',
                    label: '尾部',
                    onClick: () => openProcessDetail(record, 'tailProcess'),
                  },
                  { type: 'divider' },
                  {
                    key: 'syncProcess',
                    label: '🔄 从模板同步',
                    onClick: () => syncProcessFromTemplate(record),
                  },
                ],
              },
              {
                key: 'quickEdit',
                label: '编辑',
                title: '快速编辑备注和预计出货',
                icon: <EditOutlined />,
                onClick: () => {
                  quickEditModal.open(record);
                },
              },
              {
                key: 'log',
                label: '日志',
                title: '日志',
                icon: <FileSearchOutlined />,
                onClick: () => openLogModal(record),
              },
              {
                key: 'close',
                label: <span style={{ color: frozen ? undefined : '#1890ff' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
                icon: <CheckCircleOutlined style={{ color: frozen ? undefined : '#1890ff' }} />,
                disabled: frozen,
                onClick: () => handleCloseOrder(record),
              },
              ...(isSupervisorOrAbove
                ? [
                  {
                    key: 'scrap',
                    label: completed ? '报废(已完成)' : '报废',
                    icon: <DeleteOutlined />,
                    danger: true,
                    disabled: completed,
                    onClick: () => handleScrapOrder(record),
                  },
                ]
                : []),
              {
                key: 'columnSettings',
                label: (
                  <Dropdown menu={columnSettingsMenu} trigger={['click']} placement="bottomRight">
                    <span onClick={(e) => e.stopPropagation()}>
                      <SettingOutlined style={{ fontSize: 14 }} />
                    </span>
                  </Dropdown>
                ),
                title: '列设置',
                icon: <SettingOutlined />,
                onClick: (e) => {
                  e?.stopPropagation?.();
                },
              },
            ]}
          />
        );
      },
    },
  ];

  // 根据 visibleColumns 过滤列
  const columns = allColumns.filter(col => {
    if (col.key === 'action' || col.key === 'orderNo') return true; // 操作列和订单号始终显示
    return visibleColumns[col.key as string] !== false;
  });

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">我的订单</h2>
            <Space wrap>
              <Button
                icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
              >
                {viewMode === 'list' ? '卡片视图' : '列表视图'}
              </Button>
              <Button icon={<DownloadOutlined />} onClick={exportSelected} disabled={!selectedRowKeys.length}>
                导出
              </Button>
            </Space>
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <Form layout="inline" size="small">
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
              <Form.Item label="加工厂">
                <Input
                  placeholder="请输入加工厂名称"
                  onChange={(e) => setQueryParams({ ...queryParams, factoryName: e.target.value })}
                  style={{ width: 150 }}
                />
              </Form.Item>
              <Form.Item label="状态">
                <Select
                  placeholder="请选择状态"
                  onChange={(value) => setQueryParams({ ...queryParams, status: value })}
                  style={{ width: 100 }}
                >
                  <Option value="">全部</Option>
                  <Option value="pending">待生产</Option>
                  <Option value="production">生产中</Option>
                  <Option value="completed">已完成</Option>
                  <Option value="delayed">已逾期</Option>
                </Select>
              </Form.Item>
              <Form.Item className="filter-actions">
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => fetchProductionList()}>
                    查询
                  </Button>
                  <Button onClick={() => {
                    setQueryParams({ page: 1, pageSize: 10 });
                    fetchProductionList();
                  }}>
                    重置
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>

          {/* 表格/卡片区 */}
          {viewMode === 'list' ? (
            <ResizableTable<ProductionOrder>
              storageKey="production-order-table"
              columns={columns as Record<string, unknown>}
              dataSource={sortedProductionList}
              rowKey="id"
              loading={loading}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys: React.Key[], rows: ProductionOrder[]) => {
                  setSelectedRowKeys(keys);
                  setSelectedRows(rows);
                },
              }}
              pagination={{
                current: queryParams.page,
                pageSize: queryParams.pageSize,
                total: total,
                onChange: (page, pageSize) => setQueryParams({ ...queryParams, page, pageSize }),
              }}
            />
          ) : (
            <UniversalCardView
              dataSource={sortedProductionList}
              columns={isMobile ? 2 : 6}
              coverField="styleCover"
              titleField="orderNo"
              subtitleField="styleNo"
              fields={[
                {
                  label: '码数',
                  key: 'size',
                  render: (val: unknown, record: Record<string, unknown>) => {
                    // 显示具体码数列表
                    const sizeStr = String(val || '').trim();
                    if (sizeStr) return sizeStr;
                    // 降级：从 orderDetails 解析
                    const details = record?.orderDetails;
                    if (details) {
                      try {
                        const parsed = typeof details === 'string' ? JSON.parse(details) : details;
                        const lines = parsed?.orderLines || parsed?.lines || parsed;
                        if (Array.isArray(lines)) {
                          const sizes = [...new Set(lines.map((l: Record<string, unknown>) => l.size).filter(Boolean))];
                          if (sizes.length > 0) return sizes.join(', ');
                        }
                      } catch { /* ignore */ }
                    }
                    return '-';
                  }
                },
                {
                  label: '数量',
                  key: 'orderQuantity',
                  render: (val: unknown) => {
                    const qty = Number(val) || 0;
                    return qty > 0 ? `${qty} 件` : '-';
                  }
                },
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => {
                  const status = String(record.status || '').toLowerCase();
                  if (status === 'completed') return 'normal';
                  if (status === 'delayed') return 'danger';
                  if (status === 'production') return 'warning';
                  return 'normal';
                },
                show: true,
                type: 'liquid', // 使用液体波浪进度条
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'view',
                  icon: <EyeOutlined />,
                  label: '查看',
                  onClick: () => {
                    orderModal.open(record);
                  },
                },
                {
                  key: 'edit',
                  icon: <EditOutlined />,
                  label: '编辑',
                  onClick: () => {
                    quickEditModal.open(record);
                  },
                },
              ].filter(Boolean)}
            />
          )}
        </Card>

        {/* 生产订单详情弹窗 */}
        <ResizableModal
          title="生产订单详情"
          open={orderModal.visible}
          onCancel={closeDialog}
          footer={null}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          tableDensity={isMobile ? 'dense' : 'auto'}
        >
          {orderModal.data ? (
            <>
              {/* 头部订单信息卡片 */}
              <div style={{
                display: 'flex',
                gap: isMobile ? 12 : 16,
                padding: isMobile ? 10 : 12,
                background: 'var(--neutral-light)',
                borderRadius: 8,
                marginBottom: 12
              }}>
                {/* 左侧：图片和二维码 */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <StyleCoverThumb
                    styleNo={String((orderModal.data as Record<string, unknown>).styleNo || '').trim()}
                    size={isMobile ? 160 : 200}
                    borderRadius={6}
                  />
                  {orderModal.data?.qrCode ? (
                    <QRCodeBox
                      value={String(orderModal.data.qrCode)}
                      label="订单扫码"
                      variant="primary"
                      size={isMobile ? 120 : 140}
                    />
                  ) : null}
                </div>

                {/* 右侧：订单核心信息 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* 第一行：订单号 + 加工厂 + 码数表格 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 16,
                    marginBottom: 8
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 24,
                      flexWrap: 'wrap'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontSize: 14,
                          color: 'var(--neutral-text-light)',
                          fontWeight: 600
                        }}>订单号</span>
                        <span style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: 'var(--neutral-text)',
                          letterSpacing: '0.5px'
                        }}>{safeString((orderModal.data as Record<string, unknown>).orderNo)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, color: 'var(--neutral-text-light)', fontWeight: 600 }}>加工厂</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {safeString((orderModal.data as Record<string, unknown>).factoryName)}
                        </span>
                      </div>
                    </div>

                    {/* 右侧：码数与数量表格 */}
                    <div style={{
                      padding: 6,
                      background: 'var(--neutral-white)',
                      borderRadius: 6,
                      border: '2px solid var(--table-border-color)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      flexShrink: 0
                    }}>
                      {(() => {
                        const sizeArray = detailSizes.split('、').filter(Boolean);
                        const skuArray = detailSkuRows || [];

                        return (
                          <table style={{ borderCollapse: 'collapse' }}>
                            <tbody>
                              {/* 第一行：码数 */}
                              <tr>
                                <td style={{
                                  padding: '8px 12px',
                                  fontSize: 14,
                                  color: 'var(--neutral-text-light)',
                                  fontWeight: 600,
                                  borderRight: '1px solid var(--table-border-color)',
                                  borderBottom: '1px solid var(--table-border-color)',
                                  width: '60px',
                                  background: 'var(--neutral-medium)'
                                }}>
                                  码数
                                </td>
                                {sizeArray.map((size: string, idx: number) => (
                                  <td key={idx} style={{
                                    padding: '8px 14px',
                                    fontSize: 15,
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
                                  fontSize: 14,
                                  color: 'var(--neutral-text)',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  borderLeft: '1px solid var(--table-border-color)',
                                  borderBottom: '1px solid var(--table-border-color)',
                                  background: 'rgba(250, 173, 20, 0.18)',
                                  whiteSpace: 'nowrap'
                                }} rowSpan={2}>
                                  总下单数：{detailQuantity || '-'}
                                </td>
                              </tr>
                              {/* 第二行：数量 */}
                              <tr>
                                <td style={{
                                  padding: '8px 12px',
                                  fontSize: 14,
                                  color: 'var(--neutral-text-light)',
                                  fontWeight: 600,
                                  borderRight: '1px solid var(--table-border-color)',
                                  background: 'var(--neutral-medium)'
                                }}>
                                  数量
                                </td>
                                {sizeArray.map((size: string, idx: number) => {
                                  const sku = skuArray.find((s: any) => s.size === size);
                                  const qty = sku?.orderQuantity || 0;
                                  return (
                                    <td key={idx} style={{
                                      padding: '8px 14px',
                                      fontSize: 15,
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
                        );
                      })()}
                    </div>
                  </div>

                  {/* 第二行：款号 + 款名 + 颜色 */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 24,
                    flexWrap: 'wrap',
                    marginBottom: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>款号</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--neutral-text)' }}>
                        {safeString((orderModal.data as Record<string, unknown>).styleNo)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>款名</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--neutral-text)' }}>
                        {safeString((orderModal.data as Record<string, unknown>).styleName)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>颜色</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--neutral-text)' }}>
                        {detailColors}
                      </span>
                    </div>
                  </div>

                  {/* 其他信息区域 */}
                  <div style={{
                    padding: 6,
                    background: 'var(--neutral-white)',
                    borderRadius: 4,
                    border: '1px solid var(--table-border-color)'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                      gap: isMobile ? '4px 6px' : '4px 8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>订单数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {String((orderModal.data as Record<string, unknown>).orderQuantity ?? '-')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>完成数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {String((orderModal.data as Record<string, unknown>).completedQuantity ?? '-')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>入库数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {detailWarehousedQuantity || '-'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>生产进度</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--success-color)' }}>
                          {String((orderModal.data as Record<string, unknown>).productionProgress ?? '-')}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>状态</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {getStatusConfig((orderModal.data as Record<string, unknown>).status).text}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>采购员</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {safeString((orderModal.data as Record<string, unknown>).procurementOperatorName)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>采购完成率</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {((orderModal.data as Record<string, unknown>).procurementCompletionRate ?? '-') + '%'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>采购时间</span>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text)' }}>
                          {formatDateTime((orderModal.data as Record<string, unknown>).procurementStartTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>采购完成时间</span>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text)' }}>
                          {formatDateTime((orderModal.data as Record<string, unknown>).procurementEndTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪员</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {safeString((orderModal.data as Record<string, unknown>).cuttingOperatorName)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪完成率</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--neutral-text)' }}>
                          {((orderModal.data as Record<string, unknown>).cuttingCompletionRate ?? '-') + '%'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪时间</span>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text)' }}>
                          {formatDateTime((orderModal.data as Record<string, unknown>).cuttingStartTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text-light)', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪完成时间</span>
                        <span style={{ fontSize: 13, color: 'var(--neutral-text)' }}>
                          {formatDateTime((orderModal.data as Record<string, unknown>).cuttingEndTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 详细信息表格 - 在其他信息下方 */}
                  <div style={{ marginTop: 8 }}>
                    <Table
                      size="small"
                      bordered
                      pagination={false}
                      dataSource={detailSkuRows as Record<string, unknown>}
                      rowKey="key"
                      style={{
                        border: '1px solid var(--table-border-color)',
                        borderRadius: 4,
                        overflow: 'hidden',
                        fontSize: 11
                      }}
                      columns={[
                        {
                          title: 'SKU',
                          dataIndex: 'sku',
                          key: 'sku',
                          ellipsis: true,
                          width: 100,
                          render: (v: any, record: any) => {
                            const hasCutting = (Number(record?.cuttingQuantity) || 0) > 0;
                            return <span style={{ fontSize: 11 }}>{hasCutting ? v : '-'}</span>;
                          },
                        },
                        {
                          title: '颜色',
                          dataIndex: 'color',
                          key: 'color',
                          ellipsis: true,
                          width: 50,
                        },
                        {
                          title: '码数',
                          dataIndex: 'size',
                          key: 'size',
                          ellipsis: true,
                          width: 40,
                        },
                        {
                          title: '下单',
                          dataIndex: 'orderQuantity',
                          key: 'orderQuantity',
                          width: 45,
                          align: 'right' as const,
                          render: (v: unknown) => <span style={{ fontSize: 11 }}>{Math.max(0, Number(v) || 0)}</span>,
                        },
                        {
                          title: '裁剪',
                          dataIndex: 'cuttingQuantity',
                          key: 'cuttingQuantity',
                          width: 45,
                          align: 'right' as const,
                          render: (v: unknown) => <span style={{ fontSize: 11 }}>{detailSkuHasCutting ? Math.max(0, Number(v) || 0) : '-'}</span>,
                        },
                        {
                          title: '入库',
                          dataIndex: 'warehousedQuantity',
                          key: 'warehousedQuantity',
                          width: 45,
                          align: 'right' as const,
                          render: (v: unknown) => <span style={{ fontSize: 11 }}>{detailSkuHasWarehoused ? Math.max(0, Number(v) || 0) : '-'}</span>,
                        },
                        {
                          title: '未入库',
                          dataIndex: 'unwarehousedQuantity',
                          key: 'unwarehousedQuantity',
                          width: 50,
                          align: 'right' as const,
                          render: (v: unknown) => <span style={{ fontSize: 11 }}>{detailSkuHasWarehoused ? Math.max(0, Number(v) || 0) : '-'}</span>,
                        },
                      ]}
                      summary={() => (
                        <Table.Summary>
                          <Table.Summary.Row style={{ fontWeight: 600, background: 'var(--neutral-light)' }}>
                            <Table.Summary.Cell index={0} colSpan={3}>
                              <span style={{ fontSize: 11 }}>合计</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="right">
                              <span style={{ fontSize: 11 }}>{detailSkuTotals.totalOrder || '-'}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right">
                              <span style={{ fontSize: 11 }}>{detailSkuTotals.totalCutting > 0 ? detailSkuTotals.totalCutting : '-'}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                              <span style={{ fontSize: 11 }}>{detailSkuTotals.totalWarehoused > 0 ? detailSkuTotals.totalWarehoused : '-'}</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="right">
                              <span style={{ fontSize: 11 }}>{detailSkuTotals.totalUnwarehoused > 0 ? detailSkuTotals.totalUnwarehoused : '-'}</span>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* 生产节点时间线 */}
              <div style={{ marginBottom: 8 }}>
                <div style={{
                  padding: 6,
                  background: 'var(--neutral-light)',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--neutral-text-light)' }}>计划开始：</span>
                    <span style={{ fontSize: 12, color: 'var(--neutral-text-light)' }}>{formatDateTime(orderModal.data.plannedStartDate)}</span>
                  </div>
                  {orderModal.data.actualStartDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--neutral-text-light)' }}>实际开始：</span>
                      <span style={{ fontSize: 12, color: 'var(--success-color)' }}>{formatDateTime(orderModal.data.actualStartDate)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--neutral-text-light)' }}>计划完成：</span>
                    <span style={{ fontSize: 12, color: 'var(--neutral-text-light)' }}>{formatDateTime(orderModal.data.plannedEndDate)}</span>
                  </div>
                  {orderModal.data.actualEndDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--neutral-text-light)' }}>实际完成：</span>
                      <span style={{ fontSize: 12, color: 'var(--success-color)' }}>{formatDateTime(orderModal.data.actualEndDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </ResizableModal>

        <ResizableModal
          open={logModal.visible}
          title={logTitle}
          onCancel={() => {
            logModal.close();
            setLogRecords([]);
          }}
          footer={null}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
        >
          <ResizableTable
            columns={logColumns as Record<string, unknown>}
            dataSource={logRecords}
            rowKey={(r) => String(r.id || r.requestId || `${r.orderId}-${r.scanTime}`)}
            loading={logLoading}
            pagination={false}
            scroll={{ x: 'max-content', y: isMobile ? 320 : 420 }}
          />
        </ResizableModal>

        {/* 快速编辑弹窗 */}
        <QuickEditModal
          visible={quickEditModal.visible}
          loading={quickEditSaving}
          initialValues={{
            remarks: quickEditModal.data?.remarks,
            expectedShipDate: quickEditModal.data?.expectedShipDate,
          }}
          onSave={handleQuickEditSave}
          onCancel={() => {
            quickEditModal.close();
          }}
        />

        {/* 工序详情弹窗 */}
        <ResizableModal
          title={(() => {
            const titles: Record<string, string> = {
              all: '全部工序明细',
              procurement: '采购工序明细',
              cutting: '裁剪工序明细',
              secondaryProcess: '二次工艺明细',
              carSewing: '车缝工序明细',
              tailProcess: '尾部工序明细',
              warehousing: '入库详情',
            };
            return titles[processDetailType] || '工序明细';
          })()}
          open={processDetailVisible}
          onCancel={() => {
            setProcessDetailVisible(false);
            setProcessDetailRecord(null);
            setProcessDetailType('');
          }}
          footer={null}
          width="60vw"
          initialHeight={580}
        >
          {processDetailRecord && (() => {
            // 如果是入库类型，显示入库统计数据
            if (processDetailType === 'warehousing') {
              const orderQty = processDetailRecord.orderQuantity || 0;
              const cuttingQty = processDetailRecord.cuttingQuantity || orderQty;
              const qualifiedQty = processDetailRecord.warehousingQualifiedQuantity || 0;
              const unqualifiedQty = processDetailRecord.unqualifiedQuantity || 0;
              const repairQty = processDetailRecord.repairQuantity || 0;
              const stockQty = processDetailRecord.inStockQuantity || 0;
              const qualifiedRate = cuttingQty > 0 ? Math.round((qualifiedQty / cuttingQty) * 100) : 0;

              return (
                <div>
                  {/* 订单基本信息 */}
                  <div style={{
                    background: '#f8f9fa',
                    padding: '12px',
                    borderRadius: '6px',
                    marginBottom: '12px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '12px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>订单号：</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {processDetailRecord.orderNo || '-'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>款号：</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {processDetailRecord.styleNo || '-'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>款名：</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {processDetailRecord.styleName || '-'}
                      </span>
                    </div>
                  </div>

                  {/* 入库操作信息 */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '12px',
                    marginBottom: '12px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    fontSize: '13px'
                  }}>
                    <div>
                      <span style={{ color: '#6b7280' }}>入库单号：</span>
                      <span style={{ fontWeight: 600, color: '#1890ff' }}>
                        {processDetailRecord.warehousingOrderNo || '-'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>操作人：</span>
                      <span style={{ fontWeight: 600, color: '#111827' }}>
                        {processDetailRecord.warehousingOperatorName || '-'}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>开始时间：</span>
                      <span style={{ fontWeight: 500, color: '#111827' }}>
                        {formatDateTime(processDetailRecord.warehousingStartTime)}
                      </span>
                    </div>
                    <div>
                      <span style={{ color: '#6b7280' }}>完成时间：</span>
                      <span style={{ fontWeight: 500, color: '#111827' }}>
                        {formatDateTime(processDetailRecord.warehousingEndTime)}
                      </span>
                    </div>
                  </div>

                  {/* 入库统计（紧凑型卡片） */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px',
                    marginBottom: '12px'
                  }}>
                    {[
                      { label: '合格入库', value: qualifiedQty, color: '#059669', percent: qualifiedRate },
                      { label: '次品数', value: unqualifiedQty, color: '#dc2626' },
                      { label: '返修数', value: repairQty, color: '#f59e0b' },
                      { label: '库存', value: stockQty, color: '#3b82f6' },
                    ].map((item) => (
                      <div
                        key={item.label}
                        style={{
                          background: '#ffffff',
                          border: '1px solid #e5e7eb',
                          borderRadius: '6px',
                          padding: '12px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <span style={{
                          fontSize: '12px',
                          color: '#6b7280',
                          fontWeight: 500,
                        }}>
                          {item.label}
                        </span>
                        <span style={{
                          fontSize: '24px',
                          fontWeight: 700,
                          color: item.color,
                        }}>
                          {item.value}
                        </span>
                        {item.percent !== undefined && (
                          <span style={{
                            fontSize: '11px',
                            color: '#9ca3af',
                          }}>
                            占比 {item.percent}%
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* 码数明细表格 */}
                  <div style={{
                    background: '#ffffff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    padding: '12px',
                  }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#111827' }}>
                      📏 码数明细
                    </div>
                    <Table
                      dataSource={(() => {
                        // 解析 SKU 数据
                        const skuData = processDetailRecord.skuRows || [];
                        if (Array.isArray(skuData) && skuData.length > 0) {
                          return skuData.map((sku: any, index: number) => ({
                            key: index,
                            color: sku.color || '-',
                            size: sku.size || '-',
                            quantity: sku.quantity || 0,
                          }));
                        }
                        return [];
                      })()}
                      columns={[
                        {
                          title: '颜色',
                          dataIndex: 'color',
                          key: 'color',
                          width: 100,
                        },
                        {
                          title: '尺码',
                          dataIndex: 'size',
                          key: 'size',
                          width: 80,
                        },
                        {
                          title: '数量',
                          dataIndex: 'quantity',
                          key: 'quantity',
                          width: 80,
                          align: 'right' as const,
                          render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span>,
                        },
                      ]}
                      pagination={false}
                      size="small"
                      locale={{ emptyText: '暂无码数明细' }}
                      summary={(pageData) => {
                        if (pageData.length === 0) return null;
                        const total = pageData.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                        return (
                          <Table.Summary.Row style={{ background: '#fafafa' }}>
                            <Table.Summary.Cell index={0} colSpan={2}>
                              <span style={{ fontWeight: 600 }}>合计</span>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">
                              <span style={{ fontWeight: 700, color: '#059669' }}>{total} 件</span>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        );
                      }}
                    />
                  </div>
                </div>
              );
            }

            // 工序类型（非入库）
            // 从 progressWorkflowJson 解析完整工序信息
            let workflowNodes: any[] = [];
            try {
              if (processDetailRecord.progressWorkflowJson) {
                const workflow = typeof processDetailRecord.progressWorkflowJson === 'string'
                  ? JSON.parse(processDetailRecord.progressWorkflowJson)
                  : processDetailRecord.progressWorkflowJson;

                // 新格式：nodes 直接包含所有工序的完整信息
                const nodes = workflow?.nodes || [];
                if (nodes.length > 0 && nodes[0]?.name) {
                  // 检查是否是新格式（nodes 里直接有 name 和 unitPrice）
                  workflowNodes = nodes.map((item: any, idx: number) => ({
                    id: item.id || `proc_${idx}`,
                    name: item.name || item.processName || '',
                    progressStage: item.progressStage || '',
                    machineType: item.machineType || '',
                    standardTime: item.standardTime || 0,
                    unitPrice: Number(item.unitPrice) || 0,
                    sortOrder: item.sortOrder ?? idx,
                  }));
                  console.log('[工序明细] 从 nodes 直接解析:', workflowNodes.map(n => `${n.name}(${n.progressStage}): ¥${n.unitPrice}`));
                } else {
                  // 旧格式：从 processesByNode 读取
                  const processesByNode = workflow?.processesByNode || {};
                  const allProcesses: any[] = [];
                  let sortIdx = 0;

                  for (const node of nodes) {
                    const nodeId = node?.id || '';
                    const nodeProcesses = processesByNode[nodeId] || [];
                    for (const p of nodeProcesses) {
                      allProcesses.push({
                        id: p.id || `proc_${sortIdx}`,
                        name: p.name || p.processName || '',
                        progressStage: p.progressStage || node?.progressStage || node?.name || '',
                        machineType: p.machineType || '',
                        standardTime: p.standardTime || 0,
                        unitPrice: Number(p.unitPrice) || 0,
                        sortOrder: sortIdx,
                      });
                      sortIdx++;
                    }
                  }

                  if (allProcesses.length > 0) {
                    workflowNodes = allProcesses;
                    console.log('[工序明细] 从 processesByNode 解析:', workflowNodes.map(n => `${n.name}(${n.progressStage}): ¥${n.unitPrice}`));
                  }
                }
              }

              // 如果 progressWorkflowJson 没有数据，从 progressNodeUnitPrices 读取
              if (workflowNodes.length === 0 && Array.isArray(processDetailRecord.progressNodeUnitPrices) && processDetailRecord.progressNodeUnitPrices.length > 0) {
                workflowNodes = processDetailRecord.progressNodeUnitPrices.map((item: any, idx: number) => ({
                  id: item.id || item.processId || `node_${idx}`,
                  name: item.name || item.processName || '',
                  progressStage: item.progressStage || '',
                  machineType: item.machineType || '',
                  standardTime: item.standardTime || 0,
                  unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
                  sortOrder: item.sortOrder ?? idx,
                }));
                console.log('[工序明细] 从 progressNodeUnitPrices 解析:', workflowNodes.map(n => `${n.name}(${n.progressStage}): ¥${n.unitPrice}`));
              }

              console.log('[工序明细] 最终工序列表:', workflowNodes.map(n => `${n.name}(${n.progressStage}): ¥${n.unitPrice}`));
            } catch (e) {
              console.error('解析工艺模板失败:', e);
            }

            // 主进度节点定义（固定的5+1个大类）
            const mainStages = [
              { key: 'procurement', name: '采购', keywords: ['采购', '物料', '备料'] },
              { key: 'cutting', name: '裁剪', keywords: ['裁剪', '裁床', '开裁'] },
              { key: 'carSewing', name: '车缝', keywords: ['车缝', '缝制', '缝纫', '车工', '生产'] },
              { key: 'secondaryProcess', name: '二次工艺', keywords: ['二次工艺', '二次', '工艺'] },
              { key: 'tailProcess', name: '尾部', keywords: ['尾部', '整烫', '包装', '质检', '后整', '剪线'] },
              { key: 'warehousing', name: '入库', keywords: ['入库', '仓库'] },
            ];

            // 将子工序匹配到对应的主进度节点
            const matchStage = (progressStage: string, processName: string): string => {
              // 合并 progressStage 和 processName 用于匹配（中文不需要转小写）
              const text = `${progressStage || ''} ${processName || ''}`;
              // 按顺序匹配，先匹配到的优先
              for (const stage of mainStages) {
                if (stage.keywords.some(kw => text.includes(kw))) {
                  return stage.key;
                }
              }
              // 默认归类到尾部
              return 'tailProcess';
            };

            // 按主进度节点分组
            const groupedProcesses: Record<string, any[]> = {};
            mainStages.forEach(s => { groupedProcesses[s.key] = []; });

            workflowNodes.forEach((node: any) => {
              const stageKey = matchStage(node.progressStage || '', node.name || '');
              if (!groupedProcesses[stageKey]) {
                groupedProcesses[stageKey] = [];
              }
              groupedProcesses[stageKey].push(node);
            });

            // 如果不是'all'类型，只显示当前阶段的工序
            const stagesToShow = processDetailType === 'all'
              ? mainStages.filter(s => groupedProcesses[s.key].length > 0)
              : mainStages.filter(s => s.key === processDetailType && groupedProcesses[s.key].length > 0);

            const stageTitles: Record<string, string> = {
              all: '全部',
              procurement: '采购',
              cutting: '裁剪',
              carSewing: '车缝',
              secondaryProcess: '二次工艺',
              tailProcess: '尾部',
              warehousing: '入库',
            };

            // 计算总工价
            const totalPrice = workflowNodes.reduce((sum: number, node: any) => sum + (Number(node.unitPrice) || 0), 0);
            const cuttingQty = processDetailRecord.cuttingQuantity || processDetailRecord.orderQuantity || 0;

            return (
              <div>
                {/* 订单基本信息 */}
                <div style={{
                  background: '#f8f9fa',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>订单号</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      {processDetailRecord.orderNo || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>款号</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      {processDetailRecord.styleNo || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>款名</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      {processDetailRecord.styleName || '-'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>订单数量</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>
                      {processDetailRecord.orderQuantity || 0} 件
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>裁剪数量</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#059669' }}>
                      {cuttingQty} 件
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>总工价</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#dc2626' }}>
                      ¥{totalPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* 按进度节点分组显示工序 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {stagesToShow.map((stage) => {
                    const processes = groupedProcesses[stage.key] || [];
                    if (processes.length === 0) return null;

                    const stageTotal = processes.reduce((sum: number, p: any) => sum + (Number(p.unitPrice) || 0), 0);

                    return (
                      <div key={stage.key} style={{
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        overflow: 'hidden'
                      }}>
                        {/* 进度节点标题 */}
                        <div style={{
                          background: stage.key === 'procurement' ? '#dbeafe' :
                                     stage.key === 'cutting' ? '#fef3c7' :
                                     stage.key === 'carSewing' ? '#d1fae5' :
                                     stage.key === 'secondaryProcess' ? '#ede9fe' :
                                     stage.key === 'tailProcess' ? '#fce7f3' :
                                     '#f3f4f6',
                          padding: '10px 16px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderBottom: '1px solid #e5e7eb'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{
                              fontWeight: 700,
                              fontSize: '15px',
                              color: stage.key === 'procurement' ? '#1e40af' :
                                     stage.key === 'cutting' ? '#92400e' :
                                     stage.key === 'carSewing' ? '#065f46' :
                                     stage.key === 'secondaryProcess' ? '#5b21b6' :
                                     stage.key === 'tailProcess' ? '#9d174d' :
                                     '#374151'
                            }}>
                              {stage.name}
                            </span>
                            <span style={{ fontSize: '13px', color: '#6b7280' }}>
                              ({processes.length}个工序)
                            </span>
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: '#059669' }}>
                            小计: ¥{stageTotal.toFixed(2)}
                          </div>
                        </div>

                        {/* 子工序列表 */}
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '60px' }}>序号</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '80px' }}>工序编号</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>工序名称</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '80px' }}>机器类型</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '90px' }}>工序单价</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '90px' }}>裁剪数量</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', color: '#6b7280', fontWeight: 500, width: '100px' }}>工序工资</th>
                            </tr>
                          </thead>
                          <tbody>
                            {processes.map((p: any, idx: number) => {
                              const price = Number(p.unitPrice) || 0;
                              const wage = price * cuttingQty;
                              return (
                                <tr key={p.id || idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#9ca3af' }}>{idx + 1}</td>
                                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151' }}>{p.id || '-'}</td>
                                  <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 600, color: '#111827' }}>{p.name || '-'}</td>
                                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#6b7280' }}>{p.machineType || '-'}</td>
                                  <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 600, color: '#059669', textAlign: 'right' }}>
                                    {price > 0 ? `¥${price.toFixed(2)}` : '-'}
                                  </td>
                                  <td style={{ padding: '10px 12px', fontSize: '13px', color: '#374151', textAlign: 'right' }}>{cuttingQty}</td>
                                  <td style={{ padding: '10px 12px', fontSize: '14px', fontWeight: 600, color: '#dc2626', textAlign: 'right' }}>
                                    {wage > 0 ? `¥${wage.toFixed(2)}` : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>

                {/* 总计 */}
                {processDetailType === 'all' && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    background: '#f0fdf4',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontWeight: 600, color: '#374151' }}>
                      全部工序合计（{workflowNodes.length}个）
                    </span>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <span style={{ color: '#059669', fontWeight: 600 }}>
                        总工价: ¥{totalPrice.toFixed(2)}
                      </span>
                      <span style={{ color: '#dc2626', fontWeight: 700, fontSize: '16px' }}>
                        总工资: ¥{(totalPrice * cuttingQty).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </ResizableModal>

        {/* 打印预览弹窗 - 使用通用打印组件 */}
        <StylePrintModal
          visible={printModalVisible}
          onClose={() => {
            setPrintModalVisible(false);
            setPrintingRecord(null);
          }}
          styleId={printingRecord?.styleId}
          styleNo={printingRecord?.styleNo}
          styleName={printingRecord?.styleName}
          cover={printingRecord?.styleCover}
          color={printingRecord?.color}
          quantity={printingRecord?.orderQuantity}
          category={printingRecord?.category}
          mode="production"
          extraInfo={{
            '订单号': printingRecord?.orderNo,
            '订单数量': printingRecord?.orderQuantity,
            '加工厂': printingRecord?.factoryName,
            '跟单员': printingRecord?.merchandiser,
            '订单交期': printingRecord?.plannedEndDate,
          }}
          sizeDetails={printingRecord ? parseProductionOrderLines(printingRecord) : []}
        />
      </div>
    </Layout>
  );
};

export default ProductionList;
