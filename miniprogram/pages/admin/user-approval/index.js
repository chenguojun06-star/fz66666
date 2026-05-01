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
    currentUser: null,
    selectedRoleId: '',
    factorySelectedRole: '',
    rejectReason: '',
    roleOptions: [],
    roleLoading: false,
  },

  onShow() {
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
      toast.error('仅管理员可访问', 2000);
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
    if (this.data.activeTab === 'system' && this.data.isPlatformAdmin) {
      this.loadPendingUsers(true);
    } else {
      this.loadTenantRegistrations();
    }
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
      this.setData({ roleOptions: result?.records || [] });
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
      toast.error(error?.message || '加载失败');
    } finally {
      this.setData({ loading: false });
      if (reset) wx.stopPullDownRefresh();
    }
  },

  onTabChange(e) {
    var tab = e.currentTarget.dataset.tab;
    if (tab === 'system' && !this.data.isPlatformAdmin) return;
    this.setData({ activeTab: tab });
  },

  onApproveUser(e) {
    const user = e.currentTarget.dataset.user;
    if (!user) return;
    this.setData({
      currentUser: user,
      selectedRoleId: user.roleId ? String(user.roleId) : '',
      showApprovalModal: true,
    });
  },

  onRoleSelect(e) {
    const id = e.currentTarget.dataset.id;
    if (id === undefined || id === null) return;
    this.setData({ selectedRoleId: String(id) });
  },

  async confirmApprove() {
    const { currentUser, selectedRoleId } = this.data;
    if (!selectedRoleId) {
      toast.error('请选择角色');
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await api.system.approveUser(currentUser.id, { roleId: Number(selectedRoleId) });
      wx.hideLoading();
      toast.success('已批准并分配角色');
      this.setData({ showApprovalModal: false, currentUser: null, selectedRoleId: '' });
      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '审批失败');
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
      toast.error('请输入拒绝原因');
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await api.system.rejectUser(currentUser.id, { approvalRemark: rejectReason });
      wx.hideLoading();
      toast.success('已拒绝');
      this.setData({ showRejectModal: false, currentUser: null, rejectReason: '' });
      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '拒绝失败');
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

  onTenantApprove(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) return;

    wx.showModal({
      title: '批准工人注册',
      content: `确定批准"${user.name || user.username}"加入工厂吗？`,
      confirmText: '批准',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...', mask: true });
          try {
            await api.tenant.approveRegistration(user.id, { roleId: this.data.factorySelectedRole });
            wx.hideLoading();
            toast.success('已批准');
            this.loadTenantRegistrations();
          } catch (error) {
            wx.hideLoading();
            toast.error(error?.message || '批准失败');
          }
        }
      },
    });
  },

  onTenantReject(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) return;

    wx.showModal({
      title: '拒绝工人注册',
      content: `确定拒绝"${user.name || user.username}"的注册申请吗？`,
      editable: true,
      placeholderText: '请输入拒绝原因',
      confirmText: '确定拒绝',
      cancelText: '取消',
      success: async (res) => {
        if (res.confirm) {
          const reason = res.content?.trim() || '管理员拒绝';
          wx.showLoading({ title: '处理中...', mask: true });
          try {
            await api.tenant.rejectRegistration(user.id, { reason: reason });
            wx.hideLoading();
            toast.success('已拒绝');
            this.loadTenantRegistrations();
          } catch (error) {
            wx.hideLoading();
            toast.error(error?.message || '拒绝失败');
          }
        }
      },
    });
  },
});
