/**
 * 默认API地址配置
 *
 * 回退策略（按优先级）：
 * 1. Storage 中保存的地址（api_base_url）
 * 2. DEFAULT_BASE_URL（生产 HTTPS 域名）
 * 3. FALLBACK_BASE_URL（开发备用）
 *
 * 上线前必须修改：
 * - 将 DEFAULT_BASE_URL 改为微信云托管后端 HTTPS 地址
 *   格式示例：https://xxxxx-xxxxxx.ap-shanghai.service.tcloudbase.com
 *   或绑定自定义域名：https://api.your-domain.com
 * - 该域名必须在微信公众平台「开发→开发管理→服务器域名」中添加为 request 合法域名
 *
 * 本地开发：
 * - 在「微信开发者工具→详情→本地设置」中勾选「不校验合法域名」
 * - 在登录页手动输入本机地址（如 http://192.168.x.x:8088）
 */
// ⚠️ 上线前替换为实际的微信云托管后端地址（必须 HTTPS）
const DEFAULT_BASE_URL = 'https://YOUR_CLOUD_BACKEND_DOMAIN';  // TODO: 替换为微信云托管后端地址
const FALLBACK_BASE_URL = 'http://192.168.1.17:8088';         // 本地开发备用（内网 IP）

/**
 * 是否启用调试日志（生产环境请设为 false）
 */
const DEBUG_MODE = false;

/**
 * 判断当前是否为本地开发环境
 * 开发者工具中 envVersion = 'develop'，且 DEFAULT_BASE_URL 还是占位符时，自动用 FALLBACK
 */
function isPlaceholderUrl(url) {
  return !url || url.includes('YOUR_CLOUD_BACKEND_DOMAIN') || url === 'https://YOUR_CLOUD_BACKEND_DOMAIN';
}

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
          // 1. Storage 里存的是占位符（未上线时曾写入）→ 清除，降级到 FALLBACK
          if (isPlaceholderUrl(v)) {
            try { wx.removeStorageSync('api_base_url'); } catch (_) { /* ignore */ }
            return isPlaceholderUrl(DEFAULT_BASE_URL) ? FALLBACK_BASE_URL : DEFAULT_BASE_URL;
          }
          // 2. Storage 里存的是旧的内网 IP → 也清除，用当前地址替代
          const isOldLanIp = /^https?:\/\/192\.168\.\d+\.\d+:\d+/i.test(v);
          if (isOldLanIp) {
            const fresh = isPlaceholderUrl(DEFAULT_BASE_URL) ? FALLBACK_BASE_URL : DEFAULT_BASE_URL;
            try { wx.setStorageSync('api_base_url', fresh); } catch (_) { /* ignore */ }
            return fresh;
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
  // 使用默认生产地址（开发时请在登录页手动输入本机地址）
  // 如果 DEFAULT_BASE_URL 还是占位符（未配置正式域名），自动降级到 FALLBACK（内网地址）
  if (isPlaceholderUrl(DEFAULT_BASE_URL)) {
    return FALLBACK_BASE_URL;
  }
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
