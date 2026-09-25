const api = require('../../../utils/api');
const { eventBus, Events } = require('../../../utils/eventBus');
const i18n = require('../../../utils/i18n/index');

Page({
  data: {
    loading: false,
    locationCode: '',
    manualCode: '',
    locationInfo: null,
    items: [],
    error: '',
    /** 页面文案（由 applyLanguage 填充，wxml 用 {{t.xxx}} 读取） */
    t: {},
  },

  onLoad(options) {
    // 从扫码结果获取库位编码
    const scanResult = options.q || options.result || '';
    if (scanResult.startsWith('LOC:')) {
      const locationCode = scanResult.substring(4);
      this.setData({ locationCode });
      this.loadLocationItems(locationCode);
    } else if (options.locationCode) {
      this.setData({ locationCode: options.locationCode });
      this.loadLocationItems(options.locationCode);
    } else {
      // 没有参数，自动调起扫码
      this._autoScanTimer = setTimeout(() => { this.onStartScan(); }, 300);
    }
  },

  onShow() {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
    this._bindEvents();
  },

  onHide() {
    this._unbindEvents();
  },

  onUnload() {
    this._unbindEvents();
    if (this._autoScanTimer) { clearTimeout(this._autoScanTimer); this._autoScanTimer = null; }
  },

  /**
   * 应用指定语言的页面文案。
   * @param {string=} language 语言代码，缺省取当前语言
   */
  applyLanguage(language) {
    const lang = language || i18n.getLanguage();
    // 导航栏标题：json 里的 navigationBarTitleText 只能写死，必须在这里覆盖才会跟着语言变
    wx.setNavigationBarTitle({ title: i18n.t('mp.warehouse.locationScan.title', lang) });
    this.setData({
      t: {
        scanTitle: i18n.t('mp.warehouse.locationScan.scanTitle', lang),
        scanSub: i18n.t('mp.warehouse.locationScan.scanSub', lang),
        manualPlaceholder: i18n.t('mp.warehouse.locationScan.manualPlaceholder', lang),
        query: i18n.t('common.query', lang),
        loading: i18n.t('common.loading', lang),
        rescan: i18n.t('mp.warehouse.locationScan.rescan', lang),
        retry: i18n.t('common.retry', lang),
        warehouseName: i18n.t('mp.warehouse.locationScan.warehouseName', lang),
        locationName: i18n.t('mp.warehouse.locationScan.locationName', lang),
        capacity: i18n.t('mp.warehouse.locationScan.capacity', lang),
        stockDetail: i18n.t('mp.warehouse.locationScan.stockDetail', lang),
        emptyStock: i18n.t('mp.warehouse.locationScan.emptyStock', lang),
        piece: i18n.t('common.piece', lang),
        itemCount: i18n.tf('mp.warehouse.locationScan.itemCount', { count: (this.data.items || []).length }, lang),
      },
    });
  },

  /** 列表条数变化后只需重算「N 件」这一条带参文案 */
  _refreshItemCount() {
    this.setData({
      't.itemCount': i18n.tf('mp.warehouse.locationScan.itemCount', {
        count: (this.data.items || []).length,
      }),
    });
  },

  /** 调起微信扫码 */
  onStartScan() {
    this.setData({ error: '' });
    var that = this;
    wx.scanCode({
      onlyFromCamera: false,
      scanType: ['qrCode', 'barCode'],
      success(res) {
        var code = res.result || '';
        if (!code) { that.setData({ error: i18n.t('mp.warehouse.locationScan.noContent') }); return; }
        // 解析 LOC: 前缀
        if (code.startsWith('LOC:')) { code = code.substring(4); }
        that.setData({ locationCode: code });
        that.loadLocationItems(code);
      },
      fail() {
        // 用户取消扫码，静默处理（停留在扫码入口页）
      },
    });
  },

  onManualInput(e) {
    this.setData({ manualCode: e.detail.value });
  },

  onManualSearch() {
    var code = (this.data.manualCode || '').trim();
    if (!code) { return; }
    this.setData({ locationCode: code, error: '' });
    this.loadLocationItems(code);
  },

  _bindEvents() {
    this._onDataChanged = (data) => {
      if (data && (data.type === 'warehouse' || data.type === 'locationStock')) {
        if (this.data.locationCode) {
          this.loadLocationItems(this.data.locationCode);
        }
      }
    };
    this._onRefreshAll = () => {
      if (this.data.locationCode) {
        this.loadLocationItems(this.data.locationCode);
      }
    };
    eventBus.on(Events.DATA_CHANGED, this._onDataChanged);
    eventBus.on(Events.REFRESH_ALL, this._onRefreshAll);
  },

  _unbindEvents() {
    if (this._onDataChanged) eventBus.off(Events.DATA_CHANGED, this._onDataChanged);
    if (this._onRefreshAll) eventBus.off(Events.REFRESH_ALL, this._onRefreshAll);
  },

  async loadLocationItems(locationCode) {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.warehouse.getLocationItems({ locationCode });
      const data = res || {};
      this.setData({
        locationInfo: {
          locationCode: data.locationCode || locationCode,
          locationName: data.locationName || '',
          zoneName: data.zoneName || '',
          warehouseTypeLabel: data.warehouseTypeLabel || '',
          capacity: data.capacity || 0,
          usedCapacity: data.usedCapacity || 0,
        },
        items: data.items || [],
        loading: false,
      });
      this._refreshItemCount();
    } catch (err) {
      this.setData({
        // ⚠️ 后端目前零 i18n，err.message 是中文；仅在无 message 时才用本地化兜底
        error: err?.message || i18n.t('mp.warehouse.locationScan.loadFailed'),
        loading: false,
      });
    }
  },

  onRetry() {
    if (this.data.locationCode) {
      this.loadLocationItems(this.data.locationCode);
    }
  },

  onShareAppMessage() {
    return {
      title: i18n.tf('mp.warehouse.locationScan.shareTitle', { code: this.data.locationCode }),
      path: `/pages/warehouse/location-scan/index?locationCode=${this.data.locationCode}`,
    };
  },
});
