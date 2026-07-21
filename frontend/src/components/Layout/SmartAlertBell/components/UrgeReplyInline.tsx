import React from 'react';
import { urgeApi } from '../../../../services/production/productionApi';

// ─── 催单回复内联组件 ───────────────────────────────────────
const UrgeReplyInline: React.FC<{
  urgeRecordId: string;
  orderNo: string;
  onReplied: () => void;
}> = ({ urgeRecordId, orderNo: _orderNo, onReplied }) => {
  const [replyContent, setReplyContent] = React.useState('');
  const [expectedShipDate, setExpectedShipDate] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async () => {
    if (!replyContent.trim() && !expectedShipDate) return;
    setSubmitting(true);
    try {
      await urgeApi.reply(urgeRecordId, replyContent, expectedShipDate || undefined);
      setSubmitted(true);
      onReplied();
    } catch {
      // silent
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ fontSize: 12, color: '#389e0d', marginTop: 4 }}>
        ✅ 已回复
      </div>
    );
  }

  return (
    <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
        <input
          type="date"
          value={expectedShipDate}
          onChange={(e) => setExpectedShipDate(e.target.value)}
          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--color-border-antd)', borderRadius: 4, width: 130 }}
          placeholder="预计出货日"
        />
        <input
          type="text"
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="回复备注..."
          style={{ fontSize: 12, padding: '2px 4px', border: '1px solid var(--color-border-antd)', borderRadius: 4, flex: 1, minWidth: 80 }}
        />
      </div>
      <button
        onClick={() => void handleSubmit()}
        disabled={submitting || (!replyContent.trim() && !expectedShipDate)}
        style={{
          fontSize: 11,
          padding: '2px 8px',
          background: 'var(--color-error)',
          color: 'var(--color-bg-base)',
          border: 'none',
          borderRadius: 4,
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.6 : 1,
        }}
      >
        {submitting ? '提交中...' : '回复催单'}
      </button>
    </div>
  );
};

export default UrgeReplyInline;
