const api = require('../../../utils/api');
const { getUserInfo } = require('../../../utils/storage');
const { toast } = require('../../../utils/uiHelper');
const { eventBus, Events } = require('../../../utils/eventBus');

Page({
  data: {
    loading: false,
    tasks: [],
    filteredTasks: [],
    activeStatus: 'all',
    statusTabs: [
      { key: 'all', label: '全部', count: 0 },
      { key: 'pending', label: '待领取', count: 0 },
      { key: 'received', label: '已领取', count: 0 },
      { key: 'bundled', label: '已完成', count: 0 },
    ],
  },

  onLoad() {
    // 未登录时拒绝访问：裁剪任务页需要身份验证
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadTasks();
  },

  onShow() {
    var app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadTasks();
    this._bindWsEvents();
  },

  onPullDownRefresh() {
    this.loadTasks().then(() => wx.stopPullDownRefresh()).catch(() => wx.stopPullDownRefresh());
  },

  /* ---- 加载任务 ---- */
  async loadTasks() {
    this.setData({ loading: true });
    try {
      const res = await api.production.myCuttingTasks();
      const list = this._normalizeList(res);
      const tasks = list.map(t => this._enrichTask(t));

      const counts = { all: tasks.length, pending: 0, received: 0, bundled: 0 };
      tasks.forEach(t => {
        const s = this._normalizeStatus(t.status);
        if (counts[s] !== undefined) counts[s]++;
      });

      const statusTabs = this.data.statusTabs.map(tab => ({
        ...tab, count: counts[tab.key] || 0,
      }));

      this.setData({ tasks, statusTabs, loading: false });
      this._applyFilter();
    } catch (e) {
      console.error('[CuttingTaskList] loadTasks error', e);
      this.setData({ loading: false });
      toast.error('加载裁剪任务失败');
    }
  },

  /* ---- 状态筛选 ---- */
  onTabChange(e) {
    this.setData({ activeStatus: e.currentTarget.dataset.key });
    this._applyFilter();
  },

  _applyFilter() {
    const { tasks, activeStatus } = this.data;
    if (activeStatus === 'all') {
      this.setData({ filteredTasks: tasks });
    } else {
      this.setData({
        filteredTasks: tasks.filter(t => this._normalizeStatus(t.status) === activeStatus),
      });
    }
  },

  /* ---- 领取任务 ---- */
  async onReceive(e) {
    const task = e.currentTarget.dataset.task;
    if (!task || !task.id) return;

    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.id) {
      return toast.error('请先登录');
    }

    try {
      await api.production.receiveCuttingTaskById(task.id, userInfo.id, userInfo.name || userInfo.nickName);
      toast.success('领取成功');
      this.loadTasks();
    } catch (err) {
      console.error('[CuttingTaskList] receive error', err);
      toast.error('领取失败：' + (err.message || '请稍后重试'));
    }
  },

  /* ---- 跳转详情页（裁剪分扎） ---- */
  goDetail(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;
    const orderNo = task.productionOrderNo || task.orderNo || '';
    const orderId = task.productionOrderId || task.orderId || '';
    wx.navigateTo({
      url: `/pages/cutting/bundle-detail/index?taskId=${task.id}&orderNo=${encodeURIComponent(orderNo)}&orderId=${encodeURIComponent(orderId)}`,
    });
  },

  /* ---- 跳转裁剪单明细页（数量矩阵总览） ---- */
  goBundleDetail(e) {
    const task = e.currentTarget.dataset.task;
    if (!task) return;
    const orderNo = task.productionOrderNo || task.orderNo || '';
    const orderId = task.productionOrderId || task.orderId || '';
    if (!orderNo) return toast.error('缺少订单号');
    wx.navigateTo({
      url: `/pages/cutting/bundle-detail/index?orderNo=${encodeURIComponent(orderNo)}&orderId=${encodeURIComponent(orderId)}`,
    });
  },

  /* ---- 辅助方法 ---- */
  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  _normalizeStatus(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'pending' || s === 'not_started') return 'pending';
    if (s === 'received' || s === 'in_progress') return 'received';
    if (s === 'bundled' || s === 'completed' || s === 'done') return 'bundled';
    return 'pending';
  },

  _enrichTask(task) {
    const status = this._normalizeStatus(task.status);
    const userInfo = getUserInfo();
    const isMine = userInfo && (
      String(task.receiverId) === String(userInfo.id) ||
      task.receiverName === (userInfo.name || userInfo.nickName)
    );

    let statusText = '待领取';
    let statusColor = 'orange';
    let canReceive = false;
    let canOperate = false;

    if (status === 'pending') {
      statusText = '待领取';
      statusColor = 'orange';
      canReceive = true;
    } else if (status === 'received') {
      statusText = '已领取';
      statusColor = 'blue';
      canReceive = false;
      canOperate = isMine;
    } else if (status === 'bundled') {
      statusText = '已完成';
      statusColor = 'green';
    }

    return {
      ...task,
      statusText,
      statusColor,
      canReceive,
      canOperate,
      orderNo: task.productionOrderNo || task.orderNo,
    };
  },

  _bindWsEvents() {
    if (this._wsBound) return;
    this._wsBound = true;
    this._onTaskReceived = () => { this.loadTasks(); };
    this._onTaskCompleted = () => { this.loadTasks(); };
    this._onTaskBundled = () => { this.loadTasks(); };
    this._onDataChanged = () => { this.loadTasks(); };
    this._onRefreshAll = () => { this.loadTasks(); };
    eventBus.on(Events.TASK_RECEIVED, this._onTaskReceived);
    eventBus.on(Events.TASK_COMPLETED, this._onTaskCompleted);
    eventBus.on(Events.TASK_BUNDLED, this._onTaskBundled);
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindWsEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onTaskReceived) eventBus.off(Events.TASK_RECEIVED, this._onTaskReceived);
    if (this._onTaskCompleted) eventBus.off(Events.TASK_COMPLETED, this._onTaskCompleted);
    if (this._onTaskBundled) eventBus.off(Events.TASK_BUNDLED, this._onTaskBundled);
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  onHide() {
    this._unbindWsEvents();
  },

  onUnload() {
    this._unbindWsEvents();
  },
});
