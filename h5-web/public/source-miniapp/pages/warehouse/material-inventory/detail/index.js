/**
 * 物料库存详情（D-514）
 *
 * 为什么有这一页：
 *   用户反馈「点物料卡片不是进详情页，而是跳到一个带搜索框的列表页」。
 *   对标成品库存 pages/warehouse/finished-inventory/detail —— 点卡片就该看这一个物料。
 *
 * 数据来源（各司其职）：
 *   ① GET /scan-query?materialCode   → 库存快照（数量/锁定/单价/库位/颜色/规格/单位）
 *   ② GET /transactions?materialCode → 出入库流水（合并入+出，时间倒序）
 *   列表页把 materialCode / 名称 / 单位 / 安全库存 / 图片 带过来，先渲染头部再补全。
 *
 * ⚠️ /transactions 对**工厂账号**后端直接返回空数组（属租户级仓库数据），不是 bug。
 * ⚠️ /scan-query 不返回 materialImage（图片由列表页富化），所以图片走 URL 参数传。
 */
var api = require('../../../../utils/api');

/** 与 material-center / material-inventory / PC 端 MaterialInventory 保持同一套类型映射 */
var TYPE_META = {
  fabric: { label: '面料', color: '#2D7FF9' },
  lining: { label: '里料', color: '#f59e0b' },
  accessory: { label: '辅料', color: '#10b981' },
};

Page({
  data: {
    materialCode: '',
    materialName: '',
    image: '',
    typeLabel: '',
    typeColor: '',

    loading: true,

    unit: '',
    color: '',
    size: '',
    location: '',
    warehouseAreaName: '',
    supplierName: '',
    unitPrice: '',
    safetyStock: 0,
    lockedQty: 0,
    availableQty: 0,
    lowStock: false,

    transactions: [],
    txLoading: true,
  },

  onLoad: function (options) {
    wx.setNavigationBarTitle({ title: '物料详情' });
    var code = (options && options.materialCode) || '';
    if (!code) {
      this.setData({ loading: false, txLoading: false });
      wx.showToast({ title: '缺少物料编码', icon: 'none' });
      return;
    }
    var type = (options && options.materialType) || '';
    var meta = TYPE_META[type] || { label: '', color: '' };
    this.setData({
      materialCode: code,
      materialName: decodeURIComponent((options && options.materialName) || ''),
      image: decodeURIComponent((options && options.image) || ''),
      unit: decodeURIComponent((options && options.unit) || ''),
      warehouseAreaName: decodeURIComponent((options && options.warehouseAreaName) || ''),
      supplierName: decodeURIComponent((options && options.supplierName) || ''),
      safetyStock: Number((options && options.safetyStock) || 0) || 0,
      typeLabel: meta.label,
      typeColor: meta.color,
    });
    this.loadDetail();
    this.loadTransactions();
  },

  /** 库存快照：数量 / 锁定 / 单价 / 库位 / 颜色 / 规格 / 单位 */
  loadDetail: async function () {
    try {
      var res = await api.material.scanQuery(this.data.materialCode);
      var info = res && res.data ? res.data : res;
      if (!info || info.found === false) {
        this.setData({ loading: false });
        wx.showToast({ title: '物料不存在', icon: 'none' });
        return;
      }
      var qty = Number(info.quantity || 0);
      var locked = Number(info.lockedQuantity || 0);
      var safety = this.data.safetyStock || 0;
      var meta = TYPE_META[info.materialType] || { label: '', color: '' };
      this.setData({
        materialName: info.materialName || this.data.materialName || this.data.materialCode,
        typeLabel: meta.label || this.data.typeLabel,
        typeColor: meta.color || this.data.typeColor,
        unit: info.unit || this.data.unit,
        color: info.color || '',
        size: info.size || '',
        location: info.location || '',
        unitPrice: info.unitPrice != null ? String(info.unitPrice) : '',
        availableQty: Math.max(0, qty - locked),
        lockedQty: locked,
        // 安全库存为 0 时不判低库存（与列表页口径一致）
        lowStock: safety > 0 && qty < safety,
        loading: false,
      });
    } catch (e) {
      console.error('[material-detail] 库存快照加载失败', e && (e.errMsg || e.message || e));
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.errMsg) || '加载失败', icon: 'none' });
    }
  },

  /** 出入库流水（合并入+出，后端已按时间倒序） */
  loadTransactions: async function () {
    try {
      var res = await api.material.getTransactions(this.data.materialCode);
      var list = Array.isArray(res) ? res : (res && (res.records || res.list)) || [];
      this.setData({ transactions: list, txLoading: false });
    } catch (e) {
      // 流水失败不影响主体信息展示，只在控制台留痕
      console.warn('[material-detail] 流水加载失败', e);
      this.setData({ txLoading: false });
    }
  },

  onGoInbound: function () {
    wx.navigateTo({
      url: '/pages/warehouse/material-inbound/index?materialCode=' + encodeURIComponent(this.data.materialCode),
    });
  },

  onGoOutbound: function () {
    wx.navigateTo({
      url: '/pages/warehouse/material-outbound/index?materialCode=' + encodeURIComponent(this.data.materialCode),
    });
  },
});
