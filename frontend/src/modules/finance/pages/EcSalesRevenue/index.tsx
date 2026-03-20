import React, { useState, useCallback, useEffect } from 'react';
import { Card, Tag, Select, Input, Button, Space, Row, Col, Statistic, Popconfirm, Tooltip, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import { ecSalesRevenueApi, EcRevenueRecord, EcRevenueSummary } from '@/services/finance/ecSalesRevenueApi';
import { message } from '@/utils/antdStatic';
import { readPageSize } from '@/utils/pageSizeStore';

const { Text } = Typography;

const PLATFORM_MAP: Record<string, { label: string; color: string }> = {
  TB: { label: '淘宝', color: 'orange' },
  TM: { label: '天猫', color: 'volcano' },
  JD: { label: '京东', color: 'red' },
  PDD: { label: '拼多多', color: 'magenta' },
  DY: { label: '抖音', color: 'purple' },
  XHS: { label: '小红书', color: 'pink' },
  WC: { label: '微信', color: 'green' },
  SFY: { label: '顺丰优选', color: 'blue' },
};

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待核账', color: 'orange' },
  confirmed: { label: '已核账', color: 'blue' },
  reconciled: { label: '已入账', color: 'green' },
};

const EcSalesRevenue: React.FC = () => {
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
    pageSize: readPageSize(20),
  });

  const fetchSummary = useCallback(async () => {
    try {
      const data = await ecSalesRevenueApi.summary({ platform: filters.platform });
      setSummary(data as unknown as EcRevenueSummary);
    } catch {
      // 静默
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
    {
      title: '流水号',
      dataIndex: 'revenueNo',
      width: 170,
      render: (v: string) => <Text code style={{ fontSize: 12 }}>{v}</Text>,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 80,
      render: (v: string) => {
        const info = PLATFORM_MAP[v] ?? { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '店铺',
      dataIndex: 'shopName',
      width: 110,
      ellipsis: true,
    },
    {
      title: '商品名 / SKU',
      key: 'product',
      width: 180,
      ellipsis: true,
      render: (_: unknown, r: EcRevenueRecord) => (
        <Space orientation="vertical" size={0}>
          <Text ellipsis style={{ fontSize: 13 }}>{r.productName}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>{r.skuCode}</Text>
        </Space>
      ),
    },
    {
      title: '数量',
      dataIndex: 'quantity',
      width: 60,
      align: 'center',
    },
    {
      title: '实付金额',
      dataIndex: 'payAmount',
      width: 100,
      align: 'right',
      render: (v: number) => (
        <Text style={{ color: '#52c41a', fontWeight: 600 }}>
          ¥{Number(v ?? 0).toFixed(2)}
        </Text>
      ),
    },
    {
      title: '关联生产单',
      dataIndex: 'productionOrderNo',
      width: 140,
      render: (v: string) =>
        v ? <Text code style={{ fontSize: 11 }}>{v}</Text> : <Text type="secondary">-</Text>,
    },
    {
      title: '发货时间',
      dataIndex: 'shipTime',
      width: 115,
      render: (v: string) =>
        v ? v.replace('T', ' ').substring(0, 16) : <Text type="secondary">-</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (v: string) => {
        const info = STATUS_MAP[v] ?? { label: v, color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      fixed: 'right',
      render: (_: unknown, r: EcRevenueRecord) => {
        if (r.status === 'pending') {
          return (
            <Popconfirm
              title="确认核账？"
              description="将该笔收入标记为已核账"
              onConfirm={() => handleAction(r.id, 'confirm')}
            >
              <Button
                size="small"
                type="primary"
                ghost
                loading={actionLoading === r.id}
              >
                核账
              </Button>
            </Popconfirm>
          );
        }
        if (r.status === 'confirmed') {
          return (
            <Popconfirm
              title="确认入账？"
              description="将该笔收入标记为已入账（最终状态）"
              onConfirm={() => handleAction(r.id, 'reconcile')}
            >
              <Button
                size="small"
                type="primary"
                loading={actionLoading === r.id}
              >
                入账
              </Button>
            </Popconfirm>
          );
        }
        return <Tag color="green">已入账</Tag>;
      },
    },
  ];

  const fmtAmt = (v: number = 0) => `¥${Number(v).toFixed(2)}`;

  return (
    <Layout>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {/* 汇总卡片 */}
        <Row gutter={16}>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title={<><ClockCircleOutlined style={{ color: 'orange', marginRight: 4 }} />待核账</>}
                value={fmtAmt(summary?.pendingAmount)}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>（{summary?.pendingCount ?? 0} 笔）</Text>}
                styles={{ content: { color: 'orange', fontSize: 18 } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title={<><CheckCircleOutlined style={{ color: '#1677ff', marginRight: 4 }} />已核账</>}
                value={fmtAmt(summary?.confirmedAmount)}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>（{summary?.confirmedCount ?? 0} 笔）</Text>}
                styles={{ content: { color: '#1677ff', fontSize: 18 } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card size="small">
              <Statistic
                title={<><DollarOutlined style={{ color: '#52c41a', marginRight: 4 }} />已入账净收入</>}
                value={fmtAmt(summary?.netIncome)}
                suffix={<Text type="secondary" style={{ fontSize: 12 }}>（{summary?.reconciledCount ?? 0} 笔）</Text>}
                styles={{ content: { color: '#52c41a', fontSize: 18 } }}
              />
            </Card>
          </Col>
        </Row>

        {/* 筛选栏 */}
        <Card size="small">
          <Space wrap>
            <Select
              placeholder="全部平台"
              allowClear
              style={{ width: 120 }}
              value={filters.platform}
              onChange={(v) => setFilters((prev) => ({ ...prev, platform: v, page: 1 }))}
              options={Object.entries(PLATFORM_MAP).map(([k, v]) => ({
                value: k,
                label: v.label,
              }))}
            />
            <Select
              placeholder="全部状态"
              allowClear
              style={{ width: 120 }}
              value={filters.status}
              onChange={(v) => setFilters((prev) => ({ ...prev, status: v, page: 1 }))}
              options={[
                { value: 'pending', label: '待核账' },
                { value: 'confirmed', label: '已核账' },
                { value: 'reconciled', label: '已入账' },
              ]}
            />
            <Input
              placeholder="搜索流水号 / 平台单号 / 商品名"
              prefix={<SearchOutlined />}
              style={{ width: 240 }}
              value={filters.keyword}
              onChange={(e) => setFilters((prev) => ({ ...prev, keyword: e.target.value }))}
              onPressEnter={() => setFilters((prev) => ({ ...prev, page: 1 }))}
              allowClear
            />
            <Tooltip title="刷新">
              <Button icon={<ReloadOutlined />} onClick={() => { setFilters((prev) => ({ ...prev, page: 1 })); }} />
            </Tooltip>
          </Space>
        </Card>

        {/* 数据表格 */}
        <Card size="small" style={{ overflow: 'hidden' }}>
          <ResizableTable<EcRevenueRecord>
            rowKey="id"
            loading={loading}
            dataSource={records}
            columns={columns}
            scroll={{ x: 1100 }}
            size="small"
            pagination={{
              current: filters.page,
              pageSize: filters.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              onChange: (page, pageSize) =>
                setFilters((prev) => ({ ...prev, page, pageSize })),
            }}
          />
        </Card>
      </Space>
    </Layout>
  );
};

export default EcSalesRevenue;
