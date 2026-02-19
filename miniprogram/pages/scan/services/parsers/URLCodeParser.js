/**
 * URL参数解析器
 * 从 QRCodeParser.js 提取URL参数解析逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module URLCodeParser
 * @description 解析URL参数格式二维码：?scanCode=xxx&quantity=10&orderNo=xxx
 */

const ParserUtils = require('./ParserUtils');
const JSONCodeParser = require('./JSONCodeParser');

class URLCodeParser {
  /**
   * 解析URL参数格式二维码
   * 支持格式：
   * 1. ?scanCode=xxx&quantity=10&orderNo=xxx
   * 2. ?type=pattern&patternId=123
   * 3. 完整URL：http://example.com?key=value
   *
   * @param {string} raw - URL参数字符串
   * @param {Function} parseFeiNo - 菲号解析函数（可选）
   * @returns {Object|null} 解析结果
   */
  static parse(raw, parseFeiNo = null) {
    const params = URLCodeParser.tryParseQueryParams(raw);
    if (!params) {
      return null;
    }

    // 处理样板生产类型
    const urlType = String(params.type || params.qrType || '').trim().toLowerCase();
    const urlPatternId = params.patternId || params.patternProductionId || params.id;
    if ((urlType === 'pattern' || urlType === 'sample') && urlPatternId) {
      return {
        scanCode: String(urlPatternId).trim(),
        quantity: params.quantity ? parseInt(params.quantity, 10) : null,
        orderNo: '',
        styleNo: params.styleNo ? String(params.styleNo).trim() : '',
        color: params.color ? String(params.color).trim() : '',
        size: params.size ? String(params.size).trim() : '',
        bundleNo: '',
        isOrderQR: false,
        isPatternQR: true,
        qrType: 'pattern',
        patternId: String(urlPatternId).trim(),
      };
    }

    // 提取字段
    const code = params.scanCode || params.code || params.qr || params.value;
    const qty = params.quantity || params.qty || params.num || params.count;
    const orderNo = params.orderNo || params.po || params.order;
    const orderId = params.orderId || params.id;
    const styleNo = params.styleNo || params.st || params.style;
    const color = params.color;
    const size = params.size;
    const bundleNo = params.bundleNo || params.cuttingBundleNo || params.bundle;

    return JSONCodeParser.buildResult(
      { code, qty, orderNo, orderId, styleNo, color, size, bundleNo },
      raw,
      parseFeiNo
    );
  }

  /**
   * 尝试解析URL参数格式
   * @param {string} text - 待解析文本
   * @returns {Object|null} 参数对象
   */
  static tryParseQueryParams(text) {
    const s = (text || '').toString().trim();
    if (!s || !s.includes('=')) {
      return null;
    }

    // 兼容完整 URL、?query、#query 三种格式
    let clean = s;
    const qIdx = clean.indexOf('?');
    if (qIdx >= 0) {
      clean = clean.slice(qIdx + 1);
    }
    clean = clean.replace(/^[?#]/, '');
    const hIdx = clean.indexOf('#');
    if (hIdx >= 0) {
      clean = clean.slice(0, hIdx);
    }

    const pairs = clean.split('&');

    const out = {};
    for (const pair of pairs) {
      const [k, v] = pair.split('=').map(x => decodeURIComponent(x).trim());
      if (!k) {
        continue;
      }
      out[k] = v;
    }

    return Object.keys(out).length > 0 ? out : null;
  }
}

module.exports = URLCodeParser;
