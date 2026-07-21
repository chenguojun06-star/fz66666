import React from 'react';
import { Tag } from 'antd';
import type { DifficultyAssessment } from '@/services/intelligence/intelligenceApi';

interface WorkerHintPreviewProps {
  workerHint: Array<{ key: string; label: string; value: string }>;
  activeDifficulty: DifficultyAssessment | null;
}

const WorkerHintPreview: React.FC<WorkerHintPreviewProps> = ({ workerHint, activeDifficulty }) => {
  if (workerHint.length === 0) return null;
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--color-bg-base)AEB', border: '1px solid #F5C451' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#B45309', fontWeight: 700 }}>⚠ 工人提示预览</span>
          <Tag color="gold" style={{ margin: 0, fontSize: 11, lineHeight: '16px', padding: '0 5px' }}>工人扫码时可见</Tag>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
        {workerHint.map((item) => (
          <div key={item.key} style={{ background: 'var(--color-bg-base)7dc', borderRadius: 4, padding: '4px 8px', border: '1px solid #f5e08e' }}>
            <span style={{ color: '#8c6d1f', marginRight: 6 }}>{item.label}：</span>
            <span style={{ color: '#3d2d00', fontWeight: 600 }}>{item.value}</span>
          </div>
        ))}
        {activeDifficulty?.imageInsight && String(activeDifficulty.imageInsight).trim() && !String(activeDifficulty.imageInsight).includes('未开通') && (
          <div style={{ width: '100%', marginTop: 2, padding: '5px 8px', borderRadius: 4, background: 'rgba(180,83,9,0.06)', fontSize: 12, color: '#7c4a05', lineHeight: 1.55 }}>
            <b>AI 视觉分析：</b>{String(activeDifficulty.imageInsight).trim()}
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkerHintPreview;
