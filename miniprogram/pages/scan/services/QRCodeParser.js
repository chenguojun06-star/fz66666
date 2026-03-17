/**
 * 二维码解析服务 - 主调度器
 * Version: 2.3 (重构版)
 * Date: 2026-02-15
 *
 * 🔧 重构说明 (v2.2 → v2.3):
 * 1. 提取工具类到 ParserUtils.js (~180行)
 * 2. 提取菲号解析到 BundleCodeParser.js (~200行)
 * 3. 提取订单号解析到 OrderCodeParser.js (~60行)
 * 4. 提取JSON解析到 JSONCodeParser.js (~190行)
 * 5. 提取URL解析到 URLCodeParser.js (~120行)
 * 6. 主文件减少: 793行 → 205行 (-74%)
 *
 * 功能：
 * 1. 解析菲号（Bundle）二维码：PO20260122001-ST001-黑色-L-50-01
 * 2. 解析订单二维码：PO20260122001 或 {"type":"order","orderNo":"PO20260122001"}
 * 3. 解析JSON格式二维码：{"scanCode":"xxx","quantity":10,...}
 * 4. 解析URL参数格式：?scanCode=xxx&quantity=10
 * 5. 支持样板生产识别：{"type":"pattern","patternId":"123"}
 *
 * 使用示例：
 * const parser = new QRCodeParser();
 * const result = parser.parse('PO20260122001-ST001-黑色-L-50-01');
 * // result: { success, message, data: { orderNo, styleNo, color, size, quantity, bundleNo, scanCode, isOrderQR } }
 *
 * @author GitHub Copilot
 * @date 2026-02-15
 */

const ParserUtils = require('./parsers/ParserUtils');
const BundleCodeParser = require('./parsers/BundleCodeParser');
const OrderCodeParser = require('./parsers/OrderCodeParser');
const JSONCodeParser = require('./parsers/JSONCodeParser');
const URLCodeParser = require('./parsers/URLCodeParser');

class QRCodeParser {
  constructor() {
    // 订单号正则（委托给 OrderCodeParser）
    this.orderNoPattern = OrderCodeParser.orderNoPattern;
  }

  /**
   * 主解析方法 - 统一入口
   * @param {string} rawScanCode - 扫描的原始内容
   * @returns {Object} 解析结果
   * @returns {boolean} result.success - 是否成功解析
   * @returns {string} result.message - 提示消息
   * @returns {Object} result.data - 解析后的数据
   */
  parse(rawScanCode) {
    const raw = (rawScanCode || '').toString().trim();
    if (!raw) {
      return { success: false, message: '扫描内容为空', data: null };
    }

    // 预处理
    const { parseTarget, skuNo, first } = this._preprocessScanCode(raw);

    // 尝试解析（传入原始扫码内容用于 scanCode 字段）
    const result = this._tryParseFormats(parseTarget, first, skuNo, raw);
    if (result) {
      return result;
    }

    // 无法识别
    return {
      success: false,
      message: '无法识别的二维码格式',
      data: {
        scanCode: raw,
        quantity: ParserUtils.parseQuantityFromText(parseTarget),
        orderNo: '',
        styleNo: '',
        color: '',
        size: '',
        bundleNo: '',
        skuNo: skuNo || '',
        isOrderQR: false,
      },
    };
  }

  /**
   * 预处理扫码内容，提取SKU编号
   * @private
   * @param {string} raw - 原始扫码内容
   * @returns {Object} { parseTarget, skuNo, first }
   */
  _preprocessScanCode(raw) {
    const first = raw[0];
    let parseTarget = raw;
    let skuNo = '';

    if (first !== '{' && first !== '[' && raw.includes('|')) {
      const parts = raw
        .split('|')
        .map(p => (p === null ? '' : String(p)).trim())
        .filter(p => p);
      if (parts.length > 1) {
        // 过滤掉 SIG- 签名段（由后端验证，小程序无需处理）
        const nonSigParts = parts.filter(p => !String(p).toUpperCase().startsWith('SIG-'));
        parseTarget = nonSigParts[0] || parts[0];
        const skuPart = parts.find(p => String(p).toUpperCase().startsWith('SKU'));
        if (skuPart) {
          skuNo = skuPart;
        }
      }
    }

    return { parseTarget, skuNo, first };
  }

  /**
   * 尝试按优先级解析各种格式
   * @private
   * @param {string} parseTarget - 解析目标（可能是截断后的）
   * @param {string} first - 第一个字符
   * @param {string} skuNo - SKU编号
   * @param {string} rawScanCode - 原始完整扫码内容（用于 scanCode 字段）
   * @returns {Object|null} 解析结果或null
   */
  _tryParseFormats(parseTarget, first, skuNo, rawScanCode) {
    // 1. JSON格式
    if (first === '{' || first === '[') {
      const jsonResult = JSONCodeParser.parse(parseTarget);
      if (jsonResult) {
        if (skuNo) {
          jsonResult.skuNo = skuNo;
        }
        return { success: true, message: '解析成功 (JSON)', data: jsonResult };
      }
    }

    // 2. URL参数格式
    const urlResult = URLCodeParser.parse(parseTarget, (code) => BundleCodeParser.parse(code));
    if (urlResult) {
      if (skuNo) {
        urlResult.skuNo = skuNo;
      }
      return { success: true, message: '解析成功 (URL)', data: urlResult };
    }

    // 2.5 面辅料料卷/箱二维码 MR + YYYYMMDD + 5位序号（共15字符）
    if (/^MR\d{13}$/.test(parseTarget)) {
      return {
        success: true,
        message: '解析成功 (面辅料料卷)',
        data: {
          scanCode: rawScanCode,
          type: 'material_roll',
          rollCode: parseTarget,
          orderNo: '',
          styleNo: '',
          color: '',
          size: '',
          quantity: 0,
          bundleNo: '',
          skuNo: '',
          isOrderQR: false,
          isMaterialRoll: true,
        },
      };
    }

    // 3. 菲号格式（🔧 修复：使用原始完整扫码内容作为 scanCode）
    const bundleResult = BundleCodeParser.parse(parseTarget);
    if (bundleResult) {
      return this._buildBundleResult(bundleResult, rawScanCode, skuNo);
    }

    // 4. 订单号格式
    const orderResult = OrderCodeParser.parse(parseTarget);
    if (orderResult) {
      if (skuNo) {
        orderResult.skuNo = skuNo;
      }
      return { success: true, message: '解析成功 (订单号)', data: orderResult };
    }

    return null;
  }

  /**
   * 构建菲号解析结果
   * @private
   * @param {Object} bundleResult - 菲号解析结果
   * @param {string} raw - 原始扫码内容
   * @param {string} skuNo - SKU编号
   * @returns {Object} 格式化的解析结果
   */
  _buildBundleResult(bundleResult, raw, skuNo) {
    const isSku = bundleResult.bundleNo === null && bundleResult.color && bundleResult.size;

    return {
      success: true,
      message: isSku ? '解析成功 (SKU)' : '解析成功 (菲号)',
      data: {
        scanCode: raw,
        quantity: bundleResult.quantity,
        orderNo: bundleResult.orderNo,
        styleNo: bundleResult.styleNo,
        color: bundleResult.color,
        size: bundleResult.size,
        bundleNo: bundleResult.bundleNo !== null ? String(bundleResult.bundleNo) : '',
        skuNo: skuNo || '',
        isOrderQR: false,
        isSkuQR: isSku,
      },
    };
  }
}

// 导出单例
module.exports = new QRCodeParser();
