const api = require('../../../utils/api');
const { toast, safeNavigate, quickScan } = require('../../../utils/uiHelper');
const { eventBus, Events, triggerDataRefresh } = require('../../../utils/eventBus');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { getUserInfo } = require('../../../utils/storage');

/**
 * 筛选 Tab 定义（与 PC 端 MaterialSearchForm 状态筛选对齐）
 * 全部 / 待采购 / 已采购 / 部分到货 / 全部到货 / 已取消 / 已延期
 * pillClass 对应 dashboard 的 filter-pill--* 颜色类
 */
const STATUS_TABS = [
  { key: '', label: '全部', pillClass: '' },
  { key: 'pending', label: '待采购', pillClass: '' },
  { key: 'received', label: '已采购', pillClass: 'filter-pill--prod' },
  { key: 'partial', label: '部分到货', pillClass: 'filter-pill--prod' },
  { key: 'completed', label: '已完成', pillClass: 'filter-pill--done' },
  { key: 'cancelled', label: '已取消', pillClass: '' },
  { key: 'delayed', label: '已延期', pillClass: 'filter-pill--danger' },
];

/**
 * 状态标签配置（与详情页 _getStatusText/_getStatusColor 对齐）
 * 与 design-tokens.wxss 的 tag-* 颜色类对应
 * 注：completed 统一显示「已完成」（对齐用户需求）
 */
const STATUS_CONFIG = {
  pending: { label: '待采购', tagClass: 'tag-gray' },
  waiting_procurement: { label: '待采购', tagClass: 'tag-gray' },
  procuring: { label: '采购中', tagClass: 'tag-blue' },
  procurement_in_progress: { label: '采购中', tagClass: 'tag-blue' },
  purchasing: { label: '采购中', tagClass: 'tag-blue' },
  material_preparation: { label: '备料中', tagClass: 'tag-blue' },
  received: { label: '已采购', tagClass: 'tag-blue' },
  partial: { label: '部分到货', tagClass: 'tag-blue' },
  partial_arrival: { label: '部分到货', tagClass: 'tag-blue' },
  awaiting_confirm: { label: '待确认完成', tagClass: 'tag-gold' },
  warehouse_pending: { label: '待仓库出库', tagClass: 'tag-cyan' },
  completed: { label: '已完成', tagClass: 'tag-green' },
  procurement_completed: { label: '已完成', tagClass: 'tag-green' },
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

  /** 扫码按钮：调用通用 quickScan 跳到扫码页 */
  onScanTap() {
    quickScan();
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
   * 计算展示状态（与 PC 端 MaterialSearchForm 状态对齐：7 档）
   * 优先级：已取消 > 已完成 > 已延期 > 已采购 > 部分到货 > 待采购 > 采购中
   * 注：cancelled 优先级高于 delayed，因为取消是终态；延期是过程态
   */
  _computeDisplayStatus(item) {
    const rawStatus = String(item.status || '').trim().toLowerCase();

    if (rawStatus === 'cancelled') {
      return 'cancelled';
    }

    if (rawStatus === 'completed' || rawStatus === 'procurement_completed') {
      return 'completed';
    }

    // 部分到货（优先级高于延期，因为部分到货是事实，延期是时间）
    if (rawStatus === 'partial' || rawStatus === 'partial_arrival') {
      return 'partial';
    }

    // 已采购（received 状态：已领取但未到货或部分到货）
    if (rawStatus === 'received') {
      return 'received';
    }

    // 延期：未到货且已超期
    if (this._isOverdue(item.expectedArrivalDate)) {
      return 'delayed';
    }

    // 待采购：未领取
    if (!rawStatus || rawStatus === 'pending' || rawStatus === 'waiting_procurement') {
      return 'pending';
    }

    // 其余状态归为采购中（procurement / purchasing / material_preparation / awaiting_confirm / warehouse_pending）
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
