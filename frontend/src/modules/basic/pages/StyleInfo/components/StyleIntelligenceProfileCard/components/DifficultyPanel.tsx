import React from 'react';
import { Button, Progress, Spin, Tag } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import type { DifficultyAssessment, VisualAIResponse } from '@/services/intelligence/intelligenceApi';
import { difficultyColor, SEVERITY_COLOR } from '../helpers';
import { cleanVisionText } from '../../StyleBasicInfoForm/styleFeature';

interface DifficultyPanelProps {
  loading: boolean;
  difficultyLoading: boolean;
  activeDifficulty: DifficultyAssessment | null;
  visualResult: VisualAIResponse | null;
  styleId: string | number | undefined;
  onAiImageAnalysis: () => void;
}

const DifficultyPanel: React.FC<DifficultyPanelProps> = ({
  loading,
  difficultyLoading,
  activeDifficulty,
  visualResult,
  styleId,
  onAiImageAnalysis,
}) => {
  return (
    <div className="u-flex-1" style={{ minWidth: 0, padding: '6px 8px', borderRadius: 7, background: 'rgba(114,46,209,0.04)', border: '1px solid rgba(114,46,209,0.12)' }}>
      <div className="u-fs-13 u-fw-600" style={{ marginBottom: 5, color: 'var(--color-accent-purple)' }}>难度评估</div>
      {loading ? (
        <Spin />
      ) : activeDifficulty ? (
        <div>
          <div className="u-d-flex u-ai-center u-jc-between" style={{ marginBottom: 3 }}>
            <div className="u-d-flex u-ai-center u-gap-4">
              <Tag color={difficultyColor(activeDifficulty.difficultyLevel)} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>{activeDifficulty.difficultyLabel}</Tag>
              {activeDifficulty.assessmentSource === 'AI_ENHANCED' && <Tag color="purple" style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>AI增强</Tag>}
            </div>
            <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={onAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12, height: 20, padding: '0 5px' }}>图像分析</Button>
          </div>
          <div className="u-d-flex u-ai-center u-gap-6 u-mb-4">
            <Progress percent={activeDifficulty.difficultyScore * 10} showInfo={false}
              strokeColor={difficultyColor(activeDifficulty.difficultyLevel) === 'green' ? 'var(--color-success)' : difficultyColor(activeDifficulty.difficultyLevel) === 'orange' ? 'var(--color-warning)' : 'var(--color-danger)'}
              style={{ flex: 1, margin: 0 }} />
            <span className="u-fs-12 u-ws-nowrap" style={{ color: 'var(--color-gray-700)' }}><b>{activeDifficulty.difficultyScore}</b>/10 ×<b style={{ color: 'var(--color-accent-purple)' }}>{activeDifficulty.pricingMultiplier}</b></span>
          </div>
          <div className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>物料清单 {activeDifficulty.bomCount}种 · 工序 {activeDifficulty.processCount}道{activeDifficulty.hasSecondaryProcess ? ' · 含二次工艺' : ''}</div>
          {activeDifficulty.imageInsight && (() => {
            const insight = activeDifficulty.imageInsight as string;
            const isError = insight.includes('未开通') || insight.includes('读取失败') || insight.includes('未配置') || insight.includes('未上传');
            return (
              <div style={{ fontSize: 12, color: isError ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', marginTop: 3, lineHeight: 1.5, background: isError ? 'rgba(0,0,0,0.02)' : 'rgba(114,46,209,0.03)', borderRadius: 4, padding: '3px 5px' }}>
                {insight}
              </div>
            );
          })()}
          {visualResult && (
            <div className="u-mt-4 u-br-4" style={{ padding: '4px 6px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
              <div className="u-d-flex u-ai-center u-gap-4" style={{ marginBottom: 3 }}>
                <span className="u-fs-12 u-fw-600" style={{ color: 'var(--color-accent-cyan)' }}>视觉AI</span>
                {visualResult.severity && visualResult.severity !== 'NONE' && (
                  <Tag style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }} color={SEVERITY_COLOR[visualResult.severity] ?? 'default'}>{visualResult.severity}</Tag>
                )}
                <span className="u-fs-11 u-ml-auto" style={{ color: 'var(--color-text-tertiary)' }}>置信度 {Math.round(visualResult.confidence * 100)}%</span>
              </div>
              <div className="u-fs-12" style={{ color: 'var(--color-gray-700)', lineHeight: 1.5 }}>
                {(() => {
                  const clean = cleanVisionText(visualResult.summary);
                  return clean || '（未识别到有效视觉信息，请重新上传清晰图片后再试）';
                })()}
              </div>
              {visualResult.defects && visualResult.defects.length > 0 && (
                <div style={{ marginTop: 3 }}>
                  {visualResult.defects.slice(0, 3).map((d, i) => (
                    <div key={i} className="u-fs-11" style={{ color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>• [{d.level}] {d.type} — {d.description}{d.location ? ` @ ${d.location}` : ''}</div>
                  ))}
                </div>
              )}
              {visualResult.styleFeatures && Object.keys(visualResult.styleFeatures).length > 0 && (
                <div className="u-d-flex u-fwrap-wrap" style={{ gap: 3, marginTop: 3 }}>
                  {Object.entries(visualResult.styleFeatures).slice(0, 4).map(([k, v]) => (
                    <Tag key={k} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{k}: {v}</Tag>
                  ))}
                </div>
              )}
              {visualResult.suggestion && (
                <div className="u-fs-12" style={{ color: 'var(--color-accent-purple)', marginTop: 3 }}>{visualResult.suggestion}</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="u-ta-center" style={{ padding: '12px 0' }}>
          <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={onAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12 }}>AI 难度分析</Button>
          <div className="u-fs-11 u-mt-4" style={{ color: 'var(--color-text-quaternary)' }}>分析款式图片，评估制作难度与定价倍率</div>
        </div>
      )}
    </div>
  );
};

export default DifficultyPanel;
