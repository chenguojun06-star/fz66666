import React, { useState, useCallback, useEffect } from 'react';
import { Card, Input, Button, Tag, Space, Statistic, Empty, App, DatePicker, Modal, message } from 'antd';
import { SearchOutlined, ReloadOutlined, DownloadOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { formatMoney } from '@/utils/format';
import api from '@/utils/api';
import ResizableTable from '@/components/common/ResizableTable';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { readPageSize } from '@/utils/pageSizeStore';
import RowActions from '@/components/common/RowActions';
import { MATERIAL_RECON_STATUS_MAP } from '@/constants/statusMaps';
import type { ShipmentReconciliation } from '@/types/finance';

const { RangePicker } = DatePicker;

interface FilterState {
  orderNo: string;
  styleNo: string;
  customerName: string;
  dateRange: [Dayjs | null, Dayjs | null] | null;
  status: string;
}

const ShipmentReconContent: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ShipmentReconciliation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => readPageSize(20));
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
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

  // 对账确认（单条）
  const handleConfirmReconciliation = async (record: ShipmentReconciliation) => {
    if (record.status !== 'pending') {
      message.warning('只有待对账状态的记录可以确认');
      return;
    }
    Modal.confirm({
      title: '确认对账',
      icon: <ExclamationCircleOutlined />,
      content: `确认对账单 ${record.orderNo || record.id}？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          await api.post(`/finance/shipment-reconciliation/${record.id}/status-action`, null, {
            params: { action: 'update', status: 'verified' },
          });
          message.success('对账确认成功');
          fetchData(page, pageSize, filters);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : '对账确认失败';
          message.error(errMsg);
        }
      },
    });
  };

  // 批量对账确认
  const handleBatchConfirm = async () => {
    const eligible = data.filter(r =>
      selectedRowKeys.includes(r.id ?? '') && r.status === 'pending'
    );
    if (eligible.length === 0) {
      message.warning('请选择待对账状态的记录');
      return;
    }
    Modal.confirm({
      title: '批量对账确认',
      icon: <ExclamationCircleOutlined />,
      content: `确认对账 ${eligible.length} 条记录？`,
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        try {
          const results = await Promise.allSettled(
            eligible.map(r => api.post(`/finance/shipment-reconciliation/${r.id}/status-action`, null, {
              params: { action: 'update', status: 'verified' },
            }))
          );
          const succeeded = results.filter(r => r.status === 'fulfilled').length;
          if (succeeded > 0) message.success(`成功确认 ${succeeded} 条对账单`);
          if (results.some(r => r.status === 'rejected')) message.warning('部分对账单确认失败');
          setSelectedRowKeys([]);
          fetchData(page, pageSize, filters);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : '批量对账失败';
          message.error(errMsg);
        }
      },
    });
  };

  // 批量审批
  const handleBatchApprove = async () => {
    const eligible = data.filter(r =>
      selectedRowKeys.includes(r.id ?? '') && r.status === 'verified'
    );
    if (eligible.length === 0) {
      message.warning('请选择已确认状态的记录');
      return;
    }
    Modal.confirm({
      title: '批量审批',
      icon: <ExclamationCircleOutlined />,
      content: `审批 ${eligible.length} 条已确认的对账单？`,
      okText: '审批',
      cancelText: '取消',
      onOk: async () => {
        try {
          const results = await Promise.allSettled(
            eligible.map(r => api.post(`/finance/shipment-reconciliation/${r.id}/status-action`, null, {
              params: { action: 'update', status: 'approved' },
            }))
          );
          const succeeded = results.filter(r => r.status === 'fulfilled').length;
          if (succeeded > 0) message.success(`成功审批 ${succeeded} 条对账单`);
          if (results.some(r => r.status === 'rejected')) message.warning('部分对账单审批失败');
          setSelectedRowKeys([]);
          fetchData(page, pageSize, filters);
        } catch (e: unknown) {
          const errMsg = e instanceof Error ? e.message : '批量审批失败';
          message.error(errMsg);
        }
      },
    });
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
      render: (v: string) => {
        // 用统一状态映射，显示"待核实/已核实/已审批/已付款/已驳回"，避免直接显示英文状态码
        const cfg = MATERIAL_RECON_STATUS_MAP[v];
        return <Tag color={cfg?.color || 'default'}>{cfg?.text || '未知'}</Tag>;
      },
    },
    {
      title: '对账日期',
      dataIndex: 'reconciliationDate',
      key: 'reconciliationDate',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: ShipmentReconciliation) => (
        <RowActions
          actions={[
            {
              key: 'confirm',
              label: '确认',
              primary: record.status === 'pending',
              disabled: record.status !== 'pending',
              onClick: () => handleConfirmReconciliation(record),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Card styles={{ body: { padding: '16px 20px' } }}>
      {/* 统计卡片 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>对账单数</span>} value={stats.totalCount} valueStyle={{ fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>总金额</span>} value={stats.totalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>扣款合计</span>} value={stats.totalDeduction} precision={2} prefix="¥" valueStyle={{ fontSize: 15, fontWeight: 500 }} />
        </Card>
        <Card size="small" style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)', background: 'var(--color-fill-tertiary)' }} styles={{ body: { padding: '5px 10px' } }}>
          <Statistic title={<span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>最终金额</span>} value={stats.totalFinalAmount} precision={2} prefix="¥" valueStyle={{ fontSize: 15, fontWeight: 500, color: 'var(--primary-color)' }} />
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
          {selectedRowKeys.length > 0 && (
            <>
              <Button
                type="primary"
                ghost
                onClick={handleBatchConfirm}
                disabled={!data.some(r => r.id && selectedRowKeys.includes(r.id) && r.status === 'pending')}
              >
                批量确认 ({selectedRowKeys.filter(id => data.find(r => r.id === id && r.status === 'pending')).length})
              </Button>
              <Button
                type="primary"
                ghost
                onClick={handleBatchApprove}
                disabled={!data.some(r => r.id && selectedRowKeys.includes(r.id) && r.status === 'verified')}
              >
                批量审批 ({selectedRowKeys.filter(id => data.find(r => r.id === id && r.status === 'verified')).length})
              </Button>
            </>
          )}
        </Space>
      </div>

      <ResizableTable
        columns={columns}
        dataSource={data}
        rowKey="id"
        loading={loading}
        scroll={{ x: 1400 }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys: React.Key[]) => setSelectedRowKeys(keys as string[]),
        }}
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
