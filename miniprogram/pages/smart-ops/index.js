var api = require('../../utils/api');
var { isTenantOwner, isSuperAdmin } = require('../../utils/storage');

var REFRESH_INTERVAL = 30;

var MENU_TITLES = {
  inProduction: '生产中订单', todayOrders: '今日下单', todayInbound: '今日入库',
  todayOutbound: '今日出库', delayedOrders: '延期订单', riskOrders: '风险订单',
};

function fmtDate(d) { return d ? String(d).slice(5, 10) : '--'; }

function calcProgress(o) {
  var w = Number(o.warehousingCompletionRate) || 0;
  var t = Math.max(Number(o.tailProcessRate) || 0, Number(o.qualityCompletionRate) || 0);
  var sew = Math.max(Number(o.carSewingCompletionRate) || 0, Number(o.sewingCompletionRate) || 0);
  var c = Number(o.cuttingCompletionRate) || 0;
  var p = Math.max(Number(o.procurementCompletionRate) || 0, Number(o.materialArrivalRate) || 0);
  var s = Math.max(Number(o.secondaryProcessRate) || 0, Number(o.secondaryProcessCompletionRate) || 0);
  var hasSec = !!(o.hasSecondaryProcess);
  var rates = hasSec ? [p, c, s, sew, t, w] : [p, c, sew, t, w];
  var sum = 0; for (var i = 0; i < rates.length; i++) sum += rates[i];
  return Math.round(sum / rates.length);
}

function toOrderRow(o) {
  return {
    orderNo: o.orderNo || '', styleNo: o.styleNo || '', factoryName: o.factoryName || '',
    orderQuantity: Number(o.orderQuantity) || 0, plannedEndDate: fmtDate(o.plannedEndDate),
    progress: calcProgress(o), status: o.status || '',
  };
}

function isDelayed(o) {
  var end = o.plannedEndDate || o.expectedShipDate;
  if (!end) return false;
  return new Date(end) < new Date() && String(o.status || '').toUpperCase() !== 'COMPLETED';
}

function isRisk(o) {
  var s = String(o.status || '').toUpperCase();
  return s === 'DELAYED' || s === 'RISK' || (o.riskLevel && Number(o.riskLevel) >= 3);
}

Page({
  data: {
    currentTime: '', totalWarn: 0,
    menuData: { inProduction: 0, todayOrders: 0, todayInbound: 0, todayOutbound: 0, delayedOrders: 0, riskOrders: 0 },
    activeMenu: '', activeMenuTitle: '', activeOrders: [],
    factoryList: [], rankingList: [],
    chatMessages: [], chatInput: '', chatSending: false, chatStreamingText: '', chatTool: '', conversationId: '',
    lastRefreshTime: '', loading: false,
    _allOrders: [],
  },

  _timer: null, _countdown: REFRESH_INTERVAL, _streamTask: null,

  onLoad: function () {
    if (!isTenantOwner() && !isSuperAdmin()) {
      wx.showModal({ title: '权限不足', content: '智能运营驾驶舱仅限租户主账号使用', showCancel: false, complete: function () { wx.navigateBack(); } });
      return;
    }
    this.setData({ conversationId: 'smart_ops_' + Date.now(), chatMessages: [{ id: 'welcome', role: 'ai', text: '你好！我是小云，可以帮你分析数据、查询订单、发现风险。直接问我吧。' }] });
    this._refreshAll();
    this._startTimer();
  },

  onShow: function () { this._updateTime(); },
  onPullDownRefresh: function () { this._refreshAll(); wx.stopPullDownRefresh(); },
  onUnload: function () { if (this._timer) clearInterval(this._timer); this._abortStream(); },

  onMenuTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.activeMenu === key) { this.setData({ activeMenu: '', activeOrders: [] }); return; }
    var orders = this.data._allOrders || [];
    var filtered = [];
    if (key === 'inProduction') filtered = orders.filter(function(o) { var s = String(o.status || '').toUpperCase(); return s !== 'COMPLETED' && s !== 'CLOSED' && s !== 'CANCELLED' && s !== 'SCRAPPED'; });
    else if (key === 'todayOrders') filtered = orders.filter(function(o) { return o._isTodayOrder; });
    else if (key === 'todayInbound') filtered = orders.filter(function(o) { return o._isTodayInbound; });
    else if (key === 'todayOutbound') filtered = orders.filter(function(o) { return o._isTodayOutbound; });
    else if (key === 'delayedOrders') filtered = orders.filter(isDelayed);
    else if (key === 'riskOrders') filtered = orders.filter(isRisk);
    this.setData({ activeMenu: key, activeMenuTitle: MENU_TITLES[key] || key, activeOrders: filtered.map(toOrderRow) });
  },

  closeMenu: function () { this.setData({ activeMenu: '', activeOrders: [] }); },

  onChatInput: function (e) { this.setData({ chatInput: e.detail.value }); },

  onChatSend: function () {
    var text = String(this.data.chatInput || '').trim();
    if (!text || this.data.chatSending) return;
    this.setData({ chatInput: '' });
    this._sendChat(text);
  },

  _sendChat: function (text) {
    var msgs = this.data.chatMessages.concat([{ id: Date.now() + '_u', role: 'user', text: text }]);
    var loadingId = Date.now() + '_a';
    msgs.push({ id: loadingId, role: 'ai', text: '', loading: true });
    if (msgs.length > 20) msgs = msgs.slice(msgs.length - 20);
    this.setData({ chatMessages: msgs, chatSending: true, chatStreamingText: '', chatTool: '' });

    var self = this;
    var accumulated = '';
    var streamStarted = false;

    try {
      var task = api.intelligence.aiAdvisorChatStream(
        { question: text, pageContext: 'smart_ops_tenant', conversationId: this.data.conversationId },
        function (evt) {
          streamStarted = true;
          if (evt.type === 'thinking') self.setData({ chatTool: '小云正在整理思路…' });
          else if (evt.type === 'tool_call') self.setData({ chatTool: '正在处理：' + (evt.data.tool || '').replace(/^tool_/, '').replace(/_/g, '') + '…' });
          else if (evt.type === 'tool_result') self.setData({ chatTool: '' });
          else if (evt.type === 'answer') { accumulated += String(evt.data.content || ''); self.setData({ chatStreamingText: accumulated, chatTool: '' }); }
        },
        function () {
          self._streamTask = null;
          var reply = accumulated || '抱歉，暂时无法回答。';
          self._updateChatMsg(loadingId, reply);
          self.setData({ chatSending: false, chatStreamingText: '', chatTool: '' });
        },
        function (err) {
          self._streamTask = null;
          if (streamStarted && accumulated) { self._updateChatMsg(loadingId, accumulated); self.setData({ chatSending: false, chatStreamingText: '', chatTool: '' }); return; }
          api.intelligence.aiAdvisorChat({ question: text, conversationId: self.data.conversationId, context: 'smart_ops_tenant' }).then(function (res) {
            var r = (res && (res.reply || res.content || res.message || res.answer)) || '（无回应）';
            self._updateChatMsg(loadingId, r);
          }).catch(function () { self._updateChatMsg(loadingId, '服务暂时无法响应，请稍后再试。'); }).finally(function () {
            self.setData({ chatSending: false, chatStreamingText: '', chatTool: '' });
          });
        }
      );
      this._streamTask = task;
    } catch (err) {
      this._updateChatMsg(loadingId, '发送失败，请重试。');
      this.setData({ chatSending: false, chatStreamingText: '', chatTool: '' });
    }
  },

  _updateChatMsg: function (id, text) {
    var cleaned = String(text || '').replace(/【CHART】[\s\S]*?【\/CHART】/g, '').replace(/【ACTIONS】[\s\S]*?【\/ACTIONS】/g, '').replace(/【TEAM_STATUS】[\s\S]*?【\/TEAM_STATUS】/g, '').replace(/【BUNDLE_SPLIT】[\s\S]*?【\/BUNDLE_SPLIT】/g, '').replace(/【STEP_WIZARD】[\s\S]*?【\/STEP_WIZARD】/g, '').replace(/【INSIGHT_CARDS】[\s\S]*?【\/INSIGHT_CARDS】/g, '').replace(/```ACTIONS_JSON\s*\n[\s\S]*?\n```/g, '').trim();
    this.setData({ chatMessages: this.data.chatMessages.map(function (m) { if (m.id !== id) return m; return Object.assign({}, m, { text: cleaned, loading: false }); }) });
  },

  _abortStream: function () { if (this._streamTask) { try { this._streamTask.abort(); } catch (e) {} this._streamTask = null; } },

  _startTimer: function () {
    var self = this;
    this._timer = setInterval(function () {
      self._updateTime();
      self._countdown--;
      if (self._countdown <= 0) { self._refreshAll(); self._countdown = REFRESH_INTERVAL; }
    }, 1000);
  },

  _updateTime: function () {
    var d = new Date();
    this.setData({ currentTime: ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) });
  },

  _refreshAll: function () {
    var self = this;
    self.setData({ loading: true, lastRefreshTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });

    Promise.allSettled([
      api.production.listOrders({ page: 1, pageSize: 500 }),
      api.production.orderStats({}),
      api.dashboard.getTopStats({}),
      api.intelligence.getLivePulse(),
      api.intelligence.getFactoryLeaderboard(),
    ]).then(function (results) {
      var ordersData = self._unwrap(results[0]);
      var statsData = self._unwrap(results[1]);
      var topStats = self._unwrap(results[2]);
      var pulse = self._unwrap(results[3]);
      var ranking = self._unwrap(results[4]);

      var orders = [];
      if (ordersData) {
        if (Array.isArray(ordersData)) orders = ordersData;
        else if (ordersData.records) orders = ordersData.records;
        else if (ordersData.list) orders = ordersData.list;
        else if (ordersData.content) orders = ordersData.content;
      }

      var today = new Date().toISOString().slice(0, 10);
      orders.forEach(function (o) {
        var created = String(o.createTime || o.createdAt || '').slice(0, 10);
        o._isTodayOrder = created === today;
        var inboundDate = String(o.lastWarehousingTime || o.warehousingTime || '').slice(0, 10);
        o._isTodayInbound = inboundDate === today;
        var outboundDate = String(o.lastOutboundTime || o.outboundTime || '').slice(0, 10);
        o._isTodayOutbound = outboundDate === today;
      });

      var inProd = orders.filter(function(o) { var s = String(o.status || '').toUpperCase(); return s !== 'COMPLETED' && s !== 'CLOSED' && s !== 'CANCELLED' && s !== 'SCRAPPED'; });
      var delayed = orders.filter(isDelayed);
      var risk = orders.filter(isRisk);

      var todayInbound = 0;
      var todayOutbound = 0;
      if (topStats) {
        todayInbound = (topStats.warehousingInbound && topStats.warehousingInbound.day) || 0;
        todayOutbound = (topStats.warehousingOutbound && topStats.warehousingOutbound.day) || 0;
      }

      var menuData = {
        inProduction: Number(statsData && statsData.activeOrders) || inProd.length,
        todayOrders: Number(statsData && statsData.todayOrders) || orders.filter(function(o) { return o._isTodayOrder; }).length,
        todayInbound: todayInbound,
        todayOutbound: todayOutbound,
        delayedOrders: Number(statsData && statsData.delayedOrders) || delayed.length,
        riskOrders: risk.length,
      };

      var totalWarn = menuData.delayedOrders + menuData.riskOrders;

      var factoryList = [];
      if (pulse && pulse.factoryActivity) {
        pulse.factoryActivity.forEach(function (f) {
          var mins = f.minutesSinceLastScan || 999;
          factoryList.push({ factoryName: f.factoryName, active: !!f.active, mins: mins, timeText: mins < 1 ? '刚刚' : mins < 60 ? mins + '分钟前' : Math.floor(mins / 60) + 'h前', todayQty: f.todayQty || 0 });
        });
      }

      var rankingList = [];
      var medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
      if (ranking && ranking.rankings) {
        ranking.rankings.slice(0, 5).forEach(function (r, i) {
          rankingList.push({ factoryId: r.factoryId || '', factoryName: r.factoryName || '', totalScore: r.totalScore || 0, medal: i < 3 ? ['🥇', '🥈', '🥉'][i] : '#' + (i + 1), medalColor: medalColors[i] || '#7a8999' });
        });
      }

      self.setData({
        menuData: menuData, totalWarn: totalWarn,
        factoryList: factoryList, rankingList: rankingList,
        _allOrders: orders, loading: false,
      });

      if (self.data.activeMenu) { self.onMenuTap({ currentTarget: { dataset: { key: self.data.activeMenu } } }); }
    }).catch(function (err) {
      console.warn('[SmartOps] refresh error:', err);
      self.setData({ loading: false });
    });
  },

  _unwrap: function (result) {
    if (!result || result.status !== 'fulfilled') return null;
    var val = result.value;
    if (val && val.data) return val.data;
    return val;
  },
});
