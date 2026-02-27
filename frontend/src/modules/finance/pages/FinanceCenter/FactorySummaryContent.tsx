import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, Form, Input, Button, Space, App, Table, Tag, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ReloadOutlined,
  CheckCircleOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StandardToolbar from '@/components/common/StandardToolbar';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';


/** 工厂汇总行数据 */
interface FactorySummaryRow {
  factoryId: string;
  factoryName: string;
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

const toMoney = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

const FactorySummaryContent: React.FC = () => {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FactorySummaryRow[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = useMemo(() => isSmartFeatureEnabled('smart.finance.explain.enabled'), []);

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 汇总统计
  const summary = useMemo(() => {
    const totalOrders = data.reduce((s, r) => s + (r.orderCount || 0), 0);
    const totalQty = data.reduce((s, r) => s + (r.totalOrderQuantity || 0), 0);
    const totalWarehoused = data.reduce((s, r) => s + (r.totalWarehousedQuantity || 0), 0);
    const totalAmount = data.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalProfit = data.reduce((s, r) => s + Number(r.totalProfit || 0), 0);
    return { totalOrders, totalQty, totalWarehoused, totalAmount, totalProfit };
  }, [data]);

  // 推送单个工厂结算到付款中心
  const handleApprove = async (record: FactorySummaryRow) => {
    modal.confirm({
      title: '推送到付款中心',
      content: `确认将工厂「${record.factoryName}」的 ${record.orderCount} 个订单（总金额 ¥${toMoney(record.totalAmount)}）推送到付款中心？`,
      okText: '确认推送',
      cancelText: '取消',
      onOk: async () => {
        try {
          // 推送到付款中心：创建 ORDER_SETTLEMENT 待付款记录
          await api.post('/finance/wage-payment/create-payable', {
            bizType: 'ORDER_SETTLEMENT',
            bizId: record.factoryId || record.factoryName,
            payeeName: record.factoryName,
            amount: record.totalAmount,
            description: `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件`,
            orderNos: record.orderNos,
          });
          message.success(`工厂「${record.factoryName}」已推送到付款中心`);
          fetchData();
        } catch (e: any) {
          message.error(String((e as Error)?.message || '推送失败'));
        }
      },
    });
  };

  // 批量推送到付款中心
  const handleBatchApprove = () => {
    const selected = data.filter(r => selectedRowKeys.includes(r.factoryName));
    if (selected.length === 0) {
      message.warning('请先选择要推送的工厂');
      return;
    }

    const totalAmount = selected.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    const totalOrders = selected.reduce((s, r) => s + (r.orderCount || 0), 0);

    modal.confirm({
      title: '批量推送确认',
      content: `确认将 ${selected.length} 个工厂（共 ${totalOrders} 个订单，总金额 ¥${toMoney(totalAmount)}）推送到付款中心？`,
      okText: '确认推送',
      cancelText: '取消',
      onOk: async () => {
        try {
          for (const record of selected) {
            await api.post('/finance/wage-payment/create-payable', {
              bizType: 'ORDER_SETTLEMENT',
              bizId: record.factoryId || record.factoryName,
              payeeName: record.factoryName,
              amount: record.totalAmount,
              description: `工厂订单结算：${record.orderCount}个订单，共${record.totalWarehousedQuantity}件`,
              orderNos: record.orderNos,
            });
          }
          message.success(`${selected.length} 个工厂已推送到付款中心`);
          setSelectedRowKeys([]);
          fetchData();
        } catch (e: any) {
          message.error(String((e as Error)?.message || '批量推送失败'));
        }
      },
    });
  };

  // 表格列定义
  const columns: ColumnsType<FactorySummaryRow> = [
    {
      title: '工厂名称',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 180,
      render: (text: string) => (
        <Space>
          <ShopOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 500 }}>{text}</span>
        </Space>
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
        const actions: RowAction[] = [
          {
            key: 'push',
            label: '推送付款',
            primary: true,
            onClick: () => handleApprove(record),
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
            {data.length}
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
              批量推送付款 ({selectedRowKeys.length})
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
        dataSource={data}
        rowKey="factoryName"
        loading={loading}
        scroll={{ x: 1400 }}
        pagination={false}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        summary={() => (
          <Table.Summary fixed>
            <Table.Summary.Row>
              <Table.Summary.Cell index={0} colSpan={2}>
                <strong>合计 ({data.length} 个工厂)</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={2} align="center">
                <strong>{summary.totalOrders}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={3} align="right">
                <strong>{summary.totalQty.toLocaleString()}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={4} align="right">
                <strong>{summary.totalWarehoused.toLocaleString()}</strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={5} />
              <Table.Summary.Cell index={6} />
              <Table.Summary.Cell index={7} />
              <Table.Summary.Cell index={8} align="right">
                <strong style={{ color: 'var(--primary-color)' }}>
                  ¥{toMoney(summary.totalAmount)}
                </strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={9} align="right">
                <strong style={{ color: summary.totalProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  ¥{toMoney(summary.totalProfit)}
                </strong>
              </Table.Summary.Cell>
              <Table.Summary.Cell index={10} />
              <Table.Summary.Cell index={11} />
            </Table.Summary.Row>
          </Table.Summary>
        )}
      />
    </div>
  );
};

export default FactorySummaryContent;
