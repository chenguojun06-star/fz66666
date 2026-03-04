/**
 * 统一验证规则库 — 与小程序 miniprogram/utils/validationRules.js 保持严格一致
 *
 * 使用方式（Ant Design Form）：
 *   import { antdRule, validate } from '@/utils/validationRules';
 *   <Form.Item rules={[antdRule('orderNo')]} />
 *
 * 使用方式（普通验证）：
 *   import { validate, isValid } from '@/utils/validationRules';
 *   const error = validate(value, 'phone');  // null = 通过
 */

export interface ValidationRule {
  name: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  type?: 'integer' | 'number';
  min?: number;
  max?: number;
  message?: string;
}

/* ================================================================
   规则定义（与小程序 validationRules.js 严格同步，修改必须双端同步）
================================================================ */
export const ValidationRules: Record<string, ValidationRule> = {
  // ── 用户相关 ──
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

  // ── 订单相关 ──
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

  // ── 数量相关 ──
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

  // ── 扫码相关 ──
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

  // ── 备注相关 ──
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

  // ── 接口相关 ──
  apiBaseUrl: {
    name: '接口地址',
    required: true,
    pattern: /^https?:\/\//,
    message: '接口地址必须以 http:// 或 https:// 开头',
  },
};

/* ================================================================
   核心验证逻辑（与小程序 validateByRule 逻辑完全一致）
================================================================ */

function validateRequired(value: unknown, rule: ValidationRule): string | null {
  if (rule.required && (value === null || value === undefined || value === '')) {
    return `${rule.name} 不能为空`;
  }
  return null;
}

function validateLength(stringValue: string, rule: ValidationRule): string | null {
  if (rule.minLength !== undefined && stringValue.length < rule.minLength) {
    return `${rule.name} 长度不能少于 ${rule.minLength} 位`;
  }
  if (rule.maxLength !== undefined && stringValue.length > rule.maxLength) {
    return `${rule.name} 长度不能超过 ${rule.maxLength} 位`;
  }
  return null;
}

function validatePattern(stringValue: string, rule: ValidationRule): string | null {
  if (rule.pattern instanceof RegExp && !rule.pattern.test(stringValue)) {
    return rule.message ?? `${rule.name} 格式不正确`;
  }
  return null;
}

function validateNumber(value: unknown, rule: ValidationRule): string | null {
  if (rule.type !== 'integer' && rule.type !== 'number') return null;
  const numValue = Number(value);
  if (isNaN(numValue)) return `${rule.name} 必须是数字`;
  if (rule.type === 'integer' && !Number.isInteger(numValue)) return `${rule.name} 必须是整数`;
  if (rule.min !== undefined && numValue < rule.min) return `${rule.name} 不能小于 ${rule.min}`;
  if (rule.max !== undefined && numValue > rule.max) return `${rule.name} 不能大于 ${rule.max}`;
  return null;
}

/**
 * 验证单个值
 * @returns null = 通过，string = 错误信息
 */
export function validate(value: unknown, ruleName: string): string | null {
  const rule = ValidationRules[ruleName];
  if (!rule) return '规则未定义';

  const requiredError = validateRequired(value, rule);
  if (requiredError) return requiredError;

  if (!rule.required && (value === null || value === undefined || value === '')) return null;

  const stringValue = String(value).trim();
  return (
    validateLength(stringValue, rule) ??
    validatePattern(stringValue, rule) ??
    validateNumber(value, rule)
  );
}

/** 快速判断是否有效 */
export function isValid(value: unknown, ruleName: string): boolean {
  return validate(value, ruleName) === null;
}

/**
 * 批量验证
 * @param data   待验证数据对象
 * @param fields key = 字段名，value = 规则名
 */
export function validateBatch(
  data: Record<string, unknown>,
  fields: Record<string, string>,
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  let valid = true;
  for (const [fieldName, ruleName] of Object.entries(fields)) {
    const error = validate(data[fieldName], ruleName);
    if (error) { errors[fieldName] = error; valid = false; }
  }
  return { valid, errors };
}

/**
 * 生成 Ant Design Form rules 数组
 *
 * @example
 * <Form.Item name="phone" rules={antdRule('phone')}>
 */
export function antdRule(ruleName: string): Array<{
  required?: boolean;
  validator?: (_: unknown, value: unknown) => Promise<void>;
}> {
  const rule = ValidationRules[ruleName];
  if (!rule) return [];
  return [
    {
      required: rule.required,
      validator: async (_: unknown, value: unknown) => {
        // 非必填且为空时跳过
        if (!rule.required && (value === null || value === undefined || value === '')) return;
        const error = validate(value, ruleName);
        if (error) return Promise.reject(new Error(error));
      },
    },
  ];
}

export function getAllRuleNames(): string[] {
  return Object.keys(ValidationRules);
}

export default ValidationRules;
