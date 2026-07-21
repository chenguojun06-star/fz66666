const api = require('../../../utils/api');

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
  },

  onLoad: function () {
    this.loadConfig();
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
