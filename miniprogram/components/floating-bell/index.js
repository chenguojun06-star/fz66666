/**
 * 悬浮铃铛组件 - 显示待处理任务和紧急事件
 * 全局通用组件，可在任何页面使用
 */
import api from '../../utils/api';
import * as reminderManager from '../../utils/reminderManager';

/**
 * 格式化时间为友好显示
 * @param {string|Date} time
 * @returns {string}
 */
function formatTimeAgo(time) {
  if (!time) {
    return '';
  }
  const date = new Date(time);
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) {
    return '刚刚';
  }
  if (minutes < 60) {
    return `${minutes}分钟前`;
  }
  if (hours < 24) {
    return `${hours}小时前`;
  }
  if (days < 7) {
    return `${days}天前`;
  }

  // 超过7天显示具体日期
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${hour}:${minute}`;
}

Component({
  options: {
    addGlobalClass: true,
    styleIsolation: 'apply-shared',
  },

  properties: {
    // 是否显示组件
    visible: {
      type: Boolean,
      value: true,
    },
  },

  data: {
    showPanel: false,
    loading: false,
    expanded: false,
    totalCount: 0,
    hasAnyTask: false,

    // 各类任务列表
    urgentEvents: [], // 紧急事件
    cuttingTasks: [], // 裁剪任务
    procurementTasks: [], // 采购任务
    qualityTasks: [], // 质检待处理任务
    timeoutReminders: [], // 超时提醒
    pendingUsers: [], // 待审批用户
    isAdmin: false, // 是否管理员
  },

  lifetimes: {
    attached() {
      this.loadTasks();

      // 监听全局事件，当任务状态变化时刷新
      // 保存 bound 函数引用，确保 off 时能精确匹配
      this._boundLoadTasks = this.loadTasks.bind(this);
      const eventBus = getApp().globalData?.eventBus;
      if (eventBus) {
        eventBus.on('taskStatusChanged', this._boundLoadTasks);
        eventBus.on('refreshBellTasks', this._boundLoadTasks);
      }
    },

    detached() {
      const eventBus = getApp().globalData?.eventBus;
      if (eventBus && this._boundLoadTasks) {
        eventBus.off('taskStatusChanged', this._boundLoadTasks);
        eventBus.off('refreshBellTasks', this._boundLoadTasks);
      }
      this._boundLoadTasks = null;
    },
  },

  pageLifetimes: {
    show() {
      // 页面显示时刷新任务
      this.loadTasks();
    },
  },

  methods: {
    /**
     * 切换面板显示
     */
    togglePanel() {
      const show = !this.data.showPanel;
      this.setData({
        showPanel: show,
        expanded: show,
      });

      if (show) {
        this.loadTasks();
      }
    },

    /**
     * 关闭面板
     */
    closePanel() {
      this.setData({
        showPanel: false,
        expanded: false,
      });
    },

    /**
     * 阻止滚动穿透
     */
    preventMove() {
      return false;
    },

    /**
     * 刷新任务
     */
    refreshTasks() {
      wx.vibrateShort({ type: 'light' }).catch(() => {});
      this.loadTasks();
    },

    /**
     * 加载所有待处理任务
     */
    async loadTasks() {
      if (this.data.loading) {
        return;
      }

      this.setData({ loading: true });

      try {
        // 检查是否管理员
        const isAdmin = this.checkIsAdmin();
        this.setData({ isAdmin });

        // 并行加载所有任务
        const [cuttingTasks, procurementTasks, qualityTasks, timeoutReminders, pendingUsers] =
          await Promise.all([
            this.loadCuttingTasks(),
            this.loadProcurementTasks(),
            this.loadQualityTasks(),
            this.loadTimeoutReminders(),
            isAdmin ? this.loadPendingUsers() : Promise.resolve([]),
          ]);

        // 紧急事件（可以从后端API获取，这里先用空数组）
        const urgentEvents = [];

        // 计算总数
        const totalCount =
          urgentEvents.length +
          cuttingTasks.length +
          procurementTasks.length +
          qualityTasks.length +
          timeoutReminders.length +
          pendingUsers.length;

        const hasAnyTask = totalCount > 0;

        this.setData({
          urgentEvents,
          cuttingTasks,
          procurementTasks,
          qualityTasks,
          timeoutReminders,
          pendingUsers,
          totalCount,
          hasAnyTask,
          loading: false,
        });
      } catch (err) {
        console.error('加载任务失败:', err);
        this.setData({ loading: false });
      }
    },

    /**
     * 加载裁剪任务（已领取待完成）
     */
    async loadCuttingTasks() {
      try {
        const res = await api.production.myCuttingTasks();
        const list = Array.isArray(res) ? res : res?.records || [];

        return list.map(item => ({
          ...item,
          id: item.id || item.taskId,
          orderNo: item.productionOrderNo || item.orderNo,
          receivedTimeText: formatTimeAgo(item.receivedTime),
        }));
      } catch (err) {
        console.error('加载裁剪任务失败:', err);
        return [];
      }
    },

    /**
     * 加载采购任务（已领取待完成）
     */
    async loadProcurementTasks() {
      try {
        const res = await api.production.myProcurementTasks();
        const list = Array.isArray(res) ? res : res?.records || [];

        return list.map(item => ({
          ...item,
          id: item.id || item.purchaseId,
          receivedTimeText: formatTimeAgo(item.receivedTime),
        }));
      } catch (err) {
        console.error('加载采购任务失败:', err);
        return [];
      }
    },

    /**
     * 加载质检待处理任务（已领取待确认结果）
     */
    async loadQualityTasks() {
      try {
        const res = await api.production.myQualityTasks();
        const list = Array.isArray(res) ? res : res?.records || [];

        return list.map(item => ({
          ...item,
          id: item.id || item.scanId,
          orderId: item.orderId || '', // 订单ID
          orderNo: item.orderNo,
          bundleId: item.cuttingBundleId || '', // 菲号ID
          bundleNo: item.cuttingBundleNo || item.bundleNo || '',
          styleNo: item.styleNo || '',
          color: item.color || '',
          size: item.size || '',
          quantity: item.quantity || 1,
          scanCode: item.scanCode || '',
          receivedTimeText: formatTimeAgo(item.scanTime || item.createdAt),
        }));
      } catch (err) {
        console.error('加载质检任务失败:', err);
        return [];
      }
    },

    /**
     * 加载超时提醒（从本地reminderManager）
     */
    loadTimeoutReminders() {
      try {
        const allReminders = reminderManager.getReminders();
        const now = Date.now();
        const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时

        // 过滤出需要提醒的
        const pendingReminders = allReminders.filter(r => {
          const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
          return baseTime > 0 && now - baseTime >= REMINDER_INTERVAL;
        });

        return pendingReminders.map(r => {
          const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
          const hours = baseTime > 0 ? Math.floor((now - baseTime) / (60 * 60 * 1000)) : 0;
          const timeAgo = hours < 24 ? `${hours}小时` : `${Math.floor(hours / 24)}天`;

          return {
            id: r.id || `${r.orderNo}_${r.type}`,
            orderNo: r.orderNo || '',
            type: r.type || '待处理',
            timeAgo,
          };
        });
      } catch (err) {
        console.error('加载超时提醒失败:', err);
        return [];
      }
    },

    /**
     * 检查当前用户是否是管理员
     */
    checkIsAdmin() {
      try {
        const userInfo = wx.getStorageSync('userInfo');
        if (!userInfo) {
          return false;
        }
        const role = String(userInfo.role || userInfo.roleCode || '').toLowerCase();
        return ['admin', 'supervisor', 'super_admin', 'manager'].includes(role);
      } catch (e) {
        return false;
      }
    },

    /**
     * 加载待审批用户（仅管理员）
     */
    async loadPendingUsers() {
      try {
        const res = await api.system.listPendingUsers({ page: 1, pageSize: 10 });
        const list = res?.records || [];

        return list.map(item => ({
          id: item.id,
          name: item.name || item.username || '未知用户',
          phone: item.phone || '',
          createdAt: item.createdAt || item.createTime,
          timeText: formatTimeAgo(item.createdAt || item.createTime),
        }));
      } catch (err) {
        console.error('加载待审批用户失败:', err);
        return [];
      }
    },

    /**
     * 任务点击处理
     */
    onTaskClick(e) {
      const { task, type } = e.currentTarget.dataset;
      if (!task) {
        return;
      }

      // 关闭面板
      this.closePanel();

      // 触发事件，让页面处理
      this.triggerEvent('taskclick', { task, type });

      // 根据类型跳转
      switch (type) {
        case 'cutting':
          this.handleCuttingTask(task);
          break;
        case 'procurement':
          this.handleProcurementTask(task);
          break;
        case 'quality':
          this.handleQualityTask(task);
          break;
        case 'approval':
          this.handleApprovalTask(task);
          break;
        case 'reminder':
          this.handleReminderTask(task);
          break;
        case 'urgent':
          this.handleUrgentEvent(task);
          break;
        default:
          break;
      }
    },

    /**
     * 处理裁剪任务
     */
    handleCuttingTask(task) {
      const orderNo = task.productionOrderNo || task.orderNo || '';
      try {
        wx.setStorageSync('pending_cutting_task', JSON.stringify(task));
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/scan/index' });
    },

    /**
     * 处理采购任务
     */
    handleProcurementTask(task) {
      const orderNo = task.orderNo || '';
      try {
        wx.setStorageSync('pending_procurement_task', JSON.stringify(task));
        wx.setStorageSync('pending_order_hint', orderNo);
        wx.setStorageSync('mp_scan_type_index', 2); // 采购模式
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/scan/index' });
    },

    /**
     * 处理质检任务（跳转到扫码页并弹出质检弹窗）
     */
    handleQualityTask(task) {
      try {
        // 存储质检任务信息，扫码页会读取并弹出质检弹窗
        wx.setStorageSync('pending_quality_task', JSON.stringify(task));
        wx.setStorageSync('pending_order_hint', task.orderNo || '');
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/scan/index' });
    },

    /**
     * 处理审批任务（待审批用户）- 点击用户信息时跳转详情
     */
    handleApprovalTask(_task) {
      wx.navigateTo({ url: '/pages/admin/notification/index' });
    },

    /**
     * 直接审批用户（通过/拒绝）
     */
    async onApproveUser(e) {
      const { userId, action } = e.currentTarget.dataset;
      if (!userId) {
        return;
      }

      const isApprove = action === 'approve';
      const actionText = isApprove ? '通过' : '拒绝';

      // 确认操作
      const confirmRes = await new Promise(resolve => {
        wx.showModal({
          title: '确认操作',
          content: `确定要${actionText}该用户的注册申请吗？`,
          success: res => resolve(res.confirm),
          fail: () => resolve(false),
        });
      });

      if (!confirmRes) {
        return;
      }

      wx.showLoading({ title: '处理中...', mask: true });

      try {
        if (isApprove) {
          await api.system.approveUser(userId);
        } else {
          await api.system.rejectUser(userId);
        }

        wx.showToast({ title: `${actionText}成功`, icon: 'success' });

        // 刷新任务列表
        this.loadTasks();
      } catch (err) {
        console.error('审批失败:', err);
        wx.showToast({ title: err.message || '操作失败', icon: 'none' });
      } finally {
        wx.hideLoading();
      }
    },

    /**
     * 处理超时提醒
     */
    handleReminderTask(task) {
      const orderNo = task.orderNo || '';
      const type = task.type || '';

      try {
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        console.error('存储失败', e);
      }

      if (type === '采购') {
        wx.setStorageSync('mp_scan_type_index', 2);
        wx.switchTab({ url: '/pages/scan/index' });
      } else {
        wx.switchTab({ url: '/pages/scan/index' });
      }
    },

    /**
     * 处理紧急事件
     */
    handleUrgentEvent(_task) {
      // 根据紧急事件类型跳转
      wx.switchTab({ url: '/pages/scan/index' });
    },
  },
});
