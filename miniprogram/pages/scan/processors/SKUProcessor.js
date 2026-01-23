/**
 * SKU处理器 - 统一SKU相关的所有逻辑
 * 
 * 职责:
 * 1. SKU的定义和规范化
 * 2. SKU列表的处理和转换
 * 3. SKU的数量管理
 * 4. SKU和菲号的关联
 * 
 * @module SKUProcessor
 * @date 2026-01-23
 */

/**
 * SKU标准格式
 * @typedef {Object} SKU
 * @property {string} styleNo - 款号 (如: PO20260122001)
 * @property {string} color - 颜色 (如: 黑色)
 * @property {string} size - 尺码 (如: L)
 * @property {number} totalQuantity - 订单数量
 * @property {number} completedQuantity - 已完成数量
 * @property {number} pendingQuantity - 待完成数量
 * @property {string} orderNo - 所属订单号
 * @property {string} [bundleNo] - 关联菲号
 */

/**
 * 订单明细项 (来自后端)
 * @typedef {Object} OrderItem
 * @property {string} color - 颜色
 * @property {string} size - 尺码
 * @property {number} quantity - 数量
 * @property {number} [completedQty] - 已完成数
 * @property {number} [num] - 备用字段
 */

/**
 * 菲号
 * @typedef {Object} Bundle
 * @property {string} bundleNo - 菲号 (PO-颜色-序列号)
 * @property {string} orderNo - 订单号
 * @property {string} color - 颜色
 * @property {string[]} sizeList - 尺码列表
 * @property {number} quantity - 总数量
 */

const SKUProcessor = {
  /**
   * 判断是否为有效的SKU标识
   * @param {string} color - 颜色
   * @param {string} size - 尺码
   * @returns {boolean}
   */
  isValidSKU(color, size) {
    return Boolean(color && color.trim() && size && size.trim());
  },

  /**
   * 创建SKU的唯一键 (用于去重和查找)
   * @param {string} color - 颜色
   * @param {string} size - 尺码
   * @returns {string} 格式: "颜色|尺码"
   */
  generateSKUKey(color, size) {
    return `${color.trim()}|${size.trim()}`;
  },

  /**
   * 从SKU键反解出color和size
   * @param {string} skuKey - SKU键
   * @returns {{color: string, size: string}} 
   */
  parseSKUKey(skuKey) {
    const [color, size] = skuKey.split('|');
    return { color, size };
  },

  /**
   * 规范化订单明细为标准SKU列表
   * @param {OrderItem[]} items - 来自后端的订单明细
   * @param {string} orderNo - 订单号
   * @param {string} styleNo - 款号
   * @returns {SKU[]} 标准SKU列表
   */
  normalizeOrderItems(items, orderNo, styleNo) {
    if (!Array.isArray(items)) return [];

    return items.map(item => ({
      styleNo: styleNo || '',
      color: item.color || '',
      size: item.size || '',
      totalQuantity: item.quantity || item.num || 0,
      completedQuantity: item.completedQty || 0,
      pendingQuantity: (item.quantity || item.num || 0) - (item.completedQty || 0),
      orderNo: orderNo || '',
      bundleNo: item.bundleNo || null
    }));
  },

  /**
   * 构建SKU输入表单数据 (用于扫码弹窗)
   * @param {SKU[]} skuList - SKU列表
   * @returns {Object[]} 表单项列表
   */
  buildSKUInputList(skuList) {
    if (!Array.isArray(skuList)) return [];

    return skuList.map((sku, idx) => ({
      id: idx,
      label: `${sku.color}/${sku.size}`,
      color: sku.color,
      size: sku.size,
      totalQuantity: sku.totalQuantity,
      defaultQuantity: sku.totalQuantity, // 默认填充为总数
      inputQuantity: sku.totalQuantity, // 用户输入的数量
      skuKey: this.generateSKUKey(sku.color, sku.size)
    }));
  },

  /**
   * 验证SKU输入的数量
   * @param {Object} skuInput - SKU输入项
   * @returns {{valid: boolean, error?: string}}
   */
  validateSKUInput(skuInput) {
    if (!skuInput) {
      return { valid: false, error: '缺少SKU数据' };
    }

    const quantity = Number(skuInput.inputQuantity);

    if (!Number.isFinite(quantity) || quantity < 0) {
      return { valid: false, error: `数量${skuInput.label}无效` };
    }

    if (quantity > skuInput.totalQuantity) {
      return {
        valid: false,
        error: `${skuInput.label}数量(${quantity})超过订单数量(${skuInput.totalQuantity})`
      };
    }

    return { valid: true };
  },

  /**
   * 批量验证SKU输入
   * @param {Object[]} skuInputList - SKU输入列表
   * @returns {{valid: boolean, errors: string[], validList: Object[]}}
   */
  validateSKUInputBatch(skuInputList) {
    const errors = [];
    const validList = [];

    if (!Array.isArray(skuInputList) || skuInputList.length === 0) {
      return {
        valid: false,
        errors: ['请至少输入一个SKU数量'],
        validList: []
      };
    }

    for (const input of skuInputList) {
      const result = this.validateSKUInput(input);
      if (!result.valid) {
        errors.push(result.error);
      } else {
        validList.push(input);
      }
    }

    if (validList.length === 0) {
      return {
        valid: false,
        errors: errors.length > 0 ? errors : ['没有有效的SKU输入'],
        validList: []
      };
    }

    return {
      valid: errors.length === 0, // 可能有部分有效
      errors: errors,
      validList: validList
    };
  },

  /**
   * 从SKU输入列表生成扫码请求列表
   * @param {Object[]} skuInputList - SKU输入列表
   * @param {string} orderNo - 订单号
   * @param {string} styleNo - 款号
   * @param {string} processNode - 工序名
   * @returns {Object[]} 扫码请求列表
   */
  generateScanRequests(skuInputList, orderNo, styleNo, processNode) {
    return skuInputList
      .filter(input => Number(input.inputQuantity) > 0)
      .map(input => ({
        orderNo: orderNo,
        styleNo: styleNo,
        color: input.color,
        size: input.size,
        quantity: Number(input.inputQuantity),
        processNode: processNode,
        action: 'scan'
      }));
  },

  /**
   * 从菲号解析出SKU信息
   * @param {string} bundleNo - 菲号 (格式: PO20260122001-黑色-01)
   * @returns {{orderNo: string, color: string, bundleNo: string} | null}
   */
  parseBundleNo(bundleNo) {
    if (!bundleNo) return null;

    // 格式: PO20260122001-黑色-01
    const match = bundleNo.match(/^(PO\d+)-(.+)-(\d{2})$/);
    if (!match) return null;

    return {
      orderNo: match[1],
      color: match[2],
      batchNo: match[3],
      bundleNo: bundleNo
    };
  },

  /**
   * 检查SKU是否已完成
   * @param {SKU} sku - SKU对象
   * @returns {boolean}
   */
  isSkuCompleted(sku) {
    return sku.completedQuantity >= sku.totalQuantity;
  },

  /**
   * 检查所有SKU是否都已完成
   * @param {SKU[]} skuList - SKU列表
   * @returns {boolean}
   */
  areAllSkusCompleted(skuList) {
    if (!Array.isArray(skuList) || skuList.length === 0) {
      return false;
    }
    return skuList.every(sku => this.isSkuCompleted(sku));
  },

  /**
   * 计算SKU列表的总进度
   * @param {SKU[]} skuList - SKU列表
   * @returns {{totalQuantity: number, completedQuantity: number, progress: number}}
   */
  calculateProgress(skuList) {
    if (!Array.isArray(skuList) || skuList.length === 0) {
      return {
        totalQuantity: 0,
        completedQuantity: 0,
        progress: 0
      };
    }

    const totalQuantity = skuList.reduce((sum, sku) => sum + sku.totalQuantity, 0);
    const completedQuantity = skuList.reduce((sum, sku) => sum + sku.completedQuantity, 0);
    const progress = totalQuantity > 0 ? Math.round((completedQuantity / totalQuantity) * 100) : 0;

    return {
      totalQuantity,
      completedQuantity,
      progress
    };
  },

  /**
   * 格式化SKU显示
   * @param {SKU} sku - SKU对象
   * @returns {string} 格式: "颜色 / 尺码 (已完成/总数)"
   */
  formatSKUDisplay(sku) {
    const label = `${sku.color} / ${sku.size}`;
    const progress = `${sku.completedQuantity}/${sku.totalQuantity}`;
    return `${label} (${progress})`;
  },

  /**
   * 排序SKU列表
   * @param {SKU[]} skuList - SKU列表
   * @param {string} [sortBy='color'] - 排序字段 ('color', 'size', 'progress')
   * @returns {SKU[]} 排序后的列表
   */
  sortSKUList(skuList, sortBy = 'color') {
    const copy = [...skuList];

    switch (sortBy) {
      case 'color':
        return copy.sort((a, b) => a.color.localeCompare(b.color, 'zh'));

      case 'size':
        return copy.sort((a, b) => a.size.localeCompare(b.size, 'en'));

      case 'progress':
        return copy.sort((a, b) => {
          const progressA = a.completedQuantity / a.totalQuantity;
          const progressB = b.completedQuantity / b.totalQuantity;
          return progressA - progressB; // 未完成的在前
        });

      default:
        return copy;
    }
  },

  /**
   * 获取SKU统计摘要
   * @param {SKU[]} skuList - SKU列表
   * @returns {Object} 统计摘要
   */
  getSummary(skuList) {
    const { totalQuantity, completedQuantity, progress } = this.calculateProgress(skuList);
    const completedCount = skuList.filter(sku => this.isSkuCompleted(sku)).length;
    const pendingCount = skuList.length - completedCount;

    return {
      totalSKUs: skuList.length,
      completedSKUs: completedCount,
      pendingSKUs: pendingCount,
      totalQuantity: totalQuantity,
      completedQuantity: completedQuantity,
      pendingQuantity: totalQuantity - completedQuantity,
      overallProgress: progress
    };
  }
};

module.exports = SKUProcessor;
