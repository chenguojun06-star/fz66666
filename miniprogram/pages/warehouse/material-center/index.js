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

// D-514 修 bug：类型值必须是英文代码（后端 material_type 存 fabric/lining/accessory），
// 与 PC 端 MaterialInventory/index.tsx 的选项完全对齐。原先用中文值会导致筛选必空。
const TYPE_OPTIONS = [
  { label: '全部类型', value: '' },
  { label: '面料', value: 'fabric' },
  { label: '里料', value: 'lining' },
  { label: '辅料', value: 'accessory' },
];

const TYPE_COLOR_MAP = {
  fabric: '#2563eb',
  lining: '#f59e0b',
  accessory: '#10b981',
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

    // D-514：入库/出库 tab 的预填物料编码
    // 从库存卡片点「入库/出库」时带过来，切 tab 后表单自动查询
    formCode: '',
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
    // 从子页返回 / 领料确认出库后库存已变 → 重新拉取
    if (this.data.activeTab === 'inventory' || this._inventoryDirty) {
      this._inventoryDirty = false;
      this.loadInventory(true);
    }
  },

  // ====== Tab 切换 ======
  onTabTap: function (e) {
    var key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeTab) return;
    // D-514：手动切 tab 时清掉卡片带过来的预填编码，避免表单残留上一次的物料
    this.setData({ activeTab: key, formCode: '' });
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
      // D-514 修 bug：参数名对齐后端 MaterialStockController.getPage + PC 端 useMaterialInventoryList
      //   - 分页是 page（不是 pageNum），ParamUtils.getPage 读 "page"
      //   - 后端没有 keyword 参数，搜索走 materialCode（like），PC 端亦如此
      var params = {
        page: 1,
        pageSize: 30,
      };
      if (this.data.keyword) params.materialCode = this.data.keyword;
      if (this.data.typeValue) params.materialType = this.data.typeValue;
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
          // D-514：详情页要按类型上色 / 显示仓库区域与供应商，这里一并带上
          materialType: r.materialType || '',
          typeLabel: resolveTypeLabel(r.materialType),
          typeColor: resolveTypeColor(r.materialType),
          unit: r.unit || '',
          warehouseLocation: r.location || r.warehouseLocation || '-',
          warehouseAreaName: r.warehouseAreaName || '',
          supplierName: r.supplierName || '',
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
      // 保留错误到控制台，便于开发者工具里定位（原先只弹 toast，排查不到原因）
      console.error('[material-center] 物料库存加载失败', e && (e.errMsg || e.message || e));
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
    }
  },

  // ====== 库存卡片：入库/出库快捷操作 ======
  // D-514：不再跳独立页，改为切到对应 tab 并把物料编码预填给内联表单
  onInventoryInbound: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    this.setData({ activeTab: 'inbound', formCode: code });
  },

  onInventoryOutbound: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code) return;
    this.setData({ activeTab: 'outbound', formCode: code });
  },

  // 点卡片主体 → 物料库存详情页（D-514 修正）
  // 原先我跳的是「物料资料」列表页 —— 那页自带搜索框，用户反馈
  // 「点卡片不是详情页，里面还有搜索框，乱七八糟」。对标成品库存
  // finished-inventory/detail：点卡片就该看这一个物料的详情。
  onInventoryDetail: function (e) {
    var item = e.currentTarget.dataset.item;
    if (!item || !item.materialCode) return;
    wx.navigateTo({ url: this._buildDetailUrl(item) });
  },

  /** 组装详情页入参（图片是已带 token 的完整 URL，一并带过去省一次请求） */
  _buildDetailUrl: function (item) {
    var params = [
      'materialCode=' + encodeURIComponent(item.materialCode || ''),
      'materialName=' + encodeURIComponent(item.materialName || ''),
      'materialType=' + encodeURIComponent(item.materialType || ''),
      'unit=' + encodeURIComponent(item.unit || ''),
      'safetyStock=' + encodeURIComponent(String(item.safetyStock || 0)),
      'warehouseAreaName=' + encodeURIComponent(item.warehouseAreaName || ''),
      'supplierName=' + encodeURIComponent(item.supplierName || ''),
      'image=' + encodeURIComponent(item.image || ''),
    ];
    return '/pages/warehouse/material-inventory/detail/index?' + params.join('&');
  },

  // ====== 内联表单提交成功（入库/出库共用）======
  onFormSuccess: function () {
    // 库存变了，回「库存」tab 并刷新
    var self = this;
    this.setData({ activeTab: 'inventory', formCode: '' });
    this.loadInventory(true);
  },

  // ====== 领料确认出库/取消成功 ======
  onPickingSuccess: function () {
    // 领料确认出库会扣库存 → 库存 tab 数据已过期，下次进入时重拉
    this._inventoryDirty = true;
  },

  // ====== 料卷 tab：扫码入口（扫码天然要调相机，保留跳转）======
  gotoScan: function () {
    wx.navigateTo({ url: '/pages/warehouse/material/scan/index' });
  },
});