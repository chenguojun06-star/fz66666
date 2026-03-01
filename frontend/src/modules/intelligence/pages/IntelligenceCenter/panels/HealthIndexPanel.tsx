import React, { useState, useEffect, useCallback } from 'react';
import { Spin, Tag, Alert, Statistic, Row, Col, Tooltip } from 'antd';
import { HeartOutlined, DashboardOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/production/productionApi';
import type { HealthIndexResponse } from '@/services/production/productionApi';

const DIMENSION_LABELS: Record<string, { label: string; emoji: string }> = {
  delivery: { label: '交付', emoji: '📦' },
  quality: { label: '质量', emoji: '✅' },
  efficiency: { label: '效率', emoji: '⚡' },
  capacity: { label: '产能', emoji: '🏭' },
  cost: { label: '成本', emoji: '💰' },
};

const gradeColor = (g: string) => {
  switch (g) {
    case 'A': return '#52c41a';
    case 'B': return '#1890ff';
    case 'C': return '#faad14';
    case 'D': return '#f5222d';
    default: return '#999';
  }
};

const HealthIndexPanel: React.FC = () => {
  const [data, setData] = useState<HealthIndexResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getHealthIndex() as any;
      setData(res?.data ?? null);
    } catch (e: any) {
      setError(e?.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <Spin style={{ display: 'block', padding: 60, textAlign: 'center' }} />;
  if (error) return <Alert type="error" message={error} showIcon />;
  if (!data) return null;

  const dims = [
    { key: 'delivery', value: data.deliveryScore },
    { key: 'quality', value: data.qualityScore },
    { key: 'efficiency', value: data.efficiencyScore },
    { key: 'capacity', value: data.capacityScore },
    { key: 'cost', value: data.costScore },
  ];

  return (
    <div className="intelligence-panel health-panel">
      {/* 健康仪表盘 */}
      <Row gutter={24} align="middle" style={{ marginBottom: 24 }}>
        <Col span={8} style={{ textAlign: 'center' }}>
          <div className="health-gauge">
            <svg viewBox="0 0 120 120" width={140} height={140}>
              <circle cx={60} cy={60} r={52} fill="none" stroke="#f0f0f0" strokeWidth={10} />
              <circle
                cx={60} cy={60} r={52}
                fill="none"
                stroke={gradeColor(data.grade)}
                strokeWidth={10}
                strokeDasharray={`${(data.healthIndex / 100) * 327} 327`}
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
              <text x={60} y={54} textAnchor="middle" fontSize={28} fontWeight={700} fill={gradeColor(data.grade)}>
                {data.healthIndex}
              </text>
              <text x={60} y={74} textAnchor="middle" fontSize={14} fill="#999">
                {data.grade} 级
              </text>
            </svg>
          </div>
        </Col>
        <Col span={16}>
          <Statistic title="综合健康指数" value={data.healthIndex} suffix="/ 100" />
          <div style={{ marginTop: 8 }}>
            <Tag color={gradeColor(data.grade)} style={{ fontSize: 14, padding: '2px 12px' }}>
              等级 {data.grade}
            </Tag>
          </div>
          {data.topRisk && (
            <div style={{ marginTop: 12, color: '#f5222d' }}>
              <DashboardOutlined /> 首要风险：{data.topRisk}
            </div>
          )}
          {data.suggestion && (
            <div style={{ marginTop: 4, color: '#1890ff' }}>
              <HeartOutlined /> {data.suggestion}
            </div>
          )}
        </Col>
      </Row>

      {/* 五维雷达条 */}
      <div className="health-dimensions">
        <h4 style={{ marginBottom: 12 }}>五维评分</h4>
        {dims.map(d => {
          const meta = DIMENSION_LABELS[d.key] || { label: d.key, emoji: '📊' };
          return (
            <div key={d.key} className="health-dim-row">
              <span className="health-dim-label">{meta.emoji} {meta.label}</span>
              <div className="health-dim-bar-bg">
                <Tooltip title={`${d.value} 分`}>
                  <div
                    className="health-dim-bar"
                    style={{
                      width: `${d.value}%`,
                      background: d.value >= 80 ? '#52c41a' : d.value >= 60 ? '#1890ff' : d.value >= 40 ? '#faad14' : '#f5222d',
                    }}
                  />
                </Tooltip>
              </div>
              <span className="health-dim-val">{d.value}</span>
            </div>
          );
        })}
      </div>

      {/* 近期趋势 */}
      {data.trend && data.trend.length > 0 && (
        <div className="health-trend" style={{ marginTop: 20 }}>
          <h4 style={{ marginBottom: 8 }}>近期趋势</h4>
          <div className="health-trend-chart">
            {data.trend.map((t, i) => (
              <Tooltip key={i} title={`${t.date}：${t.index} 分`}>
                <div className="health-trend-bar-wrap">
                  <div
                    className="health-trend-bar"
                    style={{
                      height: `${t.index}%`,
                      background: t.index >= 80 ? '#52c41a' : t.index >= 60 ? '#1890ff' : '#faad14',
                    }}
                  />
                  <div className="health-trend-date">{t.date.slice(5)}</div>
                </div>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HealthIndexPanel;
