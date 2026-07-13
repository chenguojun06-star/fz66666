const api = require('../../utils/api');
const { getUserInfo, getToken, setUserInfo, isFactoryOwner } = require('../../utils/storage');
const { getBaseUrl } = require('../../config');
const { getRoleDisplayName, isAdminOrSupervisor } = require('../../utils/permission');
const { onDataRefresh, eventBus, Events } = require('../../utils/eventBus');
const { safeNavigate } = require('../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../utils/fileUrl');
const i18n = require('../../utils/i18n/index');

const HOME_MENU_KEY_MAP = {
  smartOps: { fullKey: 'miniprogram.menu.smartOps', label: '运营看板' },
  dashboard: { fullKey: 'miniprogram.menu.dashboard', label: '生产管理' },
  orderCreate: { fullKey: 'miniprogram.menu.orderCreate', label: '下单管理' },
  production: { fullKey: 'miniprogram.menu.production', label: '质检通知' },
  quality: { fullKey: 'miniprogram.menu.quality', label: '生产扫码' },
  bundleSplit: { fullKey: 'miniprogram.menu.bundleSplit', label: '菲号单价' },
  cuttingDetail: { fullKey: 'miniprogram.menu.cuttingDetail', label: '裁剪任务' },
  history: { fullKey: 'miniprogram.menu.history', label: '扫码历史' },
  factoryShipment: { fullKey: 'miniprogram.menu.factoryShipment', label: '外发工厂' },
  advance: { fullKey: 'miniprogram.menu.advance', label: '员工借支' },
  wagePayment: { fullKey: 'miniprogram.menu.wagePayment', label: '收付款中心' },
};

const MENU_ROLE_MAP = {
  admin: '管理员',
  supervisor: '组长/主管',
  worker: '工人',
};

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.substring(0, 3) + '****' + phone.substring(phone.length - 4);
}

function buildMenuGroups(opts) {
  const showMenuManage = opts.showMenuManage || false;
  const showApproval = opts.showApproval || false;
  var groups = [];

  // Group 1: 账户管理
  var accountItems = [];
  if (showApproval) {
    accountItems.push({
      id: 'approval',
      label: '用户审批',
      iconClass: 'icon-menu-user',
      iconColor: 'primary',
      url: '/pages/admin/user-approval/index',
    });
  }
  accountItems.push({
    id: 'password',
    label: '修改密码',
    iconClass: 'icon-lock',
    iconColor: 'success',
    url: '/pages/admin/misc/change-password/index',
  });
  if (showMenuManage) {
    accountItems.push({
      id: 'menu-manage',
      label: '菜单管理',
      iconClass: 'icon-setting',
      iconColor: 'primary',
      action: 'openMenuManage',
    });
  }
  groups.push({ id: 'account', items: accountItems });

  // Group 2: 帮助与分享
  groups.push({
    id: 'help',
    items: [
      {
        id: 'feedback',
        label: '意见反馈',
        iconClass: 'icon-feedback',
        iconColor: 'warning',
        action: 'openFeedback',
      },
      {
        id: 'invite',
        label: '邀请同事',
        iconClass: 'icon-menu-invite',
        iconColor: 'purple',
        url: '/pages/admin/misc/invite/index',
      },
    ],
  });

  // Group 3: 关于
  groups.push({
    id: 'about',
    items: [
      {
        id: 'privacy',
        label: '隐私政策',
        iconClass: 'icon-menu-privacy',
        iconColor: 'gray',
        action: 'openPrivacy',
      },
      {
        id: 'about-us',
        label: '关于我们',
        iconClass: 'icon-lightbulb',
        iconColor: 'gray',
        action: 'openAbout',
      },
    ],
  });

  return groups;
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
    menuGroups: [],
    factoryName: '',
    userPhone: '',
    stats: {
      workHours: 0,
      wage: 0,
      scanCount: 0,
    },
    menuManageVisible: false,
    menuManageList: [],
    savingMenuConfig: false,
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
    this._showMenuManage = canManage;
    this.setData({ showApprovalEntry: canManage });
    this.loadUserInfo();
    this.loadSystemInfo();
    this.setupDataRefreshListener();
  },

  applyLanguage: function (language) {
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

  refreshMenuItems: function () {
    this.setData({
      menuGroups: buildMenuGroups({
        showMenuManage: this._showMenuManage || false,
        showApproval: this.data.showApprovalEntry || false,
      }),
    });
  },

  onMenuTap: function (e) {
    const groupIdx = e.currentTarget.dataset.groupIdx;
    const itemIdx = e.currentTarget.dataset.itemIdx;
    const group = this.data.menuGroups[groupIdx];
    const item = group && group.items[itemIdx];
    if (!item) return;
    if (item.action === 'switchLanguage') {
      this.onLanguageSwitchTap();
      return;
    }
    if (item.action === 'openMenuManage') {
      this.openMenuManage();
      return;
    }
    if (item.action === 'openFeedback') {
      this.onFeedbackTap();
      return;
    }
    if (item.action === 'copyInviteUrl') {
      this.onCopyRecruitUrl();
      return;
    }
    if (item.action === 'openPrivacy') {
      this.onPrivacyTap();
      return;
    }
    if (item.action === 'openAbout') {
      this.onAboutTap();
      return;
    }
    if (item.url) {
      safeNavigate({ url: item.url }).catch(() => {});
    }
  },

  openMenuManage: function () {
    const self = this;
    const menuKeys = Object.keys(HOME_MENU_KEY_MAP);
    const roles = Object.keys(MENU_ROLE_MAP);

    function buildRoleGroups(roleFlags) {
      const roleGroups = [];
      roles.forEach(function (role) {
        const flags = roleFlags[role] || {};
        const menus = [];
        menuKeys.forEach(function (shortKey) {
          const meta = HOME_MENU_KEY_MAP[shortKey];
          let enabled = true;
          if (typeof flags[meta.fullKey] === 'boolean') {
            enabled = flags[meta.fullKey];
          }
          menus.push({ key: meta.fullKey, shortKey: shortKey, label: meta.label, enabled: enabled });
        });
        roleGroups.push({ role: role, roleLabel: MENU_ROLE_MAP[role], menus: menus });
      });
      return roleGroups;
    }

    api.system.getMiniprogramMenuRoles().then(function (resp) {
      const roleFlags = (resp && resp.data) || resp || {};
      self.setData({ menuManageVisible: true, menuManageGroups: buildRoleGroups(roleFlags), _useRoleApi: true });
    }).catch(function () {
      api.system.getMiniprogramMenuConfig().then(function (resp) {
        const flags = (resp && resp.data) || resp || {};
        const roleFlags = {};
        roles.forEach(function (role) { roleFlags[role] = flags; });
        self.setData({ menuManageVisible: true, menuManageGroups: buildRoleGroups(roleFlags), _useRoleApi: false });
      }).catch(function () {
        const roleGroups = buildRoleGroups({});
        self.setData({ menuManageVisible: true, menuManageGroups: roleGroups, _useRoleApi: false });
      });
    });
  },

  closeMenuManage: function () {
    this.setData({ menuManageVisible: false });
  },

  onMenuSwitch: function (e) {
    const roleIdx = e.currentTarget.dataset.roleIdx;
    const menuIdx = e.currentTarget.dataset.menuIdx;
    const groups = this.data.menuManageGroups;
    const path = 'menuManageGroups[' + roleIdx + '].menus[' + menuIdx + '].enabled';
    const current = groups[roleIdx].menus[menuIdx].enabled;
    this.setData({ [path]: !current });
  },

  saveMenuConfig: function () {
    if (this.data.savingMenuConfig) return;
    const self = this;
    const groups = this.data.menuManageGroups;
    const roleMenus = {};
    groups.forEach(function (group) {
      const menus = {};
      group.menus.forEach(function (item) {
        menus[item.key] = item.enabled;
      });
      roleMenus[group.role] = menus;
    });
    this.setData({ savingMenuConfig: true });

    if (this.data._useRoleApi) {
      api.system.saveMiniprogramMenuRoleConfig(roleMenus).then(function () {
        self.setData({ menuManageVisible: false, savingMenuConfig: false });
        toast.success('菜单配置已保存');
      }).catch(function (err) {
        console.error('保存菜单配置失败', err);
        self.setData({ savingMenuConfig: false });
        toast.error('保存失败');
      });
    } else {
      const flatMenus = {};
      const adminGroup = groups.find(function (g) { return g.role === 'admin'; });
      if (adminGroup) {
        adminGroup.menus.forEach(function (item) { flatMenus[item.key] = item.enabled; });
      }
      api.system.saveMiniprogramMenuConfig(flatMenus).then(function () {
        self.setData({ menuManageVisible: false, savingMenuConfig: false });
        toast.success('菜单配置已保存');
      }).catch(function (err) {
        console.error('保存菜单配置失败', err);
        self.setData({ savingMenuConfig: false });
        toast.error('保存失败');
      });
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
        toast.success(i18n.t('admin.languageSwitched', appliedLang));
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

  loadUserInfo: function () {
    const userInfo = getUserInfo();
    const roleDisplayName = getRoleDisplayName();
    const userName = (userInfo && userInfo.name) || (userInfo && userInfo.username) || '未知';
    const avatarLetter = userName.charAt(0);

    const rawPhone = (userInfo && (userInfo.phone || userInfo.mobile || userInfo.phoneNumber)) || '';
    const userPhone = rawPhone ? maskPhone(rawPhone) : '';

    let avatarImgUrl = '';
    const rawAvatar = (userInfo && (userInfo.avatarUrl || userInfo.avatar || userInfo.headUrl)) || '';
    if (rawAvatar) {
      avatarImgUrl = getAuthedImageUrl(rawAvatar);
    }

    const patch = { userInfo: userInfo, roleDisplayName: roleDisplayName, avatarLetter: avatarLetter, avatarImgUrl: avatarImgUrl, userPhone: userPhone };
    this.setData(patch);
    this.refreshMenuItems();

    api.system.getMe().then(function (res) {
      const freshUser = res;
      if (!freshUser || !freshUser.name) return;
      setUserInfo(freshUser);
      const freshAvatar = freshUser.avatarUrl || freshUser.avatar || freshUser.headUrl || '';
      const freshPhone = freshUser.phone || freshUser.mobile || freshUser.phoneNumber || '';
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
      if (freshImgUrl !== avatarImgUrl) {
        freshPatch.avatarImgUrl = freshImgUrl;
      }
      if (freshPhone) {
        freshPatch.userPhone = maskPhone(freshPhone);
      }
      if (Object.keys(freshPatch).length > 0) {
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
          self.setData({ factoryName: tenantName || '' });
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
    const code = (this._recruitInfo && this._recruitInfo.tenantCode) || '';
    if (!code) {
      toast.error('暂无工厂码');
      return;
    }
    wx.setClipboardData({
      data: code,
      success: function () { toast.success('工厂码已复制'); },
    });
  },

  onCopyRecruitUrl: function () {
    const recruitInfo = this._recruitInfo || {};
    const tenantCode = recruitInfo.tenantCode || '';
    const tenantName = recruitInfo.tenantName || '';
    if (!tenantCode) {
      toast.error('暂无工厂码');
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
      success: function () { toast.success('注册链接已复制'); },
    });
  },

  onEditProfile: function () {
    wx.showToast({ title: '暂未开放', icon: 'none' });
  },

  onFeedbackTap: function () {
    safeNavigate({ url: '/pages/admin/misc/feedback/index' }).catch(function () {
      wx.showToast({ title: '暂未开放', icon: 'none' });
    });
  },

  onPrivacyTap: function () {
    wx.showModal({
      title: '隐私政策',
      content: '衣智链服装供应链系统重视您的隐私保护。我们仅收集必要的业务数据用于提供扫码、质检、工资结算等服务，不会向第三方分享您的个人信息。详细隐私政策请查看官方网站。',
      showCancel: false,
      confirmText: '我知道了',
    });
  },

  onAboutTap: function () {
    var version = '1.0.0';
    try {
      var app = getApp();
      if (app && app.globalData && app.globalData.version) {
        version = app.globalData.version;
      }
    } catch (e) {}
    wx.showModal({
      title: '关于我们',
      content: '衣智链服装供应链系统\n版本：' + version + '\n\n为服装工厂提供扫码、质检、工资结算等一站式管理服务。',
      showCancel: false,
      confirmText: '确定',
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

  onAvatarError: function () {
    this.setData({ avatarImgUrl: '' });
  },
});
