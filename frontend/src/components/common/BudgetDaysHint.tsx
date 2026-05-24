import React from 'react';
import { Tooltip } from 'antd';
import { computeStageBudgetHint } from '@/utils/progressTimeBudget';

interface BudgetDaysHintProps {
  nodeName: string;
  orderCreateTime: string | null | undefined;
  expectedShipDate: string | null | undefined;
  stageStartTime?: string | null;
  stageEndTime?: string | null;
  isCompleted?: boolean;
  isProcureNode?: boolean;
}

const BudgetDaysHint: React.FC<BudgetDaysHintProps> = ({
  nodeName,
  orderCreateTime,
  expectedShipDate,
  stageStartTime,
  stageEndTime,
  isCompleted = false,
  isProcureNode = false,
}) => {
  const hint = computeStageBudgetHint({
    nodeName,
    orderCreateTime,
    expectedShipDate,
    stageStartTime: stageStartTime || undefined,
    stageEndTime: stageEndTime || undefined,
    isCompletedOrClosed: isCompleted,
    isProcureNode,
  });

  if (!hint) return null;

  return (
    <Tooltip title={hint.text}>
      <div
        style={{
          fontSize: 10,
          color: hint.color,
          fontWeight: 400,
          lineHeight: 1.2,
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        {hint.text}
      </div>
    </Tooltip>
  );
};

export default BudgetDaysHint;
