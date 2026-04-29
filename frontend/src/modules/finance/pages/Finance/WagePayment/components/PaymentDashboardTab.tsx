import React, { useEffect, useState, Suspense, lazy } from 'react';
import { Card, Row, Col, Statistic, Spin, DatePicker, Typography, App } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import {
  WarningOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import dayjs, { Dayjs } from 'dayjs';

const ReactECharts = lazy(() => import('echarts-for-react'));

const { Text } = Typography;
const { RangePicker } = DatePicker;

const fmt = (n?: number | null) =>
  n == null ? '0.00' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2 });

interface AgingBucket {
  range: string;
  amount: number;
  count: number;
}

const PaymentDashboard: React.FC = () => {
  const { message } = App.useApp();
  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().subtract(30, 'day'),
    dayjs(),
  ]);
  const [stats, setStats] = useState<Record<string, any> | null>(null);
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDashboard = async (dates: [Dayjs, Dayjs] | null) => {
    const r = dates || range;
    setLoading(true);
    try {
      const [statsRes, agingRes] = await Promise.all([
        api.get('/finance/wage-payments/dashboard-stats', {
          params: { startDate: r[0].format('YYYY-MM-DD'), endDate: r[1].format('YYYY-MM-DD') },
        }),
        api.get('/finance/report/aging-analysis', {
          params: { type: 'PAYABLE' },
        }),
      ]);
      const statsData = (statsRes as any)?.data?.data ?? (statsRes as any)?.data ?? {};
      setStats(statsData);
      const agingResult = (agingRes as any)?.data?.data ?? (agingRes as any)?.data ?? {};
      setAgingData(agingResult.buckets ?? []);
    } catch {
      setStats({});
      setAgingData([]);
      message.warning('付款仪表板数据加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard(null);
  }, []);

  const totalPaid = stats?.totalPaid ?? 0;
  const totalPending = stats?.totalPending ?? 0;
  const totalReceived = stats?.totalReceived ?? 0;
  const overdueCount = stats?.overdueCount ?? 0;

  const trendOption = {
    tooltip: { trigger: 'axis' as const },
    legend: { data: ['付款', '收款'] },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category' as const,
      data: stats?.trendDates ?? [],
    },
    yAxis: { type: 'value' as const },
    series: [
      {
        name: '付款',
        type: 'bar' as const,
        data: stats?.trendPaid ?? [],
        itemStyle: { color: '#ff4d4f' },
      },
      {
        name: '收款',
        type: 'bar' as const,
        data: stats?.trendReceived ?? [],
        itemStyle: { color: '#52c41a' },
      },
    ],
  };

  const agingOption = {
    tooltip: { trigger: 'item' as const, formatter: '{b}: ¥{c} ({d}%)' },
    series: [{
      type: 'pie' as const,
      radius: ['40%', '70%'],
      data: agingData.map((b) => ({
        name: b.range,
        value: Number(b.amount || 0),
      })),
      label: { formatter: '{b}\n¥{c}' },
      emphasis: {
        itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: 'rgba(0,0,0,0.5)' },
      },
    }],
    color: ['#52c41a', '#1890ff', '#faad14', '#ff7a45', '#ff4d4f'],
  };

  const agingColumns = [
    { title: '账龄区间', dataIndex: 'range', key: 'range' },
    { title: '金额', dataIndex: 'amount', key: 'amount', align: 'right' as const,
      render: (v: number) => <Text strong type={v > 0 ? 'danger' : undefined}>¥{fmt(v)}</Text> },
    { title: '笔数', dataIndex: 'count', key: 'count', align: 'center' as const },
  ];

  return (
    <Spin spinning={loading}>
      <div style={{ marginBottom: 16, textAlign: 'right' }}>
        <RangePicker
          value={range}
          onChange={(v) => {
            if (v && v[0] && v[1]) {
              setRange([v[0], v[1]]);
              fetchDashboard([v[0], v[1]]);
            }
          }}
        />
      </div>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已付总额"
              value={totalPaid}
              precision={2}
              prefix="¥"
              styles={{ content: { color: '#ff4d4f' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="待付总额"
              value={totalPending}
              precision={2}
              prefix="¥"
              styles={{ content: { color: '#faad14' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="已收总额"
              value={totalReceived}
              precision={2}
              prefix="¥"
              styles={{ content: { color: '#52c41a' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card size="small">
            <Statistic
              title="逾期笔数"
              value={overdueCount}
              suffix="笔"
              styles={{ content: { color: overdueCount > 0 ? '#cf1322' : undefined } }}
              prefix={overdueCount > 0 ? <WarningOutlined style={{ marginRight: 4 }} /> : <CheckCircleOutlined style={{ marginRight: 4 }} />}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={14}>
          <Card size="small" title="收付款趋势">
            <Suspense fallback={<div style={{ height: 300, textAlign: 'center', lineHeight: '300px' }}>加载中...</div>}>
              <ReactECharts option={trendOption} style={{ height: 300 }} />
            </Suspense>
          </Card>
        </Col>
        <Col span={10}>
          <Card size="small" title="应付账龄分析">
            <Suspense fallback={<div style={{ height: 300, textAlign: 'center', lineHeight: '300px' }}>加载中...</div>}>
              <ReactECharts option={agingOption} style={{ height: 300 }} />
            </Suspense>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="账龄明细">
        <ResizableTable
          storageKey="payment-aging-table"
          columns={agingColumns}
          dataSource={agingData}
          rowKey="range"
          size="small"
          pagination={false}
          scroll={{ x: 600 }}
        />
      </Card>
    </Spin>
  );
};

export default PaymentDashboard;
