const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { eventBus, Events } = require('../../../utils/eventBus');

const STATUS_TABS = [
  { key: '', label: '全部' },
  { key: 'pending', label: '待采购' },
  { key: 'received', label: '采购中' },
  { key: 'completed', label: '已完成' },
];

Page({
  data: {
    loading: false,
    activeFilter: '',
    statusTabs: STATUS_TABS,
    groups: [],
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    this.loadData();
  },

  onShow() {
    this._bindEvents();
  },

  onHide() { this._unbindEvents(); },
  onUnload() { this._unbindEvents(); },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  _bindEvents() {
    if (this._wsBound) return;
    this._wsBound = true;
    const that = this;
    this._onRefresh = () => that.loadData();
    eventBus.on(Events.REFRESH_ALL, this._onRefresh);
    eventBus.on(Events.DATA_CHANGED, this._onRefresh);
  },

  _unbindEvents() {
    if (!this._wsBound) return;
    this._wsBound = false;
    if (this._onRefresh) {
      eventBus.off(Events.REFRESH_ALL, this._onRefresh);
      eventBus.off(Events.DATA_CHANGED, this._onRefresh);
    }
  },

  async loadData() {
    this.setData({ loading: true });
    try {
      const res = await api.production.myProcurementTasks();
      const list = this._normalizeList(res);
      const groups = this._groupByOrder(list);
      this.setData({ groups, loading: false });
      this._applyFilter();
    } catch (e) {
      console.error('[ProcurementTaskList] loadData error', e);
      this.setData({ loading: false });
      toast.error('加载采购任务失败');
    }
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this._applyFilter();
  },

  _applyFilter() {
    const { groups, activeFilter } = this.data;
    let filtered;
    if (!activeFilter) {
      filtered = groups;
    } else {
      filtered = groups.filter(g => {
        if (activeFilter === 'pending') return g.pendingCount > 0;
        if (activeFilter === 'received') return g.receivedCount > 0;
        if (activeFilter === 'completed') return g.completedCount === g.totalCount && g.totalCount > 0;
        return true;
      });
    }
    // 更新筛选 tab 计数
    const statusTabs = STATUS_TABS.map(tab => {
      let count = 0;
      if (tab.key === '') count = groups.length;
      else if (tab.key === 'pending') count = groups.filter(g => g.pendingCount > 0).length;
      else if (tab.key === 'received') count = groups.filter(g => g.receivedCount > 0).length;
      else if (tab.key === 'completed') count = groups.filter(g => g.completedCount === g.totalCount && g.totalCount > 0).length;
      return { ...tab, count };
    });
    this.setData({ filteredGroups: filtered, statusTabs });
  },

  onGroupTap(e) {
    const group = e.currentTarget.dataset.group;
    if (!group || !group.orderNo) return;
    safeNavigate({
      url: `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(group.orderNo)}&styleNo=${encodeURIComponent(group.styleNo || '')}`,
    }).catch(() => {});
  },

  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  _groupByOrder(list) {
    const map = {};
    list.forEach(item => {
      const orderNo = item.orderNo || '未知订单';
      if (!map[orderNo]) {
        map[orderNo] = {
          orderNo,
          styleNo: item.styleNo || '',
          items: [],
          totalPurchased: 0,
          totalArrived: 0,
          pendingCount: 0,
          receivedCount: 0,
          completedCount: 0,
          totalCount: 0,
        };
      }
      const g = map[orderNo];
      g.items.push(item);
      const purchaseQty = Number(item.purchaseQuantity || 0);
      const arrivedQty = Number(item.arrivedQuantity || 0);
      g.totalPurchased += purchaseQty;
      g.totalArrived += arrivedQty;
      g.totalCount++;

      const status = String(item.status || '').toLowerCase();
      if (status === 'completed' || status === 'procurement_completed') {
        g.completedCount++;
      } else if (status === 'received' || status === 'partial' || status === 'procurement_in_progress') {
        g.receivedCount++;
      } else {
        g.pendingCount++;
      }
    });

    return Object.values(map).map(g => ({
      ...g,
      arrivalRate: g.totalPurchased > 0 ? Math.round(g.totalArrived / g.totalPurchased * 100) : 0,
      statusText: g.completedCount === g.totalCount ? '已完成' : (g.pendingCount === g.totalCount ? '待采购' : '采购中'),
      statusColor: g.completedCount === g.totalCount ? 'green' : (g.pendingCount === g.totalCount ? 'orange' : 'blue'),
    }));
  },
});
