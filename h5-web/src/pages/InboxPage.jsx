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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>通知列表</span>
        {unreadCount > 0 && (
          <button className="ghost-button" style={{ fontSize: 12 }} onClick={markAllRead}>
            全部已读 ({unreadCount})
          </button>
        )}
      </div>

      {editForm && (
        <div className="hero-card compact" style={{ border: '1px solid var(--color-primary)' }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>回复催单: {editForm.orderNo}</div>
          <div className="field-block">
            <label>预计出货日期</label>
            <input className="text-input" type="date" value={editForm.expectedShipDate}
              onChange={e => setEditForm({ ...editForm, expectedShipDate: e.target.value })} />
          </div>
          <div className="field-block">
            <label>备注</label>
            <input className="text-input" value={editForm.remarks}
              onChange={e => setEditForm({ ...editForm, remarks: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="primary-button" onClick={submitEditForm} disabled={editForm.submitting}>
              {editForm.submitting ? '提交中...' : '确认回复'}
            </button>
            <button className="ghost-button" onClick={() => setEditForm(null)}>取消</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>加载中...</div>
      ) : notices.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无通知</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notices.map((n, idx) => (
            <div key={n.id || idx} className="hero-card compact"
              style={{ opacity: n.isRead ? 0.7 : 1, cursor: 'pointer' }}
              onClick={() => onTap(n, idx)}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20 }}>{n.typeIcon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: n.isRead ? 400 : 600, fontSize: 13 }}>{n.title || n.content || '-'}</div>
                  {n.content && n.title && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{n.content}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{n.timeAgoText}</div>
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
