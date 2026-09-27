/**
 * 扫码记录提交器
 *
 * 职责：
 * 1. 提交扫码记录到后端
 * 2. 构建返回结果
 * 3. 错误处理
 * 4. 成功消息构建
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

/**
 * 将网络底层错误码转换为用户友好的中文提示
 * @param {Error|Object} e - 错误对象
 * @returns {string} 用户友好的错误消息
 */
function _friendlyNetworkError(e) {
  const raw = e && (e.errMsg || e.message || '');
  if (!raw) return i18n.t(NS + 'submitFailedRetry');
  // 网络连接重置（云端重启/网络中断）
  if (raw.includes('ERR_CONNECTION_RESET') || raw.includes('errcode:-101')) {
    return i18n.t(NS + 'netInterrupted');
  }
  // 请求超时
  if (raw.includes('timeout')) {
    return i18n.t(NS + 'netTimeout');
  }
  // 连接失败（WiFi断开、飞行模式）
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('errcode:-102')) {
    return i18n.t(NS + 'netCannotConnect');
  }
  // DNS解析失败
  if (raw.includes('ERR_NAME_NOT_RESOLVED') || raw.includes('errcode:-105')) {
    return i18n.t(NS + 'netError');
  }
  // 业务错误（后端返回的 message）
  if (e && e.type === 'biz' && e.errMsg) {
    return e.errMsg;
  }
  return e && e.errMsg || e && e.message || i18n.t(NS + 'submitFailedRetry');
}

const ScanOfflineQueue = require('../../services/ScanOfflineQueue');
const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

class ScanSubmitter {
  constructor(api) {
    this.api = api;
  }

  /**
   * 提交扫码记录到服务器
   * @param {Object} scanData - 扫码数据
   * @returns {Promise<Object>} 提交结果
   */
  async submitScan(scanData) {
    try {
      let precheckHint = '';
      try {
        const precheckResp = await this.api.intelligence?.precheckScan?.({
          orderId: scanData?.orderId,
          orderNo: scanData?.orderNo,
          stageName: scanData?.progressStage,
          processName: scanData?.processName,
          quantity: Number(scanData?.quantity) || 0,
          operatorId: scanData?.operatorId,
          operatorName: scanData?.operatorName,
        });
        const issues = Array.isArray(precheckResp?.issues) ? precheckResp.issues : [];
        if (issues.length > 0) {
          const first = issues[0] || {};
          precheckHint = String(first.title || first.reason || first.suggestion || '').trim();
        }
      } catch (precheckError) {
        console.warn('[ScanSubmitter] 智能预检失败（不阻断扫码）:', precheckError);
      }

      const res = await this.api.production.executeScan(scanData);

      // ok() 已解包 Result.data，失败直接 throw 进 catch
      // res 为后端返回的业务数据 Map（含 scanRecord/success/unitPriceHint 等）
      if (res && (res.scanRecord || res.success === true)) {
        if (res.unitPriceHint) {
          wx.showToast({ title: res.unitPriceHint, icon: 'none', duration: 4000 });
        }
        return {
          success: true,
          data: {
            ...res,
            precheckHint,
          },
        };
      } else {
        return {
          success: false,
          message: res?.message || i18n.t(NS + 'submitFailed'),
        };
      }
    } catch (e) {
      console.error('[ScanSubmitter] 提交扫码失败:', e);
      const friendlyMsg = _friendlyNetworkError(e);
      // 网络错误时自动将扫码数据加入离线队列
      const rawErr = (e && (e.errMsg || e.message)) || '';
      const isNetworkErr =
        rawErr.includes('timeout') ||
        rawErr.includes('errcode:-101') ||
        rawErr.includes('errcode:-102') ||
        rawErr.includes('errcode:-105') ||
        rawErr.includes('ERR_CONNECTION') ||
        rawErr.includes('fail network');
      if (isNetworkErr && !ScanOfflineQueue.isFull()) {
        const ok = ScanOfflineQueue.enqueue(scanData);
        if (ok) {
          return {
            success: false,
            isOfflineQueued: true,
            offlineCount: ScanOfflineQueue.count(),
            message: i18n.t(NS + 'offlineQueuedNetwork'),
          };
        }
      }
      return { success: false, message: friendlyMsg };
    }
  }

  /**
   * 提交扫码并构建结果
   * @param {string} scanMode - 扫码模式
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} stageResult - 工序检测结果
   * @param {Object} scanData - 扫码数据
   * @returns {Promise<Object>} 提交结果
   */
  async submitAndBuildResult(scanMode, parsedData, stageResult, scanData) {
    const submitResult = await this.submitScan(scanData);
    if (!submitResult.success) {
      const err = new Error(submitResult.message || i18n.t(NS + 'submitFailed'));
      if (submitResult.isOfflineQueued) {
        err.isOfflineQueued = true;
        err.offlineCount = submitResult.offlineCount;
      }
      throw err;
    }

    return {
      success: true,
      message: this.buildSuccessMessage(scanMode, scanData, stageResult, submitResult.data?.precheckHint),
      data: {
        scanMode,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        quantity: stageResult.quantity || parsedData.quantity,
        processName: stageResult.processName,
        progressStage: stageResult.progressStage,
        scanType: stageResult.scanType,
        scanId: submitResult.data?.scanId,
      },
    };
  }

  /**
   * 构建成功提示消息
   * @param {string} scanMode - 扫码模式
   * @param {Object} scanData - 扫码数据
   * @param {Object} stageResult - 工序结果
   * @returns {string} 提示消息
   */
  buildSuccessMessage(scanMode, scanData, stageResult, precheckHint) {
    const quantity = scanData.quantity;
    const processName = scanData.processName;
    const bundleNo = scanData.bundleNo;
    const skuItems = scanData.skuItems;
    const hintSuffix = precheckHint ? i18n.tf(NS + 'precheckHintFmt', { hint: precheckHint }) : '';
    const bundleNoSuffix = bundleNo ? i18n.tf(NS + 'bundleNoSuffixFmt', { bundleNo: bundleNo }) : '';

    if (scanMode === 'bundle' && bundleNo) {
      // 菲号模式：显示工序和数量
      const hint = stageResult.hint ? ` ${stageResult.hint}` : '';
      return i18n.tf(NS + 'bundleSuccessFmt', {
        processName, quantity, hint, bundleNoSuffix, hintSuffix,
      });
    } else if (scanMode === 'ucode') {
      // U编码入库模式
      return i18n.tf(NS + 'ucodeSuccessFmt', {
        color: scanData.color, size: scanData.size, quantity, bundleNoSuffix, hintSuffix,
      });
    } else if (scanMode === 'sku') {
      // SKU模式：显示工序、SKU信息和数量
      return i18n.tf(NS + 'skuSuccessFmt', {
        processName, color: scanData.color, size: scanData.size, quantity, bundleNoSuffix, hintSuffix,
      });
    } else {
      // 订单模式：显示工序
      if (skuItems && skuItems.length > 0) {
        // 如果有SKU明细，提示已处理明细
        return i18n.tf(NS + 'orderSkuSuccessFmt', {
          processName, count: skuItems.length, bundleNoSuffix, hintSuffix,
        });
      }
      return i18n.tf(NS + 'orderSuccessFmt', { processName, bundleNoSuffix, hintSuffix });
    }
  }
}

module.exports = ScanSubmitter;
