const api = require('../../utils/api');

Page({
    data: {
        loadingStats: false,
        loadingHistory: false,
        stats: null,
        history: { page: 1, pageSize: 10, hasMore: true, list: [] },
    },

    onShow() {
        const app = getApp();
        if (app && typeof app.setTabSelected === 'function') app.setTabSelected(this, 3);
        if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
        this.refreshAll(true);
    },

    onPullDownRefresh() {
        this.refreshAll(true).finally(() => wx.stopPullDownRefresh());
    },

    refreshAll(reset) {
        const shouldReset = reset === true;
        return Promise.all([this.loadStats(), this.loadHistory(shouldReset)]);
    },

    async loadStats() {
        if (this.data.loadingStats) return;
        this.setData({ loadingStats: true });
        try {
            const stats = await api.production.personalScanStats({});
            this.setData({ stats: stats || null });
        } catch (e) {
            if (e && e.type === 'auth') return;
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '加载失败');
        } finally {
            this.setData({ loadingStats: false });
        }
    },

    async loadHistory(reset) {
        if (this.data.loadingHistory) return;
        const history = {
            page: 1,
            pageSize: 10,
            hasMore: true,
            list: [],
            ...(this.data.history || {}),
        };
        if (!reset && history.hasMore === false) return;

        const nextPage = reset ? 1 : (Number(history.page) || 1) + 1;
        const pageSize = Number(history.pageSize) || 10;
        this.setData({ loadingHistory: true });
        try {
            const page = await api.production.myScanHistory({ page: nextPage, pageSize });
            const records = page && Array.isArray(page.records) ? page.records : [];
            const prev = Array.isArray(history.list) ? history.list : [];
            const merged = reset ? records : prev.concat(records);
            const app = getApp();
            const hasMore = app && typeof app.hasMoreByPage === 'function' ? app.hasMoreByPage(page) : true;
            this.setData({
                history: {
                    ...history,
                    page: nextPage,
                    pageSize,
                    list: merged,
                    hasMore,
                },
            });
        } catch (e) {
            if (e && e.type === 'auth') return;
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '加载失败');
        } finally {
            this.setData({ loadingHistory: false });
        }
    },

    loadMoreHistory() {
        this.loadHistory(false);
    },

    onLogout() {
        const app = getApp();
        if (app && typeof app.logout === 'function') app.logout();
        else wx.reLaunch({ url: '/pages/login/index' });
    },
});
