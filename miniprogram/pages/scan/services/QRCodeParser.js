/**
 * 二维码解析服务
 *
 * 功能：
 * 1. 解析菲号（Bundle）二维码：PO20260122001-ST001-黑色-L-50-01
 * 2. 解析订单二维码：PO20260122001 或 {"type":"order","orderNo":"PO20260122001"}
 * 3. 解析JSON格式二维码：{"scanCode":"xxx","quantity":10,...}
 * 4. 解析URL参数格式：?scanCode=xxx&quantity=10
 *
 * 使用示例：
 * const parser = new QRCodeParser();
 * const result = parser.parse('PO20260122001-ST001-黑色-L-50-01');
 * // result: { orderNo, styleNo, color, size, quantity, bundleNo, scanCode, isOrderQR }
 *
 * @author GitHub Copilot
 * @date 2026-01-23
 */

class QRCodeParser {
  constructor() {
    // 订单号正则：PO + 至少8位数字/字母，支持分隔符 - 或 _
    this.orderNoPattern = /^PO[-_]?[0-9A-Z]{8,}$/i;
  }

  /**
   * 主解析方法 - 统一入口
   * @param {string} rawScanCode - 扫描的原始内容
   * @returns {Object} 解析结果
   * @returns {boolean} result.success - 是否成功解析
   * @returns {string} result.message - 提示消息
   * @returns {Object} result.data - 解析后的数据
   * @returns {string} result.data.scanCode - 扫描码
   * @returns {number|null} result.data.quantity - 数量
   * @returns {string} result.data.orderNo - 订单号
   * @returns {string} result.data.styleNo - 款号
   * @returns {string} result.data.color - 颜色
   * @returns {string} result.data.size - 尺码
   * @returns {string} result.data.bundleNo - 菲号序号
   * @returns {boolean} result.data.isOrderQR - 是否为订单级别二维码
   */

  /**
   * 预处理扫码内容，提取SKU编号
   * @private
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
        parseTarget = parts[0];
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
   */
  _tryParseFormats(parseTarget, first, skuNo, rawScanCode) {
    // 1. JSON格式
    if (first === '{' || first === '[') {
      const jsonResult = this._parseJSON(parseTarget);
      if (jsonResult) {
        if (skuNo) {jsonResult.skuNo = skuNo;}
        return { success: true, message: '解析成功 (JSON)', data: jsonResult };
      }
    }

    // 2. URL参数格式
    const urlResult = this._parseURLParams(parseTarget);
    if (urlResult) {
      if (skuNo) {urlResult.skuNo = skuNo;}
      return { success: true, message: '解析成功 (URL)', data: urlResult };
    }

    // 3. 菲号格式（🔧 修复：使用原始完整扫码内容作为 scanCode）
    const bundleResult = this._parseFeiNo(parseTarget);
    if (bundleResult) {
      return this._buildBundleResult(bundleResult, rawScanCode, skuNo);
    }

    // 4. 订单号格式
    const orderResult = this._parseOrderNo(parseTarget);
    if (orderResult) {
      if (skuNo) {orderResult.skuNo = skuNo;}
      return { success: true, message: '解析成功 (订单号)', data: orderResult };
    }

    return null;
  }

  /**
   * 构建菲号解析结果
   * @private
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

  /**
   * 解析二维码内容（主函数）
   * @param {string} rawScanCode - 原始扫描码
   * @returns {Object} 包含 success, message, data 的解析结果
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
    if (result) {return result;}

    // 无法识别
    return {
      success: false,
      message: '无法识别的二维码格式',
      data: {
        scanCode: raw,
        quantity: this._parseQuantityFromText(parseTarget),
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
   * 解析菲号格式
   * 支持格式：
   * 1. 标准格式：PO20260122001-ST001-黑色-L-50-01
   * 2. 无ST前缀：PO20260122001-001-黑色-L-50-01
   * 3. 简化格式：PO20260122001-ST001-黑色-L-50
   *
   * @private
   * @param {string} text - 待解析文本
   * @returns {Object|null} 菲号信息或null
   */
  _parseFeiNo(text) {
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
    const stIdx = this._findStyleIndex(parts);

    // 如果找不到ST，尝试按位置解析
    if (stIdx < 0) {
      return this._parseFeiNoByPosition(parts);
    }

    // 找到ST后按标准格式解析
    return this._parseFeiNoWithStyleIndex(parts, stIdx);
  }

  /**
   * 通用：根据前缀查找索引（消除重复代码）
   * @private
   * @param {string[]} parts - 分割后的部分
   * @param {string} prefix - 前缀
   * @returns {number} 索引，未找到返回-1
   */
  _findIndexByPrefix(parts, prefix) {
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
   * 构建解析结果对象（消除重复代码）
   * @private
   * @param {Object} params - 包含 code, qty, orderNo, styleNo, color, size, bundleNo
   * @param {string} raw - 原始字符串
   * @returns {Object} 解析结果
   */
  _buildParseResult({ code, qty, orderNo, styleNo, color, size, bundleNo }, raw) {
    const meta = code ? this._parseFeiNo(code) : null;
    return {
      scanCode: code !== null && String(code).trim() ? String(code).trim() : raw,
      quantity: this._extractQuantity(qty, meta, raw),
      orderNo: this._extractField(orderNo, meta, 'orderNo'),
      styleNo: this._extractField(styleNo, meta, 'styleNo'),
      color: this._extractField(color, meta, 'color'),
      size: this._extractField(size, meta, 'size'),
      bundleNo: this._extractField(bundleNo, meta, 'bundleNo'),
      isOrderQR: false,
    };
  }

  /**
   * 查找款号（ST开头）的索引
   * @private
   * @param {string[]} parts - 分割后的部分
   * @returns {number} 索引，未找到返回-1
   */
  _findStyleIndex(parts) {
    return this._findIndexByPrefix(parts, 'ST');
  }

  /**
   * 查找PO订单号的索引
   * @private
   * @param {string[]} parts - 分割后的部分
   * @returns {number} 索引，未找到返回-1
   */
  _findOrderIndex(parts) {
    return this._findIndexByPrefix(parts, 'PO');
  }

  /**
   * 按位置解析菲号（当找不到ST款号标识时）
   * 假定格式：订单号-款号-颜色-尺码-数量-菲号序号
   * @private
   * @param {string[]} parts - 分割后的部分
   * @returns {Object|null} 解析结果
   */
  _parseFeiNoByPosition(parts) {
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
      quantity: this._parsePositiveInt(parts[4]),
      bundleNo: this._parsePositiveInt(parts[5]),
    };
  }

  /**
   * 根据ST款号位置解析菲号
   * @private
   * @param {string[]} parts - 分割后的部分
   * @param {number} stIdx - ST款号的索引
   * @returns {Object|null} 解析结果
   */

  /**
   * 解析菲号尾部（颜色-尺码-数量-菲号）
   * @private
   */
  _parseFeiNoTail(tail) {
    let color = '';
    let size = '';
    let quantity = null;
    let bundleNo = null;

    if (tail.length >= 3) {
      const last = this._parsePositiveInt(tail[tail.length - 1]);
      const secondLast = this._parsePositiveInt(tail[tail.length - 2]);

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
      }
    } else if (tail.length >= 2) {
      // SKU格式（颜色-尺码）
      const potentialSize = tail[tail.length - 1];
      if (potentialSize.length <= 10) {
        size = potentialSize;
        color = tail.slice(0, -1).join('-');
      }
    }

    // 默认颜色
    if (!color && tail.length) {
      color = tail[0] || '';
    }

    return { color, size, quantity, bundleNo };
  }

  /**
   * 根据ST款号位置解析菲号
   * @private
   * @param {string[]} parts - 分割后的部分
   * @param {number} stIdx - ST款号的索引
   * @returns {Object|null} 解析结果
   */
  _parseFeiNoWithStyleIndex(parts, stIdx) {
    // 查找订单号
    const poIdx = this._findOrderIndex(parts);
    const orderNo = (poIdx >= 0 ? parts[poIdx] : parts[stIdx - 1]) || '';
    const styleNo = parts[stIdx] || '';

    // 解析尾部
    const tail = parts.slice(stIdx + 1);
    const { color, size, quantity, bundleNo } = this._parseFeiNoTail(tail);

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
   * 解析JSON格式二维码
   * 支持格式：
   * 1. {"type":"order","orderNo":"PO20260122001"}
   * 2. {"scanCode":"xxx","quantity":10,...}
   *
   * @private
   * @param {string} raw - JSON字符串
   * @returns {Object|null} 解析结果
   */

  /**
   * 检查并处理订单类型JSON
   * @private
   */
  _handleOrderTypeJSON(obj) {
    if (obj.type === 'order' && obj.orderNo) {
      return {
        scanCode: obj.orderNo,
        quantity: null,
        orderNo: String(obj.orderNo).trim(),
        styleNo: obj.styleNo ? String(obj.styleNo).trim() : '',
        color: '',
        size: '',
        bundleNo: '',
        isOrderQR: true,
      };
    }
    return null;
  }

  /**
   * 从对象中提取第一个存在的字段值
   * @private
   */
  _getField(obj, ...keys) {
    for (const key of keys) {
      if (obj[key]) {return obj[key];}
    }
    return undefined;
  }

  /**
   * 提取JSON字段（支持多种别名）
   * @private
   */
  _extractJSONFields(obj) {
    return {
      code: this._getField(obj, 'scanCode', 'code', 'qr', 'value', 'data'),
      qty: this._getField(obj, 'quantity', 'qty', 'num', 'count'),
      orderNo: this._getField(obj, 'orderNo', 'po', 'order', 'productionOrderNo'),
      styleNo: this._getField(obj, 'styleNo', 'st', 'style', 'styleNumber'),
      color: obj.color,
      size: obj.size,
      bundleNo: this._getField(obj, 'bundleNo', 'cuttingBundleNo', 'bundle'),
    };
  }

  /**
   * 解析JSON格式二维码
   * 支持格式：
   * 1. {"type":"order","orderNo":"PO20260122001"}
   * 2. {"scanCode":"xxx","quantity":10,...}
   *
   * @private
   * @param {string} raw - JSON字符串
   * @returns {Object|null} 解析结果
   */
  _parseJSON(raw) {
    try {
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') {
        return null;
      }

      // 检查订单类型
      const orderResult = this._handleOrderTypeJSON(obj);
      if (orderResult) {return orderResult;}

      // 提取字段并构建结果
      const fields = this._extractJSONFields(obj);
      return this._buildParseResult(fields, raw);
    } catch (e) {
      return null;
    }
  }


  /**
   * 解析URL参数格式二维码
   * 支持格式：?scanCode=xxx&quantity=10&orderNo=xxx
   *
   * @private
   * @param {string} raw - URL参数字符串
   * @returns {Object|null} 解析结果
   */
  _parseURLParams(raw) {
    const params = this._tryParseQueryParams(raw);
    if (!params) {
      return null;
    }

    const code = params.scanCode || params.code || params.qr || params.value;
    const qty = params.quantity || params.qty || params.num || params.count;
    const orderNo = params.orderNo || params.po || params.order;
    const styleNo = params.styleNo || params.st || params.style;
    const color = params.color;
    const size = params.size;
    const bundleNo = params.bundleNo || params.cuttingBundleNo || params.bundle;

    return this._buildParseResult({ code, qty, orderNo, styleNo, color, size, bundleNo }, raw);
  }

  /**
   * 解析订单号格式二维码
   * 格式：PO20260122001, PO2026-0122-001, PO_20260122001
   *
   * @private
   * @param {string} raw - 原始文本
   * @returns {Object|null} 解析结果
   */
  _parseOrderNo(raw) {
    if (!this.orderNoPattern.test(raw)) {
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
   * 尝试解析URL参数格式
   * @private
   * @param {string} text - 待解析文本
   * @returns {Object|null} 参数对象
   */
  _tryParseQueryParams(text) {
    const s = (text || '').toString().trim();
    if (!s || !s.includes('=')) {
      return null;
    }

    // 移除开头的?或#
    const clean = s.replace(/^[?#]/, '');
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

  /**
   * 解析正整数
   * @private
   * @param {any} v - 待解析值
   * @returns {number|null} 正整数或null
   */
  _parsePositiveInt(v) {
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
   * @private
   * @param {string} text - 待解析文本
   * @returns {number|null} 数量或null
   */
  _parseQuantityFromText(text) {
    const s = (text || '').toString().trim();
    if (!s) {
      return null;
    }

    // 匹配数字
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
   * @private
   * @param {any} qty - 数量值
   * @param {Object} meta - 菲号解析结果
   * @param {string} raw - 原始文本
   * @returns {number|null} 数量
   */
  _extractQuantity(qty, meta, raw) {
    const qn = Number(qty);
    if (Number.isFinite(qn) && qn > 0) {
      return Math.floor(qn);
    }
    if (meta && meta.quantity !== null) {
      return meta.quantity;
    }
    return this._parseQuantityFromText(raw);
  }

  /**
   * 提取字段值（优先级：直接值 > 菲号解析）
   * @private
   * @param {any} value - 字段值
   * @param {Object} meta - 菲号解析结果
   * @param {string} field - 字段名
   * @returns {string} 字段值
   */
  _extractField(value, meta, field) {
    if (value !== null && String(value).trim()) {
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
   * 返回空结果
   * @private
   * @returns {Object} 空结果对象
   */
  _emptyResult() {
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
}

// 导出单例
module.exports = new QRCodeParser();
