import React from 'react';
import DecisionInsightCard from '@/components/common/DecisionInsightCard';

interface OrderLearningFactoryScoreBoardProps {
  lines: string[];
}

const OrderLearningFactoryScoreBoard: React.FC<OrderLearningFactoryScoreBoardProps> = ({
  lines,
}) => {
  const effectiveLines = lines.length ? lines : ['当前还没有足够的工厂评分样本'];

  return (
    <DecisionInsightCard
      insight={{
        title: '工厂历史评分',
        summary: effectiveLines[0],
        evidence: effectiveLines.slice(1),
      }}
    />
  );
};

export default OrderLearningFactoryScoreBoard;
