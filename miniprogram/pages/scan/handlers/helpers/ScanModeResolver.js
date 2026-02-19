/**
 * 扫码模式解析器
 *
 * 职责：
 * 1. 解析手动输入参数
 * 2. 判断扫码模式（bundle/order/sku/pattern）
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

class ScanModeResolver {
  constructor() {
    // 扫码模式常量
    this.SCAN_MODE = {
      BUNDLE: 'bundle',   // 菲号扫码（推荐）
      ORDER: 'order',     // 订单扫码
      SKU: 'sku',         // SKU扫码
      PATTERN: 'pattern', // 样板生产扫码
    };
  }

  /**
   * 解析手动输入参数
   * @param {Object|number|null} input - 手动输入参数
   * @returns {Object} 解析结果 { manualQuantity, manualScanType, manualWarehouse }
   */
  parseManualInput(input) {
    let manualQuantity = null;
    let manualScanType = null;
    let manualWarehouse = null;

    if (input && typeof input === 'object') {
      manualScanType = typeof input.scanType === 'string' ? input.scanType.trim() : null;
      manualWarehouse = typeof input.warehouse === 'string' ? input.warehouse.trim() : null;
      const q = Number(input.quantity);
      manualQuantity = Number.isFinite(q) && q > 0 ? q : null;
    } else {
      const q = Number(input);
      manualQuantity = Number.isFinite(q) && q > 0 ? q : null;
    }

    return { manualQuantity, manualScanType, manualWarehouse };
  }

  /**
   * 确定扫码模式
   * @param {Object} parsedData - 解析后的二维码数据
   * @returns {string} 扫码模式（bundle/order/sku/pattern）
   */
  determineScanMode(parsedData) {
    const qrType = String(parsedData.qrType || '').trim().toLowerCase();
    const hasPatternId = !!String(parsedData.patternId || '').trim();
    const looksLikePatternCode = /^pattern[-:_#]/i.test(String(parsedData.scanCode || '').trim());
    const hasOrderNo = !!String(parsedData.orderNo || '').trim();
    const hasBundleNo = !!String(parsedData.bundleNo || '').trim();
    const hasSkuMarker = !!String(parsedData.color || '').trim() && !!String(parsedData.size || '').trim();

    if (parsedData.isPatternQR || qrType === 'pattern' || hasPatternId || looksLikePatternCode) {
      return this.SCAN_MODE.PATTERN;
    }
    if (parsedData.isOrderQR || (hasOrderNo && !hasBundleNo && !hasSkuMarker)) {
      return this.SCAN_MODE.ORDER;
    }
    if (parsedData.isSkuQR) {
      return this.SCAN_MODE.SKU;
    }
    return this.SCAN_MODE.BUNDLE;
  }

  /**
   * 解析手动指定的工序类型
   * @param {string} scanType - 扫码类型字符串
   * @returns {Object|null} 工序信息或 null
   */
  resolveManualStage(scanType) {
    const st = String(scanType || '').trim();
    if (!st || st === 'auto') {
      return null;
    }
    const map = {
      procurement: { processName: '采购', progressStage: '采购', scanType: 'procurement' },
      cutting: { processName: '裁剪', progressStage: '裁剪', scanType: 'cutting' },
      production: { processName: '车缝', progressStage: '车缝', scanType: 'production' },
      sewing: { processName: '车缝', progressStage: '车缝', scanType: 'production' },
      ironing: { processName: '整烫', progressStage: '整烫', scanType: 'production' },
      packaging: { processName: '包装', progressStage: '包装', scanType: 'production' },
      // "质检"/"入库"不再特殊处理，全部按 production 计件
    };
    return map[st] || null;
  }
}

module.exports = ScanModeResolver;
