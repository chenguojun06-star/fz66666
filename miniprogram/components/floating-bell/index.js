/**
 * 悬浮铃铛组件 - 显示待处理任务和紧急事件
 * 全局通用组件，可在任何页面使用
 */
const { loadAllTasks } = require('./bellTaskLoader');
const { onTaskClick, onApproveUser, onApproveRegistration } = require('./bellTaskActions');

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
    pendingUsers: [], // 待审批用户（管理员）
    pendingRegistrations: [], // 待审批员工注册（租户主账号）
    overdueOrders: [], // 延期订单
    overdueSummary: {}, // 延期订单统计
    isAdmin: false, // 是否管理员
    isTenantOwner: false, // 是否租户主账号
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
     * 加载所有待处理任务（委托 bellTaskLoader）
     */
    async loadTasks() { return loadAllTasks(this); },

    /**
     * 任务点击处理（委托 bellTaskActions）
     */
    onTaskClick(e) { onTaskClick(this, e); },

    /**
     * 直接审批用户（委托 bellTaskActions）
     */
    async onApproveUser(e) { return onApproveUser(this, e); },
    /**
     * 审批员工注册（姓名 bellTaskActions，租户主账号专用）
     */
    async onApproveRegistration(e) { return onApproveRegistration(this, e); },  },
});
