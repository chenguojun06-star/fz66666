/**
 * PC端统一验证规则库（TypeScript 版）
 *
 * 与小程序端 validationRules.js 保持一致：
 *   - 规则定义完全对齐
 *   - 验证函数行为一致
 *   - 多端共享同一套规则，防止字段校验差异导致数据脏写
 *
 * 使用方式：
 *   import { validateByRule, validateBatch, getValidationRule } from '@/utils/validationRules';
 *   const rule = getValidationRule('orderNo');
 *   const error = validateByRule(value, rule);
 */

// ============================================================
// 类型定义
// ============================================================

export type RuleType = 'integer' | 'number' | 'string';

export interface ValidationRule {
  /** 字段中文名（用于错误提示） */
  name: string;
  /** 是否必填 */
  required?: boolean;
  /** 最小长度（字符串场景） */
  minLength?: number;
  /** 最大长度（字符串场景） */
  maxLength?: number;
  /** 正则模式 */
  pattern?: RegExp;
  /** 数值类型 */
  type?: RuleType;
  /** 数值下限 */
  min?: number;
  /** 数值上限 */
  max?: number;
  /** 默认错误提示（优先于自动拼接） */
  message?: string;
}

export type ValidationRuleMap = Record<string, ValidationRule>;

export interface BatchValidationError {
  [fieldName: string]: string;
}

export interface BatchValidationResult {
  valid: boolean;
  errors: BatchValidationError;
}

// ============================================================
// 规则定义（与小程序端 validationRules.js 完全一致）
// ============================================================

export const ValidationRules: ValidationRuleMap = {
  // 用户相关
  username: {
    name: '账号',
    required: true,
    minLength: 3,
    maxLength: 20,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: '账号长度 3-20 位，只能包含字母、数字、下划线、连字符',
  },
  password: {
    name: '密码',
    required: true,
    minLength: 6,
    maxLength: 20,
    message: '密码长度 6-20 位',
  },
  phone: {
    name: '手机号',
    required: true,
    pattern: /^1[3-9]\d{9}$/,
    message: '请输入有效的手机号码',
  },
  email: {
    name: '邮箱',
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    message: '请输入有效的邮箱地址',
  },

  // 订单相关
  orderNo: {
    name: '订单号',
    required: true,
    minLength: 5,
    maxLength: 50,
    message: '订单号长度 5-50 位',
  },
  styleNo: {
    name: '款号',
    required: true,
    minLength: 3,
    maxLength: 50,
    message: '款号长度 3-50 位',
  },
  // 颜色和尺码不能含 "-"，否则会导致菲号 QR 码按 "-" 分割后字段错位
  color: {
    name: '颜色',
    required: true,
    minLength: 1,
    maxLength: 50,
    pattern: /^[^-]+$/,
    message: '颜色名称不能包含 "-"（会导致扫码 商品编码 解析错误）',
  },
  size: {
    name: '尺码',
    required: true,
    minLength: 1,
    maxLength: 20,
    pattern: /^[^-]+$/,
    message: '尺码不能包含 "-"（会导致扫码 商品编码 解析错误）',
  },
  styleName: {
    name: '款号名称',
    required: true,
    minLength: 2,
    maxLength: 100,
    message: '款号名称长度 2-100 位',
  },
  factoryName: {
    name: '工厂名称',
    required: true,
    minLength: 2,
    maxLength: 100,
    message: '工厂名称长度 2-100 位',
  },

  // 数量相关
  quantity: {
    name: '数量',
    required: true,
    type: 'integer',
    min: 1,
    max: 999999,
    pattern: /^[1-9]\d*$/,
    message: '数量必须是 1-999999 之间的正整数',
  },
  progress: {
    name: '进度',
    required: true,
    type: 'integer',
    min: 0,
    max: 100,
    message: '进度必须是 0-100 之间的整数',
  },
  percentage: {
    name: '百分比',
    required: true,
    type: 'number',
    min: 0,
    max: 100,
    message: '百分比必须在 0-100 之间',
  },

  // 扫码相关
  qrCode: {
    name: '二维码',
    required: true,
    minLength: 5,
    maxLength: 500,
    message: '二维码长度 5-500 位',
  },
  barcode: {
    name: '条码',
    required: true,
    minLength: 5,
    maxLength: 200,
    message: '条码长度 5-200 位',
  },

  // 备注相关
  remark: {
    name: '备注',
    required: false,
    maxLength: 500,
    message: '备注长度不超过 500 位',
  },
  description: {
    name: '描述',
    required: false,
    maxLength: 1000,
    message: '描述长度不超过 1000 位',
  },

  // 接口相关
  apiBaseUrl: {
    name: '接口地址',
    required: true,
    pattern: /^https?:\/\//i,
    message: '接口地址必须以 http:// 或 https:// 开头',
  },

  // 工资相关
  wageAmount: {
    name: '工资金额',
    required: true,
    type: 'number',
    min: 0.01,
    max: 999999.99,
    message: '工资金额必须在 0.01-999999.99 之间',
  },
  // 物料采购数量
  purchaseQuantity: {
    name: '采购数量',
    required: true,
    type: 'number',
    min: 0.01,
    max: 999999,
    message: '采购数量必须在 0.01-999999 之间',
  },
  // 物料单价
  unitPrice: {
    name: '单价',
    required: true,
    type: 'number',
    min: 0.01,
    max: 999999.99,
    message: '单价必须在 0.01-999999.99 之间',
  },
  // 发货数量
  shipQuantity: {
    name: '发货数量',
    required: true,
    type: 'integer',
    min: 1,
    max: 999999,
    message: '发货数量必须是 1-999999 之间的正整数',
  },
  // 借支金额
  advanceAmount: {
    name: '借支金额',
    required: true,
    type: 'number',
    min: 1,
    max: 999999.99,
    message: '借支金额必须在 1-999999.99 之间',
  },
  // 工厂编码
  factoryCode: {
    name: '工厂编码',
    required: true,
    minLength: 2,
    maxLength: 50,
    pattern: /^[a-zA-Z0-9_-]+$/,
    message: '工厂编码长度 2-50 位，只能包含字母、数字、下划线、连字符',
  },
};

// ============================================================
// 验证器辅助函数
// ============================================================

/**
 * 获取验证规则
 */
export function getValidationRule(ruleName: string): ValidationRule | null {
  return ValidationRules[ruleName] ?? null;
}

/**
 * 检查必填字段
 */
function validateRequired(value: unknown, rule: ValidationRule): string | null {
  if (rule.required && (value === null || value === undefined || value === '')) {
    return `${rule.name} 不能为空`;
  }
  return null;
}

/**
 * 检查长度（最小和最大）
 */
function validateLength(stringValue: string, rule: ValidationRule): string | null {
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
function validatePattern(stringValue: string, rule: ValidationRule): string | null {
  if (rule.pattern instanceof RegExp && !rule.pattern.test(stringValue)) {
    return rule.message ?? `${rule.name} 格式不正确`;
  }
  return null;
}

/**
 * 检查数值（整数、浮点数、范围）
 */
function validateNumber(value: unknown, rule: ValidationRule): string | null {
  if (rule.type !== 'integer' && rule.type !== 'number') {
    return null;
  }

  const numValue = Number(value);
  if (Number.isNaN(numValue)) {
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
export function validateByRule(value: unknown, rule: ValidationRule | null): string | null {
  if (!rule) {
    return '规则未定义';
  }

  const requiredError = validateRequired(value, rule);
  if (requiredError) {
    return requiredError;
  }

  // 非必填且为空 → 通过
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

/**
 * 批量验证多个字段
 * @param data 待验证的数据对象
 * @param rules 字段名 → 规则名 的映射
 */
export function validateBatch<T extends Record<string, unknown>>(
  data: T,
  rules: Record<keyof T & string, string>,
): BatchValidationResult {
  const errors: BatchValidationError = {};
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

export default {
  ValidationRules,
  getValidationRule,
  validateByRule,
  validateBatch,
  isValid,
  getAllRuleNames,
};
