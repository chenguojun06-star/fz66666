const api = require('../../../utils/api');
const { isAdminOrSupervisor } = require('../../../utils/permission');
const { isTenantOwner } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');

Page({
  data: {
    loading: false,
    pendingUsers: [],
    total: 0,
    page: 1,
    pageSize: 20,
    hasMore: true,
    // 租户工人注册
    tenantRegistrations: [],
    tenantTotal: 0,
    isTenantOwner: false,
    activeTab: 'system', // 'system' | 'tenant'
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, -1);
    }
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }

    const ownerFlag = isTenantOwner();
    this.setData({ isTenantOwner: ownerFlag });

    // 管理员可以看系统审批，租户主可以看工人注册审批
    if (!isAdminOrSupervisor() && !ownerFlag) {
      toast.error('仅管理员可访问', 2000);
      setTimeout(() => {
        wx.navigateBack();
      }, 2000);
      return;
    }

    // 租户主默认显示工人注册Tab
    if (ownerFlag && !isAdminOrSupervisor()) {
      this.setData({ activeTab: 'tenant' });
    }

    this.loadPendingUsers(true);
    if (ownerFlag) {
      this.loadTenantRegistrations();
    }
  },

  async loadPendingUsers(reset) {
    if (this.data.loading) {
      return;
    }

    const page = reset ? 1 : this.data.page;
    this.setData({ loading: true });

    try {
      const response = await api.system.listPendingUsers({
        page,
        pageSize: this.data.pageSize,
      });

      if (response && Array.isArray(response.records)) {
        const newList = reset ? response.records : [...this.data.pendingUsers, ...response.records];
        this.setData({
          pendingUsers: newList,
          total: response.total || 0,
          page: page,
          hasMore: newList.length < (response.total || 0),
        });
      }
    } catch (error) {
      console.error('加载待审批用户失败', error);
      toast.error(error?.message || '加载失败');
    } finally {
      this.setData({ loading: false });
      if (reset) {
        wx.stopPullDownRefresh();
      }
    }
  },

  onPullDownRefresh() {
    this.loadPendingUsers(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 }, () => {
        this.loadPendingUsers(false);
      });
    }
  },

  onApprove(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) {
      return;
    }

    wx.showModal({
      title: '批准用户',
      content: `确定批准用户"${user.name || user.username}"吗？`,
      confirmText: '批准',
      cancelText: '取消',
      success: async res => {
        if (res.confirm) {
          await this.approveUser(user.id);
        }
      },
    });
  },

  async approveUser(userId) {
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await api.system.approveUser(userId);
      wx.hideLoading();
      toast.success('已批准');
      this.loadPendingUsers(true);
    } catch (error) {
      wx.hideLoading();
      toast.error(error?.message || '批准失败');
    }
  },

  onReject(e) {
    const { user } = e.currentTarget.dataset;
    if (!user) {
      return;
    }

    wx.showModal({
      title: '拒绝用户',
      content: `确定拒绝用户"${user.name || user.username}"吗？请输入拒绝原因：`,
      editable: true,
      placeholderText: '请输入拒绝原因',
      confirmText: '确定拒绝',
      cancelText: '取消',
      success: async res => {
        if (res.confirm) {
          const reason = res.content?.trim() || '管理员拒绝';
          await this.rejectUser(user.id, reason);
        }
      },
    });
  },

  async rejectUser(userId, reason) {
    wx.showLoading({ title: '处理中...', mask: true });
    try {
      await api.system.rejectUser(userId, { reason });
      wx.hideLoading();
      toast.success('已拒绝');
      this.loadPendingUsers(true);
    } catch (error) {
      wx.hideLoading();
      toast.error(error?.message || '拒绝失败');
    }
  },

  // ========== Tab 切换 ==========
  onTabChange(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
  },

  // ========== 租户工人注册审批 ==========
  async loadTenantRegistrations() {
    try {
      const response = await api.tenant.listPendingRegistrations({
        page: 1,
        pageSize: 50,
      });
      const records = response?.records || (Array.isArray(response) ? response : []);
      this.setData({
        tenantRegistrations: records,
        tenantTotal: response?.total || records.length,
      });
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
            await api.tenant.approveRegistration(user.id);
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
            await api.tenant.rejectRegistration(user.id, reason);
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
