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
const i18n = require('../../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

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
      if (!hasOrderNo) {
        console.warn('[ScanStageProcessor] BUNDLE模式但orderNo为空，无法检测工序');
        throw new Error(i18n.t(NS + 'orderNoEmptyQrFormat'));
      }
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

      return await this.stageDetector.detectByBundle(
        parsedData.orderNo,
        parsedData.bundleNo,
        parsedData.quantity,
        orderDetail,
      );
    } else {
      if (currentProcessName === '采购' || currentProcessName === '裁剪') {
        return {
          processName: currentProcessName,
          progressStage: currentProcessName,
          scanType: currentProcessName === '采购' ? 'production' : 'cutting',
          quantity: parsedData.quantity || 0,
          isDuplicate: false,
          isCompleted: false,
          _skipStageDetection: true,
        };
      }
      // ORDER 码（无菲号）只能用于采购和裁剪阶段。
      // 当前订单处于生产阶段（车缝/尾部/二次工艺等），必须使用菲号二维码扫码。
      // 历史 bug：此处曾错误调用 detectNextStage，导致 ORDER 码被识别为任意生产工序。
      throw new Error(
        i18n.tf(NS + 'orderStageOnlyProcCutFmt', {
          stage: currentProcessName || i18n.t(NS + 'productionStage'),
        }),
      );
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
      throw new Error(i18n.t(NS + 'cannotDetectProcess'));
    }

    // 页面手选 scanType 仅用于 manual 覆盖，后续判定应优先使用检测出的工序 scanType
    const pageScanType = this.scanTypeGetter ? this.scanTypeGetter() : null;
    const scanType = (stageResult && stageResult.scanType) || pageScanType;

    // 质检类型特殊处理
    if (scanType === 'quality' && scanMode === 'ORDER') {
      throw new Error(i18n.t(NS + 'qcScanBundleQr'));
    }

    // 所有工序已完成 → 抛出完成提示，阻止继续扫码（必须在入库判断之前）
    if (stageResult.isCompleted) {
      const err = new Error(stageResult.hint || i18n.t(NS + 'stageDoneDefault'));
      err.isCompleted = true;
      throw err;
    }

    if (stageResult.isDuplicate) {
      throw new Error(stageResult.hint || i18n.t(NS + 'scanTooFrequent'));
    }

    return stageResult;
  }
}

module.exports = ScanStageProcessor;
