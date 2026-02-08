import api from '../../utils/api';
import * as reminderManager from '../../utils/reminderManager';
import {
  orderStatusText,
  qualityStatusText,
  getStatusColor,
  getQualityColor,
} from '../../utils/orderStatusHelper';
import { normalizeStats, normalizeActivities } from '../../utils/dataTransform';

Page({
  data: {
    loading: false,
    statsLoaded: false,
    keyword: '',
    showReminderPanel: false,
    reminderCount: 0,
    reminders: [],
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
      pendingReconciliationCount: 0,
      paymentApprovalCount: 0,
      todayScanCount: 0,
      warehousingOrderCount: 0,
      warehousingToday: 0,
      unqualifiedQuantity: 0,
      defectCount: 0,
      materialPurchase: 0,
      urgentEventCount: 0,
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
        null;
      }
    }
    wx.switchTab({ url: '/pages/work/index' });
  },

  goScan() {
    wx.switchTab({ url: '/pages/scan/index' });
  },

  goAdmin() {
    wx.switchTab({ url: '/pages/admin/index' });
  },

  async loadStats() {
    if (this.data.loading) {
      return;
    }
    this.setData({ loading: true });
    try {
      const params = this.buildDashboardParams();
      const resp = await api.dashboard.get(params);

      // 兼容处理：有些API返回直接是数据对象，有些包裹在data属性中
      // 根据日志观察，api.dashboard.get 返回的 resp 直接包含了 count 字段 (如 productionOrderCount)
      // 因此优先使用 resp 本身，如果 resp.data 存在且也是对象才考虑使用它
      const payload = (resp && resp.data) || resp;

      const stats = normalizeStats(payload);
      const activities = normalizeActivities(payload);
      this.setData({ stats, statsLoaded: true, activities });
    } catch (e) {
      console.error('Dashboard error:', e);
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

    this.setData({
      reminders,
      reminderCount: reminders.length,
    });
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
        wx.setStorageSync('mp_scan_type_index', 2); // 采购是第3个选项，索引为2
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/scan/index' });
    } else if (type === '裁剪' || type === '缝制' || type === '质检') {
      // 生产任务跳转到工作台的生产中标签页
      try {
        wx.setStorageSync('work_active_tab', 'orders_production');
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/work/index' });
    } else {
      // 其他任务默认跳转到扫码页面
      try {
        wx.setStorageSync('pending_order_hint', orderNo);
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/scan/index' });
    }
  },

  // ============ 全局搜索功能 ============

  onGlobalSearchInput(e) {
    const value = e && e.detail ? e.detail.value : '';
    this.setData({ 'globalSearch.keyword': value });
  },

  async doGlobalSearch() {
    const keyword = String(this.data.globalSearch.keyword || '').trim();
    if (!keyword) {
      toast.error('请输入搜索关键词');
      return;
    }

    this.setData({ 'globalSearch.loading': true });
    wx.showLoading({ title: '搜索中...', mask: true });

    try {
      // 并行搜索所有模块
      const [ordersRes, warehousingRes, exceptionsRes] = await Promise.all([
        // 搜索订单（生产+订单）
        api.production
          .listOrders({
            page: 1,
            pageSize: 50,
            orderNo: keyword,
            styleNo: keyword,
            factoryName: keyword,
          })
          .catch(() => ({ records: [] })),

        // 搜索入库
        api.production
          .listWarehousing({
            page: 1,
            pageSize: 50,
            orderNo: keyword,
            styleNo: keyword,
            warehouse: keyword,
          })
          .catch(() => ({ records: [] })),

        // 搜索异常（过滤掉采购记录，保持与其他页面一致）
        api.production
          .listScans({
            page: 1,
            pageSize: 50,
            orderNo: keyword,
            styleNo: keyword,
            scanType: 'orchestration',
            scanResult: 'failure',
          })
          .catch(() => ({ records: [] })),
      ]);

      const results = [];

      // 处理订单数据
      const orders = ordersRes.records || [];
      orders.forEach(item => {
        const statusText = orderStatusText(item.status);
        results.push({
          id: `order_${item.id}`,
          type: 'order',
          typeText: item.status === 'production' ? '生产' : '订单',
          orderNo: item.orderNo,
          styleNo: item.styleNo,
          factoryName: item.factoryName,
          statusText,
          statusColor: getStatusColor(item.status),
          rawData: item,
        });
      });

      // 处理入库数据
      const warehousing = warehousingRes.records || [];
      warehousing.forEach(item => {
        const qualityText = qualityStatusText(item.qualityStatus);
        results.push({
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
        });
      });

      // 处理异常数据
      const exceptions = exceptionsRes.records || [];
      exceptions.forEach(item => {
        results.push({
          id: `exception_${item.id}`,
          type: 'exception',
          typeText: '异常',
          orderNo: item.orderNo,
          styleNo: item.styleNo,
          statusText: '失败',
          statusColor: 'var(--color-error)',
          rawData: item,
        });
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
      console.error('全局搜索失败:', error);
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
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/work/index' });
    } else if (item.type === 'warehousing') {
      try {
        wx.setStorageSync('work_active_tab', 'warehousing');
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/work/index' });
    } else if (item.type === 'exception') {
      try {
        wx.setStorageSync('work_active_tab', 'exceptions');
      } catch (e) {
        console.error('存储失败', e);
      }
      wx.switchTab({ url: '/pages/work/index' });
    }
  },

  // 以下方法已移至 utils/orderStatusHelper.js
  // - orderStatusText
  // - qualityStatusText
  // - getStatusColor
  // - getQualityColor
});
