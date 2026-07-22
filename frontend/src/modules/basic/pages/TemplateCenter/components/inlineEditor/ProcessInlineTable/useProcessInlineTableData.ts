import { useMemo } from 'react';
import { STAGE_ORDER } from '@/utils/productionStage';
import type { ProcessStepRow, ProcessTableData } from '../../../utils/templateUtils';
import { normalizeProcessSteps } from '../../../utils/templateUtils';

export interface UseProcessInlineTableDataParams {
  value: ProcessTableData;
  onChange: (next: ProcessTableData) => void;
  templateSizes: string[];
}

export interface UseProcessInlineTableDataResult {
  sortedSteps: Array<ProcessStepRow & { _origIdx: number }>;
  stageSpanMap: Map<number, { rowSpan: number; stage: string; count: number }>;
  updateStep: (sortedIndex: number, updates: Partial<ProcessStepRow>) => void;
  deleteStep: (sortedIndex: number) => void;
  addStepToStage: (stage: string) => void;
}

export const useProcessInlineTableData = ({
  value,
  onChange,
  templateSizes,
}: UseProcessInlineTableDataParams): UseProcessInlineTableDataResult => {
  const sortedSteps = useMemo(() => {
    return value.steps
      .map((step, index) => ({ ...step, _origIdx: index }))
      .sort((left, right) => {
        const leftStageIndex = STAGE_ORDER.indexOf(left.progressStage || '车缝');
        const rightStageIndex = STAGE_ORDER.indexOf(right.progressStage || '车缝');
        return leftStageIndex - rightStageIndex;
      });
  }, [value.steps]);

  const stageSpanMap = useMemo(() => {
    const map = new Map<number, { rowSpan: number; stage: string; count: number }>();
    let index = 0;
    while (index < sortedSteps.length) {
      const stage = sortedSteps[index].progressStage || '车缝';
      let nextIndex = index + 1;
      while (nextIndex < sortedSteps.length && (sortedSteps[nextIndex].progressStage || '车缝') === stage) {
        nextIndex += 1;
      }
      const count = nextIndex - index;
      map.set(index, { rowSpan: count, stage, count });
      for (let current = index + 1; current < nextIndex; current += 1) {
        map.set(current, { rowSpan: 0, stage, count });
      }
      index = nextIndex;
    }
    return map;
  }, [sortedSteps]);

  const updateStep = (sortedIndex: number, updates: Partial<ProcessStepRow>) => {
    const originalIndex = sortedSteps[sortedIndex]?._origIdx ?? sortedIndex;
    const nextSteps = [...value.steps];
    nextSteps[originalIndex] = { ...nextSteps[originalIndex], ...updates };
    onChange({ ...value, steps: nextSteps });
  };

  const deleteStep = (sortedIndex: number) => {
    const originalIndex = sortedSteps[sortedIndex]?._origIdx ?? sortedIndex;
    const nextSteps = value.steps.filter((_, index) => index !== originalIndex);
    onChange({ ...value, steps: normalizeProcessSteps(nextSteps) });
  };

  const addStepToStage = (stage: string) => {
    const maxCode = value.steps.reduce((max, step) => {
      const parsed = Number.parseInt(String(step.processCode ?? '').trim() || '0', 10);
      return Number.isFinite(parsed) && parsed > max ? parsed : max;
    }, 0);
    const nextCode = String(maxCode + 1).padStart(2, '0');
    const nextStep: ProcessStepRow = {
      processCode: nextCode,
      processName: '',
      progressStage: stage,
      machineType: '',
      difficulty: '',
      standardTime: 0,
      unitPrice: 0,
      sizePrices: templateSizes.reduce((acc, size) => ({ ...acc, [size]: 0 }), {} as Record<string, number>),
    };
    onChange({ ...value, steps: [...value.steps, nextStep] });
  };

  return { sortedSteps, stageSpanMap, updateStep, deleteStep, addStepToStage };
};
