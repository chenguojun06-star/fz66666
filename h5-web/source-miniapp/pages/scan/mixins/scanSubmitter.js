/**
 * 扫码提交模块 - 扫码初始化、执行、结果分发
 * 提取自 scanCoreMixin.js
 * @module scanSubmitter
 */
'use strict';

const api = require('../../../utils/api');
const ScanHandler = require('../handlers/ScanHandler');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const scanValidator = require('./scanValidator');
const isRecentDuplicate = scanValidator.isRecentDuplicate;
const markRecent = scanValidator.markRecent;
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

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
      if (currentScanType === 'warehouse' && !this.data.warehouse) { toast.error(i18n.t(NS + 'pleaseSelectWarehouse')); return; }
      const self = this;
      wx.scanCode({
        onlyFromCamera: true,
        scanType: ['qrCode', 'barCode'],
        success: function(res) { self.processScanCode(res.result, currentScanType); },
        fail: function(err) {
          if (err.errMsg && err.errMsg.indexOf('cancel') === -1) toast.error(i18n.t(NS + 'scanFailed'));
        },
      });
    },

    processScanCode: function(codeStr, scanType) {
      console.log('[DEBUG] processScanCode 入口: codeStr=', codeStr, 'scanType=', scanType);
      if (!codeStr) return;
      const self = this;
      if (isRecentDuplicate(codeStr)) { toast.info(i18n.t(NS + 'scanTooFast')); return; }
      this.setData({ loading: true });
      if (/^MR\d{13}$/.test(codeStr)) {
        this.setData({ loading: false });
        safeNavigate({ url: '/pages/warehouse/material/scan/index?rollCode=' + encodeURIComponent(codeStr) }).catch(() => {});
        return;
      }
      if (scanType === 'stock') { this.handleStockQuery(codeStr); return; }
      const options = { scanType: scanType, quantity: this._quantity, warehouse: this.data.warehouse, warehouseAreaId: this.data.warehouseAreaId, warehouseLocationCode: this.data.warehouseLocationCode };
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
        safeNavigate({
          url: '/pages/warehouse/sample/scan-action/index?styleNo=' + encodeURIComponent(sd.styleNo || '') + '&color=' + encodeURIComponent(sd.color || '') + '&size=' + encodeURIComponent(sd.size || ''),
        }).catch(() => {});
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
          toast.error(i18n.t(NS + 'tooManyInput'));
          this.setData({ loading: false }); this._needInputRetryCount = 0; return;
        }
        const self = this;
        wx.showModal({
          title: i18n.t(NS + 'inputQtyTitle'),
          content: i18n.t(NS + 'inputQtyContent'),
          editable: true,
          placeholderText: i18n.t(NS + 'inputQtyPh'),
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
        const msg = result.message || result.errMsg || i18n.t(NS + 'scanFailedRetry');
        toast.error(msg);
        this.handleScanError({ message: msg, orderNo: result.orderNo, processCode: result.processCode, processName: result.processName, quantity: result.quantity });
        return;
      }
      toast.error(i18n.t(NS + 'scanResultAbnormal'));
      this.handleScanError({ message: i18n.t(NS + 'scanResultAbnormal') });
    },

    _handleScanException: function(e) {
      if (e.needWarehousing && e.warehousingData) { this.showQualityModal(e.warehousingData); this.setData({ loading: false }); return; }
      if (e.isCompleted) {
        const msg = e.message || i18n.t(NS + 'stageDoneDefault');
        // ⚠️ '物料均已领取' 是**匹配异常报文**用的特征串，不是显示文案，保留中文
        if (msg.indexOf('物料均已领取') >= 0) toast.info(i18n.t(NS + 'allMaterialClaimedToast'));
        else toast.success(msg);
        this.setData({
          lastResult: { success: true, message: msg, displayTime: new Date().toLocaleTimeString(), statusText: i18n.t(NS + 'statusCompleted'), statusClass: 'success' },
          lastLocalScanRecord: { orderNo: e.orderNo || '', processName: i18n.t(NS + 'allProcessesDone'), processCode: '', quantity: 0, success: true, time: new Date().toLocaleTimeString() },
          loading: false,
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        this._startResultDismissTimer();
        return;
      }
      if (e.isOfflineQueued) {
        wx.showToast({ title: i18n.t(NS + 'offlineQueued'), icon: 'none', duration: 2500 });
        this.setData({
          lastResult: { success: false, queued: true, message: i18n.t(NS + 'offlineQueuedNoNetwork'), displayTime: new Date().toLocaleTimeString(), statusText: i18n.t(NS + 'statusCached'), statusClass: 'queued', errorAction: null },
          offlinePendingCount: e.offlineCount || 0,
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 300 });
        this._startResultDismissTimer();
        return;
      }
      const errorMsg = e.errMsg || e.message || i18n.t(NS + 'systemError');
      toast.error(errorMsg);
      this.handleScanError({ message: errorMsg });
      const errorHandler = require('../../../utils/errorHandler');
      errorHandler.logError(e, '_handleScanException');
    },
  },
};
