const api = require('../../../utils/api');

// 通知类型 → 图标映射
function typeIcon(noticeType) {
  const map = {
    stagnant: '⏸',
    deadline: '⏰',
    quality: '🔴',
    worker_alert: '⚠️',
    manual: '📢',
  };
  return map[noticeType] || '🔔';
}

// 简易时间格式化（x分钟前 / x小时前 / x天前）
function timeAgo(createdAt) {
  if (!createdAt) return '';
  const created = new Date(createdAt.replace('T', ' '));
  const now = new Date();
  const diffMs = now - created;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) return diffMin <= 1 ? '刚刚' : `${diffMin}分钟前`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}小时前`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}天前`;
}

Page({
  data: {
    notices: [],
    unreadCount: 0,
    loading: false,
  },

  onShow() {
    this.loadNotices();
  },

  async loadNotices() {
    this.setData({ loading: true });
    try {
      const list = await api.notice.myList();
      const notices = (list || []).map(n => ({
        ...n,
        typeIcon: typeIcon(n.noticeType),
        timeAgo: timeAgo(n.createdAt),
      }));
      const unreadCount = notices.filter(n => n.isRead === 0).length;
      this.setData({ notices, unreadCount });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onTap(e) {
    const { id, index } = e.currentTarget.dataset;
    const notice = this.data.notices[index];
    if (!notice) return;

    // 标记已读（仅未读时）
    if (notice.isRead === 0) {
      try {
        await api.notice.markRead(id);
        const notices = [...this.data.notices];
        notices[index] = { ...notices[index], isRead: 1 };
        const unreadCount = notices.filter(n => n.isRead === 0).length;
        this.setData({ notices, unreadCount });
      } catch (_) { /* 静默忽略 */ }
    }

    // 有订单号则跳转到工作台并高亮订单
    if (notice.orderNo) {
      wx.setStorageSync('pending_order_hint', notice.orderNo);
      wx.navigateBack({ delta: 1 });
    }
  },

  async markAllRead() {
    const unread = this.data.notices.filter(n => n.isRead === 0);
    if (unread.length === 0) return;

    wx.showLoading({ title: '处理中' });
    try {
      await Promise.all(unread.map(n => api.notice.markRead(n.id)));
      const notices = this.data.notices.map(n => ({ ...n, isRead: 1 }));
      this.setData({ notices, unreadCount: 0 });
    } catch (_) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
});
