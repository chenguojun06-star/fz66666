/**
 * 扫码工序处理器
 *
 * 职责：
 * 1. 工序检测（调用 StageDetector）
 * 2. 重复扫码检查
 * 3. 特殊工序处理（质检、入库）
 * 4. 手动工序覆盖
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

const StageDetector = require('../../services/StageDetector');

class ScanStageProcessor {
  constructor(api, scanModeResolver, scanTypeGetter) {
    this.api = api;
    this.stageDetector = new StageDetector(api);
    this.scanModeResolver = scanModeResolver;
    this.scanTypeGetter = scanTypeGetter; // 获取 scanType 的回调函数
  }

  /**
   * 检测下一个工序（根据扫码模式选择策略）
   * @param {string} scanMode - 扫码模式（bundle/order）
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @returns {Promise<Object|null>} 工序检测结果
   */
  async detectStage(scanMode, parsedData, orderDetail) {
    const currentProcessName = String(
      (orderDetail && (orderDetail.currentProcessName || orderDetail.current_process_name)) || '',
    ).trim();
    const hasBundleNo = !!String((parsedData && parsedData.bundleNo) || '').trim();
    const hasOrderNo = !!String((parsedData && parsedData.orderNo) || '').trim();

    const SCAN_MODE = this.scanModeResolver.SCAN_MODE;

    if (scanMode === SCAN_MODE.BUNDLE) {
      // 防护：orderNo 为空时不应进入菲号路径
      if (!hasOrderNo) {
        console.warn('[ScanStageProcessor] BUNDLE模式但orderNo为空，无法检测工序');
        throw new Error('订单号为空，请检查二维码格式');
      }
      // 防回归护栏：采购/裁剪阶段不应走菲号路径
      if (!hasBundleNo && (currentProcessName === '采购' || currentProcessName === '裁剪')) {
        console.warn(
          `[ScanStageProcessor] 检测到疑似误路由: 当前阶段[${currentProcessName}]却进入BUNDLE分支, 已回退到订单工序检测`,
          {
            orderNo: parsedData?.orderNo,
            scanCode: parsedData?.scanCode,
            bundleNo: parsedData?.bundleNo,
          },
        );
        return await this.stageDetector.detectNextStage(orderDetail);
      }

      // 菲号模式：使用精确的扫码次数匹配
      return await this.stageDetector.detectByBundle(
        parsedData.orderNo,
        parsedData.bundleNo,
        parsedData.quantity,
        orderDetail,
      );
    } else {
      // 订单模式：使用订单当前进度判断（支持动态工序配置）
      return await this.stageDetector.detectNextStage(orderDetail);
    }
  }

  /**
   * 处理工序检测（包含手动工序覆盖）
   * @param {string} scanMode - 扫码模式
   * @param {Object} parsedData - 解析后的数据
   * @param {Object} orderDetail - 订单详情
   * @param {string} manualScanType - 手动指定的扫码类型
   * @returns {Promise<Object>} 工序检测结果
   */
  async processStageDetection(scanMode, parsedData, orderDetail, manualScanType) {
    let stageResult = await this.detectStage(scanMode, parsedData, orderDetail);

    const manualStage = this.scanModeResolver.resolveManualStage(manualScanType);
    if (manualStage) {
      stageResult = stageResult
        ? { ...stageResult, ...manualStage }
        : { ...manualStage, quantity: parsedData.quantity || 0, isDuplicate: false };
    }

    if (!stageResult) {
      throw new Error('无法识别当前工序,请联系管理员');
    }

    // 获取 scanType（通过回调）
    const scanType = this.scanTypeGetter ? this.scanTypeGetter() : null;

    // 质检类型特殊处理
    if (scanType === 'quality' && scanMode === 'ORDER') {
      throw new Error('质检请扫描菲号二维码');
    }

    // 所有工序已完成 → 抛出完成提示，阻止继续扫码（必须在入库判断之前）
    if (stageResult.isCompleted) {
      const err = new Error(stageResult.hint || '进度节点已完成');
      err.isCompleted = true;
      throw err;
    }

    // 入库类型特殊处理 - 触发手动入库弹窗
    if (scanType === 'warehouse') {
      // 标记需要手动入库，返回给页面处理
      return {
        success: true,
        needWarehousing: true,
        orderNo: parsedData.orderNo,
        bundleNo: parsedData.bundleNo,
        quantity: stageResult.quantity || parsedData.quantity,
        processName: stageResult.processName,
        stageResult,
      };
    }

    if (stageResult.isDuplicate) {
      throw new Error(stageResult.hint || '扫码过于频繁,请稍后再试');
    }

    return stageResult;
  }
}

module.exports = ScanStageProcessor;
