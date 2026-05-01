/**
 * 扫码提交模块 - 扫码初始化、执行、结果分发
 * 提取自 scanCoreMixin.js
 * @module scanSubmitter
 */
'use strict';

const api = require('../../../utils/api');
const ScanHandler = require('../handlers/ScanHandler');
const { toast } = require('../../../utils/uiHelper');
const scanValidator = require('./scanValidator');
const isRecentDuplicate = scanValidator.isRecentDuplicate;
const markRecent = scanValidator.markRecent;

module.exports = {
  methods: {
    _ensureScanHandler: function() {
      if (this.scanHandler) return;
      try {
        this.scanHandler = new ScanHandler(api, {
          onSuccess: this.handleScanSuccess.bind(this),
          onError: this.handleScanError.bind(this),
          getCurrentFactory: function() { return this.data.currentFactory; }.bind(this),
          getCurrentWorker: function() { return this.data.currentUser; }.bind(this),
        });
      } catch (e) {
        console.error('[scanCoreMixin] scanHandler 惰性初始化失败:', e);
      }
    },

    onScan: function() {
      if (!this.data.scanEnabled || this.data.loading) return;
      const currentScanType = this.data.scanType || 'auto';
      if (currentScanType === 'warehouse' && !this.data.warehouse) { toast.error('请先选择目标仓库'); return; }
      const self = this;
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode', 'barCode'],
        success: function(res) { self.processScanCode(res.result, currentScanType); },
        fail: function(err) {
          if (err.errMsg && err.errMsg.indexOf('cancel') === -1) toast.error('扫码失败');
        },
      });
    },

    processScanCode: function(codeStr, scanType) {
      if (!codeStr) return;
      const self = this;
      if (isRecentDuplicate(codeStr)) { toast.info('扫码太快啦'); return; }
      this.setData({ loading: true });
      if (/^MR\d{13}$/.test(codeStr)) {
        this.setData({ loading: false });
        wx.navigateTo({ url: '/pages/warehouse/material/scan/index?rollCode=' + encodeURIComponent(codeStr) });
        return;
      }
      if (scanType === 'stock') { this.handleStockQuery(codeStr); return; }
      const options = { scanType: scanType, quantity: this._quantity, warehouse: this.data.warehouse };
      this._ensureScanHandler();
      this.scanHandler.handleScan(codeStr, options).then(function(result) {
        self._handleScanResult(result, codeStr, scanType);
      }).catch(function(e) {
        self._handleScanException(e);
      }).finally(function() {
        self.setData({ loading: false });
      });
    },

    _handleScanResult: function(result, codeStr, scanType) {
      if (result && result.data && result.data.scanMode === 'ucode') {
        markRecent(codeStr, 30000);
        const sd = result.data.scanData || {};
        wx.navigateTo({
          url: '/pages/warehouse/sample/scan-action/index?styleNo=' + encodeURIComponent(sd.styleNo || '') + '&color=' + encodeURIComponent(sd.color || '') + '&size=' + encodeURIComponent(sd.size || ''),
        });
        this.setData({ loading: false });
        return;
      }
      if (result && result.needConfirmProcess) {
        markRecent(codeStr, 30000);
        this.showScanResultConfirm(result.data);
        this.setData({ loading: false });
        return;
      }
      if (result && result.needConfirm) {
        markRecent(codeStr, 30000);
        this.showConfirmModal(result.data);
        this.setData({ loading: false });
        return;
      }
      if (result && result.needInput) {
        if (!this._needInputRetryCount) this._needInputRetryCount = 0;
        this._needInputRetryCount++;
        if (this._needInputRetryCount > 3) {
          toast.error('多次输入无效，请检查订单数据后重试');
          this.setData({ loading: false }); this._needInputRetryCount = 0; return;
        }
        const self = this;
        wx.showModal({
          title: '请输入数量', content: '无法自动获取订单数量，请输入本次完成数量',
          editable: true, placeholderText: '例如: 100',
          success: function(res) {
            if (res.confirm && res.content) { self._quantity = res.content; self.processScanCode(codeStr, scanType); }
          },
        });
        return;
      }
      if (result && result.success) {
        markRecent(codeStr, 2000);
        this.handleScanSuccess(result);
        return;
      }
      if (result && result.success === false) {
        const msg = result.message || result.errMsg || '扫码失败，请重试';
        toast.error(msg);
        this.handleScanError({ message: msg, orderNo: result.orderNo, processCode: result.processCode, processName: result.processName, quantity: result.quantity });
        return;
      }
      toast.error('扫码结果异常，请重试');
      this.handleScanError({ message: '扫码结果异常，请重试' });
    },

    _handleScanException: function(e) {
      if (e.needWarehousing && e.warehousingData) { this.showQualityModal(e.warehousingData); this.setData({ loading: false }); return; }
      if (e.isCompleted) {
        const msg = e.message || '进度节点已完成';
        if (msg.indexOf('物料均已领取') >= 0) toast.info('物料已全部领取，请扫描订单二维码进入裁剪工序');
        else toast.success(msg);
        this.setData({
          lastResult: { success: true, message: msg, displayTime: new Date().toLocaleTimeString(), statusText: '已完成', statusClass: 'success' },
          lastLocalScanRecord: { orderNo: e.orderNo || '', processName: '全部工序已完成', processCode: '', quantity: 0, success: true, time: new Date().toLocaleTimeString() },
          loading: false,
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        this._startResultDismissTimer();
        return;
      }
      if (e.isOfflineQueued) {
        wx.showToast({ title: '📶 已离线缓存，联网后自动同步', icon: 'none', duration: 2500 });
        this.setData({
          lastResult: { success: false, queued: true, message: '📶 无网络，已离线缓存，联网后自动上传', displayTime: new Date().toLocaleTimeString(), statusText: '已缓存', statusClass: 'queued', errorAction: null },
          offlinePendingCount: e.offlineCount || 0,
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        this._startResultDismissTimer();
        return;
      }
      const errorMsg = e.errMsg || e.message || '系统异常';
      toast.error(errorMsg);
      this.handleScanError({ message: errorMsg });
      const errorHandler = require('../../../utils/errorHandler');
      errorHandler.logError(e, '_handleScanException');
    },
  },
};
