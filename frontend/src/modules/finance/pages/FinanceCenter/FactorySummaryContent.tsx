import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, Form, Input, Button, Space, App, Tag, Tooltip, Empty, Radio, Statistic, Dropdown, Tabs } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  ShopOutlined,
  PrinterOutlined,
  DownloadOutlined,
  MoreOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FactoryRank } from '@/services/intelligence/intelligenceApi';
import ResizableTable from '@/components/common/ResizableTable';
import FactoryStatementPrintModal from './FactoryStatementPrintModal';
import FactoryOrderDrilldown from './FactoryOrderDrilldown';
import dayjs from 'dayjs';
import StandardToolbar from '@/components/common/StandardToolbar';
import StickyFilterBar from '@/components/common/StickyFilterBar';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import FactoryAuditPopover from './FactoryAuditPopover';
import { toMoney } from '@/utils/format';
import { getLeaderboardScoreColor } from './chartConfigs';


/** 工厂汇总行数据 */
interface FactorySummaryRow {
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

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const FactorySummaryContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
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
  const stats = useMemo(() => {
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

  const lbFetched = React.useRef(false);

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
  const summary = useMemo(() => {
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

  // 表格列定义
  const columns: ColumnsType<FactorySummaryRow> = [
    {
      title: '工厂名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 260,
      render: (text: string, record: FactorySummaryRow) => (
        <FactoryAuditPopover record={record} auditedOrderNos={auditedOrderNos}>
          <div style={{ lineHeight: 1.35 }}>
            <Space>
              <ShopOutlined style={{ color: record.factoryType === 'INTERNAL' ? 'var(--color-warning)' : 'var(--primary-color)' }} />
              <span style={{ fontWeight: 500, cursor: 'pointer', borderBottom: '1px dashed var(--primary-color)' }}>{text}</span>
              {record.factoryType === 'INTERNAL' && (
                <Tooltip title="内部工厂——工人工资已通过「工资结算」按人员审核，无需在此推送订单结算">
                  <Tag color="orange" style={{ margin: 0, fontSize: 14 }}>内部</Tag>
                </Tooltip>
              )}
              {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 14 }}>外部</Tag>}
            </Space>
            {record.orgPath || record.parentOrgUnitName ? (
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 14, marginTop: 4 }}>
                {record.orgPath || record.parentOrgUnitName}
              </div>
            ) : null}
          </div>
        </FactoryAuditPopover>
      ),
    },
    {
      title: '订单数',
      dataIndex: 'orderCount',
      key: 'orderCount',
      width: 90,
      align: 'center',
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: '下单总量',
      dataIndex: 'totalOrderQuantity',
      key: 'totalOrderQuantity',
      width: 100,
      align: 'right',
      render: (v: number) => v?.toLocaleString() ?? 0,
    },
    {
      title: '入库总量',
      dataIndex: 'totalWarehousedQuantity',
      key: 'totalWarehousedQuantity',
      width: 100,
      align: 'right',
      render: (v: number) => v?.toLocaleString() ?? 0,
    },
    {
      title: '次品量',
      dataIndex: 'totalDefectQuantity',
      key: 'totalDefectQuantity',
      width: 80,
      align: 'right',
      render: (v: number) => (
        <span style={{ color: v > 0 ? 'var(--color-danger)' : undefined }}>
          {v?.toLocaleString() ?? 0}
        </span>
      ),
    },
    {
      title: '面辅料成本',
      dataIndex: 'totalMaterialCost',
      key: 'totalMaterialCost',
      width: 120,
      align: 'right',
      render: (v: unknown) => `¥${toMoney(v)}`,
    },
    {
      title: '生产成本',
      dataIndex: 'totalProductionCost',
      key: 'totalProductionCost',
      width: 110,
      align: 'right',
      render: (v: unknown) => `¥${toMoney(v)}`,
    },
    {
      title: '总金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right',
      render: (v: unknown, record: FactorySummaryRow) => (
        <span
          style={{ fontWeight: 600, color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline' }}
          title="点击查看订单明细"
          onClick={() => { setDrilldownTarget(record); setDrilldownOpen(true); }}
        >
          ¥{toMoney(v)}
        </span>
      ),
    },
    {
      title: '利润',
      dataIndex: 'totalProfit',
      key: 'totalProfit',
      width: 120,
      align: 'right',
      render: (v: unknown) => {
        const n = Number(v);
        const color = n >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
        return <span style={{ fontWeight: 500, color }}>¥{toMoney(v)}</span>;
      },
    },
    {
      title: '订单号列表',
      dataIndex: 'orderNos',
      key: 'orderNos',
      width: 200,
      ellipsis: true,
      render: (orderNos: string[]) => {
        if (!orderNos?.length) return '-';
        const display = orderNos.slice(0, 3).join(', ');
        const extra = orderNos.length > 3 ? ` +${orderNos.length - 3}` : '';
        return (
          <Tooltip title={orderNos.join('\n')}>
            <span>{display}{extra}</span>
          </Tooltip>
        );
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: FactorySummaryRow) => {
        const factoryKey = record.factoryId || record.factoryName;
        if (pushedFactoryIds.has(factoryKey)) {
          return <Tag icon={<CheckCircleOutlined />} color="success">已推送</Tag>;
        }
        // 内部工厂不允许走订单结算，需通过「工资结算」按人员审核
        if (record.factoryType === 'INTERNAL') {
          return (
            <Tooltip title="内部工厂需到「工资结算」按人员审核，无需在此推送">
              <Tag color="default">设工资结算</Tag>
            </Tooltip>
          );
        }
        const actions: RowAction[] = [
          {
            key: 'push',
            label: '终审推送',
            primary: true,
            onClick: () => handleApprove(record),
          },
          {
            key: 'reject',
            label: '驳回',
            danger: true,
            onClick: () => handleReject(record),
          },
        ];
        return <RowActions actions={actions} />;
      },
    },
  ];

  // 搜索栏
  const searchFields = (
    <Form form={form} layout="inline" onFinish={fetchData}>
      <Form.Item name="factoryName">
        <Input placeholder="工厂名称" allowClear style={{ width: 160 }} />
      </Form.Item>
      <Form.Item>
        <Space>
          <Button type="primary" htmlType="submit" loading={loading}>查询</Button>
          <Button onClick={() => { form.resetFields(); fetchData(); }} disabled={loading}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );

  return (
    <div>
      {showSmartErrorNotice && smartError ? (
        <Card style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void fetchData();
            }}
          />
        </Card>
      ) : null}

      {/* ===== 统一统计卡片 ===== */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />待推送</span>}
            value={stats.pendingCount}
            suffix="个"
            valueStyle={{ color: 'var(--color-warning)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><CheckCircleOutlined style={{ marginRight: 4, fontSize: 12 }} />已推送</span>}
            value={stats.approvedCount}
            suffix="个"
            valueStyle={{ color: 'var(--color-primary)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><ShopOutlined style={{ marginRight: 4, fontSize: 12 }} />工厂总数</span>}
            value={stats.total}
            suffix="个"
            valueStyle={{ color: 'var(--color-success)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
        <Card
          size="small"
          style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }}
          styles={{ body: { padding: '10px 14px' } }}
        >
          <Statistic
            title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}><DollarOutlined style={{ marginRight: 4, fontSize: 12 }} />总金额</span>}
            value={summary.totalAmount}
            precision={2}
            prefix="¥"
            valueStyle={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 500 }}
          />
        </Card>
      </div>

      {/* 工厂绩效榜 */}
      {leaderboard.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12, borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}
          loading={lbLoading}
          title={<span style={{ fontSize: 14, fontWeight: 600 }}>工厂绩效榜</span>}
          extra={
            <Button type="link" onClick={() => setLbCollapsed(!lbCollapsed)} style={{ padding: 0 }}>
              {lbCollapsed ? '展开' : '收起'}
            </Button>
          }
        >
          {!lbCollapsed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {leaderboard.map((r) => {
                const scoreColor = getLeaderboardScoreColor(r.totalScore);
                return (
                  <div key={r.factoryId} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--color-fill-tertiary)',
                    border: '1px solid var(--color-border-secondary)',
                    minWidth: 190,
                  }}>
                    <span style={{ fontSize: 13 }}>{r.medal || `#${r.rank}`}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.factoryName}
                    </span>
                    <Tooltip title={`质量${r.qualityScore} · 速度${r.speedScore} · 交期${r.deliveryScore} · 成本${r.costScore}`}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>{r.totalScore}</span>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 搜索 & 工具栏 */}
      <Card className="filter-card mb-sm" style={{ marginBottom: 12, border: '1px solid var(--color-border-secondary)', borderRadius: 6 }} styles={{ body: { padding: '12px 16px' } }}>
        <div style={{ marginBottom: 8 }}>
          <Space size={12} wrap>
            <Radio.Group value={presetValue} onChange={handlePresetChange} optionType="button" buttonStyle="solid" size="small">
              <Radio.Button value="today">今天</Radio.Button>
              <Radio.Button value="week">本周</Radio.Button>
              <Radio.Button value="month">本月</Radio.Button>
              <Radio.Button value="year">本年</Radio.Button>
            </Radio.Group>
            <Button size="small" onClick={() => setPresetValue('')}>清除日期</Button>
          </Space>
        </div>
        <Tabs
          activeKey={statusTab}
          onChange={setStatusTab}
          size="small"
          items={[
            { key: '', label: `全部 (${data.length})` },
            { key: 'pending', label: `待推送 (${stats.pendingCount})` },
            { key: 'approved', label: `已推送 (${stats.approvedCount})` },
          ]}
          style={{ marginBottom: 0 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, flexWrap: 'wrap', gap: 8 }}>
          <Space size={8} wrap>
            {searchFields}
          </Space>
          <Space size={8}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
              {selectedRowKeys.length > 0 ? `已选 ${selectedRowKeys.length} 个` : `共 ${data.length} 个工厂`}
            </span>
            <Button
              type="primary"
              ghost
              size="small"
              icon={<CheckCircleOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handleBatchApprove}
              loading={batchApproveLoading}
            >
              批量终审推送 ({selectedRowKeys.length})
            </Button>
            <Button
              size="small"
              ghost
              icon={<PrinterOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handlePrintStatement}
            >
              打印对账单
            </Button>
            <Button
              size="small"
              ghost
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={data.length === 0}
              loading={exportLoading}
            >
              导出汇总
            </Button>
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'refresh', label: '刷新', icon: <ReloadOutlined />, onClick: fetchData },
                ],
              }}
            >
              <Button size="small" icon={<MoreOutlined />} />
            </Dropdown>
          </Space>
        </div>
      </Card>

      {/* 数据表格 */}
      <ResizableTable
        columns={columns}
        dataSource={filteredDataByTab}
        rowKey="factoryName"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={false}
        locale={{ emptyText: <Empty description="暂无记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        summary={() => (
          <ResizableTable.Summary fixed>
            <ResizableTable.Summary.Row>
              <ResizableTable.Summary.Cell index={0} colSpan={2}>
                <strong>合计 ({filteredData.length} 个工厂)</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={2} align="center">
                <strong>{summary.totalOrders}</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={3} align="right">
                <strong>{summary.totalQty.toLocaleString()}</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={4} align="right">
                <strong>{summary.totalWarehoused.toLocaleString()}</strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={5} align="right">
                <strong style={{ color: summary.totalDefect > 0 ? 'var(--color-danger)' : undefined }}>
                  {summary.totalDefect}
                </strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={6} align="right">
                ¥{toMoney(summary.totalMaterialCost)}
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={7} align="right">
                ¥{toMoney(summary.totalProductionCost)}
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={8} align="right">
                <strong style={{ color: 'var(--primary-color)' }}>
                  ¥{toMoney(summary.totalAmount)}
                </strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={9} align="right">
                <strong style={{ color: summary.totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  ¥{toMoney(summary.totalProfit)}
                </strong>
              </ResizableTable.Summary.Cell>
              <ResizableTable.Summary.Cell index={10} />
              <ResizableTable.Summary.Cell index={11} />
            </ResizableTable.Summary.Row>
          </ResizableTable.Summary>
        )}
      />
      <FactoryStatementPrintModal
        visible={printModalVisible}
        onClose={() => setPrintModalVisible(false)}
        factoryData={getPrintData()}
        dateRange={printModalVisible ? getDateRange() : ['-', '-']}
      />

      {drilldownTarget && (
        <FactoryOrderDrilldown
          open={drilldownOpen}
          factoryName={drilldownTarget.factoryName}
          factoryType={drilldownTarget.factoryType}
          orderNos={drilldownTarget.orderNos || []}
          totalAmount={drilldownTarget.totalAmount}
          totalMaterialCost={drilldownTarget.totalMaterialCost}
          totalProductionCost={drilldownTarget.totalProductionCost}
          totalProfit={drilldownTarget.totalProfit}
          totalDefectQuantity={drilldownTarget.totalDefectQuantity}
          totalOrderQuantity={drilldownTarget.totalOrderQuantity}
          totalWarehousedQuantity={drilldownTarget.totalWarehousedQuantity}
          onClose={() => { setDrilldownOpen(false); setDrilldownTarget(null); }}
        />
      )}
    </div>
  );
};

export default FactorySummaryContent;
