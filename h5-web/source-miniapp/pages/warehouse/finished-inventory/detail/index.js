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
    // Tab 切换：sku / inbound
    activeTab: 'sku',
    // 入库记录
    inboundHistory: [],
    inboundLoading: false,
    inboundLoaded: false,   // 是否已加载过入库记录（避免重复请求）
    inboundTotalQty: 0,
    // 出库弹窗
    showOutbound: false,
    outboundSku: null,
    outboundQty: 1,
  },

  onLoad(options) {
    // D-418：列表「出库」按钮带 autoOutbound=1 进入时，加载完 SKU 后自动弹出出库窗
    this._autoOutbound = options.autoOutbound === '1';
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
        pageSize: 500,
      });
      // 注意：ok() 已把 resp.data 解出，res 本身就是 data
      var records = [];
      if (Array.isArray(res)) {
        records = res;
      } else if (res && Array.isArray(res.records)) {
        records = res.records;
      } else if (res && Array.isArray(res.list)) {
        records = res.list;
      } else if (res && Array.isArray(res.items)) {
        records = res.items;
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

      // D-418：从成品仓储列表点「出库」进入时（autoOutbound=1），
      // 自动弹出第一个有可用库存的 SKU 出库窗，省去「再点一次 SKU 行」的步骤。
      if (this._autoOutbound) {
        this._autoOutbound = false;
        var hasStock = skuList.some(function (s) { return Number(s.availableQty) > 0; });
        if (hasStock) {
          this._goOutboundPage();   // D-482：独立页面，不再自动开弹窗
        } else {
          uiHelper.toast('该款暂无可用库存');
        }
      }
    } catch (e) {
      this.setData({ loading: false });
      uiHelper.toast(e && e.message ? e.message : '加载失败');
    }
  },

  /**
   * D-482：出库改为**跳转独立页面**（不再是弹窗）。
   * 原因：① 弹窗面积小，手机上键盘一弹就挤、不好操作；
   *       ② 弹窗只能对单行触发，无法批量多选；
   *       ③ 弹窗没有「出库类型 / 仓库区域 / 客户」选择，导致后端必填字段缺失
   *          （后端默认 shipment 类型，shipment 必须带 customerName）。
   */
  _goOutboundPage() {
    var d = this.data;
    if (!d.styleNo) {
      uiHelper.toast('缺少款号');
      return;
    }
    wx.navigateTo({
      url: '/pages/warehouse/finished-outbound/index'
        + '?styleNo=' + encodeURIComponent(d.styleNo)
        + '&orderNo=' + encodeURIComponent(d.orderNo || '')
        + '&styleName=' + encodeURIComponent(d.styleName || '')
        + '&styleImage=' + encodeURIComponent(d.styleImage || '')
        + '&factoryName=' + encodeURIComponent(d.factoryName || ''),
    });
  },

  onOutbound(e) {
    // 兼容旧交互：行内「出库」按钮仍存在，但不再开弹窗，统一走独立页面
    this._goOutboundPage();
  },

  // 切换 Tab：进入入库记录 Tab 时懒加载入库记录
  onSwitchTab(e) {
    var tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.activeTab) return;
    this.setData({ activeTab: tab });
    if (tab === 'inbound' && !this.data.inboundLoaded) {
      this.loadInboundHistory();
    }
  },

  // 加载入库记录（对齐 PC 端 handleViewInboundHistory）
  // 调用 /api/production/warehousing/list?styleNo=xxx&page=1&pageSize=500
  async loadInboundHistory() {
    if (!this.data.styleNo) {
      uiHelper.toast('缺少款号');
      return;
    }
    this.setData({ inboundLoading: true });
    try {
      var res = await api.production.listWarehousing({
        styleNo: this.data.styleNo,
        page: 1,
        pageSize: 500,
      });
      // 注意：ok() 已把 resp.data 解出，res 本身就是 data
      var records = [];
      if (Array.isArray(res)) {
        records = res;
      } else if (res && Array.isArray(res.records)) {
        records = res.records;
      } else if (res && Array.isArray(res.list)) {
        records = res.list;
      } else if (res && Array.isArray(res.items)) {
        records = res.items;
      }

      // 与 PC 端 useFinishedInventoryActions 的字段映射保持一致
      var fallbackOperator = '-';
      var fallbackWarehouse = '-';
      var rows = records.map(function (item, idx) {
        return {
          id: String(item.id || ('inbound_' + idx)),
          styleNo: String(item.styleNo || ''),
          orderNo: String(item.orderNo || '-'),
          inboundDate: String(item.warehousingEndTime || item.createTime || '-'),
          qualityInspectionNo: String(item.warehousingNo || '-'),
          cuttingBundleNo: String(item.cuttingBundleNo || '-'),
          color: String(item.color || '-'),
          size: String(item.size || '-'),
          quantity: Number(item.warehousingQuantity != null ? item.warehousingQuantity : (item.qualifiedQuantity || 0)),
          operator: String(item.warehousingOperatorName || item.qualityOperatorName || item.receiverName || fallbackOperator),
          warehouseLocation: String(item.warehouse || item.warehouseLocation || fallbackWarehouse),
        };
      });

      var totalQty = rows.reduce(function (s, r) { return s + (r.quantity || 0); }, 0);

      this.setData({
        inboundHistory: rows,
        inboundTotalQty: totalQty,
        inboundLoaded: true,
        inboundLoading: false,
      });
    } catch (e) {
      this.setData({ inboundLoading: false, inboundLoaded: true });
      uiHelper.toast(e && e.message ? e.message : '加载入库记录失败');
    }
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
