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
  if (!raw) return '提交失败，请重试';
  // 网络连接重置（云端重启/网络中断）
  if (raw.includes('ERR_CONNECTION_RESET') || raw.includes('errcode:-101')) {
    return '网络连接中断，请稍后重试（服务器可能正在更新）';
  }
  // 请求超时
  if (raw.includes('timeout')) {
    return '网络超时，请检查网络后重试';
  }
  // 连接失败（WiFi断开、飞行模式）
  if (raw.includes('ERR_CONNECTION_REFUSED') || raw.includes('errcode:-102')) {
    return '无法连接服务器，请检查网络设置';
  }
  // DNS解析失败
  if (raw.includes('ERR_NAME_NOT_RESOLVED') || raw.includes('errcode:-105')) {
    return '网络异常，请检查网络连接';
  }
  // 业务错误（后端返回的 message）
  if (e && e.type === 'biz' && e.errMsg) {
    return e.errMsg;
  }
  return e && e.errMsg || e && e.message || '提交失败，请重试';
}

const ScanOfflineQueue = require('../../services/ScanOfflineQueue');

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

      // 严谨校验：如果后端报错但是 HTTP 200 (Result 中仅抛出了 code: 500)，res 里面压根没有 success
      // 因此必须明确 res.success === true 或者 res.code === 200!
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
          message: res?.message || '提交失败',
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
            message: '网络异常，已离线缓存，联网后自动同步',
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
      const err = new Error(submitResult.message || '提交失败');
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
    const hintSuffix = precheckHint ? `（预检提示：${precheckHint}）` : '';
    const bundleNoSuffix = bundleNo ? ` · 菲号${bundleNo}` : '';

    if (scanMode === 'bundle' && bundleNo) {
      // 菲号模式：显示工序和数量
      const hint = stageResult.hint ? ` ${stageResult.hint}` : '';
      return `${processName} ${quantity}件${hint}${bundleNoSuffix}${hintSuffix}`;
    } else if (scanMode === 'ucode') {
      // U编码入库模式
      return `U编码入库成功 - ${scanData.color}/${scanData.size} ${quantity}件${bundleNoSuffix}${hintSuffix}`;
    } else if (scanMode === 'sku') {
      // SKU模式：显示工序、SKU信息和数量
      return `${processName} 成功 - ${scanData.color}/${scanData.size} ${quantity}件${bundleNoSuffix}${hintSuffix}`;
    } else {
      // 订单模式：显示工序
      if (skuItems && skuItems.length > 0) {
        // 如果有SKU明细，提示已处理明细
        return `${processName} 成功 - 已处理 ${skuItems.length} 个规格${bundleNoSuffix}${hintSuffix}`;
      }
      return `订单扫码成功 - ${processName}${bundleNoSuffix}${hintSuffix}`;
    }
  }
}

module.exports = ScanSubmitter;
