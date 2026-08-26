const production = require('../../../utils/api-modules/production');
const { getUserInfo } = require('../../../utils/storage');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

const STATUS_MAP = {
  pending: { label: '待领取', type: 'pending' },
  received: { label: '已领取', type: 'received' },
  bundled: { label: '已编菲', type: 'received' },
};

function normalizeStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s === 'pending' || s === '') return 'pending';
  return 'received'; // received / bundled 都算已领取
}

Page({
  data: {
    loading: false,
    tasks: [],
    filtered: [],
    activeTab: 'all', // all | pending | received
  },

  onLoad() {
    this.loadTasks();
  },

  onPullDownRefresh() {
    this.loadTasks(() => wx.stopPullDownRefresh());
  },

  loadTasks(done) {
    this.setData({ loading: true });
    production.myCuttingTasks().then((res) => {
      const list = Array.isArray(res) ? res : res?.records || [];
      const tasks = list.map((item) => {
        const status = normalizeStatus(item.status);
        return {
          id: String(item.id || item.taskId || ''),
          orderId: String(item.productionOrderId || item.orderId || item.productionOrderNo || item.orderNo || ''),
          orderNo: item.productionOrderNo || item.orderNo || '',
          styleNo: item.styleNo || '',
          styleName: item.styleName || '',
          cover: getAuthedImageUrl(item.styleCover || item.coverImage || ''),
          status,
          statusLabel: (STATUS_MAP[status] || {}).label || item.status || '',
          receiverName: item.receiverName || '',
          rawStatus: String(item.status || ''),
        };
      });
      this.setData({ tasks, loading: false });
      this.applyFilter();
      if (done) done();
    }).catch(() => {
      this.setData({ loading: false, tasks: [], filtered: [] });
      wx.showToast({ title: '加载失败', icon: 'none' });
      if (done) done();
    });
  },

  applyFilter() {
    const { tasks, activeTab } = this.data;
    const filtered = activeTab === 'all' ? tasks : tasks.filter(t => t.status === activeTab);
    this.setData({ filtered });
  },

  onTabTap(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
    this.applyFilter();
  },

  /** 领取裁剪任务 */
  onReceiveTap(e) {
    const task = this.data.filtered.find(t => t.id === e.currentTarget.dataset.id);
    if (!task) return;
    const userInfo = getUserInfo() || {};
    wx.showModal({
      title: '领取裁剪任务',
      content: `确认领取「${task.styleNo || task.orderNo}」的裁剪任务？`,
      confirmText: '领取',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '领取中...' });
        try {
          await production.cuttingTaskReceive({
            taskId: task.id,
            receiverId: String(userInfo.id || userInfo.userId || ''),
            receiverName: String(userInfo.name || userInfo.username || ''),
          });
          wx.hideLoading();
          wx.showToast({ title: '领取成功', icon: 'success' });
          this.loadTasks();
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: (err && (err.message || err.errMsg)) || '领取失败', icon: 'none' });
        }
      },
    });
  },

  /** 去编菲：跳转裁剪管理页（该页已有按扎自动分扎生成菲号的完整功能，D-160 不重复实现） */
  onGoGenerate(e) {
    const task = this.data.filtered.find(t => t.id === e.currentTarget.dataset.id);
    if (!task) return;
    const orderNo = encodeURIComponent(task.orderNo || '');
    const orderId = encodeURIComponent(task.orderId || '');
    wx.navigateTo({ url: `/pages/cutting/bundle-detail/index?orderNo=${orderNo}&orderId=${orderId}` });
  },

  onGoBundles() {
    wx.navigateTo({ url: '/pages/cutting/bundle-detail/index' });
  },
});
