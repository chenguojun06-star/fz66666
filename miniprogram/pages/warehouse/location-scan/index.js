const api = require('../../../utils/api');
const { eventBus, Events } = require('../../../utils/eventBus');

Page({
  data: {
    loading: false,
    locationCode: '',
    manualCode: '',
    locationInfo: null,
    items: [],
    error: '',
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
    this._bindEvents();
  },

  onHide() {
    this._unbindEvents();
  },

  onUnload() {
    this._unbindEvents();
    if (this._autoScanTimer) { clearTimeout(this._autoScanTimer); this._autoScanTimer = null; }
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
        if (!code) { that.setData({ error: '未识别到内容' }); return; }
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
    } catch (err) {
      this.setData({
        error: err?.message || '加载库位库存失败',
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
      title: `库位 ${this.data.locationCode} 库存详情`,
      path: `/pages/warehouse/location-scan/index?locationCode=${this.data.locationCode}`,
    };
  },
});