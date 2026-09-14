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
      <div className="u-d-flex u-jc-between u-ai-center u-mb-8">
        <span className="u-fw-600 u-fs-14"> 付款审核</span>
        <Tag color={riskTagColor[analysis.risk]}>{suggestionLabel[analysis.suggestion]}</Tag>
      </div>
      <DecisionInsightCard compact insight={insight} />

      {analysis.breakdown.length > 0 && (
        <div className="u-mt-8 u-d-flex u-fwrap-wrap u-br-6" style={{ gap: '4px 10px', padding: '6px 8px', background: 'var(--color-bg-container)' }}>
          {analysis.breakdown.slice(0, 6).map((b, i) => (
            <span key={i} className="u-ws-nowrap u-fs-14" style={{ color: 'var(--color-gray-700)' }}>
              <span style={{ color: 'var(--color-text-tertiary)' }}>{b.label}：</span>
              <span className="u-fw-500">{b.value}</span>
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
