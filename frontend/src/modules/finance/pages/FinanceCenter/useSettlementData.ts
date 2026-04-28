import { useState, useEffect, useCallback } from 'react';
import { App } from 'antd';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import api from '@/utils/api';
import { isOrderFrozenByStatus } from '@/utils/api/production';
import { readPageSize } from '@/utils/pageSizeStore';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

export interface FinishedSettlementRow {
  orderId: string;
  orderNo: string;
  status: string;
  styleNo: string;
  factoryId: string;
  factoryName: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  parentOrgUnitName?: string;
  orgPath?: string;
  orderQuantity: number;
  styleFinalPrice: number;
  targetProfitRate?: number;
  warehousedQuantity: number;
  defectQuantity: number;
  colors: string;
  materialCost: number;
  productionCost: number;
  defectLoss: number;
  totalAmount: number;
  totalCost?: number;
  otherCost?: number;
  profit: number;
  profitMargin: number;
  createTime: string;
  completeTime?: string;
  remark?: string;
  [key: string]: unknown;
}

export interface PageParams {
  page: number;
  pageSize: number;
  orderNo?: string;
  styleNo?: string;
  status?: string;
  parentOrgUnitId?: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL' | '';
  startDate?: string;
  endDate?: string;
}

export const statusMap: Record<string, { text: string; color: string }> = {
  PENDING: { text: '待确认', color: 'var(--color-warning)' },
  CONFIRMED: { text: '已确认', color: 'var(--primary-color)' },
  IN_PRODUCTION: { text: '生产中', color: 'var(--color-success)' },
  COMPLETED: { text: '已完成', color: 'var(--info-color)' },
  CANCELLED: { text: '已取消', color: 'var(--color-danger)' },
  pending: { text: '待确认', color: 'var(--color-warning)' },
  confirmed: { text: '已确认', color: 'var(--primary-color)' },
  in_production: { text: '生产中', color: 'var(--color-success)' },
  production: { text: '生产中', color: 'var(--color-success)' },
  completed: { text: '已完成', color: 'var(--info-color)' },
  cancelled: { text: '已取消', color: 'var(--color-danger)' },
};

export function useSettlementData(auditedOrderNos: Set<string>, onAuditNosChange: (s: Set<string>) => void) {
  const { message } = App.useApp();
  const [searchOrderNo, setSearchOrderNo] = useState('');
  const [searchStyleNo, setSearchStyleNo] = useState('');
  const [searchStatus, setSearchStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinishedSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [remarkModalVisible, setRemarkModalVisible] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string>('');
  const [remarkText, setRemarkText] = useState<string>('');
  const [logModalVisible, setLogModalVisible] = useState(false);
  const [orderLogs, setOrderLogs] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [pageParams, setPageParams] = useState<PageParams>({
    page: 1,
    pageSize: readPageSize(20),
  });

  const showSmartErrorNotice = isSmartFeatureEnabled('smart.finance.explain.enabled');

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code, actionText: '刷新重试' });
  };

  const buildPageParams = useCallback((overrides?: Partial<PageParams>): PageParams => ({
    page: overrides?.page || 1,
    pageSize: overrides?.pageSize || pageParams.pageSize,
    orderNo: (overrides?.orderNo ?? searchOrderNo) || undefined,
    styleNo: (overrides?.styleNo ?? searchStyleNo) || undefined,
    status: (overrides?.status ?? searchStatus) || undefined,
    factoryType: 'EXTERNAL' as PageParams['factoryType'],
    startDate: overrides?.startDate ?? (dateRange?.[0] ? dayjs(dateRange[0]).format('YYYY-MM-DD') : undefined),
    endDate: overrides?.endDate ?? (dateRange?.[1] ? dayjs(dateRange[1]).format('YYYY-MM-DD') : undefined),
  }), [dateRange, pageParams.pageSize, searchOrderNo, searchStatus, searchStyleNo]);

  const loadData = async (params: PageParams = pageParams) => {
    setLoading(true);
    try {
      const finalParams = { ...params, factoryType: 'EXTERNAL' };
      const response = await api.get('/finance/finished-settlement/list', { params: finalParams });
      setData(response.data?.records || []);
      setTotal(response.data?.total || 0);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '加载数据失败';
      reportSmartError('成品结算列表加载失败', errMsg, 'FIN_SETTLEMENT_LIST_LOAD_FAILED');
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (overrides?: Partial<PageParams>) => {
    const params = buildPageParams(overrides);
    setPageParams(params);
    loadData(params);
  };

  const handleReset = () => {
    setSearchOrderNo('');
    setSearchStyleNo('');
    setSearchStatus('');
    setDateRange(null);
    const params: PageParams = { page: 1, pageSize: 20 };
    setPageParams(params);
    loadData(params);
  };

  const handleAuditOrder = (record: FinishedSettlementRow) => {
    if (record.factoryType === 'INTERNAL') {
      message.warning('内部工厂订单请在「工资结算」中审核');
      return;
    }
    if (!isOrderFrozenByStatus(record)) {
      message.warning('该订单尚未关单，无法审核');
      return;
    }
    onAuditNosChange(new Set([...auditedOrderNos, record.orderNo]));
    message.success(`订单 ${record.orderNo} 已审核，可在「工厂订单汇总」进行终审推送`);
  };

  const handleBatchAudit = () => {
    const eligible = data.filter(r =>
      selectedRowKeys.includes(r.orderId) &&
      r.factoryType !== 'INTERNAL' &&
      isOrderFrozenByStatus(r) &&
      !auditedOrderNos.has(r.orderNo)
    );
    if (eligible.length === 0) {
      message.warning('选中订单中没有可审核的（外部工厂·已关单且未审核）');
      return;
    }
    const newNos = new Set(auditedOrderNos);
    eligible.forEach(r => newNos.add(r.orderId));
    onAuditNosChange(newNos);
    message.success(`批量审核 ${eligible.length} 个订单成功`);
    setSelectedRowKeys([]);
  };

  const handleExportSelected = () => {
    if (selectedRowKeys.length === 0) {
      message.warning('请先选择要导出的订单');
      return;
    }
    const queryParams = new URLSearchParams();
    selectedRowKeys.forEach(id => queryParams.append('orderIds', id));
    const { downloadFile } = require('@/utils/fileUrl');
    downloadFile(`/api/finance/finished-settlement/export?${queryParams.toString()}`);
    message.success(`正在导出 ${selectedRowKeys.length} 条数据...`);
  };

  const openRemarkModal = (record: FinishedSettlementRow) => {
    setEditingOrderId(record.orderId);
    setRemarkText(record.remark || '');
    setRemarkModalVisible(true);
  };

  const saveRemark = async () => {
    if (!editingOrderId) return;
    try {
      await api.post(`/finance/finished-settlement/${editingOrderId}/remark`, { remark: remarkText });
      message.success('备注保存成功');
      setRemarkModalVisible(false);
      loadData();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '保存备注失败';
      reportSmartError('结算备注保存失败', errMsg, 'FIN_SETTLEMENT_REMARK_SAVE_FAILED');
      message.error(errMsg);
    }
  };

  const openLogModal = async (orderId: string) => {
    try {
      const response = await api.get<{ code: number; data: Array<{ time?: string; createTime?: string; operator?: string; operatorName?: string; action?: string; operation?: string }> }>(
        `/finance/shipment-reconciliation/${orderId}/logs`
      );
      if (response.code === 200 && Array.isArray(response.data) && response.data.length > 0) {
        setOrderLogs(response.data.map(item => ({
          time: item.time || item.createTime || '-',
          operator: item.operator || item.operatorName || '-',
          action: item.action || item.operation || '-',
        })));
      } else {
        setOrderLogs([]);
      }
      setLogModalVisible(true);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '获取日志失败';
      reportSmartError('结算日志加载失败', errMsg, 'FIN_SETTLEMENT_LOG_LOAD_FAILED');
      message.error(errMsg);
    }
  };

  const handleExport = async () => {
    try {
      const params = buildPageParams();
      message.loading({ content: '导出中...', key: 'export' });
      const queryString = new URLSearchParams(
        Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
      ).toString();
      const { downloadFile } = require('@/utils/fileUrl');
      downloadFile(`/api/finance/finished-settlement/export?${queryString}`);
      message.success({ content: '导出成功', key: 'export', duration: 2 });
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '导出失败';
      message.error({ content: errMsg, key: 'export', duration: 2 });
    }
  };

  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    const params = {
      ...pageParams,
      page: pagination.current || 1,
      pageSize: pagination.pageSize || 20,
    };
    setPageParams(params);
    loadData(params);
  };

  useEffect(() => { loadData(); }, []);

  return {
    searchOrderNo, setSearchOrderNo,
    searchStyleNo, setSearchStyleNo,
    searchStatus, setSearchStatus,
    loading, data, total,
    selectedRowKeys, setSelectedRowKeys,
    remarkModalVisible, setRemarkModalVisible,
    editingOrderId, remarkText, setRemarkText,
    logModalVisible, setLogModalVisible,
    orderLogs,
    dateRange, setDateRange,
    smartError, showSmartErrorNotice,
    pageParams,
    handleSearch, handleReset,
    handleAuditOrder, handleBatchAudit,
    handleExportSelected, handleExport,
    openRemarkModal, saveRemark, openLogModal,
    handleTableChange, loadData,
  };
}
