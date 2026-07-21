import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { App, Form } from 'antd';
import api from '@/utils/api';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FactoryRank } from '@/services/intelligence/intelligenceApi';
import dayjs from 'dayjs';
import { toMoney } from '@/utils/format';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

/** 工厂汇总行数据 */
export interface FactorySummaryRow {
  factoryId: string;
  factoryName: string;
  /** 工厂类型: INTERNAL=内部工厂(工资结算), EXTERNAL=外部工厂(订单结算) */
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
  /** 已审批（approved）的订单号子集，由后端 factory-summary 接口返回，用于页面刷新后自动恢复审批状态 */
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
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  // ===== 工厂绩效榜 =====
  const [leaderboard, setLeaderboard] = useState<FactoryRank[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbCollapsed, setLbCollapsed] = useState(false);
  const [presetValue, setPresetValue] = useState<string>('');
  const [statusTab, setStatusTab] = useState<string>('');
  const [printModalVisible, setPrintModalVisible] = useState(false);
  const [drilldownOpen, setDrilldownOpen] = useState(false);
  const [drilldownTarget, setDrilldownTarget] = useState<FactorySummaryRow | null>(null);

  // ===== 统计卡片计算 =====
  const stats = useMemo<FactorySummaryStats>(() => {
    const pendingCount = data.filter(r => r.factoryType !== 'INTERNAL' && !pushedFactoryIds.has(r.factoryId || r.factoryName)).length;
    const approvedCount = data.filter(r => pushedFactoryIds.has(r.factoryId || r.factoryName)).length;
    const totalAmount = data.reduce((s: number, r) => s + Number(r.totalAmount || 0), 0);
    return { total: data.length, pendingCount, approvedCount, totalAmount };
  }, [data, pushedFactoryIds]);

  // ===== Tab 过滤（根据推送状态） =====
  const filteredDataByTab = useMemo(() => {
    if (!statusTab) return data;
    if (statusTab === 'pending') return data.filter(r => r.factoryType !== 'INTERNAL' && !pushedFactoryIds.has(r.factoryId || r.factoryName));
    if (statusTab === 'approved') return data.filter(r => pushedFactoryIds.has(r.factoryId || r.factoryName));
    return data;
  }, [data, statusTab, pushedFactoryIds]);

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

  const getPrintData = () => {
    return selectedRowKeys.map(key => {
      const summary = data.find((r: any) => r.factoryName === key || r.factoryId === key);
      if (!summary) return null;
      return {
        factoryId: summary.factoryId,
        factoryName: summary.factoryName,
        totalAmount: summary.totalAmount,
        totalOrderQuantity: summary.totalOrderQuantity,
        orderCount: summary.orderCount,
        orderNos: summary.orderNos
      };
    }).filter(Boolean) as any[];
  };

  const getDateRange = (): [string, string] => {
    try {
      if (!form.isFieldsTouched()) return ['-', '-'];
      const values = form.getFieldsValue();
      if (values.dateRange && values.dateRange.length === 2) {
        return [values.dateRange[0].format('YYYY-MM-DD'), values.dateRange[1].format('YYYY-MM-DD')];
      }
    } catch { /* form not connected yet */ }
    return ['-', '-'];
  };

  const lbFetched = useRef(false);

  const fetchLeaderboard = useCallback(async () => {
    if (lbFetched.current) return;
    lbFetched.current = true;
    setLbLoading(true);
    try {
      const res = await intelligenceApi.getFactoryLeaderboard() as any;
      const ranks: FactoryRank[] = res?.data?.rankings ?? res?.rankings ?? [];
      setLeaderboard(ranks.slice(0, 6));
    } catch { message.warning('绩效榜加载失败'); } finally { setLbLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { void fetchLeaderboard(); }, [fetchLeaderboard]);

  const reportSmartError = useCallback((title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({
      title,
      reason,
      code,
      actionText: '刷新重试',
    });
  }, [showSmartErrorNotice]);

  // 获取工厂汇总数据
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
        { params: { ...params } }
      );
      const list = res?.data ?? res ?? [];
      const rows: FactorySummaryRow[] = Array.isArray(list) ? list : [];
      setData(rows);
      // 页面加载（包括刷新）时，从各工厂 row 的 approvedOrderNos 汇总出已审批订单号 Set
      // 解决原来纲内存 Set 导致刷新后 Tab2 变空的问题
      const approvedNos = new Set<string>();
      rows.forEach(row => {
        (row.approvedOrderNos ?? []).forEach(no => approvedNos.add(no));
      });
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
  }, [message, onAuditNosChange, onAuditNosChange]);

  /** 加载已推送到收付款中心的工厂ID（防重复推送） */
  const loadPushedFactories = useCallback(async () => {
    try {
      const res: any = await wagePaymentApi.listPendingPayables('ORDER_SETTLEMENT');
      const payables = res?.data ?? res ?? [];
      if (Array.isArray(payables)) {
        const ids = new Set<string>(payables.map((p: { bizId: string }) => p.bizId).filter(Boolean));
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

  const filteredData = useMemo(() => {
    return data.filter(r => r.factoryType !== 'INTERNAL');
  }, [data]);

  // 汇总统计基于过滤后数据
  const summary = useMemo<FactorySummaryTotals>(() => {
    const totalOrders = filteredData.reduce((s, r) => s + (r.orderCount || 0), 0);
    const totalQty = filteredData.reduce((s, r) => s + (r.totalOrderQuantity || 0), 0);
    const totalWarehoused = filteredData.reduce((s, r) => s + (r.totalWarehousedQuantity || 0), 0);
    const totalDefect = filteredData.reduce((s, r) => s + (r.totalDefectQuantity || 0), 0);
    const totalMaterialCost = filteredData.reduce((s, r) => s + Number(r.totalMaterialCost || 0), 0);
    const totalProductionCost = filteredData.reduce((s, r) => s + Number(r.totalProductionCost || 0), 0);
    const totalAmount = filteredData.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalProfit = filteredData.reduce((s, r) => s + Number(r.totalProfit || 0), 0);
    return { totalOrders, totalQty, totalWarehoused, totalDefect, totalMaterialCost, totalProductionCost, totalAmount, totalProfit };
  }, [filteredData]);

  // 驳回：将工厂所有订单从 auditedOrderNos 移除，回流Tab1重审
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

  // 终审推送单个工厂结算到收付款中心
  const handleApprove = async (record: FactorySummaryRow) => {
    modal.confirm({
      width: '30vw',
      title: '推送到收付款中心',
      content: `确认将工厂「${record.factoryName}」的 ${record.orderCount} 个订单（总金额 ¥${toMoney(record.totalAmount)}）终审推送到收付款中心？`,
        okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        try {
          // 推送到收付款中心：创建 ORDER_SETTLEMENT 待收付款记录
          await api.post('/finance/wage-payment/create-payable', {
            bizType: 'ORDER_SETTLEMENT',
            bizId: record.factoryId || record.factoryName,
            payeeName: record.factoryName,
            amount: record.totalAmount,
            description: `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件 | 面料:${record.totalMaterialCost || 0} · 工费:${record.totalProductionCost || 0} · 利润:${record.totalProfit || 0} · 次品:${record.totalDefectQuantity || 0} · 入库:${record.totalWarehousedQuantity || 0} · 订单量:${record.totalOrderQuantity || 0}`,
            orderNos: record.orderNos,
          });
          message.success(`工厂「${record.factoryName}」已推送到收付款中心`);
          // 标记为已推送，隐藏按钮
          setPushedFactoryIds(prev => new Set([...prev, record.factoryId || record.factoryName]));
          fetchData();
        } catch (e: unknown) {
          message.error(e instanceof Error ? e.message : '推送失败');
        }
      },
    });
  };

  // 批量终审推送到收付款中心
  const handleBatchApprove = () => {
    const selected = filteredData.filter(r =>
      selectedRowKeys.includes(r.factoryName)
      && !pushedFactoryIds.has(r.factoryId || r.factoryName)
    );
    if (selected.length === 0) {
      message.warning('请先选择未推送的工厂');
      return;
    }

    const totalAmount = selected.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalOrders = selected.reduce((s, r) => s + (r.orderCount || 0), 0);

    modal.confirm({
      width: '30vw',
      title: '批量推送确认',
      content: `确认将 ${selected.length} 个工厂（共 ${totalOrders} 个订单，总金额 ¥${toMoney(totalAmount)}）终审推送到收付款中心？`,
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
              description: `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件 | 面料:${record.totalMaterialCost || 0} · 工费:${record.totalProductionCost || 0} · 利润:${record.totalProfit || 0} · 次品:${record.totalDefectQuantity || 0} · 入库:${record.totalWarehousedQuantity || 0} · 订单量:${record.totalOrderQuantity || 0}`,
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
      const formattedData = data.map((item: any) => ({
        '工厂名称': item.factoryName || '-',
        '订单数': item.orderCount || 0,
        '下单总量': item.totalOrderQuantity || 0,
        '入库总量': item.totalWarehousedQuantity || 0,
        '次品量': item.totalDefectQuantity || 0,
        '面辅料成本': item.totalMaterialCost || 0,
        '生产成本': item.totalProductionCost || 0,
        '总金额': item.totalAmount || 0,
        '利润': item.totalProfit || 0,
        '订单号列表': item.orderNos?.join(', ') || '-'
      }));
      const headers = ['工厂名称','订单数','下单总量','入库总量','次品量','面辅料成本','生产成本','总金额','利润','订单号列表'];
      await exportToExcel(
        formattedData,
        headers.map(h => ({ header: h, key: h })),
        `工厂订单汇总_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`
      );
      message.success('导出成功');
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '导出失败');
    } finally {
      setExportLoading(false);
    }
  };

  return {
    // form
    form,
    // state
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
    // setters
    setSelectedRowKeys,
    setLbCollapsed,
    setPresetValue,
    setStatusTab,
    setPrintModalVisible,
    setDrilldownOpen,
    setDrilldownTarget,
    setSmartError,
    // computed
    stats,
    filteredDataByTab,
    filteredData,
    summary,
    // handlers
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
