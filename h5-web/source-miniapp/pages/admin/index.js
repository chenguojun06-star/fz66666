const api = require('../../utils/api');
const { getUserInfo, getToken, setUserInfo, isFactoryOwner, isTenantOwner } = require('../../utils/storage');
const { getBaseUrl } = require('../../config');
const { getRoleDisplayName, isAdminOrSupervisor } = require('../../utils/permission');
const { onDataRefresh, eventBus, Events } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const i18n = require('../../utils/i18n/index');

function maskPhone(phone) {
  if (!phone || phone.length < 7) return '';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

function buildMenuItems(opts) {
  const showInviteSection = opts.showInviteSection || false;
  const showApprovalEntry = opts.showApprovalEntry || false;
  const pendingCount = opts.pendingCount || '';
  const lang = opts.lang;
  const items = [];

  // Group 0: 管理功能（label 跟随传入的语言，refreshMenuItems 在 applyLanguage 后重跑）
  if (showApprovalEntry) {
    items.push({ id: 'approval', label: i18n.t('admin.menuApproval', lang), iconClass: 'icon-menu-user', iconBg: 'var(--color-primary)', url: '/pages/admin/user-approval/index', group: 0, badge: pendingCount });
  }
  items.push({ id: 'password', label: i18n.t('admin.menuPassword', lang), iconClass: 'icon-menu-password', iconBg: 'var(--color-success)', url: '/pages/admin/misc/change-password/index', group: 0 });

  // Group 1: 其他设置
  items.push({ id: 'feedback', label: i18n.t('admin.menuFeedback', lang), iconClass: 'icon-menu-feedback', iconBg: 'var(--color-warning)', url: '/pages/admin/misc/feedback/index', group: 1 });
  if (showInviteSection) {
    items.push({ id: 'invite', label: i18n.t('admin.menuInvite', lang), iconClass: 'icon-menu-invite', iconBg: 'var(--color-purple)', url: '/pages/admin/misc/invite/index', group: 1 });
  }

  // Group 2: 关于
  items.push({ id: 'privacy', label: i18n.t('admin.menuPrivacy', lang), iconClass: 'icon-menu-privacy', iconBg: 'var(--color-text-tertiary)', url: '/pages/privacy/index', group: 2 });
  items.push({ id: 'about', label: i18n.t('admin.menuAbout', lang), iconClass: 'icon-menu-confirm', iconBg: 'var(--color-text-tertiary)', url: '/pages/admin/misc/about/index', group: 2 });

  return items;
}

function buildMenuGroups(menuItems) {
  var groupMap = {};
  var groupOrder = [];
  var flatIndex = 0;
  menuItems.forEach(function (item) {
    item.flatIndex = flatIndex++;
    var g = item.group;
    if (!groupMap[g]) { groupMap[g] = []; groupOrder.push(g); }
    groupMap[g].push(item);
  });
  return groupOrder.map(function (key) {
    return { groupId: 'g' + key, items: groupMap[key] };
  });
}

Page({
  data: {
    userInfo: null,
    roleDisplayName: '',
    avatarLetter: '',
    avatarImgUrl: '',
    onlineCount: 0,
    onlineText: '',
    showApprovalEntry: false,
    currentLanguage: 'zh-CN',
    currentLanguageName: '中文',
    menuItems: [],
    menuGroups: [],
    tenantName: '',
    phoneText: '',
    stats: { workHours: '--', wageText: '¥0', scanCount: 0 },
    pendingCount: '',
  },

  onShow: function () {
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
    const canManage = isAdminOrSupervisor() || isFactoryOwner();
    this._showWagePayment = isTenantOwner() || isAdminOrSupervisor();
    this.loadUserInfo(canManage);
    this.loadSystemInfo();
    this.loadProfileStats();
    this.loadPendingCount();
    this.setupDataRefreshListener();
  },

  applyLanguage: function (language) {
    this._lang = language;
    const languageNameMap = {
      'zh-CN': i18n.t('language.names.zh-CN', language),
      'en-US': i18n.t('language.names.en-US', language),
      'vi-VN': i18n.t('language.names.vi-VN', language),
      'km-KH': i18n.t('language.names.km-KH', language),
    };
    this._languageNameMap = languageNameMap;
    this.setData({
      currentLanguage: language,
      currentLanguageName: languageNameMap[language] || language,
      // 「我的」页静态文案（wxml 用 {{t.xxx}}）
      t: {
        unknownUser: i18n.t('admin.unknownUser', language),
        defaultRole: i18n.t('admin.defaultRole', language),
        statHours: i18n.t('admin.statHours', language),
        statWage: i18n.t('admin.statWage', language),
        statScans: i18n.t('admin.statScans', language),
        logout: i18n.t('admin.logout', language),
      },
      onlineText: i18n.tf('admin.onlineCount', { count: this._onlineCount || 0 }, language),
    });
    // 语言切换就在本页发生，底栏必须立刻跟着变（不能等用户切到别的 tab）
    i18n.applyTabBar(language);
    // 导航栏标题复用 tabbar.admin（与 more-apps 复用 home.appMoreApps 同先例）
    wx.setNavigationBarTitle({ title: i18n.t('tabbar.admin', language) });
    this.refreshMenuItems();
  },

  refreshMenuItems: function () {
    const menuItems = buildMenuItems({
      lang: this._lang,
      showInviteSection: this._showInviteSection || false,
      showApprovalEntry: this.data.showApprovalEntry,
      pendingCount: this.data.pendingCount || '',
    });
    const menuGroups = buildMenuGroups(menuItems);
    this.setData({ menuItems: menuItems, menuGroups: menuGroups });
  },

  onMenuTap: function (e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.menuItems[index];
    if (!item) return;
    if (item.action === 'switchLanguage') {
      this.onLanguageSwitchTap();
      return;
    }
    if (item.url) {
      safeNavigate({ url: item.url }).catch(() => {});
    }
  },

  onLanguageSwitchTap: function () {
    const languageNameMap = this._languageNameMap || { 'zh-CN': '中文', 'en-US': 'English', 'vi-VN': 'Tiếng Việt', 'km-KH': 'ភាសាខ្មែរ' };
    const langList = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];
    const itemList = langList.map(function (lang) { return languageNameMap[lang] || lang; });
    const that = this;
    wx.showActionSheet({
      itemList: itemList,
      alertText: i18n.t('admin.switchLanguage', that.data.currentLanguage),
      success: function (res) {
        const nextLang = langList[res.tapIndex] || 'zh-CN';
        const appliedLang = i18n.setLanguage(nextLang);
        that.applyLanguage(appliedLang);
        const tab = typeof that.getTabBar === 'function' ? that.getTabBar() : null;
        if (tab && typeof tab.refreshLanguage === 'function') {
          tab.refreshLanguage(appliedLang);
        }
        wx.showToast({ title: i18n.t('admin.languageSwitched', appliedLang), icon: 'success' });
      },
      fail: function () {},
    });
  },

  setupDataRefreshListener: function () {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
    }
    this._unsubscribeRefresh = onDataRefresh(function () {
      this.loadUserInfo(isAdminOrSupervisor());
      this.loadSystemInfo();
      this.loadProfileStats();
      this.loadPendingCount();
    }.bind(this));

    if (this._wsBound) return;
    this._wsBound = true;
    this._onApprovalPending = function () { this.loadUserInfo(isAdminOrSupervisor()); }.bind(this);
    this._onApprovalResult = function () { this.loadUserInfo(isAdminOrSupervisor()); }.bind(this);
    this._onRefreshAll = function () { this.loadSystemInfo(); }.bind(this);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents: function () {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onApprovalPending) eventBus.off('approval:pending', this._onApprovalPending);
    if (this._onApprovalResult) eventBus.off('approval:result', this._onApprovalResult);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  onHide: function () {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
    this._unbindWsEvents();
  },

  onUnload: function () {
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
    this._unbindWsEvents();
  },

  onPullDownRefresh: function () {
    const self = this;
    Promise.all([
      this.loadSystemInfo(),
      new Promise(function (resolve) {
        self.loadProfileStats();
        resolve();
      }),
      new Promise(function (resolve) {
        self.loadPendingCount();
        resolve();
      }),
    ]).finally(function () { wx.stopPullDownRefresh(); });
  },

  loadUserInfo: function (showApprovalEntry) {
    const userInfo = getUserInfo();
    const roleDisplayName = getRoleDisplayName();
    const userName = (userInfo && userInfo.name) || (userInfo && userInfo.username) || i18n.t('admin.unknownUser');
    const avatarLetter = userName.charAt(0);

    let avatarImgUrl = '';
    const rawAvatar = (userInfo && (userInfo.avatarUrl || userInfo.avatar || userInfo.headUrl)) || '';
    if (rawAvatar) {
      avatarImgUrl = getAuthedImageUrl(rawAvatar);
    }

    const phoneText = maskPhone((userInfo && userInfo.phone) || '');
    const patch = { userInfo: userInfo, roleDisplayName: roleDisplayName, avatarLetter: avatarLetter, avatarImgUrl: avatarImgUrl, phoneText: phoneText };
    if (typeof showApprovalEntry === 'boolean') {
      patch.showApprovalEntry = showApprovalEntry;
    }
    this.setData(patch);
    this.refreshMenuItems();

    api.system.getMe().then(function (res) {
      const freshUser = res;
      if (!freshUser || !freshUser.name) return;
      setUserInfo(freshUser);
      const freshAvatar = freshUser.avatarUrl || freshUser.avatar || freshUser.headUrl || '';
      let freshImgUrl = '';
      if (freshAvatar) {
        if (freshAvatar.indexOf('http://') === 0 || freshAvatar.indexOf('https://') === 0) {
          freshImgUrl = freshAvatar;
        } else {
          const token = getToken();
          const base = getBaseUrl().replace(/\/$/, '');
          const sep = freshAvatar.indexOf('?') !== -1 ? '&' : '?';
          freshImgUrl = base + freshAvatar + sep + 'token=' + encodeURIComponent(token);
        }
      }
      var freshPatch = {};
      if (freshImgUrl) {
        // D-212：PC 端换头像后文件路径可能相同，加时间戳破 <image> 缓存，保证与 PC 同步
        var sep2 = freshImgUrl.indexOf('?') !== -1 ? '&' : '?';
        freshImgUrl = freshImgUrl + sep2 + 't=' + Date.now();
      }
      if (freshImgUrl !== avatarImgUrl) {
        freshPatch.avatarImgUrl = freshImgUrl;
      }
      var freshPhone = maskPhone(freshUser.phone || '');
      if (freshPhone && freshPhone !== phoneText) {
        freshPatch.phoneText = freshPhone;
      }
      if (Object.keys(freshPatch).length) {
        this.setData(freshPatch);
      }
    }.bind(this)).catch(function () {});
  },

  loadSystemInfo: function () {
    if (this._loadingSystemInfo) return;
    this._loadingSystemInfo = true;
    const self = this;
    api.system.getOnlineCount().then(function (onlineCount) {
      const userInfo = getUserInfo();
      const hasTenant = !!(userInfo && userInfo.tenantId);
      if (hasTenant) {
        return api.tenant.myTenant().then(function (tenantResp) {
          const tenantCode = (tenantResp && tenantResp.tenantCode) || '';
          const tenantName = (tenantResp && tenantResp.tenantName) || '';
          if (tenantCode) {
            self._recruitInfo = { show: true, tenantCode: tenantCode, tenantName: tenantName };
          }
          self._showInviteSection = true;
          self.setData({ tenantName: tenantName || '' });
          self.refreshMenuItems();
          return onlineCount;
        }).catch(function (e) {
          console.error('加载租户信息失败', e);
          return onlineCount;
        });
      }
      return onlineCount;
    }).then(function (onlineCount) {
      self._onlineCount = Number(onlineCount) || 0;
      self.setData({
        onlineCount: self._onlineCount,
        onlineText: i18n.tf('admin.onlineCount', { count: self._onlineCount }),
      });
    }).catch(function (e) {
      console.error('加载系统信息失败', e);
    }).finally(function () {
      self._loadingSystemInfo = false;
    });
  },

  onCopyRecruitCode: function () {
    const code = (this._recruitInfo && this._recruitInfo.tenantCode) || '';
    if (!code) {
      wx.showToast({ title: i18n.t('admin.noFactoryCode'), icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: function () { wx.showToast({ title: i18n.t('admin.factoryCodeCopied'), icon: 'success' }); },
    });
  },

  loadPendingCount: function () {
    const self = this;
    if (!this.data.showApprovalEntry) return;
    api.system.listPendingUsers({ page: 1, pageSize: 1 }).then(function (res) {
      const count = (res && res.total) || (res && res.records && res.records.length) || 0;
      self.setData({ pendingCount: count > 0 ? String(count) : '' });
      self.refreshMenuItems();
    }).catch(function () {});
  },

  loadProfileStats: function () {
    const self = this;
    // 本月工时从打卡 API 获取（独立打卡，方案 C）
    api.attendance.monthlyStats().then(function (res) {
      const hours = Number((res && res.workHours) || 0);
      self.setData({ 'stats.workHours': hours.toFixed(1) });
    }).catch(function () {
      self.setData({ 'stats.workHours': '--' });
    });
    // 扫码次数 + 本月工资仍走 personalScanStats
    api.production.personalScanStats({ period: 'month' }).then(function (res) {
      const scanCount = (res && res.scanCount) || 0;
      const totalAmount = Number((res && res.totalAmount) || 0);
      self.setData({
        'stats.scanCount': scanCount,
        'stats.wageText': totalAmount > 0 ? '\u00a5' + totalAmount.toLocaleString() : '\u00a50',
      });
    }).catch(function () {});
  },

  onCopyRecruitUrl: function () {
    const recruitInfo = this._recruitInfo || {};
    const tenantCode = recruitInfo.tenantCode || '';
    const tenantName = recruitInfo.tenantName || '';
    if (!tenantCode) {
      wx.showToast({ title: i18n.t('admin.noFactoryCode'), icon: 'none' });
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
      success: function () { wx.showToast({ title: i18n.t('admin.registerLinkCopied'), icon: 'success' }); },
    });
  },

  onLogout: function () {
    const app = getApp();
    if (app && typeof app.logout === 'function') {
      app.logout();
    } else {
      safeNavigate({ url: '/pages/login/index' }, 'reLaunch').catch(function () {});
    }
  },

  onEditProfile: function () {
    safeNavigate({ url: '/pages/admin/misc/edit-profile/index' }).catch(function () {});
  },

  onAvatarError: function () {
    this.setData({ avatarImgUrl: '' });
  },

  // 点击头像直接换头像（与 PC 端体验对齐）
  onAvatarTap: function () {
    const that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        that._uploadAvatar(tempFilePath);
      },
    });
  },

  _uploadAvatar: function (filePath) {
    const that = this;
    wx.showLoading({ title: i18n.t('admin.uploading'), mask: true });
    const auth_token = getToken() || '';
    const baseUrl = getBaseUrl();

    wx.uploadFile({
      url: baseUrl + '/api/file/upload',
      filePath: filePath,
      name: 'file',
      header: { 'Authorization': 'Bearer ' + auth_token },
      success: function (res) {
        wx.hideLoading();
        try {
          const data = JSON.parse(res.data);
          const url = data.data || data.url || data.fileUrl || '';
          if (!url) {
            wx.showToast({ title: i18n.t('admin.uploadFailed'), icon: 'none' });
            return;
          }
          // 调用 PUT /api/system/user/me 持久化到后端
          api.system.updateMe({ avatarUrl: url }).then(function () {
            const newDisplayUrl = getAuthedImageUrl(url);
            that.setData({ avatarImgUrl: newDisplayUrl });
            // 同步更新本地缓存
            try {
              const cached = wx.getStorageSync('user_info') || {};
              cached.avatarUrl = url;
              wx.setStorageSync('user_info', cached);
            } catch (e) { /* ignore */ }
            wx.showToast({ title: i18n.t('admin.avatarUpdated'), icon: 'success' });
          }).catch(function (err) {
            console.warn('[admin] updateMe avatar failed:', err);
            wx.showToast({ title: i18n.t('admin.saveFailed'), icon: 'none' });
          });
        } catch (e) {
          wx.showToast({ title: i18n.t('admin.uploadFailed'), icon: 'none' });
        }
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: i18n.t('admin.uploadFailed'), icon: 'none' });
      },
    });
  },
});
