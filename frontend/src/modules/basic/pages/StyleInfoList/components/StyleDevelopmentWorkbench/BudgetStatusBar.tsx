import React from 'react';
import { Button } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import type { WorkbenchSection } from '@/types/style';
import {
  formatBudgetHours,
  calculateActualDuration,
  calculateWaitingDuration,
  computeBudgetStatus,
} from '@/utils/workingTimeCalculator';
import type { StageCard } from './types';

interface BudgetStatusBarProps {
  stageCards: StageCard[];
  activeSection: WorkbenchSection;
  onBudgetEdit: (stageKey: string, budgetField: string, currentHours: number | null) => void;
}

const BudgetStatusBar: React.FC<BudgetStatusBarProps> = ({ stageCards, activeSection, onBudgetEdit }) => {
  const activeCard = stageCards.find((s) => s.key === activeSection);
  if (!activeCard || !activeCard.budgetField) return null;

  const budgetStatus =
    activeCard.budgetCustomized && activeCard.budgetHours != null && activeCard.budgetHours > 0
      ? computeBudgetStatus(activeCard.budgetHours, activeCard.availableTime, activeCard.startTime, activeCard.endTime)
      : null;
  const actualDuration =
    activeCard.completed && activeCard.startTime && activeCard.endTime
      ? calculateActualDuration(activeCard.startTime, activeCard.endTime)
      : null;
  const prevCardIndex = stageCards.findIndex((s) => s.key === activeSection);
  const prev = prevCardIndex > 0 ? stageCards[prevCardIndex - 1] : null;
  const waitDuration =
    prev?.endTime && activeCard.startTime
      ? calculateWaitingDuration(prev.endTime, activeCard.startTime)
      : null;
  const canEdit = !activeCard.completed;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        margin: '8px 0',
        background: 'var(--color-bg-subtle, var(--color-bg-container))',
        borderRadius: 6,
        fontSize: 13,
        border: '1px solid var(--color-border-light, var(--color-border-light))',
      }}
    >
      <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{activeCard.title}</span>
      <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
      {activeCard.budgetCustomized ? (
        <span style={{ color: budgetStatus?.color || 'var(--color-text-secondary)' }}>
          预算 {formatBudgetHours(activeCard.budgetHours)}
          {budgetStatus?.text ? ` · ${budgetStatus.text}` : ''}
        </span>
      ) : (
        <span style={{ color: 'var(--color-text-quaternary)' }}>
          预算 {formatBudgetHours(activeCard.budgetHours)}（默认）
        </span>
      )}
      {actualDuration && (
        <>
          <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>实际 {actualDuration}</span>
        </>
      )}
      {waitDuration && (
        <>
          <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
          <span style={{ color: 'var(--color-text-secondary)' }}>等待 {waitDuration}</span>
        </>
      )}
      <div style={{ flex: 1 }} />
      {canEdit && (
        <Button
          size="small"
          type="link"
          icon={<EditOutlined />}
          onClick={() => onBudgetEdit(activeCard.key, activeCard.budgetField!, activeCard.budgetCustomized ? activeCard.budgetHours : null)}
        >
          {activeCard.budgetCustomized ? '调整预算' : '设定预算'}
        </Button>
      )}
    </div>
  );
};

export default BudgetStatusBar;
