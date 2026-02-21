const api = require('../../utils/api');
const reminderManager = require('../../utils/reminderManager');
const {
  orderStatusText,
  qualityStatusText,
  getStatusColor,
  getQualityColor,
} = require('../../utils/orderStatusHelper');
const { normalizeStats, normalizeActivities } = require('../../utils/dataTransform');
const { toast, safeNavigate } = require('../../utils/uiHelper');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRangeStats(raw) {
  const data = raw && typeof raw === 'object' ? raw : {};
  return {
    day: toNumber(data.day),
    week: toNumber(data.week),
    month: toNumber(data.month),
    year: toNumber(data.year),
    total: toNumber(data.total),
  };
}

function normalizeTopStats(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  return {
    sampleDevelopment: normalizeRangeStats(data.sampleDevelopment),
    bulkOrder: normalizeRangeStats(data.bulkOrder),
    cutting: normalizeRangeStats(data.cutting),
    warehousing: normalizeRangeStats(data.warehousing),
  };
}

Page({
  data: {
    loading: false,
    statsLoaded: false,
    keyword: '',
    showReminderPanel: false,
    globalSearch: {
      keyword: '',
      hasSearched: false,
      loading: false,
      results: [],
    },
    stats: {
      styleCount: 0,
      productionCount: 0,
      productionOrders: 0,
      orderQuantityTotal: 0,
      pendingReconciliationCount: 0,
      paymentApprovalCount: 0,
      todayScanCount: 0,
      totalScanCount: 0,
      warehousingOrderCount: 0,
      warehousingToday: 0,
      totalWarehousingCount: 0,
      unqualifiedQuantity: 0,
      defectCount: 0,
      materialPurchase: 0,
      urgentEventCount: 0,
    },
    topStats: {
      sampleDevelopment: { day: 0, week: 0, month: 0, year: 0, total: 0 },
      bulkOrder: { day: 0, week: 0, month: 0, year: 0, total: 0 },
      cutting: { day: 0, week: 0, month: 0, year: 0, total: 0 },
      warehousing: { day: 0, week: 0, month: 0, year: 0, total: 0 },
    },
    activities: [],
  },

  onShow() {
    const app = getApp();
    if (app && typeof app.setTabSelected === 'function') {
      app.setTabSelected(this, 0);
    }
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) {
      return;
    }
    this.loadStats();

    // 加载提醒列表
    this.loadReminders();
  },

  onPullDownRefresh() {
    this.loadStats().finally(() => wx.stopPullDownRefresh());
  },

  refresh() {
    this.loadStats();
  },

  onKeywordInput(e) {
    this.setData({ keyword: (e && e.detail && e.detail.value) || '' });
  },

  queryByKeyword() {
    this.loadStats();
  },

  resetKeyword() {
    this.setData({ keyword: '' });
    this.loadStats();
  },

  buildDashboardParams() {
    const raw = String(this.data.keyword || '').trim();
    if (!raw) {
      return {};
    }
    return {
      brand: raw,
      factory: raw,
    };
  },

  goWork(e) {
    const tab = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.tab : '';
    if (tab) {
      try {
        wx.setStorageSync('work_active_tab', tab);
      } catch (err) {
        // 存储失败静默处理
      }
    }
    safeNavigate({ url: '/pages/work/index' }, 'switchTab').catch(() => {});
  },

  goScan() {
    safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
  },

  goAdmin() {
    safeNavigate({ url: '/pages/admin/index' }, 'switchTab').catch(() => {});
  },

  async loadStats() {
    if (this.data.loading) {
      return;
    }
    this.setData({ loading: true });
    try {
      const params = this.buildDashboardParams();
      const [resp, topStatsResp] = await Promise.all([
        api.dashboard.get(params),
        api.dashboard.getTopStats({ range: 'week' }).catch(() => null),
      ]);

      // 兼容处理：有些API返回直接是数据对象，有些包裹在data属性中
      // 根据日志观察，api.dashboard.get 返回的 resp 直接包含了 count 字段 (如 productionOrderCount)
      // 因此优先使用 resp 本身，如果 resp.data 存在且也是对象才考虑使用它
      const payload = (resp && resp.data) || resp;
      const topStatsPayload = topStatsResp || {};

      const stats = normalizeStats(payload);
      const topStats = normalizeTopStats(topStatsPayload);
      const activities = normalizeActivities(payload);
      this.setData({ stats, topStats, statsLoaded: true, activities });
    } catch (e) {
      if (e && e.type === 'auth') {
        return;
      }
      const app = getApp();
      if (app && typeof app.toastError === 'function') {
        app.toastError(e, '加载失败');
      }
    } finally {
      this.setData({ loading: false });
    }
  },

  getCardData(e) {
    const key = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.key : '';
    const topStats = this.data.topStats || {};
    return topStats[key] || { day: 0, week: 0, month: 0, year: 0, total: 0 };
  },

  loadReminders() {
    const allReminders = reminderManager.getReminders();
    const now = Date.now();
    const REMINDER_INTERVAL = 10 * 60 * 60 * 1000; // 10小时

    // 过滤出需要提醒的（超过10小时）
    const pendingReminders = allReminders.filter(r => {
      const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
      return baseTime > 0 && now - baseTime >= REMINDER_INTERVAL;
    });

    // 格式化时间显示
    const reminders = pendingReminders.map(r => {
      const baseTime = Number(r.lastRemindAt || r.createdAt || 0);
      const hours = baseTime > 0 ? Math.floor((now - baseTime) / (60 * 60 * 1000)) : 0;
      const timeAgo =
        baseTime <= 0 ? '未知' : hours < 24 ? `${hours}小时前` : `${Math.floor(hours / 24)}天前`;
      const orderNo = r.orderNo || '';
      const type = r.type || '';
      return {
        id: r.id || `${orderNo}_${type}`,
        orderNo,
        type,
        createdAt: baseTime,
        timeAgo,
      };
    });

    // 提醒数据僅内存，不写入 setData
    this._reminders = reminders;
    this._reminderCount = reminders.length;
  },

  toggleReminderPanel() {
    this.setData({ showReminderPanel: !this.data.showReminderPanel });
  },

  handleReminderClick(e) {
    const reminder = e.currentTarget.dataset.reminder;
    if (!reminder) {
      return;
    }

    // 关闭面板
    this.setData({ showReminderPanel: false });

    const type = reminder.type || '';
    const orderNo = reminder.orderNo || '';

    // 根据任务类型跳转到对应页面
    if (type === '采购') {
      // 采购任务跳转到扫码页面，设置为采购模式
      try {
        wx.setStorageSync('mp_scan_type_index', 2);
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        // 存储失败静默处理
      }
      safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
    } else if (type === '裁剪' || type === '缝制' || type === '质检') {
      // 生产任务跳转到工作台的生产中标签页
      try {
        wx.setStorageSync('work_active_tab', 'orders_production');
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        // 存储失败静默处理
      }
      safeNavigate({ url: '/pages/work/index' }, 'switchTab').catch(() => {});
    } else {
      // 其他任务默认跳转到扫码页面
      try {
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        // 存储失败静默处理
      }
      safeNavigate({ url: '/pages/scan/index' }, 'switchTab').catch(() => {});
    }
  },

  // ============ 全局搜索功能 ============

  /**
   * 处理订单搜索结果
   * @param {Array} orders - 订单列表
   * @returns {Array} 格式化的结果列表
   */
  _processOrderResults(orders) {
    return orders.map(item => {
      const statusText = orderStatusText(item.status);
      return {
        id: `order_${item.id}`,
        type: 'order',
        typeText: item.status === 'production' ? '生产' : '订单',
        orderNo: item.orderNo,
        styleNo: item.styleNo,
        factoryName: item.factoryName,
        statusText,
        statusColor: getStatusColor(item.status),
        rawData: item,
      };
    });
  },

  /**
   * 处理入库搜索结果
   * @param {Array} warehousing - 入库单列表
   * @returns {Array} 格式化的结果列表
   */
  _processWarehousingResults(warehousing) {
    return warehousing.map(item => {
      const qualityText = qualityStatusText(item.qualityStatus);
      return {
        id: `warehousing_${item.id}`,
        type: 'warehousing',
        typeText: '入库',
        orderNo: item.orderNo,
        styleNo: item.styleNo,
        warehouse: item.warehouse,
        qualityStatusText: qualityText,
        statusText: qualityText,
        statusColor: getQualityColor(item.qualityStatus),
        rawData: item,
      };
    });
  },

  /**
   * 处理异常搜索结果
   * @param {Array} exceptions - 异常记录列表
   * @returns {Array} 格式化的结果列表
   */
  _processExceptionResults(exceptions) {
    return exceptions.map(item => ({
      id: `exception_${item.id}`,
      type: 'exception',
      typeText: '异常',
      orderNo: item.orderNo,
      styleNo: item.styleNo,
      statusText: '失败',
      statusColor: 'var(--color-error)',
      rawData: item,
    }));
  },

  onGlobalSearchInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({ 'globalSearch.keyword': value });
  },

  /**
   * 执行搜索请求
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>} 返回 [订单结果, 入库结果, 异常结果]
   */
  async _executeSearchRequests(keyword) {
    return Promise.all([
      api.production.listOrders({
        page: 1,
        pageSize: 50,
        orderNo: keyword,
        styleNo: keyword,
        factoryName: keyword,
      }).catch(() => ({ records: [] })),

      api.production.listWarehousing({
        page: 1,
        pageSize: 50,
        orderNo: keyword,
        styleNo: keyword,
        warehouse: keyword,
      }).catch(() => ({ records: [] })),

      api.production.listScans({
        page: 1,
        pageSize: 50,
        orderNo: keyword,
        styleNo: keyword,
        scanType: 'orchestration',
        scanResult: 'failure',
      }).catch(() => ({ records: [] })),
    ]);
  },

  /**
   * 执行全局搜索
   * @returns {Promise<void>} 无返回值
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
      const [ordersRes, warehousingRes, exceptionsRes] = await this._executeSearchRequests(keyword);

      const results = [
        ...this._processOrderResults(ordersRes.records || []),
        ...this._processWarehousingResults(warehousingRes.records || []),
        ...this._processExceptionResults(exceptionsRes.records || []),
      ];

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
      this.setData({ 'globalSearch.loading': false });
      wx.hideLoading();
      toast.error('搜索失败，请重试');
    }
  },

  clearGlobalSearch() {
    this.setData({
      'globalSearch.keyword': '',
      'globalSearch.hasSearched': false,
      'globalSearch.results': [],
    });
  },

  closeGlobalSearch() {
    this.setData({
      'globalSearch.hasSearched': false,
      'globalSearch.results': [],
    });
  },

  onResultItemTap(e) {
    const item =
      (e && e.detail && e.detail.item) ||
      (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.item);
    if (!item) {
      return;
    }

    // 根据类型跳转到对应Tab
    if (item.type === 'order') {
      const status = item.rawData.status;
      const targetTab = status === 'production' ? 'orders_production' : 'orders_all';
      try {
        wx.setStorageSync('work_active_tab', targetTab);
      } catch (e) {
        // 存储失败静默处理
      }
      wx.switchTab({ url: '/pages/work/index' });
    } else if (item.type === 'warehousing') {
      try {
        wx.setStorageSync('work_active_tab', 'warehousing');
      } catch (e) {
        // 存储失败静默处理
      }
      wx.switchTab({ url: '/pages/work/index' });
    } else if (item.type === 'exception') {
      try {
        wx.setStorageSync('work_active_tab', 'exceptions');
      } catch (e) {
        // 存储失败静默处理
      }
      wx.switchTab({ url: '/pages/work/index' });
    }
  },
});
