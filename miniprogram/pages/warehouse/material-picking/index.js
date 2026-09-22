/**
 * 领料出库（独立页 D-514）
 *
 * 列表本体已抽成通用组件 components/material-picking-list
 * —— 同一份列表在物料中心「领料」tab 里内联复用。
 * 本页只负责：
 *   ① 把 URL 的 status 传给组件（待办通知跳过来会带 status=pending）
 *   ② 承接**页面级**生命周期（下拉刷新 / 触底加载）—— 组件内部拿不到这两个
 */
Page({
  data: {
    status: '',
  },

  onLoad(options) {
    wx.setNavigationBarTitle({ title: '领料出库' });
    var st = (options && options.status) || '';
    if (st) this.setData({ status: st });
  },

  /** 页面级下拉刷新 → 转发给组件 */
  onPullDownRefresh() {
    var c = this.selectComponent('#pickingList');
    if (c && typeof c.refresh === 'function') {
      Promise.resolve(c.refresh())
        .then(function () { wx.stopPullDownRefresh(); })
        .catch(function () { wx.stopPullDownRefresh(); });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  /** 页面级触底加载 → 转发给组件 */
  onReachBottom() {
    var c = this.selectComponent('#pickingList');
    if (c && typeof c.loadMore === 'function') c.loadMore();
  },
});
