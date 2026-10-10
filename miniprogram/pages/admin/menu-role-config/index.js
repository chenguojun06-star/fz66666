const i18n = require('../../../utils/i18n/index');

const NS = 'mp.menuRoleConfig.';

const api = require('../../../utils/api');
const { isTenantOwner, isSuperAdmin } = require('../../../utils/storage');
const { PRICE_FLAG_KEY, getTenantPriceVisible, cacheTenantPriceVisible } = require('../../../utils/procTimeline');

Page({
  data: {
    loading: true,
    saving: false,
    t: {},
    roles: [],
    roleLabels: {},
    menus: [],
    menuLabels: {},
    activeRole: '',
    roleMenus: {},
    toastMsg: '',
    showToast: false,
    /* D-285：租户级「工序单价显示」全局开关（唯一入口，对生产管理/外发管理等页面全员生效） */
    canManagePrice: false,
    priceVisible: true,
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        permissionTitle: t('permissionTitle'),
        loading: i18n.t('common.loading', lang),
        save: i18n.t('common.save', lang),
        saving: t('saving'),
        roleHint: t('roleHint'),
        globalSwitch: t('globalSwitch'),
        unitPriceSwitch: t('unitPriceSwitch'),
        unitPriceHint: t('unitPriceHint'),
      },
    });
    wx.setNavigationBarTitle({ title: t('permissionTitle') });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
  },

  onLoad: function () {
    const canManagePrice = isTenantOwner() || isSuperAdmin();
    this.setData({ canManagePrice: canManagePrice, priceVisible: getTenantPriceVisible() });
    if (canManagePrice) this.loadPriceFlag();
    this.loadConfig();
  },

  /* 拉取后端租户级开关值（本地缓存只做秒显兜底） */
  loadPriceFlag: function () {
    const that = this;
    api.system.getSmartFeatureFlags().then(function (flags) {
      const raw = flags && flags[PRICE_FLAG_KEY];
      const visible = raw === undefined || raw === null ? true : !!raw;
      cacheTenantPriceVisible(visible);
      that.setData({ priceVisible: visible });
    }).catch(function () { /* 拉取失败沿用本地缓存 */ });
  },

  onTogglePriceVisible: function () {
    const that = this;
    if (!that.data.canManagePrice) {
      that._showToast(i18n.t(NS + 'adminOnly', that._lang));
      return;
    }
    const next = !that.data.priceVisible;
    // 后端保存是全量覆盖语义：先 GET 全量 → 合并 → PUT 整体提交，避免把其他租户开关冲回默认值
    api.system.getSmartFeatureFlags().then(function (flags) {
      const nextFlags = Object.assign({}, flags || {});
      nextFlags[PRICE_FLAG_KEY] = next;
      return api.system.saveSmartFeatureFlags(nextFlags);
    }).then(function () {
      cacheTenantPriceVisible(next);
      that.setData({ priceVisible: next });
      that._showToast(i18n.t(NS + (next ? 'unitPriceShown' : 'unitPriceHidden'), that._lang));
    }).catch(function (e) {
      that._showToast((e && e.message) || i18n.t(NS + 'changeFailedAdminOnly', that._lang));
    });
  },

  loadConfig: function () {
    const that = this;
    that.setData({ loading: true });

    Promise.all([
      api.system.getMiniprogramMenuMeta(),
      api.system.getMiniprogramMenuRoles(),
    ]).then(function (results) {
      const meta = results[0] || {};
      const roleMenus = results[1] || {};

      const roles = Object.keys(meta.roles || {});
      const roleLabels = meta.roles || {};
      const menuLabels = meta.menus || {};
      const menus = Object.keys(menuLabels);

      that.setData({
        loading: false,
        roles: roles,
        roleLabels: roleLabels,
        menus: menus,
        menuLabels: menuLabels,
        activeRole: roles.length > 0 ? roles[0] : '',
        roleMenus: roleMenus,
      });
    }).catch(function (e) {
      console.error('[menu-role-config] load failed', e);
      that.setData({ loading: false });
      that._showToast(i18n.t(NS + 'loadFailedRetry', that._lang));
    });
  },

  onSwitchRole: function (e) {
    const role = e.currentTarget.dataset.role;
    if (role) {
      this.setData({ activeRole: role });
    }
  },

  onToggleMenu: function (e) {
    const menuKey = e.currentTarget.dataset.menu;
    const activeRole = this.data.activeRole;
    if (!menuKey || !activeRole) return;

    const roleMenus = JSON.parse(JSON.stringify(this.data.roleMenus));
    if (!roleMenus[activeRole]) {
      roleMenus[activeRole] = {};
    }
    const current = roleMenus[activeRole][menuKey];
    roleMenus[activeRole][menuKey] = current !== true;

    this.setData({ roleMenus: roleMenus });
  },

  onSave: function () {
    const that = this;
    if (that.data.saving) return;

    that.setData({ saving: true });
    api.system.saveMiniprogramMenuRoleConfig(that.data.roleMenus).then(function (res) {
      that.setData({ saving: false, roleMenus: res || that.data.roleMenus });
      that._showToast(i18n.t('common.saveSuccess', that._lang));
    }).catch(function (e) {
      console.error('[menu-role-config] save failed', e);
      that.setData({ saving: false });
      that._showToast(i18n.t(NS + 'saveFailedRetry', that._lang));
    });
  },

  _showToast: function (msg) {
    const that = this;
    that.setData({ toastMsg: msg, showToast: true });
    setTimeout(function () {
      that.setData({ showToast: false });
    }, 2000);
  },
});
