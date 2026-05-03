var api = require('../../../../utils/api');

function today() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysLater(n) {
  var d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

var PLATE_MAP = ['', 'FIRST', 'REORDER'];
var BIZ_TYPES = ['FOB', 'ODM', 'OEM', 'CMT'];
var PRICING_MODES = ['PROCESS', 'SIZE', 'COST', 'MANUAL'];

Page({
  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  data: {
    styleId: '', styleNo: '', styleName: '', coverImage: '',
    orderNo: '',
    factoryMode: 'INTERNAL', orgUnitId: '', orgUnitName: '',
    factoryId: '', factoryName: '',
    plannedStartDate: '', plannedEndDate: '',
    urgencyLevel: 'normal',
    company: '', productCategory: '',
    plateType: '', plateTypeLabel: '',
    orderBizType: '',
    patternMaker: '', merchandiser: '',
    pricingMode: 'PROCESS', pricingModeIdx: 0,
    pricingModeLabels: ['工序单价', '尺码单价', '外发整件', '手动单价'],
    manualOrderUnitPrice: '',
    orderQuantity: 0, computedUnitPrice: 0,
    selectedColors: [], selectedSizes: [],
    orderLines: [],
    gridRows: [], gridSizes: [],
    colorInput: '', sizeInput: '',
    colorOptions: [], sizeOptions: [],
    plateTypeOptions: ['自动判断', '首单', '翻单'],
    factoryList: [], orgUnitList: [], categoryOptions: [],
    processPrices: [],
    quickFillQty: 1, submitting: false
  },

  onLoad: function (opts) {
    this.setData({
      styleId: decodeURIComponent(opts.styleId || ''),
      styleNo: decodeURIComponent(opts.styleNo || ''),
      styleName: decodeURIComponent(opts.styleName || ''),
      coverImage: decodeURIComponent(opts.coverImage || ''),
      plannedStartDate: today(),
      plannedEndDate: daysLater(7)
    });

    var colors = (decodeURIComponent(opts.colors || '')).split(',').filter(function (c) { return c.trim(); });
    var sizes = (decodeURIComponent(opts.sizes || '')).split(',').filter(function (s) { return s.trim(); });

    this.setData({
      colorOptions: colors,
      sizeOptions: sizes,
      selectedColors: colors.slice(),
      selectedSizes: sizes.slice()
    });

    if (colors.length && sizes.length) { this._rebuildLines(); }

    this._loadAux();
    this._genOrderNo();
    this._loadProcessPrices();
  },

  _rebuildLines: function () {
    var cs = this.data.selectedColors, ss = this.data.selectedSizes;
    var old = {};
    this.data.orderLines.forEach(function (l) { old[l.color + '|' + l.size] = l.quantity || 0; });
    var lines = [];
    cs.forEach(function (c) { ss.forEach(function (s) { lines.push({ color: c, size: s, quantity: old[c + '|' + s] || 0 }); }); });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
  },

  _recalcTotal: function () {
    var t = 0;
    this.data.orderLines.forEach(function (l) { t += l.quantity || 0; });
    this.setData({ orderQuantity: t });
  },

  _rebuildGrid: function () {
    var cs = this.data.selectedColors, ss = this.data.selectedSizes;
    var rows = [];
    cs.forEach(function (c) {
      var cells = [];
      ss.forEach(function (s) {
        var q = 0;
        for (var i = 0; i < this.data.orderLines.length; i++) {
          var l = this.data.orderLines[i];
          if (l.color === c && l.size === s) { q = l.quantity || 0; break; }
        }
        cells.push({ size: s, quantity: q });
      }.bind(this));
      rows.push({ color: c, cells: cells });
    }.bind(this));
    this.setData({ gridRows: rows, gridSizes: ss });
    this._recalcComputedPrice();
  },

  _recalcComputedPrice: function () {
    var pps = this.data.processPrices || [];
    var total = 0;
    pps.forEach(function (p) { total += parseFloat(p.unitPrice || p.price || 0); });
    this.setData({ computedUnitPrice: total.toFixed(2) });
  },

  _loadAux: function () {
    var self = this;

    api.factory.list().then(function (res) {
      var list = res && res.records ? res.records : (Array.isArray(res) ? res : []);
      self.setData({ factoryList: list.map(function (f) { return { factoryName: f.factoryName || f.name || f.label || '', id: f.id }; }) });
    }).catch(function () {});

    api.system.listOrganizationDepartments().then(function (res) {
      var list = res && res.records ? res.records : (Array.isArray(res) ? res : []);
      self.setData({ orgUnitList: list.map(function (d) {
        return { name: d.pathNames || d.nodeName || d.name || d.unitName || d.label || '', id: d.id };
      })});
    }).catch(function () {});

    api.system.getDictList('category').then(function (res) {
      var data = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      self.setData({ categoryOptions: data });
      if (data.length) {
        self.setData({ productCategory: data[0].dictLabel || data[0].label || '' });
      }
    }).catch(function () {});

    api.system.getMe().then(function (me) {
      self.setData({ merchandiser: me.name || me.username || '' });
    }).catch(function () {});
  },

  _loadProcessPrices: function () {
    var self = this;
    api.production.listStyleProcesses(self.data.styleId).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      self.setData({ processPrices: list });
      self._recalcComputedPrice();
    }).catch(function () {});
  },

  _genOrderNo: function () {
    var self = this;
    api.serial.generate('ORDER_NO').then(function (no) {
      self.setData({ orderNo: String(no || '') });
    }).catch(function () {
      self.setData({ orderNo: 'ORD' + Date.now() });
    });
  },

  /* 订单号 */
  onOrderNoInput: function (e) { this.setData({ orderNo: e.detail.value }); },
  onAutoGenOrderNo: function () { this._genOrderNo(); },

  /* 生产方 */
  onFactoryModeTap: function (e) {
    this.setData({ factoryMode: e.currentTarget.dataset.v, orgUnitId: '', orgUnitName: '', factoryId: '', factoryName: '' });
  },

  /* 部门 */
  onOrgUnitChange: function (e) {
    var item = this.data.orgUnitList[e.detail.value];
    if (item) this.setData({ orgUnitId: item.id, orgUnitName: item.name || '' });
  },

  /* 外发 */
  onFactoryChange: function (e) {
    var item = this.data.factoryList[e.detail.value];
    if (item) this.setData({ factoryId: item.id, factoryName: item.factoryName || '' });
  },

  /* 日期 */
  onStartDateChange: function (e) { this.setData({ plannedStartDate: e.detail.value }); },
  onEndDateChange: function (e) { this.setData({ plannedEndDate: e.detail.value }); },

  /* 急单 */
  onUrgencyTap: function (e) { this.setData({ urgencyLevel: e.currentTarget.dataset.v }); },

  /* 业务 */
  onCompanyInput: function (e) { this.setData({ company: e.detail.value }); },

  onCategoryChange: function (e) {
    var item = this.data.categoryOptions[e.detail.value];
    this.setData({ productCategory: item ? (item.dictLabel || item.label || '') : '' });
  },

  onPlateTypeChange: function (e) {
    var v = PLATE_MAP[e.detail.value];
    this.setData({ plateType: v, plateTypeLabel: v ? this.data.plateTypeOptions[e.detail.value] : '' });
  },

  onBizTypeChange: function (e) {
    this.setData({ orderBizType: BIZ_TYPES[e.detail.value] || '' });
  },

  onPatternMakerInput: function (e) { this.setData({ patternMaker: e.detail.value }); },
  onMerchandiserInput: function (e) { this.setData({ merchandiser: e.detail.value }); },

  /* 颜色添加 */
  onColorInput: function (e) { this.setData({ colorInput: e.detail.value }); },
  onColorAdd: function () {
    var v = (this.data.colorInput || '').trim();
    if (!v) return;
    var opts = this.data.colorOptions.slice();
    if (opts.indexOf(v) === -1) opts.push(v);
    var sel = this.data.selectedColors.slice();
    if (sel.indexOf(v) === -1) sel.push(v);
    this.setData({ colorOptions: opts, selectedColors: sel, colorInput: '' });
    this._rebuildLines();
  },

  onColorToggle: function (e) {
    var c = e.currentTarget.dataset.c;
    var sel = this.data.selectedColors.slice();
    var i = sel.indexOf(c);
    if (i === -1) sel.push(c); else sel.splice(i, 1);
    this.setData({ selectedColors: sel });
    this._rebuildLines();
  },

  /* 码数添加 */
  onSizeInput: function (e) { this.setData({ sizeInput: e.detail.value }); },
  onSizeAdd: function () {
    var v = (this.data.sizeInput || '').trim();
    if (!v) return;
    var opts = this.data.sizeOptions.slice();
    if (opts.indexOf(v) === -1) opts.push(v);
    var sel = this.data.selectedSizes.slice();
    if (sel.indexOf(v) === -1) sel.push(v);
    this.setData({ sizeOptions: opts, selectedSizes: sel, sizeInput: '' });
    this._rebuildLines();
  },

  onSizeToggle: function (e) {
    var s = e.currentTarget.dataset.s;
    var sel = this.data.selectedSizes.slice();
    var i = sel.indexOf(s);
    if (i === -1) sel.push(s); else sel.splice(i, 1);
    this.setData({ selectedSizes: sel });
    this._rebuildLines();
  },

  /* 铺量 */
  onQuickFillInput: function (e) { this.setData({ quickFillQty: parseInt(e.detail.value) || 0 }); },
  onQuickFill: function () {
    var q = this.data.quickFillQty;
    if (q <= 0) return;
    var lines = this.data.orderLines.map(function (l) { return { color: l.color, size: l.size, quantity: q }; });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
  },

  /* 网格矩阵单个输入 */
  onGridQtyInput: function (e) {
    var color = e.currentTarget.dataset.color;
    var size = e.currentTarget.dataset.size;
    var v = parseInt(e.detail.value) || 0;
    var idx = -1;
    for (var i = 0; i < this.data.orderLines.length; i++) {
      if (this.data.orderLines[i].color === color && this.data.orderLines[i].size === size) {
        idx = i; break;
      }
    }
    if (idx >= 0) {
      this.setData({ ['orderLines[' + idx + '].quantity']: v });
      this._recalcTotal();
      this._rebuildGrid();
    }
  },

  /* 旧版矩阵输入（保留兼容） */
  onLineQtyInput: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var v = parseInt(e.detail.value) || 0;
    this.setData({ ['orderLines[' + idx + '].quantity']: v });
    this._recalcTotal();
    this._rebuildGrid();
  },

  /* 单价 */
  onPricingModeChange: function (e) {
    var idx = e.detail.value;
    this.setData({ pricingMode: PRICING_MODES[idx] || 'PROCESS', pricingModeIdx: idx });
    this._recalcComputedPrice();
  },
  onManualPriceInput: function (e) { this.setData({ manualOrderUnitPrice: e.detail.value }); },

  /* 提交 */
  onSubmit: function () {
    if (this.data.submitting) return;
    var d = this.data;

    if (!(d.orderNo || '').trim()) return wx.showToast({ title: '请输入订单号', icon: 'none' });
    if (d.factoryMode === 'INTERNAL' && !d.orgUnitId) return wx.showToast({ title: '请选择部门', icon: 'none' });
    if (d.factoryMode === 'EXTERNAL' && !d.factoryId) return wx.showToast({ title: '请选择工厂', icon: 'none' });
    if (!d.plannedStartDate) return wx.showToast({ title: '请选下单时间', icon: 'none' });
    if (!d.plannedEndDate) return wx.showToast({ title: '请选订单交期', icon: 'none' });

    var hasQ = false;
    for (var i = 0; i < d.orderLines.length; i++) {
      if (d.orderLines[i].quantity > 0) { hasQ = true; break; }
    }
    if (!hasQ) return wx.showToast({ title: '请填写下单数量', icon: 'none' });

    var up = 0;
    if (d.pricingMode === 'MANUAL') {
      up = parseFloat(d.manualOrderUnitPrice) || 0;
      if (up <= 0) return wx.showToast({ title: '请输入单价', icon: 'none' });
    } else {
      var pps = d.processPrices || [];
      if (pps.length > 0) {
        var total = 0;
        pps.forEach(function (p) { total += parseFloat(p.unitPrice || p.price) || 0; });
        up = total;
      }
    }

    var self = this;
    wx.showModal({
      title: '确认下单',
      content: '款号：' + d.styleNo + '\n数量：' + d.orderQuantity + '\n确认提交？',
      success: function (r) { if (r.confirm) self._doSubmit(up); }
    });
  },

  _doSubmit: function (unitPrice) {
    this.setData({ submitting: true });
    var d = this.data;

    var valid = d.orderLines.filter(function (l) { return l.quantity > 0; });
    var colors = [], sizes = [];
    valid.forEach(function (l) {
      if (colors.indexOf(l.color) === -1) colors.push(l.color);
      if (sizes.indexOf(l.size) === -1) sizes.push(l.size);
    });

    var details = valid.map(function (l) {
      return { color: l.color, size: l.size, quantity: l.quantity, materialPriceSource: '物料采购系统', materialPriceAcquiredAt: new Date().toISOString(), materialPriceVersion: 'purchase.v1' };
    });

    var payload = {
      orderNo: d.orderNo, styleId: d.styleId, styleNo: d.styleNo, styleName: d.styleName,
      color: colors.join(','), size: sizes.join(','),
      factoryId: d.factoryMode === 'EXTERNAL' ? d.factoryId : null,
      factoryName: d.factoryMode === 'EXTERNAL' ? d.factoryName : d.orgUnitName,
      orgUnitId: d.factoryMode === 'INTERNAL' ? d.orgUnitId : null,
      factoryType: d.factoryMode,
      merchandiser: d.merchandiser || null, company: d.company || null,
      customerId: null, customerName: null,
      productCategory: d.productCategory || null, patternMaker: d.patternMaker || null,
      urgencyLevel: d.urgencyLevel, plateType: d.plateType || null,
      orderBizType: d.orderBizType || null, orderQuantity: d.orderQuantity,
      orderDetails: JSON.stringify({ lines: details, pricing: { pricingMode: d.pricingMode, orderUnitPrice: unitPrice || 0 } }),
      factoryUnitPrice: unitPrice || 0, pricingMode: d.pricingMode,
      plannedStartDate: d.plannedStartDate + 'T09:00:00',
      plannedEndDate: d.plannedEndDate + 'T18:00:00',
      scatterPricingMode: 'FOLLOW_ORDER'
    };

    var self = this;
    api.production.createOrder(payload).then(function () {
      self.setData({ submitting: false });
      wx.showToast({ title: '下单成功', icon: 'success' });
      setTimeout(function () { wx.navigateBack(); }, 1500);
    }).catch(function (err) {
      self.setData({ submitting: false });
      wx.showToast({ title: (err && err.message) || '下单失败', icon: 'none', duration: 3000 });
    });
  }
});
