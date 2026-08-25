import { useState, useEffect, useMemo, useCallback, useRef, createElement } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import FactorySettleConfirmContent from './FactorySettleConfirmContent';
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
  /** D-134：已审批订单的扣款合计（未抵扣部分） */
  totalDeduction?: number;
  /** D-134：已审批订单的补款合计（SUPPLEMENT） */
  totalSupplement?: number;
  /** D-134：净额 = 加工费 − 扣款 + 补款（终审推送默认金额） */
  netAmount?: number;
  /** D-136：抵扣清单（含上期结转项），前端勾选后随推送回传 deductionIds */
  deductionItems?: Array<{
    id: string;
    deductionType?: string;
    description?: string;
    amount: number;
    isSupplement?: boolean;
    orderNo?: string;
    carryOver?: boolean;
  }>;
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
      // 日期范围筛选（按 createTime，后端已支持 startDate/endDate）
      if (values.dateRange?.[0]) params.startDate = values.dateRange[0].format('YYYY-MM-DD');
      if (values.dateRange?.[1]) params.endDate = values.dateRange[1].format('YYYY-MM-DD');

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
    const deduction = Number(record.totalDeduction || 0);
    const supplement = Number(record.totalSupplement || 0);
    const gross = Number(record.totalAmount || 0);
    const items = record.deductionItems || [];
    const defaultSettle = record.netAmount != null ? Number(record.netAmount) : gross - deduction + supplement;
    // D-134/D-136：本次结算金额可编辑 + 抵扣清单勾选（取消勾选的扣款滚存下期）
    const settleState = { amount: defaultSettle, checkedIds: items.map(i => i.id) };
    modal.confirm({
      width: '30vw',
      title: '推送到收付款中心',
      content: createElement(FactorySettleConfirmContent, {
        factoryName: record.factoryName,
        orderCount: record.orderCount,
        gross,
        items,
        defaultAmount: defaultSettle,
        onAmountChange: (v: number) => { settleState.amount = v; },
        onCheckedChange: (ids: string[]) => { settleState.checkedIds = ids; },
      }),
      okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post('/finance/wage-payment/create-payable', {
            bizType: 'ORDER_SETTLEMENT',
            bizId: record.factoryId || record.factoryName,
            payeeName: record.factoryName,
            amount: settleState.amount,
            description: buildPayableDescription(record),
            orderNos: record.orderNos,
            deductionIds: settleState.checkedIds,
          });
          message.success(`工厂「${record.factoryName}」已按 ¥${settleState.amount.toFixed(2)} 推送到收付款中心`);
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

    // D-134：批量推送按净额（加工费−扣款+补款）汇总
    const batchNetTotal = selected.reduce(
      (s, r) => s + (r.netAmount != null ? Number(r.netAmount) : Number(r.totalAmount || 0)),
      0,
    );
    const hasAdjustment = selected.some(
      r => Number(r.totalDeduction || 0) > 0 || Number(r.totalSupplement || 0) > 0,
    );
    const batchContent = hasAdjustment
      ? `${content}；扣补款调整后合计 ¥${batchNetTotal.toFixed(2)}（已按各厂加工费−扣款+补款计算，如需单厂调整金额请取消后逐厂推送）`
      : content;

    modal.confirm({
      width: '30vw',
      title: '批量推送确认',
      content: batchContent,
      okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        setBatchApproveLoading(true);
        try {
          const newPushedIds: string[] = [];
          for (const record of selected) {
            const amount = record.netAmount != null ? Number(record.netAmount) : Number(record.totalAmount || 0);
            // D-136：批量推送默认把各厂当前清单内扣款全部纳入抵扣
            const deductionIds = (record.deductionItems || []).map(i => i.id);
            await api.post('/finance/wage-payment/create-payable', {
              bizType: 'ORDER_SETTLEMENT',
              bizId: record.factoryId || record.factoryName,
              payeeName: record.factoryName,
              amount,
              description: buildPayableDescription(record),
              orderNos: record.orderNos,
              deductionIds,
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
