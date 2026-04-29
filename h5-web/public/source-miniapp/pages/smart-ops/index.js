var api = require('../../utils/api');
var { isTenantOwner, isSuperAdmin } = require('../../utils/storage');

var REFRESH_INTERVAL = 30;

var STAGE_LIST = [
  { key: 'procurement', label: '采购' },
  { key: 'cutting', label: '裁剪' },
  { key: 'secondaryProcess', label: '二次工艺' },
  { key: 'sewing', label: '车缝' },
  { key: 'tailProcess', label: '尾部' },
  { key: 'warehousing', label: '入库' },
];

var MENU_TITLES = {
  inProduction: '生产中订单', todayOrders: '今日下单', todayInbound: '今日入库',
  todayOutbound: '今日出库', delayedOrders: '延期订单', riskOrders: '风险订单',
};

function safeDate(s) {
  if (!s) return null;
  var fixed = String(s).replace(/ /, 'T');
  var d = new Date(fixed);
  if (isNaN(d.getTime())) return null;
  return d;
}

function fmtDate(d) { return d ? String(d).slice(5, 10) : '--'; }

function toNum(v) { return Number(v) || 0; }

function calcProgress(o) {
  var w = toNum(o.warehousingCompletionRate);
  var t = Math.max(toNum(o.tailProcessRate), toNum(o.qualityCompletionRate));
  var sew = Math.max(toNum(o.carSewingCompletionRate), toNum(o.sewingCompletionRate));
  var c = toNum(o.cuttingCompletionRate);
  var p = Math.max(toNum(o.procurementCompletionRate), toNum(o.materialArrivalRate));
  var s = Math.max(toNum(o.secondaryProcessRate), toNum(o.secondaryProcessCompletionRate));
  var hasSec = !!(o.hasSecondaryProcess);
  var rates = hasSec ? [p, c, s, sew, t, w] : [p, c, sew, t, w];
  var sum = 0; for (var i = 0; i < rates.length; i++) sum += rates[i];
  return Math.round(sum / rates.length);
}

function detectStage(order) {
  var hasSec = !!(order.hasSecondaryProcess || order.secondaryProcessStartTime || order.secondaryProcessEndTime);
  var w = toNum(order.warehousingCompletionRate);
  var t = Math.max(toNum(order.tailProcessRate), toNum(order.qualityCompletionRate));
  var s = Math.max(toNum(order.secondaryProcessRate), toNum(order.secondaryProcessCompletionRate));
  var sew = Math.max(toNum(order.carSewingCompletionRate), toNum(order.sewingCompletionRate));
  var c = toNum(order.cuttingCompletionRate);
  var p = Math.max(toNum(order.procurementCompletionRate), toNum(order.materialArrivalRate));
  var chain = hasSec
    ? ['procurement', 'cutting', 'secondaryProcess', 'sewing', 'tailProcess', 'warehousing']
    : ['procurement', 'cutting', 'sewing', 'tailProcess', 'warehousing'];
  var rateMap = {
    procurement: p, cutting: c, secondaryProcess: hasSec ? s : 100,
    sewing: sew, tailProcess: t, warehousing: w,
  };
  for (var i = 0; i < chain.length; i++) {
    if (rateMap[chain[i]] < 100) return chain[i];
  }
  return chain[chain.length - 1] || 'warehousing';
}

function toOrderRow(o) {
  return {
    orderNo: o.orderNo || '', styleNo: o.styleNo || '', factoryName: o.factoryName || '',
    orderQuantity: toNum(o.orderQuantity), plannedEndDate: fmtDate(o.plannedEndDate),
    progress: calcProgress(o), status: o.status || '',
  };
}

function isDelayed(o) {
  var end = o.plannedEndDate || o.expectedShipDate;
  if (!end) return false;
  var d = safeDate(end);
  if (!d) return false;
  return d < new Date() && String(o.status || '').toUpperCase() !== 'COMPLETED';
}

function isHighRisk(o) {
  var end = o.plannedEndDate || o.expectedShipDate;
  if (!end) return false;
  var d = safeDate(end);
  if (!d) return false;
  var daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
  var prog = calcProgress(o);
  return daysLeft >= 0 && daysLeft <= 7 && prog < 50;
}

function isRisk(o) { return isDelayed(o) || isHighRisk(o); }

Page({
  data: {
    currentTime: '', totalWarn: 0,
    menuData: { inProduction: 0, todayOrders: 0, todayInbound: 0, todayOutbound: 0, delayedOrders: 0, riskOrders: 0 },
    menuExtra: { inProductionQty: 0, todayOrdersQty: 0, todayInboundQty: 0, todayOutboundQty: 0, delayedOrdersQty: 0, riskOrdersQty: 0 },
    activeMenu: '', activeMenuTitle: '', activeOrders: [],
    stageBuckets: [], activeStage: '', activeStageLabel: '', activeStageOrders: [],
    factoryList: [], factoryOnline: 0, factoryStagnant: 0, factoryTotalOrders: 0, factoryTotalQty: 0,
    lastRefreshTime: '', loading: false,
    // _allOrders 已迁移到 this._allOrders 实例属性（在 onMenuTap 里过滤使用，不参与 WXML 渲染）
    // 避免 setData 传入未绑定 WXML 变量的性能告警，同时减少大数组序列化开销。
  },

  _timer: null, _countdown: REFRESH_INTERVAL,

  onLoad: function () {
    if (!isTenantOwner() && !isSuperAdmin()) {
      wx.showModal({ title: '权限不足', content: '运营看板仅限租户主账号使用', showCancel: false, complete: function () { wx.navigateBack(); } });
      return;
    }
    this._refreshAll();
    this._startTimer();
  },

  onShow: function () { this._updateTime(); if (!this._timer) this._startTimer(); },
  onHide: function () { if (this._timer) { clearInterval(this._timer); this._timer = null; } },
  onPullDownRefresh: function () { this._refreshAll(); wx.stopPullDownRefresh(); },
  onUnload: function () { if (this._timer) clearInterval(this._timer); },

  onMenuTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.activeMenu === key) { this.setData({ activeMenu: '', activeOrders: [] }); return; }
    var orders = this._allOrders || [];
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

  onStageTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (this.data.activeStage === key) { this.setData({ activeStage: '', activeStageLabel: '', activeStageOrders: [] }); return; }
    var buckets = this.data.stageBuckets || [];
    var bucket = null;
    for (var i = 0; i < buckets.length; i++) { if (buckets[i].key === key) { bucket = buckets[i]; break; } }
    if (!bucket) return;
    this.setData({ activeStage: key, activeStageLabel: bucket.label, activeStageOrders: bucket.orders });
  },

  closeStage: function () { this.setData({ activeStage: '', activeStageLabel: '', activeStageOrders: [] }); },

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
      api.dashboard.getDailyBrief(),
      api.production.getFactoryCapacity(),
      api.intelligence.getLivePulse(),
    ]).then(function (results) {
      var ordersData = self._unwrap(results[0]);
      var statsData = self._unwrap(results[1]);
      var brief = self._unwrap(results[2]);
      var factoryCap = self._unwrap(results[3]);
      var pulse = self._unwrap(results[4]);

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

      var inProdQty = inProd.reduce(function(s, o) { return s + toNum(o.orderQuantity); }, 0);
      var delayedQty = delayed.reduce(function(s, o) { return s + toNum(o.orderQuantity); }, 0);
      var riskQty = risk.reduce(function(s, o) { return s + toNum(o.orderQuantity); }, 0);

      var todayOrderCount = toNum(brief && brief.todayOrderCount) || orders.filter(function(o) { return o._isTodayOrder; }).length;
      var todayOrderQty = toNum(brief && brief.todayOrderQuantity) || orders.filter(function(o) { return o._isTodayOrder; }).reduce(function(s, o) { return s + toNum(o.orderQuantity); }, 0);
      var todayInboundCount = toNum(brief && brief.todayInboundCount) || 0;
      var todayInboundQty = toNum(brief && brief.todayInboundQuantity) || 0;
      var todayOutboundCount = toNum(brief && brief.todayOutboundCount) || 0;
      var todayOutboundQty = toNum(brief && brief.todayOutboundQuantity) || 0;

      var menuData = {
        inProduction: toNum(statsData && statsData.activeOrders) || inProd.length,
        todayOrders: todayOrderCount,
        todayInbound: todayInboundCount,
        todayOutbound: todayOutboundCount,
        delayedOrders: toNum(statsData && statsData.delayedOrders) || delayed.length,
        riskOrders: risk.length,
      };
      var menuExtra = {
        inProductionQty: toNum(statsData && statsData.activeQuantity) || inProdQty,
        todayOrdersQty: todayOrderQty,
        todayInboundQty: todayInboundQty,
        todayOutboundQty: todayOutboundQty,
        delayedOrdersQty: toNum(statsData && statsData.delayedQuantity) || delayedQty,
        riskOrdersQty: riskQty,
      };
      var totalWarn = menuData.delayedOrders + menuData.riskOrders;

      var stageBuckets = STAGE_LIST.map(function(stage) {
        var bucketOrders = inProd.filter(function(o) { return detectStage(o) === stage.key; });
        var qty = bucketOrders.reduce(function(s, o) { return s + toNum(o.orderQuantity); }, 0);
        var leadOrder = bucketOrders.length > 0 ? bucketOrders[0] : null;
        return {
          key: stage.key, label: stage.label, count: bucketOrders.length, quantity: qty,
          leadOrderNo: leadOrder ? leadOrder.orderNo : '',
          leadProgress: leadOrder ? calcProgress(leadOrder) : 0,
          orders: bucketOrders.map(toOrderRow),
        };
      });

      var factoryList = [];
      var factoryOnline = 0;
      var factoryStagnant = 0;
      var factoryTotalOrders = 0;
      var factoryTotalQty = 0;

      if (Array.isArray(factoryCap)) {
        factoryCap.forEach(function (f) {
          var orders = toNum(f.totalOrders);
          factoryTotalOrders += orders;
          factoryTotalQty += toNum(f.totalQuantity);
          factoryList.push({
            factoryName: f.factoryName || '', activeOrders: orders,
            totalQty: toNum(f.totalQuantity), atRiskCount: toNum(f.atRiskCount), overdueCount: toNum(f.overdueCount),
            deliveryOnTimeRate: f.deliveryOnTimeRate, activeWorkers: toNum(f.activeWorkers), avgDailyOutput: f.avgDailyOutput || 0,
          });
        });
      }

      if (pulse && pulse.factoryActivity) {
        var onlineFactories = pulse.factoryActivity.filter(function(f) { return !!f.active; });
        factoryOnline = onlineFactories.length;
        factoryStagnant = pulse.stagnantFactories ? pulse.stagnantFactories.length : 0;

        pulse.factoryActivity.forEach(function (fa) {
          var found = false;
          for (var i = 0; i < factoryList.length; i++) {
            if (factoryList[i].factoryName === fa.factoryName) {
              factoryList[i].active = !!fa.active;
              factoryList[i].mins = fa.minutesSinceLastScan || 999;
              factoryList[i].timeText = fa.minutesSinceLastScan < 1 ? '刚刚' : fa.minutesSinceLastScan < 60 ? fa.minutesSinceLastScan + '分钟前' : Math.floor(fa.minutesSinceLastScan / 60) + 'h前';
              factoryList[i].todayQty = fa.todayQty || 0;
              found = true;
              break;
            }
          }
          if (!found) {
            var mins = fa.minutesSinceLastScan || 999;
            factoryList.push({
              factoryName: fa.factoryName, active: !!fa.active, mins: mins,
              timeText: mins < 1 ? '刚刚' : mins < 60 ? mins + '分钟前' : Math.floor(mins / 60) + 'h前',
              todayQty: fa.todayQty || 0, activeOrders: 0, totalQty: 0, highRiskCount: 0, overdueCount: 0,
            });
          }
        });
      }

      self.setData({
        menuData: menuData, menuExtra: menuExtra, totalWarn: totalWarn,
        stageBuckets: stageBuckets,
        factoryList: factoryList, factoryOnline: factoryOnline, factoryStagnant: factoryStagnant,
        factoryTotalOrders: factoryTotalOrders, factoryTotalQty: factoryTotalQty,
        loading: false,
      });
      // 存为实例属性，不走 setData（不参与 WXML）
      self._allOrders = orders;

      if (self.data.activeMenu) { self.onMenuTap({ currentTarget: { dataset: { key: self.data.activeMenu } } }); }
      if (self.data.activeStage) { self.onStageTap({ currentTarget: { dataset: { key: self.data.activeStage } } }); }
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
