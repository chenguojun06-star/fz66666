/**
 * 物料中心（D-514）
 *
 * 用户反馈：物料出入库/领料/料卷做成 5 个独立 APP 图标、搜索框/状态标签各做各的，
 * 在手机上又乱又不好用。本页统一为 1 个入口 + 5 个 tab 切换：
 *
 *   - 库存   列表（带扫码按钮）
 *   - 入库   列表 + 跳转入库
 *   - 出库   列表 + 跳转出库
 *   - 领料   待办 + 跳转领料
 *   - 料卷   扫码入口
 *
 * 设计要点：
 *   - 顶部复用通用组件 sticky-search-bar（搜索 + 扫码 + 筛选器 slot），
 *     与 material-database / defect / sales/order-list 等页面保持一致，不重复造轮子
 *   - tab 切换沿用项目 tab-bar / tab-item / active 约定（与 order/create 一致）
 *   - 库存 tab 走 inline（用户最常用），其余 tab 走「跳转卡片」，
 *     避免一次性把所有表单塞进一个页面造成首屏卡顿
 */
const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

const TABS = [
  { key: 'inventory', label: '库存' },
  { key: 'inbound', label: '入库' },
  { key: 'outbound', label: '出库' },
  { key: 'picking', label: '领料' },
  { key: 'scan', label: '料卷' },
];

const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '面料', value: '面料' },
  { label: '里料', value: '里料' },
  { label: '辅料', value: '辅料' },
];

const TYPE_COLOR_MAP = {
  面料: '#2563eb',
  里料: '#f59e0b',
  辅料: '#10b981',
};

const TYPE_LABEL_MAP = {
  面料: '面料',
  里料: '里料',
  辅料: '辅料',
};

function resolveTypeLabel(rawType) {
  if (!rawType) return '-';
  if (TYPE_LABEL_MAP[rawType]) return TYPE_LABEL_MAP[rawType];
  const t = String(rawType).toLowerCase();
  if (t.startsWith('fabric')) return '面料';
  if (t.startsWith('lining')) return '里料';
  if (t.startsWith('accessory')) return '辅料';
  return rawType;
}

function resolveTypeColor(rawType) {
  if (!rawType) return '#6b7280';
  if (TYPE_COLOR_MAP[rawType]) return TYPE_COLOR_MAP[rawType];
  const t = String(rawType).toLowerCase();
  if (t.startsWith('fabric')) return '#2563eb';
  if (t.startsWith('lining')) return '#f59e0b';
  if (t.startsWith('accessory')) return '#10b981';
  return '#6b7280';
}

Page({
  data: {
    tabs: TABS,
    activeTab: 'inventory',
    keyword: '',
    typeValue: '',
    typeIndex: 0,
    typeOptions: TYPE_OPTIONS,

    // 库存 tab 数据
    loading: true,
    inventoryList: [],
    inventoryTotal: 0,

    // 入库/出库/领料 tab - 简化：显示一张跳转卡片，避免在 5-tab 单页里塞所有表单
  },

  onLoad: function (options) {
    // 支持 ?tab=xxx 直接进入指定 tab（深链/扫码结果都用）
    if (options && options.tab && TABS.some(function (t) { return t.key === options.tab; })) {
      this.setData({ activeTab: options.tab });
    }
    this.loadInventory(true);
  },

  onPullDownRefresh: function () {
    var self = this;
    this.loadInventory(true).then(function () { wx.stopPullDownRefresh(); });
  },

  onShow: function () {
    // 从子页返回时刷新数据
    if (this.data.activeTab === 'inventory') {
      this.loadInventory(true);
    }
  },

  // ====== Tab 切换 ======
  onTabTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    this.setData({ activeTab: key });
    if (key === 'inventory') {
      this.loadInventory(true);
    }
  },

  // ====== 共享 header：搜索 ======
  onSearchInput: function (e) {
    this.setData({ keyword: e.detail.value || '' });
  },

  onSearchConfirm: function () {
    this.loadInventory(true);
  },

  onClearSearch: function () {
    this.setData({ keyword: '' });
    this.loadInventory(true);
  },

  onTypeChange: function (e) {
    var idx = e.detail.value || 0;
    this.setData({ typeIndex: idx, typeValue: TYPE_OPTIONS[idx].value });
    this.loadInventory(true);
  },

  // ====== 扫码（sticky-search-bar 的 bind:scan 触发，直接调起物料扫码页）======
  onScan: function () {
    wx.navigateTo({ url: '/pages/warehouse/material/scan/index' });
  },

  // ====== 库存 tab 数据加载 ======
  loadInventory: async function (reset) {
    if (reset) {
      this.setData({ loading: true });
    }
    try {
      var params = {
        keyword: this.data.keyword || undefined,
        materialType: this.data.typeValue || undefined,
        pageNum: 1,
        pageSize: 30,
      };
      var res = await api.material.listStock(params);
      // D-514 修 bug：ok() 已剥掉 resp.data，这里 res 就是 data
      var records = (res && res.records) || [];
      var list = records.map(function (r) {
        var qty = Number(r.quantity || 0);
        var locked = Number(r.lockedQuantity || 0);
        var safety = Number(r.safetyStock || 0);
        return {
          id: r.id,
          materialCode: r.materialCode || '',
          materialName: r.materialName || r.materialCode || '',
          typeLabel: resolveTypeLabel(r.materialType),
          typeColor: resolveTypeColor(r.materialType),
          unit: r.unit || '',
          warehouseLocation: r.location || r.warehouseLocation || '-',
          availableQty: Math.max(0, qty - locked),
          lockedQty: locked,
          safetyStock: safety,
          lowStock: qty < safety,
          isZero: qty === 0,
          image: r.materialImage ? getAuthedImageUrl(r.materialImage) : '',
        };
      });
      this.setData({
        inventoryList: list,
        inventoryTotal: (res && res.total) || list.length,
        loading: false,
      });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // ====== 库存卡片：入库/出库快捷操作 ======
  onInventoryInbound: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-inbound/index?materialCode=' + encodeURIComponent(code),
    });
  },

  onInventoryOutbound: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-outbound/index?materialCode=' + encodeURIComponent(code),
    });
  },

  onInventoryDetail: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/warehouse/material-outbound/index?materialCode=' + encodeURIComponent(code),
    });
  },

  // ====== 非库存 tab：跳转到对应子页 ======
  gotoInbound: function () {
    wx.navigateTo({ url: '/pages/warehouse/material-inbound/index' });
  },

  gotoOutbound: function () {
    wx.navigateTo({ url: '/pages/warehouse/material-outbound/index' });
  },

  gotoPicking: function () {
    wx.navigateTo({ url: '/pages/warehouse/material-picking/index' });
  },

  gotoScan: function () {
    wx.navigateTo({ url: '/pages/warehouse/material/scan/index' });
  },
});