/**
 * 安全的 toast 辅助函数
 * 防止 [object Object] 显示
 */

/**
 * 从对象中提取文本
 * @private
 */
function extractTextFromObject(obj, fallback) {
  // 尝试从常见错误字段提取
  const text = obj.errMsg || obj.message || obj.msg || obj.error;
  if (text) {
    return String(text);
  }

  // 尝试 JSON 序列化
  try {
    const json = JSON.stringify(obj);
    if (json && json !== '{}' && json.length < 50) {
      return json;
    }
  } catch (e) {
    // JSON 序列化失败
  }

  // 尝试 toString
  try {
    const str = obj.toString();
    if (str && str !== '[object Object]') {
      return str;
    }
  } catch (e) {
    // toString 失败
  }

  return fallback;
}

/**
 * 从任意值提取可显示的字符串
 * @param {*} value - 任意值
 * @param {string} fallback - 后备文本
 * @returns {string}
 */
function extractDisplayText(value, fallback = '提示') {
  if (value === null) {
    return fallback;
  }

  if (typeof value === 'string') {
    return value || fallback;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'object') {
    return extractTextFromObject(value, fallback);
  }

  return String(value);
}

/**
 * 安全的显示 toast
 * @param {string|Object} title - 标题文本或错误对象
 * @param {Object} options - 其他 toast 选项
 */
function safeShowToast(title, options = {}) {
  const text = extractDisplayText(title, '提示');
  const displayText = text.length > 18 ? text.slice(0, 18) : text;

  wx.showToast({
    title: displayText || '提示',
    icon: options.icon || 'none',
    duration: options.duration || 1500,
    ...options,
  });
}

/**
 * 显示错误提示
 * @param {*} error - 错误对象
 * @param {string} fallback - 后备提示文本
 */
function showErrorToast(error, fallback = '操作失败') {
  const text = extractDisplayText(error, fallback);
  safeShowToast(text, { icon: 'none', duration: 2000 });
}

/**
 * 显示成功提示
 * @param {string} message - 成功消息
 */
function showSuccessToast(message = '操作成功') {
  safeShowToast(message, { icon: 'success' });
}

module.exports = {
  extractDisplayText,
  safeShowToast,
  showErrorToast,
  showSuccessToast,
};
