const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { eventBus, Events } = require('../../../utils/eventBus');

const STATUS_OPTIONS = [
  { label: '全部', value: '' },
  { label: '有库存', value: 'available' },
  { label: '有次品', value: 'defect' },
];

const FACTORY_TYPE_OPTIONS = [
  { label: '全部工厂类型', value: '' },
  { label: '自有工厂', value: 'OWN' },
  { label: '外发工厂', value: 'EXTERNAL' },
];

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
    statusOptions: STATUS_OPTIONS,
    factoryTypeOptions: FACTORY_TYPE_OPTIONS,
    statusIndex: 0,
    factoryTypeIndex: 0,

    selectedItem: null,
    detailVisible: false,
    skuList: [],
  },

  onLoad: function () {
    this.loadList(true);
  },

  onShow: function () {
    this._bindEvents();
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

      // 总数量（按款汇总 = 按 SKU 汇总，金额相同）
      const totalAvailableQty = records.reduce(function (sum, it) { return sum + (it.availableQty || 0); }, 0);
      const totalDefectQty = records.reduce(function (sum, it) { return sum + (it.defectQty || 0); }, 0);

      // hasMore 用 records.length 准确判断（分页按 SKU 算）
      const newList = reset ? styles : that.data.list.concat(styles);
      const newAvailable = reset ? totalAvailableQty : that.data.totalAvailableQty + totalAvailableQty;
      const newDefect = reset ? totalDefectQty : that.data.totalDefectQty + totalDefectQty;

      that.setData({
        list: newList,
        // 「款数」统计卡片 = 聚合后的款数（用户看到的）
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
      wx.showToast({ title: '加载失败', icon: 'none' });
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
      wx.showToast({ title: '该款暂无可用库存', icon: 'none' });
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
});
