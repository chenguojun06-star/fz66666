const api = require('../../../utils/api');

Page({
  data: {
    loading: false,
    locationCode: '',
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
      // 直接传入库位编码
      this.setData({ locationCode: options.locationCode });
      this.loadLocationItems(options.locationCode);
    } else {
      this.setData({ error: '无效的库位二维码' });
    }
  },

  async loadLocationItems(locationCode) {
    this.setData({ loading: true, error: '' });
    try {
      const res = await api.get('/warehouse/location/items', { locationCode });
      const data = res?.data?.data || res?.data || {};
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