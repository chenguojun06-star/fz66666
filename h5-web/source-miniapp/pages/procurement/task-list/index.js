const api = require('../../../utils/api');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { eventBus, Events, triggerDataRefresh } = require('../../../utils/eventBus');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');

/**
 * 筛选 Tab 定义（与设计稿一致）
 * 全部 / 待采购 / 采购中 / 已到货 / 已延期
 */
const STATUS_TABS = [
  { key: '', label: '全部', tabClass: 'tab-all' },
  { key: 'pending', label: '待采购', tabClass: 'tab-pending' },
  { key: 'procuring', label: '采购中', tabClass: 'tab-procuring' },
  { key: 'arrived', label: '已到货', tabClass: 'tab-arrived' },
  { key: 'delayed', label: '已延期', tabClass: 'tab-delayed' },
];

/**
 * 状态标签配置（与详情页 _getStatusText/_getStatusColor 对齐）
 * 与 design-tokens.wxss 的 tag-* 颜色类对应
 */
const STATUS_CONFIG = {
  pending: { label: '待采购', tagClass: 'tag-gray' },
  waiting_procurement: { label: '待采购', tagClass: 'tag-gray' },
  procuring: { label: '采购中', tagClass: 'tag-blue' },
  procurement_in_progress: { label: '采购中', tagClass: 'tag-blue' },
  received: { label: '已领取', tagClass: 'tag-blue' },
  partial: { label: '部分到货', tagClass: 'tag-blue' },
  partial_arrival: { label: '部分到货', tagClass: 'tag-blue' },
  awaiting_confirm: { label: '待确认完成', tagClass: 'tag-gold' },
  arrived: { label: '已到货', tagClass: 'tag-green' },
  completed: { label: '全部到货', tagClass: 'tag-green' },
  procurement_completed: { label: '已完成', tagClass: 'tag-green' },
  warehouse_pending: { label: '待仓库出库', tagClass: 'tag-cyan' },
  delayed: { label: '已延期', tagClass: 'tag-red' },
  cancelled: { label: '已取消', tagClass: 'tag-gray' },
};

Page({
  data: {
    loading: false,
    activeFilter: '',
    keyword: '',
    statusTabs: STATUS_TABS,
    items: [],
    filteredItems: [],
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
      const rawList = this._normalizeList(res);
      const items = rawList.map(item => this._normalizeItem(item));
      this.setData({ items, loading: false });
      this._applyFilter();
    } catch (err) {
      console.error('[ProcurementTaskList] loadData error', err);
      this.setData({ loading: false });
      toast.error('加载采购任务失败');
    }
  },

  onFilterTap(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeFilter: key });
    this._applyFilter();
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this._applyFilter();
  },

  _applyFilter() {
    const { items, activeFilter, keyword } = this.data;
    let filtered = items;

    if (activeFilter) {
      filtered = filtered.filter(item => item.displayStatus === activeFilter);
    }

    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      filtered = filtered.filter(item =>
        (item.materialName && item.materialName.toLowerCase().includes(kw)) ||
        (item.orderNo && item.orderNo.toLowerCase().includes(kw)) ||
        (item.materialCode && item.materialCode.toLowerCase().includes(kw))
      );
    }

    const statusTabs = STATUS_TABS.map(tab => {
      let count = 0;
      if (!tab.key) {
        count = items.length;
      } else {
        count = items.filter(item => item.displayStatus === tab.key).length;
      }
      return { ...tab, count };
    });

    this.setData({ filteredItems: filtered, statusTabs });
  },

  onViewDetail(e) {
    const { orderNo, styleNo } = e.currentTarget.dataset;
    if (!orderNo) return;
    safeNavigate({
      url: '/pages/procurement/task-detail/index?orderNo=' +
        encodeURIComponent(orderNo) + '&styleNo=' +
        encodeURIComponent(styleNo || ''),
    }).catch(() => {});
  },

  async onClaimPurchase(e) {
    const { id } = e.currentTarget.dataset;
    if (!id) return;

    const userInfo = getUserInfo() || {};
    const receiverId = String(userInfo.id || userInfo.userId || '').trim();
    const receiverName = String(userInfo.name || userInfo.username || '').trim();

    if (!receiverId && !receiverName) {
      toast.error('采购人信息缺失，请重新登录');
      return;
    }

    wx.showLoading({ title: '领取中...', mask: true });
    try {
      await api.production.receivePurchase({
        purchaseId: id,
        receiverId,
        receiverName,
      });
      wx.hideLoading();
      toast.success('领取成功');
      triggerDataRefresh('procurement');
      this.loadData();
    } catch (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '领取失败');
    }
  },

  _normalizeList(res) {
    if (Array.isArray(res)) return res;
    if (res && Array.isArray(res.records)) return res.records;
    return [];
  },

  /**
   * 将后端物料采购记录规范化为前端展示对象
   * 设计稿：物料级别卡片，每条记录一张卡片
   */
  _normalizeItem(item) {
    const rawStatus = String(item.status || '').trim().toLowerCase();
    const displayStatus = this._computeDisplayStatus(item);
    const statusConfig = STATUS_CONFIG[rawStatus] || STATUS_CONFIG[displayStatus] || STATUS_CONFIG.pending;

    const styleCoverUrl = getAuthedImageUrl(item.styleCover || '');

    const expectedDateText = this._formatDate(item.expectedArrivalDate);
    const actualDateText = this._formatDate(item.actualArrivalDate);

    const isArrived = displayStatus === 'arrived';

    return {
      ...item,
      id: item.id || item.purchaseId || '',
      displayStatus,
      statusLabel: statusConfig.label,
      statusTagClass: statusConfig.tagClass,
      styleCoverUrl,
      expectedDateText,
      actualDateText,
      dateLabel: isArrived ? '到货日期' : '预计到货',
      dateText: isArrived ? actualDateText : expectedDateText,
      isPending: displayStatus === 'pending',
      quantityText: this._formatQuantity(item.purchaseQuantity, item.unit),
      supplierText: item.supplierName || '-',
      buyerText: item.receiverName || '-',
    };
  },

  /**
   * 计算展示状态（设计稿五态）
   * 优先级：已到货 > 已取消 > 已延期 > 待采购 > 采购中
   */
  _computeDisplayStatus(item) {
    const rawStatus = String(item.status || '').trim().toLowerCase();

    if (rawStatus === 'completed' || rawStatus === 'procurement_completed') {
      return 'arrived';
    }

    if (rawStatus === 'cancelled') {
      return 'cancelled';
    }

    if (this._isOverdue(item.expectedArrivalDate)) {
      return 'delayed';
    }

    if (!rawStatus || rawStatus === 'pending' || rawStatus === 'waiting_procurement') {
      return 'pending';
    }

    return 'procuring';
  },

  _isOverdue(expectedArrivalDate) {
    if (!expectedArrivalDate) return false;
    const dateStr = String(expectedArrivalDate).substring(0, 10);
    if (!dateStr || dateStr.length < 10) return false;
    const expected = new Date(dateStr + 'T00:00:00');
    if (isNaN(expected.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expected < today;
  },

  _formatDate(dateStr) {
    if (!dateStr) return '';
    return String(dateStr).substring(0, 10);
  },

  _formatQuantity(qty, unit) {
    const q = Number(qty || 0);
    const u = unit || '';
    return u ? q + u : String(q);
  },
});
