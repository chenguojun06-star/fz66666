import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Table, App, Dropdown, Checkbox } from 'antd';
import { SearchOutlined, EyeOutlined, DownloadOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined, SettingOutlined, FileSearchOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableModal from '@/components/common/ResizableModal';
import QuickEditModal from '@/components/common/QuickEditModal';
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
import { isSupervisorOrAboveUser, useAuth } from '@/utils/authContext';
import './styles.css';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import { useLocation, useNavigate } from 'react-router-dom';
import QRCodeBox from '@/components/common/QRCodeBox';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';

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
  const [visible, setVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<ProductionOrder | null>(null);
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
    setLogVisible(true);
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

  // 快速编辑状态
  const [quickEditVisible, setQuickEditVisible] = useState(false);
  const [quickEditRecord, setQuickEditRecord] = useState<ProductionOrder | null>(null);
  const [quickEditSaving, setQuickEditSaving] = useState(false);
  const [logVisible, setLogVisible] = useState(false);
  const [logLoading, setLogLoading] = useState(false);
  const [logRecords, setLogRecords] = useState<ScanRecord[]>([]);
  const [logTitle, setLogTitle] = useState('日志');

  // 列显示/隐藏状态
  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('production-list-visible-columns');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return {};
      }
    }
    // 默认全部显示
    return {
      styleCover: true,
      orderNo: true,
      styleNo: true,
      styleName: true,
      attachments: true,
      factoryName: true,
      orderQuantity: true,
      cuttingQuantity: true,
      sewingCompletionRate: true,
      warehousingQualifiedQuantity: true,
      productionProgress: true,
      status: true,
      plannedEndDate: true,
    };
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

  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const navigate = useNavigate();
  const location = useLocation();

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const orderDetailLines = currentOrder ? parseProductionOrderLines(currentOrder, { includeWarehousedQuantity: true }) : [];
  const detailColors = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => safeString(l?.color, ''))
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    return joined || safeString((currentOrder as Record<string, unknown>)?.color);
  })();

  const detailSizes = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => safeString(l?.size, ''))
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    return joined || safeString((currentOrder as Record<string, unknown>)?.size);
  })();

  const detailQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.quantity) || 0), 0);
    if (sum > 0) return sum;
    const q = Number((currentOrder as Record<string, unknown>)?.orderQuantity);
    return Number.isFinite(q) && q > 0 ? q : 0;
  })();

  const detailWarehousedQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.warehousedQuantity) || 0), 0);
    if (sum > 0) return sum;
    const q = toNumberSafe((currentOrder as Record<string, unknown>)?.warehousingQualifiedQuantity);
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

    const color = safeString((currentOrder as Record<string, unknown>)?.color);
    const size = safeString((currentOrder as Record<string, unknown>)?.size);
    const orderQuantity = Math.max(0, toNumberSafe((currentOrder as Record<string, unknown>)?.orderQuantity) || detailQuantity);
    const c = toNumberSafe((currentOrder as Record<string, unknown>)?.cuttingQuantity) || 0;
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
      enabled: !loading && !visible, // 加载中或弹窗打开时暂停同步
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
    setCurrentOrder(order);
    setVisible(true);
  };

  // 关闭弹窗
  const closeDialog = () => {
    setVisible(false);
    setCurrentOrder(null);
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
        id: quickEditRecord?.id,
        ...values,
      });
      message.success('保存成功');
      setQuickEditVisible(false);
      setQuickEditRecord(null);
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

  const stageColumns = (
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
      title: '加工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 120,
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
      title: <SortableColumnTitle title="预计出货" field="expectedShipDate" onSort={handleSort} currentField={sortField} currentOrder={sortOrder} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    ...stageColumns('procurement', { start: '采购时间', end: '采购完成', operator: '采购员', rate: '采购完成率' }),
    ...stageColumns('cutting', { start: '裁剪时间', end: '裁剪完成', operator: '裁剪员', rate: '裁剪完成率' }),
    ...stageColumns('carSewing', { start: '车缝开始', end: '车缝完成', operator: '车缝员', rate: '车缝完成率' }),
    ...stageColumns('ironing', { start: '大烫开始', end: '大烫完成', operator: '大烫员', rate: '大烫完成率' }),
    ...stageColumns('packaging', { start: '包装开始', end: '包装完成', operator: '包装员', rate: '包装完成率' }),
    ...stageColumns('quality', { start: '质检时间', end: '质检完成', operator: '质检员', rate: '质检完成率' }),
    ...stageColumns('warehousing', { start: '入库时间', end: '入库完成', operator: '入库员', rate: '入库完成率' }),
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
      title: '合格入库',
      dataIndex: 'warehousingQualifiedQuantity',
      key: 'warehousingQualifiedQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: unknown) => Number(v ?? 0) || 0,
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
      title: '完成时间',
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
            {
              key: 'procurementStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.procurementStartTime !== false} onChange={() => toggleColumnVisible('procurementStartTime')}>
                    采购时间
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'procurementEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.procurementEndTime !== false} onChange={() => toggleColumnVisible('procurementEndTime')}>
                    采购完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'procurementOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.procurementOperatorName !== false} onChange={() => toggleColumnVisible('procurementOperatorName')}>
                    采购员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'procurementCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.procurementCompletionRate !== false} onChange={() => toggleColumnVisible('procurementCompletionRate')}>
                    采购完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingStartTime !== false} onChange={() => toggleColumnVisible('cuttingStartTime')}>
                    裁剪时间
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingEndTime !== false} onChange={() => toggleColumnVisible('cuttingEndTime')}>
                    裁剪完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingOperatorName !== false} onChange={() => toggleColumnVisible('cuttingOperatorName')}>
                    裁剪员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'cuttingCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.cuttingCompletionRate !== false} onChange={() => toggleColumnVisible('cuttingCompletionRate')}>
                    裁剪完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'carSewingStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.carSewingStartTime !== false} onChange={() => toggleColumnVisible('carSewingStartTime')}>
                    车缝开始
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'carSewingEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.carSewingEndTime !== false} onChange={() => toggleColumnVisible('carSewingEndTime')}>
                    车缝完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'carSewingOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.carSewingOperatorName !== false} onChange={() => toggleColumnVisible('carSewingOperatorName')}>
                    车缝员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'carSewingCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.carSewingCompletionRate !== false} onChange={() => toggleColumnVisible('carSewingCompletionRate')}>
                    车缝完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'ironingStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.ironingStartTime !== false} onChange={() => toggleColumnVisible('ironingStartTime')}>
                    大烫开始
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'ironingEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.ironingEndTime !== false} onChange={() => toggleColumnVisible('ironingEndTime')}>
                    大烫完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'ironingOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.ironingOperatorName !== false} onChange={() => toggleColumnVisible('ironingOperatorName')}>
                    大烫员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'ironingCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.ironingCompletionRate !== false} onChange={() => toggleColumnVisible('ironingCompletionRate')}>
                    大烫完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'packagingStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.packagingStartTime !== false} onChange={() => toggleColumnVisible('packagingStartTime')}>
                    包装开始
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'packagingEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.packagingEndTime !== false} onChange={() => toggleColumnVisible('packagingEndTime')}>
                    包装完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'packagingOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.packagingOperatorName !== false} onChange={() => toggleColumnVisible('packagingOperatorName')}>
                    包装员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'packagingCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.packagingCompletionRate !== false} onChange={() => toggleColumnVisible('packagingCompletionRate')}>
                    包装完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'qualityStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.qualityStartTime !== false} onChange={() => toggleColumnVisible('qualityStartTime')}>
                    质检时间
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'qualityEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.qualityEndTime !== false} onChange={() => toggleColumnVisible('qualityEndTime')}>
                    质检完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'qualityOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.qualityOperatorName !== false} onChange={() => toggleColumnVisible('qualityOperatorName')}>
                    质检员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'qualityCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.qualityCompletionRate !== false} onChange={() => toggleColumnVisible('qualityCompletionRate')}>
                    质检完成率
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'warehousingStartTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.warehousingStartTime !== false} onChange={() => toggleColumnVisible('warehousingStartTime')}>
                    入库时间
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'warehousingEndTime',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.warehousingEndTime !== false} onChange={() => toggleColumnVisible('warehousingEndTime')}>
                    入库完成
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'warehousingOperatorName',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.warehousingOperatorName !== false} onChange={() => toggleColumnVisible('warehousingOperatorName')}>
                    入库员
                  </Checkbox>
                </div>
              ),
            },
            {
              key: 'warehousingCompletionRate',
              label: (
                <div onClick={(e) => e.stopPropagation()}>
                  <Checkbox checked={visibleColumns.warehousingCompletionRate !== false} onChange={() => toggleColumnVisible('warehousingCompletionRate')}>
                    入库完成率
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
                    完成时间
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
                key: 'quickEdit',
                label: '编辑',
                title: '快速编辑备注和预计出货',
                icon: <EditOutlined />,
                onClick: () => {
                  setQuickEditRecord(record);
                  setQuickEditVisible(true);
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

          {/* 表格区 */}
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
        </Card>

        {/* 生产订单详情弹窗 */}
        <ResizableModal
          title="生产订单详情"
          open={visible}
          onCancel={closeDialog}
          footer={null}
          width={modalWidth}
          initialHeight={modalInitialHeight}
          minWidth={isMobile ? 320 : 520}
          scaleWithViewport
          tableDensity={isMobile ? 'dense' : 'auto'}
        >
          {currentOrder ? (
            <>
              {/* 头部订单信息卡片 */}
              <div style={{
                display: 'flex',
                gap: isMobile ? 12 : 16,
                padding: isMobile ? 10 : 12,
                background: '#f8f9fa',
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
                    styleNo={String((currentOrder as Record<string, unknown>).styleNo || '').trim()}
                    size={isMobile ? 160 : 200}
                    borderRadius={6}
                  />
                  {currentOrder?.qrCode ? (
                    <QRCodeBox
                      value={String(currentOrder.qrCode)}
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
                          color: '#6b7280',
                          fontWeight: 600
                        }}>订单号</span>
                        <span style={{
                          fontSize: 18,
                          fontWeight: 700,
                          color: '#1f2937',
                          letterSpacing: '0.5px'
                        }}>{safeString((currentOrder as Record<string, unknown>).orderNo)}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600 }}>加工厂</span>
                        <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                          {safeString((currentOrder as Record<string, unknown>).factoryName)}
                        </span>
                      </div>
                    </div>

                    {/* 右侧：码数与数量表格 */}
                    <div style={{
                      padding: 6,
                      background: '#fff',
                      borderRadius: 6,
                      border: '2px solid #d1d5db',
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
                                  color: '#374151',
                                  fontWeight: 600,
                                  borderRight: '1px solid #d1d5db',
                                  borderBottom: '1px solid #d1d5db',
                                  width: '60px',
                                  background: '#f3f4f6'
                                }}>
                                  码数
                                </td>
                                {sizeArray.map((size: string, idx: number) => (
                                  <td key={idx} style={{
                                    padding: '8px 14px',
                                    fontSize: 15,
                                    color: '#111827',
                                    fontWeight: 700,
                                    textAlign: 'center',
                                    borderRight: idx < sizeArray.length - 1 ? '1px solid #d1d5db' : 'none',
                                    borderBottom: '1px solid #d1d5db',
                                    minWidth: '50px'
                                  }}>
                                    {size}
                                  </td>
                                ))}
                                <td style={{
                                  padding: '8px 14px',
                                  fontSize: 14,
                                  color: '#111827',
                                  fontWeight: 700,
                                  textAlign: 'center',
                                  borderLeft: '1px solid #d1d5db',
                                  borderBottom: '1px solid #d1d5db',
                                  background: '#fef3c7',
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
                                  color: '#374151',
                                  fontWeight: 600,
                                  borderRight: '1px solid #d1d5db',
                                  background: '#f3f4f6'
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
                                      color: '#111827',
                                      fontWeight: 700,
                                      textAlign: 'center',
                                      borderRight: idx < sizeArray.length - 1 ? '1px solid #d1d5db' : 'none',
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
                      <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>款号</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                        {safeString((currentOrder as Record<string, unknown>).styleNo)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>款名</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                        {safeString((currentOrder as Record<string, unknown>).styleName)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>颜色</span>
                      <span style={{ fontSize: 15, fontWeight: 600, color: '#111827' }}>
                        {detailColors}
                      </span>
                    </div>
                  </div>

                  {/* 其他信息区域 */}
                  <div style={{
                    padding: 6,
                    background: '#fff',
                    borderRadius: 4,
                    border: '1px solid #e5e7eb'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                      gap: isMobile ? '4px 6px' : '4px 8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>订单数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {String((currentOrder as Record<string, unknown>).orderQuantity ?? '-')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>完成数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {String((currentOrder as Record<string, unknown>).completedQuantity ?? '-')}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>入库数量</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {detailWarehousedQuantity || '-'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>生产进度</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#059669' }}>
                          {String((currentOrder as Record<string, unknown>).productionProgress ?? '-')}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>状态</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {getStatusConfig((currentOrder as Record<string, unknown>).status).text}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>采购员</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {safeString((currentOrder as Record<string, unknown>).procurementOperatorName)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>采购完成率</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {((currentOrder as Record<string, unknown>).procurementCompletionRate ?? '-') + '%'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>采购时间</span>
                        <span style={{ fontSize: 13, color: '#111827' }}>
                          {formatDateTime((currentOrder as Record<string, unknown>).procurementStartTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>采购完成时间</span>
                        <span style={{ fontSize: 13, color: '#111827' }}>
                          {formatDateTime((currentOrder as Record<string, unknown>).procurementEndTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪员</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {safeString((currentOrder as Record<string, unknown>).cuttingOperatorName)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪完成率</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                          {((currentOrder as Record<string, unknown>).cuttingCompletionRate ?? '-') + '%'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪时间</span>
                        <span style={{ fontSize: 13, color: '#111827' }}>
                          {formatDateTime((currentOrder as Record<string, unknown>).cuttingStartTime)}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600, whiteSpace: 'nowrap' }}>裁剪完成时间</span>
                        <span style={{ fontSize: 13, color: '#111827' }}>
                          {formatDateTime((currentOrder as Record<string, unknown>).cuttingEndTime)}
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
                        border: '1px solid #e5e7eb',
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
                          <Table.Summary.Row style={{ fontWeight: 600, background: '#f9fafb' }}>
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
                  background: '#f8f9fa',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  flexWrap: 'wrap'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>计划开始：</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDateTime(currentOrder.plannedStartDate)}</span>
                  </div>
                  {currentOrder.actualStartDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>实际开始：</span>
                      <span style={{ fontSize: 12, color: '#059669' }}>{formatDateTime(currentOrder.actualStartDate)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>计划完成：</span>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>{formatDateTime(currentOrder.plannedEndDate)}</span>
                  </div>
                  {currentOrder.actualEndDate && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>实际完成：</span>
                      <span style={{ fontSize: 12, color: '#059669' }}>{formatDateTime(currentOrder.actualEndDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </ResizableModal>

        <ResizableModal
          open={logVisible}
          title={logTitle}
          onCancel={() => {
            setLogVisible(false);
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
      </div>
    </Layout>
  );
};

export default ProductionList;
