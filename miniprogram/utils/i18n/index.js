const locales = require('./locales.generated');

const STORAGE_KEY = 'app.language';
const DEFAULT_LANG = 'zh-CN';

/**
 * 获取当前语言。
 * @returns {string} 规范化后的语言代码。
 */
function getLanguage() {
  try {
    const lang = wx.getStorageSync(STORAGE_KEY);
    return locales[lang] ? lang : DEFAULT_LANG;
  } catch (e) {
    return DEFAULT_LANG;
  }
}

/**
 * 设置当前语言。
 * @param {string} lang 语言代码
 * @returns {string} 最终写入后的语言代码。
 */
function setLanguage(lang) {
  const normalized = locales[lang] ? lang : DEFAULT_LANG;
  try {
    wx.setStorageSync(STORAGE_KEY, normalized);
  } catch (e) {
    // ignore
  }
  return normalized;
}

/**
 * 按路径读取对象值。
 * @param {Record<string, any>} obj 对象
 * @param {string} keyPath 点路径
 * @returns {any} 命中的值，未命中返回 undefined。
 */
function getByPath(obj, keyPath) {
  if (!keyPath) return undefined;
  return String(keyPath)
    .split('.')
    .reduce((acc, key) => (acc && Object.prototype.hasOwnProperty.call(acc, key) ? acc[key] : undefined), obj);
}

/**
 * 获取翻译文本。
 * @param {string} keyPath 文案 key 路径
 * @param {string=} lang 可选语言代码
 * @returns {string} 翻译结果，未命中时回退默认语言或 keyPath。
 */
function t(keyPath, lang) {
  const current = locales[lang] ? lang : getLanguage();
  const value = getByPath(locales[current], keyPath);
  if (value !== undefined && value !== null) return String(value);
  const fallback = getByPath(locales[DEFAULT_LANG], keyPath);
  return fallback !== undefined && fallback !== null ? String(fallback) : String(keyPath || '');
}

/**
 * 带参数的翻译。语言包里用 {name} 占位，例如
 *   "mp.warehouse.locationScan.itemCount": "{count} 件"
 *   tf('mp.warehouse.locationScan.itemCount', { count: 3 })  → "3 件"
 *
 * ⚠️ 与前端 `frontend/src/i18n` 的 tf 保持同签名，两边语言包共用同一份源。
 * @param {string} keyPath 文案 key 路径
 * @param {Record<string, string|number>} params 占位符参数
 * @param {string=} lang 可选语言代码
 * @returns {string} 替换后的文案
 */
function tf(keyPath, params, lang) {
  let result = t(keyPath, lang);
  const p = params || {};
  Object.keys(p).forEach((key) => {
    // 用 split/join 而不是 RegExp —— 参数值里若含正则元字符（如 . * ( )）会炸
    result = result.split('{' + key + '}').join(String(p[key]));
  });
  return result;
}

module.exports = {
  STORAGE_KEY,
  DEFAULT_LANG,
  getLanguage,
  setLanguage,
  t,
  tf,
  locales,
};
