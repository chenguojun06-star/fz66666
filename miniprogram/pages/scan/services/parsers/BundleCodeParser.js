/**
 * 菲号解析器
 * 从 QRCodeParser.js 提取菲号解析逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module BundleCodeParser
 * @description 解析菲号格式二维码：PO20260122001-ST001-黑色-L-50-01
 */

const ParserUtils = require('./ParserUtils');

class BundleCodeParser {
  /**
   * 解析菲号格式
   * 支持格式：
   * 1. 标准格式：PO20260122001-ST001-黑色-L-50-01
   * 2. 无ST前缀：PO20260122001-001-黑色-L-50-01
   * 3. 简化格式：PO20260122001-ST001-黑色-L-50
   * 4. SKU格式：PO20260122001-ST001-黑色-L
   *
   * @param {string} text - 待解析文本
   * @returns {Object|null} 菲号信息或null
   */
  static parse(text) {
    const raw = (text || '').toString().trim();
    if (!raw) {
      return null;
    }

    // 统一分隔符：将全角横线转为半角
    const normalized = raw.replace(/[\u2013\u2014]/g, '-');

    // 按分隔符拆分，过滤空白
    const parts = normalized
      .split('-')
      .map(p => (p === null ? '' : String(p)).trim())
      .filter(p => p);

    // 至少需要3个部分：订单号-款号-颜色
    if (parts.length < 3) {
      return null;
    }

    // 查找ST款号的位置
    const stIdx = BundleCodeParser.findStyleIndex(parts);

    // 如果找不到ST，尝试按位置解析
    if (stIdx < 0) {
      return BundleCodeParser.parseByPosition(parts);
    }

    // 找到ST后按标准格式解析
    return BundleCodeParser.parseWithStyleIndex(parts, stIdx);
  }

  /**
   * 查找款号（ST开头）的索引
   * @param {string[]} parts - 分割后的部分
   * @returns {number} 索引，未找到返回-1
   */
  static findStyleIndex(parts) {
    return ParserUtils.findIndexByPrefix(parts, 'ST');
  }

  /**
   * 查找PO订单号的索引
   * @param {string[]} parts - 分割后的部分
   * @returns {number} 索引，未找到返回-1
   */
  static findOrderIndex(parts) {
    return ParserUtils.findIndexByPrefix(parts, 'PO');
  }

  /**
   * 按位置解析菲号（当找不到ST款号标识时）
   * 假定格式：订单号-款号-颜色-尺码-数量-菲号序号
   * @param {string[]} parts - 分割后的部分
   * @returns {Object|null} 解析结果
   */
  static parseByPosition(parts) {
    // 至少需要6个部分
    if (parts.length < 6) {
      return null;
    }

    const orderNo = (parts[0] || '').trim();
    const styleNo = (parts[1] || '').trim();

    if (!orderNo || !styleNo) {
      return null;
    }

    return {
      orderNo,
      styleNo,
      color: (parts[2] || '').trim(),
      size: (parts[3] || '').trim(),
      quantity: ParserUtils.parsePositiveInt(parts[4]),
      bundleNo: ParserUtils.parsePositiveInt(parts[5]),
    };
  }

  /**
   * 根据ST款号位置解析菲号
   * @param {string[]} parts - 分割后的部分
   * @param {number} stIdx - ST款号的索引
   * @returns {Object|null} 解析结果
   */
  static parseWithStyleIndex(parts, stIdx) {
    // 查找订单号
    const poIdx = BundleCodeParser.findOrderIndex(parts);
    const orderNo = (poIdx >= 0 ? parts[poIdx] : parts[stIdx - 1]) || '';
    const styleNo = parts[stIdx] || '';

    // 解析尾部
    const tail = parts.slice(stIdx + 1);
    const { color, size, quantity, bundleNo } = BundleCodeParser.parseTail(tail);

    // 构建结果
    const result = {
      orderNo: orderNo.trim(),
      styleNo: styleNo.trim(),
      color: color.trim(),
      size: (size || '').trim(),
      quantity,
      bundleNo,
    };

    // 验证
    if (!result.orderNo || !result.styleNo) {
      return null;
    }

    return result;
  }

  /**
   * 解析菲号尾部（颜色-尺码-数量-菲号）
   * 支持多种格式：
   * 1. 完整菲号：颜色-尺码-数量-菲号序号（4+部分）
   * 2. 无菲号序号：颜色-尺码-数量（3部分）
   * 3. SKU格式：颜色-尺码（2部分）
   * 4. 仅颜色：颜色（1部分）
   *
   * @param {string[]} tail - 尾部部分（ST之后的所有部分）
   * @returns {Object} 解析结果 { color, size, quantity, bundleNo }
   */
  static parseTail(tail) {
    let color = '';
    let size = '';
    let quantity = null;
    let bundleNo = null;

    if (tail.length >= 3) {
      const last = ParserUtils.parsePositiveInt(tail[tail.length - 1]);
      const secondLast = ParserUtils.parsePositiveInt(tail[tail.length - 2]);

      if (last !== null && secondLast !== null) {
        // 两个数字：菲号 + 数量
        bundleNo = last;
        quantity = secondLast;
        size = tail[tail.length - 3] || '';
        color = tail.slice(0, -3).join('-');
      } else if (last !== null) {
        // 一个数字：数量
        quantity = last;
        size = tail[tail.length - 2] || '';
        color = tail.slice(0, -2).join('-');
      } else {
        // 无数字：颜色-尺码-其他
        size = tail[tail.length - 1] || '';
        color = tail.slice(0, -1).join('-');
      }
    } else if (tail.length >= 2) {
      // SKU格式（颜色-尺码）
      const potentialSize = tail[tail.length - 1];
      if (potentialSize.length <= 10) {
        size = potentialSize;
        color = tail.slice(0, -1).join('-');
      } else {
        // 尺码太长，可能是颜色的一部分
        color = tail.join('-');
      }
    }

    // 默认颜色
    if (!color && tail.length) {
      color = tail[0] || '';
    }

    return { color, size, quantity, bundleNo };
  }
}

module.exports = BundleCodeParser;
