import React, { useState, useEffect, useCallback } from 'react';
import { Card, Tag, Table, Statistic, Row, Col, Alert, Spin, Button, Empty, Tooltip } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ReloadOutlined,
  DollarOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { FinanceAuditResponse, AuditFinding, PriceDeviation } from '@/services/production/productionApi';

/* ===== 风险/建议映射 ===== */
const riskColorMap: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'green' };
const riskLabelMap: Record<string, string> = { HIGH: '高风险', MEDIUM: '中风险', LOW: '低风险' };
const suggestionMap: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  APPROVE: { color: 'green', icon: <CheckCircleOutlined />, label: '建议通过' },
  REVIEW:  { color: 'orange', icon: <WarningOutlined />, label: '需人工复核' },
  REJECT:  { color: 'red', icon: <CloseCircleOutlined />, label: '建议拒绝' },
};
const typeLabel: Record<string, string> = {
  QUANTITY_MISMATCH: '数量差异',
  PRICE_DEVIATION: '单价偏离',
  DUPLICATE_SETTLEMENT: '重复结算',
  PROFIT_ANOMALY: '利润异常',
  COST_OVERRUN: '成本超限',
};

const FinanceAuditPanel: React.FC = () => {
  const [data, setData] = useState<FinanceAuditResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getFinanceAudit();
      setData(res?.data ?? null);
    } catch {
      setError('数据加载失败，请重试');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ===== 异常发现列表列定义 ===== */
  const findingCols = [
    {
      title: '类型', dataIndex: 'type', width: 100,
      render: (v: string) => <Tag>{typeLabel[v] || v}</Tag>,
    },
    {
      title: '风险', dataIndex: 'riskLevel', width: 80,
      render: (v: string) => <Tag color={riskColorMap[v]}>{riskLabelMap[v]}</Tag>,
    },
    { title: '订单号', dataIndex: 'orderNo', width: 130 },
    { title: '描述', dataIndex: 'description', ellipsis: true },
    {
      title: '金额', dataIndex: 'amount', width: 100, align: 'right' as const,
      render: (v: number) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
    },
    { title: '建议操作', dataIndex: 'action', width: 130 },
  ];

  /* ===== 单价偏离列定义 ===== */
  const deviationCols = [
    { title: '订单号', dataIndex: 'orderNo', width: 130 },
    { title: '款号', dataIndex: 'styleNo', width: 110 },
    { title: '工厂', dataIndex: 'factoryName', width: 100 },
    {
      title: '当前单价', dataIndex: 'currentPrice', width: 90, align: 'right' as const,
      render: (v: number) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '历史均价', dataIndex: 'avgHistoryPrice', width: 90, align: 'right' as const,
      render: (v: number) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '偏离', dataIndex: 'deviationPercent', width: 80, align: 'right' as const,
      render: (v: number) => {
        const abs = Math.abs(v ?? 0);
        const color = abs > 30 ? 'red' : abs > 15 ? 'orange' : 'green';
        return <span style={{ color, fontWeight: 600 }}>{v != null ? `${v > 0 ? '+' : ''}${v.toFixed(1)}%` : '-'}</span>;
      },
    },
    {
      title: '风险', dataIndex: 'riskLevel', width: 70,
      render: (v: string) => <Tag color={riskColorMap[v]}>{riskLabelMap[v]}</Tag>,
    },
  ];

  if (loading && !data) return <Spin tip="正在分析财务数据..." style={{ width: '100%', padding: 80 }} />;

  if (error && !data) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Alert message={error} type="error" showIcon />
        <Button onClick={() => fetchData()} style={{ marginTop: 16 }}>重试</Button>
      </div>
    );
  }

  if (!data) return <Empty description="暂无数据" />;

  const sg = suggestionMap[data.suggestion] || suggestionMap.REVIEW;
  const s = data.summary;
  const pa = data.profitAnalysis;

  return (
    <div className="fap-panel">
      {/* ── 顶部：AI建议 + 总览 ── */}
      <Card size="small" className="fap-top-card">
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <div className="fap-suggestion">
              <Tag color={sg.color} icon={sg.icon} style={{ fontSize: 14, padding: '4px 12px' }}>
                {sg.label}
              </Tag>
              <Tag color={riskColorMap[data.overallRisk]} style={{ marginLeft: 8 }}>
                整体风险: {riskLabelMap[data.overallRisk]}
              </Tag>
              <span className="fap-suggestion-text">{data.suggestionText}</span>
            </div>
          </Col>
          <Col>
            <Tooltip title="刷新分析">
              <Button icon={<ReloadOutlined />} size="small" onClick={() => fetchData()} loading={loading} />
            </Tooltip>
          </Col>
        </Row>
      </Card>

      {/* ── 统计卡片 ── */}
      <Row gutter={12} style={{ margin: '12px 0' }}>
        <Col span={4}>
          <Card size="small"><Statistic title="分析订单" value={s.totalOrders} prefix={<AuditOutlined />} /></Card>
        </Col>
        <Col span={4}>
          <Card size="small"><Statistic title="入库总量" value={s.totalWarehousedQty} suffix="件" /></Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="结算总额" value={s.totalSettlementAmount} prefix="¥" precision={0} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="异常发现" value={s.anomalyCount}
              valueStyle={{ color: s.anomalyCount > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="高风险" value={s.highRiskCount}
              valueStyle={{ color: s.highRiskCount > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card size="small">
            <Statistic title="重复结算嫌疑" value={s.duplicateSuspectCount}
              valueStyle={{ color: s.duplicateSuspectCount > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
      </Row>

      {/* ── 利润率概览 ── */}
      {pa && (
        <Card size="small" title={<><DollarOutlined /> 利润率分析</>} style={{ marginBottom: 12 }}>
          <Row gutter={24}>
            <Col><Statistic title="平均利润率" value={pa.avgProfitMargin ?? 0} suffix="%" precision={1} /></Col>
            <Col><Statistic title="负利润" value={pa.negativeCount} valueStyle={{ color: '#cf1322' }} /></Col>
            <Col><Statistic title="低利润(<5%)" value={pa.lowProfitCount} valueStyle={{ color: '#fa8c16' }} /></Col>
            <Col><Statistic title="异常高(>30%)" value={pa.abnormalHighCount} valueStyle={{ color: '#1890ff' }} /></Col>
            <Col><Statistic title="正常" value={pa.normalCount} valueStyle={{ color: '#3f8600' }} /></Col>
          </Row>
        </Card>
      )}

      {/* ── 异常发现列表 ── */}
      <div className="fap-section-title">异常发现（{data.findings?.length ?? 0}项）</div>
      <Table<AuditFinding>
        dataSource={data.findings ?? []}
        columns={findingCols}
        rowKey={(_, i) => String(i)}
        size="small"
        pagination={false}
        scroll={{ y: 240 }}
        locale={{ emptyText: <span style={{ color: '#52c41a' }}>✅ 未发现异常，数据健康</span> }}
      />

      {/* ── 单价偏离检测 ── */}
      {(data.priceDeviations?.length ?? 0) > 0 && (
        <>
          <div className="fap-section-title" style={{ marginTop: 16 }}>
            单价偏离预警（{data.priceDeviations.length}项）
          </div>
          <Table<PriceDeviation>
            dataSource={data.priceDeviations}
            columns={deviationCols}
            rowKey={(_, i) => String(i)}
            size="small"
            pagination={false}
            scroll={{ y: 200 }}
          />
        </>
      )}
    </div>
  );
};

export default FinanceAuditPanel;
