import React from 'react';
import { Tag, Tooltip } from 'antd';
import { ExperimentOutlined, RadarChartOutlined } from '@ant-design/icons';
import type { DifficultyAssessment } from '@/services/intelligence/intelligenceApi';
import { difficultyColor } from '../helpers';

interface CardHeaderProps {
  expanded: boolean;
  loading: boolean;
  deliveryMeta: { label: string; color: string; detail: string };
  completionRate: number;
  doneCount: number;
  stageTotal: number;
  orderCount: number;
  activeDifficulty: DifficultyAssessment | null;
  onToggle: () => void;
}

const CardHeader: React.FC<CardHeaderProps> = ({
  expanded,
  loading,
  deliveryMeta,
  completionRate,
  doneCount,
  stageTotal,
  orderCount,
  activeDifficulty,
  onToggle,
}) => {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        cursor: 'pointer',
        userSelect: 'none',
        flexWrap: 'wrap',
      }}
    >
      <RadarChartOutlined style={{ color: 'var(--color-primary)', fontSize: 15 }} />
      <span style={{ fontSize: 14, fontWeight: 700, color: '#1f1f1f' }}>款式智能档案卡</span>
      {/* 关键摘要 */}
      <Tag color={deliveryMeta.color} style={{ margin: 0 }}>{deliveryMeta.label}</Tag>
      <span style={{ fontSize: 14, color: '#595959' }}>完成度 <b style={{ color: 'var(--color-primary)' }}>{completionRate}%</b></span>
      {doneCount < stageTotal ? (
        <span style={{ fontSize: 14, color: '#595959' }}>剩 <b style={{ color: 'var(--color-danger)' }}>{stageTotal - doneCount}</b> 环节未完成</span>
      ) : (
        <span style={{ fontSize: 14, color: 'var(--color-success)' }}>✓ {stageTotal} 环节已全部完成</span>
      )}
      <span style={{ fontSize: 14, color: '#595959' }}>订单 <b style={{ color: 'var(--color-accent-purple)' }}>{orderCount} 单</b></span>
      {/* 难度徽章 */}
      {activeDifficulty && (
        <Tooltip title={`难度分 ${activeDifficulty.difficultyScore}/10，定价倍率 ×${activeDifficulty.pricingMultiplier}`}>
          <Tag
            color={difficultyColor(activeDifficulty.difficultyLevel)}
            icon={<ExperimentOutlined />}
            style={{ margin: 0 }}
          >
            {activeDifficulty.difficultyLabel}
          </Tag>
        </Tooltip>
      )}
      {loading && <span style={{ fontSize: 14, color: 'var(--color-text-tertiary)' }}>分析中…</span>}
      <span style={{ marginLeft: 'auto', fontSize: 14, color: 'var(--color-text-tertiary)' }}>
        {expanded ? '收起 ▲' : '展开详情 ▼'}
      </span>
    </div>
  );
};

export default CardHeader;
