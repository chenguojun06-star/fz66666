import React, { useState, useEffect, useMemo } from 'react';
import { Button, Card, Input, Select, Tag, App, Dropdown, Checkbox, Alert, InputNumber, Table, Modal } from 'antd';
import { SettingOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import PageStatCards from '@/components/common/PageStatCards';
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
import '../../../styles.css';
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
  const [showDelayedOnly, setShowDelayedOnly] = useState(false); // 是否只显示延期订单
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'delayed' | 'today'>('all'); // 当前激活的统计卡片筛选

  // 全局统计数据（从API获取，不受分页影响）
  const [globalStats, setGlobalStats] = useState<{
    totalOrders: number;
    totalQuantity: number;
    delayedOrders: number;
    delayedQuantity: number;
    todayOrders: number;
    todayQuantity: number;
  }>({ totalOrders: 0, totalQuantity: 0, delayedOrders: 0, delayedQuantity: 0, todayOrders: 0, todayQuantity: 0 });

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

  // ===== 转单弹窗状态 =====
  const [transferModalVisible, setTransferModalVisible] = useState(false);
  const [transferRecord, setTransferRecord] = useState<ProductionOrder | null>(null);
  const [transferUserId, setTransferUserId] = useState<string | undefined>(undefined);
  const [transferMessage, setTransferMessage] = useState('');
  const [transferUsers, setTransferUsers] = useState<{ id: string; name: string; username: string }[]>([]);
  const [transferSearching, setTransferSearching] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  // 转单 - 菲号与工序选择
  const [transferBundles, setTransferBundles] = useState<any[]>([]);
  const [transferBundlesLoading, setTransferBundlesLoading] = useState(false);
  const [transferSelectedBundleIds, setTransferSelectedBundleIds] = useState<string[]>([]);
  const [transferProcesses, setTransferProcesses] = useState<any[]>([]);
  const [transferProcessesLoading, setTransferProcessesLoading] = useState(false);
  const [transferSelectedProcessCodes, setTransferSelectedProcessCodes] = useState<string[]>([]);

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
    category: false,           // 品类
    companyName: false,        // 公司
    attachments: true,         // 附件
    factoryName: true,         // 加工厂
    merchandiser: false,       // 跟单员
    patternMaker: false,       // 版师
    orderQuantity: true,       // 订单数量
    orderOperatorName: true,   // 下单人
    createTime: false,         // 下单时间
    remarks: false,            // 备注
    expectedShipDate: true,    // 预计出货
    procurementSummary: true,  // 采购进度
    cuttingSummary: true,      // 裁剪进度
    secondaryProcessSummary: true, // 二次工艺进度
    carSewingSummary: true,    // 车缝进度
    tailProcessSummary: true,  // 尾部进度
    cuttingQuantity: false,    // 裁剪数量
    cuttingBundleCount: false, // 扎数
    completedQuantity: false,  // 完成数量
    warehousingQualifiedQuantity: true,  // 入库
    unqualifiedQuantity: false, // 次品数
    repairQuantity: false,     // 返修数
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

  // 列设置选项配置（与 allColumns 中的 key 一一对应）
  const columnOptions = [
    { key: 'styleCover', label: '图片' },
    { key: 'styleNo', label: '款号' },
    { key: 'styleName', label: '款名' },
    { key: 'category', label: '品类' },
    { key: 'companyName', label: '公司' },
    { key: 'attachments', label: '附件' },
    { key: 'factoryName', label: '加工厂' },
    { key: 'merchandiser', label: '跟单员' },
    { key: 'patternMaker', label: '版师' },
    { key: 'orderQuantity', label: '订单数量' },
    { key: 'orderOperatorName', label: '下单人' },
    { key: 'createTime', label: '下单时间' },
    { key: 'remarks', label: '备注' },
    { key: 'expectedShipDate', label: '预计出货' },
    { key: 'procurementSummary', label: '采购进度' },
    { key: 'cuttingSummary', label: '裁剪进度' },
    { key: 'secondaryProcessSummary', label: '二次工艺' },
    { key: 'carSewingSummary', label: '车缝进度' },
    { key: 'tailProcessSummary', label: '尾部进度' },
    { key: 'cuttingQuantity', label: '裁剪数量' },
    { key: 'cuttingBundleCount', label: '扎数' },
    { key: 'completedQuantity', label: '完成数量' },
    { key: 'warehousingQualifiedQuantity', label: '入库' },
    { key: 'unqualifiedQuantity', label: '次品数' },
    { key: 'repairQuantity', label: '返修数' },
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
            ? String((response as any).message) || '获取生产订单列表失败'
            : '获取生产订单列表失败'
        );
      }
    } catch (error) {
      message.error('获取生产订单列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取全局统计数据（根据当前筛选条件）
  const fetchGlobalStats = async (params?: typeof queryParams) => {
    try {
      // 只传递筛选参数，不传分页参数
      const filterParams = params ? {
        keyword: params.keyword,
        factoryName: params.factoryName,
        status: params.status,
        orderNo: params.orderNo,
        styleNo: params.styleNo,
      } : {};

      const response = await api.get<{
        totalOrders: number;
        totalQuantity: number;
        delayedOrders: number;
        delayedQuantity: number;
        todayOrders: number;
        todayQuantity: number;
      }>('/production/order/stats', { params: filterParams });
      if (isApiSuccess(response)) {
        setGlobalStats(response.data);
      }
    } catch (error) {
      console.error('获取全局统计数据失败', error);
    }
  };

  // 页面加载时获取生产订单列表
  useEffect(() => {
    setSelectedRowKeys([]);
    setSelectedRows([]);
    fetchProductionList();
  }, [queryParams]);

  // 筛选条件变化时更新统计数据
  useEffect(() => {
    fetchGlobalStats(queryParams);
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

        // 可选：显示提示（不打扰用户的情况下）
        // message.info('订单数据已自动更新', 1);
      }
    },
    {
      interval: 30000, // 30秒轮询
      enabled: !loading && !quickEditModal.visible, // 加载中或弹窗打开时暂停同步
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
        keyword: orderNo || prev.keyword,  // URL参数orderNo映射到keyword进行模糊搜索
      }));
    }
  }, [location.search]);

  // 获取状态文本和标签颜色
  const getStatusConfig = (status: ProductionOrder['status'] | string | undefined | null) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      pending: { text: '待生产', color: 'default' },
      production: { text: '生产中', color: 'success' },
      completed: { text: '已完成', color: 'default' },
      delayed: { text: '已延期', color: 'warning' },
      cancelled: { text: '已取消', color: 'default' },
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
    const orderId = safeString((order as any)?.id, '');
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

    modal.confirm({
      title: `确认关单：${safeString((order as any)?.orderNo)}`,
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
            ? String((result as any).message) || '关单失败'
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
    const orderId = safeString((order as any)?.id, '');
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
      title: `确认报废：${safeString((order as any)?.orderNo)}`,
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
            ? String((result as any).message) || '报废失败'
            : '报废失败';
          throw new Error(msg);
        }
        message.success('报废成功');
        fetchProductionList();
      },
    });
  };

  // ===== 转单功能 =====
  const searchTransferUsers = async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setTransferUsers([]);
      return;
    }
    setTransferSearching(true);
    try {
      const result = await api.get('/production/order/transfer/search-users', {
        params: { keyword }
      }) as any;
      if (result?.code === 200 && Array.isArray(result.data)) {
        setTransferUsers(result.data.map((u: any) => ({
          id: String(u.id),
          name: u.name || u.realName || u.username,
          username: u.username || '',
        })));
      }
    } catch {
      // ignore
    } finally {
      setTransferSearching(false);
    }
  };

  const handleTransferOrder = (order: ProductionOrder) => {
    setTransferRecord(order);
    setTransferUserId(undefined);
    setTransferMessage('');
    setTransferUsers([]);
    setTransferSelectedBundleIds([]);
    setTransferSelectedProcessCodes([]);
    setTransferBundles([]);
    setTransferProcesses([]);
    setTransferModalVisible(true);

    // 加载菲号列表（从裁剪菲号表获取）
    setTransferBundlesLoading(true);
    api.post('/production/cutting/list', {
      orderId: (order as any).id,
      page: 1,
      pageSize: 999
    })
      .then((res: any) => {
        const records = res?.data?.records || res?.records || res?.data || [];
        setTransferBundles(records);
      })
      .catch((err) => {
        console.error('[转单] 加载菲号失败:', err);
        setTransferBundles([]);
      })
      .finally(() => setTransferBundlesLoading(false));

    // 加载工序列表（优先使用订单的工序配置，包含单价）
    const orderProcesses = (order as any).progressNodeUnitPrices || [];
    if (Array.isArray(orderProcesses) && orderProcesses.length > 0) {
      // 使用订单已配置的工序和单价
      const processes = orderProcesses.map((p: any) => ({
        processCode: p.processCode || p.code || p.id,
        processName: p.name || p.processName || '',
        unitPrice: Number(p.unitPrice || p.price || 0),
        progressStage: p.progressStage || p.stage || '',
      }));
      setTransferProcesses(processes);
    } else {
      // 兜底：从款式工序列表获取（可能没有单价）
      if ((order as any).styleId) {
        setTransferProcessesLoading(true);
        api.get('/style/process/list', { params: { styleId: (order as any).styleId } })
          .then((res: any) => {
            const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
            const processes = list.map((p: any) => ({
              processCode: p.processCode || p.code || p.id,
              processName: p.processName || p.name || '',
              unitPrice: Number(p.unitPrice || p.price || 0),
              progressStage: p.progressStage || p.stage || '',
            }));
            setTransferProcesses(processes);
          })
          .catch(() => setTransferProcesses([]))
          .finally(() => setTransferProcessesLoading(false));
      }
    }
  };

  const submitTransfer = async () => {
    if (!transferUserId) {
      message.warning('请选择转单目标人员');
      return;
    }
    if (!transferRecord) return;
    setTransferSubmitting(true);
    try {
      const result = await api.post('/production/order/transfer/create', {
        orderId: (transferRecord as any).id,
        toUserId: transferUserId,
        message: transferMessage.trim() || '',
        bundleIds: transferSelectedBundleIds.length > 0 ? transferSelectedBundleIds.join(',') : null,
        processCodes: transferSelectedProcessCodes.length > 0 ? transferSelectedProcessCodes.join(',') : null,
      }) as any;
      if (result?.code === 200) {
        message.success('转单申请已发送');
        setTransferModalVisible(false);
        setTransferRecord(null);
      } else {
        message.error(result?.message || '转单失败');
      }
    } catch (error: any) {
      message.error(error?.message || '转单失败');
    } finally {
      setTransferSubmitting(false);
    }
  };

  // 表格列定义
  const renderStageTime = (value: unknown) => {
    return value ? formatDateTime(value) : '-';
  };

  const renderStageText = (value: unknown) => {
    return safeString(value);
  };

  // const renderStageRate = (value: unknown) => {
  //   if (value === null || value === undefined || String(value).trim() === '') return '-';
  //   const n = Number(value);
  //   return Number.isFinite(n) ? `${n}%` : '-';
  // };

  // 添加排序逻辑
  const sortedProductionList = useMemo(() => {
    let filtered = [...productionList];

    // 排序
    filtered.sort((a: any, b: any) => {
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
    return filtered;
  }, [productionList, sortField, sortOrder, showDelayedOnly, activeStatFilter]);



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
        const styleNo = safeString((record as any)?.styleNo, '');
        const orderId = safeString((record as any)?.id, '');
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
      title: <SortableColumnTitle title="预计出货" sortField={sortField} fieldName="expectedShipDate" sortOrder={sortOrder} onSort={handleSort} />,
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      width: 120,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '采购',
      dataIndex: 'procurementCompletionRate',
      key: 'procurementSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = record.orderQuantity || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const colorStatus = getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'procurement');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-container)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-base)';
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={16}
              status={colorStatus}
            />
          </div>
        );
      },
    },
    {
      title: '裁剪',
      dataIndex: 'cuttingCompletionRate',
      key: 'cuttingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = record.orderQuantity || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const colorStatus = getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'cutting');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-base)';
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={16}
              status={colorStatus}
            />
          </div>
        );
      },
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessRate',
      key: 'secondaryProcessSummary',
      width: 90,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        // 检测当前订单是否有二次工艺数据（扫码记录或工序配置）
        const hasSecondaryProcessData = (() => {
          // 方式1: 检查是否有扫码记录生成的时间数据
          if ((record as any).secondaryProcessStartTime || (record as any).secondaryProcessEndTime) {
            return true;
          }

          // 方式2: 检查工序配置中是否有二次工艺
          const nodes = record.progressNodeUnitPrices;
          if (!Array.isArray(nodes) || nodes.length === 0) return false;
          return nodes.some((n: any) => {
            const name = String(n.name || n.processName || '').trim();
            return name.includes('二次工艺') || name.includes('二次') || (name.includes('工艺') && !name.includes('车'));
          });
        })();

        // 没有二次工艺数据：显示灰色占位，不可点击
        if (!hasSecondaryProcessData) {
          return (
            <div style={{ padding: '4px', opacity: 0.4 }}>
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginBottom: '2px', textAlign: 'center' }}>-</div>
              <div
                style={{
                  width: '100%',
                  height: '16px',
                  background: 'var(--color-border)',
                  borderRadius: '8px'
                }}
              />
            </div>
          );
        }

        // 有二次工艺数据：显示彩色进度条，可点击查看详情
        const total = record.orderQuantity || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const colorStatus = getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'secondaryProcess');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-base)';
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={16}
              status={colorStatus}
            />
          </div>
        );
      },
    },
    {
      title: '车缝',
      dataIndex: 'carSewingCompletionRate',
      key: 'carSewingSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = record.orderQuantity || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const colorStatus = getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'carSewing');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-base)';
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={16}
              status={colorStatus}
            />
          </div>
        );
      },
    },
    {
      title: '尾部',
      dataIndex: 'tailProcessRate',
      key: 'tailProcessSummary',
      width: 110,
      align: 'center' as const,
      render: (rate: number, record: ProductionOrder) => {
        const total = record.orderQuantity || 0;
        const completed = Math.round((rate || 0) * total / 100);
        const colorStatus = getProgressColorStatus(record.plannedEndDate);

        return (
          <div
            style={{
              cursor: 'pointer',
              padding: '4px',
              transition: 'background 0.2s'
            }}
            onClick={(e) => {
              e.stopPropagation();
              openProcessDetail(record, 'tailProcess');
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-subtle)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-base)';
            }}
          >
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '2px', textAlign: 'center' }}>
              {completed}/{total}
            </div>
            <LiquidProgressBar
              percent={rate || 0}
              width="100%"
              height={16}
              status={colorStatus}
            />
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
          if (rate === 100) return 'var(--color-success)'; // 绿色
          if (rate > 0) return 'var(--color-primary)'; // 蓝色
          return 'var(--color-border)'; // 灰色
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
                  stroke="var(--color-bg-subtle)"
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
      width: 140,
      render: (_: any, record: ProductionOrder) => {
        const frozen = isOrderFrozenByStatusOrStock(record);
        const completed = isOrderFrozenByStatus(record);

        return (
          <RowActions
            className="table-actions"
            maxInline={1}
            actions={[
              {
                key: 'print',
                label: '打印',
                title: frozen ? '打印（订单已关单）' : '打印生产制单',
                disabled: frozen,
                onClick: () => {
                  setPrintingRecord(record);
                  setPrintModalVisible(true);
                },
              },
              {
                key: 'process',
                label: '工序',
                title: frozen ? '工序（订单已关单）' : '查看工序详情',
                disabled: frozen,
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
                title: frozen ? '编辑（订单已关单）' : '快速编辑备注和预计出货',
                disabled: frozen,
                onClick: () => {
                  quickEditModal.open(record);
                },
              },
              {
                key: 'close',
                label: <span style={{ color: frozen ? undefined : 'var(--primary-color)' }}>{frozen ? '关单(已完成)' : '关单'}</span>,
                disabled: frozen,
                onClick: () => handleCloseOrder(record),
              },
              ...(isSupervisorOrAbove
                ? [
                  {
                    key: 'scrap',
                    label: completed ? '报废(已完成)' : '报废',
                    danger: true,
                    disabled: completed,
                    onClick: () => handleScrapOrder(record),
                  },
                ]
                : []),
              {
                key: 'transfer',
                label: '转单',
                title: frozen ? '转单（订单已关单）' : '转给其他人员处理',
                disabled: frozen,
                onClick: () => handleTransferOrder(record),
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

  // 统计数据现在从 globalStats（API获取）获取，不再从 productionList 计算
  // 保留 useMemo 用于点击延期订单筛选时的本地过滤逻辑
  // const localDelayedList = useMemo(() => {
  //   return productionList.filter(order => {
  //     const status = getProgressColorStatus(order.plannedEndDate);
  //     return status === 'danger' && !isOrderFrozenByStatus(order); // 延期订单（排除已关单）
  //   });
  // }, [productionList]);

  // 点击统计卡片筛选
  const handleStatClick = (type: 'all' | 'delayed' | 'today') => {
    setActiveStatFilter(type);
    if (type === 'all') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: undefined, page: 1 } as any);
    } else if (type === 'delayed') {
      setShowDelayedOnly(true);
      setQueryParams({ ...queryParams, status: '', delayedOnly: 'true', todayOnly: undefined, page: 1 } as any);
    } else if (type === 'today') {
      setShowDelayedOnly(false);
      setQueryParams({ ...queryParams, status: '', delayedOnly: undefined, todayOnly: 'true', page: 1 } as any);
    }
  };

  return (
    <Layout>
      <div className="production-list-page">
        <Card className="page-card">
          {/* 页面标题和操作区 */}
          <div className="page-header">
            <h2 className="page-title">我的订单</h2>
          </div>

          {/* 数据概览卡片 - 使用全局统计数据（不受分页影响，不受列设置控制） */}
          <PageStatCards
            activeKey={activeStatFilter}
            cards={[
              {
                key: 'all',
                items: [
                  { label: '订单个数', value: globalStats.totalOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '总数量', value: globalStats.totalQuantity, unit: '件', color: 'var(--color-success)' },
                ],
                onClick: () => handleStatClick('all'),
                activeColor: 'var(--color-primary)',
                activeBg: 'rgba(45, 127, 249, 0.1)',
              },
              {
                key: 'delayed',
                items: [
                  { label: '延期订单', value: globalStats.delayedOrders, unit: '个', color: 'var(--color-danger)' },
                  { label: '延期数量', value: globalStats.delayedQuantity, unit: '件', color: 'var(--color-danger)' },
                ],
                onClick: () => handleStatClick('delayed'),
                activeColor: 'var(--color-danger)',
                activeBg: 'rgba(239, 68, 68, 0.1)',
              },
              {
                key: 'today',
                items: [
                  { label: '今日订单', value: globalStats.todayOrders, unit: '个', color: 'var(--color-primary)' },
                  { label: '今日数量', value: globalStats.todayQuantity, unit: '件', color: 'var(--color-primary-light)' },
                ],
                onClick: () => handleStatClick('today'),
                activeColor: 'var(--color-primary)',
                activeBg: 'rgba(45, 127, 249, 0.1)',
              },
            ]}
          />

          {/* 筛选区 */}
          <Card size="small" className="filter-card mb-sm">
            <StandardToolbar
              left={(
                <StandardSearchBar
                  searchValue={queryParams.keyword || ''}
                  onSearchChange={(value) => setQueryParams({ ...queryParams, keyword: value, page: 1 })}
                  searchPlaceholder="搜索订单号/款号/加工厂"
                  dateValue={dateRange}
                  onDateChange={setDateRange}
                  statusValue={queryParams.status || ''}
                  onStatusChange={(value) => setQueryParams({ ...queryParams, status: value, page: 1 })}
                  statusOptions={[
                    { label: '全部', value: '' },
                    { label: '待生产', value: 'pending' },
                    { label: '生产中', value: 'production' },
                    { label: '已完成', value: 'completed' },
                    { label: '已延期', value: 'delayed' },
                    { label: '已取消', value: 'cancelled' },
                  ]}
                />
              )}

              right={(
                <>
                  <Button
                    onClick={() => fetchProductionList()}
                  >
                    刷新
                  </Button>
                  <Dropdown
                    menu={{
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
                    }}
                    trigger={['click']}
                    placement="bottomRight"
                  >
                    <Button icon={<SettingOutlined />}>列设置</Button>
                  </Dropdown>
                  <Button
                    icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
                    onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
                  >
                    {viewMode === 'list' ? '卡片视图' : '列表视图'}
                  </Button>
                  <Button onClick={exportSelected} disabled={!selectedRowKeys.length}>
                    导出
                  </Button>
                </>
              )}
            />
          </Card>

          {/* 表格/卡片区 */}
          {viewMode === 'list' ? (
            <ResizableTable<any>
              storageKey="production-order-table"
              columns={columns as any}
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
                  label: '打印',
                  onClick: () => {
                    setPrintingRecord(record);
                    setPrintModalVisible(true);
                  },
                },
                {
                  key: 'close',
                  label: '关单',
                  onClick: () => {
                    handleCloseOrder(record);
                  },
                },
                {
                  key: 'divider1',
                  type: 'divider' as const,
                  label: '',
                },
                {
                  key: 'edit',
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
            remarks: (quickEditModal.data as any)?.remarks,
            expectedShipDate: (quickEditModal.data as any)?.expectedShipDate,
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
                title="可以为不同的生产节点指定执行工厂"
                type="info"
                showIcon
                closable
                style={{ marginBottom: '12px', padding: '6px 12px', fontSize: '12px' }}
              />

              {/* 工序节点委派表格 */}
              {(() => {
                // const stageColorMap: Record<string, string> = {
                //   procurement: '#1e40af',
                //   cutting: '#92400e',
                //   carSewing: '#065f46',
                //   secondaryProcess: '#5b21b6',
                //   tailProcess: '#9d174d',
                //   warehousing: '#374151',
                // };

                const stageStatusMap: Record<string, any> = {
                  cutting: processStatus?.cutting,
                  carSewing: processStatus?.sewing,
                  tailProcess: processStatus?.finishing,
                  warehousing: processStatus?.warehousing,
                };

                const stagesToShow = mainStages.filter(s => activeStageKeys.includes(s.key));

                return (
                  <div style={{ border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                    <div style={{
                      background: 'var(--color-bg-subtle)',
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: 'var(--neutral-text-secondary)',
                      borderBottom: '1px solid var(--color-border)'
                    }}>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>订单：</span>
                      <span style={{ marginRight: '16px' }}>{processDetailRecord?.orderNo || '-'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>款号：</span>
                      <span style={{ marginRight: '16px' }}>{processDetailRecord?.styleNo || '-'}</span>
                      <span style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>数量：</span>
                      <span>{processDetailRecord?.orderQuantity || 0} 件</span>
                    </div>
                    <Table
                      dataSource={stagesToShow}
                      columns={[
                        {
                          title: '生产节点',
                          dataIndex: 'name',
                          width: 90,
                          render: (text: string, record) => (
                            <span style={{ fontSize: '13px', fontWeight: 600, color: (record as any).color }}>
                              {text}
                            </span>
                          ),
                        },
                        {
                          title: '当前状态',
                          key: 'status',
                          width: 90,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status ? (
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: status.completed ? 'var(--success-color)' : 'var(--warning-color)',
                                background: status.completed ? '#d1fae5' : '#fef3c7',
                                padding: '2px 6px',
                                whiteSpace: 'nowrap'
                              }}>
                                {status.completed ? '✓ 完成' : `${status.completionRate}%`}
                              </span>
                            ) : null;
                          },
                        },
                        {
                          title: '工序名称',
                          key: 'processName',
                          width: 140,
                          render: (_, record) => (
                            <Select
                              placeholder="选择工序"
                              size="small"
                              style={{ width: '100%', minWidth: '120px' }}
                              allowClear
                              showSearch
                              optionFilterProp="children"
                              value={delegationData[record.key]?.processName}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [record.key]: { ...prev[record.key], processName: value }
                                }));
                              }}
                              disabled={childProcessesByStage[record.key]?.length === 0}
                            >
                              {(childProcessesByStage[record.key] || []).map((proc, idx) => (
                                <Select.Option key={idx} value={proc.name}>
                                  {proc.name} (¥{proc.unitPrice.toFixed(2)})
                                </Select.Option>
                              ))}
                            </Select>
                          ),
                        },
                        {
                          title: '数量',
                          key: 'quantity',
                          width: 90,
                          align: 'right',
                          render: (_, record) => (
                            <InputNumber
                              placeholder="数量"
                              size="small"
                              min={0}
                              step={1}
                              style={{ width: '85px' }}
                              value={delegationData[record.key]?.quantity}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [record.key]: { ...prev[record.key], quantity: value || undefined }
                                }));
                              }}
                            />
                          ),
                        },
                        {
                          title: '执行工厂',
                          key: 'factoryId',
                          render: (_, record) => (
                            <Select
                              placeholder="选择工厂"
                              size="small"
                              style={{ width: '100%', maxWidth: '220px' }}
                              loading={factoriesLoading}
                              allowClear
                              showSearch
                              optionFilterProp="children"
                              value={delegationData[record.key]?.factoryId}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [record.key]: { ...prev[record.key], factoryId: value }
                                }));
                              }}
                            >
                              {factories.map((f) => (
                                <Select.Option key={f.id} value={f.id}>
                                  {f.factoryName}
                                </Select.Option>
                              ))}
                            </Select>
                          ),
                        },
                        {
                          title: '委派单价',
                          key: 'unitPrice',
                          width: 110,
                          render: (_, record) => (
                            <InputNumber
                              placeholder="单价"
                              size="small"
                              min={0}
                              step={0.01}
                              precision={2}
                              prefix="¥"
                              style={{ width: '100px' }}
                              value={delegationData[record.key]?.unitPrice}
                              onChange={(value) => {
                                setDelegationData(prev => ({
                                  ...prev,
                                  [record.key]: { ...prev[record.key], unitPrice: value || undefined }
                                }));
                              }}
                            />
                          ),
                        },
                        {
                          title: '委派人',
                          key: 'operatorName',
                          width: 90,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status?.operatorName ? (
                              <a
                                style={{ cursor: 'pointer', color: 'var(--primary-color)', fontWeight: 500 }}
                                onClick={() => {
                                  if (processDetailRecord?.orderNo) {
                                    navigate(`/finance/payroll-operator-summary?orderNo=${processDetailRecord.orderNo}&processName=${record.name}`);
                                  }
                                }}
                              >
                                {status.operatorName}
                              </a>
                            ) : (
                              <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                            );
                          },
                        },
                        {
                          title: '委派时间',
                          key: 'completedTime',
                          width: 110,
                          render: (_, record) => {
                            const status = stageStatusMap[record.key];
                            return status?.completedTime ? (
                              <span style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)' }}>
                                {new Date(status.completedTime).toLocaleString('zh-CN', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--neutral-text-disabled)' }}>-</span>
                            );
                          },
                        },
                        {
                          title: '操作',
                          key: 'action',
                          width: 90,
                          align: 'center',
                          render: (_, record) => (
                            <Button
                              type="primary"
                              size="small"
                              onClick={() => processDetailRecord && saveDelegation(record.key, processDetailRecord.id)}
                            >
                              保存
                            </Button>
                          ),
                        },
                      ]}
                      pagination={false}
                      size="small"
                      bordered
                      rowKey="key"
                    />
                  </div>
                );
              })()}

              {/* 委派历史记录 */}
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--neutral-text)',
                  marginBottom: '8px',
                  paddingBottom: '6px',
                  borderBottom: '1px solid var(--color-border)'
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
                borderBottom: '1px solid var(--color-border)'
              }}>
                操作记录（扫码/委派/同步）
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


        {/* 转单弹窗 */}
        <Modal
          title={`转单 - ${safeString((transferRecord as any)?.orderNo)}`}
          open={transferModalVisible}
          onCancel={() => {
            setTransferModalVisible(false);
            setTransferRecord(null);
          }}
          onOk={submitTransfer}
          confirmLoading={transferSubmitting}
          okText="确认转单"
          cancelText="取消"
          width="60vw"
          destroyOnHidden
        >
          <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>转给谁：</div>
              <Select
                showSearch
                placeholder="输入姓名搜索系统用户"
                value={transferUserId}
                onChange={(val) => setTransferUserId(val)}
                onSearch={searchTransferUsers}
                filterOption={false}
                loading={transferSearching}
                notFoundContent={transferSearching ? '搜索中...' : '输入姓名搜索'}
                style={{ width: '100%' }}
                allowClear
              >
                {transferUsers.map(u => (
                  <Option key={u.id} value={u.id}>
                    {u.name}{u.username ? ` (${u.username})` : ''}
                  </Option>
                ))}
              </Select>
            </div>

            {/* 菲号选择表格 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                选择菲号（可选）：
                {transferSelectedBundleIds.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    已选 {transferSelectedBundleIds.length} 个
                  </span>
                )}
              </div>
              <Table
                size="small"
                loading={transferBundlesLoading}
                dataSource={transferBundles}
                rowKey="id"
                pagination={false}
                scroll={{ y: 200 }}
                rowSelection={{
                  selectedRowKeys: transferSelectedBundleIds,
                  onChange: (keys) => setTransferSelectedBundleIds(keys as string[]),
                }}
                columns={[
                  {
                    title: '菲号',
                    dataIndex: 'bundleNo',
                    width: 80,
                    render: (val: any) => val || '-'
                  },
                  { title: '颜色', dataIndex: 'color', width: 100 },
                  { title: '尺码', dataIndex: 'size', width: 80 },
                  { title: '数量', dataIndex: 'quantity', width: 70 },
                  {
                    title: '状态',
                    dataIndex: 'status',
                    width: 90,
                    render: (v: string) => {
                      const statusMap: Record<string, string> = {
                        'created': '已创建',
                        'qualified': '已质检',
                        'in_progress': '生产中',
                      };
                      return statusMap[v] || v || '-';
                    }
                  },
                ]}
                locale={{ emptyText: transferBundlesLoading ? '加载中...' : '暂无菲号数据' }}
              />
            </div>

            {/* 工序选择 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>
                选择工序（可选）：
                {transferSelectedProcessCodes.length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)', marginLeft: 8 }}>
                    已选 {transferSelectedProcessCodes.length} 个工序
                  </span>
                )}
              </div>
              <Select
                mode="multiple"
                placeholder="选择要转移的工序"
                value={transferSelectedProcessCodes}
                onChange={(vals) => setTransferSelectedProcessCodes(vals)}
                loading={transferProcessesLoading}
                style={{ width: '100%' }}
                allowClear
                optionFilterProp="label"
                maxTagCount="responsive"
              >
                {transferProcesses.map((p: any) => {
                  const price = Number(p.unitPrice || 0);
                  const priceText = price > 0 ? ` - ¥${price.toFixed(2)}/件` : '';
                  const label = `${p.processName}${priceText}${p.progressStage ? ` (${p.progressStage})` : ''}`;
                  return (
                    <Option key={p.processCode || p.id} value={p.processCode || p.id} label={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{p.processName}</span>
                        <span style={{ color: 'var(--color-text-tertiary)', fontSize: '12px' }}>
                          {p.progressStage && `${p.progressStage} | `}
                          {price > 0 ? `¥${price.toFixed(2)}` : '未配置单价'}
                        </span>
                      </div>
                    </Option>
                  );
                })}
              </Select>
              {transferProcesses.length === 0 && !transferProcessesLoading && (
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '12px', marginTop: 4 }}>
                  该订单暂无工序配置
                </div>
              )}
            </div>

            <div>
              <div style={{ marginBottom: 6, fontWeight: 500 }}>备注（可选）：</div>
              <Input.TextArea
                placeholder="请输入转单备注"
                value={transferMessage}
                onChange={(e) => setTransferMessage(e.target.value)}
                autoSize={{ minRows: 2, maxRows: 4 }}
                maxLength={200}
                showCount
              />
            </div>
          </div>
        </Modal>

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
          category={(printingRecord as any)?.category}
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
