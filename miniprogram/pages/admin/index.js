const api = require('../../utils/api');
const { getUserInfo } = require('../../utils/storage');
const {
  getRoleDisplayName,
  getRolePermissions,
  isAdminOrSupervisor,
} = require('../../utils/permission');
const { onDataRefresh } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');

Page({
  data: {
    loadingStats: false,
    loadingHistory: false,
    stats: null,
    history: { page: 1, pageSize: 10, hasMore: true, list: [] },
    userInfo: null,
    roleDisplayName: '',
    onlineCount: 0,
    showApprovalEntry: false,
    _unsubscribeRefresh: null, // 保存取消订阅函数
    // 修改密码
    showChangePwd: false,
    savingPwd: false,
    pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' },
    // 邀请员工
    showInviteSection: false,
    tenantCode: '',
    tenantName: '',
    // 问题反馈
    showFeedbackForm: false,
    feedbackForm: { category: 'BUG', title: '', content: '', contact: '' },
    submittingFeedback: false,
    myFeedbacks: [],
    showMyFeedbacks: false,
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 3);
    }
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }

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
    this._unsubscribeRefresh = onDataRefresh(payload => {
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
    if (this._loadingSystemInfo) {
      return;
    }
    this._loadingSystemInfo = true;
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

      // 加载租户信息（用于邀请员工）——平台管理员无 tenantId不展示
      const userInfo = getUserInfo();
      const hasTenant = !!(userInfo && userInfo.tenantId);
      if (hasTenant && this.data.showApprovalEntry) {
        try {
          const tenantRes = await api.tenant.myTenant();
          const td = tenantRes?.data || tenantRes || {};
          this.setData({
            showInviteSection: true,
            tenantCode: td.tenantCode || '',
            tenantName: td.tenantName || '',
          });
        } catch (e) {
          console.error('加载租户信息失败', e);
        }
      }

      this.setData({
        onlineCount: Number(onlineCount) || 0,
      });
    } catch (e) {
      console.error('加载系统信息失败', e);
    } finally {
      this._loadingSystemInfo = false;
    }
  },

  onPullDownRefresh() {
    this.refreshAll(true).finally(() => wx.stopPullDownRefresh());
  },

  refreshAll(reset) {
    const shouldReset = reset === true;
    return Promise.all([this.loadStats(), this.loadHistory(shouldReset), this.loadSystemInfo()]);
  },

  async loadStats() {
    if (this.data.loadingStats) {
      return;
    }
    this.setData({ loadingStats: true });
    try {
      const stats = await api.production.personalScanStats({ period: 'month' });
      this.setData({ stats: stats || null });
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }
      const app = getApp();
      if (app && typeof app.toastError === 'function') {
        app.toastError(e, '加载失败');
      }
    } finally {
      this.setData({ loadingStats: false });
    }
  },

  // 辅助函数：检查记录是否有效（只排除失败记录）
  _isValidHistoryRecord(item) {
    const scanResult = (item.scanResult || '').toLowerCase();
    const isFailure = scanResult === 'failure';

    // ✅ 保留采购记录（用于追踪谁处理了采购，虽然不计算工资）
    return !isFailure;
  },

  // 辅助函数：合并历史记录列表
  _mergeHistoryList(history, newRecords, reset) {
    const filteredRecords = newRecords.filter(item => this._isValidHistoryRecord(item));
    const prev = Array.isArray(history.list) ? history.list : [];
    return reset ? filteredRecords : prev.concat(filteredRecords);
  },

  /**
   * 获取分页配置
   * @private
   * @param {Object} history - 历史记录对象
   * @param {boolean} reset - 是否重置
   * @returns {Object} { nextPage, pageSize }
   */
  _getPageConfig(history, reset) {
    const nextPage = reset ? 1 : (Number(history.page) || 1) + 1;
    const pageSize = Number(history.pageSize) || 10;
    return { nextPage, pageSize };
  },

  /**
   * 处理历史记录加载结果
   * @private
   * @param {Object} page - 分页数据
   * @param {Object} history - 当前历史记录对象
   * @param {boolean} reset - 是否重置
   * @param {number} nextPage - 下一页页码
   * @param {number} pageSize - 每页大小
   * @returns {Object} 更新后的历史记录对象
   */
  _buildHistoryData(page, history, reset, nextPage, pageSize) {
    const records = page && Array.isArray(page.records) ? page.records : [];
    const merged = this._mergeHistoryList(history, records, reset);

    const app = getApp();
    const hasMore = app && typeof app.hasMoreByPage === 'function' ? app.hasMoreByPage(page) : true;

    return {
      ...history,
      page: nextPage,
      pageSize,
      list: merged,
      hasMore,
    };
  },

  async loadHistory(reset) {
    if (this.data.loadingHistory) {
      return;
    }

    const history = {
      page: 1,
      pageSize: 10,
      hasMore: true,
      list: [],
      ...(this.data.history || {}),
    };

    if (!reset && history.hasMore === false) {
      return;
    }

    const { nextPage, pageSize } = this._getPageConfig(history, reset);

    this.setData({ loadingHistory: true });

    try {
      const page = await api.production.myScanHistory({ page: nextPage, pageSize });
      const historyData = this._buildHistoryData(page, history, reset, nextPage, pageSize);
      this.setData({ history: historyData });
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }

      const app = getApp();
      if (app && typeof app.toastError === 'function') {
        app.toastError(e, '加载失败');
      }
    } finally {
      this.setData({ loadingHistory: false });
    }
  },

  loadMoreHistory() {
    this.loadHistory(false);
  },

  onLogout() {
    const app = getApp();
    if (app && typeof app.logout === 'function') {
      app.logout();
    } else {
      safeNavigate({ url: '/pages/login/index' }, 'reLaunch').catch(() => {});
    }
  },

  // ========== 修改密码 ==========
  onShowChangePwd() {
    this.setData({ showChangePwd: true, pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' } });
  },

  onCancelChangePwd() {
    this.setData({ showChangePwd: false, pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' } });
  },

  onOldPwdInput(e) {
    this.setData({ 'pwdForm.oldPassword': e.detail.value });
  },

  onNewPwdInput(e) {
    this.setData({ 'pwdForm.newPassword': e.detail.value });
  },

  onConfirmPwdInput(e) {
    this.setData({ 'pwdForm.confirmPassword': e.detail.value });
  },

  async onSubmitChangePwd() {
    if (this.data.savingPwd) return;
    const { oldPassword, newPassword, confirmPassword } = this.data.pwdForm;
    if (!oldPassword) { wx.showToast({ title: '请输入原密码', icon: 'none' }); return; }
    if (!newPassword || newPassword.length < 6) { wx.showToast({ title: '新密码不能少于6位', icon: 'none' }); return; }
    if (newPassword !== confirmPassword) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
    this.setData({ savingPwd: true });
    try {
      await api.system.changePassword(oldPassword, newPassword);
      wx.showToast({ title: '密码修改成功', icon: 'success' });
      this.setData({ showChangePwd: false, pwdForm: { oldPassword: '', newPassword: '', confirmPassword: '' } });
    } catch (e) {
      wx.showToast({ title: e && e.errMsg ? e.errMsg : '修改失败', icon: 'none' });
    } finally {
      this.setData({ savingPwd: false });
    }
  },

  onGoToUserApproval() {
    safeNavigate({
      url: '/pages/admin/user-approval/index',
    }).catch(() => {});
  },

  onGoToNotification() {
    safeNavigate({
      url: '/pages/admin/notification/index',
    }).catch(() => {});
  },

  // ========== 邀请员工 ==========
  onCopyTenantCode() {
    const code = this.data.tenantCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '工厂码已复制', icon: 'success' }),
    });
  },

  onCopyInviteUrl() {
    const code = this.data.tenantCode;
    const name = this.data.tenantName;
    if (!code) return;
    // 拼注册链接（PC端地址）
    const app = getApp();
    const baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
    // 去掉 /api 后缀，精确到域名+端口
    const origin = baseUrl.replace(/\/api\/?$/, '').replace(/\/$/, '');
    const url = `${origin}/register?tenantCode=${encodeURIComponent(code)}&tenantName=${encodeURIComponent(name)}`;
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '注册链接已复制', icon: 'success' }),
    });
  },

  // ========== 问题反馈 ==========
  onShowFeedbackForm() {
    this.setData({
      showFeedbackForm: true,
      feedbackForm: { category: 'BUG', title: '', content: '', contact: '' },
    });
  },

  onCloseFeedbackForm() {
    this.setData({ showFeedbackForm: false });
  },

  onFeedbackCategoryChange(e) {
    const categories = ['BUG', 'SUGGESTION', 'QUESTION', 'OTHER'];
    this.setData({ 'feedbackForm.category': categories[e.detail.value] || 'BUG' });
  },

  onFeedbackTitleInput(e) {
    this.setData({ 'feedbackForm.title': e.detail.value });
  },

  onFeedbackContentInput(e) {
    this.setData({ 'feedbackForm.content': e.detail.value });
  },

  onFeedbackContactInput(e) {
    this.setData({ 'feedbackForm.contact': e.detail.value });
  },

  async onSubmitFeedback() {
    if (this.data.submittingFeedback) return;

    const { category, title, content, contact } = this.data.feedbackForm;
    if (!title || !title.trim()) {
      wx.showToast({ title: '请输入标题', icon: 'none' });
      return;
    }
    if (!content || !content.trim()) {
      wx.showToast({ title: '请描述问题详情', icon: 'none' });
      return;
    }

    this.setData({ submittingFeedback: true });
    try {
      await api.system.submitFeedback({
        source: 'MINIPROGRAM',
        category: category || 'BUG',
        title: title.trim(),
        content: content.trim(),
        contact: (contact || '').trim() || undefined,
      });
      wx.showToast({ title: '反馈提交成功', icon: 'success' });
      this.setData({
        showFeedbackForm: false,
        feedbackForm: { category: 'BUG', title: '', content: '', contact: '' },
      });
      // 刷新我的反馈列表
      this.loadMyFeedbacks();
    } catch (e) {
      wx.showToast({ title: (e && e.errMsg) || '提交失败', icon: 'none' });
    } finally {
      this.setData({ submittingFeedback: false });
    }
  },

  onToggleMyFeedbacks() {
    const show = !this.data.showMyFeedbacks;
    this.setData({ showMyFeedbacks: show });
    if (show && this.data.myFeedbacks.length === 0) {
      this.loadMyFeedbacks();
    }
  },

  async loadMyFeedbacks() {
    try {
      const res = await api.system.myFeedbackList({ page: 1, pageSize: 10 });
      const records = (res && res.records) || [];
      this.setData({ myFeedbacks: records });
    } catch (e) {
      console.error('加载我的反馈失败', e);
    }
  },
});
