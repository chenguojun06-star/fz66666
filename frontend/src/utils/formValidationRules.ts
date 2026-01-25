/**
 * 统一的表单验证规则
 * 确保整个应用中表单验证的一致性
 */

type FormRule = {
  required?: boolean;
  message?: string;
  min?: number;
  max?: number;
  pattern?: RegExp;
  type?: string;
  validator?: (_: unknown, value: unknown) => Promise<void>;
};

export const formValidationRules: Record<string, FormRule[]> = {
  // ==================== 账号密码相关 ====================
  username: [
    { required: true, message: '请输入用户名' },
    { min: 3, max: 20, message: '用户名长度在 3-20 个字符' },
    { pattern: /^[a-zA-Z0-9_-]+$/, message: '用户名只能包含字母、数字、下划线和中划线' }
  ],

  password: [
    { required: true, message: '请输入密码' },
    { min: 6, max: 20, message: '密码长度在 6-20 个字符' }
  ],

  passwordEdit: [
    { min: 6, max: 20, message: '密码长度在 6-20 个字符' }
  ],

  // ==================== 个人信息 ====================
  name: [
    { required: true, message: '请输入名称' },
    { min: 2, max: 50, message: '名称长度在 2-50 个字符' }
  ],

  phone: [
    { required: false, message: '请输入手机号' },
    {
      validator: (_: unknown, value: unknown) => {
        if (!value) return Promise.resolve();
        const text = String(value ?? '');
        if (!/^1\d{10}$/.test(text)) {
          return Promise.reject(new Error('请输入有效的手机号'));
        }
        return Promise.resolve();
      }
    }
  ],

  email: [
    { required: false, message: '请输入邮箱' },
    { type: 'email', message: '请输入有效的邮箱地址' }
  ],

  // ==================== 订单相关 ====================
  orderNo: [
    { required: true, message: '请输入订单号' },
    { min: 5, max: 50, message: '订单号长度在 5-50 个字符' }
  ],

  customerName: [
    { required: true, message: '请输入客户名称' },
    { min: 2, max: 100, message: '客户名称长度在 2-100 个字符' }
  ],

  // ==================== 款号相关 ====================
  styleNo: [
    { required: true, message: '请输入款号' },
    { min: 3, max: 50, message: '款号长度在 3-50 个字符' }
  ],

  styleName: [
    { required: true, message: '请输入款名' },
    { min: 2, max: 100, message: '款名长度在 2-100 个字符' }
  ],

  // ==================== 数量相关 ====================
  quantity: [
    { required: true, message: '请输入数量' },
    {
      validator: (_: unknown, value: unknown) => {
        if (!value) return Promise.reject(new Error('请输入数量'));
        const n = Number(value);
        if (!Number.isInteger(n) || n <= 0) {
          return Promise.reject(new Error('数量必须是正整数'));
        }
        if (n > 999999) {
          return Promise.reject(new Error('数量不能超过 999999'));
        }
        return Promise.resolve();
      }
    }
  ],

  unitPrice: [
    { required: false, message: '请输入单价' },
    {
      validator: (_: unknown, value: unknown) => {
        if (!value && value !== 0) return Promise.resolve();
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          return Promise.reject(new Error('单价必须是非负数'));
        }
        return Promise.resolve();
      }
    }
  ],

  // ==================== 文本字段 ====================
  remark: [
    { max: 500, message: '备注不能超过 500 个字符' }
  ],

  description: [
    { max: 1000, message: '描述不能超过 1000 个字符' }
  ],

  // ==================== 日期相关 ====================
  date: [
    { required: true, message: '请选择日期' }
  ],

  dateRange: [
    { required: true, message: '请选择日期范围' }
  ],

  // ==================== 选择相关 ====================
  select: [
    { required: true, message: '请选择选项' }
  ],

  role: [
    { required: true, message: '请选择角色' }
  ],

  // ==================== 工厂相关 ====================
  factoryName: [
    { required: true, message: '请输入工厂名称' },
    { min: 2, max: 100, message: '工厂名称长度在 2-100 个字符' }
  ],

  // ==================== 仓库相关 ====================
  warehouseName: [
    { required: true, message: '请输入仓库名称' },
    { min: 2, max: 50, message: '仓库名称长度在 2-50 个字符' }
  ],

  // ==================== 颜色尺码相关 ====================
  color: [
    { required: false, message: '请输入颜色' },
    { max: 50, message: '颜色长度不能超过 50 个字符' }
  ],

  size: [
    { required: false, message: '请输入尺码' },
    { max: 20, message: '尺码长度不能超过 20 个字符' }
  ],

  // ==================== 二维码相关 ====================
  qrCode: [
    { required: true, message: '请输入或扫描二维码' },
    { min: 5, max: 200, message: '二维码格式不正确' }
  ],

  // ==================== 常用组合规则 ====================
  fullName: [
    { required: true, message: '请输入姓名' },
    { min: 2, max: 50, message: '姓名长度在 2-50 个字符' },
    { pattern: /^[\u4e00-\u9fa5a-zA-Z]+$/, message: '姓名只能包含中文和英文字母' }
  ],

  // 可选电话
  optionalPhone: [
    {
      validator: (_: unknown, value: unknown) => {
        if (!value) return Promise.resolve();
        const text = String(value ?? '').replace(/[-\s]/g, '');
        if (!/^\d{7,20}$/.test(text)) {
          return Promise.reject(new Error('请输入有效的电话号码'));
        }
        return Promise.resolve();
      }
    }
  ],

  // 可选邮箱
  optionalEmail: [
    {
      validator: (_: unknown, value: unknown) => {
        if (!value) return Promise.resolve();
        const text = String(value ?? '');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          return Promise.reject(new Error('请输入有效的邮箱地址'));
        }
        return Promise.resolve();
      }
    }
  ],
};

/**
 * 获取验证规则
 * @param ruleName 规则名称
 * @returns 规则数组
 */
export function getValidationRule(ruleName: keyof typeof formValidationRules): FormRule[] {
  return formValidationRules[ruleName] || [];
}

/**
 * 合并验证规则
 * @param baseRules 基础规则
 * @param customRules 自定义规则
 * @returns 合并后的规则
 */
export function mergeValidationRules(baseRules: FormRule[] = [], customRules: FormRule[] = []) {
  return [...baseRules, ...customRules];
}

/**
 * 获取多个验证规则
 * @param ruleNames 规则名称数组
 * @returns 规则对象
 */
export function getValidationRules(ruleNames: (keyof typeof formValidationRules)[]): Record<string, FormRule[]> {
  const result: Record<string, FormRule[]> = {};
  for (const name of ruleNames) {
    result[name] = getValidationRule(name);
  }
  return result;
}
