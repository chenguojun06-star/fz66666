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
  styleId: { type: 'string', default: '' },
  styleNo: { type: 'string', default: '' },
  styleName: { type: 'string', default: '' },
  factoryId: { type: 'string', default: '' },
  factoryName: { type: 'string', default: '' },
  orderQuantity: { required: true, type: 'number', default: 0 },
  completedQuantity: { type: 'number', default: 0 },
  productionProgress: { type: 'number', default: 0 },
  status: { required: true, type: 'string' },

  progressWorkflowJson: { required: false, default: {} },
  progressWorkflowLocked: { type: 'number', default: 0 },
  progressWorkflowLockedAt: { type: 'string' },
  progressWorkflowLockedBy: { type: 'string' },
  progressWorkflowLockedByName: { type: 'string' },

  createTime: { type: 'string' },
  updateTime: { type: 'string' },
};

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

function validateField(value, rule, fieldName) {
  if (rule.required && (value === null || value === undefined || value === '')) {
    return fieldName + ' 不能为空';
  }

  const valueType = typeof value;
  if (value !== null && value !== undefined) {
    if (rule.type === 'number' && valueType !== 'number') {
      return fieldName + ' 必须是数字类型';
    }
    if (rule.type === 'string' && valueType !== 'string') {
      return fieldName + ' 必须是字符串类型';
    }
    if (rule.type === 'object' && valueType !== 'object') {
      return fieldName + ' 必须是对象类型';
    }
  }

  return null;
}

function validateDataShape(data, shape) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['数据必须是对象类型'] };
  }

  for (const fieldName in shape) {
    if (shape.hasOwnProperty(fieldName)) {
      const rule = shape[fieldName];
      const value = data[fieldName];
      const error = validateField(value, rule, fieldName);

      if (error) {
        errors.push(error);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors,
  };
}

function validateProductionOrder(order) {
  const result = validateDataShape(order, ProductionOrderShape);

  if (!result.valid) {
    return result;
  }

  const additionalErrors = [];

  if (order.progressWorkflowJson) {
    try {
      let parsed = order.progressWorkflowJson;
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed);
      }
      if (typeof parsed !== 'object' || parsed === null) {
        additionalErrors.push('progressWorkflowJson 必须是对象或JSON字符串');
      } else if (parsed.nodes !== undefined && !Array.isArray(parsed.nodes)) {
        additionalErrors.push('progressWorkflowJson.nodes 必须是数组');
      }
    } catch (e) {
      additionalErrors.push('progressWorkflowJson 格式不正确: ' + (e.message || e));
    }
  }

  if (order.productionProgress < 0 || order.productionProgress > 100) {
    additionalErrors.push('productionProgress 必须在 0-100 之间');
  }

  if (order.completedQuantity > order.orderQuantity) {
    additionalErrors.push('completedQuantity 不能大于 orderQuantity');
  }

  return {
    valid: additionalErrors.length === 0,
    errors: additionalErrors,
  };
}

function validateScanRecord(scan) {
  return validateDataShape(scan, ScanRecordShape);
}

function safeGet(obj, path, fallback) {
  try {
    const keys = String(path || '').split('.');
    let result = obj;
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (result && typeof result === 'object') {
        result = result[key];
      } else {
        return fallback !== undefined ? fallback : null;
      }
    }
    return result !== undefined ? result : (fallback !== undefined ? fallback : null);
  } catch (e) {
    return fallback !== undefined ? fallback : null;
  }
}

function normalizeData(data, shape) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const normalized = {};
  for (const key in data) {
    if (data.hasOwnProperty(key)) {
      normalized[key] = data[key];
    }
  }

  for (const fieldName in shape) {
    if (shape.hasOwnProperty(fieldName)) {
      const rule = shape[fieldName];
      const value = normalized[fieldName];

      if ((value === null || value === undefined) && rule.default !== undefined) {
        normalized[fieldName] = rule.default;
      }
    }
  }

  return normalized;
}

module.exports = {
  ProductionOrderShape: ProductionOrderShape,
  ScanRecordShape: ScanRecordShape,
  validateField: validateField,
  validateDataShape: validateDataShape,
  validateProductionOrder: validateProductionOrder,
  validateScanRecord: validateScanRecord,
  safeGet: safeGet,
  normalizeData: normalizeData,
};
