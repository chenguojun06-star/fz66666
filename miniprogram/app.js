import { getToken, clearToken } from './utils/storage';
import * as reminderManager from './utils/reminderManager';

let redirectingToLogin = false;
let redirectResetTimer = null;

App({
    globalData: {
        token: '',
    },

    onLaunch() {
        // 清理过期提醒（超过7天）
        try {
            reminderManager.cleanupExpiredReminders();
        } catch (e) {
            console.error('清理过期提醒失败', e);
        }
    },

    onShow() {
        // 小程序从后台进入前台时检查提醒
        try {
            setTimeout(() => {
                reminderManager.checkAndShowReminders();
            }, 1000);
        } catch (e) {
            console.error('检查提醒失败', e);
        }
    },

    setTabSelected(page, selected) {
        try {
            const idx = Number(selected);
            if (!Number.isFinite(idx)) return;
            const tab = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null;
            if (tab && typeof tab.setData === 'function') tab.setData({ selected: idx });
        } catch (e) {
            null;
        }
    },

    requireAuth() {
        const token = getToken();
        if (token) return true;
        this.redirectToLogin();
        return false;
    },

    redirectToLogin() {
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
    },

    logout() {
        clearToken();
        const { clearUserInfo } = require('./utils/storage');
        clearUserInfo();
        this.redirectToLogin();
    },

    toast(title) {
        const raw = title != null ? String(title) : '';
        const v = raw.length > 18 ? raw.slice(0, 18) : raw;
        wx.showToast({ title: v || '提示', icon: 'none' });
    },

    hasMoreByPage(page) {
        if (!page) return false;
        const total = Number(page.total) || 0;
        const current = Number(page.current) || 1;
        const size = Number(page.size) || 0;
        if (size <= 0) return false;
        return current * size < total;
    },

    async loadPagedList(pageCtx, listKey, reset, fetchPage, mapRecord) {
        const key = listKey != null ? String(listKey) : '';
        if (!key) return;
        const data = pageCtx && pageCtx.data ? pageCtx.data : null;
        const state = data && data[key] ? data[key] : null;
        if (!state || typeof state !== 'object') return;
        if (state.loading) return;
        if (!reset && state.hasMore === false) return;
        if (typeof fetchPage !== 'function') return;

        const nextPage = reset ? 1 : (Number(state.page) || 1) + 1;
        const pageSize = Number(state.pageSize) || 10;
        if (pageCtx && typeof pageCtx.setData === 'function') {
            pageCtx.setData({ [`${key}.loading`]: true });
        }

        try {
            const page = await fetchPage({ page: nextPage, pageSize });
            const records = page && Array.isArray(page.records) ? page.records : [];
            const prev = Array.isArray(state.list) ? state.list : [];
            const mergedRaw = reset ? records : prev.concat(records);
            const merged = typeof mapRecord === 'function' ? mergedRaw.map(mapRecord) : mergedRaw;

            if (pageCtx && typeof pageCtx.setData === 'function') {
                pageCtx.setData({
                    [key]: {
                        ...state,
                        loading: false,
                        page: nextPage,
                        pageSize,
                        list: merged,
                        hasMore: this.hasMoreByPage(page),
                    },
                });
            }
        } catch (e) {
            if (e && e.type === 'auth') return;
            this.toastError(e, '网络异常');
        } finally {
            if (pageCtx && typeof pageCtx.setData === 'function') {
                pageCtx.setData({ [`${key}.loading`]: false });
            }
        }
    },

    resetPagedList(pageCtx, listKey) {
        const key = listKey != null ? String(listKey) : '';
        if (!key || !pageCtx || typeof pageCtx.setData !== 'function') return;
        const data = pageCtx.data || {};
        const state = data[key] && typeof data[key] === 'object' ? data[key] : {};
        const pageSize = Number(state.pageSize) || 10;
        pageCtx.setData({
            [key]: {
                ...state,
                loading: false,
                page: 1,
                pageSize,
                hasMore: true,
                list: [],
            },
        });
    },

    toastError(e, fallback) {
        const raw = e && e.errMsg != null ? String(e.errMsg) : (fallback != null ? String(fallback) : '网络异常');
        this.toast(raw);
    },
});
