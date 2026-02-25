import React, { useEffect, useState, useCallback } from 'react';
import { Card, Input, Select, Button, Tag, Space, message, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTimeSecond } from '@/utils/datetime';
import api from '@/utils/api';

interface LogisticsRecord {
  id: number;
  orderId: string;
  companyCode: string;
  companyName: string;
  trackingNumber: string | null;
  status: string;
  senderName: string | null;
  senderPhone: string | null;
  receiverName: string | null;
  receiverPhone: string | null;
  lastEvent: string | null;
  lastEventTime: string | null;
  deliveredTime: string | null;
  errorMessage: string | null;
  createdTime: string;
}

interface Props { active: boolean; }

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  CREATED:    { color: 'default',    text: '已创建' },
  IN_TRANSIT: { color: 'processing', text: '运输中' },
  ARRIVED:    { color: 'cyan',       text: '已到达' },
  DELIVERED:  { color: 'success',    text: '已签收' },
  CANCELLED:  { color: 'default',    text: '已取消' },
  FAILED:     { color: 'error',      text: '下单失败' },
};

const LogisticsRecordsTab: React.FC<Props> = ({ active }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LogisticsRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ companyCode?: string; status?: string; orderId?: string }>({});

  const fetchData = useCallback(async (pg = page, ps = pageSize, fl = filters) => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { records: LogisticsRecord[]; total: number } }>(
        '/integration/logistics-records/list',
        { page: pg, pageSize: ps, ...fl }
      );
      if (res.code === 200) {
        setData(res.data.records || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      message.error('获取物流运单失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  useEffect(() => { if (active) fetchData(); }, [active, fetchData]);

  const handleSearch = () => { setPage(1); fetchData(1, pageSize, filters); };
  const handleReset = () => {
    const empty = {};
    setFilters(empty);
    setPage(1);
    fetchData(1, pageSize, empty);
  };

  const columns: ColumnsType<LogisticsRecord> = [
    { title: '下单时间', dataIndex: 'createdTime', width: 160,
      render: (v: string) => formatDateTimeSecond(v) },
    { title: '系统订单号', dataIndex: 'orderId', width: 150,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '物流公司', dataIndex: 'companyName', width: 100,
      render: (v: string, r: LogisticsRecord) => (
        <Tag color="geekblue">{v || r.companyCode}</Tag>
      ) },
    { title: '运单号', dataIndex: 'trackingNumber', width: 160,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span></Tooltip>
        : <span style={{ color: '#999' }}>-</span> },
    { title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      } },
    { title: '寄件人', dataIndex: 'senderName', width: 100,
      render: (v: string | null, r: LogisticsRecord) =>
        v ? <span>{v}  {r.senderPhone}</span> : '-' },
    { title: '收件人', dataIndex: 'receiverName', width: 100,
      render: (v: string | null, r: LogisticsRecord) =>
        v ? <span>{v}  {r.receiverPhone}</span> : '-' },
    { title: '最新动态', dataIndex: 'lastEvent', ellipsis: true,
      render: (v: string | null, r: LogisticsRecord) =>
        v ? <Tooltip title={`${v}  ${r.lastEventTime ? formatDateTimeSecond(r.lastEventTime) : ''}`}>{v}</Tooltip>
          : '-' },
    { title: '签收时间', dataIndex: 'deliveredTime', width: 160,
      render: (v: string | null) => v ? formatDateTimeSecond(v) : '-' },
  ];

  return (
    <div style={{ paddingTop: 16 }}>
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }} bordered={false}>
        <Space wrap>
          <Select placeholder="物流公司" allowClear style={{ width: 120 }}
            value={filters.companyCode} onChange={v => setFilters(f => ({ ...f, companyCode: v }))}>
            <Select.Option value="SF">顺丰速运</Select.Option>
            <Select.Option value="STO">申通快递</Select.Option>
          </Select>
          <Select placeholder="状态" allowClear style={{ width: 110 }}
            value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v.text}</Select.Option>
            ))}
          </Select>
          <Input placeholder="系统订单号" allowClear style={{ width: 180 }}
            value={filters.orderId} onChange={e => setFilters(f => ({ ...f, orderId: e.target.value }))} />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>查询</Button>
          <Button icon={<ReloadOutlined />} onClick={handleReset}>重置</Button>
        </Space>
      </Card>

      <ResizableTable
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true, showQuickJumper: true,
          showTotal: (t: number) => `共 ${t} 条`,
          onChange: (p: number, ps: number) => { setPage(p); setPageSize(ps); fetchData(p, ps, filters); },
        }}
        scroll={{ x: 1100 }}
      />
    </div>
  );
};

export default LogisticsRecordsTab;
