import api from '../../../utils/api';
import { isAdminOrSupervisor } from '../../../utils/permission';

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
      wx.showToast({
        title: '无权限访问',
        icon: 'none',
        duration: 2000
      });
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
    if (this.data.roleLoading) {return;}
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
    if (this.data.loading) {return;}
    
    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });
    
    try {
      const result = await api.system.listPendingUsers({
        page,
        pageSize: this.data.pageSize
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
        loading: false
      });
    } catch (e) {
      console.error('加载待审批用户失败', e);
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) {return;}
    this.setData({ page: this.data.page + 1 });
    this.loadPendingUsers();
  },

  onApproveUser(e) {
    const user = e.currentTarget.dataset.user;
    this.setData({
      currentUser: user,
      selectedRoleId: user.roleId ? String(user.roleId) : '',
      showApprovalModal: true
    });
  },

  onRejectUser(e) {
    const user = e.currentTarget.dataset.user;
    this.setData({
      currentUser: user,
      rejectReason: '',
      showRejectModal: true
    });
  },

  onRoleChange(e) {
    const index = e.detail.value;
    const role = this.data.roleOptions[index];
    if (role) {
      this.setData({ selectedRoleId: String(role.id) });
    }
  },

  onRejectReasonInput(e) {
    this.setData({ rejectReason: e.detail.value });
  },

  async confirmApprove() {
    const { currentUser, selectedRoleId } = this.data;
    
    if (!selectedRoleId) {
      wx.showToast({
        title: '请选择角色',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '处理中...' });
    
    try {
      // 批准用户
      await api.system.approveUser(currentUser.id);
      
      // 更新用户角色
      await api.system.updateUser(currentUser.id, {
        roleId: Number(selectedRoleId),
        status: 'active',
        approvalStatus: 'approved'
      });
      
      wx.hideLoading();
      wx.showToast({
        title: '已批准',
        icon: 'success'
      });
      
      this.setData({
        showApprovalModal: false,
        currentUser: null,
        selectedRoleId: ''
      });
      
      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({
        title: e.message || '操作失败',
        icon: 'none'
      });
    }
  },

  async confirmReject() {
    const { currentUser, rejectReason } = this.data;
    
    if (!rejectReason.trim()) {
      wx.showToast({
        title: '请输入拒绝原因',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '处理中...' });
    
    try {
      await api.system.rejectUser(currentUser.id, { approvalRemark: rejectReason });
      
      wx.hideLoading();
      wx.showToast({
        title: '已拒绝',
        icon: 'success'
      });
      
      this.setData({
        showRejectModal: false,
        currentUser: null,
        rejectReason: ''
      });
      
      this.loadPendingUsers(true);
    } catch (e) {
      wx.hideLoading();
      wx.showToast({
        title: e.message || '操作失败',
        icon: 'none'
      });
    }
  },

  cancelApprove() {
    this.setData({
      showApprovalModal: false,
      currentUser: null,
      selectedRoleId: ''
    });
  },

  cancelReject() {
    this.setData({
      showRejectModal: false,
      currentUser: null,
      rejectReason: ''
    });
  }
});
