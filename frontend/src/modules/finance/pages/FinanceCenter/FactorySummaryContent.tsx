import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Form, Input, Button, Space, App, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ShopOutlined,
  PrinterOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import * as XLSX from 'xlsx';
import { wagePaymentApi } from '@/services/finance/wagePaymentApi';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { FactoryRank } from '@/services/intelligence/intelligenceApi';
import ResizableTable from '@/components/common/ResizableTable';
import FactoryStatementPrintModal from './FactoryStatementPrintModal';
import dayjs from 'dayjs';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';
import FactoryAuditPopover from './FactoryAuditPopover';


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
  [key: string]: unknown;
}

interface Props {
  auditedOrderNos: Set<string>;
  onAuditNosChange: (s: Set<string>) => void;
}

const toMoney = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

const FactorySummaryContent: React.FC<Props> = ({ auditedOrderNos, onAuditNosChange }) => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FactorySummaryRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [pushedFactoryIds, setPushedFactoryIds] = useState<Set<string>>(new Set());
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

  // ===== 工厂绩效榜 =====
  const [leaderboard, setLeaderboard] = useState<FactoryRank[]>([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [lbCollapsed, setLbCollapsed] = useState(false);
  const [printModalVisible, setPrintModalVisible] = useState(false);

  const handlePrintStatement = () => {
    if (selectedRowKeys.length === 0) {
      return;
    }
    setPrintModalVisible(true);
  };

  const getPrintData = () => {
    return selectedRowKeys.map(key => {
      const summary = data.find((r: any) => r.factoryId === key);
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
    const values = form.getFieldsValue();
    if (values.dateRange && values.dateRange.length === 2) {
      return [values.dateRange[0].format('YYYY-MM-DD'), values.dateRange[1].format('YYYY-MM-DD')];
    }
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
    } catch { /* silent */ } finally { setLbLoading(false); }
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
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const values = form.getFieldsValue();
      const params: Record<string, string> = {};
      if (values.factoryName?.trim()) params.factoryName = values.factoryName.trim();
      if (values.status?.trim()) params.status = values.status.trim();

      const res = await api.get<{ code: number; data: FactorySummaryRow[] }>(
        '/finance/finished-settlement/factory-summary',
        { params }
      );
      const list = res?.data ?? res ?? [];
      setData(Array.isArray(list) ? list : []);
      if (showSmartErrorNotice) setSmartError(null);
    } catch (e: any) {
      const errMessage = String((e as Error)?.message || '获取工厂汇总失败');
      reportSmartError('工厂汇总加载失败', errMessage, 'FIN_FACTORY_SUMMARY_LOAD_FAILED');
      message.error(errMessage);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [form, message]);

  /** 加载已推送到付款中心的工厂ID（防重复推送） */
  const loadPushedFactories = useCallback(async () => {
    try {
      const res: any = await wagePaymentApi.listPendingPayables('ORDER_SETTLEMENT');
      const payables = res?.data ?? res ?? [];
      if (Array.isArray(payables)) {
        const ids = new Set<string>(payables.map((p: { bizId: string }) => p.bizId).filter(Boolean));
        setPushedFactoryIds(ids);
      }
    } catch {
      // 查询失败不影响主流程
    }
  }, []);

  useEffect(() => {
    fetchData();
    loadPushedFactories();
  }, [fetchData, loadPushedFactories]);

  // 过滤：只显示含已审核订单的工厂
  const filteredData = useMemo(() => {
    if (auditedOrderNos.size === 0) return [];
    return data.filter(row =>
      (row.orderNos || []).some(no => auditedOrderNos.has(no))
    );
  }, [data, auditedOrderNos]);

  // 汇总统计基于过滤后数据
  const summary = useMemo(() => {
    const totalOrders = filteredData.reduce((s, r) => s + (r.orderCount || 0), 0);
    const totalQty = filteredData.reduce((s, r) => s + (r.totalOrderQuantity || 0), 0);
    const totalWarehoused = filteredData.reduce((s, r) => s + (r.totalWarehousedQuantity || 0), 0);
    const totalAmount = filteredData.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalProfit = filteredData.reduce((s, r) => s + Number(r.totalProfit || 0), 0);
    return { totalOrders, totalQty, totalWarehoused, totalAmount, totalProfit };
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

  // 终审推送单个工厂结算到付款中心
  const handleApprove = async (record: FactorySummaryRow) => {
    modal.confirm({
      width: '30vw',
      title: '推送到付款中心',
      content: `确认将工厂「${record.factoryName}」的 ${record.orderCount} 个订单（总金额 ¥${toMoney(record.totalAmount)}）终审推送到付款中心？`,
        okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
        try {
          // 推送到付款中心：创建 ORDER_SETTLEMENT 待付款记录
          await api.post('/finance/wage-payment/create-payable', {
            bizType: 'ORDER_SETTLEMENT',
            bizId: record.factoryId || record.factoryName,
            payeeName: record.factoryName,
            amount: record.totalAmount,
            description: `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件 | 面料:${record.totalMaterialCost || 0} · 工费:${record.totalProductionCost || 0} · 利润:${record.totalProfit || 0} · 次品:${record.totalDefectQuantity || 0} · 入库:${record.totalWarehousedQuantity || 0} · 订单量:${record.totalOrderQuantity || 0}`,
            orderNos: record.orderNos,
          });
          message.success(`工厂「${record.factoryName}」已推送到付款中心`);
          // 标记为已推送，隐藏按钮
          setPushedFactoryIds(prev => new Set([...prev, record.factoryId || record.factoryName]));
          fetchData();
        } catch (e: any) {
          message.error(String((e as Error)?.message || '推送失败'));
        }
      },
    });
  };

  // 批量终审推送到付款中心
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
      content: `确认将 ${selected.length} 个工厂（共 ${totalOrders} 个订单，总金额 ¥${toMoney(totalAmount)}）终审推送到付款中心？`,
        okText: '确认终审',
      cancelText: '取消',
      onOk: async () => {
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
          message.success(`${selected.length} 个工厂已推送到付款中心`);
          setPushedFactoryIds(prev => new Set([...prev, ...newPushedIds]));
          setSelectedRowKeys([]);
          fetchData();
        } catch (e: any) {
          message.error(String((e as Error)?.message || '批量推送失败'));
        }
      },
    });
  };

  const handleExport = () => {
    if (data.length === 0) {
      message.warning('无数据可导出');
      return;
    }
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
    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, `工厂订单汇总_${dayjs().format('YYYYMMDDHHmmss')}.xlsx`);
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
                  <Tag color="orange" style={{ margin: 0, fontSize: 11 }}>内部</Tag>
                </Tooltip>
              )}
              {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 11 }}>外部</Tag>}
            </Space>
            {record.orgPath || record.parentOrgUnitName ? (
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 12, marginTop: 4 }}>
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
      render: (v: unknown) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
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
          <Button type="primary" htmlType="submit">查询</Button>
          <Button onClick={() => { form.resetFields(); fetchData(); }}>重置</Button>
        </Space>
      </Form.Item>
    </Form>
  );

  return (
    <div>
      {showSmartErrorNotice && smartError ? (
        <Card size="small" style={{ marginBottom: 12 }}>
          <SmartErrorNotice
            error={smartError}
            onFix={() => {
              void fetchData();
            }}
          />
        </Card>
      ) : null}

      {/* 汇总卡片 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>工厂数</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--primary-color)' }}>
            {filteredData.length}
          </div>
        </Card>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>订单总数</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {summary.totalOrders}
          </div>
        </Card>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>入库总量</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>
            {summary.totalWarehoused.toLocaleString()}
          </div>
        </Card>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>总金额</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--primary-color)' }}>
            ¥{toMoney(summary.totalAmount)}
          </div>
        </Card>
        <Card size="small" style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: '#999' }}>总利润</div>
          <div style={{
            fontSize: 20,
            fontWeight: 600,
            color: summary.totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
          }}>
            ¥{toMoney(summary.totalProfit)}
          </div>
        </Card>
      </div>

      {/* 工厂绩效榜 */}
      {leaderboard.length > 0 && (
        <Card
          size="small"
          style={{ marginBottom: 12 }}
          loading={lbLoading}
          title={
            <span style={{ fontSize: 13, fontWeight: 600 }}> 工厂绩效榜</span>
          }
          extra={
            <Button type="link" size="small" onClick={() => setLbCollapsed(!lbCollapsed)} style={{ padding: 0 }}>
              {lbCollapsed ? '展开' : '收起'}
            </Button>
          }
        >
          {!lbCollapsed && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {leaderboard.map((r) => {
                const scoreColor = r.totalScore >= 80 ? '#52c41a' : r.totalScore >= 60 ? '#fa8c16' : '#ff4d4f';
                return (
                  <div key={r.factoryId} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 6,
                    background: 'var(--background-secondary, #f8f9fa)',
                    border: '1px solid var(--border-color, #e8e8e8)',
                    minWidth: 190,
                  }}>
                    <span style={{ fontSize: 16 }}>{r.medal || `#${r.rank}`}</span>
                    <span style={{ fontWeight: 600, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.factoryName}
                    </span>
                    <Tooltip title={`质量${r.qualityScore} · 速度${r.speedScore} · 交期${r.deliveryScore} · 成本${r.costScore}`}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor }}>{r.totalScore}</span>
                    </Tooltip>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 搜索 & 工具栏 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        {searchFields}
      </Card>
      <StandardToolbar
        left={
          <Space>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handleBatchApprove}
            >
              批量终审推送 ({selectedRowKeys.length})
            </Button>
            <Button
              icon={<PrinterOutlined />}
              disabled={selectedRowKeys.length === 0}
              onClick={handlePrintStatement}
            >
              打印对账单 ({selectedRowKeys.length})
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={data.length === 0}
            >
              导出汇总
            </Button>
          </Space>
        }
        right={
          <Button icon={<ReloadOutlined />} onClick={fetchData}>
            刷新
          </Button>
        }
      />

      {/* 数据表格 */}
      <ResizableTable
        columns={columns}
        dataSource={filteredData}
        rowKey="factoryName"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={false}
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
              <ResizableTable.Summary.Cell index={5} />
              <ResizableTable.Summary.Cell index={6} />
              <ResizableTable.Summary.Cell index={7} />
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
        dateRange={getDateRange()}
      />
    </div>
  );
};

export default FactorySummaryContent;
