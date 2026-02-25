import React, { useEffect, useState, useCallback } from 'react';
import { Card, Input, Select, Button, Tag, Space, message, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTimeSecond } from '@/utils/datetime';
import api from '@/utils/api';

interface PaymentRecord {
  id: number;
  orderId: string;
  channel: string;
  amount: number;
  actualAmount: number | null;
  status: string;
  thirdPartyOrderId: string | null;
  errorMessage: string | null;
  paidTime: string | null;
  createdTime: string;
}

interface Props { active: boolean; }

const STATUS_MAP: Record<string, { color: string; text: string }> = {
  PENDING:   { color: 'processing', text: '待支付' },
  SUCCESS:   { color: 'success',    text: '支付成功' },
  FAILED:    { color: 'error',      text: '失败' },
  REFUNDED:  { color: 'warning',    text: '已退款' },
  CANCELLED: { color: 'default',    text: '已取消' },
};

const CHANNEL_MAP: Record<string, string> = {
  支付宝: '支付宝', ALIPAY: '支付宝', 微信支付: '微信支付', WECHAT_PAY: '微信支付',
};

const PaymentRecordsTab: React.FC<Props> = ({ active }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PaymentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ channel?: string; status?: string; orderId?: string }>({});

  const fetchData = useCallback(async (pg = page, ps = pageSize, fl = filters) => {
    setLoading(true);
    try {
      const res = await api.post<{ code: number; data: { records: PaymentRecord[]; total: number } }>(
        '/integration/payment-records/list',
        { page: pg, pageSize: ps, ...fl }
      );
      if (res.code === 200) {
        setData(res.data.records || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      message.error('获取支付流水失败');
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

  const columns: ColumnsType<PaymentRecord> = [
    { title: '发起时间', dataIndex: 'createdTime', width: 160,
      render: (v: string) => formatDateTimeSecond(v) },
    { title: '系统订单号', dataIndex: 'orderId', width: 160,
      render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
    { title: '渠道', dataIndex: 'channel', width: 90,
      render: (v: string) => <Tag color="blue">{CHANNEL_MAP[v] || v}</Tag> },
    { title: '金额（元）', dataIndex: 'amount', width: 100,
      render: (v: number) => v != null ? `¥${(v / 100).toFixed(2)}` : '-' },
    { title: '实付（元）', dataIndex: 'actualAmount', width: 100,
      render: (v: number | null) => v != null ? `¥${(v / 100).toFixed(2)}` : '-' },
    { title: '状态', dataIndex: 'status', width: 90,
      render: (v: string) => {
        const s = STATUS_MAP[v] || { color: 'default', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      } },
    { title: '第三方流水号', dataIndex: 'thirdPartyOrderId', width: 200,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v.substring(0, 20)}...</span></Tooltip>
        : '-' },
    { title: '支付时间', dataIndex: 'paidTime', width: 160,
      render: (v: string | null) => v ? formatDateTimeSecond(v) : '-' },
    { title: '错误信息', dataIndex: 'errorMessage', ellipsis: true,
      render: (v: string | null) => v
        ? <Tooltip title={v}><span style={{ color: '#ff4d4f' }}>{v.substring(0, 30)}...</span></Tooltip>
        : '-' },
  ];

  return (
    <div style={{ paddingTop: 16 }}>
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }} bordered={false}>
        <Space wrap>
          <Select placeholder="渠道" allowClear style={{ width: 120 }}
            value={filters.channel} onChange={v => setFilters(f => ({ ...f, channel: v }))}>
            <Select.Option value="ALIPAY">支付宝</Select.Option>
            <Select.Option value="WECHAT_PAY">微信支付</Select.Option>
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
        scroll={{ x: 1200 }}
      />
    </div>
  );
};

export default PaymentRecordsTab;
