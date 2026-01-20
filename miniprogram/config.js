const DEFAULT_BASE_URL = 'http://192.168.2.248:8088';

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

module.exports = {
    DEFAULT_BASE_URL,
    getBaseUrl,
    setBaseUrl,
    normalizeBaseUrl,
    baseUrl: getBaseUrl(),
};
