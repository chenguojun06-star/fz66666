import React from 'react';
import { Tag, Tooltip } from 'antd';
import { CheckCircleOutlined } from '@ant-design/icons';
import { STAGE_COLORS } from '../SampleProcessList.helpers';
import type { ProcessStageProgress } from '../useSampleProcessProgress';

// 阶段切换 Tab 条（从 SampleProcessList.tsx 拆分而来）

// 行业做法：采购和入库是"数据驱动"（看采购单状态/仓库收货），不是"门禁驱动"（不靠生产扫码卡）
// 与后端 ProductionConstants.NON_GATE_STAGES 对齐
const NON_GATE_STAGE_KEYS = new Set(['procurement', 'warehousing']);

export interface StageTabsProps {
  stages: ProcessStageProgress[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

const StageTabs: React.FC<StageTabsProps> = ({ stages, activeTab, onTabChange }) => {
  // 分组：供应链阶段（采购/入库）+ 生产工序（裁剪/二次工艺/车缝/尾部）
  const supplyChainStages = stages.filter(s => NON_GATE_STAGE_KEYS.has(s.key));
  const productionStages = stages.filter(s => !NON_GATE_STAGE_KEYS.has(s.key));

  const renderStageTab = (stage: ProcessStageProgress) => {
    const isActive = activeTab === stage.key;
    const c = STAGE_COLORS[stage.key] || 'var(--color-text-muted)';
    const isDone = stage.percent >= 100;
    const isNonGate = NON_GATE_STAGE_KEYS.has(stage.key);
    return (
      <Tooltip
        key={stage.key}
        title={isNonGate ? '数据驱动阶段（看采购单状态/仓库收货），不是生产扫码工序' : undefined}
      >
        <div
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
            // 非门禁阶段用虚线下划线，视觉上与生产工序区分
            borderBottomStyle: isNonGate && !isActive ? 'dashed' : 'solid',
            opacity: isNonGate ? 0.85 : 1,
          }}
        >
          {isDone && <CheckCircleOutlined style={{ fontSize: 11 }} />}
          {stage.label}
          {stage.subProcesses.length > 0 && (
            <Tag color={isActive ? 'blue' : 'default'} style={{ marginLeft: 2, fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>
              {stage.subProcesses.length}
            </Tag>
          )}
        </div>
      </Tooltip>
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
      {/* 生产工序组（裁剪/二次工艺/车缝/尾部）— 门禁驱动 */}
      {productionStages.map(renderStageTab)}

      {/* 分隔线 */}
      {supplyChainStages.length > 0 && productionStages.length > 0 && (
        <div style={{
          width: 1,
          height: 20,
          background: 'var(--color-border-light)',
          margin: '0 6px',
          alignSelf: 'center',
        }} />
      )}

      {/* 供应链组（采购/入库）— 数据驱动，不是生产扫码工序 */}
      {supplyChainStages.map(renderStageTab)}
    </div>
  );
};

export default StageTabs;
