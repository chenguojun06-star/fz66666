const api = require('../../utils/api');
const { errorHandler } = require('../../utils/errorHandler');
const { syncManager } = require('../../utils/syncManager');
const { toast, safeNavigate } = require('../../utils/uiHelper');
const { getCurrentFactoryId } = require('../../utils/permission');


// ==================== 提取的工具模块 ====================
const { normalizeText, transformOrderData } = require('./utils/orderTransform');

// ==================== 提取的 Handler ====================
const BatchProgressHandler = require('./handlers/BatchProgressHandler');
const RollbackHandler = require('./handlers/RollbackHandler');
const BundleGenerateHandler = require('./handlers/BundleGenerateHandler');
const GlobalSearchHandler = require('./handlers/GlobalSearchHandler');
const OrderListHandler = require('./handlers/OrderListHandler');

Page({
  data: {
    isFactory: false, // 是否为外发工厂账号（隐藏非工厂相关模块）
    globalSearch: {
      keyword: '',
      hasSearched: false,
      loading: false,
      results: [],
    },
    activeTab: 'all',
    filters: {
      orderNo: '',
      styleNo: '',
      factoryName: '',
      parentOrgUnitId: '',
      factoryType: '',
    },
    factoryTypeOptions: [{ label: '全部工厂', value: '' }, { label: '内部工厂', value: 'INTERNAL' }, { label: '外部工厂', value: 'EXTERNAL' }],
    selectedFactoryTypeIndex: 0,
    delayedOnly: false,
    orderStats: {
      orderCount: 0,
      totalQuantity: 0,
    },
    orders: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
    highlightOrderNo: '', // 需要高亮显示的订单号
    unreadNoticeCount: 0, // 未读智能提醒数
    rollback: {
      open: false,
      submitting: false,
      orderId: '',
      cuttingBundleQrCode: '',
      rollbackQuantity: 1,
      rollbackRemark: '',
    },
    rollbackStep: {
      open: false,
      submitting: false,
      orderId: '',
      orderNo: '',
      nextProcessName: '',
      nextProgress: 0,
      remark: '',
    },
    batchProgress: {
      open: false,
      submitting: false,
      selectedIds: [],
      progress: '',
      remark: '',
    },
    bundleModal: {
      visible: false,
      loading: false,
      orderId: '',
      orderNo: '',
      styleNo: '',
      colorGroups: [],
      allSizes: [],
      bundleSize: '',
      previewRows: [],
    },
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    this.setData({ isFactory: !!getCurrentFactoryId() });
    try {
      const nextTab = wx.getStorageSync('work_active_tab');
      if (nextTab) {
        const allowed = ['all', 'procurement', 'cutting', 'sewing', 'warehousing'];
        if (allowed.includes(nextTab) && nextTab !== this.data.activeTab) {
          this.setData({ activeTab: nextTab });
        }
        wx.removeStorageSync('work_active_tab');
      }
    } catch (e) {
      console.error('读取tab失败:', e);
    }

    if (!this.data.orders.list || this.data.orders.list.length === 0) {
      this.loadOrders(true);
    }

    this.loadUnreadNoticeCount();

    try {
      const pendingOrderHint = wx.getStorageSync('pending_order_hint');
      if (pendingOrderHint) {
        toast.info(`请处理订单: ${pendingOrderHint}`, 3000);
        wx.removeStorageSync('pending_order_hint');
      }

      const highlightOrderNo = wx.getStorageSync('highlight_order_no');
      if (highlightOrderNo) {
        this.setData({ highlightOrderNo });
        wx.removeStorageSync('highlight_order_no');
      }

      const scrollToOrderNo = wx.getStorageSync('scroll_to_order_no');
      if (scrollToOrderNo) {
        wx.removeStorageSync('scroll_to_order_no');
        this.scrollToOrder(scrollToOrderNo);
      }
    } catch (e) {
      console.error('读取提示失败:', e);
    }
  },

  scrollToOrder(orderNo) {
    if (!orderNo || !this.data.orders.list) return;

    const index = this.data.orders.list.findIndex(
      order => order.orderNo === orderNo || order.styleNo === orderNo
    );

    if (index >= 0) {
      this.setData({
        highlightOrderNo: orderNo,
        scrollToIndex: index,
      });

      this._highlightTimer = setTimeout(() => {
        this.setData({ highlightOrderNo: '' });
        this._highlightTimer = null;
      }, 3000);
    }
  },

  onPullDownRefresh() {
    this.refreshActive().finally(() => wx.stopPullDownRefresh());
  },

  onRefresh() {
    if (this.data.orders.loading) return;
    this.refreshActive();
  },

  onReachBottom() {
    this.loadMoreActive();
  },

  ensureLoaded() {
    // 所有标签页都加载订单列表
    if (this.data.orders.list.length === 0) {
      this.loadOrders(true);
    }
  },

  onTab(e) {
    const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
    if (!tab || tab === this.data.activeTab) {
      return;
    }
    this.setData({ activeTab: tab });
    // 切换标签页时强制重新加载订单
    const app = getApp();
    if (app && typeof app.resetPagedList === 'function') {
      app.resetPagedList(this, 'orders');
    }
    this.loadOrders(true);
  },


  async loadUnreadNoticeCount() {
    try {
      const count = await api.notice.unreadCount();
      this.setData({ unreadNoticeCount: Number(count) || 0 });
    } catch (_) { /* 静默失败，不影响主界面 */ }
  },

  goInbox() {
    wx.navigateTo({ url: '/pages/work/inbox/index' });
  },

  navToAiAssistant() {
    wx.navigateTo({ url: '/pages/work/ai-assistant/index' });
  },

  navTo(e) {
    const url = e.currentTarget.dataset.url;
    safeNavigate({ url }).catch(() => {});
  },

  goScan() {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  },

  onOrderNoInput(e) {
    this.setData({ 'filters.orderNo': (e && e.detail && e.detail.value) || '' });
  },
  onStyleNoInput(e) {
    this.setData({ 'filters.styleNo': (e && e.detail && e.detail.value) || '' });
  },
  onFactoryNameInput(e) {
    this.setData({ 'filters.factoryName': (e && e.detail && e.detail.value) || '' });
  },

  onFactoryTypeFilterChange(e) {
    const index = Number(e && e.detail ? e.detail.value : 0) || 0;
    const option = this.data.factoryTypeOptions[index] || { value: '' };
    this.setData({
      selectedFactoryTypeIndex: index,
      'filters.factoryType': option.value || '',
    }, () => {
      const app = getApp();
      if (app && typeof app.resetPagedList === 'function') {
        app.resetPagedList(this, 'orders');
      }
      this.loadOrders(true);
    });
  },

  // ==================== 批量进度（委托 BatchProgressHandler） ====================
  toggleBatchProgress() { BatchProgressHandler.toggleBatchProgress(this); },
  onBatchSelectChange(e) { BatchProgressHandler.onBatchSelectChange(this, e); },
  onBatchProgressInput(e) { BatchProgressHandler.onBatchProgressInput(this, e); },
  onBatchProgressRemarkInput(e) { BatchProgressHandler.onBatchProgressRemarkInput(this, e); },
  clearBatchSelection() { BatchProgressHandler.clearBatchSelection(this); },
  async submitBatchProgress() { return BatchProgressHandler.submitBatchProgress(this); },

  clearOrderFilters() {
    this.setData(
      {
        filters: {
          ...this.data.filters,
          orderNo: '',
          styleNo: '',
          factoryName: '',
          parentOrgUnitId: '',
          factoryType: '',
        },
        selectedFactoryTypeIndex: 0,
        delayedOnly: false,
      },
      () => {
        const app = getApp();
        if (app && typeof app.resetPagedList === 'function') {
          app.resetPagedList(this, 'orders');
        }
        this.loadOrders(true);
      }
    );
  },

  toggleDelayedOnly() {
    const newDelayedOnly = !this.data.delayedOnly;
    this.setData({ delayedOnly: newDelayedOnly }, () => {
      const app = getApp();
      if (app && typeof app.resetPagedList === 'function') {
        app.resetPagedList(this, 'orders');
      }
      this.loadOrders(true);
    });
  },

  // ==================== 步骤回流（委托 RollbackHandler） ====================
  async openStepRollback(e) { return RollbackHandler.openStepRollback(this, e); },
  onRollbackStepRemarkInput(e) { RollbackHandler.onRollbackStepRemarkInput(this, e); },
  closeStepRollback() { RollbackHandler.closeStepRollback(this); },
  async submitStepRollback() { return RollbackHandler.submitStepRollback(this); },

  // ==================== 菲号回退（委托 RollbackHandler） ====================
  toggleRollback() { RollbackHandler.toggleRollback(this); },
  onRollbackOrderIdInput(e) { RollbackHandler.onRollbackOrderIdInput(this, e); },
  onRollbackQrInput(e) { RollbackHandler.onRollbackQrInput(this, e); },
  onRollbackQtyInput(e) { RollbackHandler.onRollbackQtyInput(this, e); },
  onRollbackRemarkInput(e) { RollbackHandler.onRollbackRemarkInput(this, e); },
  onScanRollbackQr() { RollbackHandler.onScanRollbackQr(this); },
  async submitRollback() { return RollbackHandler.submitRollback(this); },

  // ==================== 菲号生成（委托 BundleGenerateHandler） ====================
  onGenerateBundle(e) { BundleGenerateHandler.onGenerateBundle(this, e); },
  onBundleSizeInput(e) { BundleGenerateHandler.onBundleSizeInput(this, e); },
  onExcessRateInput(e) { BundleGenerateHandler.onExcessRateInput(this, e); },
  onLastBundleQtyInput(e) { BundleGenerateHandler.onLastBundleQtyInput(this, e); },
  onCancelBundle() { BundleGenerateHandler.onCancelBundle(this); },
  async onConfirmBundle() { return BundleGenerateHandler.onConfirmBundle(this); },

  // ==================== 拆菲号（跳转独立页面） ====================
  onSplitBundle(e) {
    const order = e.currentTarget.dataset.order || {};
    wx.navigateTo({
      url: '/pages/work/bundle-split/index?orderNo=' + encodeURIComponent(order.orderNo || '')
    });
  },

  refreshActive() {
    return this.loadOrders(true);
  },

  loadMoreActive() {
    return this.loadOrders(false);
  },

  // ==================== 订单列表（委托 OrderListHandler） ====================
  loadOrders(reset) { return OrderListHandler.loadOrders(this, reset); },
  updateOrderStats(list) { OrderListHandler.updateOrderStats(this, list); },
  setupOrderSync() { OrderListHandler.setupOrderSync(this); },



  onHide() {
    syncManager.stopSync('work_orders');
    if (this._highlightTimer) { clearTimeout(this._highlightTimer); this._highlightTimer = null; }
  },

  onUnload() {
    syncManager.stopSync('work_orders');
    if (this._highlightTimer) { clearTimeout(this._highlightTimer); this._highlightTimer = null; }

    // 清理数据刷新监听
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
      this._unsubscribeRefresh = null;
    }
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },

  // ==================== 全局搜索（委托 GlobalSearchHandler） ====================
  onGlobalSearchInput(e) { GlobalSearchHandler.onGlobalSearchInput(this, e); },
  async doGlobalSearch() { return GlobalSearchHandler.doGlobalSearch(this); },
  clearGlobalSearch() { GlobalSearchHandler.clearGlobalSearch(this); },
  closeGlobalSearch() { GlobalSearchHandler.closeGlobalSearch(this); },
  onResultItemTap(e) { GlobalSearchHandler.onResultItemTap(this, e); },

  /** 卡片折叠/展开 */
  onCardToggle(e) {
    const index = e.currentTarget.dataset.index;
    const cur = this.data.orders.list[index]?.expanded;
    this.setData({ [`orders.list[${index}].expanded`]: !cur });
  },

  /** 封面图加载失败（COS 404）→ 清空 URL，显示"暂无\n图片"占位 */
  onCoverImageError(e) {
    const idx = Number(e.currentTarget.dataset.index);
    if (isNaN(idx)) return;
    this.setData({ [`orders.list[${idx}].styleCoverUrl`]: '' });
  },
});
