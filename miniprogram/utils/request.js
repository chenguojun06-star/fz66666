const { getBaseUrl } = require('../config');
const { getToken, clearToken } = require('./storage');

let redirectingToLogin = false;
let redirectResetTimer = null;

function triggerLoginRedirect() {
    try {
        const app = getApp();
        if (app && typeof app.redirectToLogin === 'function') {
            app.redirectToLogin();
            return;
        }
    } catch (e) {
        null;
    }

    if (redirectingToLogin) return;
    redirectingToLogin = true;
    if (redirectResetTimer) {
        clearTimeout(redirectResetTimer);
        redirectResetTimer = null;
    }
    redirectResetTimer = setTimeout(() => {
        redirectingToLogin = false;
        redirectResetTimer = null;
    }, 800);
    wx.reLaunch({ url: '/pages/login/index' });
}

function createError(errMsg, extra) {
    const e = { errMsg: errMsg ? String(errMsg) : '请求失败' };
    if (extra && typeof extra === 'object') {
        Object.assign(e, extra);
    }
    return e;
}

function request(options) {
    return new Promise((resolve, reject) => {
        const url = (options && options.url) || '';
        const method = (options && options.method) || 'GET';
        const data = (options && options.data) || undefined;
        const header = (options && options.header) || {};
        const skipAuthRedirect = !!(options && options.skipAuthRedirect);

        const token = getToken();
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const baseUrl = getBaseUrl();

        wx.request({
            url: `${baseUrl}${url}`,
            method,
            data,
            timeout: 15000,
            header: {
                'content-type': 'application/json',
                ...authHeader,
                ...header,
            },
            success(res) {
                const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 0;
                const body = res && res.data;
                let code = NaN;
                if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && 'code' in body) {
                    code = body.code != null ? Number(body.code) : NaN;
                }

                if (statusCode === 401 || code === 401) {
                    clearToken();
                    if (!skipAuthRedirect) {
                        triggerLoginRedirect();
                        reject(createError('未登录', { type: 'auth', statusCode, data: body }));
                        return;
                    }
                }

                if (statusCode === 403 || code === 403) {
                    reject(createError('无权限', { type: 'forbidden', statusCode, data: body }));
                    return;
                }

                if (statusCode && (statusCode < 200 || statusCode >= 300)) {
                    reject(createError(`HTTP ${statusCode}`, { type: 'http', statusCode, data: body }));
                    return;
                }

                resolve(body);
            },
            fail(err) {
                reject(createError((err && err.errMsg) || '网络异常', { type: 'network', raw: err }));
            },
        });
    });
}

module.exports = {
    request,
};
