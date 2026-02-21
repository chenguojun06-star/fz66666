const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: false,
    pendingUsers: [],
    total: 0,
    page: 1,
    pageSize: 10,
    hasMore: true,
    showApprovalModal: false,
    showRejectModal: false,
    currentUser: null,
    selectedRoleId: '',
    rejectReason: '',
    roleOptions: [],
    roleLoading: false,
  },

  onLoad() {
    const isAdmin = isAdminOrSupervisor();
    if (!isAdmin) {
      toast.error('无权限访问', 2000);
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }
    this.loadPendingUsers();
    this.loadRoleOptions();
  },

  onPullDownRefresh() {
    this.loadPendingUsers(true).finally(() => {
      wx.stopPullDownRefresh();
    });
  },

  async loadRoleOptions() {
    if (this.data.roleLoading) {
      return;
    }
    this.setData({ roleLoading: true });
    try {
      const result = await api.system.listRoles({ page: 1, pageSize: 100 });
      const records = result?.records || [];
      this.setData({ roleOptions: records });
    } catch (e) {
      console.error('加载角色失败', e);
    } finally {
      this.setData({ roleLoading: false });
    }
  },

  async loadPendingUsers(reset = false) {
    if (this.data.loading) {
      return;
    }

    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const result = await api.system.listPendingUsers({
        page,
        pageSize: this.data.pageSize,
      });

      const records = result?.records || [];
      const total = result?.total || 0;
      const list = reset ? records : [...this.data.pendingUsers, ...records];
      const hasMore = list.length < total;

      this.setData({
        pendingUsers: list,
        total,
        page: page,
        hasMore,
        loading: false,
      });
    } catch (e) {
      console.error('加载待审批用户失败', e);
      toast.error('加载失败');
      this.setData({ loading: false });
    }
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) {
      return;
    }
    this.setData({ page: this.data.page + 1 });
    this.loadPendingUsers();
  },

  onApproveUser(e) {
    const user = e.currentTarget.dataset.user;
    this.setData({
      currentUser: user,
      selectedRoleId: user.roleId ? String(user.roleId) : '',
      showApprovalModal: true,
    });
  },

  onRejectUser(e) {
    const user = e.currentTarget.dataset.user;
    this.setData({
      currentUser: user,
      rejectReason: '',
      showRejectModal: true,
    });
  },

  onRoleSelect(e) {
    const id = e.currentTarget.dataset.id;
    this.setData({ selectedRoleId: String(id) });
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async confirmApprove() {
    const { currentUser, selectedRoleId } = this.data;

    if (!selectedRoleId) {
      toast.error('请选择角色');
      return;
    }

    wx.showLoading({ title: '处理中...', mask: true });

    try {
      // 批准用户
      await api.system.approveUser(currentUser.id);

      // 更新用户角色
      await api.system.updateUser(currentUser.id, {
        roleId: Number(selectedRoleId),
        status: 'active',
        approvalStatus: 'approved',
      });

      wx.hideLoading();
      toast.success('已批准');

      this.setData({
        showApprovalModal: false,
        currentUser: null,
        selectedRoleId: '',
      });

      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '审批失败');
    }
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

      this.setData({
        showRejectModal: false,
        currentUser: null,
        rejectReason: '',
      });

      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      toast.error(e.errMsg || e.message || '拒绝失败');
    }
  },

  cancelApprove() {
    this.setData({
      showApprovalModal: false,
      currentUser: null,
      selectedRoleId: '',
    });
  },

  cancelReject() {
    this.setData({
      showRejectModal: false,
      currentUser: null,
      rejectReason: '',
    });
  },
});
