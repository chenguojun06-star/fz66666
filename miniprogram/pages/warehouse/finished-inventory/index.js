const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');
const i18n = require('../../../utils/i18n/index');

/**
 * 筛选项：**只放 value，label 在 applyLanguage 里按当前语言生成**。
 *
 * 早期这里是硬编码中文 label，导致切语言后筛选器还是中文。
 * 保留 `value`（后端契约，不能翻），`labelKey` 指向语言包。
 */
const STATUS_OPTIONS = [
  { labelKey: 'common.all', value: '' },
  { labelKey: 'mp.warehouse.finishedInventory.tagAvailable', value: 'available' },
  { labelKey: 'mp.warehouse.finishedInventory.tagDefect', value: 'defect' },
];

const FACTORY_TYPE_OPTIONS = [
  { labelKey: 'mp.warehouse.finishedInventory.allFactoryTypes', value: '' },
  { labelKey: 'mp.warehouse.finishedInventory.factoryOwn', value: 'OWN' },
  { labelKey: 'mp.warehouse.finishedInventory.factoryExternal', value: 'EXTERNAL' },
];

/** 把「只带 labelKey 的选项」按当前语言展开成 picker 需要的 {label, value} */
function localizeOptions(options, lang) {
  return options.map(function (o) {
    return { label: i18n.t(o.labelKey, lang), value: o.value };
  });
}

/**
 * D-513：把按 SKU 的记录（每条 = 一个 color/size 的库存行）聚合为按款（styleNo+orderNo）的卡片。
 *
 * 后端 `/warehouse/finished-inventory/list` 每条 records 是一个 SKU（不同 color/size 算多条）；
 * 用户截图 BV26Q2C1216A 显示 3 条一模一样 = 同一款 3 个不同 SKU 的库存行。
 * 改为按款聚合：一张卡片 = 一个款，卡片内列出该款的全部 SKU 明细。
 * 与 PC 端的 `flattenBySku.ts` 思路一致，但小程序端用纯 JS（不依赖 React）。
 */
function flattenByStyle(records) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const groupMap = new Map();
  records.forEach(function (item) {
    const key = (item.orderNo || '') + '||' + (item.styleNo || '');
    let group = groupMap.get(key);
    if (!group) {
      group = {
        groupKey: key,
        orderNo: item.orderNo || '',
        orderId: item.orderId || '',
        styleNo: item.styleNo || '',
        styleName: item.styleName || '',
        styleImage: item.styleImage || '',
        _styleImage: item._styleImage || (item.styleImage ? getAuthedImageUrl(item.styleImage) : ''),
        factoryName: item.factoryName || '',
        factoryType: item.factoryType || '',
        warehouseLocation: item.warehouseLocation || '',
        lastInboundDate: item.lastInboundDate || '',
        _lastInboundDate: '',
        // 聚合数量
        totalAvailableQty: 0,
        totalLockedQty: 0,
        totalDefectQty: 0,
        totalInboundQty: 0,
        // 款级标志（任一 SKU 有库存 / 有次品）
        hasAvailable: false,
        hasDefect: false,
        // 该款的所有 SKU 行
        skus: [],
      };
      groupMap.set(key, group);
    }
    const av = Number(item.availableQty) || 0;
    const lk = Number(item.lockedQty) || 0;
    const df = Number(item.defectQty) || 0;
    const ti = Number(item.totalInboundQty) || 0;
    group.totalAvailableQty += av;
    group.totalLockedQty += lk;
    group.totalDefectQty += df;
    group.totalInboundQty += ti;
    if (av > 0) group.hasAvailable = true;
    if (df > 0) group.hasDefect = true;
    // 兼容 WXML 字段：聚合时取该款所有 SKU 中最晚的入库日期
    const formattedDate = item.lastInboundDate ? String(item.lastInboundDate).replace('T', ' ').substring(0, 16) : '';
    if (formattedDate && (!group._lastInboundDate || formattedDate > group._lastInboundDate)) {
      group._lastInboundDate = formattedDate;
    }
    // SKU 标识：color + size（无则用 sku 编码）
    const skuLabel = [item.color, item.size].filter(Boolean).join(' / ') || item.sku || '';
    group.skus.push({
      id: item.id,
      sku: item.sku || '',
      color: item.color || '',
      size: item.size || '',
      skuLabel: skuLabel,
      availableQty: av,
      lockedQty: lk,
      defectQty: df,
      totalInboundQty: ti,
      lastInboundDate: item.lastInboundDate || '',
    });
  });
  const result = Array.from(groupMap.values());
  // 按最近入库时间倒序（最新入库在前面）
  result.sort(function (a, b) {
    return String(b.lastInboundDate || '').localeCompare(String(a.lastInboundDate || ''));
  });
  return result;
}

Page({
  data: {

    // D-533：可搜索选择器状态（原生 picker 没有搜索）

    pickerVisible: false,

    pickerTitle: '',

    pickerOptions: [],

    pickerValue: '',
    loading: true,
    list: [],
    total: 0,
    totalAvailableQty: 0,
    totalDefectQty: 0,

    page: 1,
    pageSize: 20,
    hasMore: true,

    searchText: '',
    statusValue: '',
    factoryTypeValue: '',
    // 初始就按当前语言展开，避免首屏筛选器闪一下空白（onShow 里还会再刷一次）
    statusOptions: localizeOptions(STATUS_OPTIONS, i18n.getLanguage()),
    factoryTypeOptions: localizeOptions(FACTORY_TYPE_OPTIONS, i18n.getLanguage()),
    statusIndex: 0,
    factoryTypeIndex: 0,

    selectedItem: null,
    detailVisible: false,
    skuList: [],

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  onLoad: function () {
    this.loadList(true);
  },

  onShow: function () {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
    this._bindEvents();
  },

  /**
   * 刷新本页全部文案。三处都要更新：
   *   ① t.*（wxml 静态文案）
   *   ② 筛选器选项 label（它们在 data 里，不是 wxml 字面量）
   *   ③ 列表项的带参文案（「最近入库：{date}」逐条不同，不能放在 t 里）
   */
  applyLanguage: function (language) {
    var lang = language || i18n.getLanguage();
    // 记住当前语言：loadList 里的 _decorateList 要用**同一个**语言，
    // 否则两处各自读一次 storage，中间被切语言就会不一致。
    this._lang = lang;
    // 导航栏标题：json 里的 navigationBarTitleText 只能写死，必须在这里覆盖才会跟着语言变
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.finishedInventory.title', lang) });
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        styleCount: i18n.t('mp.warehouse.finishedInventory.styleCount', lang),
        availableStockPcs: i18n.t('mp.warehouse.finishedInventory.availableStockPcs', lang),
        defectPcs: i18n.t('mp.warehouse.finishedInventory.defectPcs', lang),
        searchPlaceholder: i18n.t('mp.warehouse.finishedInventory.searchPlaceholder', lang),
        noData: i18n.t('mp.warehouse.finishedInventory.noData', lang),
        scanFirst: i18n.t('mp.warehouse.finishedInventory.scanFirst', lang),
        orderPrefix: i18n.t('mp.warehouse.finishedInventory.orderPrefix', lang),
        tagAvailable: i18n.t('mp.warehouse.finishedInventory.tagAvailable', lang),
        tagDefect: i18n.t('mp.warehouse.finishedInventory.tagDefect', lang),
        available: i18n.t('common.available', lang),
        locked: i18n.t('common.locked', lang),
        defective: i18n.t('common.defective', lang),
        totalInbound: i18n.t('common.totalInbound', lang),
        inbound: i18n.t('common.inbound', lang),
        outbound: i18n.t('common.outbound', lang),
        pullMore: i18n.t('mp.warehouse.finishedInventory.pullMore', lang),
        noMore: i18n.t('mp.warehouse.finishedInventory.noMore', lang),
      },
      statusOptions: localizeOptions(STATUS_OPTIONS, lang),
      factoryTypeOptions: localizeOptions(FACTORY_TYPE_OPTIONS, lang),
      list: this._decorateList(this.data.list, lang),
    });
  },

  /**
   * 给列表项补上带参文案（「最近入库：{date}」）。
   * 语言变了、列表变了都要重算 —— 放在 t 里做不到，因为每条日期不同。
   */
  _decorateList: function (list, lang) {
    var l = lang || this._lang || i18n.getLanguage();
    return (list || []).map(function (item) {
      return Object.assign({}, item, {
        _lastInboundText: i18n.tf('mp.warehouse.finishedInventory.lastInbound', {
          date: item._lastInboundDate || '--',
        }, l),
      });
    });
  },

  onHide: function () {
    this._unbindEvents();
  },

  onUnload: function () {
    this._unbindEvents();
  },

  _bindEvents: function () {
    this._onDataChanged = function (data) {
      if (data && (data.type === 'warehouse' || data.type === 'finishedInventory')) {
        this.loadList(true);
      }
    }.bind(this);
    this._onRefreshAll = function () {
      this.loadList(true);
    }.bind(this);
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindEvents: function () {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  onPullDownRefresh: function () {
    this.loadList(true).finally(function () { wx.stopPullDownRefresh(); });
  },

  onReachBottom: function () {
    if (this.data.hasMore && !this.data.loading) {
      this.loadList(false);
    }
  },

  onSearchInput: function (e) {
    this.setData({ searchText: e.detail.value });
  },

  onSearchConfirm: function () {
    this.loadList(true);
  },

  onStatusChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      statusIndex: idx,
      statusValue: STATUS_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  onFactoryTypeChange: function (e) {
    const idx = Number(e.detail.value);
    this.setData({
      factoryTypeIndex: idx,
      factoryTypeValue: FACTORY_TYPE_OPTIONS[idx].value,
    });
    this.loadList(true);
  },

  loadList: function (reset) {
    const that = this;
    const page = reset ? 1 : this.data.page;
    if (reset) {
      this.setData({ loading: true, list: [], page: 1, hasMore: true });
    }

    const params = {
      page: page,
      pageSize: this.data.pageSize,
      keyword: this.data.searchText || '',
      status: this.data.statusValue || '',
      factoryType: this.data.factoryTypeValue || '',
    };

    return api.warehouse.listFinishedInventory(params).then(function (res) {
      const records = (res.records || []).map(function (item) {
        return {
          ...item,
          _styleImage: item.styleImage ? getAuthedImageUrl(item.styleImage) : '',
          _hasAvailable: (item.availableQty || 0) > 0,
          _hasDefect: (item.defectQty || 0) > 0,
          _lastInboundDate: item.lastInboundDate ? String(item.lastInboundDate).replace('T', ' ').substring(0, 16) : '--',
        };
      });

      // D-513：按款聚合（一条 records = 一个 SKU，同款多 SKU 合并为一张卡片）
      const styles = flattenByStyle(records);

      // 本页增量汇总（用于统计卡片）
      const pageAvailableQty = records.reduce(function (sum, it) { return sum + (it.availableQty || 0); }, 0);
      const pageDefectQty = records.reduce(function (sum, it) { return sum + (it.defectQty || 0); }, 0);

      // D-513 修复：跨页**累积聚合**（同一款可能被分到多页 records，concat 会产生重复 groupKey → 触发 wx:key 警告且数量翻倍）
      // 用 Map 按 groupKey 累积：已存在的款聚合数量、未存在的款直接加入
      const accumMap = new Map();
      const oldList = reset ? [] : that.data.list;
      oldList.concat(styles).forEach(function (item) {
        const existing = accumMap.get(item.groupKey);
        if (existing) {
          existing.totalAvailableQty += item.totalAvailableQty;
          existing.totalLockedQty += item.totalLockedQty;
          existing.totalDefectQty += item.totalDefectQty;
          existing.totalInboundQty += item.totalInboundQty;
          if (item.hasAvailable) existing.hasAvailable = true;
          if (item.hasDefect) existing.hasDefect = true;
          if (item.lastInboundDate && (!existing.lastInboundDate || item.lastInboundDate > existing.lastInboundDate)) {
            existing.lastInboundDate = item.lastInboundDate;
          }
          if (item._lastInboundDate && (!existing._lastInboundDate || item._lastInboundDate > existing._lastInboundDate)) {
            existing._lastInboundDate = item._lastInboundDate;
          }
        } else {
          // 拷贝一份避免旧对象被复用修改
          accumMap.set(item.groupKey, Object.assign({}, item));
        }
      });
      const newList = Array.from(accumMap.values());
      const newAvailable = reset ? pageAvailableQty : that.data.totalAvailableQty + pageAvailableQty;
      const newDefect = reset ? pageDefectQty : that.data.totalDefectQty + pageDefectQty;

      that.setData({
        list: that._decorateList(newList),
        // 「款数」统计卡片 = 累积后的款数
        total: newList.length,
        totalAvailableQty: newAvailable,
        totalDefectQty: newDefect,
        page: page + 1,
        // 按 SKU 判断是否还有更多
        hasMore: records.length >= that.data.pageSize,
        loading: false,
      });
    }).catch(function (err) {
      console.warn('[finished-inventory] loadList failed:', err);
      that.setData({ loading: false });
      wx.showToast({ title: i18n.t('common.loadFailed'), icon: 'none' });
    });
  },

  /**
   * 构造详情页 URL
   * D-494：去掉原 autoOutbound 参数（出库已改为列表直接跳 finished-outbound，
   *        不再经详情页中转，该参数已无人使用）
   * @param {Object} item - 列表项
   * @returns {string} 详情页完整 URL
   */
  _buildDetailUrl: function (item) {
    const params = [
      'styleNo=' + encodeURIComponent(item.styleNo || ''),
      'orderNo=' + encodeURIComponent(item.orderNo || ''),
      'styleName=' + encodeURIComponent(item.styleName || ''),
      'styleImage=' + encodeURIComponent(item._styleImage || item.styleImage || ''),
      'factoryName=' + encodeURIComponent(item.factoryName || ''),
    ];
    return '/pages/warehouse/finished-inventory/detail/index?' + params.join('&');
  },

  onItemTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.groupKey === id; });
    if (!item) return;
    wx.navigateTo({ url: this._buildDetailUrl(item) });
  },

  /**
   * 列表直接出库（D-418）
   *
   * 背景：出库原只能「列表 → 详情 → SKU 行」三级进入，用户以为成品没有出库功能。
   * 做法：列表项直接给「出库」按钮，跳详情并带 autoOutbound=1，由详情页加载完 SKU 后
   *      自动弹出第一个有可用库存的 SKU 出库窗 —— 完全复用详情页既有出库逻辑，不新增接口，零风险。
   * 注意：用 catchtap 绑定，避免冒泡触发外层 onItemTap 造成跳转两次。
   *
   * @param {Object} e - 事件对象（dataset.id）
   */
  /**
   * D-494：列表直接跳**成品出库页**（不再经详情页中转）
   *
   * 原 D-418 方案：列表 --(autoOutbound=1)--> 详情 --> 详情页自动开**弹窗**。
   * 但 D-482 已把出库改成独立页面，若仍走详情中转就变成：
   *     列表 → 详情 → 出库页（返回栈多一层，按返回会先回到详情，很绕）
   * 故这里直接跳出库页：一步到位，返回即回列表。
   *
   * 注：详情页的 autoOutbound=1 兼容处理也已一并移除（D-494），目前无任何入口传该参数。
   */
  _buildOutboundUrl: function (item) {
    const params = [
      'styleNo=' + encodeURIComponent(item.styleNo || ''),
      'orderNo=' + encodeURIComponent(item.orderNo || ''),
      'styleName=' + encodeURIComponent(item.styleName || ''),
      'styleImage=' + encodeURIComponent(item._styleImage || item.styleImage || ''),
      'factoryName=' + encodeURIComponent(item.factoryName || ''),
    ];
    return '/pages/warehouse/finished-outbound/index?' + params.join('&');
  },

  onOutboundTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.groupKey === id; });
    if (!item) return;
    if (!item.hasAvailable) {
      wx.showToast({ title: i18n.t('mp.warehouse.finishedInventory.noAvailableStock'), icon: 'none' });
      return;
    }
    wx.navigateTo({ url: this._buildOutboundUrl(item) });
  },

  /**
   * D-496：列表直接入库（与出库对称）
   * 原先入库只能「列表 → 点进详情 → 入库」，比出库多一层；出库已改为列表直达后，
   * 这里同样直接跳 finished-inbound，返回即回列表。
   *
   * 注意：入库不限「有可用库存」—— 新到的款本来就没库存，也要能入库。
   */
  onInboundTap: function (e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(function (it) { return it.groupKey === id; });
    if (!item) return;
    wx.navigateTo({ url: this._buildInboundUrl(item) });
  },

  _buildInboundUrl: function (item) {
    const params = [
      'styleNo=' + encodeURIComponent(item.styleNo || ''),
      'orderNo=' + encodeURIComponent(item.orderNo || ''),
      'styleName=' + encodeURIComponent(item.styleName || ''),
      'styleImage=' + encodeURIComponent(item._styleImage || item.styleImage || ''),
      'factoryName=' + encodeURIComponent(item.factoryName || ''),
    ];
    return '/pages/warehouse/finished-inbound/index?' + params.join('&');
  },

  preventTouchMove: function () {},

  /* ── D-533：可搜索选择器（原生 picker 没有搜索，选项多时只能一路滚）────────
     由 scripts/codemod-search-picker.py 注入，各页面内容一致。
     选中后回调页面原有的 onXxxChange（e.detail.value 为下标），既有逻辑不变。 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t('common.pleaseSelect'),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
