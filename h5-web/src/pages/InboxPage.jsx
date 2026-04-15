import { useState, useEffect } from 'react';
import api from '@/api';
import { toast, timeAgo } from '@/utils/uiHelper';

function typeIcon(noticeType) {
  const map = { stagnant: '⏸', deadline: '⏰', quality: '🔍', worker_alert: '⚠️', manual: '📢', urge_order: '📦' };
  return map[noticeType] || '🔔';
}

export default function InboxPage() {
  const [notices, setNotices] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [editForm, setEditForm] = useState(null);

  useEffect(() => { loadNotices(); }, []);

  const loadNotices = async () => {
    setLoading(true);
    try {
      const res = await api.notice.list({ page: 1, pageSize: 50 });
      const list = (res?.records || res || []).map(n => ({
        ...n, typeIcon: typeIcon(n.noticeType), timeAgoText: timeAgo(n.createdAt),
      }));
      setNotices(list);
      setUnreadCount(list.filter(n => n.isRead === 0).length);
    } catch (e) {
      toast.error('加载失败');
    } finally {
      setLoading(false);
    }
  };

  const onTap = async (notice, idx) => {
    if (notice.isRead === 0) {
      try {
        await api.notice.markRead(notice.id);
        const updated = notices.map((n, i) => i === idx ? { ...n, isRead: 1 } : n);
        setNotices(updated);
        setUnreadCount(updated.filter(n => n.isRead === 0).length);
      } catch (e) { /* ignore */ }
    }
    if (notice.noticeType === 'urge_order' && notice.orderNo) {
      setEditForm({ noticeIndex: idx, orderNo: notice.orderNo, expectedShipDate: '', remarks: '', submitting: false });
    }
  };

  const markAllRead = async () => {
    const unread = notices.filter(n => n.isRead === 0);
    if (!unread.length) return;
    try {
      await Promise.all(unread.map(n => api.notice.markRead(n.id)));
      setNotices(notices.map(n => ({ ...n, isRead: 1 })));
      setUnreadCount(0);
    } catch (e) {
      toast.error('操作失败');
    }
  };

  const submitEditForm = async () => {
    if (!editForm.expectedShipDate && !editForm.remarks) {
      toast.error('请填写出货日期或备注');
      return;
    }
    setEditForm({ ...editForm, submitting: true });
    try {
      const payload = { orderNo: editForm.orderNo };
      if (editForm.expectedShipDate) payload.expectedShipDate = editForm.expectedShipDate;
      if (editForm.remarks) payload.remarks = editForm.remarks;
      await api.production.quickEditOrder(payload);
      toast.success('已确认回复');
      setEditForm(null);
    } catch (e) {
      toast.error('提交失败');
      setEditForm({ ...editForm, submitting: false });
    }
  };

  return (
    <div className="inbox-stack">
      <div className="sub-page-header">
        <span className="sub-page-title">智能提醒</span>
        {unreadCount > 0 && (
          <button className="ghost-button" onClick={markAllRead} style={{ fontSize: 'var(--font-size-xs)', padding: '4px 10px' }}>
            全部标为已读 ({unreadCount})
          </button>
        )}
      </div>

      {editForm && (
        <div className="card-item" style={{ border: '1px solid var(--color-primary)' }}>
          <div className="card-item-title" style={{ marginBottom: 8 }}>催单回复: {editForm.orderNo}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginBottom: 8 }}>请确认排期并回复跟单员</div>
          <div className="field-block">
            <label>预计出货日期</label>
            <input className="text-input" type="date" value={editForm.expectedShipDate}
              onChange={e => setEditForm({ ...editForm, expectedShipDate: e.target.value })} />
          </div>
          <div className="field-block">
            <label>工厂备注</label>
            <input className="text-input" value={editForm.remarks}
              onChange={e => setEditForm({ ...editForm, remarks: e.target.value })} />
          </div>
          <div className="sub-page-row-stretch">
            <button className="primary-button" onClick={submitEditForm} disabled={editForm.submitting}>
              {editForm.submitting ? '提交中...' : '确认回复'}
            </button>
            <button className="ghost-button" onClick={() => setEditForm(null)}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : notices.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-title">暂无通知</div>
          <div className="empty-state-desc">有新消息时会在这里提醒您</div>
        </div>
      ) : (
        <div className="list-stack">
          {notices.map((n, idx) => (
            <div key={n.id || idx} className="card-item"
              style={{ opacity: n.isRead ? 0.7 : 1, cursor: 'pointer' }}
              onClick={() => onTap(n, idx)}>
              <div className="sub-page-row" style={{ alignItems: 'flex-start', gap: 10 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{n.typeIcon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 'var(--font-size-sm)' }}>{n.title || n.content || '-'}</div>
                  {n.content && n.title && <div className="card-item-meta" style={{ marginTop: 2 }}>{n.content}</div>}
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>{n.timeAgoText}</div>
                </div>
                {!n.isRead && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', flexShrink: 0, marginTop: 6 }}></span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
