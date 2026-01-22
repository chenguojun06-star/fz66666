/**
 * 默认API地址
 * 开发环境：http://192.168.2.248:8088
 * 生产环境：请修改为实际域名，如 https://api.your-domain.com
 */
const DEFAULT_BASE_URL = 'http://192.168.2.248:8088';

/**
 * 是否启用调试日志（生产环境请设为 false）
 */
const DEBUG_MODE = true;

function normalizeBaseUrl(url) {
    const raw = (url == null ? '' : String(url)).trim();
    if (!raw) return '';
    const withProto = raw.includes('://') ? raw : `http://${raw}`;
    return withProto.replace(/\/+$/, '');
}

function replaceLoopback(url) {
    const v = normalizeBaseUrl(url);
    if (!v) return '';
    if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(v)) {
        return DEFAULT_BASE_URL;
    }
    return v;
}

function getBaseUrl() {
    try {
        if (typeof wx !== 'undefined' && wx.getStorageSync) {
            const v = replaceLoopback(wx.getStorageSync('api_base_url'));
            if (v) return v;
        }
    } catch (e) {
        null;
    }
    return DEFAULT_BASE_URL;
}

function setBaseUrl(url) {
    const v = replaceLoopback(url);
    try {
        if (typeof wx !== 'undefined' && wx.setStorageSync) {
            wx.setStorageSync('api_base_url', v);
        }
    } catch (e) {
        null;
    }
    return v || DEFAULT_BASE_URL;
}

const baseUrl = getBaseUrl();

export {
    DEFAULT_BASE_URL,
    DEBUG_MODE,
    getBaseUrl,
    setBaseUrl,
    normalizeBaseUrl,
    baseUrl,
};
