import api from '../../utils/api';
import { getUserInfo, getUserRoleName } from '../../utils/storage';
import { getRoleDisplayName, getRolePermissions, isAdminOrSupervisor } from '../../utils/permission';
import { onDataRefresh, triggerDataRefresh, Events } from '../../utils/eventBus';

Page({
    data: {
        loadingStats: false,
        loadingHistory: false,
        loadingSystemInfo: false,
        stats: null,
        history: { page: 1, pageSize: 10, hasMore: true, list: [] },
        userInfo: null,
        roleDisplayName: '',
        onlineCount: 0,
        permissions: [],
        pendingUserCount: 0,
        showApprovalEntry: false,
        _unsubscribeRefresh: null, // 保存取消订阅函数
    },

    onShow() {
        const app = getApp();
        if (app && typeof app.setTabSelected === 'function') app.setTabSelected(this, 3);
        if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
        
        // 加载用户信息
        this.loadUserInfo();
        
        // 检查是否显示审批入口
        const showApproval = isAdminOrSupervisor();
        this.setData({ showApprovalEntry: showApproval });
        
        // 加载系统信息
        this.loadSystemInfo();
        
        this.refreshAll(true);
        
        // 设置数据刷新监听
        this.setupDataRefreshListener();
    },
    
    setupDataRefreshListener() {
        // 如果已经设置监听，先取消旧的
        if (this._unsubscribeRefresh) {
            this._unsubscribeRefresh();
        }
        
        // 订阅数据刷新事件
        this._unsubscribeRefresh = onDataRefresh((payload) => {
            console.log('[个人页面] 收到数据变更通知:', payload);
            // 刷新当前页面数据
            this.refreshAll(true);
        });
    },
    
    onHide() {
        // 页面隐藏时取消监听
        if (this._unsubscribeRefresh) {
            this._unsubscribeRefresh();
            this._unsubscribeRefresh = null;
        }
    },
    
    onUnload() {
        // 页面卸载时取消监听
        if (this._unsubscribeRefresh) {
            this._unsubscribeRefresh();
            this._unsubscribeRefresh = null;
        }
    },
    
    loadUserInfo() {
        const userInfo = getUserInfo();
        const roleDisplayName = getRoleDisplayName();
        const userName = userInfo?.name || userInfo?.username || '未知';
        const avatarLetter = userName.charAt(0);
        this.setData({ userInfo, roleDisplayName, avatarLetter });
    },

    async loadSystemInfo() {
        if (this.data.loadingSystemInfo) return;
        this.setData({ loadingSystemInfo: true });
        try {
            // 加载在线人数
            const onlineCount = await api.system.getOnlineCount();
            
            // 使用预定义的角色权限
            const permissions = getRolePermissions();
            
            // 如果是管理员，加载待审批用户数量
            let pendingUserCount = 0;
            if (this.data.showApprovalEntry) {
                try {
                    const result = await api.system.listPendingUsers({ page: 1, pageSize: 1 });
                    pendingUserCount = result?.total || 0;
                } catch (e) {
                    console.error('加载待审批用户数量失败', e);
                }
            }
            
            this.setData({ 
                onlineCount: Number(onlineCount) || 0, 
                permissions,
                pendingUserCount
            });
        } catch (e) {
            console.error('加载系统信息失败', e);
            // 即使在线人数加载失败，也显示本地权限
            const permissions = getRolePermissions();
            this.setData({ permissions });
        } finally {
            this.setData({ loadingSystemInfo: false });
        }
    },

    onPullDownRefresh() {
        this.refreshAll(true).finally(() => wx.stopPullDownRefresh());
    },

    refreshAll(reset) {
        const shouldReset = reset === true;
        return Promise.all([
            this.loadStats(),
            this.loadHistory(shouldReset),
            this.loadSystemInfo(),
        ]);
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
            // 过滤掉采购类型的记录（物料采购不计入工资统计）和失败记录（退回后被作废的记录）
            const filteredRecords = records.filter(item => {
                const scanType = (item.scanType || '').toLowerCase();
                const processName = (item.processName || '').toLowerCase();
                const scanResult = (item.scanResult || '').toLowerCase();
                return scanType !== 'procurement' && 
                       !processName.includes('采购') && 
                       !processName.includes('物料') &&
                       scanResult !== 'failure'; // 排除已作废的记录
            });
            const prev = Array.isArray(history.list) ? history.list : [];
            const merged = reset ? filteredRecords : prev.concat(filteredRecords);
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

    onGoToUserApproval() {
        wx.navigateTo({
            url: '/pages/admin/user-approval/index'
        });
    },

    onGoToNotification() {
        wx.navigateTo({
            url: '/pages/admin/notification/index'
        });
    }
});
