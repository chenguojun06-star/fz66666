import React, { useMemo } from 'react';
import { Tag } from 'antd';
import { ProductionOrder } from '@/types/production';
import { useAiPatrol, RISK_TYPE_LABELS } from './useAiPatrol';

export function usePatrolTitleTags() {
  const { getOrderRisks, getHighestSeverity } = useAiPatrol();

  const patrolTitleTags = useMemo(() => (record: ProductionOrder) => {
    const risks = getOrderRisks(record.orderNo || '');
    const severity = getHighestSeverity(record.orderNo || '');
    if (!severity || risks.length === 0) return null;
    const label = RISK_TYPE_LABELS[risks[0]?.issueType] || 'AI巡检';
    const colorMap: Record<string, string> = { HIGH: 'red', MEDIUM: 'orange', LOW: 'gold' };
    return (
      <Tag color={colorMap[severity] || 'orange'} style={{ margin: 0, fontSize: 12, lineHeight: '18px', padding: '0 4px' }}>
        {label}
      </Tag>
    );
  }, [getOrderRisks, getHighestSeverity]);

  return { patrolTitleTags };
}
