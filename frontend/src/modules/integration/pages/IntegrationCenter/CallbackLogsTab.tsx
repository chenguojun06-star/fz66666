import React, { useEffect, useState, useCallback } from 'react';
import { Card, Select, Button, Tag, Space, message, Modal, Typography } from 'antd';
import { SearchOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import { formatDateTimeSecond } from '@/utils/datetime';
import api from '@/utils/api';

const { Text } = Typography;

interface CallbackLog {
  id: number;
  type: 'PAYMENT' | 'LOGISTICS';
  channel: string;
  rawBody: string | null;
  verified: boolean;
  processed: boolean;
  relatedOrderId: string | null;
  errorMessage: string | null;
  createdTime: string;
}

interface Props { active: boolean; }

const CHANNEL_COLOR: Record<string, string> = {
  ALIPAY: 'blue', WECHAT_PAY: 'green', SF: 'orange', STO: 'purple',
};

const CHANNEL_NAME: Record<string, string> = {
  ALIPAY: '支付宝', WECHAT_PAY: '微信支付', SF: '顺丰速运', STO: '申通快递',
};

const CallbackLogsTab: React.FC<Props> = ({ active }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<CallbackLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filters, setFilters] = useState<{ type?: string; channel?: string; processed?: string }>({});
  const [rawBodyModal, setRawBodyModal] = useState<{ open: boolean; content: string }>({ open: false, content: '' });

  const fetchData = useCallback(async (pg = page, ps = pageSize, fl = filters) => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page: pg, pageSize: ps, ...fl };
      if (fl.processed !== undefined && fl.processed !== '') {
        params.processed = fl.processed === 'true';
      } else {
        delete params.processed;
      }
      const res = await api.post<{ code: number; data: { records: CallbackLog[]; total: number } }>(
        '/integration/callback-logs/list', params
      );
      if (res.code === 200) {
        setData(res.data.records || []);
        setTotal(res.data.total || 0);
      }
    } catch {
      message.error('获取回调日志失败');
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

  const columns: ColumnsType<CallbackLog> = [
    { title: '收到时间', dataIndex: 'createdTime', width: 160,
      render: (v: string) => formatDateTimeSecond(v) },
    { title: '类型', dataIndex: 'type', width: 80,
      render: (v: string) => <Tag color={v === 'PAYMENT' ? 'blue' : 'geekblue'}>{v === 'PAYMENT' ? '支付' : '物流'}</Tag> },
    { title: '渠道', dataIndex: 'channel', width: 100,
      render: (v: string) => <Tag color={CHANNEL_COLOR[v] || 'default'}>{CHANNEL_NAME[v] || v}</Tag> },
    { title: '关联订单', dataIndex: 'relatedOrderId', width: 150,
      render: (v: string | null) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v || '-'}</span> },
    { title: '验签', dataIndex: 'verified', width: 70,
      render: (v: boolean) => <Tag color={v ? 'success' : 'error'}>{v ? '通过' : '失败'}</Tag> },
    { title: '处理结果', dataIndex: 'processed', width: 80,
      render: (v: boolean) => <Tag color={v ? 'success' : 'warning'}>{v ? '已处理' : '未处理'}</Tag> },
    { title: '错误信息', dataIndex: 'errorMessage', ellipsis: true,
      render: (v: string | null) => v
        ? <Text type="danger" ellipsis={{ tooltip: v }}>{v}</Text>
        : '-' },
    { title: '操作', key: 'action', width: 80, fixed: 'right',
      render: (_: unknown, r: CallbackLog) => (
        <Button type="link" size="small" icon={<EyeOutlined />}
          onClick={() => setRawBodyModal({ open: true, content: r.rawBody || '（无内容）' })}>
          原文
        </Button>
      ) },
  ];

  const formatRawBody = (body: string) => {
    try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
  };

  return (
    <div style={{ paddingTop: 16 }}>
      <Card size="small" style={{ marginBottom: 12, borderRadius: 8 }} bordered={false}>
        <Space wrap>
          <Select placeholder="类型" allowClear style={{ width: 100 }}
            value={filters.type} onChange={v => setFilters(f => ({ ...f, type: v }))}>
            <Select.Option value="PAYMENT">支付</Select.Option>
            <Select.Option value="LOGISTICS">物流</Select.Option>
          </Select>
          <Select placeholder="渠道" allowClear style={{ width: 110 }}
            value={filters.channel} onChange={v => setFilters(f => ({ ...f, channel: v }))}>
            <Select.Option value="ALIPAY">支付宝</Select.Option>
            <Select.Option value="WECHAT_PAY">微信支付</Select.Option>
            <Select.Option value="SF">顺丰速运</Select.Option>
            <Select.Option value="STO">申通快递</Select.Option>
          </Select>
          <Select placeholder="处理状态" allowClear style={{ width: 110 }}
            value={filters.processed} onChange={v => setFilters(f => ({ ...f, processed: v }))}>
            <Select.Option value="true">已处理</Select.Option>
            <Select.Option value="false">未处理</Select.Option>
          </Select>
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
        scroll={{ x: 900 }}
      />

      <Modal
        title="回调原始报文"
        open={rawBodyModal.open}
        onCancel={() => setRawBodyModal({ open: false, content: '' })}
        footer={null}
        width="60vw"
      >
        <pre style={{
          maxHeight: '60vh', overflow: 'auto', background: '#1e1e1e', color: '#d4d4d4',
          padding: 16, borderRadius: 8, fontSize: 12, fontFamily: 'monospace',
        }}>
          {formatRawBody(rawBodyModal.content)}
        </pre>
      </Modal>
    </div>
  );
};

export default CallbackLogsTab;
