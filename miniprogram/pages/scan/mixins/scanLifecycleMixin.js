/**
 * 扫码页面生命周期 Mixin
 * 从 scan/index.js 提取生命周期管理逻辑
 *
 * @version 2.3
 * @date 2026-02-15
 * @module scanLifecycleMixin
 * @description 管理页面生命周期、事件订阅和数据刷新
 */

/* global Behavior */
const ScanHandler = require('../handlers/ScanHandler');
const api = require('../../../utils/api');
// 修复: 解构导入 eventBus 实例（而非模块对象）
const { eventBus, Events } = require('../../../utils/eventBus');
const ScanOfflineQueue = require('../services/ScanOfflineQueue');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

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
      const unsubData = eventBus.on(Events.DATA_CHANGED, this.handleDataRefresh.bind(this));
      const unsubScan = eventBus.on(Events.SCAN_SUCCESS, this.handleRemoteScanSuccess.bind(this));
      // 隐私授权弹窗（微信审核必须）
      const unsubPrivacy = eventBus.on('showPrivacyDialog', resolve => {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') {
            dialog.showDialog(resolve);
          }
        } catch (_) { /* 组件不存在时静默忽略 */ }
      });

      this.unsubscribeEvents = () => {
        if (unsubData) { unsubData(); }
        if (unsubScan) { unsubScan(); }
        if (unsubPrivacy) { unsubPrivacy(); }
      };
    }

    await this.checkLoginStatus();
    // 恢复上次使用的工序/仓库偏好（零阻塞）
    try {
      const lastProcess = wx.getStorageSync('scan_pref_process');
      const lastWarehouse = wx.getStorageSync('scan_pref_warehouse');
      const updates = {};
      if (lastProcess) updates.lastUsedProcessName = lastProcess;
      if (lastWarehouse) updates.warehouse = lastWarehouse;
      if (Object.keys(updates).length > 0) this.setData(updates);
    } catch (_) { /* 静默忽略，storage 异常不阻断启动 */ }
    // 延迟加载本地历史缓存，不阻塞首屏渲染（历史记录是次要内容）
    setTimeout(() => this.loadLocalHistory(), 80);
    // 异步加载仓库选项（不阻塞页面显示）
    this._loadWarehouseOptions();
    // 初始化离线队列计数 + 注册网络状态变化监听
    try {
      const pendingCount = ScanOfflineQueue.count();
      if (pendingCount > 0) this.setData({ offlinePendingCount: pendingCount });
    } catch (_) { /* 静默忽略 */ }
    this._networkChangeHandler = (networkRes) => {
      if (networkRes.isConnected && ScanOfflineQueue.count() > 0 && !this.data.offlineSyncing) {
        this._flushOfflineQueue();
      }
      this.setData({ offlinePendingCount: ScanOfflineQueue.count() });
    };
    wx.onNetworkStatusChange(this._networkChangeHandler);
  },

  /**
   * 生命周期函数--监听页面显示
   * @returns {Promise<void>} 无返回值
   */
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }

    // 从扫码确认页返回时，读取最新扫码结果并显示在扫码按钮上方
    try {
      const lastResult = getApp().globalData.lastScanResult;
      if (lastResult) {
        this.setData({ lastLocalScanRecord: lastResult });
        getApp().globalData.lastScanResult = null;
      }
    } catch (_) { /* ignore */ }

    // 每次显示都检查登录状态和更新统计
    const isLogin = await this.checkLoginStatus();
    if (isLogin) {
      // ✅ 并行加载数据（try/catch 防止任一失败导致待办弹窗不弹出）
      try {
        await this.loadMyPanel(true);

        // 兜底重拉：首轮请求可能命中后端落库延迟/并发竞争，避免用户必须手动刷新
        if (this._myPanelRevalidateTimer) {
          clearTimeout(this._myPanelRevalidateTimer);
          this._myPanelRevalidateTimer = null;
        }
        this._myPanelRevalidateTimer = setTimeout(() => {
          if (!this || !this.data) return;
          const stats = (this.data.my && this.data.my.stats) || {};
          const hasAnyStat = Number(stats.scanCount || 0) > 0 || Number(stats.totalQuantity || 0) > 0;
          const hasAnyHistory = !!(this.data.my && this.data.my.groupedHistory && this.data.my.groupedHistory.length > 0);
          if (!hasAnyStat && !hasAnyHistory && !this.data.my.loadingStats && !this.data.my.loadingHistory) {
            this.loadMyPanel(true);
          }
          this._myPanelRevalidateTimer = null;
        }, 600);
      } catch (err) {
        console.error('[scanLifecycleMixin] onShow 数据加载异常（不影响待办弹窗）:', err);
      }

      // ✅ 无论数据加载成功与否，都检查待处理任务（从铃铛/小云点击过来）
      this.checkPendingTasks();
      // 检查离线队列，有项目就尝试同步（切回此页时网络可能已恢复）
      const offlineCount = ScanOfflineQueue.count();
      if (offlineCount > 0) {
        this.setData({ offlinePendingCount: offlineCount });
        this._flushTimerId = setTimeout(() => {
          if (this && this.data && !this.data.offlineSyncing) {
            this._flushOfflineQueue();
          }
        }, 1200);
      }    }
  },

  /**
   * 生命周期函数--监听页面隐藏
   * @returns {void} 无返回值
   */
  onHide() {
    if (this._flushTimerId) { clearTimeout(this._flushTimerId); this._flushTimerId = null; }
    if (this._scanRefreshTimer) { clearTimeout(this._scanRefreshTimer); this._scanRefreshTimer = null; }
    if (this._myPanelRevalidateTimer) { clearTimeout(this._myPanelRevalidateTimer); this._myPanelRevalidateTimer = null; }
    this.stopUndoTimer();
  },

  /**
   * 生命周期函数--监听页面卸载
   * @returns {void} 无返回值
   */
  onUnload() {
    if (this._flushTimerId) { clearTimeout(this._flushTimerId); this._flushTimerId = null; }
    if (this._scanRefreshTimer) { clearTimeout(this._scanRefreshTimer); this._scanRefreshTimer = null; }
    if (this._myPanelRevalidateTimer) { clearTimeout(this._myPanelRevalidateTimer); this._myPanelRevalidateTimer = null; }

    // 取消订阅
    if (this.unsubscribeEvents) {
      this.unsubscribeEvents();
    }

    // 清理撤销定时器（委托给 UndoHandler）
    this.stopUndoTimer();

    // 清理网络状态监听
    if (this._networkChangeHandler) {
      try { wx.offNetworkStatusChange(this._networkChangeHandler); } catch (_) { /* 静默 */ }
      this._networkChangeHandler = null;
    }
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
      // 检查质检任务
      this.checkPendingQualityTask();
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
          // ✅ 延迟弹出质检弹窗，确保页面渲染完成
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
              coverImage: getAuthedImageUrl(task.coverImage || task.styleImage || ''),
              styleImage: getAuthedImageUrl(task.styleImage || task.coverImage || ''),
            });
          }, 300);
        }
      } catch (e) {
        console.error('检查质检任务失败:', e);
      }
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

    /**     * 批量上传离线队列中的扫码记录
     * 联网恢复或用户手动点击时调用
     * @returns {Promise<void>}
     */
    async _flushOfflineQueue() {
      if (ScanOfflineQueue.count() === 0) return;
      if (this.data.offlineSyncing) return; // 防重入
      this.setData({ offlineSyncing: true });
      try {
        const { submitted, failed } = await ScanOfflineQueue.flush(api, () => {
          this.setData({ offlinePendingCount: ScanOfflineQueue.count() });
        });
        this.setData({ offlineSyncing: false, offlinePendingCount: ScanOfflineQueue.count() });
        if (submitted > 0) {
          wx.showToast({ title: '已同步 ' + submitted + ' 条扫码', icon: 'none', duration: 2200 });
          setTimeout(() => { if (this && this.data) this.loadMyPanel(true); }, 500);
        }
        if (failed > 0 && ScanOfflineQueue.count() > 0) {
          wx.showToast({ title: failed + ' 条暂时失败，稍后自动重试', icon: 'none', duration: 2500 });
        }
      } catch (e) {
        console.warn('[lifecycle] _flushOfflineQueue 异常:', e);
        this.setData({ offlineSyncing: false });
      }
    },

    /**     * 从字典API加载仓库选项，失败时保留默认值
     * @returns {Promise<void>}
     */
    async _loadWarehouseOptions() {
      try {
        // 加载成品仓库库位（默认）
        const res = await api.system.getDictList('finished_warehouse_location');
        const records = Array.isArray(res) ? res : ((res && res.records) ? res.records : (res?.data || []));
        if (Array.isArray(records) && records.length > 0) {
          const options = records
            .filter(item => item.dictLabel)
            .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
            .map(item => item.dictLabel);
          if (options.length > 0) {
            this.setData({ warehouseOptions: options });
          }
        }
      } catch (e) {
        console.warn('[scan] 加载仓库选项失败，仓库选择不可用', e);
      }
    },
  },
});

module.exports = scanLifecycleMixin;
