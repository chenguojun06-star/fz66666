/**
 * AI智能预测区块
 * 在款式详情页提供：成本预测 / 物料用量预测 / 需求预测
 * 集成 ForecastEngine 后端接口
 */
import React, { useState } from 'react';
import { Alert, Button, Col, Progress, Row, Spin, Statistic, Tag, Tooltip, Typography } from 'antd';
import {
  BulbOutlined,
  LineChartOutlined,
  ReloadOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { runForecast, type ForecastResult } from '@/services/intelligenceApi';

const { Text } = Typography;

interface AiForecastSectionProps {
  styleId?: string | number;
  styleNo?: string;
}

type ForecastType = 'COST' | 'MATERIAL' | 'DEMAND';

const FORECAST_CONFIG: {
  type: ForecastType;
  label: string;
  unit: string;
  color: string;
  icon: React.ReactNode;
  hint: string;
}[] = [
  {
    type: 'COST',
    label: '单件成本预测',
    unit: '元/件',
    color: '#f59e0b',
    icon: <RiseOutlined />,
    hint: '基于BOM物料 + 工序单价 + 历史同款成本，AI估算当前款单件生产成本',
  },
  {
    type: 'MATERIAL',
    label: '物料用量预测',
    unit: '米/百件',
    color: '#10b981',
    icon: <LineChartOutlined />,
    hint: '基于同类款式历史用料损耗率，预测本款生产物料需求量',
  },
  {
    type: 'DEMAND',
    label: '需求量预测',
    unit: '件/季',
    color: '#6366f1',
    icon: <BulbOutlined />,
    hint: '基于历史下单节奏和市场趋势，预测本款下季度需求量',
  },
];

const severityColor = (conf: number): string => {
  if (conf >= 80) return '#10b981';
  if (conf >= 60) return '#f59e0b';
  return '#ef4444';
};

const AiForecastSection: React.FC<AiForecastSectionProps> = ({ styleId, styleNo }) => {
  const [results, setResults] = useState<Partial<Record<ForecastType, ForecastResult>>>({});
  const [loadingSet, setLoadingSet] = useState<Set<ForecastType>>(new Set());
  const [errors, setErrors] = useState<Partial<Record<ForecastType, string>>>({});

  const handleForecast = async (type: ForecastType) => {
    if (!styleId) return;
    setLoadingSet(prev => new Set(prev).add(type));
    setErrors(prev => { const n = { ...prev }; delete n[type]; return n; });
    try {
      const result = await runForecast({
        forecastType: type,
        subjectId: String(styleId),
        horizon: type === 'DEMAND' ? '90d' : '30d',
      });
      setResults(prev => ({ ...prev, [type]: result }));
    } catch {
      setErrors(prev => ({ ...prev, [type]: '预测失败，请稍后重试' }));
    } finally {
      setLoadingSet(prev => { const n = new Set(prev); n.delete(type); return n; });
    }
  };

  if (!styleId) return null;

  return (
    <div
      style={{
        padding: '16px',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        borderRadius: 8,
        border: '1px solid #334155',
        marginTop: 8,
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 15, color: '#a78bfa', fontWeight: 700 }}>🤖 AI 智能预测</span>
        {styleNo && (
          <Tag color="purple" style={{ fontSize: 11 }}>{styleNo}</Tag>
        )}
        <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
          ForecastEngine v2.0 · 置信度越高越准确
        </Text>
      </div>

      <Row gutter={12}>
        {FORECAST_CONFIG.map(cfg => {
          const res = results[cfg.type];
          const loading = loadingSet.has(cfg.type);
          const error = errors[cfg.type];

          return (
            <Col span={8} key={cfg.type}>
              <div
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 8,
                  border: `1px solid ${cfg.color}33`,
                  padding: '12px 14px',
                  minHeight: 160,
                  position: 'relative',
                }}
              >
                {/* 小标题 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                  <span style={{ color: cfg.color, fontSize: 14 }}>{cfg.icon}</span>
                  <Tooltip title={cfg.hint}>
                    <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: 600, cursor: 'help' }}>
                      {cfg.label}
                    </Text>
                  </Tooltip>
                </div>

                {loading ? (
                  <div style={{ textAlign: 'center', paddingTop: 32 }}>
                    <Spin size="small" />
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>AI 计算中…</div>
                  </div>
                ) : error ? (
                  <Alert
                    message={error}
                    type="error"
                    showIcon
                    style={{ marginBottom: 8, fontSize: 12 }}
                    banner
                  />
                ) : res ? (
                  <>
                    {/* 主数字 */}
                    <Statistic
                      value={res.predictedValue}
                      precision={1}
                      suffix={cfg.unit}
                      valueStyle={{ color: cfg.color, fontSize: 20, fontWeight: 700 }}
                    />
                    {/* 置信度 */}
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text style={{ color: '#94a3b8', fontSize: 11 }}>置信度</Text>
                        <Text style={{ color: severityColor(res.confidence), fontSize: 11, fontWeight: 600 }}>
                          {res.confidence}%
                        </Text>
                      </div>
                      <Progress
                        percent={res.confidence}
                        size="small"
                        showInfo={false}
                        strokeColor={severityColor(res.confidence)}
                        trailColor="#334155"
                      />
                    </div>
                    {/* 区间 */}
                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
                      区间：{res.optimisticLow.toFixed(1)} ~ {res.pessimisticHigh.toFixed(1)} {cfg.unit}
                    </div>
                    {/* 算法 + 刷新 */}
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Tag style={{ fontSize: 10, padding: '0 4px', background: 'rgba(99,102,241,0.15)', color: '#a5b4fc', borderColor: '#6366f133' }}>
                        {res.algorithm}
                      </Tag>
                      <Button
                        type="link"
                        size="small"
                        icon={<ReloadOutlined />}
                        style={{ padding: 0, marginLeft: 'auto', color: '#475569' }}
                        onClick={() => handleForecast(cfg.type)}
                      />
                    </div>
                  </>
                ) : (
                  /* 初始状态 */
                  <div style={{ textAlign: 'center', paddingTop: 20 }}>
                    <div style={{ color: '#475569', fontSize: 12, marginBottom: 12 }}>点击运行AI预测</div>
                    <Button
                      type="primary"
                      size="small"
                      ghost
                      icon={<RiseOutlined />}
                      style={{ borderColor: cfg.color, color: cfg.color }}
                      onClick={() => handleForecast(cfg.type)}
                    >
                      运行预测
                    </Button>
                  </div>
                )}
              </div>
            </Col>
          );
        })}
      </Row>

      {/* 底部 AI 依据说明（仅在有结果时显示） */}
      {Object.values(results).some(Boolean) && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(167,139,250,0.08)', borderRadius: 6, border: '1px solid rgba(167,139,250,0.2)' }}>
          <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: 600 }}>AI 分析依据：</Text>
          {FORECAST_CONFIG.map(cfg => results[cfg.type]?.rationale ? (
            <div key={cfg.type} style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
              <span style={{ color: cfg.color }}>●</span> <strong>{cfg.label}</strong>：{results[cfg.type]!.rationale}
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
};

export default AiForecastSection;
