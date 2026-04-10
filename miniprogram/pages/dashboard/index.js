/**
 * 进度看板 — 老板/管理者移动端生产关键指标总览
 * 4 张摘要卡片：样衣开发 · 生产订单 · 今日入库 · 今日出库
 *
 * 数据来源：
 *   dashboard.get()         → overdueOrderCount / todayScanCount / sampleDevelopmentCount
 *   dashboard.getTopStats() → warehousingInbound.day/week · warehousingOutbound.day/week
 *   production.listOrders   → status='production'(生产中) / status='completed'(已完成)
 */
var api = require('../../utils/api');

Page({
  data: {
    loading: true,
    todayStr: '',
    cards: {
      sample:     { developing: 0, completed: 0 },
      production: { total: 0, overdue: 0 },
      inbound:    { today: 0, week: 0 },
      outbound:   { today: 0, week: 0 },
    },
    todayScanCount: 0,
  },

  onLoad: function () {
    this.setData({ todayStr: this._formatToday() });
    this.refreshCards();
  },

  onShow: function () {
    if (this._loaded) this.refreshCards();
    this._loaded = true;
  },

  onPullDownRefresh: function () {
    var that = this;
    this.refreshCards().then(function () {
      wx.stopPullDownRefresh();
    });
  },

  /* ======== 刷新四卡数据（5 个并发请求） ======== */
  refreshCards: function () {
    var that = this;
    that.setData({ loading: true });

    return Promise.all([
      api.dashboard.get().catch(function () { return {}; }),
      api.dashboard.getTopStats().catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'production', page: 1, pageSize: 1 }).catch(function () { return {}; }),
      api.production.listOrders({ deleteFlag: 0, status: 'completed',  page: 1, pageSize: 1 }).catch(function () { return {}; }),
    ]).then(function (res) {
      var dash     = res[0] || {};
      var topStats = res[1] || {};
      var prodRes  = res[2] || {};
      var compRes  = res[3] || {};

      that.setData({
        loading: false,
        todayScanCount: Number(dash.todayScanCount) || 0,
        cards: {
          sample: {
            developing: Number(dash.sampleDevelopmentCount) || 0,
            completed:  compRes.total || 0,
          },
          production: {
            total:   prodRes.total || 0,
            overdue: Number(dash.overdueOrderCount) || 0,
          },
          inbound: {
            today: (topStats.warehousingInbound && topStats.warehousingInbound.day) || 0,
            week:  (topStats.warehousingInbound && topStats.warehousingInbound.week) || 0,
          },
          outbound: {
            today: (topStats.warehousingOutbound && topStats.warehousingOutbound.day) || 0,
            week:  (topStats.warehousingOutbound && topStats.warehousingOutbound.week) || 0,
          },
        },
      });
    }).catch(function (err) {
      console.error('[Dashboard] refreshCards error:', err);
      that.setData({ loading: false });
      wx.showToast({ title: '数据加载失败', icon: 'none' });
    });
  },

  /* ======== 工具方法 ======== */
  _formatToday: function () {
    var d = new Date();
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  },
});
