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
var decodeParam = require('../../../../utils/urlParams').decodeParam;
var i18n = require('../../../../utils/i18n/index');

/**
 * 与 material-center / material-inventory / PC 端 MaterialInventory 保持同一套类型映射
 * ⚠️ key 是**后端契约**（material_type 存 fabric/lining/accessory），绝不能翻译；
 *    label 由 applyLanguage 按当前语言展开。
 */
var TYPE_META = {
  fabric: { labelKey: 'common.materialFabric', color: '#2D7FF9' },
  lining: { labelKey: 'common.materialLining', color: '#f59e0b' },
  accessory: { labelKey: 'common.materialAccessory', color: '#10b981' },
};

/** 流水类型：后端 type 是 IN / OUT 英文码（typeLabel 是后端写死的中文，前端不用） */
var TX_TYPE_KEYS = {
  IN: 'common.inbound',
  OUT: 'common.outbound',
};

Page({
  data: {
    materialCode: '',
    materialName: '',
    image: '',
    materialType: '',
    typeLabel: '',
    typeColor: '',
    // D-516：面料不显示「规格」—— 后端 size 字段对面料存的是服装码数（XS/S/M...），
    // 对棉布/里料无意义（与 D-514 入库表单口径一致：面料展示幅宽/克重/成分，不问码数）
    isFabric: false,

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

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    var opt = options || {};
    // ⚠️ 全部走 decodeParam —— 列表页传过来的是 encodeURIComponent 后的值，
    //    小程序不会自动解码。漏解码时编码会显示成 M%E6%A3%89… 并查不到物料。
    var code = decodeParam(opt.materialCode);
    if (!code) {
      this.setData({ loading: false, txLoading: false });
      wx.showToast({ title: i18n.t('mp.warehouse.materialInventoryDetail.missingCode', this._lang), icon: 'none' });
      return;
    }
    var type = decodeParam(opt.materialType);
    var meta = TYPE_META[type] || { labelKey: '', color: '' };
    this.setData({
      materialCode: code,
      materialName: decodeParam(opt.materialName),
      image: decodeParam(opt.image),
      materialType: type,
      isFabric: /^fabric/i.test(String(type || '')),
      unit: decodeParam(opt.unit),
      warehouseAreaName: decodeParam(opt.warehouseAreaName),
      supplierName: decodeParam(opt.supplierName),
      safetyStock: Number(opt.safetyStock) || 0,
      typeLabel: meta.labelKey ? i18n.t(meta.labelKey, this._lang) : '',
      typeColor: meta.color,
    });
    this.loadDetail();
    this.loadTransactions();
  },

  onShow: function () {
    // 从「我的 → 语言」切回时文案要跟着变，故每次显示都重刷
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 按当前语言刷新全部文案。
   *
   * ⚠️ json 里的 navigationBarTitleText 是**静态**的，不会跟着语言变 ——
   *    要让它跟着切，只能在这里调 wx.setNavigationBarTitle。
   */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.materialInventoryDetail.title', lang) });
    var meta = TYPE_META[this.data.materialType] || null;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        lowStock: i18n.t('common.lowStock', lang),
        inbound: i18n.t('common.inbound', lang),
        outbound: i18n.t('common.outbound', lang),
        available: i18n.t('common.available', lang),
        locked: i18n.t('common.locked', lang),
        safetyStock: i18n.t('common.safetyStock', lang),
        price: i18n.t('common.price', lang),
        basicInfo: i18n.t('common.basicInfo', lang),
        materialCode: i18n.t('common.materialCode', lang),
        unit: i18n.t('common.unit', lang),
        color: i18n.t('common.color', lang),
        spec: i18n.t('common.spec', lang),
        location: i18n.t('common.location', lang),
        warehouseArea: i18n.t('common.warehouseArea', lang),
        supplier: i18n.t('common.supplier', lang),
        transactions: i18n.t('mp.warehouse.materialInventoryDetail.transactions', lang),
        noTransactions: i18n.t('mp.warehouse.materialInventoryDetail.noTransactions', lang),
        txCount: i18n.tf('mp.warehouse.materialInventoryDetail.txCount', { count: (this.data.transactions || []).length }, lang),
      },
      // 类型标签也要跟着语言变（原先只在 onLoad 里算一次）
      typeLabel: meta ? i18n.t(meta.labelKey, lang) : this.data.typeLabel,
      transactions: this._decorateTransactions(this.data.transactions, lang),
    });
  },

  /** 流水里每条的「操作人：X / · 库位：Y」是带参文案 → 逐条生成 */
  _decorateTransactions: function (list, lang) {
    return (list || []).map(function (tx) {
      var decorated = Object.assign({}, tx);
      // 后端 typeLabel 是写死的中文（MaterialStockController），前端按 type 英文码自行派生
      decorated._typeLabel = TX_TYPE_KEYS[String(tx.type || '').toUpperCase()]
        ? i18n.t(TX_TYPE_KEYS[String(tx.type || '').toUpperCase()], lang)
        : (tx.type || '');
      decorated._operatorText = tx.operatorName
        ? i18n.tf('mp.warehouse.materialInventoryDetail.operatorText', { name: tx.operatorName }, lang)
        : '';
      decorated._locationText = tx.warehouseLocation
        ? i18n.tf('mp.warehouse.materialInventoryDetail.locationText', { loc: tx.warehouseLocation }, lang)
        : '';
      return decorated;
    });
  },

  /** 库存快照：数量 / 锁定 / 单价 / 库位 / 颜色 / 规格 / 单位 */
  loadDetail: async function () {
    try {
      var res = await api.material.scanQuery(this.data.materialCode);
      var info = res && res.data ? res.data : res;
      if (!info || info.found === false) {
        this.setData({ loading: false });
        wx.showToast({ title: i18n.t('mp.warehouse.materialInventoryDetail.materialNotFound', this._lang), icon: 'none' });
        return;
      }
      var qty = Number(info.quantity || 0);
      var locked = Number(info.lockedQuantity || 0);
      var safety = this.data.safetyStock || 0;
      var meta = TYPE_META[info.materialType] || { labelKey: '', color: '' };
      this.setData({
        materialName: info.materialName || this.data.materialName || this.data.materialCode,
        typeLabel: meta.labelKey ? i18n.t(meta.labelKey, this._lang) : this.data.typeLabel,
        typeColor: meta.color || this.data.typeColor,
        // 快照接口返回的类型更准（fabricA/B/C 等业务编码也按前缀识别）
        isFabric: /^fabric/i.test(String(info.materialType || this.data.materialType || '')),
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
      wx.showToast({ title: (e && e.errMsg) || i18n.t('common.loadFailed', this._lang), icon: 'none' });
    }
  },

  /** 出入库流水（合并入+出，后端已按时间倒序） */
  loadTransactions: async function () {
    try {
      var res = await api.material.getTransactions(this.data.materialCode);
      var list = Array.isArray(res) ? res : (res && (res.records || res.list)) || [];
      this.setData({
        transactions: this._decorateTransactions(list, this._lang),
        txLoading: false,
      });
      this.setData({
        't.txCount': i18n.tf('mp.warehouse.materialInventoryDetail.txCount', { count: list.length }, this._lang),
      });
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
