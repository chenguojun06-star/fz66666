import React, { useState, useCallback, useEffect } from 'react';
import { App, Card, Tag, Select, Input, Button, Space, Row, Col, Statistic, Popconfirm, Tooltip, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  SearchOutlined, ReloadOutlined, CheckCircleOutlined,
  ClockCircleOutlined, DollarOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { ecSalesRevenueApi, EcRevenueRecord, EcRevenueSummary, PlatformBreakdownItem } from '@/services/finance/ecSalesRevenueApi';
import { readPageSize } from '@/utils/pageSizeStore';
import { formatMoney } from '@/utils/format';
import { getPlatformTag, getPlatformOptions } from '@/utils/platform';

const { Text } = Typography;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待核账', color: 'orange' },
  confirmed: { label: '已核账', color: 'blue' },
  reconciled: { label: '已入账', color: 'green' },
};

const EcSalesRevenue: React.FC = () => {
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
    pageSize: readPageSize(20),
  });

  const fetchSummary = useCallback(async () => {
    try {
      const data = await ecSalesRevenueApi.summary({ platform: filters.platform });
      setSummary(data as unknown as EcRevenueSummary);
    } catch {
      message.warning('汇总数据加载失败，金额可能不准确');
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
      render: (v: string) => <Text code style={{ fontSize: 14 }}>{v}</Text>,
    },
    {
      title: '平台',
      dataIndex: 'platform',
      width: 80,
      render: (v: string) => {
        const t = getPlatformTag(v);
        return <Tag color={t.color}>{t.label}</Tag>;
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
          <Text ellipsis style={{ fontSize: 14 }}>{r.productName}</Text>
          <Text type="secondary" style={{ fontSize: 14 }}>{r.skuCode}</Text>
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
        <Text style={{ color: 'var(--color-success)', fontWeight: 600 }}>
          {formatMoney(v)}
        </Text>
      ),
    },
    {
      title: '关联生产单',
      dataIndex: 'productionOrderNo',
      width: 140,
      render: (v: string) =>
        v ? <Text code style={{ fontSize: 14 }}>{v}</Text> : <Text type="secondary">-</Text>,
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
        const info = STATUS_MAP[v] ?? { label: '未知', color: 'default' };
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

  const fmtAmt = (v: number = 0) => formatMoney(v);

  return (
    <>
      <Space orientation="vertical" size={16} style={{ width: '100%' }}>
        {/* 汇总卡片 */}
        <Row gutter={16}>
          <Col span={8}>
            <Card>
              <Statistic
                title={<><ClockCircleOutlined style={{ color: 'orange', marginRight: 4 }} />待核账</>}
                value={fmtAmt(summary?.pendingAmount)}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>（{summary?.pendingCount ?? 0} 笔）</Text>}
                styles={{ content: { color: 'orange', fontSize: 18 } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title={<><CheckCircleOutlined style={{ color: 'var(--color-primary)', marginRight: 4 }} />已核账</>}
                value={fmtAmt(summary?.confirmedAmount)}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>（{summary?.confirmedCount ?? 0} 笔）</Text>}
                styles={{ content: { color: 'var(--color-primary)', fontSize: 18 } }}
              />
            </Card>
          </Col>
          <Col span={8}>
            <Card>
              <Statistic
                title={<><DollarOutlined style={{ color: 'var(--color-success)', marginRight: 4 }} />已入账净收入</>}
                value={fmtAmt(summary?.netIncome)}
                suffix={<Text type="secondary" style={{ fontSize: 14 }}>（{summary?.reconciledCount ?? 0} 笔）</Text>}
                styles={{ content: { color: 'var(--color-success)', fontSize: 18 } }}
              />
            </Card>
          </Col>
        </Row>

        {/* 按平台分组统计 */}
        {summary?.platformBreakdown && summary.platformBreakdown.length > 0 && (
          <Card title="平台销售分布" size="small">
            <Row gutter={[8, 8]}>
              {summary.platformBreakdown.map((item: PlatformBreakdownItem) => {
                const t = getPlatformTag(item.platform);
                return (
                  <Col xs={12} sm={8} md={6} key={item.platform}>
                    <Card size="small" style={{ borderLeft: `3px solid ${t.color}` }}>
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tag color={t.color}>{t.label}</Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>{item.orderCount}单</Text>
                        </div>
                        <div>
                          <Text style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 16 }}>
                            ¥{formatMoney(item.totalPayAmount)}
                          </Text>
                        </div>
                        <div style={{ fontSize: 12, color: '#888' }}>
                          {item.totalQuantity}件 · 运费¥{formatMoney(item.totalFreight)} · 净¥{formatMoney(item.netRevenue)}
                        </div>
                      </Space>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          </Card>
        )}

        {/* 筛选栏 */}
        <Card>
          <Space wrap>
            <Select
              placeholder="全部平台"
              allowClear
              style={{ width: 120 }}
              value={filters.platform}
              onChange={(v) => setFilters((prev) => ({ ...prev, platform: v, page: 1 }))}
              options={getPlatformOptions()}
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
        <Card style={{ overflow: 'hidden' }}>
          <ResizableTable<EcRevenueRecord>
            rowKey="id"
            loading={loading}
            dataSource={records}
            columns={columns}
            scroll={{ x: 1100 }}
           
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
    </>
  );
};

export default EcSalesRevenue;
