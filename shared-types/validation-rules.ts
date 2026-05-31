/**
 * 多端共享验证规则
 * 保证前端、小程序、H5端的验证逻辑一致
 */

export interface ValidationRule {
  name: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  type?: 'string' | 'number' | 'integer' | 'email' | 'phone';
  min?: number;
  max?: number;
  message: string;
}

export const ValidationRules: Record<string, ValidationRule> = {
  // 用户相关
  username: {
    name: '账号',
    required: true,
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: '账号长度 3-20 位，只能包含字母、数字、下划线、连字符'
  },
  password: {
    name: '密码',
    required: true,
    minLength: 6,
    maxLength: 20,
    message: '密码长度 6-20 位'
  },
  phone: {
    name: '手机号',
    required: true,
    pattern: /^1[3-9]\d{9}$/,
    message: '请输入有效的手机号码'
  },
  email: {
    name: '邮箱',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: '请输入有效的邮箱地址'
  },

  // 订单相关
  orderNo: {
    name: '订单号',
    required: true,
    minLength: 5,
    maxLength: 50,
    message: '订单号长度 5-50 位'
  },
  styleNo: {
    name: '款号',
    required: true,
    minLength: 3,
    maxLength: 50,
    message: '款号长度 3-50 位'
  },

  // 颜色和尺码不能含 "-"，否则会导致菲号 QR 码按 "-" 分割后字段错位，进而 SKU 验证失败
  color: {
    name: '颜色',
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: /^[^-]+$/,
    message: '颜色名称不能包含 "-"（会导致扫码 SKU 解析错误）'
  },
  size: {
    name: '尺码',
    required: true,
    minLength: 1,
    maxLength: 20,
    pattern: /^[^-]+$/,
    message: '尺码不能包含 "-"（会导致扫码 SKU 解析错误）'
  },
  styleName: {
    name: '款号名称',
    required: true,
    minLength: 2,
    maxLength: 100,
    message: '款号名称长度 2-100 位'
  },
  factoryName: {
    name: '工厂名称',
    required: true,
    minLength: 2,
    maxLength: 100,
    message: '工厂名称长度 2-100 位'
  },

  // 数量相关
  quantity: {
    name: '数量',
    required: true,
    type: 'integer',
    min: 1,
    max: 999999,
    pattern: /^[1-9]\d*$/,
    message: '数量必须是 1-999999 之间的正整数'
  },
  progress: {
    name: '进度',
    required: true,
    type: 'integer',
    min: 0,
    max: 100,
    message: '进度必须是 0-100 之间的整数'
  },
  percentage: {
    name: '百分比',
    required: true,
    type: 'number',
    min: 0,
    max: 100,
    message: '百分比必须在 0-100 之间'
  },

  // 扫码相关
  qrCode: {
    name: '二维码',
    required: true,
    minLength: 5,
    maxLength: 500,
    message: '二维码长度 5-500 位'
  },
  barcode: {
    name: '条码',
    required: true,
    minLength: 5,
    maxLength: 200,
    message: '条码长度 5-200 位'
  },

  // 备注相关
  remark: {
    name: '备注',
    required: false,
    maxLength: 500,
    message: '备注长度不超过 500 位'
  },
  description: {
    name: '描述',
    required: false,
    maxLength: 1000,
    message: '描述长度不超过 1000 位'
  },

  // 接口相关
  apiBaseUrl: {
    name: '接口地址',
    required: true,
    pattern: /^https?:\/\//i,
    message: '接口地址必须以 http:// 或 https:// 开头'
  }
};

/**
 * 获取验证规则
 */
export function getValidationRule(ruleName: string): ValidationRule | null {
  return ValidationRules[ruleName] || null;
}

/**
 * 检查必需字段
 */
export function validateRequired(value: unknown, rule: ValidationRule): string | null {
  if (rule.required && (value === null || value === undefined || value === '')) {
    return `${rule.name} 不能为空`;
  }
  return null;
}

/**
 * 检查长度
 */
export function validateLength(stringValue: string, rule: ValidationRule): string | null {
  if (rule.minLength !== undefined && stringValue.length < rule.minLength) {
    return `${rule.name} 长度不能少于 ${rule.minLength} 位`;
  }
  if (rule.maxLength !== undefined && stringValue.length > rule.maxLength) {
    return `${rule.name} 长度不能超过 ${rule.maxLength} 位`;
  }
  return null;
}

/**
 * 检查正则表达式
 */
export function validatePattern(stringValue: string, rule: ValidationRule): string | null {
  if (rule.pattern && !rule.pattern.test(stringValue)) {
    return rule.message || `${rule.name} 格式不正确`;
  }
  return null;
}

/**
 * 检查数值类型
 */
export function validateNumber(value: unknown, rule: ValidationRule): string | null {
  if (!rule.type || (rule.type !== 'integer' && rule.type !== 'number')) {
    return null;
  }

  const numValue = Number(value);
  if (isNaN(numValue)) {
    return `${rule.name} 必须是数字`;
  }

  if (rule.type === 'integer' && !Number.isInteger(numValue)) {
    return `${rule.name} 必须是整数`;
  }

  if (rule.min !== undefined && numValue < rule.min) {
    return `${rule.name} 不能小于 ${rule.min}`;
  }

  if (rule.max !== undefined && numValue > rule.max) {
    return `${rule.name} 不能大于 ${rule.max}`;
  }

  return null;
}

/**
 * 单个规则验证
 */
export function validateByRule(value: unknown, rule: ValidationRule): string | null {
  if (!rule) {
    return '规则未定义';
  }

  const requiredError = validateRequired(value, rule);
  if (requiredError) {
    return requiredError;
  }

  if (!rule.required && (value === null || value === undefined || value === '')) {
    return null;
  }

  const stringValue = String(value).trim();
  const lengthError = validateLength(stringValue, rule);
  if (lengthError) {
    return lengthError;
  }

  const patternError = validatePattern(stringValue, rule);
  if (patternError) {
    return patternError;
  }

  const numberError = validateNumber(value, rule);
  if (numberError) {
    return numberError;
  }

  return null;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * 批量验证多个字段
 */
export function validateBatch(
  data: Record<string, unknown>,
  rules: Record<string, string>
): ValidationResult {
  const errors: Record<string, string> = {};
  let valid = true;

  for (const [fieldName, ruleName] of Object.entries(rules)) {
    const rule = getValidationRule(ruleName);
    if (!rule) {
      continue;
    }

    const value = data[fieldName];
    const error = validateByRule(value, rule);

    if (error) {
      errors[fieldName] = error;
      valid = false;
    }
  }

  return { valid, errors };
}

/**
 * 快速验证（单个规则）
 */
export function isValid(value: unknown, ruleName: string): boolean {
  const rule = getValidationRule(ruleName);
  if (!rule) {
    return false;
  }
  return validateByRule(value, rule) === null;
}

/**
 * 获取所有规则名
 */
export function getAllRuleNames(): string[] {
  return Object.keys(ValidationRules);
}
