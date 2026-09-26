const i18n = require('../../../utils/i18n/index');
const NS = 'mp.userApproval.';
const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isTenantOwner, isFactoryOwner, isSuperAdmin } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: false,
    pendingUsers: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    tenantRegistrations: [],
    tenantTotal: 0,
    isTenantOwner: false,
    isFactoryOwner: false,
    isPlatformAdmin: false,
    activeTab: 'tenant',
    showApprovalModal: false,
    showRejectModal: false,
    // D-422：区分审批来源（system=租户员工 / tenant=外发工厂员工），两者调不同接口
    approvalMode: 'system',
    currentUser: null,
    selectedRoleId: '',
    factorySelectedRole: '',
    rejectReason: '',
    roleOptions: [],
    roleLoading: false,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        noPendingUsers: i18n.t(NS + 'noPendingUsers', lang),
        loadMoreW: i18n.t(NS + 'loadMoreW', lang),
        noExternalPending: i18n.t(NS + 'noExternalPending', lang),
        shareQrHint: i18n.t(NS + 'shareQrHint', lang),
        externalFactory: i18n.t(NS + 'externalFactory', lang),
        approveBtn: i18n.t(NS + 'approveBtn', lang),
        approveHint: i18n.t(NS + 'approveHint', lang),
        pickRole: i18n.t(NS + 'pickRole', lang),
        approveAssignBtn: i18n.t(NS + 'approveAssignBtn', lang),
        rejectUserBtn: i18n.t(NS + 'rejectUserBtn', lang),
        rejectReasonLabel: i18n.t(NS + 'rejectReasonLabel', lang),
        confirmRejectBtn: i18n.t(NS + 'confirmRejectBtn', lang),
        passBtnW: i18n.t('common.pass', lang),
        rejectBtnW: i18n.t(NS + 'rejectBtn', lang),
        cancel: i18n.t('common.cancel', lang),
        pendingFmt: i18n.t(NS + 'pendingFmt', lang),
        peopleUnit: i18n.t(NS + 'peopleUnit', lang),
        externalTab: i18n.t(NS + 'externalTab', lang),
        tenantTab: i18n.t(NS + 'tenantTab', lang),
        approveExtTitle: i18n.t(NS + 'approveExtTitle', lang),
        approveUserTitle: i18n.t(NS + 'approveUserTitle', lang),
        approvePrefix: i18n.t(NS + 'approvePrefix', lang),
        factoryOfLabel: i18n.t(NS + 'factoryOfLabel', lang),
        rejectUserTitle: i18n.t(NS + 'rejectUserTitle', lang),
        rejectUserFmt: i18n.t(NS + 'rejectUserFmt', lang),
        nameUnit: i18n.t(NS + 'nameUnit', lang),
        rejectLoginHintW: i18n.t(NS + 'rejectLoginHintW', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }

    const ownerFlag = isTenantOwner();
    const factoryOwnerFlag = isFactoryOwner();
    const adminFlag = isAdminOrSupervisor();
    const platformAdminFlag = isSuperAdmin();
    this.setData({ isTenantOwner: ownerFlag, isFactoryOwner: factoryOwnerFlag, isPlatformAdmin: platformAdminFlag });

    if (!adminFlag && !ownerFlag && !factoryOwnerFlag) {
      toast.error(i18n.t(NS + 'adminOnly', this._lang), 2000);
      setTimeout(() => wx.navigateBack(), 2000);
      return;
    }

    if (platformAdminFlag) {
      this.setData({ activeTab: 'system' });
    } else {
      this.setData({ activeTab: 'tenant' });
    }

    if (platformAdminFlag) {
      this.loadPendingUsers(true);
      this.loadRoleOptions();
    }
    if (ownerFlag || factoryOwnerFlag) {
      this.loadTenantRegistrations();
    }
  },

  onPullDownRefresh() {
    var task = (this.data.activeTab === 'system' && this.data.isPlatformAdmin)
      ? this.loadPendingUsers(true)
      : this.loadTenantRegistrations();
    Promise.resolve(task).finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom() {
    if (this.data.activeTab === 'system' && this.data.isPlatformAdmin && this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 }, () => {
        this.loadPendingUsers(false);
      });
    }
  },

  async loadRoleOptions() {
    if (this.data.roleLoading) return;
    this.setData({ roleLoading: true });
    try {
      const result = await api.system.listRoles({ page: 1, pageSize: 100 });
      // D-422：WXML 数据绑定不支持 String()/Number() 等内置函数调用，
      // 原 wxml 里的 {{selectedRoleId === String(item.id)}} 属于非法表达式。
      // 改为在 JS 侧预计算字符串 id，wxml 只做纯比较。
      const records = (result?.records || []).map((r) => ({ ...r, _idStr: String(r.id) }));
      this.setData({ roleOptions: records });
    } catch (e) {
      console.error('加载角色失败', e);
    } finally {
      this.setData({ roleLoading: false });
    }
  },

  async loadPendingUsers(reset) {
    if (this.data.loading) return;

    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const response = await api.system.listPendingUsers({ page, pageSize: this.data.pageSize });
      if (response && Array.isArray(response.records)) {
        const newList = reset ? response.records : [...this.data.pendingUsers, ...response.records];
        this.setData({
          pendingUsers: newList,
          total: response.total || 0,
          page,
          hasMore: newList.length < (response.total || 0),
        });
      }
    } catch (error) {
      console.error('加载待审批用户失败', error);
      toast.error(error?.message || i18n.t(NS + 'loadFailedW', this._lang));
    } finally {
      this.setData({ loading: false });
      if (reset) wx.stopPullDownRefresh();
    }
  },

  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === 'system' && !this.data.isPlatformAdmin) return;
    this.setData({ activeTab: tab });
  },

  onApproveUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;
    this.setData({
      currentUser: user,
      selectedRoleId: user.roleId ? String(user.roleId) : '',
      approvalMode: 'system',
      showApprovalModal: true,
    });
    if (!this.data.roleOptions.length) this.loadRoleOptions();
  },

  onRoleSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (id === undefined || id === null) return;
    this.setData({ selectedRoleId: String(id) });
  },

  async confirmApprove() {
    const { currentUser, selectedRoleId, approvalMode } = this.data;
    if (!selectedRoleId) {
      toast.error(i18n.t(NS + 'pickRoleFirst', this._lang));
      return;
    }

    wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
    try {
      // D-422：按审批来源分流到不同接口
      //   system → /api/system/user/{id}/approval-action（租户员工）
      //   tenant → /api/system/tenant/registrations/{id}/approve（外发工厂员工）
      if (approvalMode === 'tenant') {
        await api.tenant.approveRegistration(currentUser.id, { roleId: Number(selectedRoleId) });
      } else {
        await api.system.approveUser(currentUser.id, { roleId: Number(selectedRoleId) });
      }
      wx.hideLoading();
      toast.success(i18n.t(NS + 'approvedAssigned', this._lang));
      this.setData({ showApprovalModal: false, currentUser: null, selectedRoleId: '' });
      if (approvalMode === 'tenant') {
        this.loadTenantRegistrations();
      } else {
        this.loadPendingUsers(true);
      }
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || i18n.t(NS + 'approveFailW', this._lang));
    }
  },

  cancelApprove() {
    this.setData({ showApprovalModal: false, currentUser: null, selectedRoleId: '' });
  },

  onReject(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;
    this.setData({ currentUser: user, rejectReason: '', showRejectModal: true });
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async confirmReject() {
    const { currentUser, rejectReason } = this.data;
    if (!rejectReason.trim()) {
      toast.error(i18n.t(NS + 'rejectReasonReq', this._lang));
      return;
    }

    wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
    try {
      await api.system.rejectUser(currentUser.id, { approvalRemark: rejectReason });
      wx.hideLoading();
      toast.success(i18n.t(NS + 'rejected', this._lang));
      this.setData({ showRejectModal: false, currentUser: null, rejectReason: '' });
      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || i18n.t(NS + 'rejectFailW', this._lang));
    }
  },

  cancelReject() {
    this.setData({ showRejectModal: false, currentUser: null, rejectReason: '' });
  },

  async loadTenantRegistrations() {
    try {
      const response = await api.tenant.listPendingRegistrations({ page: 1, pageSize: 50 });
      const records = response?.records || (Array.isArray(response) ? response : []);
      this.setData({ tenantRegistrations: records, tenantTotal: response?.total || records.length });
    } catch (error) {
      console.error('加载工人注册列表失败', error);
    }
  },

  /**
   * D-422：批准外发工厂员工
   * 原实现用 wx.showModal 并检查 this.data.factorySelectedRole，
   * 但该字段在整份代码里从未被 setData 赋值（恒为 ''）→
   * 用户点"通过"永远收到"请先选择角色"并直接 return，审批功能实际不可用。
   * 现改为复用页内角色选择弹层（与租户员工审批同一套 UI），并标记 approvalMode='tenant'。
   */
  onTenantApprove(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) return;
    this.setData({
      currentUser: user,
      selectedRoleId: user.roleId ? String(user.roleId) : '',
      approvalMode: 'tenant',
      showApprovalModal: true,
    });
    if (!this.data.roleOptions.length) this.loadRoleOptions();
  },

  onTenantReject(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) return;

    wx.showModal({
      title: i18n.t(NS + 'rejectExternal', this._lang),
      content: `确定拒绝"${user.name || user.username}"的注册申请吗？`,
      editable: true,
      placeholderText: i18n.t(NS + 'rejectReasonReq', this._lang),
      confirmText: i18n.t(NS + 'confirmRejectBtn', this._lang),
      cancelText: i18n.t('common.cancel', this._lang),
      success: async (res) => {
        if (res.confirm) {
          const reason = res.content?.trim() || i18n.t(NS + 'adminRejectTag', this._lang);
          wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
          try {
            await api.tenant.rejectRegistration(user.id, { reason: reason });
            wx.hideLoading();
            toast.success(i18n.t(NS + 'rejected', this._lang));
            this.loadTenantRegistrations();
          } catch (error) {
            wx.hideLoading();
            toast.error(error?.message || i18n.t(NS + 'rejectFailW', this._lang));
          }
        }
      },
    });
  },
});
