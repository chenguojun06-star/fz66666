const { getToken, setToken } = require('../../utils/storage');
const { DEFAULT_BASE_URL, setBaseUrl, normalizeBaseUrl } = require('../../config');
const api = require('../../utils/api');
const { validateByRule } = require('../../utils/validationRules');
const { errorHandler } = require('../../utils/errorHandler');

let autoWechatTried = false;

// 验证函数 (使用统一的规则库)
function validateUsername(username) {
    return validateByRule(username, { name: '账号', required: true, minLength: 3, maxLength: 20, pattern: /^[a-zA-Z0-9_\-]+$/ }) || '';
}

function validatePassword(password) {
    return validateByRule(password, { name: '密码', required: true, minLength: 6, maxLength: 20 }) || '';
}

function validateApiBaseUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';  // 可选字段
    const error = validateByRule(v, { name: 'API 地址', required: false, pattern: /^https?:\/\// });
    if (error) return error;
    } catch (e) {
        return 'API 地址格式不正确';
    }
    return '';
}

function resolveAppId() {
    try {
        if (wx && typeof wx.getAccountInfoSync === 'function') {
            const info = wx.getAccountInfoSync();
            const mp = info && info.miniProgram;
            return mp && mp.appId ? String(mp.appId) : '';
        }
    } catch (e) {
        null;
    }
    return '';
}

async function resolveLoginCode() {
    const appId = resolveAppId();
    if (!appId || appId === 'touristappid') {
        return 'devtest';
    }
    const loginRes = await new Promise((resolve, reject) => {
        wx.login({
            success: resolve,
            fail: reject,
        });
    });
    return loginRes && loginRes.code ? String(loginRes.code) : '';
}

function resolveEnvVersion() {
    try {
        if (wx && typeof wx.getAccountInfoSync === 'function') {
            const info = wx.getAccountInfoSync();
            const mp = info && info.miniProgram;
            const v = mp && mp.envVersion ? String(mp.envVersion) : '';
            return v || 'develop';
        }
    } catch (e) {
        null;
    }
    return 'develop';
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
            wx.switchTab({ url: '/pages/home/index' });
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
        if (this.data.loading) return;

        const apiBaseUrl = (this.data.apiBaseUrl || '').trim();
        if (this.data.showDevFields && apiBaseUrl) {
            const err = validateApiBaseUrl(apiBaseUrl);
            if (err) {
                wx.showToast({ title: err, icon: 'none' });
                return;
            }
            setBaseUrl(apiBaseUrl);
        }

        this.setData({ loading: true });
        try {
            const code = await resolveLoginCode();
            if (!code) {
                wx.showToast({ title: '获取登录code失败', icon: 'none' });
                return;
            }

            const resp = await api.wechat.miniProgramLogin({ code });

            if (resp && resp.code === 200 && resp.data && resp.data.token) {
                setToken(resp.data.token);
                wx.switchTab({ url: '/pages/home/index' });
                return;
            }
            wx.showToast({ title: (resp && resp.message) || '登录失败', icon: 'none' });
        } catch (e) {
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '网络异常');
            else wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },

    async onDevLogin() {
        if (this.data.loading) return;

        const username = (this.data.username || '').trim();
        const password = (this.data.password || '').trim();
        const apiBaseUrl = (this.data.apiBaseUrl || '').trim();

        // 验证账号
        let err = validateUsername(username);
        if (err) {
            wx.showToast({ title: err, icon: 'none' });
            return;
        }

        // 验证密码
        err = validatePassword(password);
        if (err) {
            wx.showToast({ title: err, icon: 'none' });
            return;
        }

        // 验证 API 地址（如果有）
        if (apiBaseUrl) {
            err = validateApiBaseUrl(apiBaseUrl);
            if (err) {
                wx.showToast({ title: err, icon: 'none' });
                return;
            }
            setBaseUrl(apiBaseUrl);
        }

        this.setData({ loading: true });
        try {
            const code = await resolveLoginCode();
            if (!code) {
                wx.showToast({ title: '获取登录code失败', icon: 'none' });
                return;
            }

            const resp = await api.wechat.miniProgramLogin({ code, username, password });

            if (resp && resp.code === 200 && resp.data && resp.data.token) {
                setToken(resp.data.token);
                wx.switchTab({ url: '/pages/home/index' });
                return;
            }
            wx.showToast({ title: (resp && resp.message) || '登录失败', icon: 'none' });
        } catch (e) {
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '网络异常');
            else wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },
});
