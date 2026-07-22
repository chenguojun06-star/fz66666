import React, { useMemo } from 'react';
import { Popover, Tag } from 'antd';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import type { PayableItem } from '@/services/finance/wagePaymentApi';
import { analyzePayable } from './analyzePayable';
import { buildPaymentInsight, riskTagColor, suggestionLabel } from './buildPaymentInsight';

const PaymentAuditPopover: React.FC<{ record: PayableItem; children: React.ReactNode }> = ({ record, children }) => {
  const analysis = useMemo(() => analyzePayable(record), [record]);
  const insight = useMemo(() => buildPaymentInsight(record, analysis), [record, analysis]);

  const content = (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, fontSize: 14, boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}> 付款审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>
      <DecisionInsightCard compact insight={insight} />

      {analysis.breakdown.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 10px', padding: '6px 8px', background: 'var(--color-bg-container)', borderRadius: 6 }}>
          {analysis.breakdown.slice(0, 6).map((b, i) => (
            <span key={i} style={{ whiteSpace: 'nowrap', color: '#595959', fontSize: 14 }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{b.label}：</span>
              <span style={{ fontWeight: 500 }}>{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Popover content={content} trigger="hover" placement="right" mouseEnterDelay={0.3} overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}>
      {children}
    </Popover>
  );
};

export default PaymentAuditPopover;
