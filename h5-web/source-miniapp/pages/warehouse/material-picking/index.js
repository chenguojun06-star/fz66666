/**
 * 领料出库（独立页 D-514）
 *
 * 列表本体已抽成通用组件 components/material-picking-list
 * —— 同一份列表在物料中心「领料」tab 里内联复用。
 * 本页只负责：
 *   ① 把 URL 的 status 传给组件（待办通知跳过来会带 status=pending）
 *   ② 承接**页面级**生命周期（下拉刷新 / 触底加载）—— 组件内部拿不到这两个
 */
const i18n = require('../../../utils/i18n/index');
Page({
  data: {
    status: '',
    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    var st = (options && options.status) || '';
    if (st) this.setData({ status: st });
  },

  onShow() {
    // 从「我的 → 语言」切回时导航栏标题要跟着变，故每次显示都重刷
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 按当前语言刷新文案。
   *
   * ⚠️ json 里的 navigationBarTitleText 是**静态**的，不会跟着语言变 ——
   *    要让它跟着切，只能在这里调 wx.setNavigationBarTitle。
   *    （本页列表本体在通用组件 material-picking-list 里，组件自己也会刷文案）
   */
  applyLanguage(language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.materialPicking.title', lang) });
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
