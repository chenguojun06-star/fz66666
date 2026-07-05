const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { eventBus, Events } = require('../../../utils/eventBus');
const permission = require('../../../utils/permission');

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
    roleHint: '', // 跨岗位提示（空=本岗位或主管，无提示）
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    // 职务提示：非采购员且非主管以上，显示跨岗位提示
    if (!permission.canReceiveTask('procurement')) {
      this.setData({ roleHint: `您当前职务「${permission.getRoleDisplayName()}」非采购岗，如需代领请知会主管` });
    }
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
    if (!group) return;
    // P1-2 修复：样衣采购无 orderNo，按 patternProductionId 跳转
    if (!group.orderNo && group.patternProductionId) {
      safeNavigate({
        url: `/pages/procurement/task-detail/index?patternProductionId=${encodeURIComponent(group.patternProductionId)}&sourceType=sample&styleNo=${encodeURIComponent(group.styleNo || '')}`,
      }).catch(() => {});
      return;
    }
    if (!group.orderNo) return;
    safeNavigate({
      url: `/pages/procurement/task-detail/index?orderNo=${encodeURIComponent(group.orderNo)}&styleNo=${encodeURIComponent(group.styleNo || '')}`,
    }).catch(() => {});
  },

  onCoverPreview(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    try {
      wx.previewImage({ current: url, urls: [url] });
    } catch (err) { /* ignore */ }
  },

  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  _groupByOrder(list) {
    const map = {};
    list.forEach(item => {
      // P1-2 修复：样衣采购无 orderNo，按 patternProductionId 分组
      const orderNo = item.orderNo || '';
      const patternProductionId = item.patternProductionId || '';
      const sourceType = item.sourceType || '';
      const groupKey = orderNo || (patternProductionId ? `sample_${patternProductionId}` : '未知订单');
      if (!map[groupKey]) {
        map[groupKey] = {
          orderNo,
          styleNo: item.styleNo || '',
          patternProductionId,
          sourceType,
          items: [],
          totalPurchased: 0,
          totalArrived: 0,
          pendingCount: 0,
          receivedCount: 0,
          completedCount: 0,
          totalCount: 0,
        };
      }
      const g = map[groupKey];
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
      // P1-2 修复：样衣采购分组显示"样衣采购"前缀，区分大货订单
      statusText: g.completedCount === g.totalCount ? '已完成' : (g.pendingCount === g.totalCount ? '待采购' : '采购中'),
      statusColor: g.completedCount === g.totalCount ? 'success' : (g.pendingCount === g.totalCount ? 'warning' : 'processing'),
      isSample: g.sourceType === 'sample' || (!g.orderNo && !!g.patternProductionId),
    }));
  },
});
