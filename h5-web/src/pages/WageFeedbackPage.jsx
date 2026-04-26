import { useState, useEffect, useCallback } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import EmptyState from '@/components/EmptyState';

const STATUS_MAP = { PENDING: '待处理', RESOLVED: '已解决', REJECTED: '已驳回' };
const STATUS_COLORS = { PENDING: 'var(--color-warning)', RESOLVED: 'var(--color-success)', REJECTED: 'var(--color-danger)' };

export default function WageFeedbackPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settlementId, setSettlementId] = useState('');
  const [feedbackType, setFeedbackType] = useState('CONFIRM');
  const [feedbackContent, setFeedbackContent] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadList = useCallback(async (filter) => {
    setLoading(true);
    try {
      const params = {};
      const f = filter !== undefined ? filter : statusFilter;
      if (f) params.status = f;
      const res = await api.finance.feedbackMyList(params);
      setList(res?.data?.data || res?.data || []);
    } catch { setList([]); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { loadList(); }, [loadList]);

  const handleSubmit = async () => {
    if (!settlementId.trim()) { toast('请输入结算单ID'); return; }
    if (feedbackType === 'OBJECTION' && !feedbackContent.trim()) { toast('提出异议时必须填写反馈内容'); return; }
    setSubmitting(true);
    try {
      await api.finance.feedbackSubmit({
        settlementId, feedbackType, feedbackContent,
      });
      toast('提交成功');
      setShowForm(false);
      setFeedbackContent('');
      setSettlementId('');
      loadList();
    } catch (e) { toast(e?.response?.data?.message || '提交失败'); }
    finally { setSubmitting(false); }
  };

  const fmtTime = (v) => {
    if (!v) return '-';
    const d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d.getTime()) ? '-' : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <div className="page-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>工资结算反馈</h2>
        <button className="primary-button" style={{ fontSize: 'var(--font-size-sm)' }} onClick={() => setShowForm(true)}>提交反馈</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {['', 'PENDING', 'RESOLVED', 'REJECTED'].map(s => (
          <button key={s} className={`ghost-button${statusFilter === s ? ' active' : ''}`}
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }}
            onClick={() => { setStatusFilter(s); loadList(s); }}>
            {s ? STATUS_MAP[s] : '全部'}
          </button>
        ))}
      </div>

      {loading ? <div className="loading-state">加载中...</div> : list.length === 0 ? (
        <EmptyState icon="💬" title="暂无反馈记录" desc="提交反馈后在这里查看" />
      ) : (
        <div className="list-stack">
          {list.map(item => (
            <div key={item.id} className="card-item" style={{ padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 'var(--font-size-xs)',
                  background: item.feedbackType === 'CONFIRM' ? 'rgba(82,196,26,0.1)' : 'rgba(250,173,20,0.1)',
                  color: item.feedbackType === 'CONFIRM' ? 'var(--color-success)' : 'var(--color-warning)',
                }}>{item.feedbackType === 'CONFIRM' ? '确认' : '异议'}</span>
                <span style={{ fontSize: 'var(--font-size-xs)', color: STATUS_COLORS[item.status], fontWeight: 600 }}>
                  {STATUS_MAP[item.status]}
                </span>
              </div>
              <div style={{ marginTop: 8, fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                结算单: {item.settlementId}
              </div>
              {item.feedbackContent && (
                <div style={{ marginTop: 4, fontSize: 'var(--font-size-sm)' }}>{item.feedbackContent}</div>
              )}
              {item.resolveRemark && (
                <div style={{ marginTop: 8, padding: 8, background: 'rgba(82,196,26,0.06)', borderRadius: 6 }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-success)', fontWeight: 600 }}>处理结果</div>
                  <div style={{ fontSize: 'var(--font-size-sm)', marginTop: 2 }}>{item.resolveRemark}</div>
                  {item.resolverName && <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 2 }}>处理人: {item.resolverName}</div>}
                </div>
              )}
              <div style={{ textAlign: 'right', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                {fmtTime(item.createTime)}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowForm(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '85%', maxWidth: 400 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ textAlign: 'center', margin: '0 0 16px' }}>提交工资结算反馈</h3>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--font-size-sm)', display: 'block', marginBottom: 4 }}>结算单ID</label>
              <input style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 'var(--font-size-sm)' }}
                placeholder="请输入结算单ID" value={settlementId} onChange={e => setSettlementId(e.target.value)} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 'var(--font-size-sm)', display: 'block', marginBottom: 4 }}>反馈类型</label>
              <div style={{ display: 'flex', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-sm)' }}>
                  <input type="radio" name="feedbackType" value="CONFIRM" checked={feedbackType === 'CONFIRM'} onChange={() => setFeedbackType('CONFIRM')} />
                  确认无误
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--font-size-sm)' }}>
                  <input type="radio" name="feedbackType" value="OBJECTION" checked={feedbackType === 'OBJECTION'} onChange={() => setFeedbackType('OBJECTION')} />
                  提出异议
                </label>
              </div>
            </div>

            {feedbackType === 'OBJECTION' && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 'var(--font-size-sm)', display: 'block', marginBottom: 4 }}>异议内容</label>
                <textarea style={{ width: '100%', padding: 8, border: '1px solid #ddd', borderRadius: 6, fontSize: 'var(--font-size-sm)', height: 80, resize: 'vertical' }}
                  placeholder="请描述您的问题" value={feedbackContent} onChange={e => setFeedbackContent(e.target.value)} maxLength={500} />
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button className="ghost-button" style={{ flex: 1 }} onClick={() => setShowForm(false)}>取消</button>
              <button className="primary-button" style={{ flex: 1 }} onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
