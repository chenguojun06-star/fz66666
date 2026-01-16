const { request } = require('../../utils/request');
const { getToken, setToken } = require('../../utils/storage');

Page({
    data: {
        username: '',
        password: '',
        loading: false,
    },

    onShow() {
        const token = getToken();
        if (token) {
            wx.reLaunch({ url: '/pages/scan/index' });
        }
    },

    onUsernameInput(e) {
        this.setData({ username: (e && e.detail && e.detail.value) || '' });
    },

    onPasswordInput(e) {
        this.setData({ password: (e && e.detail && e.detail.value) || '' });
    },

    async onLogin() {
        if (this.data.loading) return;

        const username = (this.data.username || '').trim();
        const password = (this.data.password || '').trim();
        if (!username || !password) {
            wx.showToast({ title: '请输入账号和密码', icon: 'none' });
            return;
        }

        this.setData({ loading: true });
        try {
            const loginRes = await new Promise((resolve, reject) => {
                wx.login({
                    success: resolve,
                    fail: reject,
                });
            });
            const code = loginRes && loginRes.code;
            if (!code) {
                wx.showToast({ title: '获取登录code失败', icon: 'none' });
                return;
            }

            const resp = await request({
                url: '/api/wechat/mini-program/login',
                method: 'POST',
                data: { code, username, password },
            });

            if (resp && resp.code === 200 && resp.data && resp.data.token) {
                setToken(resp.data.token);
                wx.reLaunch({ url: '/pages/scan/index' });
                return;
            }
            wx.showToast({ title: (resp && resp.message) || '登录失败', icon: 'none' });
        } catch (e) {
            wx.showToast({ title: '网络异常', icon: 'none' });
        } finally {
            this.setData({ loading: false });
        }
    },
});

