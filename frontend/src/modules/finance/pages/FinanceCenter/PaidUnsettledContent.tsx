import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Card, Input, Button, Tag, Space, Statistic, Empty, App, Dropdown, Modal, message } from 'antd';
import { SearchOutlined, ReloadOutlined, DownloadOutlined, MoreOutlined, CheckCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatMoney } from '@/utils/format';
import api from '@/utils/api';
import logger from '@/utils/logger';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import RowActions from '@/components/common/RowActions';
import { readPageSize } from '@/utils/pageSizeStore';

interface FinishedSettlementRow {
  orderId: string;
  orderNo: string;
  styleNo: string;
  factoryId: string;
  factoryName: string;
  factoryType?: 'INTERNAL' | 'EXTERNAL';
  orderQuantity: number;
  warehousedQuantity: number;
  totalAmount: number;
  paymentStatus?: 'unpaid' | 'partially_paid' | 'paid';
  approvalStatus?: string;
  status?: string;
  createTime?: string;
  completeTime?: string;
  [key: string]: unknown;
}

interface FilterState {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
}

const PaidUnsettledContent: React.FC = () => {
  const { message: msg } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<FinishedSettlementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPageSize(20));
  const [filters, setFilters] = useState<FilterState>({
    orderNo: '',
    styleNo: '',
    factoryName: '',
    dateRange: null,
  });
  const [pendingFilters, setPendingFilters] = useState<FilterState>({ ...filters });

  const fetchData = useCallback(async (currentPage: number, currentPageSize: number, f: FilterState) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: currentPage,
        pageSize: currentPageSize,
        factoryType: 'EXTERNAL',
      };
      if (f.orderNo) params.orderNo = f.orderNo;
      if (f.styleNo) params.styleNo = f.styleNo;
      if (f.factoryName) params.factoryName = f.factoryName;
      if (f.dateRange?.[0]) params.startDate = f.dateRange[0].format('YYYY-MM-DD');
      if (f.dateRange?.[1]) params.endDate = f.dateRange[1].format('YYYY-MM-DD');

      const res = await api.get('/finance/finished-settlement/list', { params });
      const allRecords = res.data?.records ?? res.data ?? [];
      const records = Array.isArray(allRecords) ? allRecords : [];

      // 过滤：status='approved' 或 approvalStatus='APPROVED' 且 paymentStatus='unpaid' 或 'partially_paid'
      const filtered = records.filter((r: FinishedSettlementRow) => {
        const isApproved = r.approvalStatus === 'APPROVED' || r.status === 'approved';
        const isUnpaid = r.paymentStatus === 'unpaid' || r.paymentStatus === 'partially_paid';
        return isApproved && isUnpaid;
      });

      setData(filtered);
      setTotal(filtered.length);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '加载已审未付数据失败';
      msg.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [msg]);

  useEffect(() => {
    fetchData(page, pageSize, filters);
  }, [page, pageSize, filters, fetchData]);

  const handleSearch = () => {
    setFilters({ ...pendingFilters });
    setPage(1);
  };

  const handleReset = () => {
    const empty: FilterState = { orderNo: '', styleNo: '', factoryName: '', dateRange: null };
    setPendingFilters(empty);
    setFilters(empty);
    setPage(1);
  };

  const handleTableChange = (pagination: { current?: number; pageSize?: number }) => {
    setPage(pagination.current || 1);
    setPageSize(pagination.pageSize || 20);
  };

  const handleExport = async () => {
    try {
      const params: Record<string, string> = {};
      if (filters.orderNo) params.orderNo = filters.orderNo;
      if (filters.styleNo) params.styleNo = filters.styleNo;
      if (filters.factoryName) params.factoryName = filters.factoryName;
      if (filters.dateRange?.[0]) params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
      if (filters.dateRange?.[1]) params.endDate = filters.dateRange[1].format('YYYY-MM-DD');
      params.factoryType = 'EXTERNAL';

      const queryString = new URLSearchParams(Object.entries(params)).toString();
      window.open(`/api/finance/finished-settlement/export?${queryString}`, '_blank');
      msg.success('导出开始...');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '导出失败';
      msg.error(errMsg);
    }
  };

  const stats = useMemo(() => {
    const totalAmount = data.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
    return { count: data.length, totalAmount };
  }, [data]);

  const approvalStatusMap: Record<string, { text: string; color: string }> = {
    PENDING: { text: '待审批', color: 'orange' },
    APPROVED: { text: '已审批', color: 'success' },
    REJECTED: { text: '已驳回', color: 'error' },
    pending: { text: '待审批', color: 'orange' },
    approved: { text: '已审批', color: 'success' },
    rejected: { text: '已驳回', color: 'error' },
  };

  const orderStatusMap: Record<string, { text: string; color: string }> = {
    PENDING: { text: '待生产', color: 'var(--color-warning)' },
    CONFIRMED: { text: '已确认', color: 'var(--primary-color)' },
    IN_PRODUCTION: { text: '生产中', color: 'var(--color-success)' },
    COMPLETED: { text: '已完成', color: 'var(--info-color)' },
    CANCELLED: { text: '已取消', color: 'var(--color-danger)' },
    CLOSED: { text: '已关单', color: 'blue' },
    SCRAPPED: { text: '已报废', color: 'var(--color-danger)' },
    ARCHIVED: { text: '已归档', color: 'default' },
    PAUSED: { text: '已暂停', color: 'var(--color-warning)' },
    RETURNED: { text: '已退回', color: 'var(--color-warning)' },
    pending: { text: '待生产', color: 'var(--color-warning)' },
    confirmed: { text: '已确认', color: 'var(--primary-color)' },
    in_production: { text: '生产中', color: 'var(--color-success)' },
    production: { text: '生产中', color: 'var(--color-success)' },
    completed: { text: '已完成', color: 'var(--info-color)' },
    cancelled: { text: '已取消', color: 'var(--color-danger)' },
    closed: { text: '已关单', color: 'blue' },
    scrapped: { text: '已报废', color: 'var(--color-danger)' },
    archived: { text: '已归档', color: 'default' },
    paused: { text: '已暂停', color: 'var(--color-warning)' },
    returned: { text: '已退回', color: 'var(--color-warning)' },
    delayed: { text: '已逾期', color: 'var(--color-danger)' },
  };

  const columns: ColumnsType<FinishedSettlementRow> = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
    {
      title: '工厂',
      key: 'factory',
      width: 200,
      render: (_: any, record: FinishedSettlementRow) => (
        <Space>
          {record.factoryType === 'INTERNAL' && <Tag color="orange" style={{ margin: 0, fontSize: 12 }}>内部</Tag>}
          {record.factoryType === 'EXTERNAL' && <Tag color="purple" style={{ margin: 0, fontSize: 12 }}>外部</Tag>}
          <span style={{ color: record.factoryType === 'INTERNAL' ? 'var(--color-warning)' : undefined }}>{record.factoryName || '-'}</span>
        </Space>
      ),
    },
    {
      title: '订单状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => {
        const config = orderStatusMap[v] || orderStatusMap[v?.toLowerCase()] || orderStatusMap[v?.toUpperCase()];
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{v || '-'}</Tag>;
      },
    },
    { title: '下单数', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 80, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
    { title: '入库数', dataIndex: 'warehousedQuantity', key: 'warehousedQuantity', width: 80, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
    {
      title: '结算金额',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 120,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatMoney(v)}</span>,
    },
    {
      title: '付款状态',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      width: 100,
      render: (v: string) => {
        const colorMap: Record<string, string> = { unpaid: 'orange', partially_paid: 'blue', paid: 'green' };
        const textMap: Record<string, string> = { unpaid: '未付款', partially_paid: '部分付款', paid: '已付款' };
        return <Tag color={colorMap[v] || 'default'}>{textMap[v] || v || '-'}</Tag>;
      },
    },
    {
      title: '审批状态',
      dataIndex: 'approvalStatus',
      key: 'approvalStatus',
      width: 100,
      render: (v: string) => {
        const config = approvalStatusMap[v] || approvalStatusMap[v?.toLowerCase()] || approvalStatusMap[v?.toUpperCase()];
        return config ? <Tag color={config.color}>{config.text}</Tag> : <Tag>{v || '-'}</Tag>;
      },
    },
    { title: '完成时间', dataIndex: 'completeTime', key: 'completeTime', width: 160, render: (v: string) => v || '-' },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right' as const,
      render: (_: unknown, record: FinishedSettlementRow) => (
        <RowActions
          actions={[
            { key: 'detail', label: '查看详情', onClick: () => logger.debug('查看详情', record.orderId) },
          ]}
        />
      ),
    },
  ];

  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>已审未付订单</span>} value={stats.count} suffix="条" valueStyle={{ fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>待付金额</span>} value={stats.totalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 15, fontWeight: 500, color: 'var(--color-warning)' }} />
        </Card>
      </div>

      {/* 搜索栏 */}
      <div style={{ marginBottom: 12 }}>
        <Space size={12} wrap style={{ marginBottom: 8 }}>
          <StandardSearchBar
            searchValue={pendingFilters.orderNo}
            onSearchChange={(v) => setPendingFilters((f) => ({ ...f, orderNo: v || '' }))}
            searchPlaceholder="订单号/款号"
            dateValue={pendingFilters.dateRange}
            onDateChange={(v) => setPendingFilters((f) => ({ ...f, dateRange: v }))}
          />
          <Input
            placeholder="工厂名称"
            allowClear
            style={{ width: 140 }}
            value={pendingFilters.factoryName}
            onChange={(e) => setPendingFilters((f) => ({ ...f, factoryName: e.target.value }))}
            onPressEnter={handleSearch}
          />
        </Space>
        <Space size={8}>
          <Button type="primary" ghost onClick={handleSearch} icon={<SearchOutlined />}>查询</Button>
          <Button ghost onClick={handleReset} icon={<ReloadOutlined />}>重置</Button>
          <Button ghost onClick={handleExport} icon={<DownloadOutlined />}>导出</Button>
        </Space>
      </div>

      <ResizableTable
        columns={columns}
        dataSource={data}
        rowKey="orderId"
        loading={loading}
        scroll={{ x: 1200 }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => handleTableChange({ current: p, pageSize: ps }),
        }}
        locale={{ emptyText: <Empty description="暂无已审未付记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </Card>
  );
};

export default PaidUnsettledContent;
