/**
 * 统一的表单验证工具
 * 避免重复的验证代码
 */

const { toast } = require('./uiHelper');

/**
 * 验证多个字段
 * @param {Array<Object>} rules - 验证规则数组
 * @param {any} rules[].value - 要验证的值
 * @param {string} rules[].message - 验证失败时的提示信息
 * @param {Function} [rules[].validator] - 自定义验证函数，返回true表示通过
 * @param {boolean} [showToast=true] - 是否显示错误提示
 * @returns {boolean} - 是否全部验证通过
 *
 * @example
 * const valid = validateFields([
 *   { value: orderId, message: '请选择订单' },
 *   { value: progress, message: '请输入进度' },
 *   { value: quantity, message: '数量必须大于0', validator: val => val > 0 }
 * ]);
 * if (!valid) return;
 */
function validateFields(rules, showToast = true) {
  for (const rule of rules) {
    // 基本的非空验证
    const isEmpty =
      rule.value === null ||
      rule.value === undefined ||
      rule.value === '' ||
      (Array.isArray(rule.value) && rule.value.length === 0);

    if (isEmpty) {
      if (showToast) {
        toast.error(rule.message);
      }
      return false;
    }

    // 自定义验证器
    if (rule.validator && typeof rule.validator === 'function') {
      if (!rule.validator(rule.value)) {
        if (showToast) {
          toast.error(rule.message);
        }
        return false;
      }
    }
  }

  return true;
}

/**
 * 验证单个字段
 * @param {any} value - 要验证的值
 * @param {string} message - 验证失败时的提示信息
 * @param {Function} [validator] - 自定义验证函数
 * @param {boolean} [showToast=true] - 是否显示错误提示
 * @returns {boolean} - 是否验证通过
 */
function validateField(value, message, validator = null, showToast = true) {
  return validateFields([{ value, message, validator }], showToast);
}

/**
 * 常用验证器
 */
const validators = {
  /**
   * 验证数字大于0
   */
  positive: val => {
    const num = Number(val);
    return !isNaN(num) && num > 0;
  },

  /**
   * 验证数字大于等于0
   */
  nonNegative: val => {
    const num = Number(val);
    return !isNaN(num) && num >= 0;
  },

  /**
   * 验证数字在指定范围内
   */
  range: (min, max) => val => {
    const num = Number(val);
    return !isNaN(num) && num >= min && num <= max;
  },

  /**
   * 验证字符串长度
   */
  length: (min, max) => val => {
    const str = String(val);
    return str.length >= min && str.length <= max;
  },

  /**
   * 验证手机号
   */
  mobile: val => {
    return /^1[3-9]\d{9}$/.test(val);
  },

  /**
   * 验证邮箱
   */
  email: val => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  },
};

module.exports = { validateFields, validateField, validators };
