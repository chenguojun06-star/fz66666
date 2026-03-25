/**
 * API 地址配置
 *
 * 回退策略（按优先级）：
 * 1. Storage 中保存的地址（api_base_url）
 * 2. DEFAULT_BASE_URL（生产微信云托管地址）
 * 3. FALLBACK_BASE_URL（开发备用）
 *
 * 合法域名：已在微信公众平台「开发→开发管理→服务器域名」配置
 *   backend-226678-6-1405390085.sh.run.tcloudbase.com  // cspell:ignore tcloudbase
 *
 * 安全要求：
 * - 小程序侧仅使用已备案的 HTTPS 域名或受控网关地址
 * - 不在前端源码、缓存或请求配置中保留内网 IP
 */
// 生产后端地址（自定义域名 www.webyszl.cn → 后端服务，HTTPS 已开启）
const DEFAULT_BASE_URL = 'https://www.webyszl.cn';
const FALLBACK_BASE_URL = DEFAULT_BASE_URL;

/**
 * 是否启用调试日志（生产环境请设为 false）
 */
const DEBUG_MODE = false;

/**
 * 判断 URL 是否为占位符（未配置真实域名）
 * 开发者工具中若 DEFAULT_BASE_URL 仍是占位符，则自动用 FALLBACK
 * @param {string} url - 待检测的 URL 字符串
 * @returns {boolean} 是否为占位符地址
 */
function isPlaceholderUrl(url) {
  return !url || url.includes('YOUR_CLOUD_BACKEND_DOMAIN') || url === 'https://YOUR_CLOUD_BACKEND_DOMAIN';
}

/**
 * 判断是否为内网 IP 地址
 * @param {string} url - 待检测的 URL
 * @returns {boolean} 是否为内网地址
 */
function isPrivateNetworkUrl(url) {
  return /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)\d+\.\d+(:\d+)?(\/|$)/i.test(url);
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
 * 将不安全或不可达的地址回退到默认云地址
 * @param {string} url - 原始 URL
 * @returns {string} 安全可用的 URL
 */
function resolveSafeBaseUrl(url) {
  const v = normalizeBaseUrl(url);
  if (!v) {
    return '';
  }
  if (isPlaceholderUrl(v)) {
    return '';
  }
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(v) || isPrivateNetworkUrl(v)) {
    return DEFAULT_BASE_URL;
  }
  return v;
}

/**
 * 获取当前 API 基址（优先 Storage > 默认云地址）
 * @returns {string} API 基础地址
 */
function getBaseUrl() {
  try {
    if (typeof wx !== 'undefined' && wx.getStorageSync) {
      const stored = wx.getStorageSync('api_base_url');
      if (stored) {
        const v = normalizeBaseUrl(stored);
        if (v) {
          // 1. Storage 里存的是占位符（未上线时曾写入）→ 清除，降级到默认云地址
          if (isPlaceholderUrl(v)) {
            try { wx.removeStorageSync('api_base_url'); } catch (_) { /* ignore */ }
            return isPlaceholderUrl(DEFAULT_BASE_URL) ? FALLBACK_BASE_URL : DEFAULT_BASE_URL;
          }
          // 2. Storage 里存的是旧的腾讯云托管默认域名（已迁移到自定义域名）→ 更新为新地址
          // 原因：旧地址 backend-226678-*.sh.run.tcloudbase.com 仍可用但已废弃，
          // 直接替换为自定义域名 www.webyszl.cn，避免将来旧地址失效导致小程序崩溃。
          const isOldCloudDomain = v.includes('backend-226678') || v.includes('frontend-226678');
          if (isOldCloudDomain) {
            try { wx.setStorageSync('api_base_url', DEFAULT_BASE_URL); } catch (_) { /* ignore */ }
            return DEFAULT_BASE_URL;
          }

          // 3. Storage 里存的是内网 IP 或本地回环地址 → 统一替换为云地址
          if (isPrivateNetworkUrl(v) || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(v)) {
            try { wx.setStorageSync('api_base_url', DEFAULT_BASE_URL); } catch (_) { /* ignore */ }
            return DEFAULT_BASE_URL;
          }
          // 4. 其他合法地址（如手动配置的云地址）直接使用
          return v;
        }
      }
    }
  } catch (_e) {
    // 忽略 Storage 读取失败
  }
  // 使用默认生产地址
  // 如果 DEFAULT_BASE_URL 还是占位符（未配置正式域名），自动降级到 FALLBACK
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
  const v = resolveSafeBaseUrl(url);
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
