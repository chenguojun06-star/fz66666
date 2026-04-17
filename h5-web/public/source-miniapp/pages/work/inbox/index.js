const api = require('../../../utils/api');
const { eventBus, Events } = require('../../../utils/eventBus');

// 通知类型 → 图标映射
function typeIcon(noticeType) {
  const map = {
    stagnant: 'icon-pause',
    deadline: 'icon-deadline',
    quality: 'icon-quality',
    worker_alert: 'icon-alert',
    manual: 'icon-manual',
    urge_order: 'icon-package',
  };
  return map[noticeType] || 'icon-notice';
}

// 简易时间格式化（x分钟前 / x小时前 / x天前）
function timeAgo(createdAt) {
  if (!createdAt) return '';
  const created = new Date(String(createdAt).replace(' ', 'T'));
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
    editForm: null,          // { noticeIndex, orderNo, expectedShipDate, remarks, submitting }
    editFormVisible: false,
  },

  onShow() {
    var app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    this.loadNotices();
    this._bindWsEvents();
  },

  async loadNotices() {
    this.setData({ loading: true });
    try {
      const list = await api.notice.myList();
      const notices = (list || []).map(n => ({
        ...n,
        typeIconClass: typeIcon(n.noticeType),
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

    // 催单类型：弹出内联编辑表单
    if (notice.noticeType === 'urge_order' && notice.orderNo) {
      this.setData({
        editFormVisible: true,
        editForm: {
          noticeIndex: index,
          orderNo: notice.orderNo,
          expectedShipDate: '',
          remarks: '',
          submitting: false,
        },
      });
      return;
    }

    // 有订单号则切换到工作台 Tab 并滚动高亮该订单
    if (notice.orderNo) {
      wx.setStorageSync('scroll_to_order_no', notice.orderNo);
      wx.setStorageSync('highlight_order_no', notice.orderNo);
      wx.switchTab({ url: '/pages/work/index' });
    }
  },

  onEditFormInput(e) {
    const { field } = e.currentTarget.dataset;
    const { editForm } = this.data;
    this.setData({ editForm: { ...editForm, [field]: e.detail.value } });
  },

  onEditFormCancel() {
    this.setData({ editFormVisible: false, editForm: null });
  },

  _noop() {},

  async onEditFormSubmit() {
    const { editForm } = this.data;
    if (!editForm || editForm.submitting) return;
    if (!editForm.expectedShipDate && !editForm.remarks) {
      wx.showToast({ title: '请填写出货日期或备注', icon: 'none' });
      return;
    }
    this.setData({ editForm: { ...editForm, submitting: true } });
    try {
      const payload = { orderNo: editForm.orderNo };
      if (editForm.expectedShipDate) payload.expectedShipDate = editForm.expectedShipDate;
      if (editForm.remarks) payload.remarks = editForm.remarks;
      await api.production.quickEditOrder(payload);
      wx.showToast({ title: '已确认回复', icon: 'success' });
      this.setData({ editFormVisible: false, editForm: null });
    } catch (_) {
      wx.showToast({ title: '提交失败，请重试', icon: 'none' });
      this.setData({ editForm: { ...editForm, submitting: false } });
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

  _bindWsEvents() {
    if (this._wsBound) return;
    this._wsBound = true;
    this._onDataChanged = () => { this.loadNotices(); };
    this._onRefreshAll = () => { this.loadNotices(); };
    this._onOrderProgress = () => { this.loadNotices(); };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
  },

  _unbindWsEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
    if (this._onOrderProgress) eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._onOrderProgress);
  },

  onHide() {
    this._unbindWsEvents();
  },

  onUnload() {
    this._unbindWsEvents();
  },
});
