/**
 * 扫码校验模块
 * 提取自 scanCoreMixin.js
 * @module scanValidator
 */
'use strict';

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
      if (!token || !user) { toastAndRedirect('请先登录', '/pages/login/index'); return false; }
      if (isTokenExpired()) { clearToken(); clearRefreshToken(); toastAndRedirect('登录已过期，请重新登录', '/pages/login/index'); return false; }
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
      if (isNaN(num)) { wx.showToast({ title: '请输入有效数字', icon: 'none' }); return; }
      if (num < 0) { wx.showToast({ title: '数量不能为负数', icon: 'none' }); return; }
      if (num > 999999) { wx.showToast({ title: '数量不能超过999999', icon: 'none' }); return; }
      this._quantity = num;
    },

    mapScanType: function(stageName) {
      const map = {
        采购: 'production', 裁剪: 'cutting', 裁床: 'cutting', 剪裁: 'cutting', 开裁: 'cutting',
        二次工艺: 'production', 绣花: 'production', 印花: 'production', 水洗: 'production',
        车缝: 'production', 缝制: 'production', 缝纫: 'production', 整件: 'production',
        大烫: 'production', 整烫: 'production', 熨烫: 'production',
        尾部: 'production', 后整: 'production', 打包: 'production', 装箱: 'production',
        质检: 'quality', 检验: 'quality', 品检: 'quality', 验货: 'quality',
        包装: 'production', 入库: 'warehouse', 入仓: 'warehouse', 仓储: 'warehouse',
      };
      return map[stageName] || 'production';
    },
  },
};
