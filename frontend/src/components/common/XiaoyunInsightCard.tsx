import React from 'react';
import DecisionInsightCard, { type DecisionInsight } from './DecisionInsightCard';

export interface XiaoyunInsightCardData extends DecisionInsight {
  actionPath?: string;
}

interface XiaoyunInsightCardProps {
  card: XiaoyunInsightCardData;
  compact?: boolean;
  onNavigate?: (path: string) => void;
}

const XiaoyunInsightCard: React.FC<XiaoyunInsightCardProps> = ({
  card,
  compact = false,
  onNavigate,
}) => {
  return (
    <DecisionInsightCard
      compact={compact}
      insight={{
        ...card,
        onAction: card.actionPath && onNavigate ? () => onNavigate(card.actionPath as string) : card.onAction,
      }}
    />
  );
};

export default XiaoyunInsightCard;
