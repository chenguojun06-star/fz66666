const { getToken, setToken, setUserInfo } = require('../../utils/storage');
const { DEFAULT_BASE_URL, setBaseUrl, normalizeBaseUrl } = require('../../config');
const api = require('../../utils/api');
const { validateByRule } = require('../../utils/validationRules');
const { toast, safeNavigate } = require('../../utils/uiHelper');

let autoWechatTried = false;

/**
 * 验证用户名（3-20位，仅允许字母数字下划线短横线）
 * @param {string} username - 用户名
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validateUsername(username) {
  return (
    validateByRule(username, {
      name: '账号',
      required: true,
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_-]+$/,
    }) || ''
  );
}

/**
 * 验证密码（6-20位）
 * @param {string} password - 密码
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validatePassword(password) {
  return (
    validateByRule(password, { name: '密码', required: true, minLength: 6, maxLength: 20 }) || ''
  );
}

/**
 * 验证 API 基地址格式（可选）
 * @param {string} url - API 地址
 * @returns {string} 错误信息，空字符串表示验证通过
 */
function validateApiBaseUrl(url) {
  const v = String(url || '').trim();
  if (!v) {
    return '';
  } // 可选字段
  const error = validateByRule(v, { name: 'API 地址', required: false, pattern: /^https?:\/\// });
  if (error) {
    return error;
  }
  return '';
}

/**
 * 获取小程序 AppID
 * @returns {string} AppID 或空字符串
 */
function resolveAppId() {
  try {
    if (wx && typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      const mp = info && info.miniProgram;
      return mp && mp.appId ? String(mp.appId) : '';
    }
  } catch (_e) {
    // 忽略 AppID 获取失败
  }
  return '';
}

/**
 * 获取微信登录 code
 * @returns {Promise<string>} 登录 code
 */
async function resolveLoginCode() {
  const appId = resolveAppId();
  if (!appId || appId === 'touristappid') {
    return 'mock_dev';
  }
  const loginRes = await new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject,
    });
  });
  return loginRes && loginRes.code ? String(loginRes.code) : '';
}

/**
 * 获取小程序环境版本（develop/trial/release）
 * @returns {string} 环境版本
 */
function resolveEnvVersion() {
  try {
    if (wx && typeof wx.getAccountInfoSync === 'function') {
      const info = wx.getAccountInfoSync();
      const mp = info && info.miniProgram;
      const v = mp && mp.envVersion ? String(mp.envVersion) : '';
      return v || 'develop';
    }
  } catch (_e) {
    // 忽略环境版本获取失败
  }
  return 'develop';
}

/**
 * 执行登录（通用函数 - 消除重复代码）
 * @param {Object} params - 登录参数 { code, username?, password? }
 * @returns {Promise<boolean>} 是否成功
 */
async function executeLogin(params) {
  try {
    const resp = await api.wechat.miniProgramLogin(params);

    if (resp && resp.code === 200 && resp.data && resp.data.token) {
      setToken(resp.data.token);
      // 保存用户信息（包含角色）
      if (resp.data.user) {
        setUserInfo(resp.data.user);
      }
      safeNavigate({ url: '/pages/home/index' }, 'switchTab').catch(() => {});
      return true;
    }
    toast.error((resp && resp.message) || '登录失败');
    return false;
  } catch (e) {
    const app = getApp();
    if (app && typeof app.toastError === 'function') {
      app.toastError(e, '网络异常');
    } else {
      toast.error('网络异常');
    }
    return false;
  }
}

/**
 * 验证并设置 API 地址（通用函数）
 * @param {string} apiBaseUrl - API 地址
 * @returns {string|null} 错误信息或 null
 */
function validateAndSetBaseUrl(apiBaseUrl) {
  if (apiBaseUrl) {
    const err = validateApiBaseUrl(apiBaseUrl);
    if (err) {
      return err;
    }
    setBaseUrl(apiBaseUrl);
  }
  return null;
}

Page({
  data: {
    username: '',
    password: '',
    apiBaseUrl: '',
    loading: false,
    envVersion: '',
    showDevFields: false,
  },

  onShow() {
    const token = getToken();
    if (token) {
      safeNavigate({ url: '/pages/home/index' }, 'switchTab').catch(() => {});
      return;
    }

    const envVersion = resolveEnvVersion();
    const showDevFields = envVersion !== 'release';

    let apiBaseUrl = DEFAULT_BASE_URL;
    if (showDevFields) {
      try {
        const saved = wx.getStorageSync('api_base_url');
        apiBaseUrl = normalizeBaseUrl(saved) || DEFAULT_BASE_URL;
      } catch (e) {
        apiBaseUrl = DEFAULT_BASE_URL;
      }
    }
    setBaseUrl(apiBaseUrl);
    this.setData({ envVersion, showDevFields, apiBaseUrl });

    const shouldAutoWechat = envVersion === 'trial' || envVersion === 'release';
    if (shouldAutoWechat && !autoWechatTried) {
      autoWechatTried = true;
      this.onWechatLogin();
    }
  },

  onUsernameInput(e) {
    this.setData({ username: (e && e.detail && e.detail.value) || '' });
  },

  onPasswordInput(e) {
    this.setData({ password: (e && e.detail && e.detail.value) || '' });
  },

  onApiBaseUrlInput(e) {
    this.setData({ apiBaseUrl: (e && e.detail && e.detail.value) || '' });
  },

  async onWechatLogin() {
    if (this.data.loading) {
      return;
    }

    // 验证并设置 API 地址
    const apiBaseUrl = (this.data.apiBaseUrl || '').trim();
    if (this.data.showDevFields && apiBaseUrl) {
      const err = validateAndSetBaseUrl(apiBaseUrl);
      if (err) {
        toast.error(err);
        return;
      }
    }

    this.setData({ loading: true });
    try {
      const code = await resolveLoginCode();
      if (!code) {
        toast.error('获取登录code失败');
        return;
      }

      await executeLogin({ code });
    } finally {
      this.setData({ loading: false });
    }
  },

  async onDevLogin() {
    if (this.data.loading) {
      return;
    }

    const username = (this.data.username || '').trim();
    const password = (this.data.password || '').trim();
    const apiBaseUrl = (this.data.apiBaseUrl || '').trim();

    // 验证账号
    let err = validateUsername(username);
    if (err) {
      toast.error(err);
      return;
    }

    // 验证密码
    err = validatePassword(password);
    if (err) {
      toast.error(err);
      return;
    }

    // 验证并设置 API 地址
    err = validateAndSetBaseUrl(apiBaseUrl);
    if (err) {
      toast.error(err);
      return;
    }

    this.setData({ loading: true });
    try {
      const code = await resolveLoginCode();
      if (!code) {
        toast.error('获取登录code失败');
        return;
      }

      await executeLogin({ code, username, password });
    } finally {
      this.setData({ loading: false });
    }
  },
});
