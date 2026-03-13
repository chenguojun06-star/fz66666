/**
 * 经营基准面板（KPI Benchmark）
 * 权限控制：超管 / 租户主 / INTELLIGENCE_BENCHMARK_VIEW
 * 展示：完成率 / 逾期率 / 准时率 / 次品率 / 效率分（0-100）/ AI 建议
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Col, Progress, Row, Statistic, Spin, Tooltip, Typography } from 'antd';
import { InfoCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getBenchmarkPerformance, type BenchmarkPerformanceResult } from '@/services/intelligenceApi';

const { Text } = Typography;

const KpiCard: React.FC<{
  label: string;
  value?: number;
  suffix?: string;
  green?: number;
  red?: number;
  inverse?: boolean; // 值越低越好
  hint?: string;
}> = ({ label, value, suffix = '%', green = 85, red = 70, inverse = false, hint }) => {
  const isGood = value !== undefined && (inverse ? value <= (100 - green) : value >= green);
  const isBad  = value !== undefined && (inverse ? value >= (100 - red)  : value <= red);
  const color = isGood ? '#10b981' : isBad ? '#ef4444' : '#f59e0b';

  return (
    <div style={{ textAlign: 'center', padding: '12px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
      <Statistic
        title={
          <Text style={{ color: '#64748b', fontSize: 11 }}>
            {label}
            {hint && (
              <Tooltip title={hint}>
                <InfoCircleOutlined style={{ marginLeft: 4, color: '#475569' }} />
              </Tooltip>
            )}
          </Text>
        }
        value={value ?? '--'}
        suffix={value !== undefined ? suffix : ''}
        precision={1}
        valueStyle={{ color, fontSize: 22, fontWeight: 700 }}
      />
    </div>
  );
};

const BenchmarkKpiPanel: React.FC = () => {
  const [data, setData] = useState<BenchmarkPerformanceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getBenchmarkPerformance();
      setData(res);
    } catch {
      setError('经营基准数据加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 顶部操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        {data?.snapshotDate && (
          <Text style={{ color: '#475569', fontSize: 11 }}>
            截至 {data.snapshotDate}
          </Text>
        )}
        <Button
          size="small" type="text"
          icon={<ReloadOutlined spin={loading} />}
          onClick={fetchData}
          style={{ color: '#64748b' }}
        />
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
      {error && <Alert message={error} type="error" showIcon banner style={{ margin: '8px 0' }} />}

      {data && !loading && (
        <>
          {/* 4 KPI 卡片 */}
          <Row gutter={[10, 10]} style={{ marginBottom: 14 }}>
            <Col span={6}>
              <KpiCard
                label="订单完成率"
                value={data.completionRate}
                green={85} red={70}
                hint="已完工订单 / 总订单数"
              />
            </Col>
            <Col span={6}>
              <KpiCard
                label="逾期率"
                value={data.overdueRate}
                green={5} red={15}
                inverse
                hint="已逾期订单 / 总订单数（越低越好）"
              />
            </Col>
            <Col span={6}>
              <KpiCard
                label="准时交货率"
                value={data.onTimeRate}
                green={90} red={75}
                hint="按期完工 / 总已完工订单"
              />
            </Col>
            <Col span={6}>
              <KpiCard
                label="次品率"
                value={data.defectRate}
                green={1} red={3}
                inverse
                hint="质检不合格件 / 总扫码件数（越低越好）"
              />
            </Col>
          </Row>

          {/* 效率分大圆环 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 14, padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ flexShrink: 0 }}>
              <Progress
                type="circle"
                size={72}
                percent={data.effScore ?? 0}
                strokeColor={
                  (data.effScore ?? 0) >= 80 ? '#10b981' :
                  (data.effScore ?? 0) >= 60 ? '#f59e0b' : '#ef4444'
                }
                trailColor="rgba(255,255,255,0.08)"
                format={v => <span style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 700 }}>{v}</span>}
              />
            </div>
            <div>
              <Text style={{ color: '#94a3b8', fontSize: 11, display: 'block' }}>综合效率分（0-100）</Text>
              <Text style={{ color: '#64748b', fontSize: 11 }}>
                由完成率×40% + 准时率×35% + 次品率（反向）×25% 加权计算
              </Text>
            </div>
          </div>

          {/* AI 建议 */}
          {data.aiAdvice && (
            <div style={{ padding: '10px 14px', background: 'rgba(244,114,182,0.06)', borderRadius: 8, border: '1px solid rgba(244,114,182,0.2)' }}>
              <Text style={{ color: '#f472b6', fontSize: 11, fontStyle: 'italic' }}>
                🤖 AI 诊断：{data.aiAdvice}
              </Text>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BenchmarkKpiPanel;
