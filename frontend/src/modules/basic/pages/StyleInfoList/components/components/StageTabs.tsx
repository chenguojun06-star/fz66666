import React from 'react';
import { Tag } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { STAGE_COLORS } from '../SampleProcessList.helpers';
import type { ProcessStageProgress } from '../useSampleProcessProgress';

// 阶段切换 Tab 条（从 SampleProcessList.tsx 拆分而来）
// 行业标准：采购/入库不属于生产工序，已从工序列表中移除
// 生产工序只含4个阶段：裁剪 → 二次工艺 → 车缝 → 尾部

export interface StageTabsProps {
  stages: ProcessStageProgress[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

const StageTabs: React.FC<StageTabsProps> = ({ stages, activeTab, onTabChange }) => {
  const renderStageTab = (stage: ProcessStageProgress) => {
    const isActive = activeTab === stage.key;
    const c = STAGE_COLORS[stage.key] || 'var(--color-text-muted)';
    // D-208：未配置子工序的阶段（如二次工艺）不算完成，不打✓
    const isEmptyStage = stage.totalCount === 0;
    const isDone = !isEmptyStage && stage.percent >= 100;
    return (
      <div
        key={stage.key}
        onClick={() => onTabChange(stage.key)}
        style={{
          padding: '8px 14px',
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: isActive ? 600 : 400,
          color: isActive ? c : isDone ? 'var(--color-success)' : 'var(--color-text-secondary)',
          borderBottom: isActive ? `2px solid ${c}` : '2px solid transparent',
          marginBottom: -2,
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {isDone && <CheckCircleOutlined style={{ fontSize: 11 }} />}
        {stage.label}
        {isEmptyStage && (
          <span style={{ fontSize: 10, color: 'var(--color-text-quaternary)', fontWeight: 400 }}>未配置</span>
        )}
        {stage.subProcesses.length > 0 && (
          <Tag color={isActive ? 'blue' : 'default'} style={{ marginLeft: 2, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
            {stage.subProcesses.length}
          </Tag>
        )}
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex',
      borderBottom: '2px solid var(--color-border-light)',
      marginBottom: 12,
      gap: 4,
      alignItems: 'flex-end',
    }}>
      {stages.map(renderStageTab)}
    </div>
  );
};

export default StageTabs;
