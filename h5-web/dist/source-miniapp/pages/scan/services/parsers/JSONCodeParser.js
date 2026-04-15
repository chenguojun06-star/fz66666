/**
 * JSON解析器
 * 从 QRCodeParser.js 提取JSON解析逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module JSONCodeParser
 * @description 解析JSON格式二维码：{"type":"order","orderNo":"PO20260122001"}
 */

const ParserUtils = require('./ParserUtils');

class JSONCodeParser {
  /**
   * 解析JSON格式二维码
   * 支持格式：
   * 1. {"type":"order","orderNo":"PO20260122001"}
   * 2. {"scanCode":"xxx","quantity":10,...}
   * 3. {"type":"pattern","patternId":"123"}
   *
   * @param {string} raw - JSON字符串
   * @returns {Object|null} 解析结果
   */
  static parse(raw) {
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') {
        return null;
      }

      // 检查订单类型
      const orderResult = JSONCodeParser.handleOrderTypeJSON(obj);
      if (orderResult) {
        return orderResult;
      }

      // 提取字段并构建结果
      const fields = JSONCodeParser.extractFields(obj);
      return JSONCodeParser.buildResult(fields, raw);
    } catch (e) {
      return null;
    }
  }

  /**
   * 检查并处理订单类型JSON
   * 支持 type: 'order' (生产订单) 和 type: 'pattern' (样板生产)
   * @param {Object} obj - JSON对象
   * @returns {Object|null} 解析结果或null
   */
  static handleOrderTypeJSON(obj) {
    const qrType = String(obj.type || '').trim().toLowerCase();

    // 处理生产订单类型（兼容 orderNo 和 orderId 两种字段）
    if (qrType === 'order') {
      const orderNo = obj.orderNo ? String(obj.orderNo).trim() : '';
      const orderId = (obj.orderId || obj.id || '');
      if (orderNo || orderId) {
        return {
          scanCode: orderNo || String(orderId),
          quantity: null,
          orderNo: orderNo ? orderNo.replace(/[-_]/g, '') : '',
          orderId: orderId ? String(orderId).trim() : '',
          styleNo: obj.styleNo ? String(obj.styleNo).trim() : '',
          color: '',
          size: '',
          bundleNo: '',
          isOrderQR: true,
          qrType: 'order',
        };
      }
    }

    // 处理样板生产类型
    const patternId = obj.id || obj.patternId || obj.patternProductionId || obj.orderId;
    const isPatternType = ['pattern', 'sample', 'pattern_production', 'patternproduction'].includes(qrType);
    const isLegacyStylePattern = qrType === 'style' && !!patternId && (!obj.orderNo || obj.isPattern === true);

    if ((isPatternType || isLegacyStylePattern) && patternId) {
      return {
        scanCode: String(patternId),
        quantity: obj.quantity ? parseInt(obj.quantity, 10) : null,
        orderNo: '',
        styleNo: obj.styleNo ? String(obj.styleNo).trim() : '',
        color: obj.color ? String(obj.color).trim() : '',
        size: '',
        bundleNo: '',
        isOrderQR: false,
        isPatternQR: true,  // 标记为样板生产二维码
        qrType: 'pattern',
        patternId: String(patternId),
        patternStatus: obj.status || '',
        designer: obj.designer || '',
        patternDeveloper: obj.patternDeveloper || '',
      };
    }

    return null;
  }

  /**
   * 提取JSON字段（支持多种别名）
   * @param {Object} obj - JSON对象
   * @returns {Object} 提取的字段
   */
  static extractFields(obj) {
    return {
      code: ParserUtils.getField(obj, 'scanCode', 'code', 'qr', 'value', 'data'),
      qty: ParserUtils.getField(obj, 'quantity', 'qty', 'num', 'count'),
      orderNo: ParserUtils.getField(obj, 'orderNo', 'po', 'order', 'productionOrderNo'),
      orderId: ParserUtils.getField(obj, 'orderId', 'id'),
      styleNo: ParserUtils.getField(obj, 'styleNo', 'st', 'style', 'styleNumber'),
      color: obj.color,
      size: obj.size,
      bundleNo: ParserUtils.getField(obj, 'bundleNo', 'cuttingBundleNo', 'bundle'),
    };
  }

  /**
   * 构建解析结果对象
   * @param {Object} fields - 提取的字段 { code, qty, orderNo, orderId, styleNo, color, size, bundleNo }
   * @param {string} raw - 原始字符串
   * @param {Function} parseFeiNo - 菲号解析函数（可选，用于从code字段提取更多信息）
   * @returns {Object} 解析结果
   */
  static buildResult(fields, raw, parseFeiNo = null) {
    const { code, qty, orderNo, orderId, styleNo, color, size, bundleNo } = fields;

    const meta = (code && parseFeiNo) ? parseFeiNo(code) : null;

    const scanCode = ParserUtils.isPresent(code) ? String(code).trim() : raw;
    let resolvedOrderNo = ParserUtils.extractField(orderNo, meta, 'orderNo');
    const resolvedOrderId = (orderId && ParserUtils.isPresent(orderId)) ? String(orderId).trim() : '';
    const resolvedStyleNo = ParserUtils.extractField(styleNo, meta, 'styleNo');
    const resolvedColor = ParserUtils.extractField(color, meta, 'color');
    const resolvedSize = ParserUtils.extractField(size, meta, 'size');
    const resolvedBundleNo = ParserUtils.extractField(bundleNo, meta, 'bundleNo');

    // 订单号规范化
    if (resolvedOrderNo) {
      resolvedOrderNo = String(resolvedOrderNo).replace(/[-_]/g, '');
    }

    const hasBundleMarker = !!resolvedBundleNo;
    const hasSkuMarker = !!resolvedColor && !!resolvedSize;
    const isOrderQR = !!resolvedOrderNo && !hasBundleMarker && !hasSkuMarker;

    let resolvedQuantity = ParserUtils.extractQuantity(
      qty,
      meta,
      ParserUtils.isPresent(code) ? String(code) : ''
    );
    if (isOrderQR && !ParserUtils.isPresent(qty)) {
      resolvedQuantity = null;
    }

    return {
      scanCode,
      quantity: resolvedQuantity,
      orderNo: resolvedOrderNo,
      orderId: resolvedOrderId,
      styleNo: resolvedStyleNo,
      color: resolvedColor,
      size: resolvedSize,
      bundleNo: resolvedBundleNo,
      isOrderQR,
    };
  }
}

module.exports = JSONCodeParser;
