import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { urgeApi } from '../../../../services/production/productionApi';
import type { SysNotice } from '../../../../services/production/productionApi';

// ─── 一键处理按钮 ───────────────────────────────────────────
const OneClickActionInline: React.FC<{
  notice: SysNotice;
  onDone: () => void;
}> = ({ notice, onDone }) => {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const payload = useMemo(() => {
    try {
      return notice.actionPayload ? JSON.parse(notice.actionPayload) : {};
    } catch {
      return {};
    }
  }, [notice.actionPayload]);

  const handleAction = async () => {
    if (loading || done) return;
    setLoading(true);
    setError('');
    try {
      if (notice.actionType === 'urge_order' && payload.orderId) {
        await urgeApi.urge(payload.orderId, 'AI巡检自动催单');
        setDone(true);
        setTimeout(() => onDone(), 800);
      } else if (notice.actionType === 'task_overdue' || notice.actionType === 'task_due_soon') {
        navigate('/intelligence/tasks?tab=my');
      }
    } catch (e: any) {
      setError(e?.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const buttonText = () => {
    if (done) return '✅ 已处理';
    if (notice.actionType === 'urge_order') return '⚡ 一键催单';
    if (notice.actionType === 'task_overdue') return '去处理';
    if (notice.actionType === 'task_due_soon') return '去查看';
    return '处理';
  };

  return (
    <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
      {done ? (
        <div style={{ fontSize: 12, color: '#389e0d' }}>
          ✅ 已催单，工厂已收到通知
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button
            onClick={() => void handleAction()}
            disabled={loading}
            style={{
              fontSize: 12,
              padding: '4px 12px',
              background: 'transparent',
              color: 'var(--color-primary)',
              border: '1px solid var(--color-primary)',
              borderRadius: 6,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
              fontWeight: 500,
            }}
          >
            {loading ? '处理中...' : buttonText()}
          </button>
          {error && (
            <span style={{ fontSize: 11, color: 'var(--color-error)' }}>{error}</span>
          )}
        </div>
      )}
    </div>
  );
};

export default OneClickActionInline;
