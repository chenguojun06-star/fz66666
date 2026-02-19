/**
 * 默认API地址配置
 *
 * 回退策略（按优先级）：
 * 1. Storage 中保存的地址（api_base_url）
 * 2. DEFAULT_BASE_URL（当前局域网IP，支持内网访问）
 * 3. FALLBACK_BASE_URL（localhost:8088，本机备选）
 *
 * 使用说明：
 * - 默认使用局域网 IP，支持内网多设备访问
 * - 如需修改地址，在登录页手动输入
 * - 生产环境请修改为实际域名，如 https://api.your-domain.com
 */
const DEFAULT_BASE_URL = 'http://192.168.1.17:8088';  // 当前机器局域网 IP（内网可访问）
const FALLBACK_BASE_URL = 'http://localhost:8088';     // 回退地址（仅本机）

/**
 * 是否启用调试日志（生产环境请设为 false）
 */
const DEBUG_MODE = false;

/**
 * 规范化 API 基址（去空格、补协议、去末尾斜杠）
 * @param {string} url - 原始 URL
 * @returns {string} 规范化后的 URL
 */
function normalizeBaseUrl(url) {
  const raw = (url === null ? '' : String(url)).trim();
  if (!raw) {
    return '';
  }
  const withProto = raw.includes('://') ? raw : `http://${raw}`;
  return withProto.replace(/\/+$/, '');
}

/**
 * 将 localhost/127.0.0.1 替换为局域网 IP
 * @param {string} url - 原始 URL
 * @returns {string} 替换后的 URL
 */
function replaceLoopback(url) {
  const v = normalizeBaseUrl(url);
  if (!v) {
    return '';
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(v)) {
    return DEFAULT_BASE_URL;
  }
  return v;
}

/**
 * 获取当前 API 基址（优先 Storage > 默认局域网 IP）
 * @returns {string} API 基础地址
 */
function getBaseUrl() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync('api_base_url');
      if (stored) {
        const v = normalizeBaseUrl(stored);
        // 自动清理已过期的旧 IP 地址缓存
        // 如果 Storage 中的地址不是当前 DEFAULT_BASE_URL 且不是 FALLBACK，
        // 且是一个内网 IP 地址，则认为已过期，用 DEFAULT_BASE_URL 替换
        if (v && v !== DEFAULT_BASE_URL && v !== FALLBACK_BASE_URL) {
          const isOldLanIp = /^https?:\/\/192\.168\.\d+\.\d+:\d+/i.test(v);
          if (isOldLanIp) {
            // 旧的内网 IP 已过期，自动更新为当前地址
            try { wx.setStorageSync('api_base_url', DEFAULT_BASE_URL); } catch (_) { /* ignore */ }
            return DEFAULT_BASE_URL;
          }
        }
        if (v) {
          return v;
        }
      }
    }
  } catch (_e) {
    // 忽略 Storage 读取失败
  }
  // 优先使用局域网 IP（支持内网访问），如连接失败请在登录页手动输入 localhost:8088
  return DEFAULT_BASE_URL;
}

/**
 * 设置 API 基址并持久化到 Storage
 * @param {string} url - 新的 API 地址
 * @returns {string} 实际存储的地址
 */
function setBaseUrl(url) {
  const v = replaceLoopback(url);
  try {
    if (typeof wx !== 'undefined' && wx.setStorageSync) {
      wx.setStorageSync('api_base_url', v);
    }
  } catch (_e) {
    // 忽略 Storage 写入失败
  }
  return v || DEFAULT_BASE_URL;
}

const baseUrl = getBaseUrl();

module.exports = { DEFAULT_BASE_URL, FALLBACK_BASE_URL, DEBUG_MODE, getBaseUrl, setBaseUrl, normalizeBaseUrl, baseUrl };
