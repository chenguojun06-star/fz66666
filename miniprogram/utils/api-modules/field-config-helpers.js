/**
 * 扩展字段工具函数
 * 用于小程序端读取/收集 ext_json 中的自定义字段值
 */

/**
 * 解析 extJson 字符串为对象
 * @param {string|object|null} extJson
 * @returns {object}
 */
function parseExtJson(extJson) {
  if (!extJson) return {};
  if (typeof extJson === 'object') return extJson;
  try {
    return JSON.parse(extJson) || {};
  } catch (e) {
    return {};
  }
}

/**
 * 从记录中读取字段值，优先直接字段，其次从 extJson 解析
 * @param {object} record - 数据记录
 * @param {string} fieldKey - 字段键
 * @returns {any}
 */
function getFieldValue(record, fieldKey) {
  if (!record || !fieldKey) return undefined;
  if (record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }
  const ext = parseExtJson(record.extJson);
  return ext[fieldKey];
}

/**
 * 收集表单中的扩展字段值，序列化为 extJson 字符串
 * @param {object} formData - 表单数据对象
 * @param {Array} customFields - 字段配置列表（仅 isSystem=0 的自定义字段）
 * @param {string} existingExtJson - 已有的 extJson（合并用）
 * @returns {string} JSON 字符串
 */
function collectExtValues(formData, customFields, existingExtJson) {
  const existing = parseExtJson(existingExtJson);
  const ext = { ...existing };
  customFields.forEach(f => {
    const key = f.fieldKey;
    if (formData && key in formData) {
      ext[key] = formData[key];
    }
  });
  return JSON.stringify(ext);
}

/**
 * 过滤出启用的自定义字段（isSystem=0 且 enabled=1）
 * @param {Array} fields - 字段配置列表
 * @returns {Array}
 */
function filterCustomFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.filter(f => f.isSystem !== 1 && f.enabled !== 0);
}

/**
 * 过滤出启用的所有字段（系统 + 自定义）
 * @param {Array} fields - 字段配置列表
 * @returns {Array}
 */
function filterEnabledFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.filter(f => f.enabled !== 0).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

/**
 * 解析选项 JSON
 * @param {string} optionsJson
 * @returns {Array<{label:string,value:string}>}
 */
function parseOptions(optionsJson) {
  if (!optionsJson) return [];
  try {
    const parsed = typeof optionsJson === 'string' ? JSON.parse(optionsJson) : optionsJson;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

/**
 * 格式化字段值用于展示
 * @param {any} value - 字段值
 * @param {string} fieldType - 字段类型
 * @param {string} optionsJson - 选项JSON（select/multiselect 用）
 * @returns {string}
 */
function formatFieldValue(value, fieldType, optionsJson) {
  if (value === undefined || value === null || value === '') return '-';

  switch (fieldType) {
    case 'select': {
      const opts = parseOptions(optionsJson);
      const found = opts.find(o => String(o.value) === String(value));
      return found ? found.label : String(value);
    }
    case 'multiselect': {
      const opts = parseOptions(optionsJson);
      const vals = Array.isArray(value) ? value : String(value).split(',');
      return vals.map(v => {
        const found = opts.find(o => String(o.value) === String(v));
        return found ? found.label : String(v);
      }).join(', ');
    }
    case 'boolean':
    case 'switch':
      return value ? '是' : '否';
    case 'date':
      return String(value).split('T')[0];
    case 'datetime':
      return String(value).replace('T', ' ').substring(0, 16);
    case 'number':
    case 'inputnumber':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}

module.exports = {
  parseExtJson,
  getFieldValue,
  collectExtValues,
  filterCustomFields,
  filterEnabledFields,
  parseOptions,
  formatFieldValue,
};
