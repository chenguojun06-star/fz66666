import React from 'react';
import { Button, Progress, Spin, Tag } from 'antd';
import { ExperimentOutlined } from '@ant-design/icons';
import type { DifficultyAssessment, VisualAIResponse } from '@/services/intelligence/intelligenceApi';
import { difficultyColor, SEVERITY_COLOR } from '../helpers';

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
    <div style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 7, background: 'rgba(114,46,209,0.04)', border: '1px solid rgba(114,46,209,0.12)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5, color: 'var(--color-accent-purple)' }}>难度评估</div>
      {loading ? (
        <Spin />
      ) : activeDifficulty ? (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tag color={difficultyColor(activeDifficulty.difficultyLevel)} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>{activeDifficulty.difficultyLabel}</Tag>
              {activeDifficulty.assessmentSource === 'AI_ENHANCED' && <Tag color="purple" style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 5px' }}>AI增强</Tag>}
            </div>
            <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={onAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12, height: 20, padding: '0 5px' }}>图像分析</Button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Progress percent={activeDifficulty.difficultyScore * 10} showInfo={false}
              strokeColor={difficultyColor(activeDifficulty.difficultyLevel) === 'green' ? 'var(--color-success)' : difficultyColor(activeDifficulty.difficultyLevel) === 'orange' ? 'var(--color-warning)' : 'var(--color-danger)'}
              style={{ flex: 1, margin: 0 }} />
            <span style={{ fontSize: 12, color: '#595959', whiteSpace: 'nowrap' }}><b>{activeDifficulty.difficultyScore}</b>/10 ×<b style={{ color: 'var(--color-accent-purple)' }}>{activeDifficulty.pricingMultiplier}</b></span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>BOM {activeDifficulty.bomCount}种 · 工序 {activeDifficulty.processCount}道{activeDifficulty.hasSecondaryProcess ? ' · 含二次工艺' : ''}</div>
          {activeDifficulty.imageInsight && (() => {
            const insight = activeDifficulty.imageInsight as string;
            const isError = insight.includes('未开通') || insight.includes('读取失败') || insight.includes('未配置') || insight.includes('未上传');
            return (
              <div style={{ fontSize: 12, color: isError ? '#8c8c8c' : '#595959', marginTop: 3, lineHeight: 1.5, background: isError ? 'rgba(0,0,0,0.02)' : 'rgba(114,46,209,0.03)', borderRadius: 4, padding: '3px 5px' }}>
                {insight}
              </div>
            );
          })()}
          {visualResult && (
            <div style={{ marginTop: 4, padding: '4px 6px', borderRadius: 4, background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: '#00bcd4', fontWeight: 600 }}>视觉AI</span>
                {visualResult.severity && visualResult.severity !== 'NONE' && (
                  <Tag style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }} color={SEVERITY_COLOR[visualResult.severity] ?? 'default'}>{visualResult.severity}</Tag>
                )}
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 'auto' }}>置信度 {Math.round(visualResult.confidence * 100)}%</span>
              </div>
              <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.5 }}>{visualResult.summary}</div>
              {visualResult.defects && visualResult.defects.length > 0 && (
                <div style={{ marginTop: 3 }}>
                  {visualResult.defects.slice(0, 3).map((d, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--color-text-tertiary)', lineHeight: 1.4 }}>• [{d.level}] {d.type} — {d.description}{d.location ? ` @ ${d.location}` : ''}</div>
                  ))}
                </div>
              )}
              {visualResult.styleFeatures && Object.keys(visualResult.styleFeatures).length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                  {Object.entries(visualResult.styleFeatures).slice(0, 4).map(([k, v]) => (
                    <Tag key={k} style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{k}: {v}</Tag>
                  ))}
                </div>
              )}
              {visualResult.suggestion && (
                <div style={{ fontSize: 12, color: 'var(--color-accent-purple)', marginTop: 3 }}>{visualResult.suggestion}</div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Button icon={<ExperimentOutlined />} loading={difficultyLoading} onClick={onAiImageAnalysis} disabled={!styleId} style={{ fontSize: 12 }}>AI 难度分析</Button>
          <div style={{ fontSize: 11, color: 'var(--color-text-quaternary)', marginTop: 4 }}>分析款式图片，评估制作难度与定价倍率</div>
        </div>
      )}
    </div>
  );
};

export default DifficultyPanel;
