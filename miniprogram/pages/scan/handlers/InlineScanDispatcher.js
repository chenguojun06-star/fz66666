/**
 * 页内扫码分发器：在非扫码页（生产管理/外发管理等）直接处理扫码并一步直达业务页
 *
 * 背景（D-262）：
 * - /pages/scan/index 是 tabBar 页面，safeNavigate 会把它转成 switchTab，
 *   而 switchTab 会丢弃 ?code= 参数 —— 从业务页跳过去扫码结果必然丢失，
 *   用户落地扫码主页后还得再扫一次（D-261 恢复 quickScan 后暴露的问题）。
 * - 本模块复用在 ScanHandler 的完整业务链路（解析→验证→工序检测→确认页），
 *   与扫码主页 processScanCode 行为 100% 一致，只是不经过扫码主页中转：
 *   扫码 → 直接跳到工序领取/报工（scan-result）、采购/裁剪领取（confirm）、
 *   质检入库（quality）、样衣出入库（scan-action）等最终页面。
 *
 * 依赖：ScanHandler / ScanResultHandler / ConfirmModalHandler / QualityHandler
 */

'use strict';

const api = require('../../../utils/api');
const ScanHandler = require('./ScanHandler');
const ScanResultHandler = require('./ScanResultHandler');
const ConfirmModalHandler = require('./ConfirmModalHandler');
const QualityHandler = require('./QualityHandler');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getStorageValue, getUserInfo } = require('../../../utils/storage');
const scanValidator = require('../mixins/scanValidator');

const isRecentDuplicate = scanValidator.isRecentDuplicate;
const markRecent = scanValidator.markRecent;

/** 防重入锁：避免同一次扫码被重复提交 */
let _dispatchBusy = false;

/**
 * 新建与扫码主页同款的 ScanHandler（工厂/工人信息从本地存储读取）
 * @returns {ScanHandler}
 */
function _createHandler() {
  return new ScanHandler(api, {
    // onError 置空：错误信息随返回值返回，统一在 _dispatchResult 提示，避免重复弹窗
    onError: function () {},
    getCurrentFactory: function () {
      try { return getStorageValue('currentFactory') || null; } catch (_) { return null; }
    },
    getCurrentWorker: function () {
      try { return getUserInfo() || null; } catch (_) { return null; }
    },
  });
}

/**
 * 派发扫码结果到最终页面（与扫码主页 scanSubmitter._handleScanResult 保持一致）
 * @param {Object} result - ScanHandler.handleScan() 返回结果
 * @param {string} code - 原始扫码内容（防重复标记用）
 * @returns {boolean} 是否已成功处理（已导航/已提示）
 */
function _dispatchResult(result, code) {
  // U编码 → 样衣扫码出入库
  if (result && result.data && result.data.scanMode === 'ucode') {
    markRecent(code, 30000);
    const sd = result.data.scanData || {};
    safeNavigate({
      url: '/pages/warehouse/sample/scan-action/index?styleNo=' + encodeURIComponent(sd.styleNo || '')
        + '&color=' + encodeURIComponent(sd.color || '')
        + '&size=' + encodeURIComponent(sd.size || ''),
    }).catch(function () {});
    return true;
  }

  // 已识别工序 → 工序领取/报工确认页（含裁剪/采购等）
  if (result && result.needConfirmProcess) {
    markRecent(code, 30000);
    ScanResultHandler.showScanResultConfirm(null, result.data);
    return true;
  }

  // 采购/裁剪 领取确认页
  if (result && result.needConfirm) {
    markRecent(code, 30000);
    ConfirmModalHandler.showConfirmModal(null, result.data);
    return true;
  }

  // 直接扫码成功（无需确认）
  if (result && result.success) {
    const msg = result.message || '扫码成功';
    toast.success(msg);
    const { triggerDataRefresh } = require('../../../utils/eventBus');
    try { triggerDataRefresh('scan'); } catch (_) { /* 忽略 */ }
    return true;
  }

  // 扫码失败
  if (result && result.success === false) {
    toast.error(result.message || '扫码失败，请重试');
    return true;
  }

  return false;
}

/**
 * 处理——需要用户输入数量时弹窗输入并重试（与扫码主页 needInput 逻辑一致）
 * @param {string} code - 原始扫码内容
 * @param {Object} input - handleScan 输入参数 {scanType, quantity, ...}
 * @param {number} retryCount - 已重试次数
 * @returns {Promise<boolean>} 是否已完成
 */
function _handleNeedInput(code, input, retryCount) {
  if (retryCount >= 3) {
    toast.error('多次输入无效，请检查订单数据后重试');
    return Promise.resolve(true);
  }
  return new Promise(function (resolve) {
    wx.showModal({
      title: '请输入数量',
      content: '无法自动获取订单数量，请输入本次完成数量',
      editable: true,
      placeholderText: '例如: 100',
      success: function (res) {
        if (res.confirm && res.content) {
          const next = Object.assign({}, input, { quantity: Number(res.content) });
          _runScan(code, next, retryCount + 1).then(resolve);
        } else {
          resolve(true);
        }
      },
      fail: function () { resolve(true); },
    });
  });
}

/**
 * 执行扫码业务链路 + 结果派发
 * @param {string} code - 原始扫码内容
 * @param {Object} input - handleScan 输入参数
 * @param {number} retryCount - needInput 重试次数
 * @returns {Promise<boolean>} 是否已完成
 */
async function _runScan(code, input, retryCount) {
  const handler = _createHandler();
  const result = await handler.handleScan(code, input);
  if (result && result.needInput) {
    return _handleNeedInput(code, input, retryCount);
  }
  return _dispatchResult(result, code);
}

/**
 * 页内扫码分发入口：扫码 → 原地解析处理 → 一步直达领取/报工等最终页面
 *
 * 用法：
 *   const { dispatchInlineScanCode } = require('../../../pages/scan/handlers/InlineScanDispatcher');
 *   scanInPage(function (parsed, raw) {
 *     if (!parsed) return;              // 用户取消
 *     if (!parsed.success) { toast('无法识别：' + raw); return; }
 *     dispatchInlineScanCode(raw);      // 一步直达工序领取/报工页
 *   });
 *
 * @param {string} code - 原始扫码内容
 * @param {Object} options - 可选，透传给 ScanHandler.handleScan 的输入参数（scanType/quantity/warehouse...）
 * @returns {Promise<void>}
 */
function dispatchInlineScanCode(code, options) {
  const rawCode = String(code || '').trim();
  if (!rawCode) {
    toast('未识别到内容');
    return Promise.resolve();
  }
  if (isRecentDuplicate(rawCode)) {
    toast.info('扫码太快啦');
    return Promise.resolve();
  }
  if (_dispatchBusy) {
    return Promise.resolve();
  }
  _dispatchBusy = true;

  const input = Object.assign({ scanType: 'auto' }, options || {});

  return _runScan(rawCode, input, 0)
    .catch(function (e) {
      // 与扫码主页 _handleScanException 保持一致
      if (e && e.needWarehousing && e.warehousingData) {
        QualityHandler.showQualityModal(null, e.warehousingData);
        return;
      }
      if (e && e.isCompleted) {
        const msg = e.message || '进度节点已完成';
        if (String(msg).indexOf('物料均已领取') >= 0) {
          toast.info('物料已全部领取，请扫描订单二维码进入裁剪工序');
        } else {
          toast.success(msg);
        }
        return;
      }
      if (e && e.isOfflineQueued) {
        toast('已离线缓存，联网后自动同步', 2500);
        return;
      }
      const msg = (e && (e.errMsg || e.message)) || '系统异常，请重试';
      toast.error(msg);
    })
    .finally(function () {
      _dispatchBusy = false;
    });
}

module.exports = {
  dispatchInlineScanCode: dispatchInlineScanCode,
};
