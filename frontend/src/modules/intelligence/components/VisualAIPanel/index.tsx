import React, { useState } from 'react';
import { Button, Select, Input, Tag, Progress, Spin } from 'antd';
import { EyeOutlined, CameraOutlined, AlertOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { visualAnalyze } from '@/services/intelligenceApi';
import type { VisualAIRequest, VisualAIResponse, VisualDefect } from '@/services/intelligenceApi';
import './VisualAIPanel.css';

const { Option } = Select;

const LEVEL_COLOR: Record<string, string> = {
  CRITICAL: '#ff7875',
  HIGH:     '#ff7a45',
  MEDIUM:   '#faad14',
  LOW:      '#52c41a',
  NONE:     '#00e5ff',
};

const TASK_LABELS: Record<string, string> = {
  DEFECT_DETECT:    '缺陷检测',
  STYLE_IDENTIFY:   '款式识别',
  COLOR_CHECK:      '颜色校验',
};

const DefectItem: React.FC<{ d: VisualDefect }> = ({ d }) => (
  <div className="vai-defect-row">
    <Tag color={LEVEL_COLOR[d.level]} style={{ fontSize: 10, lineHeight: '16px', marginRight: 6 }}>
      {d.level}
    </Tag>
    <span className="vai-defect-type">{d.type}</span>
    <span className="vai-defect-desc">{d.description}</span>
    {d.location && <span className="vai-defect-loc">@ {d.location}</span>}
  </div>
);

const VisualAIPanel: React.FC = () => {
  const [imageUrl, setImageUrl]   = useState('');
  const [taskType, setTaskType]   = useState<VisualAIRequest['taskType']>('DEFECT_DETECT');
  const [styleNo, setStyleNo]     = useState('');
  const [colorCode, setColorCode] = useState('');
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<VisualAIResponse | null>(null);

  const handleAnalyze = async () => {
    if (!imageUrl.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await visualAnalyze({
        imageUrl,
        taskType,
        styleNo: styleNo.trim() || undefined,
        colorCode: colorCode.trim() || undefined,
      });
      setResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '分析失败';
      setResult({ taskType, success: false, confidence: 0, summary: msg, errorMessage: msg });
    } finally {
      setLoading(false);
    }
  };

  const severityColor = result?.severity ? LEVEL_COLOR[result.severity] ?? '#00e5ff' : '#00e5ff';

  return (
    <div className="vai-panel">
      {/* 标题 */}
      <div className="vai-header">
        <CameraOutlined className="vai-header-icon" />
        <span className="vai-header-title">视觉 AI 质检</span>
        <Tag className="vai-badge">VisualAI v1.0</Tag>
      </div>

      {/* 输入区 */}
      <div className="vai-form">
        <Input
          className="vai-input"
          placeholder="图片 URL（支持 COS / CDN / 本地测试地址）"
          value={imageUrl}
          onChange={e => setImageUrl(e.target.value)}
          onPressEnter={handleAnalyze}
          prefix={<EyeOutlined style={{ color: '#00e5ff', opacity: 0.6 }} />}
        />

        <div className="vai-form-row">
          <Select
            className="vai-select"
            value={taskType}
            onChange={v => setTaskType(v)}
            dropdownStyle={{ background: '#0d1b2e', border: '1px solid rgba(0,229,255,0.3)' }}
          >
            <Option value="DEFECT_DETECT"> 缺陷检测</Option>
            <Option value="STYLE_IDENTIFY"> 款式识别</Option>
            <Option value="COLOR_CHECK"> 颜色校验</Option>
          </Select>

          <Input
            className="vai-input-sm"
            placeholder="款号（可选）"
            value={styleNo}
            onChange={e => setStyleNo(e.target.value)}
          />
          <Input
            className="vai-input-sm"
            placeholder="色号（可选）"
            value={colorCode}
            onChange={e => setColorCode(e.target.value)}
          />
        </div>

        <Button
          className="vai-btn"
          type="primary"
          block
          loading={loading}
          disabled={!imageUrl.trim()}
          onClick={handleAnalyze}
          icon={<CameraOutlined />}
        >
          {loading ? 'AI 分析中…' : '开始 AI 分析'}
        </Button>
      </div>

      {/* 结果区 */}
      {loading && (
        <div className="vai-loading">
          <Spin size="small" />
          <span>正在调用视觉 AI 模型…</span>
        </div>
      )}

      {result && !loading && (
        <div className="vai-result">
          {/* 顶部状态栏 */}
          <div className="vai-result-top">
            <div className="vai-result-status">
              {result.success
                ? <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 5 }} />
                : <AlertOutlined style={{ color: '#ff7875', marginRight: 5 }} />
              }
              <span className="vai-task-label">{TASK_LABELS[result.taskType] ?? result.taskType}</span>
            </div>
            {result.severity && (
              <Tag style={{ color: severityColor, borderColor: severityColor, background: `${severityColor}18`, fontSize: 11 }}>
                {result.severity}
              </Tag>
            )}
          </div>

          {/* 置信度 */}
          <div className="vai-confidence-row">
            <span className="vai-conf-label">AI 置信度</span>
            <Progress
              percent={result.confidence}
              size="small"
              strokeColor={severityColor}
              trailColor="rgba(255,255,255,0.06)"
              style={{ flex: 1 }}
            />
            <span className="vai-conf-val">{result.confidence}%</span>
          </div>

          {/* 缺陷列表 */}
          {result.defects && result.defects.length > 0 && (
            <div className="vai-defects">
              <div className="vai-section-label">检测到 {result.defects.length} 处问题</div>
              {result.defects.map((d, i) => <DefectItem key={i} d={d} />)}
            </div>
          )}

          {/* 款式特征 */}
          {result.styleFeatures && Object.keys(result.styleFeatures).length > 0 && (
            <div className="vai-features">
              <div className="vai-section-label">款式特征</div>
              <div className="vai-features-grid">
                {Object.entries(result.styleFeatures).map(([k, v]) => (
                  <div key={k} className="vai-feature-item">
                    <span className="vai-feature-key">{k}</span>
                    <span className="vai-feature-val">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 颜色校验 */}
          {result.colorAssessment && (
            <div className="vai-color-row">
              <span className="vai-section-label">颜色校验：</span>
              <span style={{ color: '#c8d8ea', fontSize: 12 }}>{result.colorAssessment}</span>
            </div>
          )}

          {/* 总结 */}
          <div className="vai-summary">{result.summary}</div>

          {/* 建议 */}
          {result.suggestion && (
            <div className="vai-suggestion">
              <span className="vai-suggest-icon"></span>
              {result.suggestion}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VisualAIPanel;
