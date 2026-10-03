const i18n = require('../../../utils/i18n/index');

const NS = 'mp.returnList.';

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { bindPageEvents, unbindPageEvents } = require('../../../utils/pageEventBinder');
const { hasFeaturePermission } = require('../../../utils/permission');
const displayHelper = require('../../../utils/displayHelper');

// 退货状态文案：RETURNED/APPROVED/REFUNDED 是退货业务专属状态，
// 不在 displayHelper.RETURN_STATUS_LABEL 中，本地兜底到 mp.returnList.* 命名空间。
// ⚠️ 兜底值存的是「语言包键名」，必须经 returnStatusLabel 翻译后再用——
//    此前直接把键名当文案返回，界面显示成 statusApproved / statusReturned（用户实测报告）。
const RETURN_STATUS_FALLBACK = {
  RETURNED: 'statusReturned',
  APPROVED: 'statusApproved',
  REFUNDED: 'statusRefunded',
};

function returnStatusLabel(status, lang) {
  const fallbackKey = RETURN_STATUS_FALLBACK[status];
  if (fallbackKey) return i18n.t(NS + fallbackKey, lang || i18n.getLanguage());
  var fromHelper = displayHelper.displayReturnStatusText(status);
  return fromHelper || status || '-';
}

/** 把「只带 labelKey 的选项」按当前语言展开成 wxml 需要的 {key, label}（同 finished-outbound 约定） */
function localizeTypeTabs(lang) {
  return [
    { key: 'purchase', label: i18n.t(NS + 'typePurchase', lang) },
    { key: 'sales', label: i18n.t(NS + 'typeSales', lang) },
  ];
}

/** 状态标签（key 用于计数取值），label 必须是译文 */
function buildStatusTabs(lang, sales) {
  const tab = (key, cls) => ({ key, label: returnStatusLabel(key, lang), cls });
  return [
    { key: 'all', label: i18n.t(NS + 'filterAll', lang), cls: 'all' },
    tab('PENDING', 'pending'),
    tab('APPROVED', 'approved'),
    sales ? tab('REFUNDED', 'refunded') : tab('RETURNED', 'returned'),
    tab('REJECTED', 'rejected'),
  ];
}

Page({
  data: {
    t: {},
    loading: false,
    activeType: 'purchase', // 'purchase' | 'sales'
    activeStatus: 'all',
    // 标签在 applyLanguage 里按当前语言展开（wxml 渲染 item.label）
    typeTabs: localizeTypeTabs(i18n.getLanguage()),
    statusTabs: buildStatusTabs(i18n.getLanguage(), false),
    statusTabsSales: buildStatusTabs(i18n.getLanguage(), true),
    statusCounts: {
      all: 0,
      PENDING: 0,
      APPROVED: 0,
      RETURNED: 0,
      REFUNDED: 0,
      REJECTED: 0,
    },
    list: [],
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  },

  /** 应用语言 */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    this._lang = lang;
    const t = (k) => i18n.t(NS + k, lang);
    this.setData({
      t: {
        emptyList: t('emptyList'),
        originalNoPrefix: t('originalNoPrefix'),
        partySupplier: t('partySupplier'),
        partyCustomer: t('partyCustomer'),
        typeLabel: t('typeLabel'),
        reasonLabel: t('reasonLabel'),
        loadingMore: t('loadingMore'),
        noMore: t('noMore'),
      },
      // 标签随语言刷新（原先只在模块加载时算一次 → 切语言不生效）
      typeTabs: localizeTypeTabs(lang),
      statusTabs: buildStatusTabs(lang, false),
      statusTabsSales: buildStatusTabs(lang, true),
    });
    wx.setNavigationBarTitle({ title: t('navTitle') });
  },

  onLoad() {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (!hasFeaturePermission('view_purchase_return') && !hasFeaturePermission('view_sales_return')) {
      toast(i18n.t(NS + 'noPermission', this._lang));
      wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/dashboard/index' }) });
      return;
    }
    this.loadData();
    bindPageEvents(this, () => this.loadData());
  },

  onUnload() {
    unbindPageEvents(this);
  },

  onShow() {
    // ⚠️ 本页原先有两个 onShow 定义，后一个覆盖前一个 → applyLanguage 从未执行
    //（t 恒为空对象、导航标题不设）。合并为一处。
    this.applyLanguage(i18n.getLanguage());
    if (this._needRefresh) {
      this._needRefresh = false;
      this.loadData();
    }
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  async loadData() {
    this.setData({ page: 1, loading: true });
    try {
      const { activeType, activeStatus, page, pageSize } = this.data;
      const params = { page, pageSize };
      if (activeStatus !== 'all') params.returnStatus = activeStatus;
      const fetcher = activeType === 'purchase' ? api.purchaseReturn.list : api.salesReturn.list;
      const res = await fetcher(params);
      const records = Array.isArray(res) ? res : (res && res.records) || [];
      const total = Array.isArray(res) ? records.length : (res && res.total) || 0;
      const updateData = {
        list: this._normalizeList(records, activeType),
        total,
        hasMore: page * pageSize < total,
        loading: false,
      };
      if (activeStatus === 'all') {
        updateData.statusCounts = this._computeCounts(records, total);
      }
      this.setData(updateData);
    } catch (e) {
      console.error('[ReturnList] loadData error', e);
      this.setData({ loading: false });
      toast.error(i18n.t(NS + 'loadFailed', this._lang));
    }
  },

  async loadMore() {
    const nextPage = this.data.page + 1;
    this.setData({ page: nextPage, loading: true });
    try {
      const { activeType, activeStatus, page, pageSize } = this.data;
      const params = { page, pageSize };
      if (activeStatus !== 'all') params.returnStatus = activeStatus;
      const fetcher = activeType === 'purchase' ? api.purchaseReturn.list : api.salesReturn.list;
      const res = await fetcher(params);
      const records = Array.isArray(res) ? res : (res && res.records) || [];
      const merged = this.data.list.concat(this._normalizeList(records, activeType));
      const total = Array.isArray(res) ? merged.length : (res && res.total) || 0;
      const updateData = { list: merged, total, hasMore: page * pageSize < total, loading: false };
      if (activeStatus === 'all') {
        const counts = { all: total, PENDING: 0, APPROVED: 0, RETURNED: 0, REFUNDED: 0, REJECTED: 0 };
        merged.forEach(r => {
          if (Object.prototype.hasOwnProperty.call(counts, r.returnStatus)) counts[r.returnStatus]++;
        });
        updateData.statusCounts = counts;
      }
      this.setData(updateData);
    } catch (e) {
      console.error('[ReturnList] loadMore error', e);
      this.setData({ loading: false });
    }
  },

  onTypeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeType) return;
    this.setData({ activeType: key, activeStatus: 'all' });
    this.loadData();
  },

  onStatusChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeStatus) return;
    this.setData({ activeStatus: key });
    this.loadData();
  },

  _computeCounts(records, total) {
    const counts = { all: total, PENDING: 0, APPROVED: 0, RETURNED: 0, REFUNDED: 0, REJECTED: 0 };
    records.forEach(r => {
      const status = String(r.returnStatus || '').trim();
      if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
    });
    return counts;
  },

  _normalizeList(records, type) {
    if (!Array.isArray(records)) return [];
    return records.map(r => {
      const status = String(r.returnStatus || '').trim();
      const statusLabel = this._statusLabel(status, type);
      const isPurchase = type === 'purchase';
      return {
        id: r.id,
        returnNo: r.returnNo || '-',
        originalNo: isPurchase ? (r.originalPurchaseNo || '-') : (r.originalOrderNo || '-'),
        partyName: isPurchase ? (r.supplierName || '-') : (r.customerName || '-'),
        reasonType: r.returnReason || '-',
        reasonDetail: r.remark || '',
        totalAmount: Number(r.totalAmount || 0).toFixed(2),
        returnStatus: status,
        statusLabel,
        statusColor: this._statusColor(status),
        createTime: r.createTime ? String(r.createTime).replace('T', ' ').slice(0, 16) : '-',
        _type: type,
      };
    });
  },

  _statusLabel(status, _type) {
    return returnStatusLabel(status);
  },

  _statusColor(status) {
    const map = {
      PENDING: 'warning',
      APPROVED: 'success',
      RETURNED: 'gray',
      REFUNDED: 'blue',
      REJECTED: 'danger',
    };
    return map[status] || 'gray';
  },

  goDetail(e) {
    const { id, type } = e.currentTarget.dataset;
    this._needRefresh = true;
    wx.navigateTo({
      url: `/pages/return/detail/index?id=${id}&type=${type}`,
    });
  },
});
