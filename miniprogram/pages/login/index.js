const { getToken, setToken } = require('../../utils/storage');
const { DEFAULT_BASE_URL, setBaseUrl, normalizeBaseUrl } = require('../../config');
const api = require('../../utils/api');

let autoWechatTried = false;

// 验证函数
function validateUsername(username) {
    const v = String(username || '').trim();
    if (!v) return '请输入账号';
    if (v.length < 3) return '账号长度不能少于 3 个字符';
    if (v.length > 20) return '账号长度不能超过 20 个字符';
    if (!/^[a-zA-Z0-9_\-]+$/.test(v)) return '账号只能包含字母、数字、下划线和中划线';
    return '';
}

function validatePassword(password) {
    const v = String(password || '').trim();
    if (!v) return '请输入密码';
    if (v.length < 6) return '密码长度不能少于 6 个字符';
    if (v.length > 20) return '密码长度不能超过 20 个字符';
    return '';
}

function validateApiBaseUrl(url) {
    const v = String(url || '').trim();
    if (!v) return '';  // 可选字段
    if (!(/^https?:\/\//.test(v))) return 'API 地址必须以 http:// 或 https:// 开头';
    try {
        new URL(v);
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
