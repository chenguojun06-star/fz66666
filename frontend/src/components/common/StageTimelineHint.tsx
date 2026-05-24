import React, { useMemo } from 'react';
import { Tooltip } from 'antd';
import dayjs from 'dayjs';
import { computeStageBudgetHint } from '@/utils/progressTimeBudget';

export interface StageTimelineItem {
  name: string;
  startTime: string | null | undefined;
  endTime: string | null | undefined;
  isCompleted?: boolean;
  isProcureNode?: boolean;
}

export interface ComputedStage {
  name: string;
  budgetText: string | null;
  budgetColor: string;
  gapText: string | null;
  gapColor: string;
  gapFrom: string;
}

interface StageTimelineHintProps {
  stages: StageTimelineItem[];
  orderCreateTime: string | null | undefined;
  expectedShipDate: string | null | undefined;
  stageIndex?: number;
  currentStageIndex?: number;
}

function formatGapDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}天${hours}时`;
  if (hours > 0) return `${hours}时${mins}分`;
  if (mins > 0) return `${mins}分`;
  return '<1分';
}

function computeGapMs(prevEnd: string | null | undefined, currStart: string | null | undefined): number | null {
  if (!prevEnd || !currStart) return null;
  const ms = dayjs(currStart).diff(dayjs(prevEnd));
  return ms >= 0 ? ms : null;
}

function gapColorForDays(days: number): string {
  if (days >= 3) return '#ff7875';
  if (days >= 1) return '#faad14';
  return 'var(--color-text-quaternary, #bfbfbf)';
}

export function computeStageTimeline(
  stages: StageTimelineItem[],
  orderCreateTime: string | null | undefined,
  expectedShipDate: string | null | undefined,
): ComputedStage[] {
  return stages.map((stage, i) => {
    const budget = computeStageBudgetHint({
      nodeName: stage.name,
      orderCreateTime,
      expectedShipDate,
      stageStartTime: stage.startTime || undefined,
      stageEndTime: stage.endTime || undefined,
      isCompletedOrClosed: stage.isCompleted ?? false,
      isProcureNode: stage.isProcureNode ?? false,
    });

    let gapText: string | null = null;
    let gapColor = 'var(--color-text-quaternary, #bfbfbf)';
    let gapFrom = '';

    if (i > 0) {
      const prev = stages[i - 1];
      const gapMs = computeGapMs(prev.endTime, stage.startTime);
      if (gapMs !== null && gapMs > 0) {
        gapText = `⏱ 停留 ${formatGapDuration(gapMs)}`;
        gapColor = gapColorForDays(gapMs / 86400000);
        gapFrom = prev.name;
      }
    }

    if (!gapText && i > 0) {
      const prev = stages[i - 1];
      if (prev.endTime && !stage.startTime) {
        const gapMs = dayjs().diff(dayjs(prev.endTime));
        if (gapMs > 0) {
          gapText = `⏱ 等待 ${formatGapDuration(gapMs)}`;
          gapColor = gapColorForDays(gapMs / 86400000);
          gapFrom = prev.name;
        }
      }
    }

    return {
      name: stage.name,
      budgetText: budget?.text ?? null,
      budgetColor: budget?.color ?? 'var(--color-text-quaternary, #bfbfbf)',
      gapText,
      gapColor,
      gapFrom,
    };
  });
}

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1.2,
  textAlign: 'center',
  whiteSpace: 'nowrap',
};

const StageTimelineHint: React.FC<StageTimelineHintProps> = ({
  stages,
  orderCreateTime,
  expectedShipDate,
  stageIndex,
}) => {
  const computed = useMemo<ComputedStage[]>(
    () => computeStageTimeline(stages, orderCreateTime, expectedShipDate),
    [stages, orderCreateTime, expectedShipDate],
  );

  if (!computed.length) return null;

  if (stageIndex !== undefined) {
    const s = computed[stageIndex];
    if (!s) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {s.gapText && (
          <Tooltip title={`${s.gapFrom} → ${s.name} ${s.gapText}`}>
            <div style={{ ...hintStyle, color: s.gapColor }}>{s.gapText}</div>
          </Tooltip>
        )}
        {s.budgetText && (
          <Tooltip title={s.budgetText}>
            <div style={{ ...hintStyle, color: s.budgetColor }}>{s.budgetText}</div>
          </Tooltip>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {computed.map((s, i) => (
        <React.Fragment key={i}>
          {s.gapText && (
            <Tooltip title={`${s.gapFrom} → ${s.name} ${s.gapText}`}>
              <div style={{ ...hintStyle, color: s.gapColor }}>{s.gapText}</div>
            </Tooltip>
          )}
          {s.budgetText && (
            <Tooltip title={s.budgetText}>
              <div style={{ ...hintStyle, color: s.budgetColor }}>{s.budgetText}</div>
            </Tooltip>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default StageTimelineHint;
