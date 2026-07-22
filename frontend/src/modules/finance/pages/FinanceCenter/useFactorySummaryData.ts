import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import { useFactoryLeaderboard } from './hooks/useFactoryLeaderboard';
import {
  computeStats,
  filterDataByTab,
  filterExternalFactories,
  computeTotals,
  getPrintData as getPrintDataUtil,
  getDateRange as getDateRangeUtil,
  extractApprovedOrderNos,
  buildPayableDescription,
  formatExportData,
  exportHeaders,
  buildExportFileName,
  buildApproveConfirmContent,
  buildBatchApproveConfirmContent,
} from './utils';

export interface FactorySummaryRow {
  factoryId: string;
  factoryName: string;
  factoryType?: string;
  parentOrgUnitName?: string;
  orgPath?: string;
  orderCount: number;
  totalOrderQuantity: number;
  totalWarehousedQuantity: number;
  totalDefectQuantity: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalAmount: number;
  totalProfit: number;
  orderNos: string[];
  approvedOrderNos?: string[];
  [key: string]: unknown;
}

export interface FactorySummaryStats {
  total: number;
  pendingCount: number;
  approvedCount: number;
  totalAmount: number;
}

export interface FactorySummaryTotals {
  totalOrders: number;
  totalQty: number;
  totalWarehoused: number;
  totalDefect: number;
  totalMaterialCost: number;
  totalProductionCost: number;
  totalAmount: number;
  totalProfit: number;
}

export function useFactorySummaryData(
  auditedOrderNos: Set<string>,
  onAuditNosChange: (s: Set<string>) => void,
) {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FactorySummaryRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [pushedFactoryIds, setPushedFactoryIds] = useState<Set<string>>(new Set());
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const [batchApproveLoading, setBatchApproveLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const showSmartErrorNotice = useMemo(
    () => isSmartFeatureEnabled('smart.finance.explain.enabled'),
    [],
  );

  const { leaderboard, lbLoading, lbCollapsed, setLbCollapsed } = useFactoryLeaderboard();

  const [presetValue, setPresetValue] = useState<string>('');
  const [statusTab, setStatusTab] = useState<string>('');
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTarget, setDrilldownTarget] = useState<FactorySummaryRow | null>(null);

  const stats = useMemo<FactorySummaryStats>(
    () => computeStats(data, pushedFactoryIds),
    [data, pushedFactoryIds],
  );

  const filteredDataByTab = useMemo(
    () => filterDataByTab(data, statusTab, pushedFactoryIds),
    [data, statusTab, pushedFactoryIds],
  );

  const handlePresetChange = (e: any) => {
    const val = e.target.value;
    setPresetValue(val);
  };

  const handlePrintStatement = () => {
    if (selectedRowKeys.length === 0) {
      return;
    }
    setPrintModalVisible(true);
  };

  const getPrintData = () => getPrintDataUtil(selectedRowKeys, data);

  const getDateRange = (): [string, string] => getDateRangeUtil(form);

  const reportSmartError = useCallback(
    (title: string, reason?: string, code?: string) => {
      if (!showSmartErrorNotice) return;
      setSmartError({
        title,
        reason,
        code,
        actionText: '刷新重试',
      });
    },
    [showSmartErrorNotice],
  );

  const formRef = useRef(form);
  formRef.current = form;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const values = formRef.current.getFieldsValue();
      const params: Record<string, string> = {};
      if (values.factoryName?.trim()) params.factoryName = values.factoryName.trim();
      if (values.status?.trim()) params.status = values.status.trim();

      const res = await api.get<{ code: number; data: FactorySummaryRow[] }>(
        '/finance/finished-settlement/factory-summary',
        { params: { ...params } },
      );
      const list = res?.data ?? res ?? [];
      const rows: FactorySummaryRow[] = Array.isArray(list) ? list : [];
      setData(rows);
      const approvedNos = extractApprovedOrderNos(rows);
      onAuditNosChange(approvedNos);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : '获取工厂汇总失败';
      reportSmartError('工厂汇总加载失败', errMessage, 'FIN_FACTORY_SUMMARY_LOAD_FAILED');
      message.error(errMessage);
      setData([]);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, onAuditNosChange, reportSmartError, showSmartErrorNotice]);

  const loadPushedFactories = useCallback(async () => {
    try {
      const res: any = await wagePaymentApi.listPendingPayables('ORDER_SETTLEMENT');
      const payables = res?.data ?? res ?? [];
      if (Array.isArray(payables)) {
        const ids = new Set<string>(
          payables.map((p: { bizId: string }) => p.bizId).filter(Boolean),
        );
        setPushedFactoryIds(ids);
      }
    } catch {
      message.warning('推送状态查询失败，部分按钮状态可能不准确');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchData();
    loadPushedFactories();
  }, [fetchData, loadPushedFactories]);

  const filteredData = useMemo(() => filterExternalFactories(data), [data]);

  const summary = useMemo<FactorySummaryTotals>(
    () => computeTotals(filteredData),
    [filteredData],
  );

  const handleReject = (record: FactorySummaryRow) => {
    const factoryOrderNos = new Set(record.orderNos || []);
    if (factoryOrderNos.size === 0) {
      message.warning('这个工厂没有可驳回的审核订单');
      return;
    }
    const newNos = new Set([...auditedOrderNos].filter(no => !factoryOrderNos.has(no)));
    onAuditNosChange(newNos);
    message.success(`工厂「${record.factoryName}」的订单已驳回，请回「订单汇总」重新审核`);
  };

  const handleApprove = async (record: FactorySummaryRow) => {
    modal.confirm({
      width: '30vw',
      title: '推送到收付款中心',
      content: buildApproveConfirmContent(record),
      okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post('/finance/wage-payment/create-payable', {
            bizType: 'ORDER_SETTLEMENT',
            bizId: record.factoryId || record.factoryName,
            payeeName: record.factoryName,
            amount: record.totalAmount,
            description: buildPayableDescription(record),
            orderNos: record.orderNos,
          });
          message.success(`工厂「${record.factoryName}」已推送到收付款中心`);
          setPushedFactoryIds(prev => new Set([...prev, record.factoryId || record.factoryName]));
          fetchData();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '推送失败');
        }
      },
    });
  };

  const handleBatchApprove = () => {
    const selected = filteredData.filter(
      r =>
        selectedRowKeys.includes(r.factoryName) &&
        !pushedFactoryIds.has(r.factoryId || r.factoryName),
    );
    if (selected.length === 0) {
      message.warning('请先选择未推送的工厂');
      return;
    }

    const { content } = buildBatchApproveConfirmContent(selected);

    modal.confirm({
      width: '30vw',
      title: '批量推送确认',
      content,
      okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        setBatchApproveLoading(true);
        try {
          const newPushedIds: string[] = [];
          for (const record of selected) {
            await api.post('/finance/wage-payment/create-payable', {
              bizType: 'ORDER_SETTLEMENT',
              bizId: record.factoryId || record.factoryName,
              payeeName: record.factoryName,
              amount: record.totalAmount,
              description: buildPayableDescription(record),
              orderNos: record.orderNos,
            });
            newPushedIds.push(record.factoryId || record.factoryName);
          }
          message.success(`${selected.length} 个工厂已推送到收付款中心`);
          setPushedFactoryIds(prev => new Set([...prev, ...newPushedIds]));
          setSelectedRowKeys([]);
          fetchData();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '批量推送失败');
        } finally {
          setBatchApproveLoading(false);
        }
      },
    });
  };

  const handleExport = async () => {
    if (data.length === 0) {
      message.warning('无数据可导出');
      return;
    }
    setExportLoading(true);
    try {
      const { exportToExcel } = await import('@/utils/excelExport');
      const formattedData = formatExportData(data);
      await exportToExcel(
        formattedData,
        exportHeaders.map(h => ({ header: h, key: h })),
        buildExportFileName(),
      );
      message.success('导出成功');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  return {
    form,
    loading,
    data,
    selectedRowKeys,
    pushedFactoryIds,
    smartError,
    batchApproveLoading,
    exportLoading,
    showSmartErrorNotice,
    leaderboard,
    lbLoading,
    lbCollapsed,
    presetValue,
    statusTab,
    printModalVisible,
    drilldownOpen,
    drilldownTarget,
    setSelectedRowKeys,
    setLbCollapsed,
    setPresetValue,
    setStatusTab,
    setPrintModalVisible,
    setDrilldownOpen,
    setDrilldownTarget,
    setSmartError,
    stats,
    filteredDataByTab,
    filteredData,
    summary,
    handlePresetChange,
    handlePrintStatement,
    getPrintData,
    getDateRange,
    handleReject,
    handleApprove,
    handleBatchApprove,
    handleExport,
    fetchData,
  };
}
