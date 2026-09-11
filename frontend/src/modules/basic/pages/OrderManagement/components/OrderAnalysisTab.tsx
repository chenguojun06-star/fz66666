import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, Empty, Row, Statistic, Tag, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FileTextOutlined,
  FundOutlined,
  PercentageOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import api from '@/utils/api';
import dayjs from 'dayjs';
import ResizableTable from '@/components/common/ResizableTable';

const ReactECharts = lazy(() => import('echarts-for-react'));

/* ───────────── 类型定义 ───────────── */
interface Overview {
  orderCount: number;
  totalQuantity: number;
  totalAmount: number;
  inProductionCount: number;
  completedCount: number;
  overdueCount: number;
  avgCompletionDays: number;
  avgDefectRate: number;
}
interface TrendItem { date: string; orderCount: number; quantity: number; }
interface FactoryRankItem { factoryName: string; completedOrders: number; avgCompletionDays: number; onTimeRate: number; }
interface DefectRankItem { styleNo: string; styleName: string; total: number; failCount: number; defectRate: number; }
interface Margin { salesAmount: number; processingCost: number; materialCost: number; grossProfit: number; grossMarginRate: number; hasCostData: boolean; }
interface AnalyticsData {
  overview: Overview;
  trend: TrendItem[];
  factoryRanking: FactoryRankItem[];
  defectRanking: DefectRankItem[];
  margin: Margin;
}

const fmtMoney = (v: number) => `¥${(Number(v) || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** 工具说明（标题 + 问号 Tooltip，减少视觉负担） */
const Hint: React.FC<{ text: string }> = ({ text }) => (
  <Tooltip title={text}>
    <span style={{ color: 'var(--color-text-tertiary)', cursor: 'help', marginLeft: 4, fontWeight: 400 }}>?</span>
  </Tooltip>
);

/**
 * 订单智能数据分析（D-xxx 重构）
 * 覆盖：总览指标 / 近30天下单趋势 / 工厂时效排行 / 次品率排行 / 毛利估算
 * 数据来源：后端 /api/order-analytics/overview（只读聚合，多租户隔离）
 */
const OrderAnalysisTab: React.FC = () => {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ code: number; data: AnalyticsData; message?: string }>('/order-analytics/overview', {
        params: { days: 365 },
      });
      if (res.code === 200 && res.data) {
        setData(res.data);
      } else {
        // D-324: 失败必须可见——不再静默渲染一屏假 0 让用户以为数据没连接
        setError(res.message || '数据分析加载失败');
      }
    } catch (e: any) {
      setError(e?.message || '数据分析加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 近30天下单趋势（缺日补零）
  const filledTrend = useMemo(() => {
    const map = new Map((data?.trend || []).map((t) => [t.date, t]));
    const out: TrendItem[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = dayjs().subtract(i, 'day').format('YYYY-MM-DD');
      out.push(map.get(d) || { date: d, orderCount: 0, quantity: 0 });
    }
    return out;
  }, [data?.trend]);

  const trendOption = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: 'var(--color-bg-base)',
      borderColor: 'var(--color-border)',
      textStyle: { color: 'var(--color-text-primary)' },
    },
    legend: { data: ['下单数', '下单件数'], top: 5, textStyle: { fontSize: 13, color: '#6b7280' } },
    grid: { left: '2%', right: '3%', bottom: '2%', top: 38, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: filledTrend.map((t) => t.date.slice(5)),
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#9ca3af', fontSize: 11, interval: 4 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9ca3af', fontSize: 11 },
      splitLine: { lineStyle: { color: '#f0f0f0' } },
    },
    series: [
      {
        name: '下单数',
        type: 'line',
        smooth: true,
        data: filledTrend.map((t) => t.orderCount),
        lineStyle: { width: 2, color: '#1677ff' },
        itemStyle: { color: '#1677ff' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(22, 119, 255, 0.18)' },
              { offset: 1, color: 'rgba(22, 119, 255, 0.02)' },
            ],
          },
        },
      },
      {
        name: '下单件数',
        type: 'bar',
        barMaxWidth: 14,
        data: filledTrend.map((t) => t.quantity),
        itemStyle: { color: '#91caff', borderRadius: [2, 2, 0, 0] },
      },
    ],
  }), [filledTrend]);

  const factoryOption = useMemo(() => {
    const list = data?.factoryRanking || [];
    return {
      tooltip: {
        trigger: 'axis',
        confine: true,
        backgroundColor: 'var(--color-bg-base)',
        borderColor: 'var(--color-border)',
        textStyle: { color: 'var(--color-text-primary)' },
        formatter: (params: any) => {
          const p = params?.[0];
          if (!p) return '';
          const item = list[p.dataIndex];
          if (!item) return '';
          const onTime = item.onTimeRate >= 0 ? `${item.onTimeRate.toFixed(1)}%` : '暂无数据';
          return `<div style="padding:4px 0;font-weight:600">${item.factoryName}</div>
            <div>完成订单：${item.completedOrders} 单</div>
            <div>平均完工：${item.avgCompletionDays >= 0 ? `${item.avgCompletionDays.toFixed(1)} 天` : '暂无数据'}</div>
            <div>准时交付率：${onTime}</div>`;
        },
      },
      grid: { left: '2%', right: '3%', bottom: '2%', top: 20, containLabel: true },
      xAxis: {
        type: 'category',
        data: list.map((f) => f.factoryName),
        axisLine: { lineStyle: { color: '#e5e7eb' } },
        axisLabel: { color: '#6b7280', fontSize: 11, interval: 0, rotate: 30 },
      },
      yAxis: {
        type: 'value',
        name: '天',
        nameTextStyle: { color: '#9ca3af' },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#9ca3af', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [{
        name: '平均完工天数',
        type: 'bar',
        barMaxWidth: 28,
        data: list.map((f) => f.avgCompletionDays >= 0 ? f.avgCompletionDays : 0),
        itemStyle: { color: '#52c41a', borderRadius: [3, 3, 0, 0] },
        label: { show: true, position: 'top', fontSize: 11, color: '#237804', formatter: (p: any) => (list[p.dataIndex].avgCompletionDays >= 0 ? list[p.dataIndex].avgCompletionDays.toFixed(1) : '-') },
      }],
    };
  }, [data?.factoryRanking]);

  const defectColumns = [
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140, ellipsis: true },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', width: 140, ellipsis: true, render: (v: string) => v || '-' },
    { title: '质检数', dataIndex: 'total', key: 'total', width: 80, align: 'right' as const, render: (v: number) => v || 0 },
    { title: '次品数', dataIndex: 'failCount', key: 'failCount', width: 80, align: 'right' as const, render: (v: number) => v || 0 },
    {
      title: '次品率',
      dataIndex: 'defectRate',
      key: 'defectRate',
      width: 100,
      align: 'right' as const,
      render: (v: number) => {
        const rate = Number(v) || 0;
        const color = rate > 15 ? 'red' : rate > 5 ? 'orange' : 'green';
        return <Tag color={color}>{rate.toFixed(1)}%</Tag>;
      },
    },
  ];

  const overview = data?.overview;
  const margin = data?.margin;

  if (error) {
    return (
      <Card size="small">
        <Empty
          description={`数据分析加载失败：${error}`}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        >
          <Button type="primary" onClick={() => void fetchData()} loading={loading}>
            重试
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <div>
      {/* ① 总览指标 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={<>订单总数<Hint text="统计窗口内全部生产订单（近365天）" /></>}
              value={overview?.orderCount || 0}
              prefix={<FileTextOutlined style={{ color: 'var(--color-primary)' }} />}
              suffix="单"
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={<>下单总件数<Hint text="统计窗口内全部订单的下单数量合计" /></>}
              value={overview?.totalQuantity || 0}
              prefix={<AppstoreOutlined style={{ color: '#1677ff' }} />}
              suffix="件"
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={<>销售额估算<Hint text="按 下单数量 × 下单单价 估算，仅作经营参考" /></>}
              value={overview?.totalAmount || 0}
              precision={2}
              prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={12} sm={12} md={6}>
          <Card size="small">
            <Statistic
              title={<>平均完工天数<Hint text="已完成订单从下单到实际完成的天数均值" /></>}
              value={overview?.avgCompletionDays != null && overview.avgCompletionDays >= 0 ? overview.avgCompletionDays : '-'}
              precision={overview?.avgCompletionDays != null && overview.avgCompletionDays >= 0 ? 1 : 0}
              prefix={<ClockCircleOutlined style={{ color: '#fa8c16' }} />}
              suffix={overview?.avgCompletionDays != null && overview.avgCompletionDays >= 0 ? '天' : ''}
            />
          </Card>
        </Col>
      </Row>

      {/* ② 状态分布 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title={<>在产订单<Hint text="状态为 待生产 / 生产中 的订单" /></>}
              value={overview?.inProductionCount || 0}
              prefix={<FundOutlined style={{ color: '#1677ff' }} />}
              suffix="单"
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title={<>已完成<Hint text="状态为 已完成 的订单" /></>}
              value={overview?.completedCount || 0}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              suffix="单"
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title={<>已逾期<Hint text="计划完成日期已过且未完成的订单" /></>}
              value={overview?.overdueCount || 0}
              valueStyle={overview?.overdueCount ? { color: 'var(--color-error)' } : undefined}
              prefix={<ShoppingCartOutlined style={{ color: overview?.overdueCount ? 'var(--color-error)' : '#999' }} />}
              suffix="单"
            />
          </Card>
        </Col>
        <Col xs={12} sm={8} md={6}>
          <Card size="small">
            <Statistic
              title={<>平均次品率<Hint text="质检扫码记录中 次品数 / 质检数（近365天）" /></>}
              value={overview?.avgDefectRate != null && overview.avgDefectRate >= 0 ? overview.avgDefectRate : '-'}
              precision={overview?.avgDefectRate != null && overview.avgDefectRate >= 0 ? 1 : 0}
              valueStyle={overview?.avgDefectRate != null && overview.avgDefectRate > 15 ? { color: 'var(--color-error)' } : undefined}
              prefix={<PercentageOutlined style={{ color: overview?.avgDefectRate != null && overview.avgDefectRate > 15 ? 'var(--color-error)' : '#999' }} />}
              suffix={overview?.avgDefectRate != null && overview.avgDefectRate >= 0 ? '%' : ''}
            />
          </Card>
        </Col>
      </Row>

      {/* ③ 趋势 + 工厂时效 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col xs={24} lg={14}>
          <Card size="small" title={<>近30天下单趋势<Hint text="每日新增订单数与下单件数" /></>}>
            {filledTrend.length ? (
              <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>加载图表中...</div>}>
                <ReactECharts option={trendOption} style={{ height: 260 }} notMerge />
              </Suspense>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={<>工厂时效排行<Hint text="按平均完工天数排序，越快越靠前（近365天已完成订单）" /></>}>
            {(data?.factoryRanking || []).length ? (
              <Suspense fallback={<div style={{ padding: 80, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>加载图表中...</div>}>
                <ReactECharts option={factoryOption} style={{ height: 260 }} notMerge />
              </Suspense>
            ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无完成订单数据" />}
          </Card>
        </Col>
      </Row>

      {/* ④ 次品率 + 毛利估算 */}
      <Row gutter={12}>
        <Col xs={24} lg={14}>
          <Card size="small" title={<>次品率排行<Hint text="按质检扫码的次品数降序，红=次品率>15%，橙=>5%，绿=正常" /></>}>
            <ResizableTable
              rowKey="styleNo"
              loading={loading}
              emptyDescription="暂无质检记录"
              dataSource={data?.defectRanking || []}
              columns={defectColumns as any}
              size="middle"
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card size="small" title={<>毛利估算<Hint text="销售额按 报价单价→下单锁定单价 依次兜底估算；成本 = 加工单价×数量 + 物料成本（内部工厂领料审核后自动累计）。估算值仅供参考" /></>}>
            {margin && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    销售额估算
                    <Hint text="按 报价单价 优先、无报价用 下单锁定单价 兜底 × 下单数量" />
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(margin.salesAmount)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    加工成本
                    <Hint text="加工单价 × 下单数量" />
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(margin.processingCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    物料成本
                    <Hint text="内部工厂物料领取审核结算后自动累计到订单" />
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmtMoney(margin.materialCost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, borderTop: '1px dashed var(--color-border-light)', paddingTop: 10 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>毛利估算</span>
                  <span style={{ fontWeight: 700, color: margin.grossProfit >= 0 ? '#237804' : 'var(--color-error)' }}>
                    {fmtMoney(margin.grossProfit)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>毛利率估算</span>
                  <span style={{ fontWeight: 700 }}>
                    {margin.hasCostData && margin.grossMarginRate >= 0
                      ? `${margin.grossMarginRate.toFixed(1)}%`
                      : <span style={{ color: 'var(--color-text-tertiary)' }}>暂无成本数据</span>}
                  </span>
                </div>
                {!margin.hasCostData && (
                  <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-container)', borderRadius: 6, padding: '6px 10px' }}>
                    订单未录加工单价、也没有物料成本汇总记录，暂无法估算毛利；内部工厂走完物料领取审核后会自动累计成本。
                  </div>
                )}
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default OrderAnalysisTab;
