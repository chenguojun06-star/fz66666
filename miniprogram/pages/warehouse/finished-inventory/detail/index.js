var api = require('../../../../utils/api');
var fileUrl = require('../../../../utils/fileUrl');
var uiHelper = require('../../../../utils/uiHelper');

Page({
  data: {
    loading: true,
    styleNo: '',
    orderNo: '',
    styleName: '',
    styleImage: '',
    factoryName: '',
    skuList: [],         // 同款同单的 SKU 列表
    summary: {
      totalAvailable: 0,
      totalLocked: 0,
      totalDefect: 0,
      totalInbound: 0,
    },
    // 出库弹窗
    showOutbound: false,
    outboundSku: null,
    outboundQty: 1,
  },

  onLoad(options) {
    this.setData({
      styleNo: options.styleNo || '',
      orderNo: options.orderNo || '',
      styleName: decodeURIComponent(options.styleName || ''),
      styleImage: decodeURIComponent(options.styleImage || ''),
      factoryName: decodeURIComponent(options.factoryName || ''),
    });
    wx.setNavigationBarTitle({ title: '库存详情' });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.styleNo) {
      this.setData({ loading: false });
      uiHelper.toast('缺少款号');
      return;
    }
    this.setData({ loading: true });
    try {
      var res = await api.warehouse.listFinishedInventory({
        styleNo: this.data.styleNo,
        orderNo: this.data.orderNo,
        page: 1,
        size: 500,
      });
      var records = [];
      if (res && res.data) {
        records = res.data.records || res.data || [];
      } else if (res && Array.isArray(res)) {
        records = res;
      }

      // 处理 SKU 列表
      var skuList = records.map(function (item, idx) {
        return {
          id: item.id || ('sku_' + idx),
          sku: item.sku || '',
          color: item.color || '-',
          size: item.size || '-',
          availableQty: item.availableQty || 0,
          lockedQty: item.lockedQty || 0,
          defectQty: item.defectQty || 0,
          totalInboundQty: item.totalInboundQty || 0,
          costPrice: item.costPrice || 0,
          salesPrice: item.salesPrice || 0,
          warehouseLocation: item.warehouseLocation || '-',
          lastInboundDate: item.lastInboundDate || '',
          inProductionQty: item.inProductionQty || 0,
          pendingSalesQty: item.pendingSalesQty || 0,
        };
      });

      // 统计
      var summary = { totalAvailable: 0, totalLocked: 0, totalDefect: 0, totalInbound: 0 };
      skuList.forEach(function (s) {
        summary.totalAvailable += s.availableQty;
        summary.totalLocked += s.lockedQty;
        summary.totalDefect += s.defectQty;
        summary.totalInbound += s.totalInboundQty;
      });

      this.setData({ skuList: skuList, summary: summary, loading: false });
    } catch (e) {
      this.setData({ loading: false });
      uiHelper.toast(e && e.message ? e.message : '加载失败');
    }
  },

  onOutbound(e) {
    var sku = e.currentTarget.dataset.sku;
    if (!sku || sku.availableQty <= 0) {
      uiHelper.toast('可用库存不足');
      return;
    }
    this.setData({
      showOutbound: true,
      outboundSku: sku,
      outboundQty: 1,
    });
  },

  onOutboundQtyChange(e) {
    this.setData({ outboundQty: e.detail.value });
  },

  onOutboundQtyMinus() {
    if (this.data.outboundQty > 1) {
      this.setData({ outboundQty: this.data.outboundQty - 1 });
    }
  },

  onOutboundQtyPlus() {
    var max = this.data.outboundSku ? this.data.outboundSku.availableQty : 99;
    if (this.data.outboundQty < max) {
      this.setData({ outboundQty: this.data.outboundQty + 1 });
    }
  },

  async onConfirmOutbound() {
    var sku = this.data.outboundSku;
    if (!sku) return;
    var qty = parseInt(this.data.outboundQty, 10) || 1;
    if (qty <= 0) { uiHelper.toast('数量需大于0'); return; }
    if (qty > sku.availableQty) { uiHelper.toast('超出可用库存'); return; }

    try {
      await api.warehouse.outbound({
        items: [{ sku: sku.sku, quantity: qty }],
        orderId: sku.orderId || '',
        styleId: sku.styleId || '',
      });
      this.setData({ showOutbound: false, outboundSku: null });
      uiHelper.toast('出库成功');
      this.loadDetail();
    } catch (e) {
      uiHelper.toast(e && e.message ? e.message : '出库失败');
    }
  },

  onCancelOutbound() {
    this.setData({ showOutbound: false, outboundSku: null });
  },

  preventTouchMove() {},
});
