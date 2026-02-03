import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Input, Select, Space, Tag, Form, App, Dropdown, Checkbox, Alert, InputNumber } from 'antd';
import { DownloadOutlined, DeleteOutlined, CheckCircleOutlined, EditOutlined, SettingOutlined, AppstoreOutlined, UnorderedListOutlined, PrinterOutlined, CloseCircleOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';

import QuickEditModal from '@/components/common/QuickEditModal';
import StylePrintModal from '@/components/common/StylePrintModal';
import { ProductionOrder, ProductionQueryParams } from '@/types/production';
import type { PaginatedResponse } from '@/types/api';
import api, {
  isOrderFrozenByStatus,
  isOrderFrozenByStatusOrStock,
  parseProductionOrderLines,

  withQuery,
  isApiSuccess,
} from '@/utils/api';
import { productionOrderApi, productionScanApi } from '@/services/production/productionApi';
import { templateLibraryApi } from '@/services/template/templateLibraryApi';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import type { Dayjs } from 'dayjs';
import './styles.css';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
import UniversalCardView from '@/components/common/UniversalCardView';
import OperationHistoryTable from '@/components/common/OperationHistoryTable';
import { buildHistoryRowsForList } from '@/utils/operationHistory';
import { useLocation, useNavigate } from 'react-router-dom';

import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { formatDateTime } from '@/utils/datetime';
import { useSync } from '@/utils/syncManager';
import { useViewport } from '@/utils/useViewport';
import { useModal } from '@/hooks';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import ProcessDetailModal from '@/components/production/ProcessDetailModal';
import { getProgressColorStatus } from '@/utils/progressColor';

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
  const { isMobile } = useViewport();
  const quickEditModal = useModal<ProductionOrder>();
  const logModal = useModal();

  // ===== 打印弹窗状态 =====
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [printingRecord, setPrintingRecord] = useState<ProductionOrder | null>(null);

  const [queryParams, setQueryParams] = useState<ProductionQueryParams>({
    page: 1,
    pageSize: 10
  });
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);

  const [sortField, setSortField] = useState<string>('createTime');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
  };

  // ===== loadOrderLogs 函数已删除（日志弹窗功能已移除）=====

  // 真实数据状态
  const [productionList, setProductionList] = useState<ProductionOrder[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [selectedRows, setSelectedRows] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');

  // 快速编辑和日志状态
  const [quickEditSaving, setQuickEditSaving] = useState(false);




  // 工序详情弹窗状态
  const [processDetailVisible, setProcessDetailVisible] = useState(false);
  const [processDetailRecord, setProcessDetailRecord] = useState<ProductionOrder | null>(null);
  const [processDetailType, setProcessDetailType] = useState<string>('');
  const [procurementStatus, setProcurementStatus] = useState<any>(null);
  const [processStatus, setProcessStatus] = useState<any>(null); // 所有工序节点状态
  const [processDetailActiveTab, setProcessDetailActiveTab] = useState<string>('process'); // 工序明细Tab: process=工序详情, delegation=工序委派
  const [processDetailScanRecords, setProcessDetailScanRecords] = useState<any[]>([]);
  const [processDetailNodeOperations, setProcessDetailNodeOperations] = useState<Record<string, any> | null>(null);

  // 工厂列表（用于工序委派）
  const [factories, setFactories] = useState<any[]>([]);
  const [factoriesLoading, setFactoriesLoading] = useState(false);

  // 工序委派数据（工厂ID、工序名称、数量和单价）
  const [delegationData, setDelegationData] = useState<Record<string, {
    factoryId?: string;
    processName?: string;
    quantity?: number;
    unitPrice?: number
  }>>({});

  const mainStages = useMemo(() => ([
    { key: 'procurement', name: '采购', keywords: ['采购', '物料', '备料'] },
    { key: 'cutting', name: '裁剪', keywords: ['裁剪', '裁床', '开裁'] },
    { key: 'carSewing', name: '车缝', keywords: ['车缝', '缝制', '缝纫', '车工', '生产'] },
    { key: 'secondaryProcess', name: '二次工艺', keywords: ['二次工艺', '二次', '工艺'] },
    { key: 'tailProcess', name: '尾部', keywords: ['尾部', '整烫', '包装', '质检', '后整', '剪线'] },
    { key: 'warehousing', name: '入库', keywords: ['入库', '仓库'] },
  ]), []);

  const matchStageKey = (progressStage: string, processName: string) => {
    const text = `${progressStage || ''} ${processName || ''}`;
    for (const stage of mainStages) {
      if (stage.keywords.some(kw => text.includes(kw))) {
        return stage.key;
      }
    }
    return 'tailProcess';
  };

  const workflowNodes = useMemo(() => {
    let nodes: any[] = [];
    try {
      if (processDetailRecord?.progressWorkflowJson) {
        const workflow = typeof processDetailRecord.progressWorkflowJson === 'string'
          ? JSON.parse(processDetailRecord.progressWorkflowJson)
          : processDetailRecord.progressWorkflowJson;

        const rawNodes = workflow?.nodes || [];
        if (rawNodes.length > 0 && rawNodes[0]?.name) {
          nodes = rawNodes.map((item: any, idx: number) => ({
            id: item.id || `proc_${idx}`,
            name: item.name || item.processName || '',
            progressStage: item.progressStage || '',
            unitPrice: Number(item.unitPrice) || 0,
            sortOrder: item.sortOrder ?? idx,
          }));
        } else {
          const processesByNode = workflow?.processesByNode || {};
          const allProcesses: any[] = [];
          let sortIdx = 0;
          for (const node of rawNodes) {
            const nodeId = node?.id || '';
            const nodeProcesses = processesByNode[nodeId] || [];
            for (const p of nodeProcesses) {
              allProcesses.push({
                id: p.id || `proc_${sortIdx}`,
                name: p.name || p.processName || '',
                progressStage: p.progressStage || node?.progressStage || node?.name || '',
                unitPrice: Number(p.unitPrice) || 0,
                sortOrder: sortIdx,
              });
              sortIdx++;
            }
          }
          nodes = allProcesses;
        }
      }

      if (nodes.length === 0 && Array.isArray(processDetailRecord?.progressNodeUnitPrices)) {
        nodes = processDetailRecord.progressNodeUnitPrices.map((item: any, idx: number) => ({
          id: item.id || item.processId || `node_${idx}`,
          name: item.name || item.processName || '',
          progressStage: item.progressStage || '',
          unitPrice: Number(item.unitPrice) || Number(item.price) || 0,
          sortOrder: item.sortOrder ?? idx,
        }));
      }
    } catch (e) {
      console.error('解析工序配置失败:', e);
    }
    return nodes;
  }, [processDetailRecord]);

  const childProcessesByStage = useMemo(() => {
    const map: Record<string, any[]> = {};
    mainStages.forEach(s => { map[s.key] = []; });
    workflowNodes.forEach((node) => {
      const stageKey = matchStageKey(String(node?.progressStage || ''), String(node?.name || ''));
      if (!map[stageKey]) {
        map[stageKey] = [];
      }
      map[stageKey].push(node);
    });
    return map;
  }, [workflowNodes, mainStages]);

  const stageKeyByType: Record<string, string> = {
    procurement: 'procurement',
    cutting: 'cutting',
    carSewing: 'carSewing',
    secondaryProcess: 'secondaryProcess',
    tailProcess: 'tailProcess',
    warehousing: 'warehousing',
  };

  const activeStageKeys = useMemo(() => {
    if (!processDetailType || processDetailType === 'all') {
      return mainStages.map(s => s.key);
    }
    const key = stageKeyByType[processDetailType] || processDetailType;
    return [key];
  }, [processDetailType, mainStages]);

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
        label: <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '0 4px' }}>选择要显示的列</div>,
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
            style={{ color: 'var(--primary-color)', textAlign: 'center', cursor: 'pointer' }}
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

  // ===== 订单详情弹窗相关代码已删除 =====
  // orderDetailLines, detailColors, detailSizes, detailQuantity 等已移除

  // ===== Procurements & Materials =====


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
      enabled: !loading && !quickEditModal.visible && !logModal.visible, // 加载中或弹窗打开时暂停同步
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
                  style={{ cursor: 'pointer', color: 'var(--primary-color)' }}
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

  // ===== scanTypeLabel 已删除（日志弹窗功能已移除）=====

  // 打开工序详情弹窗
  const openProcessDetail = async (record: ProductionOrder, type: string) => {
    setProcessDetailRecord(record);
    setProcessDetailType(type);
    setProcessDetailVisible(true);
    setProcessDetailActiveTab('process'); // 默认打开工序详情Tab

    // 获取工厂列表（用于工序委派）
    fetchFactories();

    // 获取所有工序节点状态（裁剪、车缝、尾部、入库等）
    try {
      const res = await api.get(`/production/order/process-status/${record.id}`);
      if (res.code === 200 && res.data) {
        setProcessStatus(res.data);
        // console.log('[工序状态] 获取成功:', res.data);
      }
    } catch (error) {
      console.error('[工序状态] 获取失败:', error);
      setProcessStatus(null);
    }

    // 如果是采购类型，获取采购完成状态
    if (type === 'procurement' || type === 'all') {
      try {
        const res = await api.get(`/production/order/procurement-status/${record.id}`);
        if (res.code === 200 && res.data) {
          setProcurementStatus(res.data);
          // console.log('[采购状态] 获取成功:', res.data);
        }
      } catch (error) {
        console.error('[采购状态] 获取失败:', error);
        setProcurementStatus(null);
      }
    }

    // 获取扫码记录
    try {
      const res = await productionScanApi.listByOrderId(record.id, { page: 1, pageSize: 1000 });
      if (res.code === 200 && Array.isArray(res.data)) {
        setProcessDetailScanRecords(res.data);
      } else {
        setProcessDetailScanRecords([]);
      }
    } catch (error) {
      console.error('[扫码记录] 获取失败:', error);
      setProcessDetailScanRecords([]);
    }

    // 获取委派记录（nodeOperations）
    try {
      const res = await productionOrderApi.getNodeOperations(record.id);
      if (res.code === 200 && res.data) {
        const raw = res.data;
        const parsed = typeof raw === 'string' ? (() => {
          try {
            return JSON.parse(raw);
          } catch {
            return {};
          }
        })() : raw;
        setProcessDetailNodeOperations(parsed || {});
      } else {
        setProcessDetailNodeOperations(null);
      }
    } catch (error) {
      console.error('[委派记录] 获取失败:', error);
      setProcessDetailNodeOperations(null);
    }
  };

  // 获取工厂列表
  const fetchFactories = async () => {
    setFactoriesLoading(true);
    try {
      const res = await api.get('/system/factory/list', {
        params: { page: 1, pageSize: 999, status: 'active' }
      });
      if (res.code === 200 && res.data?.records) {
        setFactories(res.data.records);
        // console.log('[工厂列表] 获取成功:', res.data.records.length, '个工厂');
      }
    } catch (error) {
      console.error('[工厂列表] 获取失败:', error);
      setFactories([]);
    } finally {
      setFactoriesLoading(false);
    }
  };

  // 保存工序委派
  const saveDelegation = async (nodeKey: string, orderId: string) => {
    const data = delegationData[nodeKey];
    if (!data?.factoryId) {
      message.warning('请选择委派工厂');
      return;
    }

    try {
      await api.post('/production/order/delegate-process', {
        orderId,
        processNode: nodeKey,
        factoryId: data.factoryId,
        unitPrice: data.unitPrice || 0
      });
      message.success('工序委派保存成功');

      // 刷新工序状态
      if (processDetailRecord) {
        openProcessDetail(processDetailRecord, 'all');
      }
    } catch (error: any) {
      console.error('[工序委派] 保存失败:', error);
      message.error(error.message || '保存失败');
    }
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

      // console.log('[同步工序] 新的工序数据:', allProcesses.map(p => `${p.name}(${p.progressStage}): ¥${p.unitPrice}`));

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
          onlyActive
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
            <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', minWidth: '40px' }}>
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
            <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', minWidth: '40px' }}>
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
            <span style={{ color: 'var(--neutral-text-disabled)', fontSize: '12px' }}>-</span>
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
            <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', minWidth: '40px' }}>
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
            <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', minWidth: '40px' }}>
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
            <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', minWidth: '40px' }}>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--neutral-text)' }}>
                {qualified}/{total}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--neutral-text-disabled)' }}>
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
              label: <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '0 4px' }}>显示列</div>,
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
              label: <div style={{ fontWeight: 600, color: 'var(--neutral-text-secondary)', padding: '0 4px' }}>工序汇总</div>,
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
                key: 'print',
                label: '',
                title: '打印生产制单',
                icon: <PrinterOutlined />,
                onClick: () => {
                  setPrintingRecord(record);
                  setPrintModalVisible(true);
                },
                iconOnly: true,
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
                key: 'close',
                label: <span style={{ color: frozen ? undefined : 'var(--primary-color)' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
                icon: <CheckCircleOutlined style={{ color: frozen ? undefined : 'var(--primary-color)' }} />,
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
                      <SettingOutlined style={{ fontSize: "var(--font-size-base)" }} />
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
          </div>

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={queryParams.orderNo || ''}
                  onSearchChange={(value) => setQueryParams({ ...queryParams, orderNo: value, page: 1 })}
                  searchPlaceholder="搜索订单号/款号/加工厂"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={queryParams.status || ''}
                  onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  statusOptions={[
                    { label: '待生产', value: 'pending' },
                    { label: '生产中', value: 'production' },
                    { label: '已完成', value: 'completed' },
                    { label: '已逾期', value: 'delayed' },
                  ]}
                />
              )}
              right={(
                <>
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
                  <Button icon={<DownloadOutlined />} onClick={exportSelected} disabled={!selectedRowKeys.length}>
                    导出
                  </Button>
                </>
              )}
            />
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
                showTotal: (total) => `共 ${total} 条`,
                showSizeChanger: true,
                pageSizeOptions: ['10', '20', '50', '100'],
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
                {
                  label: '下单日期',
                  key: 'createTime',
                  render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
                {
                  label: '订单交期',
                  key: 'plannedEndDate',
                  render: (val: unknown) => {
                    return val ? dayjs(val as string).format('YYYY-MM-DD') : '-';
                  }
                },
              ]}
              progressConfig={{
                calculate: (record: ProductionOrder) => {
                  const progress = Number(record.productionProgress) || 0;
                  return Math.min(100, Math.max(0, progress));
                },
                getStatus: (record: ProductionOrder) => getProgressColorStatus(record.plannedEndDate),
                isCompleted: (record: ProductionOrder) => record.status === 'completed',
                show: true,
                type: 'liquid',
              }}
              actions={(record: ProductionOrder) => [
                {
                  key: 'print',
                  icon: <PrinterOutlined />,
                  label: '打印',
                  onClick: () => {
                    setPrintingRecord(record);
                    setPrintModalVisible(true);
                  },
                },
                {
                  key: 'close',
                  icon: <CloseCircleOutlined />,
                  label: '关单',
                  onClick: () => {
                    handleCloseOrder(record);
                  },
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
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

        {/* 订单详情查看弹窗已删除 - 改为直接打印 */}

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
        <ProcessDetailModal
          visible={processDetailVisible}
          onClose={() => {
            setProcessDetailVisible(false);
            setProcessDetailRecord(null);
            setProcessDetailType('');
            setProcurementStatus(null);
            setProcessStatus(null);
            setProcessDetailActiveTab('process');
            setProcessDetailScanRecords([]);
            setProcessDetailNodeOperations(null);
          }}
          record={processDetailRecord}
          processType={processDetailType}
          procurementStatus={procurementStatus}
          processStatus={processStatus}
          activeTab={processDetailActiveTab}
          onTabChange={setProcessDetailActiveTab}
          delegationContent={processDetailRecord && (
            <div style={{ padding: '8px 0' }}>
              {/* 说明文字 - 精简版 */}
              <Alert
                message="可以为不同的生产节点指定执行工厂"
                type="info"
                showIcon
                closable
                style={{ marginBottom: '12px', padding: '6px 12px', fontSize: '12px' }}
              />

              {/* 工序节点委派表格 */}
              <div style={{
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                overflow: 'hidden'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      <th colSpan={7} style={{
                        padding: '8px 12px',
                        textAlign: 'left',
                        fontSize: '12px',
                        color: 'var(--neutral-text-secondary)',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>订单：</span>
                        <span style={{ marginRight: '16px' }}>{processDetailRecord?.orderNo || '-'}</span>
                        <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>款号：</span>
                        <span style={{ marginRight: '16px' }}>{processDetailRecord?.styleNo || '-'}</span>
                        <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>数量：</span>
                        <span>{processDetailRecord?.orderQuantity || 0} 件</span>
                      </th>
                    </tr>
                    <tr style={{ background: '#f9fafb' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '90px' }}>
                        生产节点
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '90px' }}>
                        当前状态
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '140px' }}>
                        工序名称
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '90px' }}>
                        数量
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600 }}>
                        执行工厂
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '110px' }}>
                        委派单价
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '90px' }}>
                        委派人
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '110px' }}>
                        委派时间
                      </th>
                      <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: '13px', color: 'var(--neutral-text)', fontWeight: 600, width: '90px' }}>
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const stageColorMap: Record<string, string> = {
                        procurement: '#1e40af',
                        cutting: '#92400e',
                        carSewing: '#065f46',
                        secondaryProcess: '#5b21b6',
                        tailProcess: '#9d174d',
                        warehousing: '#374151',
                      };

                      const stageStatusMap: Record<string, any> = {
                        cutting: processStatus?.cutting,
                        carSewing: processStatus?.sewing,
                        tailProcess: processStatus?.finishing,
                        warehousing: processStatus?.warehousing,
                      };

                      const stagesToShow = mainStages.filter(s => activeStageKeys.includes(s.key));

                      return stagesToShow.map((node) => (
                        <tr key={node.key} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '6px 12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: node.color }}>
                              {node.name}
                            </span>
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            {stageStatusMap[node.key] && (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: stageStatusMap[node.key].completed ? 'var(--success-color)' : 'var(--warning-color)',
                                background: stageStatusMap[node.key].completed ? '#d1fae5' : '#fef3c7',
                                padding: '2px 6px',
                                borderRadius: '3px',
                                whiteSpace: 'nowrap'
                              }}>
                                {stageStatusMap[node.key].completed ? '✓ 完成' : `${stageStatusMap[node.key].completionRate}%`}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <Select
                              placeholder="选择工序"
                              size="small"
                              style={{ width: '100%', minWidth: '120px' }}
                              allowClear
                              showSearch
                              optionFilterProp="children"
                              value={delegationData[node.key]?.processName}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [node.key]: { ...prev[node.key], processName: value }
                                }));
                              }}
                              disabled={childProcessesByStage[node.key]?.length === 0}
                            >
                              {(childProcessesByStage[node.key] || []).map((proc, idx) => (
                                <Select.Option key={idx} value={proc.name}>
                                  {proc.name} (¥{proc.unitPrice.toFixed(2)})
                                </Select.Option>
                              ))}
                            </Select>
                          </td>
                          <td style={{ padding: '6px 12px', textAlign: 'right' }}>
                            <InputNumber
                              placeholder="数量"
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '85px' }}
                              value={delegationData[node.key]?.quantity}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [node.key]: { ...prev[node.key], quantity: value || undefined }
                                }));
                              }}
                            />
                          </td>
                          <td style={{ padding: '6px 12px' }}>
                            <Select
                              placeholder="选择工厂"
                              size="small"
                              style={{ width: '100%', maxWidth: '220px' }}
                              loading={factoriesLoading}
                              allowClear
                              showSearch
                              optionFilterProp="children"
                              value={delegationData[node.key]?.factoryId}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [node.key]: { ...prev[node.key], factoryId: value }
                                }));
                              }}
                            >
                              {factories.map((f) => (
                                <Select.Option key={f.id} value={f.id}>
                                  {f.factoryName}
                                </Select.Option>
                              ))}
                            </Select>
                          </td>
                        <td style={{ padding: '6px 12px' }}>
                          <InputNumber
                            placeholder="单价"
                            size="small"
                            min={0}
                            step={0.01}
                            precision={2}
                            prefix="¥"
                            style={{ width: '100px' }}
                            value={delegationData[node.key]?.unitPrice}
                            onChange={(value) => {
                              setDelegationData(prev => ({
                                ...prev,
                                [node.key]: { ...prev[node.key], unitPrice: value || undefined }
                              }));
                            }}
                          />
                        </td>
                        <td style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--neutral-text)' }}>
                          {stageStatusMap[node.key]?.operatorName ? (
                            <a
                              style={{ cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 500 }}
                              onClick={() => {
                                if (processDetailRecord?.orderNo) {
                                  navigate(`/finance/payroll-operator-summary?orderNo=${processDetailRecord.orderNo}&processName=${node.name}`);
                                }
                              }}
                            >
                              {stageStatusMap[node.key].operatorName}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 12px', fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>
                          {stageStatusMap[node.key]?.completedTime ? (
                            new Date(stageStatusMap[node.key].completedTime).toLocaleString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                          ) : (
                            <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                          )}
                        </td>
                        <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                          <Button
                            type="primary"
                            size="small"
                            onClick={() => processDetailRecord && saveDelegation(node.key, processDetailRecord.id)}
                          >
                            保存
                          </Button>
                        </td>
                      </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>

              {/* 委派历史记录 */}
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--neutral-text)',
                  marginBottom: '8px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid #e5e7eb'
                }}>
                  委派历史
                </div>
                <div style={{ color: 'var(--neutral-text-disabled)', fontSize: '12px', padding: '16px', textAlign: 'center' }}>
                  暂无委派记录
                </div>
              </div>
            </div>
          )}
          scanRecordContent={processDetailRecord && (
            <div style={{ padding: '8px 0' }}>
              <div style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--neutral-text)',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                操作历史（扫码/委派/同步）
              </div>
              <OperationHistoryTable rows={buildHistoryRowsForList({
                records: Array.isArray(processDetailScanRecords) ? processDetailScanRecords : [],
                activeStageKeys,
                childProcessesByStage,
                nodeOperations: processDetailNodeOperations as Record<string, any> | null,
                formatDateTime,
                matchStageKey,
              })} />
            </div>
          )}
        />


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
