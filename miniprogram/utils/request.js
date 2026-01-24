import { getBaseUrl } from '../config';
import { getToken, clearToken } from './storage';

let redirectingToLogin = false;
let redirectResetTimer = null;

function resolveEnvVersion() {
    try {
        if (wx && typeof wx.getAccountInfoSync === 'function') {
            const info = wx.getAccountInfoSync();
            const mp = info && info.miniProgram;
            return mp && mp.envVersion ? String(mp.envVersion) : '';
        }
    } catch (e) {
        null;
    }
    return '';
}

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

    if (redirectingToLogin) {return;}
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
        const retryCount = (options && options._retryCount) || 0;

        const token = getToken();
        const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
        const baseUrl = getBaseUrl();
        const envVersion = resolveEnvVersion();
        const isDevEnv = !envVersion || envVersion === 'develop';
        // 开发调试时允许HTTP（项目配置中已关闭urlCheck）
        // 生产环境请使用HTTPS域名
        const requireHttps = false; // !isDevEnv;

        if (!baseUrl) {
            reject(createError('未配置有效的 API 地址', { type: 'config' }));
            return;
        }

        // 开发阶段暂时允许HTTP，生产环境需要配置HTTPS
        if (requireHttps && /^http:\/\//i.test(baseUrl)) {
            reject(createError('当前环境仅支持 https 域名，请配置合法域名和证书', {
                type: 'config',
                url: baseUrl,
                envVersion,
            }));
            return;
        }

        wx.request({
            url: `${baseUrl}${url}`,
            method,
            data,
            timeout: 10000,
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
                let serverMessage = '';
                if (body && typeof body === 'string') {
                    serverMessage = body;
                } else if (body && typeof body === 'object' && !(body instanceof ArrayBuffer)) {
                    const candidates = [body.message, body.msg, body.error, body.detail];
                    for (let i = 0; i < candidates.length; i += 1) {
                        const v = candidates[i];
                        if (v != null && v !== '') {
                            serverMessage = String(v);
                            break;
                        }
                    }
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
                    // 如果没有token，403可能是未登录，触发登录
                    if (!token) {
                        clearToken();
                        if (!skipAuthRedirect) {
                            triggerLoginRedirect();
                            reject(createError('未登录或登录已过期，请重新登录', { type: 'auth', statusCode, data: body }));
                            return;
                        }
                    }
                    // 有token但403，可能是权限不足或token过期
                    // 尝试判断是否为token过期（后端返回特定消息）
                    const isTokenExpired = serverMessage && (
                        serverMessage.includes('过期') ||
                        serverMessage.includes('expired') ||
                        serverMessage.includes('invalid token')
                    );

                    if (isTokenExpired) {
                        clearToken();
                        if (!skipAuthRedirect) {
                            triggerLoginRedirect();
                            reject(createError('登录已过期，请重新登录', { type: 'auth', statusCode, data: body }));
                            return;
                        }
                    }

                    reject(createError(serverMessage || '无权限', { type: 'forbidden', statusCode, data: body }));
                    return;
                }

                if (statusCode && (statusCode < 200 || statusCode >= 300)) {
                    const errMsg = serverMessage ? serverMessage : `HTTP ${statusCode}`;
                    const errType = statusCode >= 500 ? 'server' : 'http';
                    reject(createError(errMsg, {
                        type: errType,
                        statusCode,
                        data: body,
                        url,
                        method,
                    }));
                    return;
                }

                resolve(body);
            },
            fail(err) {
                // 网络错误时，检查是否需要重试
                const isRetryable = retryCount < 2;
                const errMsg = (err && err.errMsg) || '网络异常';
                const lower = String(errMsg || '').toLowerCase();
                let mappedMsg = errMsg;
                if (errMsg.includes('域名') || lower.includes('domain')) {
                    mappedMsg = isDevEnv
                        ? '请求域名未配置或不合法，请在开发者工具关闭域名校验或改用 https 域名'
                        : '请求域名未配置或不合法，请配置合法 https 域名';
                } else if (lower.includes('https') || lower.includes('tls') || errMsg.includes('证书')) {
                    mappedMsg = isDevEnv
                        ? 'HTTPS 证书或 TLS 版本不符合要求，请改用合法 https 域名或本地代理'
                        : 'HTTPS 证书或 TLS 版本不符合要求';
                }

                // 超时错误或网络错误建议重试
                const isTimeoutOrNetwork = errMsg.includes('timeout') ||
                    errMsg.includes('request:fail') ||
                    errMsg.includes('network');

                if (isRetryable && isTimeoutOrNetwork) {
                    // 添加指数退避延迟
                    const delayMs = 1000 * (Math.pow(2, retryCount) - 1);
                    console.warn(`[Request Retry] Retrying (${retryCount + 1}/2) after ${delayMs}ms: ${url}`);

                    setTimeout(() => {
                        const retryOptions = { ...options, _retryCount: retryCount + 1 };
                        request(retryOptions).then(resolve).catch(reject);
                    }, delayMs);
                } else {
                    reject(createError(mappedMsg, { type: 'network', raw: err }));
                }
            },
        });
    });
}

export {
    request,
};
