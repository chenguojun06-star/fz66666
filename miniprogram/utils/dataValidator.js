/**
 * 小程序数据结构定义和验证
 * 确保与网页端数据格式保持一致
 */

/**
 * 生产订单数据结构定义
 * 注意：部分字段可能因历史数据或特殊情况为空，标记为非必填以保证兼容性
 */
const ProductionOrderShape = {
  id: { required: true, type: 'string' },
  orderNo: { required: true, type: 'string' },
  styleId: { type: 'string', default: '' }, // 可能为空
  styleNo: { type: 'string', default: '' }, // 可能为空（历史数据）
  styleName: { type: 'string', default: '' }, // 可能为空
  factoryId: { type: 'string', default: '' }, // 可能为空
  factoryName: { type: 'string', default: '' }, // 可能为空
  orderQuantity: { required: true, type: 'number', default: 0 },
  completedQuantity: { type: 'number', default: 0 },
  productionProgress: { type: 'number', default: 0 },
  status: { required: true, type: 'string' },

  // 关键: 进度流程定义 (JSON 字符串)
  progressWorkflowJson: { type: 'string', default: '{}' },
  progressWorkflowLocked: { type: 'number', default: 0 },
  progressWorkflowLockedAt: { type: 'string' },
  progressWorkflowLockedBy: { type: 'string' },
  progressWorkflowLockedByName: { type: 'string' },

  // 时间戳
  createTime: { type: 'string' },
  updateTime: { type: 'string' },
};

/**
 * 扫码记录数据结构定义
 */
const ScanRecordShape = {
  id: { required: true, type: 'string' },
  orderId: { required: true, type: 'string' },
  orderNo: { required: true, type: 'string' },
  styleId: { required: true, type: 'string' },
  styleNo: { required: true, type: 'string' },
  quantity: { required: true, type: 'number' },
  scanCode: { required: true, type: 'string' },
  scanTime: { type: 'string' },
  status: { type: 'string' },
};

/**
 * 验证单个字段
 * @param {*} value 字段值
 * @param {Object} rule 字段规则
 * @param {string} fieldName 字段名称
 * @returns {string|null} 错误信息或 null
 */
function validateField(value, rule, fieldName = '') {
  // 检查必需字段
  if (rule.required && (value === null || value === undefined || value === '')) {
    return `${fieldName} 不能为空`;
  }

  // 检查类型
  const valueType = typeof value;
  if (value !== null && value !== undefined) {
    if (rule.type === 'number' && valueType !== 'number') {
      return `${fieldName} 必须是数字类型`;
    }
    if (rule.type === 'string' && valueType !== 'string') {
      return `${fieldName} 必须是字符串类型`;
    }
    if (rule.type === 'object' && valueType !== 'object') {
      return `${fieldName} 必须是对象类型`;
    }
  }

  return null;
}

/**
 * 验证完整的数据对象
 * @param {Object} data 数据对象
 * @param {Object} shape 数据结构定义
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateDataShape(data, shape) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['数据必须是对象类型'] };
  }

  for (const [fieldName, rule] of Object.entries(shape)) {
    const value = data[fieldName];
    const error = validateField(value, rule, fieldName);

    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * 验证生产订单数据
 * @param {Object} order 订单对象
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateProductionOrder(order) {
  const result = validateDataShape(order, ProductionOrderShape);

  if (!result.valid) {
    return result;
  }

  // 额外的业务规则验证
  const additionalErrors = [];

  // 验证 progressWorkflowJson 格式
  if (order.progressWorkflowJson) {
    try {
      const parsed = JSON.parse(order.progressWorkflowJson);
      if (!Array.isArray(parsed.nodes)) {
        additionalErrors.push('progressWorkflowJson.nodes 必须是数组');
      }
    } catch (e) {
      additionalErrors.push(`progressWorkflowJson 格式不正确: ${e.message}`);
    }
  }

  // 验证进度值范围
  if (order.productionProgress < 0 || order.productionProgress > 100) {
    additionalErrors.push('productionProgress 必须在 0-100 之间');
  }

  // 验证数量关系
  if (order.completedQuantity > order.orderQuantity) {
    additionalErrors.push('completedQuantity 不能大于 orderQuantity');
  }

  return {
    valid: additionalErrors.length === 0,
    errors: additionalErrors,
  };
}

/**
 * 验证扫码记录数据
 * @param {Object} scan 扫码记录对象
 * @returns {Object} { valid: boolean, errors: Array<string> }
 */
function validateScanRecord(scan) {
  return validateDataShape(scan, ScanRecordShape);
}

/**
 * 安全获取嵌套属性
 * @param {Object} obj 对象
 * @param {string} path 路径，如 "order.id"
 * @param {*} fallback 默认值
 * @returns {*} 属性值或默认值
 */
function safeGet(obj, path, fallback = null) {
  try {
    const keys = String(path || '').split('.');
    let result = obj;
    for (const key of keys) {
      if (result && typeof result === 'object') {
        result = result[key];
      } else {
        return fallback;
      }
    }
    return result !== undefined ? result : fallback;
  } catch (e) {
    return fallback;
  }
}

/**
 * 规范化数据对象（填充默认值）
 * @param {Object} data 原始数据
 * @param {Object} shape 数据结构定义
 * @returns {Object} 规范化后的数据
 */
function normalizeData(data, shape) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const normalized = { ...data };

  for (const [fieldName, rule] of Object.entries(shape)) {
    const value = normalized[fieldName];

    // 如果字段为空且有默认值，使用默认值
    if ((value === null || value === undefined) && rule.default !== undefined) {
      normalized[fieldName] = rule.default;
    }
  }

  return normalized;
}

module.exports = {
  ProductionOrderShape,
  ScanRecordShape,
  validateField,
  validateDataShape,
  validateProductionOrder,
  validateScanRecord,
  safeGet,
  normalizeData,
};
