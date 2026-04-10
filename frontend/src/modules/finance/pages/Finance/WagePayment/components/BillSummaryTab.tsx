import React, { useState, useCallback, useEffect } from 'react';
import { App, Button, Card, DatePicker, Input, Select, Space, Statistic, Tag } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  SearchOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import {
  billAggregationApi,
  type BillAggregation,
  type BillQueryRequest,
  type BillStats,
  BILL_TYPE_MAP,
  BILL_CATEGORY_MAP,
  BILL_STATUS_MAP,
  BILL_TYPE_OPTIONS,
  BILL_CATEGORY_OPTIONS,
  BILL_STATUS_OPTIONS,
} from '@/services/finance/billAggregationApi';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';

/** 账单汇总 Tab — 展示所有模块推送过来的账单 */
const BillSummaryTab: React.FC = () => {
  const { message: msg, modal } = App.useApp();

  // ---- 数据 ----
  const [bills, setBills] = useState<BillAggregation[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<BillStats>({ pendingAmount: 0, pendingCount: 0, confirmedAmount: 0, confirmedCount: 0, settledAmount: 0, settledCount: 0 });
  const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

  // ---- 筛选 ----
  const [query, setQuery] = useState<BillQueryRequest>({ pageNum: 1, pageSize: 20 });

  // ---- 数据加载 ----
  const fetchBills = useCallback(async (q?: BillQueryRequest) => {
    setLoading(true);
    try {
      const params = q || query;
      const res: any = await billAggregationApi.listBills(params);
      const page = res?.data ?? res;
      setBills(page?.records ?? []);
      setTotal(page?.total ?? 0);
    } catch (err: unknown) {
      msg.error(`加载账单失败: ${err instanceof Error ? err.message : '请检查网络'}`);
    } finally {
      setLoading(false);
    }
  }, [query, msg]);

  const fetchStats = useCallback(async () => {
    try {
      const res: any = await billAggregationApi.getStats(query.billType || undefined);
      setStats(res?.data ?? res ?? {});
    } catch {
      // stats 加载失败不阻塞主流程
    }
  }, [query.billType]);

  useEffect(() => { fetchBills(); }, [fetchBills]);
  useEffect(() => { fetchStats(); }, [fetchStats]);

  // ---- 操作 ----
  const handleConfirm = useCallback(async (id: string) => {
    try {
      await billAggregationApi.confirmBill(id);
      msg.success('确认成功');
      fetchBills();
      fetchStats();
    } catch (err: unknown) {
      msg.error(`确认失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [fetchBills, fetchStats, msg]);

  const handleBatchConfirm = useCallback(async () => {
    if (!selectedKeys.length) { msg.warning('请选择要确认的账单'); return; }
    try {
      const count = await billAggregationApi.batchConfirm(selectedKeys as string[]);
      msg.success(`成功确认 ${(count as any)?.data ?? count} 条账单`);
      setSelectedKeys([]);
      fetchBills();
      fetchStats();
    } catch (err: unknown) {
      msg.error(`批量确认失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  }, [selectedKeys, fetchBills, fetchStats, msg]);

  const handleCancel = useCallback(async (record: BillAggregation) => {
    modal.confirm({
      title: '取消账单',
      content: `确定取消账单 ${record.billNo} 吗？`,
      onOk: async () => {
        try {
          await billAggregationApi.cancelBill(record.id, '手动取消');
          msg.success('取消成功');
          fetchBills();
          fetchStats();
        } catch (err: unknown) {
          msg.error(`取消失败: ${err instanceof Error ? err.message : '未知错误'}`);
        }
      },
    });
  }, [fetchBills, fetchStats, msg, modal]);

  // ---- 筛选变更 ----
  const updateQuery = useCallback((patch: Partial<BillQueryRequest>) => {
    setQuery(prev => {
      const next = { ...prev, ...patch, pageNum: 1 };
      fetchBills(next);
      return next;
    });
  }, [fetchBills]);

  // ---- 表格列 ----
  const columns: ColumnsType<BillAggregation> = [
    {
      title: '账单编号', dataIndex: 'billNo', key: 'billNo', width: 180,
      render: (v: string) => <span style={{ fontFamily: 'monospace' }}>{v}</span>,
    },
    {
      title: '类型', dataIndex: 'billType', key: 'billType', width: 80,
      render: (v: string) => {
        const m = BILL_TYPE_MAP[v];
        return m ? <Tag color={m.color}>{m.text}</Tag> : v;
      },
    },
    {
      title: '分类', dataIndex: 'billCategory', key: 'billCategory', width: 90,
      render: (v: string) => {
        const m = BILL_CATEGORY_MAP[v];
        return m ? <Tag color={m.color}>{m.text}</Tag> : v;
      },
    },
    {
      title: '对方名称', dataIndex: 'counterpartyName', key: 'counterpartyName', width: 140, ellipsis: true,
    },
    {
      title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true,
    },
    {
      title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true,
    },
    {
      title: '金额', dataIndex: 'amount', key: 'amount', width: 120, align: 'right',
      render: (v: number) => <span style={{ fontWeight: 600 }}>¥{(v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</span>,
    },
    {
      title: '已结算', dataIndex: 'settledAmount', key: 'settledAmount', width: 110, align: 'right',
      render: (v: number) => `¥${(v ?? 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 90,
      render: (v: string) => {
        const m = BILL_STATUS_MAP[v];
        return m ? <Tag color={m.color}>{m.text}</Tag> : v;
      },
    },
    {
      title: '结算月', dataIndex: 'settlementMonth', key: 'settlementMonth', width: 100,
    },
    {
      title: '来源单号', dataIndex: 'sourceNo', key: 'sourceNo', width: 150, ellipsis: true,
    },
    {
      title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
    },
    {
      title: '操作', key: 'actions', width: 140, fixed: 'right',
      render: (_: unknown, record: BillAggregation) => {
        if (record.status === 'PENDING') {
          return (
            <Space size={4}>
              <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleConfirm(record.id)}>确认</Button>
              <Button type="link" size="small" danger icon={<CloseCircleOutlined />} onClick={() => handleCancel(record)}>取消</Button>
            </Space>
          );
        }
        return <span style={{ color: '#999' }}>-</span>;
      },
    },
  ];

  return (
    <div>
      {/* 统计卡片 */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
        <Card size="small" style={{ flex: 1 }}>
          <Statistic title="待确认" value={stats.pendingAmount ?? 0} prefix="¥" precision={2}
            suffix={<span style={{ fontSize: 12, color: '#999' }}>{stats.pendingCount ?? 0}笔</span>} />
        </Card>
        <Card size="small" style={{ flex: 1 }}>
          <Statistic title="已确认" value={stats.confirmedAmount ?? 0} prefix="¥" precision={2} valueStyle={{ color: '#1677ff' }}
            suffix={<span style={{ fontSize: 12, color: '#999' }}>{stats.confirmedCount ?? 0}笔</span>} />
        </Card>
        <Card size="small" style={{ flex: 1 }}>
          <Statistic title="已结清" value={stats.settledAmount ?? 0} prefix="¥" precision={2} valueStyle={{ color: '#52c41a' }}
            suffix={<span style={{ fontSize: 12, color: '#999' }}>{stats.settledCount ?? 0}笔</span>} />
        </Card>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Select style={{ width: 100 }} options={BILL_TYPE_OPTIONS} value={query.billType || ''} onChange={v => updateQuery({ billType: v || undefined })} />
        <Select style={{ width: 100 }} options={BILL_CATEGORY_OPTIONS} value={query.billCategory || ''} onChange={v => updateQuery({ billCategory: v || undefined })} />
        <Select style={{ width: 100 }} options={BILL_STATUS_OPTIONS} value={query.status || ''} onChange={v => updateQuery({ status: v || undefined })} />
        <DatePicker picker="month" placeholder="结算月" allowClear
          onChange={(_d, ds) => updateQuery({ settlementMonth: (ds as string) || undefined })} />
        <Input style={{ width: 160 }} placeholder="对方名称" allowClear prefix={<SearchOutlined />}
          onPressEnter={e => updateQuery({ counterpartyName: (e.target as HTMLInputElement).value || undefined })} />
        <Input style={{ width: 160 }} placeholder="订单号" allowClear prefix={<FileTextOutlined />}
          onPressEnter={e => updateQuery({ orderNo: (e.target as HTMLInputElement).value || undefined })} />
        {selectedKeys.length > 0 && (
          <Button type="primary" icon={<CheckCircleOutlined />} onClick={handleBatchConfirm}>
            批量确认({selectedKeys.length})
          </Button>
        )}
      </div>

      {/* 表格 */}
      <ResizableTable
        columns={columns}
        dataSource={bills}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1600 }}
        size="small"
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: setSelectedKeys,
          getCheckboxProps: (record: BillAggregation) => ({ disabled: record.status !== 'PENDING' }),
        }}
        pagination={{
          current: query.pageNum,
          pageSize: query.pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (page: number, size: number) => {
            const next = { ...query, pageNum: page, pageSize: size };
            setQuery(next);
            fetchBills(next);
          },
        }}
      />
    </div>
  );
};

export default BillSummaryTab;
