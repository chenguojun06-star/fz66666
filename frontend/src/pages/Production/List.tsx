import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, Row, Col, Timeline, InputNumber, message, Modal, Table } from 'antd';
import { SearchOutlined, EyeOutlined, ScanOutlined, DownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableModal from '../../components/common/ResizableModal';
import { ProductionOrder, ProductionQueryParams, ScanRecord } from '../../types/production';
import api, {
  generateRequestId,
  isDuplicateScanMessage,
  isOrderFrozenByStatus,
  isOrderFrozenByStatusOrStock,
  parseProductionOrderLines,
  toNumberSafe,
  withQuery,
} from '../../utils/api';
import { isSupervisorOrAboveUser, useAuth } from '../../utils/authContext';
import './styles.css';
import dayjs from 'dayjs';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { StyleAttachmentsButton, StyleCoverThumb } from '../../components/StyleAssets';
import { formatDateTime } from '../../utils/datetime';
import { useSync } from '../../utils/syncManager';
import { useViewport } from '../../utils/useViewport';

const { Option } = Select;

const ProductionList: React.FC = () => {
  // 状态管理
  const { isMobile, modalWidth } = useViewport();
  const [visible, setVisible] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<ProductionOrder | null>(null);
  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: 10
  });

  // 真实数据状态
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  const { user } = useAuth();
  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);
  const navigate = useNavigate();
  const location = useLocation();

  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const orderDetailLines = currentOrder ? parseProductionOrderLines(currentOrder, { includeWarehousedQuantity: true }) : [];
  const detailColors = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => String(l?.color || '').trim())
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    if (joined) return joined;
    return String((currentOrder as any)?.color || '').trim() || '-';
  })();

  const detailSizes = (() => {
    const s = new Set(
      orderDetailLines
        .map((l) => String(l?.size || '').trim())
        .filter((v) => v)
    );
    const joined = Array.from(s).join('、');
    if (joined) return joined;
    return String((currentOrder as any)?.size || '').trim() || '-';
  })();

  const detailQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.quantity) || 0), 0);
    if (sum > 0) return sum;
    const q = Number((currentOrder as any)?.orderQuantity);
    return Number.isFinite(q) && q > 0 ? q : 0;
  })();

  const detailWarehousedQuantity = (() => {
    const sum = orderDetailLines.reduce((acc, l) => acc + (Number(l?.warehousedQuantity) || 0), 0);
    if (sum > 0) return sum;
    const q = toNumberSafe((currentOrder as any)?.warehousingQualifiedQuantity);
    return q > 0 ? q : 0;
  })();

  const detailSkuRows = (() => {
    const map = new Map<string, { color: string; size: string; orderQuantity: number; warehousedQuantity?: number }>();
    for (const l of orderDetailLines) {
      const color = String(l?.color || '').trim();
      const size = String(l?.size || '').trim();
      const orderQuantity = Number(l?.quantity) || 0;
      const warehousedQuantity = Number(l?.warehousedQuantity) || 0;
      if (!color || !size) continue;
      if (orderQuantity <= 0 && warehousedQuantity <= 0) continue;
      const key = `${color}|||${size}`;
      const prev = map.get(key);
      map.set(key, {
        color,
        size,
        orderQuantity: (prev?.orderQuantity || 0) + orderQuantity,
        warehousedQuantity: (prev?.warehousedQuantity || 0) + warehousedQuantity,
      });
    }

    const rows = Array.from(map.values())
      .map((r) => {
        const w = Number(r.warehousedQuantity) || 0;
        const hasW = w > 0;
        return {
          key: `${r.color}|||${r.size}`,
          color: r.color,
          size: r.size,
          orderQuantity: Math.max(0, Number(r.orderQuantity) || 0),
          warehousedQuantity: hasW ? w : undefined,
          unwarehousedQuantity: hasW ? Math.max(0, (Number(r.orderQuantity) || 0) - w) : undefined,
        };
      })
      .filter((r) => r.orderQuantity > 0 || (Number(r.warehousedQuantity) || 0) > 0);

    if (rows.length) return rows;

    const color = String((currentOrder as any)?.color || '').trim() || '-';
    const size = String((currentOrder as any)?.size || '').trim() || '-';
    const orderQuantity = Math.max(0, toNumberSafe((currentOrder as any)?.orderQuantity) || detailQuantity);
    const w = detailWarehousedQuantity;
    return [
      {
        key: '_single',
        color,
        size,
        orderQuantity,
        warehousedQuantity: w > 0 ? w : undefined,
        unwarehousedQuantity: w > 0 ? Math.max(0, orderQuantity - w) : undefined,
      },
    ];
  })();

  const detailSkuHasWarehoused = detailSkuRows.some((r) => (Number((r as any)?.warehousedQuantity) || 0) > 0);
  const detailSkuTotals = (() => {
    const totalOrder = detailSkuRows.reduce((acc, r) => acc + (Number((r as any)?.orderQuantity) || 0), 0);
    const totalWarehoused = detailSkuHasWarehoused
      ? detailSkuRows.reduce((acc, r) => acc + (Number((r as any)?.warehousedQuantity) || 0), 0)
      : detailWarehousedQuantity;
    const totalUnwarehoused = Math.max(0, totalOrder - totalWarehoused);
    return { totalOrder, totalWarehoused, totalUnwarehoused };
  })();



  // 获取生产订单列表
  const fetchProductionList = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/production/order/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setProductionList(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取生产订单列表失败');
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
        const response = await api.get<any>('/production/order/list', { params: queryParams });
        const result = response as any;
        if (result.code === 200) {
          return result.data.records || [];
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

  const formatCsvCell = (value: any) => {
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
        (r as any).orderOperatorName || '',
        formatDateTime((r as any).createTime),
        formatDateTime((r as any).procurementStartTime),
        formatDateTime((r as any).procurementEndTime),
        (r as any).procurementOperatorName || '',
        (r as any).procurementCompletionRate == null ? '' : `${(r as any).procurementCompletionRate}%`,
        formatDateTime((r as any).cuttingStartTime),
        formatDateTime((r as any).cuttingEndTime),
        (r as any).cuttingOperatorName || '',
        (r as any).cuttingCompletionRate == null ? '' : `${(r as any).cuttingCompletionRate}%`,
        formatDateTime((r as any).sewingStartTime),
        formatDateTime((r as any).sewingEndTime),
        (r as any).sewingCompletionRate == null ? '' : `${(r as any).sewingCompletionRate}%`,
        formatDateTime((r as any).qualityStartTime),
        formatDateTime((r as any).qualityEndTime),
        (r as any).qualityOperatorName || '',
        (r as any).qualityCompletionRate == null ? '' : `${(r as any).qualityCompletionRate}%`,
        formatDateTime((r as any).warehousingStartTime),
        formatDateTime((r as any).warehousingEndTime),
        (r as any).warehousingOperatorName || '',
        (r as any).warehousingCompletionRate == null ? '' : `${(r as any).warehousingCompletionRate}%`,
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

  const clearScanConfirmTimers = () => {
    if (scanConfirmTimerRef.current) {
      window.clearTimeout(scanConfirmTimerRef.current);
      scanConfirmTimerRef.current = null;
    }
    if (scanConfirmTickRef.current) {
      window.clearInterval(scanConfirmTickRef.current);
      scanConfirmTickRef.current = null;
    }
  };

  useEffect(() => () => {
    clearScanConfirmTimers();
  }, []);

  const closeScanConfirm = (silent?: boolean) => {
    clearScanConfirmTimers();
    setScanConfirmVisible(false);
    setScanConfirmRemain(0);
    setScanConfirmLoading(false);
    setScanConfirmPayload(null);
    setScanConfirmDetail(null);
    setScanConfirmMeta(null);
    if (!silent) {
      message.info('已取消');
    }
  };

  // 获取状态文本和标签颜色
  const getStatusConfig = (status: ProductionOrder['status'] | string | undefined | null) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待生产', color: 'blue' },
      production: { text: '生产中', color: 'green' },
      completed: { text: '已完成', color: 'success' },
      delayed: { text: '已逾期', color: 'error' },
    };
    const key = String(status || '').trim();
    return statusMap[key] || { text: '未知', color: 'default' };
  };

  const getCloseMinRequired = (cuttingQuantity: number) => {
    const cq = Number(cuttingQuantity ?? 0);
    if (!Number.isFinite(cq) || cq <= 0) return 0;
    return Math.ceil(cq * 0.9);
  };

  const handleCloseOrder = (order: ProductionOrder) => {
    const orderId = String((order as any)?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空，无法关单');
      return;
    }

    const cuttingQty = Number((order as any)?.cuttingQuantity ?? 0) || 0;
    const minRequired = getCloseMinRequired(cuttingQty);
    const orderQty = Number((order as any)?.orderQuantity ?? 0) || 0;
    const warehousingQualified = Number((order as any)?.warehousingQualifiedQuantity ?? 0) || 0;

    if ((order as any)?.status === 'completed') {
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

    Modal.confirm({
      title: `确认关单：${String((order as any)?.orderNo || '').trim() || '-'}`,
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
        const result = await api.post<any>('/production/order/close', { id: orderId, sourceModule: 'myOrders' });
        if ((result as any)?.code !== 200) {
          throw new Error((result as any)?.message || '关单失败');
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
    const orderId = String((order as any)?.id || '').trim();
    if (!orderId) {
      message.error('订单ID为空，无法报废');
      return;
    }
    if (isOrderFrozenByStatus(order)) {
      message.error('订单已完成，无法报废');
      return;
    }

    let remark = '';
    Modal.confirm({
      title: `确认报废：${String((order as any)?.orderNo || '').trim() || '-'}`,
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
        const result = await api.post<any>('/production/order/scrap', { id: orderId, remark: opRemark });
        if ((result as any)?.code !== 200) {
          throw new Error((result as any)?.message || '报废失败');
        }
        message.success('报废成功');
        fetchProductionList();
      },
    });
  };

  // 表格列定义
  const renderStageTime = (value: any) => {
    const s = String(value ?? '').trim();
    return s ? formatDateTime(value) : '-';
  };

  const renderStageText = (value: any) => {
    return String(value ?? '').trim() || '-';
  };

  const renderStageRate = (value: any) => {
    if (value === null || value === undefined || String(value).trim() === '') return '-';
    const n = Number(value);
    return Number.isFinite(n) ? `${n}%` : '-';
  };

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
            render: renderStageText,
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

  const columns = [
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
        const orderNo = String(v || '').trim();
        const styleNo = String((record as any)?.styleNo || '').trim();
        const orderId = String((record as any)?.id || '').trim();
        return (
          <a
            className="order-no-compact"
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
        <StyleAttachmentsButton styleId={record.styleId} styleNo={record.styleNo} modalTitle={record.styleNo ? `附件（${record.styleNo}）` : '附件'} />
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
      title: '下单时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: renderStageTime,
    },
    ...stageColumns('procurement', { start: '采购时间', end: '采购完成', operator: '采购员', rate: '采购完成率' }),
    ...stageColumns('cutting', { start: '裁剪时间', end: '裁剪完成', operator: '裁剪员', rate: '裁剪完成率' }),
    ...stageColumns('sewing', { start: '缝制开始', end: '缝制完成', operator: '缝制员', rate: '缝制完成率' }, { includeOperator: false }),
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
      render: (v: any) => Number(v ?? 0) || 0,
    },
    {
      title: '次品数',
      dataIndex: 'unqualifiedQuantity',
      key: 'unqualifiedQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: any) => Number(v ?? 0) || 0,
    },
    {
      title: '返修数',
      dataIndex: 'repairQuantity',
      key: 'repairQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: any) => Number(v ?? 0) || 0,
    },
    {
      title: '库存',
      dataIndex: 'inStockQuantity',
      key: 'inStockQuantity',
      width: 90,
      align: 'right' as const,
      render: (v: any) => Number(v ?? 0) || 0,
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
      title: '计划完成日期',
      dataIndex: 'plannedEndDate',
      key: 'plannedEndDate',
      width: 120,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);
        return (
          <RowActions
            className="table-actions"
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
                key: 'close',
                label: frozen ? '关单(已完成)' : '关单',
                disabled: frozen,
                onClick: () => handleCloseOrder(record),
              },
              {
                key: 'cutting',
                label: frozen ? '裁剪管理(已完成)' : '裁剪管理',
                disabled: frozen,
                onClick: () =>
                  navigate(
                    withQuery('/production/cutting', {
                      orderId: (record as any)?.id,
                      orderNo: (record as any)?.orderNo,
                      styleNo: (record as any)?.styleNo,
                    })
                  ),
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
            ]}
          />
        );
      },
    },
  ];

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
            columns={columns as any}
            dataSource={productionList}
            rowKey="id"
            loading={loading}
            rowSelection={{
              selectedRowKeys,
              onChange: (keys: React.Key[], rows: ProductionOrder[]) => {
                setSelectedRowKeys(keys);
                setSelectedRows(rows);
              },
            }}
            rowClassName={() => 'clickable-row'}
            onRow={(record) => {
              return {
                onClick: (e) => {
                  const target = e.target as HTMLElement | null;
                  if (!target) return;

                  const interactive = target.closest(
                    'a,button,input,textarea,select,option,[role="button"],[role="menuitem"],.ant-dropdown-trigger,.ant-btn'
                  );
                  if (interactive) return;

                  const orderNo = String((record as any)?.orderNo || '').trim();
                  const styleNo = String((record as any)?.styleNo || '').trim();
                  const orderId = String((record as any)?.id || '').trim();
                  navigate(withQuery('/production/order-flow', { orderId, orderNo, styleNo }));
                },
              };
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
              <div className="modal-detail-header">
                <div className="modal-detail-cover" style={{ flexDirection: 'column', gap: 10, padding: 10 }}>
                  <StyleCoverThumb styleNo={String((currentOrder as any).styleNo || '').trim()} size={140} borderRadius={10} />
                  {currentOrder?.qrCode ? <QRCodeCanvas value={String(currentOrder.qrCode)} size={96} includeMargin /> : null}
                </div>
                <div className="modal-detail-grid">
                  <div className="modal-detail-item"><span className="modal-detail-label">订单号：</span><span className="modal-detail-value order-no-compact">{String((currentOrder as any).orderNo || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">款号：</span><span className="modal-detail-value">{String((currentOrder as any).styleNo || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">款名：</span><span className="modal-detail-value">{String((currentOrder as any).styleName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">颜色：</span><span className="modal-detail-value">{detailColors}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">码数：</span><span className="modal-detail-value">{detailSizes}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">数量：</span><span className="modal-detail-value">{detailQuantity || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">加工厂：</span><span className="modal-detail-value">{String((currentOrder as any).factoryName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">订单数量：</span><span className="modal-detail-value">{String((currentOrder as any).orderQuantity ?? '-')}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">完成数量：</span><span className="modal-detail-value">{String((currentOrder as any).completedQuantity ?? '-')}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">入库数量：</span><span className="modal-detail-value">{detailWarehousedQuantity || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">生产进度：</span><span className="modal-detail-value">{String((currentOrder as any).productionProgress ?? '-')}%</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">状态：</span><span className="modal-detail-value">{getStatusConfig((currentOrder as any).status).text}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">计划开始：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).plannedStartDate)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">计划完成：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).plannedEndDate)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">实际开始：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).actualStartDate)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">实际完成：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).actualEndDate)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">采购员：</span><span className="modal-detail-value">{String((currentOrder as any).procurementOperatorName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">采购完成率：</span><span className="modal-detail-value">{((currentOrder as any).procurementCompletionRate ?? '-') + '%'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">采购时间：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).procurementStartTime)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">采购完成：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).procurementEndTime)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">裁剪时间：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).cuttingStartTime)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">裁剪完成：</span><span className="modal-detail-value">{formatDateTime((currentOrder as any).cuttingEndTime)}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">裁剪员：</span><span className="modal-detail-value">{String((currentOrder as any).cuttingOperatorName || '').trim() || '-'}</span></div>
                  <div className="modal-detail-item"><span className="modal-detail-label">裁剪完成率：</span><span className="modal-detail-value">{((currentOrder as any).cuttingCompletionRate ?? '-') + '%'}</span></div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '360px minmax(0, 1fr)', gap: 16, marginTop: 12, alignItems: 'start' }}>
                <div>
                  <h3 style={{ marginTop: 0 }}>生产节点时间线</h3>
                  <Timeline
                    style={{ marginTop: 8 }}
                    items={[
                      { content: <>计划开始：{formatDateTime(currentOrder.plannedStartDate)}</> },
                      currentOrder.actualStartDate
                        ? { content: <>实际开始：{formatDateTime(currentOrder.actualStartDate)}</> }
                        : null,
                      { content: <>计划完成：{formatDateTime(currentOrder.plannedEndDate)}</> },
                      currentOrder.actualEndDate ? { content: <>实际完成：{formatDateTime(currentOrder.actualEndDate)}</> } : null,
                    ].filter(Boolean) as any}
                  />
                </div>

                <div>
                  <h3 style={{ marginTop: 0 }}>详细</h3>
                  <div style={{ border: '1px solid rgba(0,0,0,0.06)', borderRadius: 10, padding: 12 }}>
                    <Table
                      size="small"
                      bordered
                      pagination={false}
                      dataSource={detailSkuRows as any}
                      rowKey="key"
                      columns={[
                        {
                          title: '颜色',
                          dataIndex: 'color',
                          key: 'color',
                          ellipsis: true,
                        },
                        {
                          title: '码数',
                          dataIndex: 'size',
                          key: 'size',
                          ellipsis: true,
                        },
                        {
                          title: '下单',
                          dataIndex: 'orderQuantity',
                          key: 'orderQuantity',
                          width: 88,
                          align: 'right' as const,
                          render: (v: any) => Math.max(0, Number(v) || 0),
                        },
                        {
                          title: '入库',
                          dataIndex: 'warehousedQuantity',
                          key: 'warehousedQuantity',
                          width: 88,
                          align: 'right' as const,
                          render: (v: any) => (detailSkuHasWarehoused ? Math.max(0, Number(v) || 0) : '-'),
                        },
                        {
                          title: '未入库',
                          dataIndex: 'unwarehousedQuantity',
                          key: 'unwarehousedQuantity',
                          width: 98,
                          align: 'right' as const,
                          render: (v: any) => (detailSkuHasWarehoused ? Math.max(0, Number(v) || 0) : '-'),
                        },
                      ]}
                      summary={() => (
                        <Table.Summary>
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0} colSpan={2}>
                              合计
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="right">
                              {detailSkuTotals.totalOrder || '-'}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="right">
                              {detailSkuTotals.totalWarehoused > 0 ? detailSkuTotals.totalWarehoused : '-'}
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="right">
                              {detailSkuTotals.totalUnwarehoused > 0 ? detailSkuTotals.totalUnwarehoused : '-'}
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        </Table.Summary>
                      )}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </ResizableModal>
      </div>
    </Layout>
  );
};

export default ProductionList;
