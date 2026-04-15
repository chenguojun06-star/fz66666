function validateByRule(value, rules) {
  const { name = '字段', required, minLength, maxLength, pattern } = rules;
  const str = String(value || '').trim();
  if (required && !str) return `请输入${name}`;
  if (minLength && str.length < minLength) return `${name}至少${minLength}个字符`;
  if (maxLength && str.length > maxLength) return `${name}最多${maxLength}个字符`;
  if (pattern && str && !pattern.test(str)) return `${name}格式不正确`;
  return '';
}

function validateFields(rules, showToast = true) {
  for (const rule of rules) {
    const isEmpty = rule.value === null || rule.value === undefined || rule.value === '' ||
      (Array.isArray(rule.value) && rule.value.length === 0);
    if (isEmpty) {
      if (showToast) console.warn(rule.message);
      return false;
    }
    if (rule.validator && typeof rule.validator === 'function' && !rule.validator(rule.value)) {
      if (showToast) console.warn(rule.message);
      return false;
    }
  }
  return true;
}

const validators = {
  positive: (val) => { const n = Number(val); return !isNaN(n) && n > 0; },
  nonNegative: (val) => { const n = Number(val); return !isNaN(n) && n >= 0; },
  mobile: (val) => /^1[3-9]\d{9}$/.test(val),
  email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
};

export { validateByRule, validateFields, validators };
