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

      if (res && res.success !== false) {
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

      // 判断是否为网络错误
      if (e.errMsg && e.errMsg.includes('timeout')) {
        return {
          success: false,
          message: '网络超时，请检查网络后重试',
        };
      }

      return {
        success: false,
        message: e.errMsg || e.message || '提交失败',
      };
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
      throw new Error(submitResult.message || '提交失败');
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

    if (scanMode === 'bundle' && bundleNo) {
      // 菲号模式：显示工序和数量
      const hint = stageResult.hint ? ` ${stageResult.hint}` : '';
      return `✅ ${processName} ${quantity}件${hint}${hintSuffix}`;
    } else if (scanMode === 'sku') {
      // SKU模式：显示工序、SKU信息和数量
      return `✅ ${processName} 成功 - ${scanData.color}/${scanData.size} ${quantity}件${hintSuffix}`;
    } else {
      // 订单模式：显示工序
      if (skuItems && skuItems.length > 0) {
        // 如果有SKU明细，提示已处理明细
        return `✅ ${processName} 成功 - 已处理 ${skuItems.length} 个规格${hintSuffix}`;
      }
      return `✅ 订单扫码成功 - ${processName}${hintSuffix}`;
    }
  }
}

module.exports = ScanSubmitter;
