import React from 'react';
import DecisionInsightCard from '@/components/common/DecisionInsightCard';

interface OrderLearningHistoryPanelProps {
  lines: string[];
}

const OrderLearningHistoryPanel: React.FC<OrderLearningHistoryPanelProps> = ({
  lines,
}) => {
  const effectiveLines = lines.length ? lines : ['当前还没有可复盘的同款历史'];

  return (
    <DecisionInsightCard
      insight={{
        title: '最近同款复盘',
        summary: effectiveLines[0],
        evidence: effectiveLines.slice(1),
      }}
    />
  );
};

export default OrderLearningHistoryPanel;
