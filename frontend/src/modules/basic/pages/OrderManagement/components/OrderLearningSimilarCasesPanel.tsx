import React from 'react';
import DecisionInsightCard from '@/components/common/DecisionInsightCard';

interface OrderLearningSimilarCasesPanelProps {
  lines: string[];
}

const OrderLearningSimilarCasesPanel: React.FC<OrderLearningSimilarCasesPanelProps> = ({
  lines,
}) => {
  const effectiveLines = lines.length ? lines : ['当前还没有可参考的相似款样本'];

  return (
    <DecisionInsightCard
      insight={{
        title: '相似款经验',
        summary: effectiveLines[0],
        evidence: effectiveLines.slice(1),
      }}
    />
  );
};

export default OrderLearningSimilarCasesPanel;
