/**
 * 扫码状态管理模块 - 成功/失败回调、面板刷新、会话统计
 * 提取自 scanCoreMixin.js
 * @module scanStateManager
 */
'use strict';

var api = require('../../../utils/api');
var { DEBUG_MODE } = require('../../../config');

/** 扫码结果通知停留时长：20 分钟 */
var RESULT_DISMISS_MS = 20 * 60 * 1000;

module.exports = {
  methods: {
    /**
     * 启动扫码结果 20 分钟自动消失定时器。
     * 每次扫码（成功/失败/完成/离线缓存）后调用；再次扫码时旧 timer 被清除，实现"覆盖"语义。
     */
    _startResultDismissTimer: function() {
      var self = this;
      if (self._resultDismissTimer) clearTimeout(self._resultDismissTimer);
      self._resultDismissTimer = setTimeout(function() {
        self._resultDismissTimer = null;
        if (self && self.data && self.data.lastResult) {
          self.setData({ lastResult: null });
        }
      }, RESULT_DISMISS_MS);
    },

    refreshMy: function() { this.loadMyPanel(true); },

    loadMyPanel: function(refresh) {
      if (refresh === undefined) refresh = false;
      if (this.data.my.loadingStats && !refresh) return;
      this.setData({ 'my.loadingStats': true });
      var self = this;
      api.production.personalScanStats().then(function(res) {
        self.setData({ 'my.stats': { scanCount: res.scanCount || 0, orderCount: res.orderCount || 0, totalQuantity: res.totalQuantity || 0, totalAmount: res.totalAmount || 0 } });
      }).catch(function(e) {
        console.error('[loadMyPanel] 加载统计数据失败:', e.message || e);
        self.setData({ 'my.stats': { scanCount: 0, orderCount: 0, totalQuantity: 0, totalAmount: 0 } });
        if (DEBUG_MODE) wx.showToast({ title: '统计加载失败', icon: 'none' });
      }).finally(function() {
        self.setData({ 'my.loadingStats': false });
      });
      this.loadMyHistory(true);
    },

    handleScanSuccess: function(result) {
      wx.vibrateShort({ type: 'light' });
      var processName = result.processName || '';
      var scanQty = Number(result.quantity) || 0;
      var prevSessionQty = (this._sessionStats || {})[processName] || 0;
      var newSessionQty = prevSessionQty + scanQty;
      if (processName) { if (!this._sessionStats) this._sessionStats = {}; this._sessionStats[processName] = newSessionQty; }
      var formattedResult = { displayTime: new Date().toLocaleTimeString(), statusText: '扫码成功', statusClass: 'success', sessionQty: newSessionQty };
      for (var k in result) { if (result.hasOwnProperty(k)) formattedResult[k] = result[k]; }
      var localRecord = { orderNo: result.orderNo || '', processCode: result.processCode || '', processName: result.processName || '', quantity: result.quantity || 0, success: true, time: new Date().toLocaleTimeString() };
      this.setData({ lastResult: formattedResult, lastLocalScanRecord: localRecord, quantity: '' });
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
      this._startResultDismissTimer();
      this.addToLocalHistory(formattedResult);
      this.startUndoTimer(formattedResult);
      try {
        if (processName) { wx.setStorageSync('scan_pref_process', processName); this.setData({ lastUsedProcessName: processName }); }
        var curWarehouse = this.data.warehouse;
        if (curWarehouse) wx.setStorageSync('scan_pref_warehouse', curWarehouse);
      } catch (_) { /* storage 失败不影响扫码流程 */ }
      var self = this;
      this._scanRefreshTimer = setTimeout(function() {
        if (self && self.data) self.loadMyPanel(true);
        self._scanRefreshTimer = null;
      }, 800);
    },

    handleScanError: function(error) {
      wx.vibrateLong();
      var msg = error.errMsg || error.message || '扫码失败';
      var errorAction = 'retry';
      if (msg.indexOf('网络') >= 0 || msg.indexOf('timeout') >= 0 || msg.indexOf('超时') >= 0 || msg.indexOf('连接') >= 0 || msg.indexOf('errcode:-101') >= 0 || msg.indexOf('errcode:-102') >= 0) errorAction = 'checkNetwork';
      else if (msg.indexOf('重复') >= 0 || msg.indexOf('已扫') >= 0 || msg.indexOf('间隔') >= 0 || msg.indexOf('太快') >= 0) errorAction = null;
      var errorResult = { success: false, message: msg, displayTime: new Date().toLocaleTimeString(), statusText: '失败', statusClass: 'error', errorAction: errorAction };
      var localRecord = { orderNo: error.orderNo || '', processCode: error.processCode || '', processName: error.processName || '', quantity: error.quantity || 0, success: false, time: new Date().toLocaleTimeString() };
      this.setData({ lastResult: errorResult, lastLocalScanRecord: localRecord });
      wx.pageScrollTo({ scrollTop: 0, duration: 300 });
      this._startResultDismissTimer();
    }
  }
};
