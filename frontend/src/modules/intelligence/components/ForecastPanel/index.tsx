import React, { useState } from 'react';
import { Button, Input, Select, Progress, Tag, Spin } from 'antd';
import { RiseOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { runForecast, ForecastRequest, ForecastResult } from '@/services/intelligenceApi';
import './ForecastPanel.css';

const { Option } = Select;

const FORECAST_TYPES: { value: ForecastRequest['forecastType']; label: string; desc: string }[] = [
  { value: 'COST', label: '成本预测', desc: '预测款式或订单的生产成本走势' },
  { value: 'MATERIAL', label: '面料用量', desc: '预测面料需求量与采购时机' },
  { value: 'DEMAND', label: '订单需求', desc: '预测未来订单量与排期压力' },
];

const HORIZONS: { value: string; label: string }[] = [
  { value: '30d', label: '未来 30 天' },
  { value: '60d', label: '未来 60 天' },
  { value: '90d', label: '未来 90 天' },
];

function confidenceColor(conf: number): string {
  if (conf >= 80) return '#52c41a';
  if (conf >= 60) return '#a78bfa';
  if (conf >= 40) return '#faad14';
  return '#ff7a45';
}

function formatValue(val: number, type: ForecastRequest['forecastType']): string {
  if (type === 'COST') return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (type === 'MATERIAL') return `${val.toLocaleString('zh-CN')} 米`;
  return `${val.toLocaleString('zh-CN')} 件`;
}

export default function ForecastPanel() {
  const [forecastType, setForecastType] = useState<ForecastRequest['forecastType']>('COST');
  const [subjectId, setSubjectId] = useState('');
  const [horizon, setHorizon] = useState<string>('30d');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedType = FORECAST_TYPES.find(t => t.value === forecastType)!;

  const handleRun = async () => {
    if (!subjectId.trim()) {
      setError('请输入款式号或订单号');
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await runForecast({ forecastType, subjectId: subjectId.trim(), horizon });
      setResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '预测请求失败，请稍后重试';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const confColor = result ? confidenceColor(result.confidence) : '#a78bfa';

  return (
    <div className="fp-panel">
      {/* 标题行 */}
      <div className="fp-header">
        <RiseOutlined className="fp-header-icon" />
        <span className="fp-header-title">预测引擎</span>
        <Tag className="fp-badge">AI Forecast</Tag>
      </div>

      {/* 说明文字 */}
      <div className="fp-desc">{selectedType.desc}</div>

      {/* 表单 */}
      <div className="fp-form">
        <Select
          className="fp-select"
          value={forecastType}
          onChange={val => { setForecastType(val); setResult(null); setError(null); }}
          size="small"
        >
          {FORECAST_TYPES.map(t => (
            <Option key={t.value} value={t.value}>{t.label}</Option>
          ))}
        </Select>

        <div className="fp-form-row">
          <Input
            className="fp-input"
            placeholder="款式号 / 订单号"
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            onPressEnter={handleRun}
            prefix={<span className="fp-input-icon">#</span>}
            size="small"
          />
          <Select
            className="fp-horizon"
            value={horizon}
            onChange={setHorizon}
            size="small"
          >
            {HORIZONS.map(h => (
              <Option key={h.value} value={h.value}>{h.label}</Option>
            ))}
          </Select>
        </div>

        <Button
          className="fp-btn"
          icon={<ThunderboltOutlined />}
          onClick={handleRun}
          loading={loading}
          size="small"
          disabled={loading}
        >
          开始预测
        </Button>
      </div>

      {/* 加载中 */}
      {loading && (
        <div className="fp-loading">
          <Spin size="small" />
          <span>AI 预测引擎计算中…</span>
        </div>
      )}

      {/* 错误提示 */}
      {error && !loading && (
        <div className="fp-error"> {error}</div>
      )}

      {/* 预测结果 */}
      {result && !loading && (
        <div className="fp-result">
          {/* 核心预测值 */}
          <div className="fp-value-block">
            <div className="fp-value-label">{selectedType.label}预测值</div>
            <div className="fp-value-main">{formatValue(result.predictedValue, forecastType)}</div>
            <div className="fp-value-range">
              <span className="fp-range-low">{formatValue(result.optimisticLow, forecastType)}</span>
              <span className="fp-range-sep">～</span>
              <span className="fp-range-high">{formatValue(result.pessimisticHigh, forecastType)}</span>
            </div>
            <div className="fp-range-hint">乐观 ～ 悲观区间</div>
          </div>

          {/* 置信度 */}
          <div className="fp-confidence-row">
            <span className="fp-conf-label">预测置信度</span>
            <Progress
              percent={result.confidence}
              size="small"
              strokeColor={confColor}
              trailColor="rgba(255,255,255,0.06)"
              style={{ flex: 1 }}
              showInfo={false}
            />
            <span className="fp-conf-val" style={{ color: confColor }}>
              {result.confidence}%
            </span>
          </div>

          {/* 算法徽章 */}
          <div className="fp-algorithm-row">
            <span className="fp-algo-label">算法模型</span>
            <Tag className="fp-algo-tag">{result.algorithm}</Tag>
          </div>

          {/* AI 分析依据（可选字段） */}
          {result.rationale && (
            <div className="fp-rationale">
              <div className="fp-section-label">AI 分析依据</div>
              <div className="fp-rationale-text">{result.rationale}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
