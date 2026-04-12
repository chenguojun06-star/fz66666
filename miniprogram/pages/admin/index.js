const api = require('../../utils/api');
const { getUserInfo, getToken, setUserInfo } = require('../../utils/storage');
const { getBaseUrl } = require('../../config');
const { getRoleDisplayName, isAdminOrSupervisor } = require('../../utils/permission');
const { onDataRefresh } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');
const i18n = require('../../utils/i18n/index');

function buildMenuItems({ showInviteSection, showApprovalEntry, currentLanguageName }) {
  const items = [
    { id: 'password', label: '修改密码', iconClass: 'icon-lock', url: '/pages/admin/change-password/index' },
    { id: 'payroll', label: '工资查询', iconClass: 'icon-payroll', url: '/pages/payroll/payroll' },
    { id: 'feedback', label: '问题反馈', iconClass: 'icon-feedback', url: '/pages/admin/feedback/index' },
  ];

  if (showInviteSection) {
    items.splice(2, 0, { id: 'invite', label: '邀请员工', iconClass: 'icon-user-group', url: '/pages/admin/invite/index' });
  }

  if (showApprovalEntry) {
    items.push(
      { id: 'approval', label: '用户审批', iconClass: 'icon-approval', url: '/pages/admin/user-approval/index' },
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
    showInviteSection: false,
    currentLanguage: 'zh-CN',
    currentLanguageName: '中文',
    languageNameMap: {
      'zh-CN': '中文',
      'en-US': 'English',
      'vi-VN': 'Ti\u1ebfng Vi\u1ec7t',
      'km-KH': '\u1781\u17d2\u1798\u17c2\u179a',
    },
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
    this.loadUserInfo(isAdminOrSupervisor());
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
    this.setData({
      currentLanguage: language,
      currentLanguageName: languageNameMap[language] || '中文',
      languageNameMap,
    });
    this.refreshMenuItems();
  },

  refreshMenuItems() {
    this.setData({
      menuItems: buildMenuItems({
        showInviteSection: this.data.showInviteSection,
        showApprovalEntry: this.data.showApprovalEntry,
        currentLanguageName: this.data.currentLanguageName,
      }),
    });
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
    const { languageNameMap } = this.data;
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
  },

  onHide() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
  },

  onUnload() {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
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
      if (rawAvatar.startsWith('http://') || rawAvatar.startsWith('https://')) {
        avatarImgUrl = rawAvatar;
      } else {
        const token = getToken();
        const base = getBaseUrl().replace(/\/$/, '');
        const sep = rawAvatar.includes('?') ? '&' : '?';
        avatarImgUrl = `${base}${rawAvatar}${sep}token=${encodeURIComponent(token)}`;
      }
    }

    const patch = { userInfo, roleDisplayName, avatarLetter, avatarImgUrl };
    if (typeof showApprovalEntry === 'boolean') {
      patch.showApprovalEntry = showApprovalEntry;
    }
    this.setData(patch);
    this.refreshMenuItems();

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
      if (hasTenant && this.data.showApprovalEntry) {
        try {
          await api.tenant.myTenant();
          this.setData({ showInviteSection: true }, () => this.refreshMenuItems());
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
