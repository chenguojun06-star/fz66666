const api = require('../../../utils/api');
const { isTenantOwner, isSuperAdmin } = require('../../../utils/storage');
const { PRICE_FLAG_KEY, getTenantPriceVisible, cacheTenantPriceVisible } = require('../../../utils/procTimeline');

Page({
  data: {
    loading: true,
    saving: false,
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
      that._showToast('仅租户管理员可操作');
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
      that._showToast(next ? '单价已对全员显示' : '单价已对全员隐藏');
    }).catch(function (e) {
      that._showToast((e && e.message) || '修改失败：仅租户管理员可操作');
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
      that._showToast('加载失败，请重试');
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
      that._showToast('保存成功');
    }).catch(function (e) {
      console.error('[menu-role-config] save failed', e);
      that.setData({ saving: false });
      that._showToast('保存失败，请重试');
    });
  },

  onBack: function () {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack();
    } else {
      wx.switchTab({ url: '/pages/home/index' });
    }
  },

  _showToast: function (msg) {
    const that = this;
    that.setData({ toastMsg: msg, showToast: true });
    setTimeout(function () {
      that.setData({ showToast: false });
    }, 2000);
  },
});
