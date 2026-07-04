const api = require('../../../../utils/api');
const { fieldConfig } = require('../../../../utils/api-modules/field-config');
const { collectExtValues } = require('../../../../utils/api-modules/field-config-helpers');
const { toast } = require('../../../../utils/uiHelper');

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function daysLater(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const PLATE_MAP = ['', 'FIRST', 'REORDER'];
const BIZ_TYPES = ['FOB', 'ODM', 'OEM', 'CMT'];
const PRICING_MODES = ['PROCESS', 'SIZE', 'COST', 'QUOTE', 'MANUAL'];
const PROD_DEPT_KEYWORDS = ['生产', '车间', '裁剪', '缝制', '后整', '工序', '车缝', '尾部', '整烫', '包装', '质检', '工艺', '班组', '产线', '绣花', '印花', '洗水', '组'];

Page({
  onCoverPreview: function (e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  data: {
    styleId: '', styleNo: '', styleName: '', coverImage: '',
    isNoData: false,  // 是否为无资料下单
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
    pricingModeLabels: ['工序单价', '尺码单价', '外发整件', '报价单价', '手动单价'],
    manualOrderUnitPrice: '',
    orderQuantity: 0, computedUnitPrice: 0,
    selectedColors: [], selectedSizes: [],
    orderLines: [],
    gridRows: [], gridSizes: [],
    colorInput: '', sizeInput: '',
    colorOptions: [], sizeOptions: [],
    _colorOptItems: [], _sizeOptItems: [],
    plateTypeOptions: ['自动判断', '首单', '翻单'],
    factoryList: [], orgUnitList: [], categoryOptions: [],
    quickFillQty: 1, submitting: false,
    // 扩展字段配置
    extFields: [],
  },

  onLoad: function (opts) {
    var isNoData = opts.noData === 'true';
    var colors = [];
    var sizes = [];
    var coverImage = '';

    // 加载扩展字段配置（非阻塞）
    this.loadExtFields();

    if (isNoData) {
      // 无资料下单：使用用户上传的临时图片
      coverImage = decodeURIComponent(opts.tempImage || '');
    } else {
      // 有资料下单：使用款式的封面图
      coverImage = decodeURIComponent(opts.coverImage || '');
      colors = (decodeURIComponent(opts.colors || '')).split(',').filter(function (c) { return c.trim(); });
      sizes = (decodeURIComponent(opts.sizes || '')).split(',').filter(function (s) { return s.trim(); });
    }

    this.setData({
      styleId: decodeURIComponent(opts.styleId || ''),
      styleNo: decodeURIComponent(opts.styleNo || ''),
      styleName: decodeURIComponent(opts.styleName || ''),
      coverImage: coverImage,
      isNoData: isNoData,
      plannedStartDate: today(),
      plannedEndDate: daysLater(7),
      colorOptions: colors,
      sizeOptions: sizes,
      selectedColors: colors.slice(),
      selectedSizes: sizes.slice(),
      _colorOptItems: colors.map(function (c) { return { value: c, _selected: true }; }),
      _sizeOptItems: sizes.map(function (s) { return { value: s, _selected: true }; }),
    });

    if (!isNoData && colors.length && sizes.length) { this._rebuildLines(); }

    this._genOrderNo();

    var self = this;
    wx.nextTick(function () {
      self._loadAux();
      if (!isNoData) {
        self._loadProcessPrices();
        self._loadQuotation();
      }
    });
  },

  _rebuildLines: function () {
    const cs = this.data.selectedColors; const ss = this.data.selectedSizes;
    const old = {};
    this.data.orderLines.forEach(function (l) { old[l.color + '|' + l.size] = l.quantity || 0; });
    const lines = [];
    cs.forEach(function (c) { ss.forEach(function (s) { lines.push({ color: c, size: s, quantity: old[c + '|' + s] || 0 }); }); });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
  },

  _recalcTotal: function () {
    let t = 0;
    this.data.orderLines.forEach(function (l) { t += l.quantity || 0; });
    this.setData({ orderQuantity: t });
  },

  _rebuildGrid: function () {
    const cs = this.data.selectedColors; const ss = this.data.selectedSizes;
    const rows = [];
    cs.forEach(function (c) {
      const cells = [];
      ss.forEach(function (s) {
        let q = 0;
        for (let i = 0; i < this.data.orderLines.length; i++) {
          const l = this.data.orderLines[i];
          if (l.color === c && l.size === s) { q = l.quantity || 0; break; }
        }
        cells.push({ size: s, quantity: q });
      }.bind(this));
      rows.push({ color: c, cells: cells });
    }.bind(this));
    this.setData({ gridRows: rows, gridSizes: ss });
  },

  /* ═══ 报价 + 工序 + 核价 → 五模定价 ═══ */

  _loadProcessPrices: function () {
    const self = this;
    api.production.listStyleProcesses(self.data.styleId).then(function (res) {
      const list = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      let total = 0;
      list.forEach(function (p) { total += parseFloat(p.unitPrice || p.price || 0); });
      self._processPrices = list;
      self._processTotal = total;
      self._recalcComputedPrice();
    }).catch(function () {});
  },

  _loadQuotation: function () {
    const self = this;
    api.style.getQuotation(self.data.styleId).then(function (q) {
      if (!q) return;
      self._quotation = q;
      self._quotationTotalCost = parseFloat(q.totalCost || 0);
      self._quotationTotalPrice = parseFloat(q.totalPrice || 0);
      self._recalcComputedPrice();
    }).catch(function () {});
  },

  _recalcComputedPrice: function () {
    const d = this.data; const mode = d.pricingMode;
    const processTotal = this._processTotal || 0;
    const quotationTotalCost = this._quotationTotalCost || 0;
    const quotationTotalPrice = this._quotationTotalPrice || 0;
    let price = 0;
    if (mode === 'PROCESS') price = processTotal;
    else if (mode === 'SIZE') price = processTotal;
    else if (mode === 'COST') price = quotationTotalCost || processTotal;
    else if (mode === 'QUOTE') price = quotationTotalPrice;
    else if (mode === 'MANUAL') price = parseFloat(d.manualOrderUnitPrice) || 0;
    this.setData({ computedUnitPrice: price.toFixed(2) });
  },

  /* ═══ 工厂 / 部门（对标PC端） ═══ */

  _loadAux: function () {
    const self = this;

    api.factory.list().then(function (res) {
      const list = res && res.records ? res.records : (Array.isArray(res) ? res : []);
      self.setData({ factoryList: list.map(function (f) { return { factoryName: f.factoryName || f.name || f.label || '', id: f.id }; }) });
    }).catch(function () {});

    api.system.listOrganizationDepartments().then(function (res) {
      const list = res && res.records ? res.records : (Array.isArray(res) ? res : []);
      const filtered = list.filter(function (d) {
        const name = d.nodeName || d.name || d.unitName || '';
        const path = d.pathNames || '';
        const content = name + ' ' + path;
        return PROD_DEPT_KEYWORDS.some(function (kw) { return content.indexOf(kw) !== -1; });
      });
      self.setData({ orgUnitList: filtered.map(function (d) {
        return { name: d.pathNames || d.nodeName || d.name || d.unitName || d.label || '', id: d.id };
      })});
    }).catch(function () {});

    api.system.getDictList('category').then(function (res) {
      const data = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      self.setData({ categoryOptions: data });
      if (data.length) {
        self.setData({ productCategory: data[0].dictLabel || data[0].label || '' });
      }
    }).catch(function () {});

    api.system.getMe().then(function (me) {
      self.setData({ merchandiser: me.name || me.username || '' });
    }).catch(function () {});
  },

  _genOrderNo: function () {
    const self = this;
    const isNoData = this.data.isNoData;
    
    // 无资料下单使用 CUT 前缀，有资料下单使用 ORDER_NO
    const serialType = isNoData ? 'CUTTING_TASK_NO' : 'ORDER_NO';
    
    api.serial.generate(serialType).then(function (no) {
      self.setData({ orderNo: String(no || '') });
    }).catch(function () {
      // 如果API失败，使用时间戳生成订单号
      const d = new Date();
      const ts = d.getFullYear()
        + String(d.getMonth() + 1).padStart(2, '0')
        + String(d.getDate()).padStart(2, '0')
        + String(d.getHours()).padStart(2, '0')
        + String(d.getMinutes()).padStart(2, '0')
        + String(d.getSeconds()).padStart(2, '0')
        + String(d.getMilliseconds()).padStart(3, '0');
      
      // 无资料下单使用 CUT 前缀，有资料下单使用 PO 前缀
      const prefix = isNoData ? 'CUT' : 'PO';
      self.setData({ orderNo: prefix + ts });
    });
  },

  /* ═══ 字段 bind ═══ */
  onOrderNoInput: function (e) { this.setData({ orderNo: e.detail.value }); },
  onAutoGenOrderNo: function () { this._genOrderNo(); },

  onFactoryModeTap: function (e) {
    this.setData({ factoryMode: e.currentTarget.dataset.v, orgUnitId: '', orgUnitName: '', factoryId: '', factoryName: '' });
  },

  onOrgUnitChange: function (e) {
    const item = this.data.orgUnitList[e.detail.value];
    if (item) this.setData({ orgUnitId: item.id, orgUnitName: item.name || '' });
  },

  onFactoryChange: function (e) {
    const item = this.data.factoryList[e.detail.value];
    if (item) this.setData({ factoryId: item.id, factoryName: item.factoryName || '' });
  },

  onStartDateChange: function (e) { this.setData({ plannedStartDate: e.detail.value }); },
  onEndDateChange: function (e) { this.setData({ plannedEndDate: e.detail.value }); },

  onUrgencyTap: function (e) { this.setData({ urgencyLevel: e.currentTarget.dataset.v }); },

  onCompanyInput: function (e) { this.setData({ company: e.detail.value }); },

  onCategoryChange: function (e) {
    const item = this.data.categoryOptions[e.detail.value];
    this.setData({ productCategory: item ? (item.dictLabel || item.label || '') : '' });
  },

  onPlateTypeChange: function (e) {
    const v = PLATE_MAP[e.detail.value];
    this.setData({ plateType: v, plateTypeLabel: v ? this.data.plateTypeOptions[e.detail.value] : '' });
  },

  onBizTypeChange: function (e) {
    this.setData({ orderBizType: BIZ_TYPES[e.detail.value] || '' });
  },

  onPatternMakerInput: function (e) { this.setData({ patternMaker: e.detail.value }); },
  onMerchandiserInput: function (e) { this.setData({ merchandiser: e.detail.value }); },

  _buildOptItems: function (opts, sel) {
    const o = opts || []; const s = sel || [];
    return o.map(function (v) { return { value: v, _selected: s.indexOf(v) !== -1 }; });
  },

  /* ═══ 颜色 / 码数 ═══ */
  onColorInput: function (e) { this.setData({ colorInput: e.detail.value }); },
  onColorAdd: function () {
    const v = (this.data.colorInput || '').trim();
    if (!v) return;
    const opts = this.data.colorOptions.slice();
    if (opts.indexOf(v) === -1) opts.push(v);
    const sel = this.data.selectedColors.slice();
    if (sel.indexOf(v) === -1) sel.push(v);
    this.setData({
      colorOptions: opts, selectedColors: sel, colorInput: '',
      _colorOptItems: this._buildOptItems(opts, sel),
    });
    this._rebuildLines();
  },

  onColorToggle: function (e) {
    const c = e.currentTarget.dataset.c;
    const sel = this.data.selectedColors.slice();
    const i = sel.indexOf(c);
    if (i === -1) sel.push(c); else sel.splice(i, 1);
    this.setData({ selectedColors: sel, _colorOptItems: this._buildOptItems(this.data.colorOptions, sel) });
    this._rebuildLines();
  },

  onSizeInput: function (e) { this.setData({ sizeInput: e.detail.value }); },
  onSizeAdd: function () {
    const v = (this.data.sizeInput || '').trim();
    if (!v) return;
    const opts = this.data.sizeOptions.slice();
    if (opts.indexOf(v) === -1) opts.push(v);
    const sel = this.data.selectedSizes.slice();
    if (sel.indexOf(v) === -1) sel.push(v);
    this.setData({
      sizeOptions: opts, selectedSizes: sel, sizeInput: '',
      _sizeOptItems: this._buildOptItems(opts, sel),
    });
    this._rebuildLines();
  },

  onSizeToggle: function (e) {
    const s = e.currentTarget.dataset.s;
    const sel = this.data.selectedSizes.slice();
    const i = sel.indexOf(s);
    if (i === -1) sel.push(s); else sel.splice(i, 1);
    this.setData({ selectedSizes: sel, _sizeOptItems: this._buildOptItems(this.data.sizeOptions, sel) });
    this._rebuildLines();
  },

  /* ═══ 铺量 / 网格 ═══ */
  onQuickFillInput: function (e) { this.setData({ quickFillQty: parseInt(e.detail.value) || 0 }); },
  onQuickFill: function () {
    const q = this.data.quickFillQty;
    if (q <= 0) return;
    const lines = this.data.orderLines.map(function (l) { return { color: l.color, size: l.size, quantity: q }; });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
  },

  onGridQtyInput: function (e) {
    const color = e.currentTarget.dataset.color;
    const size = e.currentTarget.dataset.size;
    const v = parseInt(e.detail.value) || 0;
    let idx = -1;
    for (let i = 0; i < this.data.orderLines.length; i++) {
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

  onLineQtyInput: function (e) {
    const idx = e.currentTarget.dataset.idx;
    const v = parseInt(e.detail.value) || 0;
    this.setData({ ['orderLines[' + idx + '].quantity']: v });
    this._recalcTotal();
    this._rebuildGrid();
  },

  /* ═══ 定价模式（对标PC端五模：工序 / 尺码 / 外发整件 / 报价 / 手动） ═══ */
  onPricingModeChange: function (e) {
    const idx = e.detail.value;
    this.setData({ pricingMode: PRICING_MODES[idx] || 'PROCESS', pricingModeIdx: idx });
    this._recalcComputedPrice();
  },
  onManualPriceInput: function (e) { this.setData({ manualOrderUnitPrice: e.detail.value }); },

  /* ═══ 提交 ═══ */
  /** 加载扩展字段配置（order 业务对象） */
  loadExtFields: function () {
    var self = this;
    fieldConfig.list('order', 'mp', false).then(function (fields) {
      self.setData({ extFields: fields || [] });
    }).catch(function () {
      // 字段配置加载失败不阻塞主流程
    });
  },

  /** 扩展字段值变更回调 */
  onExtFieldsChange: function (e) {
    // 存储最新的扩展字段值，提交时收集
    this._extFormValues = e.detail.allValues;
  },

  onSubmit: function () {
    if (this.data.submitting) return;
    const d = this.data;

    if (!(d.orderNo || '').trim()) return wx.showToast({ title: '请输入订单号', icon: 'none' });
    if (d.factoryMode === 'INTERNAL' && !d.orgUnitId) return wx.showToast({ title: '请选择部门', icon: 'none' });
    if (d.factoryMode === 'EXTERNAL' && !d.factoryId) return wx.showToast({ title: '请选择工厂', icon: 'none' });
    if (!d.plannedStartDate) return wx.showToast({ title: '请选下单时间', icon: 'none' });
    if (!d.plannedEndDate) return wx.showToast({ title: '请选订单交期', icon: 'none' });

    let hasQ = false;
    for (let i = 0; i < d.orderLines.length; i++) {
      if (d.orderLines[i].quantity > 0) { hasQ = true; break; }
    }
    if (!hasQ) return wx.showToast({ title: '请填写下单数量', icon: 'none' });

    let up = parseFloat(d.computedUnitPrice) || 0;
    if (d.pricingMode === 'MANUAL') {
      const mup = parseFloat(d.manualOrderUnitPrice) || 0;
      if (mup <= 0) return wx.showToast({ title: '请输入单价', icon: 'none' });
      up = mup;
    }
    if (up <= 0) return wx.showToast({ title: '请选择定价方式', icon: 'none' });

    const self = this;
    wx.showModal({
      title: '确认下单',
      content: '款号：' + d.styleNo + '\n数量：' + d.orderQuantity + '\n单价：¥' + up + '\n确认提交？',
      success: function (r) { if (r.confirm) self._doSubmit(up); },
    });
  },

  _doSubmit: function (unitPrice) {
    this.setData({ submitting: true });
    const d = this.data;

    const valid = d.orderLines.filter(function (l) { return l.quantity > 0; });
    const colors = []; const sizes = [];
    valid.forEach(function (l) {
      if (colors.indexOf(l.color) === -1) colors.push(l.color);
      if (sizes.indexOf(l.size) === -1) sizes.push(l.size);
    });

    const details = valid.map(function (l) {
      return { color: l.color, size: l.size, quantity: l.quantity, materialPriceSource: '物料采购系统', materialPriceAcquiredAt: new Date().toISOString(), materialPriceVersion: 'purchase.v1' };
    });

    const pricingObj = {
      pricingMode: d.pricingMode,
      processBasedUnitPrice: this._processTotal || 0,
      sizeBasedUnitPrice: this._processTotal || 0,
      totalCostUnitPrice: this._quotationTotalCost || this._processTotal || 0,
      quotationUnitPrice: this._quotationTotalPrice || 0,
      suggestedQuotationUnitPrice: this._quotationTotalPrice || 0,
      orderUnitPrice: unitPrice || 0,
      sizeLabels: d.selectedSizes || [],
    };

    const payload = {
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
      orderDetails: JSON.stringify({ lines: details, pricing: pricingObj }),
      factoryUnitPrice: unitPrice || 0,
      quotationUnitPrice: d.quotationTotalPrice > 0 ? d.quotationTotalPrice : null,
      orderUnitPrice: unitPrice || 0,
      orderUnitPriceType: d.pricingMode || null,
      pricingMode: d.pricingMode,
      plannedStartDate: d.plannedStartDate + 'T09:00:00',
      plannedEndDate: d.plannedEndDate + 'T18:00:00',
      scatterPricingMode: 'FOLLOW_ORDER',
      extJson: collectExtValues(this._extFormValues || {}, d.extFields, ''),
    };

    const self = this;
    api.production.createOrder(payload).then(function () {
      self.setData({ submitting: false });
      toast.success('下单成功');
      setTimeout(function () { wx.navigateBack(); }, 1500);
    }).catch(function (err) {
      self.setData({ submitting: false });
      toast.error((err && err.message) || '下单失败');
    });
  },
});
