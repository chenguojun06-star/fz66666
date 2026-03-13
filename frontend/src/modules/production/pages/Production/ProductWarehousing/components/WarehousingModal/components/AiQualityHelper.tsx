/**
 * AI质检助手组件
 * 1. 历史质检建议（基于订单ID）
 * 2. 视觉AI质检（图片URL → 缺陷检测 / 款式识别 / 色差检测）
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Alert, Button, Input, Select, Space, Spin, Tag, Typography } from 'antd';
import { BulbOutlined, CameraOutlined, CheckCircleOutlined, DownOutlined, SearchOutlined, UpOutlined, WarningOutlined } from '@ant-design/icons';
import { qualityAiApi, QualityAiSuggestionResult } from '@/services/production/productionApi';
import { analyzeVisualAI, type VisualAnalyzeResult } from '@/services/intelligenceApi';

const { Text } = Typography;

interface AiQualityHelperProps {
  orderId?: string | number;
  defectCategory?: string;
  onAdopt: (text: string) => void;
}

const verdictColor: Record<string, string> = {
  good: '#52c41a',
  warn: '#faad14',
  critical: '#ff4d4f',
};
const verdictLabel: Record<string, string> = {
  good: '历史良好',
  warn: '历史偏高',
  critical: '历史严重',
};

const AiQualityHelper: React.FC<AiQualityHelperProps> = ({ orderId, defectCategory, onAdopt }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<QualityAiSuggestionResult | null>(null);

  const fetchSuggestion = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const res = await qualityAiApi.getSuggestion(id);
      if (res?.code === 200 && res.data) {
        setData(res.data);
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (orderId) {
      fetchSuggestion(String(orderId));
    } else {
      setData(null);
    }
  }, [orderId, fetchSuggestion]);

  if (!orderId) return null;

  const suggestion = defectCategory && data?.defectSuggestions?.[defectCategory]
    ? data.defectSuggestions[defectCategory]
    : null;

  return (
    <div style={{ margin: '8px 0', padding: '10px 12px', background: '#f0f7ff', borderRadius: 6, border: '1px solid #d0e8ff' }}>
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <BulbOutlined style={{ color: '#1677ff', fontSize: 14 }} />
        <Text strong style={{ fontSize: 13, color: '#1677ff' }}>AI质检助手</Text>
        {loading && <Spin size="small" style={{ marginLeft: 4 }} />}
        {data && data.historicalVerdict && (
          <Tag color={verdictColor[data.historicalVerdict]} style={{ marginLeft: 'auto', fontSize: 11 }}>
            {verdictLabel[data.historicalVerdict]}
            {data.historicalDefectRate != null && ` ${(data.historicalDefectRate * 100).toFixed(1)}%`}
          </Tag>
        )}
        {data?.isUrgent && (
          <Tag color="orange">加急</Tag>
        )}
      </div>

      {/* 加急提示 */}
      {data?.urgentTip && (
        <Alert
          message={data.urgentTip}
          type="warning"
          showIcon
          icon={<WarningOutlined />}
          style={{ marginBottom: 8, padding: '4px 10px', fontSize: 12 }}
          banner
        />
      )}

      {/* 历史严重缺陷告警 */}
      {data?.historicalVerdict === 'critical' && !data.urgentTip && (
        <Alert
          message="该订单历史次品率偏高，请加强本次质检力度"
          type="error"
          showIcon
          style={{ marginBottom: 8, padding: '4px 10px', fontSize: 12 }}
          banner
        />
      )}

      {/* 质检要点 */}
      {data && data.checkpoints && data.checkpoints.length > 0 && (
        <div style={{ marginBottom: suggestion ? 8 : 0 }}>
          <Text type="secondary" style={{ fontSize: 12 }}>质检要点：</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {data.checkpoints.map((point, idx) => (
              <Tag key={idx} color="blue" style={{ fontSize: 11, margin: 0 }}>{point}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* 异常建议 + 采纳按钮 */}
      {defectCategory && !loading && (
        suggestion ? (
          <div style={{ marginTop: 8, padding: '8px 10px', background: '#fffbe6', borderRadius: 4, border: '1px solid #ffe58f' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <CheckCircleOutlined style={{ color: '#faad14', marginTop: 2, flexShrink: 0 }} />
              <Text style={{ fontSize: 12, flex: 1 }}>{suggestion}</Text>
              <Button
                type="primary"
                size="small"
                style={{ flexShrink: 0, marginLeft: 8 }}
                onClick={() => onAdopt(suggestion)}
              >
                采纳
              </Button>
            </div>
          </div>
        ) : (
          !loading && data && (
            <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 4 }}>
              暂无该次品类别的处理建议
            </Text>
          )
        )
      )}
      {/* ── 视觉AI质检区块 ── */}
      <VisualAIPanel orderId={orderId} onAdopt={onAdopt} />
    </div>
  );
};

const SEVERITY_COLOR: Record<string, string> = { NONE: '#10b981', LOW: '#faad14', MED: '#f97316', HIGH: '#ef4444' };
const SEVERITY_LABEL: Record<string, string> = { NONE: '无异常', LOW: '轻微缺陷', MED: '中度缺陷', HIGH: '严重缺陷' };

interface VisualAIPanelProps {
  orderId?: string | number;
  onAdopt: (text: string) => void;
}

const VisualAIPanel: React.FC<VisualAIPanelProps> = ({ orderId, onAdopt }) => {
  const [expanded, setExpanded] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [taskType, setTaskType] = useState<'DEFECT_DETECT' | 'STYLE_IDENTIFY' | 'COLOR_CHECK'>('DEFECT_DETECT');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VisualAnalyzeResult | null>(null);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!imageUrl.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await analyzeVisualAI({ imageUrl: imageUrl.trim(), taskType, orderId });
      setResult(res);
    } catch {
      setError('视觉AI分析失败，请检查图片链接或稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ marginTop: 8, padding: '8px 12px', background: '#0f172a', borderRadius: 6, border: '1px solid #334155' }}>
      {/* 折叠标题 */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(p => !p)}
      >
        <CameraOutlined style={{ color: '#a78bfa', fontSize: 13 }} />
        <Text strong style={{ fontSize: 12, color: '#a78bfa' }}>视觉AI质检</Text>
        <Tag style={{ fontSize: 10, padding: '0 4px', background: 'rgba(167,139,250,0.15)', color: '#a78bfa', borderColor: '#a78bfa33', marginLeft: 4 }}>
          图片识别
        </Tag>
        <span style={{ marginLeft: 'auto', color: '#475569', fontSize: 11 }}>
          {expanded ? <UpOutlined /> : <DownOutlined />}
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 10 }}>
          {/* 输入区 */}
          <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
            <Select
              value={taskType}
              onChange={setTaskType}
              size="small"
              style={{ width: 120 }}
              options={[
                { value: 'DEFECT_DETECT', label: '缺陷检测' },
                { value: 'STYLE_IDENTIFY', label: '款式识别' },
                { value: 'COLOR_CHECK', label: '色差检测' },
              ]}
            />
            <Input
              size="small"
              placeholder="粘贴图片URL（腾讯云COS链接）"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              onPressEnter={handleAnalyze}
              style={{ flex: 1, background: '#1e293b', borderColor: '#334155', color: '#e2e8f0' }}
            />
            <Button
              size="small"
              type="primary"
              ghost
              loading={loading}
              icon={<SearchOutlined />}
              onClick={handleAnalyze}
              disabled={!imageUrl.trim()}
              style={{ borderColor: '#a78bfa', color: '#a78bfa' }}
            >
              分析
            </Button>
          </Space.Compact>

          {/* 结果 */}
          {loading && (
            <div style={{ textAlign: 'center', padding: '12px 0', color: '#64748b' }}>
              <Spin size="small" /> <span style={{ marginLeft: 8, fontSize: 12 }}>AI 视觉分析中…</span>
            </div>
          )}
          {error && <Alert message={error} type="error" showIcon banner style={{ fontSize: 12 }} />}
          {result && !loading && (
            <div style={{ padding: '10px', background: '#1e293b', borderRadius: 6, border: `1px solid ${SEVERITY_COLOR[result.severity]}44` }}>
              {/* severity + confidence */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Tag color={result.severity === 'NONE' ? 'green' : result.severity === 'LOW' ? 'orange' : result.severity === 'MED' ? 'volcano' : 'red'}>
                  {SEVERITY_LABEL[result.severity] ?? result.severity}
                </Tag>
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>置信度 {result.confidence}%</Text>
              </div>
              {/* 检测项 */}
              {result.detectedItems.length > 0 && (
                <div style={{ marginBottom: 6 }}>
                  <Text style={{ color: '#64748b', fontSize: 11 }}>检测到：</Text>
                  {result.detectedItems.map((item, i) => (
                    <Tag key={i} style={{ fontSize: 11, marginTop: 2 }}>{item}</Tag>
                  ))}
                </div>
              )}
              {/* 建议 + 采纳 */}
              {result.recommendation && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 6, padding: '6px 8px', background: '#0f172a', borderRadius: 4 }}>
                  <Text style={{ fontSize: 12, color: '#e2e8f0', flex: 1 }}>{result.recommendation}</Text>
                  <Button
                    type="primary"
                    size="small"
                    style={{ flexShrink: 0 }}
                    onClick={() => onAdopt(`[视觉AI${SEVERITY_LABEL[result.severity]}] ${result.recommendation}`)}
                  >
                    采纳
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AiQualityHelper;
