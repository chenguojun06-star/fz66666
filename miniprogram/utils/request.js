const { getBaseUrl } = require('../config');
const { getToken, clearToken } = require('./storage');

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

  if (redirectingToLogin) {
    return;
  }
  redirectingToLogin = true;
  if (redirectResetTimer) {
    clearTimeout(redirectResetTimer);
    redirectResetTimer = null;
  }
  redirectResetTimer = setTimeout(() => {
    redirectingToLogin = false;
    redirectResetTimer = null;
  }, 1000);
  wx.reLaunch({ url: '/pages/login/index' });
}

function createError(errMsg, extra) {
  const msg = errMsg ? String(errMsg) : '请求失败';
  const e = { errMsg: msg, message: msg };
  if (extra && typeof extra === 'object') {
    Object.assign(e, extra);
  }
  return e;
}

/**
 * 解析响应体中的业务状态码
 */
function parseResponseCode(body) {
  if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && 'code' in body) {
    return body.code !== null ? Number(body.code) : NaN;
  }
  return NaN;
}

/**
 * 提取服务器返回的消息
 */
function extractServerMessage(body) {
  if (body && typeof body === 'string') {
    return body;
  }
  if (body && typeof body === 'object' && !(body instanceof ArrayBuffer)) {
    const candidates = [body.message, body.msg, body.error, body.detail];
    for (const v of candidates) {
      if (v !== null && v !== '') {
        return String(v);
      }
    }
  }
  return '';
}

/**
 * 处理401未授权错误
 */
function handle401Error(statusCode, body, skipAuthRedirect, reject) {
  clearToken();
  if (!skipAuthRedirect) {
    triggerLoginRedirect();
    reject(createError('未登录', { type: 'auth', statusCode, data: body }));
    return true;
  }
  return false;
}

/**
 * 处理403禁止访问错误
 */
function handle403Error({ statusCode, body, token, serverMessage, skipAuthRedirect, reject }) {
  // 如果没有token，403可能是未登录
  if (!token) {
    clearToken();
    if (!skipAuthRedirect) {
      triggerLoginRedirect();
      reject(
        createError('未登录或登录已过期，请重新登录', {
          type: 'auth',
          statusCode,
          data: body,
        })
      );
      return true;
    }
  }

  // 有token但403，判断是否为token过期
  // 检查服务端消息或客户端JWT解析
  const { isTokenExpired: checkExpired } = require('./storage');
  const isExpiredByMessage =
    serverMessage &&
    (serverMessage.includes('过期') ||
      serverMessage.includes('expired') ||
      serverMessage.includes('invalid token'));
  const isExpiredByJwt = typeof checkExpired === 'function' && checkExpired();

  if (isExpiredByMessage || isExpiredByJwt) {
    clearToken();
    if (!skipAuthRedirect) {
      triggerLoginRedirect();
      reject(createError('登录已过期，请重新登录', { type: 'auth', statusCode, data: body }));
      return true;
    }
  }

  reject(createError(serverMessage || '无权限', { type: 'forbidden', statusCode, data: body }));
  return true;
}

/**
 * 处理HTTP错误（非2xx状态码）
 */
function handleHttpError({ statusCode, serverMessage, body, url, method, reject }) {
  const errMsg = serverMessage || `HTTP ${statusCode}`;
  const errType = statusCode >= 500 ? 'server' : 'http';
  reject(createError(errMsg, { type: errType, statusCode, data: body, url, method }));
}

/**
 * 处理请求成功的响应
 */
function handleSuccess(res, context) {
  const { url, method, skipAuthRedirect, token, resolve, reject } = context;
  const statusCode = res && typeof res.statusCode === 'number' ? res.statusCode : 0;
  const body = res && res.data;
  const code = parseResponseCode(body);
  const serverMessage = extractServerMessage(body);

  // 处理401未授权
  if (statusCode === 401 || code === 401) {
    if (handle401Error(statusCode, body, skipAuthRedirect, reject)) {
      return;
    }
  }

  // 处理403禁止访问
  if (statusCode === 403 || code === 403) {
    if (handle403Error({ statusCode, body, token, serverMessage, skipAuthRedirect, reject })) {
      return;
    }
  }

  // 处理HTTP错误
  if (statusCode && (statusCode < 200 || statusCode >= 300)) {
    handleHttpError({ statusCode, serverMessage, body, url, method, reject });
    return;
  }

  // 成功
  resolve(body);
}

/**
 * 映射网络错误消息
 */
function mapNetworkErrorMessage(errMsg, isDevEnv) {
  const lower = String(errMsg || '').toLowerCase();

  if (errMsg.includes('域名') || lower.includes('domain')) {
    return isDevEnv
      ? '请求域名未配置或不合法，请在开发者工具关闭域名校验或改用 https 域名'
      : '请求域名未配置或不合法，请配置合法 https 域名';
  }

  if (lower.includes('https') || lower.includes('tls') || errMsg.includes('证书')) {
    return isDevEnv
      ? 'HTTPS 证书或 TLS 版本不符合要求，请改用合法 https 域名或本地代理'
      : 'HTTPS 证书或 TLS 版本不符合要求';
  }

  return errMsg;
}

/**
 * 处理请求失败（网络错误）
 */
function handleFail(err, context) {
  const { url, options, retryCount, resolve, reject, isDevEnv } = context;
  const isRetryable = retryCount < 2;
  const errMsg = (err && err.errMsg) || '网络异常';
  const mappedMsg = mapNetworkErrorMessage(errMsg, isDevEnv);

  // 判断是否应该重试
  const isTimeoutOrNetwork =
    errMsg.includes('timeout') || errMsg.includes('request:fail') || errMsg.includes('network');

  if (isRetryable && isTimeoutOrNetwork) {
    const delayMs = 1000 * (Math.pow(2, retryCount) - 1);
    console.warn(`[Request Retry] Retrying (${retryCount + 1}/2) after ${delayMs}ms: ${url}`);

    setTimeout(() => {
      const retryOptions = { ...options, _retryCount: retryCount + 1 };
      request(retryOptions).then(resolve).catch(reject);
    }, delayMs);
  } else {
    reject(createError(mappedMsg, { type: 'network', raw: err }));
  }
}

/**
 * 验证baseUrl配置
 * @private
 * @param {string} baseUrl - API基础地址
 * @param {boolean} requireHttps - 是否要求HTTPS
 * @param {string} envVersion - 环境版本
 * @throws {Error} baseUrl未配置或HTTPS校验失败
 */
function _validateBaseUrl(baseUrl, requireHttps, envVersion) {
  if (!baseUrl) {
    throw createError('未配置有效的 API 地址', { type: 'config' });
  }

  if (requireHttps && /^http:\/\//i.test(baseUrl)) {
    throw createError('当前环境仅支持 https 域名，请配置合法域名和证书', {
      type: 'config',
      url: baseUrl,
      envVersion,
    });
  }
}

/**
 * 构建请求头（包含认证和自定义头）
 * @private
 * @param {string} token - 认证token
 * @param {Object} customHeader - 自定义请求头
 * @returns {Object} - 完整请求头
 */
function _buildHeaders(token, customHeader) {
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};
  return {
    'content-type': 'application/json',
    ...authHeader,
    ...customHeader,
  };
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
    const baseUrl = getBaseUrl();
    const envVersion = resolveEnvVersion();
    const isDevEnv = !envVersion || envVersion === 'develop';
    // 开发调试时允许HTTP，生产/体验环境强制HTTPS
    const requireHttps = !isDevEnv;

    // 验证baseUrl配置
    try {
      _validateBaseUrl(baseUrl, requireHttps, envVersion);
    } catch (err) {
      reject(err);
      return;
    }

    // 构建请求头
    const headers = _buildHeaders(token, header);

    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      timeout: 10000,
      header: headers,
      success(res) {
        handleSuccess(res, { url, method, skipAuthRedirect, token, resolve, reject });
      },
      fail(err) {
        handleFail(err, { url, options, retryCount, resolve, reject, isDevEnv });
      },
    });
  });
}

/**
 * 上传文件（图片）到服务器
 * @param {Object} options - 上传选项
 * @param {string} options.filePath - 文件临时路径
 * @param {string} options.name - 文件对应的 key
 * @param {Object} options.formData - 额外的表单数据
 * @param {string} options.url - 上传接口地址（相对路径）
 * @returns {Promise<string>} - 上传成功后的图片URL
 */
function uploadFile(options) {
  return new Promise((resolve, reject) => {
    const { filePath, name = 'file', formData = {}, url = '/api/common/upload' } = options || {};

    if (!filePath) {
      reject(createError('文件路径不能为空', { type: 'param' }));
      return;
    }

    const token = getToken();
    const baseUrl = getBaseUrl();

    // 验证baseUrl
    if (!baseUrl) {
      reject(createError('未配置有效的 API 地址', { type: 'config' }));
      return;
    }

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    wx.uploadFile({
      url: `${baseUrl}${url}`,
      filePath,
      name,
      formData,
      header: headers,
      timeout: 30000, // 上传超时设置为30秒
      success(res) {
        try {
          const statusCode = res.statusCode || 0;

          // 解析响应数据
          let body;
          try {
            body = res.data ? JSON.parse(res.data) : {};
          } catch (e) {
            body = { message: res.data };
          }

          // 处理401未授权
          if (statusCode === 401) {
            clearToken();
            triggerLoginRedirect();
            reject(createError('未登录', { type: 'auth', statusCode }));
            return;
          }

          // 处理业务成功
          if (statusCode === 200 && body.code === 200) {
            // 返回上传后的文件URL
            const fileUrl = body.data?.url || body.data?.fileUrl || body.data;
            if (fileUrl) {
              resolve(fileUrl);
            } else {
              reject(createError('上传成功但未返回文件地址', { type: 'biz', body }));
            }
            return;
          }

          // 处理业务错误
          const serverMessage = extractServerMessage(body);
          reject(createError(serverMessage || '上传失败', { type: 'biz', statusCode, body }));
        } catch (err) {
          reject(createError('解析上传响应失败', { type: 'parse', raw: err }));
        }
      },
      fail(err) {
        const errMsg = (err && err.errMsg) || '上传失败';
        const mappedMsg = errMsg.includes('timeout') ? '上传超时，请检查网络' :
                         errMsg.includes('request:fail') ? '网络异常，请重试' :
                         '上传失败';
        reject(createError(mappedMsg, { type: 'network', raw: err }));
      },
    });
  });
}

/**
 * 判断响应是否为业务成功（code === 200）
 * @param {Object} res - API响应体
 * @returns {boolean}
 */
function isApiSuccess(res) {
  return res && typeof res === 'object' && res.code === 200;
}

/**
 * 自动解包 Result<T>，成功返回 data，失败抛出 Error
 * @param {Object} res - API响应体
 * @param {string} [fallbackMsg='请求失败'] - 默认错误消息
 * @returns {*} res.data
 * @throws {Error} 当 code !== 200 时抛出
 */
function unwrapData(res, fallbackMsg) {
  if (isApiSuccess(res)) {
    return res.data;
  }
  const msg = extractServerMessage(res) || fallbackMsg || '请求失败';
  throw createError(msg, { type: 'biz', data: res });
}

module.exports = { request, uploadFile, isApiSuccess, unwrapData, extractServerMessage };
