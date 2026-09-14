import React from 'react';
import { Tag } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { DifficultyAssessment } from '@/services/intelligence/intelligenceApi';

interface WorkerHintPreviewProps {
  workerHint: Array<{ key: string; label: string; value: string }>;
  activeDifficulty: DifficultyAssessment | null;
}

const WorkerHintPreview: React.FC<WorkerHintPreviewProps> = ({ workerHint, activeDifficulty: _activeDifficulty }) => {
  if (workerHint.length === 0) return null;
  return (
    <div className="u-mt-10 u-br-8" style={{ padding: '10px 12px', background: 'var(--color-bg-base)AEB', border: '1px solid var(--color-amber-400)' }}>
      <div className="u-d-flex u-ai-center u-jc-between u-mb-6">
        <div className="u-d-flex u-ai-center u-gap-6">
          <span className="u-fs-12 u-fw-700 u-d-inline-flex u-ai-center u-gap-4" style={{ color: 'var(--color-amber-700)' }}><WarningOutlined /> 工人提示预览</span>
          <Tag color="gold" className="u-m-0 u-fs-11 u-lh-16px" style={{ padding: '0 5px' }}>工人扫码时可见</Tag>
        </div>
      </div>
      <div className="u-d-flex u-fwrap-wrap u-gap-8 u-fs-12">
        {workerHint.map((item) => (
          <div key={item.key} className="u-br-4" style={{ background: 'var(--color-bg-base)7dc', padding: '4px 8px', border: '1px solid var(--color-amber-200)' }}>
            <span className="u-mr-6" style={{ color: 'var(--color-amber-700)' }}>{item.label}：</span>
            <span className="u-fw-600" style={{ color: 'var(--color-amber-900)' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkerHintPreview;
