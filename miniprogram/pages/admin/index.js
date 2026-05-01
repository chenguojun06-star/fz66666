const api = require('../../utils/api');
const { getUserInfo, getToken, setUserInfo, isFactoryOwner } = require('../../utils/storage');
const { getBaseUrl } = require('../../config');
const { getRoleDisplayName, isAdminOrSupervisor } = require('../../utils/permission');
const { onDataRefresh, eventBus, Events } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const i18n = require('../../utils/i18n/index');

function buildMenuItems({ showInviteSection, showApprovalEntry, currentLanguageName: _currentLanguageName, approvalPending }) {
  const items = [
    { id: 'password', label: '修改密码', iconClass: 'icon-lock', url: '/pages/admin/misc/change-password/index' },
    { id: 'payroll', label: '工资查询', iconClass: 'icon-payroll', url: '/pages/payroll/payroll' },
    { id: 'feedback', label: '问题反馈', iconClass: 'icon-feedback', url: '/pages/admin/misc/feedback/index' },
  ];

  if (showInviteSection) {
    items.splice(2, 0, { id: 'invite', label: '邀请员工', iconClass: 'icon-user-group', url: '/pages/admin/misc/invite/index' });
  }

  if (showApprovalEntry) {
    items.push(
      { id: 'approval', label: '用户审批', iconClass: 'icon-approval', url: '/pages/admin/user-approval/index', badge: approvalPending || 0 },
    );
  }

  // 语言切换暂时隐藏（i18n 模块保留，仅隐藏入口）
  // items.push({ id: 'language', label: '切换语言', iconClass: 'icon-globe', action: 'switchLanguage', value: currentLanguageName || '中文' });
  return items;
}

Page({
  data: {
    userInfo: null,
    roleDisplayName: '',
    avatarLetter: '',
    avatarImgUrl: '',
    onlineCount: 0,
    showApprovalEntry: false,
    // showInviteSection / recruitInfo 已迁移到 this._showInviteSection / this._recruitInfo 实例属性
    // 这两个变量只作为 buildMenuItems / onCopyRecruitCode 的输入，不参与 WXML 渲染，
    // 避免 setData 传入未绑定 WXML 变量的性能告警。
    currentLanguage: 'zh-CN',
    currentLanguageName: '中文',
    menuItems: [],
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    const lang = i18n.getLanguage();
    if (lang !== this.data.currentLanguage) {
      this.applyLanguage(lang);
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    this.loadUserInfo(isAdminOrSupervisor() || isFactoryOwner());
    this.loadSystemInfo();
    this.setupDataRefreshListener();
  },

  applyLanguage(language) {
    const languageNameMap = {
      'zh-CN': i18n.t('language.names.zh-CN', language),
      'en-US': i18n.t('language.names.en-US', language),
      'vi-VN': i18n.t('language.names.vi-VN', language),
      'km-KH': i18n.t('language.names.km-KH', language),
    };
    this._languageNameMap = languageNameMap;
    this.setData({
      currentLanguage: language,
      currentLanguageName: languageNameMap[language] || '中文',
    });
    this.refreshMenuItems();
  },

  refreshMenuItems(pendingCount) {
    const approvalPending = pendingCount !== undefined ? pendingCount : this.data.approvalPending;
    this.setData({
      approvalPending: approvalPending,
      menuItems: buildMenuItems({
        showInviteSection: this._showInviteSection || false,
        showApprovalEntry: this.data.showApprovalEntry,
        currentLanguageName: this.data.currentLanguageName,
        approvalPending: approvalPending,
      }),
    });
  },

  async loadPendingApprovalCount() {
    try {
      const res = await api.tenant.listPendingRegistrations({ page: 1, pageSize: 1 });
      const total = res?.total || 0;
      this.refreshMenuItems(total);
    } catch (e) {
      console.warn('[Admin] 获取待审批数失败', e);
    }
  },

  onMenuTap(e) {
    const { index } = e.currentTarget.dataset;
    const item = this.data.menuItems[index];
    if (!item) return;
    if (item.action === 'switchLanguage') {
      this.onLanguageSwitchTap();
      return;
    }
    if (item.url) {
      wx.navigateTo({ url: item.url });
    }
  },

  onLanguageSwitchTap() {
    const languageNameMap = this._languageNameMap || { 'zh-CN': '中文', 'en-US': 'English', 'vi-VN': 'Tiếng Việt', 'km-KH': 'ភាសាខ្មែរ' };
    const langList = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];
    const itemList = langList.map((lang) => languageNameMap[lang] || lang);
    wx.showActionSheet({
      itemList,
      alertText: i18n.t('admin.switchLanguage', this.data.currentLanguage),
      success: ({ tapIndex }) => {
        const nextLang = langList[tapIndex] || 'zh-CN';
        const appliedLang = i18n.setLanguage(nextLang);
        this.applyLanguage(appliedLang);
        const tab = typeof this.getTabBar === 'function' ? this.getTabBar() : null;
        if (tab && typeof tab.refreshLanguage === 'function') {
          tab.refreshLanguage(appliedLang);
        }
        wx.showToast({ title: i18n.t('admin.languageSwitched', appliedLang), icon: 'success' });
      },
      fail: () => {},
    });
  },

  setupDataRefreshListener() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
    }
    this._unsubscribeRefresh = onDataRefresh(() => {
      this.loadUserInfo(isAdminOrSupervisor());
      this.loadSystemInfo();
    });

    if (this._wsBound) return;
    this._wsBound = true;
    this._onApprovalPending = () => { this.loadUserInfo(isAdminOrSupervisor()); };
    this._onApprovalResult = () => { this.loadUserInfo(isAdminOrSupervisor()); };
    this._onRefreshAll = () => { this.loadSystemInfo(); };
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onApprovalPending) eventBus.off('approval:pending', this._onApprovalPending);
    if (this._onApprovalResult) eventBus.off('approval:result', this._onApprovalResult);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  onHide() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
    this._unbindWsEvents();
  },

  onUnload() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
    this._unbindWsEvents();
  },

  onPullDownRefresh() {
    this.loadSystemInfo().finally(() => wx.stopPullDownRefresh());
  },

  loadUserInfo(showApprovalEntry) {
    const userInfo = getUserInfo();
    const roleDisplayName = getRoleDisplayName();
    const userName = userInfo?.name || userInfo?.username || '未知';
    const avatarLetter = userName.charAt(0);

    let avatarImgUrl = '';
    const rawAvatar = userInfo?.avatarUrl || userInfo?.avatar || userInfo?.headUrl || '';
    if (rawAvatar) {
      avatarImgUrl = getAuthedImageUrl(rawAvatar);
    }

    const patch = { userInfo, roleDisplayName, avatarLetter, avatarImgUrl };
    if (typeof showApprovalEntry === 'boolean') {
      patch.showApprovalEntry = showApprovalEntry;
    }
    this.setData(patch);
    this.refreshMenuItems(showApprovalEntry);

    // 如果显示审批入口，加载待审批数量（角标）
    if (showApprovalEntry) {
      this.loadPendingApprovalCount();
    }

    // 后台静默刷新用户信息（PC端改头像后小程序自动同步）
    api.system.getMe().then(res => {
      const freshUser = res?.data || res;
      if (!freshUser || !freshUser.name) return;
      setUserInfo(freshUser);
      const freshAvatar = freshUser.avatarUrl || freshUser.avatar || freshUser.headUrl || '';
      let freshImgUrl = '';
      if (freshAvatar) {
        if (freshAvatar.startsWith('http://') || freshAvatar.startsWith('https://')) {
          freshImgUrl = freshAvatar;
        } else {
          const token = getToken();
          const base = getBaseUrl().replace(/\/$/, '');
          const sep = freshAvatar.includes('?') ? '&' : '?';
          freshImgUrl = `${base}${freshAvatar}${sep}token=${encodeURIComponent(token)}`;
        }
      }
      if (freshImgUrl !== avatarImgUrl) {
        this.setData({ avatarImgUrl: freshImgUrl });
      }
    }).catch(() => {});
  },

  async loadSystemInfo() {
    if (this._loadingSystemInfo) return;
    this._loadingSystemInfo = true;
    try {
      const onlineCount = await api.system.getOnlineCount();
      const userInfo = getUserInfo();
      const hasTenant = !!(userInfo && userInfo.tenantId);
      // 所有有租户的用户均加载招募卡（管理员/工人/工厂主均可见）
      if (hasTenant) {
        try {
          const tenantResp = await api.tenant.myTenant();
          const tenantCode = (tenantResp && tenantResp.tenantCode) || '';
          const tenantName = (tenantResp && tenantResp.tenantName) || '';
          if (tenantCode) {
            this._recruitInfo = { show: true, tenantCode, tenantName };
          }
          // 所有有租户的用户均显示「邀请员工」菜单项（工人/管理员均可扫码邀请同事）
          this._showInviteSection = true;
          this.refreshMenuItems();
        } catch (e) {
          console.error('加载租户信息失败', e);
        }
      }
      this.setData({ onlineCount: Number(onlineCount) || 0 });
    } catch (e) {
      console.error('加载系统信息失败', e);
    } finally {
      this._loadingSystemInfo = false;
    }
  },

  onCopyRecruitCode() {
    const code = (this._recruitInfo && this._recruitInfo.tenantCode) || '';
    if (!code) {
      wx.showToast({ title: '暂无工厂码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '工厂码已复制', icon: 'success' }),
    });
  },

  onCopyRecruitUrl() {
    const { tenantCode = '', tenantName = '' } = this._recruitInfo || {};
    if (!tenantCode) {
      wx.showToast({ title: '暂无工厂码', icon: 'none' });
      return;
    }
    let baseUrl = '';
    try {
      const app = getApp();
      baseUrl = (app.globalData && app.globalData.baseUrl) || getBaseUrl();
    } catch (e) {
      baseUrl = getBaseUrl();
    }
    const origin = baseUrl.replace(/^(https?:\/\/)api\./, '$1www.').replace(/\/api\/?$/, '');
    const url = origin + '/register?tenantCode=' + encodeURIComponent(tenantCode)
      + '&tenantName=' + encodeURIComponent(tenantName || '');
    wx.setClipboardData({
      data: url,
      success: () => wx.showToast({ title: '注册链接已复制', icon: 'success' }),
    });
  },

  onLogout() {
    const app = getApp();
    if (app && typeof app.logout === 'function') {
      app.logout();
    } else {
      safeNavigate({ url: '/pages/login/index' }, 'reLaunch').catch(() => {});
    }
  },

  onAvatarError() {
    this.setData({ avatarImgUrl: '' });
  },
});
