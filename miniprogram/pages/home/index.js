const api = require('../../utils/api');
const reminderManager = require('../../utils/reminderManager');

function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function pickNumber(data, keys) {
    if (!data || typeof data !== 'object') return 0;
    for (let i = 0; i < keys.length; i += 1) {
        const key = keys[i];
        if (data[key] != null) return toNumber(data[key]);
    }
    return 0;
}

function normalizeStats(payload) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const productionCount = pickNumber(data, ['productionCount', 'production_count', 'productionOrderCount', 'production_order_count', 'orderCount', 'ordersCount', 'productionOrders', 'production_orders']);
    const warehousingOrderCount = pickNumber(data, ['warehousingOrderCount', 'warehousing_order_count', 'todayWarehousingCount', 'today_warehousing_count', 'warehousingToday', 'warehousing_today']);
    const unqualifiedQuantity = pickNumber(data, ['unqualifiedQuantity', 'unqualified_quantity', 'defectCount', 'defect_count', 'badCount', 'bad_count']);
    const materialPurchase = pickNumber(data, ['materialPurchase', 'material_purchase', 'materialPurchaseCount', 'material_purchase_count', 'purchaseCount', 'purchase_count', 'procurementCount', 'procurement_count']);
    return {
        styleCount: pickNumber(data, ['styleCount', 'style_count', 'styleTotal']),
        productionCount,
        productionOrders: productionCount,
        pendingReconciliationCount: pickNumber(data, ['pendingReconciliationCount', 'pending_reconciliation_count']),
        paymentApprovalCount: pickNumber(data, ['paymentApprovalCount', 'payment_approval_count']),
        todayScanCount: pickNumber(data, ['todayScanCount', 'today_scan_count']),
        warehousingOrderCount,
        warehousingToday: warehousingOrderCount,
        unqualifiedQuantity,
        defectCount: unqualifiedQuantity,
        materialPurchase,
        urgentEventCount: pickNumber(data, ['urgentEventCount', 'urgent_event_count']),
    };
}

function normalizeActivities(payload) {
    const data = payload && typeof payload === 'object' ? payload : {};
    const list = Array.isArray(data.recentActivities) ? data.recentActivities : [];
    return list
        .map((item) => {
            const v = item && typeof item === 'object' ? item : {};
            return {
                id: v.id != null ? String(v.id) : '',
                type: v.type != null ? String(v.type) : '',
                content: v.content != null ? String(v.content) : '',
                time: v.time != null ? String(v.time) : '',
            };
        })
        .filter((item) => item.content);
}

Page({
    data: {
        loading: false,
        statsLoaded: false,
        keyword: '',
        showReminderPanel: false,
        reminderCount: 0,
        reminders: [],
        stats: {
            styleCount: 0,
            productionCount: 0,
            productionOrders: 0,
            pendingReconciliationCount: 0,
            paymentApprovalCount: 0,
            todayScanCount: 0,
            warehousingOrderCount: 0,
            warehousingToday: 0,
            unqualifiedQuantity: 0,
            defectCount: 0,
            materialPurchase: 0,
            urgentEventCount: 0,
        },
        activities: [],
    },

    onShow() {
        const app = getApp();
        if (app && typeof app.setTabSelected === 'function') app.setTabSelected(this, 0);
        if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
        this.loadStats();
        
        // 加载提醒列表
        this.loadReminders();
    },

    onPullDownRefresh() {
        this.loadStats().finally(() => wx.stopPullDownRefresh());
    },

    refresh() {
        this.loadStats();
    },

    onKeywordInput(e) {
        this.setData({ keyword: (e && e.detail && e.detail.value) || '' });
    },

    queryByKeyword() {
        this.loadStats();
    },

    resetKeyword() {
        this.setData({ keyword: '' });
        this.loadStats();
    },

    buildDashboardParams() {
        const raw = String(this.data.keyword || '').trim();
        if (!raw) return {};
        return {
            brand: raw,
            factory: raw,
        };
    },

    goWork(e) {
        const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
        if (tab) {
            try {
                wx.setStorageSync('work_active_tab', tab);
            } catch (err) {
                null;
            }
        }
        wx.switchTab({ url: '/pages/work/index' });
    },

    goScan() {
        wx.switchTab({ url: '/pages/scan/index' });
    },

    goAdmin() {
        wx.switchTab({ url: '/pages/admin/index' });
    },

    async loadStats() {
        if (this.data.loading) return;
        this.setData({ loading: true });
        try {
            const params = this.buildDashboardParams();
            const resp = await api.dashboard.get(params);
            const payload = resp && resp.data != null ? resp.data : resp;
            const stats = normalizeStats(payload);
            const activities = normalizeActivities(payload);
            this.setData({ stats, statsLoaded: true, activities });
        } catch (e) {
            if (e && e.type === 'auth') return;
            const app = getApp();
            if (app && typeof app.toastError === 'function') app.toastError(e, '加载失败');
        } finally {
            this.setData({ loading: false });
        }
    },

    loadReminders() {
        const allReminders = reminderManager.getReminders();
        const now = Date.now();
        const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时
        
        // 过滤出需要提醒的（超过10小时）
        const pendingReminders = allReminders.filter(r => {
            return now - r.timestamp >= REMINDER_INTERVAL;
        });
        
        // 格式化时间显示
        const reminders = pendingReminders.map(r => {
            const hours = Math.floor((now - r.timestamp) / (60 * 60 * 1000));
            const timeAgo = hours < 24 ? `${hours}小时前` : `${Math.floor(hours / 24)}天前`;
            return {
                id: `${r.orderId}_${r.type}`,
                orderId: r.orderId,
                type: r.type,
                timestamp: r.timestamp,
                timeAgo,
            };
        });
        
        this.setData({ 
            reminders,
            reminderCount: reminders.length,
        });
    },

    toggleReminderPanel() {
        this.setData({ showReminderPanel: !this.data.showReminderPanel });
    },

    handleReminderClick(e) {
        const reminder = e.currentTarget.dataset.reminder;
        if (!reminder) return;
        
        // 关闭面板
        this.setData({ showReminderPanel: false });
        
        // 跳转到扫码页面处理
        wx.switchTab({ 
            url: '/pages/scan/index',
            success: () => {
                // 可以在这里传递订单信息，但switchTab不支持传参
                // 可以使用storage临时存储
                try {
                    wx.setStorageSync('pending_order_hint', reminder.orderId);
                } catch (e) {
                    console.error('存储失败', e);
                }
            },
        });
    },
});
