const api = require('../../utils/api');
const { errorHandler } = require('../../utils/errorHandler');
const { syncManager } = require('../../utils/syncManager');
const { onDataRefresh } = require('../../utils/eventBus');
const { toast, safeNavigate } = require('../../utils/uiHelper');


// ==================== 提取的工具模块 ====================
const { normalizeText, transformOrderData } = require('./utils/orderTransform');

// ==================== 提取的 Handler ====================
const BatchProgressHandler = require('./handlers/BatchProgressHandler');
const RollbackHandler = require('./handlers/RollbackHandler');

Page({
  data: {
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
    },
    orderStats: {
      orderCount: 0,
      totalQuantity: 0,
    },
    orders: { loading: false, page: 1, pageSize: 10, hasMore: true, list: [] },
    highlightOrderNo: '', // 需要高亮显示的订单号
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
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 1);
    }
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
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
      null;
    }

    // ⚠️ 强制刷新订单列表（应对后端数据变更）
    this.loadOrders(true);

    // 检查是否有pending_order_hint，如果有则显示提示
    try {
      const pendingOrderHint = wx.getStorageSync('pending_order_hint');
      if (pendingOrderHint) {
        toast.info(`请处理订单: ${pendingOrderHint}`, 3000);
        wx.removeStorageSync('pending_order_hint');
      }

      // 检查是否需要高亮显示订单
      const highlightOrderNo = wx.getStorageSync('highlight_order_no');
      if (highlightOrderNo) {
        this.setData({ highlightOrderNo });
        wx.removeStorageSync('highlight_order_no');
      }
    } catch (e) {
      // 检查pending_order_hint失败静默处理
    }



    // 启动订单列表的实时同步 (30 秒轮询一次)
    this.setupOrderSync();

    // 设置数据刷新监听
    this.setupDataRefreshListener();

    this.ensureLoaded();
  },

  setupDataRefreshListener() {
    // 如果已经设置监听，先取消旧的
    if (this._unsubscribeRefresh) {
      this._unsubscribeRefresh();
    }

    // 订阅数据刷新事件
    this._unsubscribeRefresh = onDataRefresh(_payload => {
      // 刷新当前页面数据
      this.loadOrders(true);
    });
  },

  onPullDownRefresh() {
    this.refreshActive().finally(() => wx.stopPullDownRefresh());
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
        },
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



  refreshActive() {
    return this.loadOrders(true);
  },

  loadMoreActive() {
    return this.loadOrders(false);
  },

  loadOrders(reset) {
    const app = getApp();
    if (!app || typeof app.loadPagedList !== 'function') {
      return Promise.resolve();
    }

    return app.loadPagedList(
      this,
      'orders',
      reset === true,
      async ({ page, pageSize }) => {
        const f = this.data.filters;
        const params = {
          page,
          pageSize,
          orderNo: normalizeText(f.orderNo),
          styleNo: normalizeText(f.styleNo),
          factoryName: normalizeText(f.factoryName),
        };

        // 根据标签页添加当前工序节点过滤
        const tab = this.data.activeTab;
        const processMap = {
          procurement: '采购',
          cutting: '裁剪',
          sewing: '车缝',
          warehousing: '入库',
        };
        if (tab !== 'all' && processMap[tab]) {
          params.currentProcessName = processMap[tab];
        }

        return api.production.listOrders(params);
      },
      r => transformOrderData(r)
    ).then(() => {
      // 按时间排序（从新到老）
      const sortedList = [...this.data.orders.list].sort((a, b) => {
        const timeA = new Date(a.createdAt || a.createTime || 0).getTime();
        const timeB = new Date(b.createdAt || b.createTime || 0).getTime();
        return timeB - timeA; // 降序：新订单在前
      });

      this.setData({ 'orders.list': sortedList });
      this.updateOrderStats();
    });
  },

  updateOrderStats(list) {
    const source = Array.isArray(list) ? list : (this.data.orders.list || []);
    const orderCount = source.length;
    const totalQuantity = source.reduce((sum, item) => sum + Number(item.orderQuantity || 0), 0);
    this.setData({
      orderStats: {
        orderCount,
        totalQuantity,
      },
    });
  },

  /**
   * 设置订单列表的实时同步
   */
  setupOrderSync() {
    // 只在订单标签页启用同步
    const syncFn = async () => {
      try {
        const f = this.data.filters;
        const params = {
          page: 1,
          pageSize: 20, // 只同步前 20 条
          orderNo: normalizeText(f.orderNo),
          styleNo: normalizeText(f.styleNo),
          factoryName: normalizeText(f.factoryName),
        };
        return await api.production.listOrders(params);
      } catch (error) {
        errorHandler.logError(error, '[Work] Sync orders');
        throw error;
      }
    };

    // 数据变化时的处理
    const onDataChange = newPage => {
      if (!newPage || !Array.isArray(newPage.records)) {
        return;
      }

      // 更新列表
      const newList = newPage.records.map(r => transformOrderData(r));

      this.setData({ 'orders.list': newList });
      this.updateOrderStats(newList);
    };

    // 启动同步 (30 秒轮询一次)
    syncManager.startSync('work_orders', syncFn, 30000, {
      onDataChange,
      onError: (error, errorCount) => {
        if (errorCount > 3) {
          // 连续3次失败时停止同步
          syncManager.stopSync('work_orders');
        }
      },
    });
  },



  onHide() {
    // 页面隐藏时停止同步（节省资源）
    syncManager.stopSync('work_orders');
  },

  // ==================== 全局搜索功能 ====================
  /**
   * 全局搜索输入
   */
  onGlobalSearchInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({ 'globalSearch.keyword': value });
  },

  /**
   * 执行全局搜索
   */
  async doGlobalSearch() {
    const keyword = String(this.data.globalSearch.keyword || '').trim();
    if (!keyword) {
      toast.error('请输入搜索关键词');
      return;
    }

    this.setData({ 'globalSearch.loading': true });
    wx.showLoading({ title: '搜索中...', mask: true });

    try {
      // 搜索订单（同时按订单号、款号、工厂名搜索）
      const ordersRes = await api.production.listOrders({
        page: 1,
        pageSize: 50,
        orderNo: keyword,
        styleNo: keyword,
        factoryName: keyword,
      }).catch(() => ({ records: [] }));

      const results = (ordersRes.records || []).map(item => {
        const transformed = transformOrderData(item);
        return {
          id: transformed.id,
          type: 'order',
          title: transformed.orderNo || '-',
          subtitle: `款号: ${transformed.styleNo || '-'} | 工厂: ${transformed.factoryName || '-'}`,
          statusText: transformed.statusText || '-',
          statusColor: transformed.isClosed ? 'var(--color-success)' : 'var(--color-primary)',
          orderNo: transformed.orderNo,
          styleNo: transformed.styleNo,
          progress: transformed.productionProgress || 0,
          currentProcessName: transformed.currentProcessName || '',
          rawData: transformed,
        };
      });

      this.setData({
        'globalSearch.results': results,
        'globalSearch.hasSearched': true,
        'globalSearch.loading': false,
      });

      wx.hideLoading();

      if (results.length === 0) {
        toast.info('未找到匹配的订单');
      }
    } catch (error) {
      console.error('[doGlobalSearch] 搜索失败:', error);
      this.setData({ 'globalSearch.loading': false });
      wx.hideLoading();
      toast.error('搜索失败，请重试');
    }
  },

  /**
   * 清空搜索
   */
  clearGlobalSearch() {
    this.setData({
      'globalSearch.keyword': '',
      'globalSearch.hasSearched': false,
      'globalSearch.results': [],
    });
  },

  /**
   * 关闭搜索结果
   */
  closeGlobalSearch() {
    this.setData({
      'globalSearch.hasSearched': false,
      'globalSearch.results': [],
    });
  },

  /**
   * 点击搜索结果项 - 跳转到对应订单并高亮
   */
  onResultItemTap(e) {
    const item = (e && e.detail && e.detail.item) ||
                 (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.item);
    if (!item || item.type !== 'order') {
      return;
    }

    // 关闭搜索结果
    this.closeGlobalSearch();

    // 根据订单状态切换到对应 tab
    const status = item.rawData?.status || item.rawData?.currentStage;
    let targetTab = 'all'; // 默认显示全部订单

    if (status === 'cutting') {
      targetTab = 'cutting';
    } else if (status === 'sewing') {
      targetTab = 'sewing';
    } else if (status === 'procurement') {
      targetTab = 'procurement';
    }

    // 切换 tab
    this.setData({
      activeTab: targetTab,
      highlightOrderNo: item.orderNo
    });

    // 重新加载该 tab 的数据（确保订单在列表中）
    this.loadOrders(true);

    // 延迟滚动到订单位置（等待数据加载完成）
    setTimeout(() => {
      // 查找订单在列表中的索引
      const orders = this.data.orders?.list || [];
      const index = orders.findIndex(order => order.orderNo === item.orderNo);

      if (index !== -1) {
        // 滚动到该订单
        wx.pageScrollTo({
          selector: `.list-item:nth-child(${index + 1})`,
          duration: 300,
        });
      }

      // 3秒后取消高亮
      setTimeout(() => {
        this.setData({ highlightOrderNo: '' });
      }, 3000);
    }, 500);
  },
});
