import React, { useState, useCallback, useEffect } from 'react';
import { Card, Input, Button, Tag, Space, Statistic, Empty, App, DatePicker } from 'antd';
import { SearchOutlined, ReloadOutlined, DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatMoney } from '@/utils/format';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { readPageSize } from '@/utils/pageSizeStore';
import type { ShipmentReconciliation } from '@/types/finance';

const { RangePicker } = DatePicker;

interface FilterState {
  orderNo: string;
  styleNo: string;
  customerName: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  status: string;
}

const statusColors: Record<string, string> = {
  pending: 'orange',
  verified: 'blue',
  approved: 'green',
  paid: 'cyan',
  rejected: 'red',
};

const ShipmentReconContent: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ShipmentReconciliation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPageSize(20));
  const [filters, setFilters] = useState<FilterState>({
    orderNo: '',
    styleNo: '',
    customerName: '',
    dateRange: null,
    status: '',
  });
  const [pendingFilters, setPendingFilters] = useState<FilterState>({ ...filters });

  const fetchData = useCallback(async (currentPage: number, currentPageSize: number, f: FilterState) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = {
        page: currentPage,
        pageSize: currentPageSize,
      };
      if (f.orderNo) params.orderNo = f.orderNo;
      if (f.styleNo) params.styleNo = f.styleNo;
      if (f.customerName) params.customerName = f.customerName;
      if (f.status) params.status = f.status;
      if (f.dateRange?.[0]) params.startDate = f.dateRange[0].format('YYYY-MM-DD');
      if (f.dateRange?.[1]) params.endDate = f.dateRange[1].format('YYYY-MM-DD');

      const res = await api.get('/finance/shipment-reconciliation/list', { params });
      const records = res.data?.records ?? res.data ?? [];
      setData(Array.isArray(records) ? records : []);
      setTotal(res.data?.total ?? 0);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '加载出货对账单失败';
      message.error(errMsg);
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    fetchData(page, pageSize, filters);
  }, [page, pageSize, filters, fetchData]);

  const handleSearch = () => {
    setFilters({ ...pendingFilters });
    setPage(1);
  };

  const handleReset = () => {
    const empty: FilterState = { orderNo: '', styleNo: '', customerName: '', dateRange: null, status: '' };
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
      if (filters.customerName) params.customerName = filters.customerName;
      if (filters.status) params.status = filters.status;
      if (filters.dateRange?.[0]) params.startDate = filters.dateRange[0].format('YYYY-MM-DD');
      if (filters.dateRange?.[1]) params.endDate = filters.dateRange[1].format('YYYY-MM-DD');

      const queryString = new URLSearchParams(Object.entries(params)).toString();
      window.open(`/api/finance/shipment-reconciliation/export?${queryString}`, '_blank');
      message.success('导出开始...');
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '导出失败';
      message.error(errMsg);
    }
  };

  const stats = {
    totalCount: total,
    totalAmount: data.reduce((s, r) => s + Number(r.totalAmount || 0), 0),
    totalDeduction: data.reduce((s, r) => s + Number(r.deductionAmount || 0), 0),
    totalFinalAmount: data.reduce((s, r) => s + Number(r.finalAmount || 0), 0),
  };

  const columns: ColumnsType<ShipmentReconciliation> = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 150, ellipsis: true },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true },
    { title: '客户', dataIndex: 'customerName', key: 'customerName', width: 150, ellipsis: true },
    { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 80, align: 'right', render: (v) => v?.toLocaleString() ?? '-' },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right', render: (v) => formatMoney(v) },
    { title: '总金额', dataIndex: 'totalAmount', key: 'totalAmount', width: 120, align: 'right', render: (v) => formatMoney(v) },
    { title: '扣款', dataIndex: 'deductionAmount', key: 'deductionAmount', width: 100, align: 'right', render: (v) => formatMoney(v) },
    {
      title: '最终金额',
      dataIndex: 'finalAmount',
      key: 'finalAmount',
      width: 120,
      align: 'right',
      render: (v) => <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{formatMoney(v)}</span>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => <Tag color={statusColors[v] || 'default'}>{v || '-'}</Tag>,
    },
    {
      title: '对账日期',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (v: string) => v || '-',
    },
  ];

  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>对账单数</span>} value={stats.totalCount} valueStyle={{ fontSize: 20, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>总金额</span>} value={stats.totalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 20, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>扣款合计</span>} value={stats.totalDeduction} precision={2} prefix="¥" valueStyle={{ fontSize: 20, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '10px 14px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>最终金额</span>} value={stats.totalFinalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 20, fontWeight: 500, color: 'var(--primary-color)' }} />
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
            statusValue={pendingFilters.status}
            onStatusChange={(v) => setPendingFilters((f) => ({ ...f, status: v || '' }))}
            statusOptions={[
              { label: '全部', value: '' },
              { label: '待对账', value: 'pending' },
              { label: '已确认', value: 'verified' },
              { label: '已审批', value: 'approved' },
              { label: '已付款', value: 'paid' },
              { label: '已驳回', value: 'rejected' },
            ]}
          />
          <Input
            placeholder="客户名称"
            allowClear
            style={{ width: 140 }}
            value={pendingFilters.customerName}
            onChange={(e) => setPendingFilters((f) => ({ ...f, customerName: e.target.value }))}
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
        rowKey="id"
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
        locale={{ emptyText: <Empty description="暂无对账单记录" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
      />
    </Card>
  );
};

export default ShipmentReconContent;
