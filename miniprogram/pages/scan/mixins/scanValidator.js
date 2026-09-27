/**
 * 扫码校验模块
 * 提取自 scanCoreMixin.js
 * @module scanValidator
 */
'use strict';

const i18n = require('../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

const recentScanExpires = new Map();
const MAX_RECENT_SCANS = 80;
const CLEANUP_BATCH_SIZE = 20;

function cleanupRecentScans() {
  const now = Date.now();
  const toDelete = [];
  for (const [key, expireTime] of recentScanExpires.entries()) {
    if (now > expireTime) toDelete.push(key);
    if (toDelete.length >= CLEANUP_BATCH_SIZE) break;
  }
  toDelete.forEach(function(key) { recentScanExpires.delete(key); });
}

function isRecentDuplicate(key) {
  const now = Date.now();
  const expireTime = recentScanExpires.get(key);
  if (expireTime && now < expireTime) return true;
  if (recentScanExpires.size > MAX_RECENT_SCANS) cleanupRecentScans();
  return false;
}

function markRecent(key, ttlMs) {
  recentScanExpires.set(key, Date.now() + ttlMs);
}

module.exports = {
  isRecentDuplicate: isRecentDuplicate,
  markRecent: markRecent,
  cleanupRecentScans: cleanupRecentScans,

  methods: {
    checkLoginStatus: function() {
      const { getToken, getUserInfo, getStorageValue, isTokenExpired, clearToken, clearRefreshToken } = require('../../../utils/storage');
      const { toastAndRedirect } = require('../../../utils/uiHelper');
      const token = getToken();
      const user = getUserInfo();
      const factory = getStorageValue('currentFactory');
      if (!token || !user) { toastAndRedirect(i18n.t(NS + 'pleaseLogin'), '/pages/login/index'); return false; }
      if (isTokenExpired()) { clearToken(); clearRefreshToken(); toastAndRedirect(i18n.t(NS + 'loginExpired'), '/pages/login/index'); return false; }
      const updates = {};
      if (JSON.stringify(user) !== JSON.stringify(this.data.currentUser)) updates.currentUser = user;
      if (JSON.stringify(factory) !== JSON.stringify(this._currentFactory)) this._currentFactory = factory;
      if (Object.keys(updates).length > 0) this.setData(updates);
      return true;
    },

    onQuantityInput: function(e) {
      const value = e.detail.value;
      if (value === '' || value === null || value === undefined) { this._quantity = ''; return; }
      const num = parseInt(value, 10);
      if (isNaN(num)) { wx.showToast({ title: i18n.t(NS + 'inputValidNumber'), icon: 'none' }); return; }
      if (num < 0) { wx.showToast({ title: i18n.t(NS + 'qtyNegative'), icon: 'none' }); return; }
      if (num > 999999) { wx.showToast({ title: i18n.t(NS + 'qtyTooLarge'), icon: 'none' }); return; }
      this._quantity = num;
    },


  },
};
