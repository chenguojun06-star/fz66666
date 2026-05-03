var api = require('../../utils/api');
var { getUserInfo, getToken, setUserInfo, isFactoryOwner, isTenantOwner, isSuperAdmin } = require('../../utils/storage');
var { getBaseUrl } = require('../../config');
var { getRoleDisplayName, isAdminOrSupervisor } = require('../../utils/permission');
var { onDataRefresh, eventBus, Events } = require('../../utils/eventBus');
var { safeNavigate } = require('../../utils/uiHelper');
var { getAuthedImageUrl } = require('../../utils/fileUrl');
var i18n = require('../../utils/i18n/index');

var HOME_MENU_KEY_MAP = {
  smartOps: { fullKey: 'miniprogram.menu.smartOps', label: '运营看板' },
  dashboard: { fullKey: 'miniprogram.menu.dashboard', label: '生产管理' },
  quality: { fullKey: 'miniprogram.menu.quality', label: '扫码质检' },
  bundleSplit: { fullKey: 'miniprogram.menu.bundleSplit', label: '菲号单价' },
  cuttingDetail: { fullKey: 'miniprogram.menu.cuttingDetail', label: '裁剪明细' },
};

function buildMenuItems(opts) {
  var showInviteSection = opts.showInviteSection || false;
  var showApprovalEntry = opts.showApprovalEntry || false;
  var showMenuManage = opts.showMenuManage || false;
  var items = [];

  items.push({ id: 'password', label: '修改密码', iconClass: 'icon-lock', url: '/pages/admin/misc/change-password/index' });
  items.push({ id: 'payroll', label: '工资查询', iconClass: 'icon-payroll', url: '/pages/payroll/payroll' });

  if (showInviteSection) {
    items.push({ id: 'invite', label: '邀请员工', iconClass: 'icon-user-group', url: '/pages/admin/misc/invite/index' });
  }

  items.push({ id: 'feedback', label: '问题反馈', iconClass: 'icon-feedback', url: '/pages/admin/misc/feedback/index' });

  if (showApprovalEntry) {
    items.push({ id: 'approval', label: '用户审批', iconClass: 'icon-approval', url: '/pages/admin/user-approval/index' });
  }

  if (showMenuManage) {
    items.push({ id: 'menu-manage', label: '菜单管理', iconClass: 'icon-setting', action: 'openMenuManage' });
  }

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
    currentLanguage: 'zh-CN',
    currentLanguageName: '中文',
    menuItems: [],
    showMenuManage: false,
    menuManageVisible: false,
    menuManageList: [],
    savingMenuConfig: false,
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    var lang = i18n.getLanguage();
    if (lang !== this.data.currentLanguage) {
      this.applyLanguage(lang);
    }
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    var canManage = isAdminOrSupervisor() || isFactoryOwner();
    this.setData({ showMenuManage: canManage });
    this.loadUserInfo(canManage);
    this.loadSystemInfo();
    this.setupDataRefreshListener();
  },

  applyLanguage: function (language) {
    var languageNameMap = {
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

  refreshMenuItems: function () {
    this.setData({
      menuItems: buildMenuItems({
        showInviteSection: this._showInviteSection || false,
        showApprovalEntry: this.data.showApprovalEntry,
        showMenuManage: this.data.showMenuManage,
      }),
    });
  },

  onMenuTap: function (e) {
    var index = e.currentTarget.dataset.index;
    var item = this.data.menuItems[index];
    if (!item) return;
    if (item.action === 'switchLanguage') {
      this.onLanguageSwitchTap();
      return;
    }
    if (item.action === 'openMenuManage') {
      this.openMenuManage();
      return;
    }
    if (item.url) {
      wx.navigateTo({ url: item.url });
    }
  },

  openMenuManage: function () {
    var self = this;
    api.system.getMiniprogramMenuConfig().then(function (resp) {
      return resp;
    }).catch(function () {
      return null;
    }).then(function (resp) {
      var flags = (resp && resp.data) || resp || {};
      var list = [];
      Object.keys(HOME_MENU_KEY_MAP).forEach(function (shortKey) {
        var meta = HOME_MENU_KEY_MAP[shortKey];
        var enabled = true;
        if (typeof flags[meta.fullKey] === 'boolean') {
          enabled = flags[meta.fullKey];
        }
        list.push({ key: meta.fullKey, shortKey: shortKey, label: meta.label, enabled: enabled });
      });
      self.setData({ menuManageVisible: true, menuManageList: list });
    });
  },

  closeMenuManage: function () {
    this.setData({ menuManageVisible: false });
  },

  onMenuSwitch: function (e) {
    var shortKey = e.currentTarget.dataset.key;
    var list = this.data.menuManageList;
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (list[i].shortKey === shortKey) { idx = i; break; }
    }
    if (idx === -1) return;
    var path = 'menuManageList[' + idx + '].enabled';
    this.setData({ [path]: !list[idx].enabled });
  },

  saveMenuConfig: function () {
    if (this.data.savingMenuConfig) return;
    var self = this;
    var list = this.data.menuManageList;
    var menus = {};
    list.forEach(function (item) {
      menus[item.key] = item.enabled;
    });
    this.setData({ savingMenuConfig: true });
    api.system.saveMiniprogramMenuConfig(menus).then(function (resp) {
      self.setData({ menuManageVisible: false, savingMenuConfig: false });
      wx.showToast({ title: '菜单配置已保存', icon: 'success' });
    }).catch(function (err) {
      console.error('保存菜单配置失败', err);
      self.setData({ savingMenuConfig: false });
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  onLanguageSwitchTap: function () {
    var languageNameMap = this._languageNameMap || { 'zh-CN': '中文', 'en-US': 'English', 'vi-VN': 'Tiếng Việt', 'km-KH': 'ភាសាខ្មែរ' };
    var langList = ['zh-CN', 'en-US', 'vi-VN', 'km-KH'];
    var itemList = langList.map(function (lang) { return languageNameMap[lang] || lang; });
    var that = this;
    wx.showActionSheet({
      itemList: itemList,
      alertText: i18n.t('admin.switchLanguage', that.data.currentLanguage),
      success: function (res) {
        var nextLang = langList[res.tapIndex] || 'zh-CN';
        var appliedLang = i18n.setLanguage(nextLang);
        that.applyLanguage(appliedLang);
        var tab = typeof that.getTabBar === 'function' ? that.getTabBar() : null;
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
    this.loadSystemInfo().finally(function () { wx.stopPullDownRefresh(); });
  },

  loadUserInfo: function (showApprovalEntry) {
    var userInfo = getUserInfo();
    var roleDisplayName = getRoleDisplayName();
    var userName = (userInfo && userInfo.name) || (userInfo && userInfo.username) || '未知';
    var avatarLetter = userName.charAt(0);

    var avatarImgUrl = '';
    var rawAvatar = (userInfo && (userInfo.avatarUrl || userInfo.avatar || userInfo.headUrl)) || '';
    if (rawAvatar) {
      avatarImgUrl = getAuthedImageUrl(rawAvatar);
    }

    var patch = { userInfo: userInfo, roleDisplayName: roleDisplayName, avatarLetter: avatarLetter, avatarImgUrl: avatarImgUrl };
    if (typeof showApprovalEntry === 'boolean') {
      patch.showApprovalEntry = showApprovalEntry;
    }
    this.setData(patch);
    this.refreshMenuItems();

    api.system.getMe().then(function (res) {
      var freshUser = res;
      if (!freshUser || !freshUser.name) return;
      setUserInfo(freshUser);
      var freshAvatar = freshUser.avatarUrl || freshUser.avatar || freshUser.headUrl || '';
      var freshImgUrl = '';
      if (freshAvatar) {
        if (freshAvatar.indexOf('http://') === 0 || freshAvatar.indexOf('https://') === 0) {
          freshImgUrl = freshAvatar;
        } else {
          var token = getToken();
          var base = getBaseUrl().replace(/\/$/, '');
          var sep = freshAvatar.indexOf('?') !== -1 ? '&' : '?';
          freshImgUrl = base + freshAvatar + sep + 'token=' + encodeURIComponent(token);
        }
      }
      if (freshImgUrl !== avatarImgUrl) {
        this.setData({ avatarImgUrl: freshImgUrl });
      }
    }.bind(this)).catch(function () {});
  },

  loadSystemInfo: function () {
    if (this._loadingSystemInfo) return;
    this._loadingSystemInfo = true;
    var self = this;
    api.system.getOnlineCount().then(function (onlineCount) {
      var userInfo = getUserInfo();
      var hasTenant = !!(userInfo && userInfo.tenantId);
      if (hasTenant) {
        return api.tenant.myTenant().then(function (tenantResp) {
          var tenantCode = (tenantResp && tenantResp.tenantCode) || '';
          var tenantName = (tenantResp && tenantResp.tenantName) || '';
          if (tenantCode) {
            self._recruitInfo = { show: true, tenantCode: tenantCode, tenantName: tenantName };
          }
          self._showInviteSection = true;
          self.refreshMenuItems();
          return onlineCount;
        }).catch(function (e) {
          console.error('加载租户信息失败', e);
          return onlineCount;
        });
      }
      return onlineCount;
    }).then(function (onlineCount) {
      self.setData({ onlineCount: Number(onlineCount) || 0 });
    }).catch(function (e) {
      console.error('加载系统信息失败', e);
    }).finally(function () {
      self._loadingSystemInfo = false;
    });
  },

  onCopyRecruitCode: function () {
    var code = (this._recruitInfo && this._recruitInfo.tenantCode) || '';
    if (!code) {
      wx.showToast({ title: '暂无工厂码', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: code,
      success: function () { wx.showToast({ title: '工厂码已复制', icon: 'success' }); },
    });
  },

  onCopyRecruitUrl: function () {
    var recruitInfo = this._recruitInfo || {};
    var tenantCode = recruitInfo.tenantCode || '';
    var tenantName = recruitInfo.tenantName || '';
    if (!tenantCode) {
      wx.showToast({ title: '暂无工厂码', icon: 'none' });
      return;
    }
    var baseUrl = '';
    try {
      var app = getApp();
      baseUrl = (app.globalData && app.globalData.baseUrl) || getBaseUrl();
    } catch (e) {
      baseUrl = getBaseUrl();
    }
    var origin = baseUrl.replace(/^(https?:\/\/)api\./, '$1www.').replace(/\/api\/?$/, '');
    var url = origin + '/register?tenantCode=' + encodeURIComponent(tenantCode)
      + '&tenantName=' + encodeURIComponent(tenantName || '');
    wx.setClipboardData({
      data: url,
      success: function () { wx.showToast({ title: '注册链接已复制', icon: 'success' }); },
    });
  },

  onLogout: function () {
    var app = getApp();
    if (app && typeof app.logout === 'function') {
      app.logout();
    } else {
      safeNavigate({ url: '/pages/login/index' }, 'reLaunch').catch(function () {});
    }
  },

  onAvatarError: function () {
    this.setData({ avatarImgUrl: '' });
  },
});
