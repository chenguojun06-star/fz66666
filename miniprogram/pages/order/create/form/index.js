const api = require('../../../../utils/api');
const { splitStyleOptions, mergeDistinctOptions } = require('../../../../utils/styleOptions');
const { sortSizeNames } = require('../../../../utils/sizeUtils');

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
const BIZ_TYPE_LABELS = ['FOB 离岸价', 'ODM 原厂设计', 'OEM 代工生产', 'CMT 来料加工'];
const PRICING_MODES = ['PROCESS', 'SIZE', 'COST', 'QUOTE', 'MANUAL'];
const PROD_DEPT_KEYWORDS = ['生产', '车间', '裁剪', '缝制', '后整', '工序', '车缝', '尾部', '整烫', '包装', '质检', '工艺', '班组', '产线', '绣花', '印花', '洗水', '组'];

Page({
  onCoverPreview: function (e) {
    const url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  /**
   * 无资料下单：在表单页内选填上传款式图（D-291）
   * 选完写入 coverImage，提交成功后复用 _persistCoverImage 上传入库（t_order_image）。
   * ★ wx.chooseMedia 优先（wx.chooseImage 已弃用，真机会静默无效），
   *   失败自动降级 chooseImage 兜底；取消不提示；权限被拒引导去设置。
   */
  onPickNoDataCover: function () {
    const self = this;
    // ★ 关键：调用 chooseMedia 前强制清除所有残留 toast/loading。
    //   灰度基础库下，残留的原生提示条会压住相册选择器，导致 chooseMedia/chooseImage
    //   静默无响应（订单备注/扫码质检无此问题，正是因为调用前没有残留 toast）。
    if (wx.hideToast) wx.hideToast();
    if (wx.hideLoading) wx.hideLoading();
    console.log('[无资料下单] 点击款式图上传, chooseMedia=', !!wx.chooseMedia);
    const onPicked = function (tempPath) {
      if (!tempPath) return;
      console.log('[无资料下单] 已选图片:', tempPath);
      self.setData({ coverImage: tempPath });
    };
    const onFail = function (err) {
      const msg = (err && err.errMsg) || '';
      console.log('[无资料下单] chooseMedia失败:', msg);
      if (msg.indexOf('cancel') !== -1) return;
      if (msg.indexOf('auth') !== -1 || msg.indexOf('deny') !== -1 || msg.indexOf('permission') !== -1) {
        wx.showModal({
          title: '相机/相册权限',
          content: '需要相机或相册权限才能上传款式图片，请在设置中允许',
          confirmText: '去设置',
          cancelText: '取消',
          success: function (r) {
            if (r.confirm) wx.openSetting({});
          },
        });
        return;
      }
      // 真机可见：给出具体失败原因，便于定位
      wx.showToast({ title: '选择图片失败：' + (msg || '未知原因'), icon: 'none', duration: 3000 });
      // 其他失败：降级 wx.chooseImage 再试一次（真机调试模式等兼容场景）
      if (wx.chooseImage) {
        wx.chooseImage({
          count: 1,
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
          success: function (res) {
            onPicked(res.tempFilePaths && res.tempFilePaths[0]);
          },
          fail: function (err2) {
            const msg2 = (err2 && err2.errMsg) || '';
            if (msg2.indexOf('cancel') !== -1) return;
            wx.showToast({ title: '选择图片失败', icon: 'none' });
          },
        });
        return;
      }
    };

    // ★ 与全站其他 7 处选图入口保持一致：直接调 chooseMedia，不做超时降级。
    //   超时降级会在用户正慢慢翻相册时（>2.5s）误触发，又弹一次选择器/错误提示，
    //   造成"相册能弹却提示基础库异常"的误报。仅在 chooseMedia 明确 fail 时才降级。
    if (wx.chooseMedia) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: function (res) {
          const files = (res && res.tempFiles) || [];
          onPicked(files[0] && files[0].tempFilePath);
        },
        fail: function (err) {
          onFail(err);
        },
      });
    } else {
      onFail({ errMsg: 'chooseMedia not supported' });
    }
  },

  onDeleteNoDataCover: function () {
    this.setData({ coverImage: '' });
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
    customerId: '', customerList: [],
    plateType: '', plateTypeLabel: '',
    orderBizType: '', orderBizTypeLabel: '',
    patternMaker: '', merchandiser: '',
    pricingMode: 'PROCESS', pricingModeIdx: 0,
    pricingModeLabels: ['工序单价', '尺码单价', '外发整件', '报价单价', '手动单价'],
    manualOrderUnitPrice: '',
    orderQuantity: 0, computedUnitPrice: 0,
    selectedColors: [], selectedSizes: [],
    orderLines: [],
    // gridRows: [{color, cells:[{size,quantity}], total}]  行小计挂在 row.total
    // sizeTotals: [{size, total}]                          列小计（码数合计）
    gridRows: [], gridSizes: [], sizeTotals: [],
    colorInput: '', sizeInput: '',
    colorOptions: [], sizeOptions: [],
    // chips 渲染数据：{name, selected}——在 JS 里算好选中态，
    // WXML 只读字段（WXML 表达式的 .indexOf() 方法调用不可靠，
    // 曾导致选中 class 不生效、看不出有没有选）
    colorChips: [], sizeChips: [],
    // 基础属性库（成组预设，读 t_dict 的 color_group / size_group）
    attrLibOpen: false, attrLibTarget: '', attrLibTitle: '', attrLibGroups: [],
    plateTypeOptions: ['自动判断', '首单', '翻单'],
    bizTypeLabels: BIZ_TYPE_LABELS,
    factoryList: [], orgUnitList: [], categoryOptions: [], userOptions: [],
    quickFillQty: 1, submitting: false,
  },

  onLoad: function (opts) {
    var isNoData = opts.noData === 'true';
    var colors = [];
    var sizes = [];
    var coverImage = '';

    if (isNoData) {
      // 无资料下单有两条路径：
      //   方式一（上传图片）→ 传 tempImage（本地临时文件 wxfile://）
      //   方式二（选已有款式）→ 传 coverImage（款式网络图）
      // 两条都要拿到封面，tempImage 作为兜底
      coverImage = decodeURIComponent(opts.coverImage || opts.tempImage || '');
    } else {
      // 有资料下单：使用款式的封面图
      coverImage = decodeURIComponent(opts.coverImage || '');
      // ★ 必须用 splitStyleOptions 智能切分：
      //   款式 size 字段可能是旧 "/"-拼接（如 "L(170/84)/XL(175/88)"），
      //   单纯按 "," 切会整段变成一个码数，页面上显示成一坨。
      colors = splitStyleOptions(decodeURIComponent(opts.colors || ''));
      sizes = splitStyleOptions(decodeURIComponent(opts.sizes || ''));
      // 码数按小→大排序，矩阵列顺序整齐（与 PC 端 sortSizeWeight 同向）
      sizes = sortSizeNames(sizes);
    }

    this.setData({
      styleId: decodeURIComponent(opts.styleId || ''),
      styleNo: decodeURIComponent(opts.styleNo || ''),
      styleName: decodeURIComponent(opts.styleName || ''),
      productCategory: decodeURIComponent(opts.category || ''),
      coverImage: coverImage,
      isNoData: isNoData,
      plannedStartDate: today(),
      plannedEndDate: daysLater(7),
      colorOptions: colors,
      sizeOptions: sizes,
      selectedColors: colors.slice(),
      selectedSizes: sizes.slice(),
    });

    if (!isNoData && colors.length && sizes.length) { this._rebuildLines(); }
    // 初始化 chips 选中态（无资料下单时 options 为空，也要保证字段就绪）
    this._syncChips();

    // 注意：这里不能再弹 toast 做"进入无资料下单"的版本确认——
    // 灰度基础库下 toast 未消失时调 chooseMedia 会压住相册选择器（曾复现），
    // 用户看到提示后立刻点 ➕ 上传会静默失败。版本确认已由截图里
    // 「上传款式图」大按钮 + CUT 前缀单号承担，无需 toast。

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

  /**
   * 同步 chips 选中态到渲染数据。
   * 单点收敛：色/码变化的入口（添加/toggle/全选/清空/属性库）最终都走
   * _rebuildLines 或 onClearSelection，在它们末尾调用本方法即可全覆盖。
   */
  _syncChips: function () {
    const selC = this.data.selectedColors;
    const selS = this.data.selectedSizes;
    const toChips = function (options, selected) {
      return (options || []).map(function (name) {
        return { name: name, selected: selected.indexOf(name) !== -1 };
      });
    };
    this.setData({
      colorChips: toChips(this.data.colorOptions, selC),
      sizeChips: toChips(this.data.sizeOptions, selS),
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
    this._syncChips();
  },

  _recalcTotal: function () {
    let t = 0;
    this.data.orderLines.forEach(function (l) { t += l.quantity || 0; });
    this.setData({ orderQuantity: t });
  },

  _rebuildGrid: function () {
    const cs = this.data.selectedColors; const ss = this.data.selectedSizes;
    const lines = this.data.orderLines;
    const qtyOf = function (c, s) {
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].color === c && lines[i].size === s) return lines[i].quantity || 0;
      }
      return 0;
    };

    // 行小计直接挂在 row 上（WXML 用 row.total 读取，避免动态数组索引的兼容风险）
    const rows = [];
    cs.forEach(function (c) {
      const cells = [];
      let rowSum = 0;
      ss.forEach(function (s) {
        const q = qtyOf(c, s);
        rowSum += q;
        cells.push({ size: s, quantity: q });
      });
      rows.push({ color: c, cells: cells, total: rowSum });
    });

    // 码数合计（列小计），同样挂成 {size, total} 对象
    const sizeTotals = ss.map(function (s) {
      let sum = 0;
      cs.forEach(function (c) { sum += qtyOf(c, s); });
      return { size: s, total: sum };
    });

    this.setData({ gridRows: rows, gridSizes: ss, sizeTotals: sizeTotals });
  },

  /* ═══ 报价 + 工序 + 核价 → 五模定价 ═══ */

  _loadProcessPrices: function () {
    const self = this;
    const styleNo = self.data.styleNo;
    if (!styleNo) { self._processPrices = []; self._processTotal = 0; self._recalcComputedPrice(); return; }
    api.templateLibrary.processPriceTemplate(styleNo).then(function (res) {
      const content = (res && res.content) || (res && res.data && res.data.content) || {};
      const steps = Array.isArray(content.steps) ? content.steps : [];
      let total = 0;
      steps.forEach(function (p) { total += parseFloat(p.unitPrice || p.price || 0); });
      self._processPrices = steps;
      self._processTotal = total;
      self._recalcComputedPrice();
    }).catch(function () { self._processPrices = []; self._processTotal = 0; self._recalcComputedPrice(); });
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

  /* ═══ 工厂 / 部门 / 品类 / 人员（对标PC端） ═══ */

  _loadAux: function () {
    const self = this;

    // 客户：与 PC 端 CustomerSelect 同源（活跃客户列表），选不中时可手输兜底
    // 后端 listActive() 已按 tenantId + 工厂账号隔离，前端无需再过滤
    api.crm.listActiveCustomers().then(function (res) {
      const list = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      const opts = [];
      list.forEach(function (c) {
        const name = c.companyName || c.customerNo || '';
        if (name) opts.push({ id: c.id, companyName: name });
      });
      // 小程序 picker 没有 allowClear，插入「（不选）」让用户能清空已选客户
      if (opts.length) opts.unshift({ id: '', companyName: '（不选）' });
      self.setData({ customerList: opts });
    }).catch(function () {});

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
      // 有资料下单：款式未带品类时兜底字典第一项；
      // 无资料下单：保持「选填」，不默认选中（避免默认变成字典首项「毛衣」）
      if (!self.data.isNoData && data.length && !self.data.productCategory) {
        self.setData({ productCategory: data[0].dictLabel || data[0].label || '' });
      }
    }).catch(function () {});

    // 纸样师 / 跟单员：与 PC 端一致，从用户列表选择（不用手输）
    api.system.listUsers({ page: 1, pageSize: 200 }).then(function (res) {
      const list = (res && res.records) || (Array.isArray(res) ? res : []);
      const names = [];
      list.forEach(function (u) {
        const n = u.name || u.username || '';
        if (n && names.indexOf(n) === -1) names.push(n);
      });
      self.setData({ userOptions: names });
      if (!self.data.merchandiser) {
        api.system.getMe().then(function (me) {
          self.setData({ merchandiser: me.name || me.username || '' });
        }).catch(function () {});
      }
    }).catch(function () {
      api.system.getMe().then(function (me) {
        self.setData({ merchandiser: me.name || me.username || '' });
      }).catch(function () {});
    });
  },

  _genOrderNo: function () {
    const self = this;
    const isNoData = this.data.isNoData;

    // 无资料下单：本地生成 CUT 前缀单号（毫秒级时间戳），不再调 serial 接口——
    // 后端 SerialOrchestrator 只支持 STYLE_NO / ORDER_NO，传 CUTTING_TASK_NO 会 400；
    // 且格式与后端 CuttingOrderFactory 的兜底格式（CUT+yyyyMMddHHmmssSSS）一致
    if (isNoData) {
      self.setData({ orderNo: 'CUT' + this._ts() });
      return;
    }

    api.serial.generate('ORDER_NO').then(function (no) {
      self.setData({ orderNo: String(no || '') });
    }).catch(function () {
      // 如果API失败，使用时间戳生成订单号
      self.setData({ orderNo: 'PO' + self._ts() });
    });
  },

  /** 本地时间戳单号后缀：yyyyMMddHHmmssSSS（毫秒级） */
  _ts: function () {
    const d = new Date();
    return d.getFullYear()
      + String(d.getMonth() + 1).padStart(2, '0')
      + String(d.getDate()).padStart(2, '0')
      + String(d.getHours()).padStart(2, '0')
      + String(d.getMinutes()).padStart(2, '0')
      + String(d.getSeconds()).padStart(2, '0')
      + String(d.getMilliseconds()).padStart(3, '0');
  },

  /* ═══ 字段 bind ═══ */
  onOrderNoInput: function (e) { this.setData({ orderNo: e.detail.value }); },
  onAutoGenOrderNo: function () { this._genOrderNo(); },

  // 无资料下单：款号 / 款名手填
  onStyleNoInput: function (e) { this.setData({ styleNo: e.detail.value }); },
  onStyleNameInput: function (e) { this.setData({ styleName: e.detail.value }); },

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

  onCustomerChange: function (e) {
    const item = this.data.customerList[e.detail.value];
    if (!item) return;
    // 选中「（不选）」时 id 为空 → 清空客户
    this.setData({ customerId: item.id || '', company: item.id ? item.companyName : '' });
  },

  onCategoryChange: function (e) {
    const item = this.data.categoryOptions[e.detail.value];
    this.setData({ productCategory: item ? (item.dictLabel || item.label || '') : '' });
  },

  onPlateTypeChange: function (e) {
    const v = PLATE_MAP[e.detail.value];
    this.setData({ plateType: v, plateTypeLabel: v ? this.data.plateTypeOptions[e.detail.value] : '' });
  },

  onBizTypeChange: function (e) {
    const idx = e.detail.value;
    this.setData({
      orderBizType: BIZ_TYPES[idx] || '',
      orderBizTypeLabel: BIZ_TYPE_LABELS[idx] || '',
    });
  },

  onPatternMakerChange: function (e) {
    const item = this.data.userOptions[e.detail.value];
    this.setData({ patternMaker: item || '' });
  },
  onPatternMakerInput: function (e) { this.setData({ patternMaker: e.detail.value }); },

  onMerchandiserChange: function (e) {
    const item = this.data.userOptions[e.detail.value];
    this.setData({ merchandiser: item || '' });
  },
  onMerchandiserInput: function (e) { this.setData({ merchandiser: e.detail.value }); },

  /* ═══ 颜色 / 码数 ═══ */
  onColorInput: function (e) { this.setData({ colorInput: e.detail.value }); },
  onColorAdd: function () {
    const v = (this.data.colorInput || '').trim();
    if (!v) return;
    // 支持一次粘贴多个："黑色,白色" 或 "黑色/白色"
    const incoming = mergeDistinctOptions(splitStyleOptions(v));
    if (!incoming.length) return;
    const opts = mergeDistinctOptions(this.data.colorOptions, incoming);
    const sel = mergeDistinctOptions(this.data.selectedColors, incoming);
    this.setData({ colorOptions: opts, selectedColors: sel, colorInput: '' });
    this._rebuildLines();
  },

  onColorToggle: function (e) {
    const c = e.currentTarget.dataset.c;
    const sel = this.data.selectedColors.slice();
    const i = sel.indexOf(c);
    if (i === -1) sel.push(c); else sel.splice(i, 1);
    this.setData({ selectedColors: sel });
    this._rebuildLines();
  },

  onSizeInput: function (e) { this.setData({ sizeInput: e.detail.value }); },
  onSizeAdd: function () {
    const v = (this.data.sizeInput || '').trim();
    if (!v) return;
    // 支持一次粘贴多个码数（智能切分，兼容 "/" 拼接）
    const incoming = mergeDistinctOptions(splitStyleOptions(v));
    if (!incoming.length) return;
    const opts = mergeDistinctOptions(this.data.sizeOptions, incoming);
    const sel = mergeDistinctOptions(this.data.selectedSizes, incoming);
    this.setData({ sizeOptions: opts, selectedSizes: sel, sizeInput: '' });
    this._rebuildLines();
  },

  onSizeToggle: function (e) {
    const s = e.currentTarget.dataset.s;
    const sel = this.data.selectedSizes.slice();
    const i = sel.indexOf(s);
    if (i === -1) sel.push(s); else sel.splice(i, 1);
    this.setData({ selectedSizes: sel });
    this._rebuildLines();
  },

  /* ═══ 基础属性库（成组预设，与 PC 端 AttributeGroupLibraryModal 同源） ═══ */

  /**
   * 打开基础属性库
   *
   * ★ 数据来源：与 PC 端完全一致——复用系统字典 t_dict，
   *   dictType = color_group / size_group，dictValue = JSON 数组。
   *   **无独立后端接口**，所以小程序零后端改动即可接入。
   * ★ 本批只做「使用组合」（覆盖/追加），组合的增删改留在 PC 端。
   */
  onOpenAttrLib: function (e) {
    const target = e.currentTarget.dataset.target;
    const dictType = target === 'color' ? 'color_group' : 'size_group';
    const self = this;
    this.setData({
      attrLibOpen: true,
      attrLibTarget: target,
      attrLibTitle: target === 'color' ? '颜色组合' : '码数组合',
      attrLibGroups: [],
    });
    api.system.getDictList(dictType).then(function (res) {
      const data = Array.isArray(res) ? res : (res && res.records ? res.records : []);
      const groups = [];
      data.forEach(function (d) {
        // 与 PC 端 parseGroupValues 同逻辑：先试 JSON，失败走分隔符兼容
        let values = [];
        try {
          const parsed = JSON.parse(d.dictValue || '[]');
          if (Array.isArray(parsed)) {
            values = parsed.map(function (v) { return String(v == null ? '' : v).trim(); }).filter(Boolean);
          }
        } catch (err) {
          values = String(d.dictValue || '').split(/[,，、]/).map(function (v) { return v.trim(); }).filter(Boolean);
        }
        if (values.length) {
          groups.push({ id: d.id, name: d.dictLabel || d.dictCode || '未命名', values: values });
        }
      });
      self.setData({ attrLibGroups: groups });
    }).catch(function () {});
  },

  onCloseAttrLib: function () { this.setData({ attrLibOpen: false }); },

  /** 弹层内部拦截：同时用于 catchtouchmove（防滚动穿透）与 catchtap（防冒泡误关弹层） */
  onSheetTouchMove: function () { return false; },

  onApplyAttrGroup: function (e) {
    const idx = e.currentTarget.dataset.idx;
    const mode = e.currentTarget.dataset.mode;
    const group = this.data.attrLibGroups[idx];
    if (!group) return;
    const values = group.values;
    const isColor = this.data.attrLibTarget === 'color';

    if (isColor) {
      // replace=覆盖；append=在现有基础上追加（mergeDistinctOptions 自动去重）
      const base = mode === 'replace' ? [] : this.data.selectedColors;
      this.setData({
        selectedColors: mergeDistinctOptions(base, values),
        colorOptions: mergeDistinctOptions(this.data.colorOptions, values),
      });
    } else {
      const base = mode === 'replace' ? [] : this.data.selectedSizes;
      this.setData({
        selectedSizes: mergeDistinctOptions(base, values),
        sizeOptions: mergeDistinctOptions(this.data.sizeOptions, values),
      });
    }

    this.setData({ attrLibOpen: false });
    this._rebuildLines();
    wx.showToast({
      title: (mode === 'replace' ? '已覆盖为 ' : '已追加 ') + values.length + ' 项',
      icon: 'none',
    });
  },

  /* ═══ 批量选择 / 批量铺量（对齐PC端：全选颜色 / 全选码数 / 清空 / 全部铺量） ═══ */
  onSelectAllColors: function () {
    this.setData({ selectedColors: this.data.colorOptions.slice() });
    this._rebuildLines();
  },
  onSelectAllSizes: function () {
    this.setData({ selectedSizes: this.data.sizeOptions.slice() });
    this._rebuildLines();
  },
  onClearSelection: function () {
    this.setData({ selectedColors: [], selectedSizes: [], orderLines: [], orderQuantity: 0 });
    this._rebuildGrid();
    this._syncChips();
  },

  onQuickFillInput: function (e) { this.setData({ quickFillQty: parseInt(e.detail.value) || 0 }); },

  /** 全部铺量：所有已选色×已选码填同一数量 */
  onQuickFill: function () {
    const q = this.data.quickFillQty;
    if (q <= 0) return wx.showToast({ title: '铺量需大于 0', icon: 'none' });
    const lines = this.data.orderLines.map(function (l) { return { color: l.color, size: l.size, quantity: q }; });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: '已铺量 ' + lines.length + ' 个组合', icon: 'none' });
  },

  /** 按行铺量：点左侧颜色格 → 该颜色所有码数填同一数量 */
  onRowFill: function (e) {
    const color = e.currentTarget.dataset.color;
    const q = this.data.quickFillQty;
    if (q <= 0) return wx.showToast({ title: '铺量需大于 0', icon: 'none' });
    const lines = this.data.orderLines.map(function (l) {
      return l.color === color ? { color: l.color, size: l.size, quantity: q } : l;
    });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: color + ' 已铺 ' + q, icon: 'none' });
  },

  /** 按列铺量：点表头码数格 → 该码数所有颜色填同一数量 */
  onColFill: function (e) {
    const size = e.currentTarget.dataset.size;
    const q = this.data.quickFillQty;
    if (q <= 0) return wx.showToast({ title: '铺量需大于 0', icon: 'none' });
    const lines = this.data.orderLines.map(function (l) {
      return l.size === size ? { color: l.color, size: l.size, quantity: q } : l;
    });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: size + ' 已铺 ' + q, icon: 'none' });
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
      customerId: d.customerId || null, customerName: d.company || null,
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
    };

    const self = this;
    api.production.createOrder(payload).then(function () {
      self.setData({ submitting: false });
      wx.showToast({ title: '下单成功', icon: 'success' });
      // ★ 图片是建单后才上传的（wxfile 临时文件 → /api/common/upload → t_order_image），
      //   必须等上传完成再返回列表——原 1.5s 定时返回会在网络稍慢时销毁页面、
      //   中断 wx.uploadFile，导致用户上传的款式图丢失（"看起来传了其实没传上"）。
      //   8s 超时兜底：上传卡死也不让用户困在本页。
      const persistDone = self._persistCoverImage(d.orderNo) || Promise.resolve(null);
      const guard = new Promise(function (resolve) { setTimeout(resolve, 8000); });
      Promise.race([Promise.resolve(persistDone).catch(function () {}), guard]).then(function () {
        setTimeout(function () { wx.navigateBack(); }, 800);
      });
    }).catch(function (err) {
      self.setData({ submitting: false });
      wx.showToast({ title: (err && err.message) || '下单失败', icon: 'none', duration: 3000 });
    });
  },

  /**
   * 保存款式图到订单（t_order_image）
   *
   * ★ 为什么必须做：无资料下单没有款式档案，订单的 coverImage/styleImage
   *   是查询时按 styleNo 从款式档案动态回填的（@TableField(exist=false)，不入库）。
   *   无资料订单 styleNo 为空 → 三级回退全部落空 → 用户上传的图片永久丢失。
   *   所以必须显式把图片存进 t_order_image，由后端 fillCoverFromOrderImages 回填。
   *
   * ★ 时序：订单必须先创建成功（后端 addOrderImage 会校验订单存在），
   *   且图片失败只提示、不影响订单本身。
   */
  _persistCoverImage: function (orderNo) {
    const cover = this.data.coverImage;
    if (!orderNo || !cover) return;

    // 网络图（方式二：选已有款式）直接存；
    // 其余（chooseMedia/chooseImage 的本地临时路径：wxfile://、http://tmp/ 等）需先上传
    const isLocal = !/^https?:\/\//.test(cover);
    const uploadTask = isLocal
      ? api.common.uploadImage(cover)
      : Promise.resolve(cover);

    uploadTask.then(function (url) {
      if (!url) return null;
      return api.production.addOrderImage(orderNo, url, url).then(function () {
        console.log('[无资料下单] 款式图已保存到订单:', orderNo, url);
        return null;
      });
    }).catch(function () {
      wx.showToast({ title: '订单已创建，款式图保存失败，可在订单详情补传', icon: 'none', duration: 3000 });
      return null;
    });
  },
});
