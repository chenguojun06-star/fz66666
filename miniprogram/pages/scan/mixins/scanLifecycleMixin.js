/**
 * 扫码页面生命周期 Mixin
 * 从 scan/index.js 提取生命周期管理逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module scanLifecycleMixin
 * @description 管理页面生命周期、事件订阅和数据刷新
 */

const { getToken, getUserInfo, getStorageValue } = require('../../../utils/storage');
const { toastAndRedirect } = require('../../../utils/uiHelper');
const ScanHandler = require('../handlers/ScanHandler');
const ProcurementHandler = require('../handlers/ProcurementHandler');
const CuttingHandler = require('../handlers/CuttingHandler');
const HistoryHandler = require('../handlers/HistoryHandler');
const UndoHandler = require('../handlers/UndoHandler');
const api = require('../../../utils/api');
// 修复: 解构导入 eventBus 实例（而非模块对象）
const { eventBus } = require('../../../utils/eventBus');

/**
 * 生命周期 Mixin
 * 使用微信小程序的 Behavior 机制
 */
const scanLifecycleMixin = Behavior({
  /**
   * 生命周期函数--监听页面加载
   * @returns {Promise<void>} 无返回值
   */
  async onLoad() {
    // 初始化业务处理器（加 try-catch，防止构造抛错导致 scanHandler 永远为 null）
    try {
      this.scanHandler = new ScanHandler(api, {
        onSuccess: this.handleScanSuccess.bind(this),
        onError: this.handleScanError.bind(this),
        getCurrentFactory: () => this.data.currentFactory,
        getCurrentWorker: () => this.data.currentUser,
      });
    } catch (e) {
      console.error('[scanLifecycleMixin] ScanHandler 初始化失败:', e);
      // scanHandler 保持 null，processScanCode 中会做守卫提示
    }

    // 订阅全局事件
    // 修复: 使用 eventBus.on 且绑定 this
    if (eventBus && typeof eventBus.on === 'function') {
      const unsubData = eventBus.on('DATA_REFRESH', this.handleDataRefresh.bind(this));
      const unsubScan = eventBus.on('SCAN_SUCCESS', this.handleRemoteScanSuccess.bind(this));

      this.unsubscribeEvents = () => {
        if (unsubData) { unsubData(); }
        if (unsubScan) { unsubScan(); }
      };
    }

    await this.checkLoginStatus();
    // 延迟加载本地历史缓存，不阻塞首屏渲染（历史记录是次要内容）
    setTimeout(() => this.loadLocalHistory(), 80);
  },

  /**
   * 生命周期函数--监听页面显示
   * @returns {Promise<void>} 无返回值
   */
  async onShow() {
    // 设置 tab-bar 选中状态（扫码页面是第3个tab，索引为2）
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 2);
    }

    // 每次显示都检查登录状态和更新统计
    const isLogin = await this.checkLoginStatus();
    if (isLogin) {
      // ✅ 并行加载数据，等待全部完成后再检查待处理任务
      await Promise.all([
        this.loadMyPanel(true),
        this.loadMyProcurementTasks(), // 加载采购任务列表
        this.loadMyCuttingTasks(),     // 加载裁剪任务列表
      ]);

      // ✅ 数据加载完成后，检查是否有待处理任务（从铃铛点击过来）
      this.checkPendingTasks();
    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   * @returns {void} 无返回值
   */
  onHide() {
    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();
  },

  /**
   * 生命周期函数--监听页面卸载
   * @returns {void} 无返回值
   */
  onUnload() {
    // 取消订阅
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
    }

    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();
  },

  /**
   * 下拉刷新
   * @returns {Promise<void>} 无返回值
   */
  async onPullDownRefresh() {
    await this.loadMyPanel(true);
    wx.stopPullDownRefresh();
  },

  methods: {
    /**
     * 检查是否有待处理的任务（从铃铛点击过来）
     * @returns {void} 无返回值
     */
    checkPendingTasks() {
      // 优先检查质检任务
      this.checkPendingQualityTask();
      // 检查裁剪任务
      this.checkPendingCuttingTask();
      // 检查采购任务
      this.checkPendingProcurementTask();
    },

    /**
     * 检查是否有待处理的质检任务
     * @returns {void} 无返回值
     */
    checkPendingQualityTask() {
      try {
        const taskStr = wx.getStorageSync('pending_quality_task');
        if (taskStr) {
          wx.removeStorageSync('pending_quality_task');
          const task = JSON.parse(taskStr);
          // ✅ 延迟弹出质检弹窗，确保页面数据已加载和渲染完成
          setTimeout(() => {
            this.showQualityModal({
              orderId: task.orderId || '', // 订单ID（warehousing需要）
              orderNo: task.orderNo || '',
              bundleId: task.bundleId || task.cuttingBundleId || '', // 菲号ID
              bundleNo: task.bundleNo || task.cuttingBundleNo || '',
              styleNo: task.styleNo || '',
              color: task.color || '',
              size: task.size || '',
              quantity: task.quantity || 1,
              scanCode: task.scanCode || '',
              recordId: task.id || task.scanId,
            });
          }, 800);
        }
      } catch (e) {
        console.error('检查质检任务失败:', e);
      }
    },

    /**
     * 检查是否有待处理的裁剪任务（从铃铛点击过来）
     * @returns {void} 无返回值
     */
    checkPendingCuttingTask() {
      CuttingHandler.checkPendingCuttingTask(this);
    },

    async handleCuttingTaskFromBell(task) {
      return CuttingHandler.handleCuttingTaskFromBell(this, task);
    },

    /**
     * 检查是否有待处理的采购任务（从铃铛点击过来）
     * @returns {void} 无返回值
     */
    checkPendingProcurementTask() {
      ProcurementHandler.checkPendingProcurementTask(this);
    },

    async handleProcurementTaskFromBell(task) {
      return ProcurementHandler.handleProcurementTaskFromBell(this, task);
    },

    /**
     * 处理数据刷新事件
     * @returns {void} 无返回值
     */
    handleDataRefresh() {
      this.loadMyPanel(true);
    },

    /**
     * 处理远程扫码成功通知（如来自其他设备的同步）
     * @returns {void} 无返回值
     */
    handleRemoteScanSuccess() {
      this.loadMyPanel(true);
    },
  },
});

module.exports = scanLifecycleMixin;
