import React, { useState, useCallback, useEffect } from 'react';
import { App, Card, Tag, Select, Input, Button, Space, Row, Col, Statistic, Popconfirm, Tooltip, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SearchOutlined, ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, DollarOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ecSalesRevenueApi, EcRevenueRecord, EcRevenueSummary } from '@/services/finance/ecSalesRevenueApi';
import { formatMoney } from '@/utils/format';
import { getPlatformTag, getPlatformOptions } from '@/utils/platform';

const { Text } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待核账', color: 'orange' },
  confirmed: { label: '已核账', color: 'blue' },
  reconciled: { label: '已入账', color: 'green' },
};

const EcRevenueTab: React.FC = () => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<EcRevenueRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<EcRevenueSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [filters, setFilters] = useState({
    platform: undefined as string | undefined,
    status: undefined as string | undefined,
    keyword: '',
    page: 1,
    pageSize: 20,
  });

  const fetchSummary = useCallback(async () => {
    try {
      const data = await ecSalesRevenueApi.summary({ platform: filters.platform });
      setSummary(data as unknown as EcRevenueSummary);
    } catch {
      message.warning('汇总数据加载失败');
    }
  }, [filters.platform]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await ecSalesRevenueApi.list({
        page: filters.page,
        pageSize: filters.pageSize,
        platform: filters.platform,
        status: filters.status,
        keyword: filters.keyword || undefined,
      });
      const data = resp as unknown as { records: EcRevenueRecord[]; total: number };
      setRecords(data.records ?? []);
      setTotal(data.total ?? 0);
    } catch {
      message.error('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchList();
    fetchSummary();
  }, [fetchList, fetchSummary]);

  const handleAction = async (id: number, action: 'confirm' | 'reconcile') => {
    setActionLoading(id);
    try {
      await ecSalesRevenueApi.stageAction(id, action);
      message.success(action === 'confirm' ? '已核账' : '已入账');
      fetchList();
      fetchSummary();
    } catch {
      message.error('操作失败，请重试');
    } finally {
      setActionLoading(null);
    }
  };

  const columns: ColumnsType<EcRevenueRecord> = [
    { title: '流水号', dataIndex: 'revenueNo', width: 150, render: (v: string) => <Text code style={{ fontSize: 13 }}>{v}</Text> },
    { title: '平台', dataIndex: 'platform', width: 70, render: (v: string) => { const t = getPlatformTag(v); return <Tag color={t.color}>{t.label}</Tag>; } },
    { title: '店铺', dataIndex: 'shopName', width: 100, ellipsis: true },
    { title: '商品', dataIndex: 'productName', width: 120, ellipsis: true, render: (v: string) => <Text ellipsis style={{ fontSize: 13 }}>{v}</Text> },
    { title: '数量', dataIndex: 'quantity', width: 60, align: 'center' },
    { title: '实付金额', dataIndex: 'payAmount', width: 90, align: 'right', render: (v: number) => <Text style={{ color: 'var(--color-success)', fontWeight: 600 }}>{formatMoney(v)}</Text> },
    { title: '关联生产单', dataIndex: 'productionOrderNo', width: 120, render: (v: string) => v ? <Text code style={{ fontSize: 13 }}>{v}</Text> : <Text type="secondary">-</Text> },
    { title: '发货时间', dataIndex: 'shipTime', width: 110, render: (v: string) => v ? v.replace('T', ' ').substring(0, 16) : <Text type="secondary">-</Text> },
    { title: '状态', dataIndex: 'status', width: 80, render: (v: string) => { const info = STATUS_MAP[v] ?? { label: '未知', color: 'default' }; return <Tag color={info.color}>{info.label}</Tag>; } },
    {
      title: '操作', key: 'action', width: 90,
      render: (_: unknown, r: EcRevenueRecord) => {
        if (r.status === 'pending') {
          return (
            <Popconfirm title="确认核账？" description="将该笔收入标记为已核账" onConfirm={() => handleAction(r.id, 'confirm')}>
              <Button type="primary" ghost loading={actionLoading === r.id} style={{ fontSize: 12, padding: '0 8px' }}>核账</Button>
            </Popconfirm>
          );
        }
        if (r.status === 'confirmed') {
          return (
            <Popconfirm title="确认入账？" description="将该笔收入标记为已入账（最终状态）" onConfirm={() => handleAction(r.id, 'reconcile')}>
              <Button type="primary" loading={actionLoading === r.id} style={{ fontSize: 12, padding: '0 8px' }}>入账</Button>
            </Popconfirm>
          );
        }
        return <Tag color="green">已入账</Tag>;
      },
    },
  ];

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Row gutter={12}>
        <Col span={8}>
          <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}>
            <Statistic title={<><ClockCircleOutlined style={{ color: 'orange', marginRight: 4 }} />待核账</>}
              value={formatMoney(summary?.pendingAmount)} suffix={<Text type="secondary" style={{ fontSize: 12 }}>({summary?.pendingCount ?? 0}笔)</Text>}
              styles={{ content: { color: 'orange', fontSize: 18 } }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}>
            <Statistic title={<><CheckCircleOutlined style={{ color: 'var(--color-primary)', marginRight: 4 }} />已核账</>}
              value={formatMoney(summary?.confirmedAmount)} suffix={<Text type="secondary" style={{ fontSize: 12 }}>({summary?.confirmedCount ?? 0}笔)</Text>}
              styles={{ content: { color: 'var(--color-primary)', fontSize: 18 } }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }}>
            <Statistic title={<><DollarOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />已入账净收入</>}
              value={formatMoney(summary?.netIncome)} suffix={<Text type="secondary" style={{ fontSize: 12 }}>({summary?.reconciledCount ?? 0}笔)</Text>}
              styles={{ content: { color: 'var(--color-success)', fontSize: 18 } }} />
          </Card>
        </Col>
      </Row>
      <Card style={{ borderRadius: 6, border: '1px solid var(--color-border-secondary)' }} styles={{ body: { padding: '12px 16px' } }}>
        <Space wrap style={{ marginBottom: 12 }}>
          <Select placeholder="全部平台" allowClear style={{ width: 120 }} value={filters.platform}
            onChange={(v) => setFilters((prev) => ({ ...prev, platform: v, page: 1 }))}
            options={getPlatformOptions()} />
          <Select placeholder="全部状态" allowClear style={{ width: 110 }} value={filters.status}
            onChange={(v) => setFilters((prev) => ({ ...prev, status: v, page: 1 }))}
            options={[{ value: 'pending', label: '待核账' }, { value: 'confirmed', label: '已核账' }, { value: 'reconciled', label: '已入账' }]} />
          <Input placeholder="搜索流水号/商品名" prefix={<SearchOutlined />} style={{ width: 200 }} value={filters.keyword}
            onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
            onPressEnter={() => setFilters((prev) => ({ ...prev, page: 1 }))} allowClear />
          <Tooltip title="刷新">
            <Button icon={<ReloadOutlined />} onClick={() => { setFilters((prev) => ({ ...prev, page: 1 })); }} />
          </Tooltip>
        </Space>
        <ResizableTable rowKey="id" loading={loading} emptyDescription="暂无财务数据" dataSource={records} columns={columns} scroll={{ x: 1100 }}
          pagination={{ current: filters.page, pageSize: filters.pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
            onChange: (page, pageSize) => setFilters((prev) => ({ ...prev, page, pageSize })) }} />
      </Card>
    </Space>
  );
};

export default EcRevenueTab;