import React from 'react';
import DecisionInsightCard from '@/components/common/DecisionInsightCard';

interface OrderLearningRecommendationSummaryProps {
  lines: string[];
}

const OrderLearningRecommendationSummary: React.FC<OrderLearningRecommendationSummaryProps> = ({
  lines,
}) => {
  const effectiveLines = lines.length ? lines : ['当前暂无推荐摘要'];

  return (
    <DecisionInsightCard
      insight={{
        title: '本次智能建议',
        summary: effectiveLines[0],
        evidence: effectiveLines.slice(1),
      }}
    />
  );
};

export default OrderLearningRecommendationSummary;
