/**
 * 解析器工具类
 * 从 QRCodeParser.js 提取通用工具方法
 *
 * @version 2.3
 * @date 2026-02-15
 * @module ParserUtils
 * @description 提供解析器共用的工具函数
 */

class ParserUtils {
  /**
   * 解析正整数
   * @param {any} v - 待解析值
   * @returns {number|null} 正整数或null
   */
  static parsePositiveInt(v) {
    const s = (v === null ? '' : String(v)).trim();
    if (!/^\d{1,9}$/.test(s)) {
      return null;
    }

    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }

    return Math.floor(n);
  }

  /**
   * 从文本中提取数量
   * @param {string} text - 待解析文本
   * @returns {number|null} 数量或null
   */
  static parseQuantityFromText(text) {
    const s = (text || '').toString().trim();
    if (!s) {
      return null;
    }

    // 修复: 增加安全检查，防止 s.match 报错
    if (typeof s.match !== 'function') {
      return null;
    }
    const m = s.match(/\d+/);
    if (!m) {
      return null;
    }

    const n = Number(m[0]);
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }

    return Math.floor(n);
  }

  /**
   * 提取数量字段（优先级：直接值 > 菲号解析 > 文本提取）
   * @param {any} qty - 数量值
   * @param {Object} meta - 菲号解析结果
   * @param {string} raw - 原始文本
   * @returns {number|null} 数量
   */
  static extractQuantity(qty, meta, raw) {
    const qn = Number(qty);
    if (Number.isFinite(qn) && qn > 0) {
      return Math.floor(qn);
    }
    if (meta && meta.quantity !== null) {
      return meta.quantity;
    }
    return ParserUtils.parseQuantityFromText(raw);
  }

  /**
   * 提取字段值（优先级：直接值 > 菲号解析）
   * @param {any} value - 字段值
   * @param {Object} meta - 菲号解析结果
   * @param {string} field - 字段名
   * @returns {string} 字段值
   */
  static extractField(value, meta, field) {
    if (ParserUtils.isPresent(value)) {
      const str = String(value).trim();
      // bundleNo特殊处理：可能是数字
      if (field === 'bundleNo') {
        return str;
      }
      return str;
    }
    if (meta && meta[field] !== null) {
      return field === 'bundleNo' ? String(meta[field]) : meta[field];
    }
    return '';
  }

  /**
   * 判断值是否为有效字段（排除 null/undefined/空串/"undefined"/"null"）
   * @param {any} value - 待判断值
   * @returns {boolean}
   */
  static isPresent(value) {
    if (value === null || value === undefined) {
      return false;
    }
    const str = String(value).trim();
    if (!str) {
      return false;
    }
    const lower = str.toLowerCase();
    return lower !== 'undefined' && lower !== 'null';
  }

  /**
   * 返回空结果
   * @returns {Object} 空结果对象
   */
  static emptyResult() {
    return {
      scanCode: '',
      quantity: null,
      orderNo: '',
      styleNo: '',
      color: '',
      size: '',
      bundleNo: '',
      isOrderQR: false,
    };
  }

  /**
   * 根据前缀查找索引（消除重复代码）
   * @param {string[]} parts - 分割后的部分
   * @param {string} prefix - 前缀
   * @returns {number} 索引，未找到返回-1
   */
  static findIndexByPrefix(parts, prefix) {
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) {
        continue;
      }
      if (String(part).toUpperCase().startsWith(prefix.toUpperCase())) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 从对象中提取第一个存在的字段值
   * @param {Object} obj - 对象
   * @param {...string} keys - 候选字段名
   * @returns {any} 字段值
   */
  static getField(obj, ...keys) {
    for (const key of keys) {
      if (obj[key]) {
        return obj[key];
      }
    }
    return undefined;
  }
}

module.exports = ParserUtils;
