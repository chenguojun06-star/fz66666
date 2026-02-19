/**
 * 订单号解析器
 * 从 QRCodeParser.js 提取订单号解析逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module OrderCodeParser
 * @description 解析订单号格式二维码：PO20260122001, PO2026-0122-001
 */

class OrderCodeParser {
  constructor() {
    // 订单号正则：PO/ORD + 至少8位数字/字母，支持分隔符 - 或 _
    // 兼容后端ORD前缀和前端PO前缀
    this.orderNoPattern = /^(PO|ORD)[-_]?[0-9A-Z]{8,}$/i;
  }

  /**
   * 解析订单号格式二维码
   * 格式：PO20260122001, PO2026-0122-001, PO_20260122001
   *
   * @param {string} raw - 原始文本
   * @returns {Object|null} 解析结果
   */
  parse(raw) {
    // 先测试原始值，再测试移除分隔符后的值
    const clean = raw.replace(/[-_]/g, '');
    if (!this.orderNoPattern.test(raw) && !this.orderNoPattern.test(clean)) {
      return null;
    }

    return {
      scanCode: raw,
      quantity: null,
      orderNo: raw.replace(/[-_]/g, ''), // 移除分隔符
      styleNo: '',
      color: '',
      size: '',
      bundleNo: '',
      isOrderQR: true, // 标记为订单级别
    };
  }

  /**
   * 测试是否为订单号格式
   * @param {string} text - 文本
   * @returns {boolean}
   */
  test(text) {
    const clean = String(text || '').trim().replace(/[-_]/g, '');
    return this.orderNoPattern.test(text) || this.orderNoPattern.test(clean);
  }
}

module.exports = new OrderCodeParser();
