const i18n = require('../../../../utils/i18n/index');
const NS = 'mp.orderForm.';
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
const BIZ_TYPE_LABELS = ['fobLabel', 'odmLabel', 'oemLabel', 'cmtLabel'];  // i18n 键后缀，applyLanguage 重建
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
          title: i18n.t(NS + 'cameraPermission', this._lang),
          content: i18n.t(NS + 'cameraPermMsg', this._lang),
          confirmText: i18n.t(NS + 'goSettings', this._lang),
          cancelText: i18n.t('common.cancel', this._lang),
          success: function (r) {
            if (r.confirm) wx.openSetting({});
          },
        });
        return;
      }
      // 真机可见：给出具体失败原因，便于定位
      wx.showToast({ title: i18n.t(NS + 'pickImageFailedPrefix', this._lang) + (msg || i18n.t(NS + 'unknownReason', this._lang)), icon: 'none', duration: 3000 });
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
            wx.showToast({ title: i18n.t(NS + 'pickImageFailed', this._lang), icon: 'none' });
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
    pricingModeLabels: [],  // applyLanguage 重建
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
    plateTypeOptions: [],  // applyLanguage 重建
    bizTypeLabels: BIZ_TYPE_LABELS,
    factoryList: [], orgUnitList: [], categoryOptions: [], userOptions: [],
    quickFillQty: 1, submitting: false,
    // D-517：通用可搜索选择器状态
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerRemote: false,
    pickerOptions: [], pickerValue: '', pickerKeyword: '',
    pickerPage: 1, pickerHasMore: false, pickerLoading: false,
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}），标签数组重建 */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        navTitle: i18n.t(NS + 'navTitle', lang),
        urgentTag: i18n.t(NS + 'urgentTag', lang),
        colorLabel: i18n.t(NS + 'colorW', lang),
        sizeLabel: i18n.t(NS + 'sizeWord', lang),
        selectAll: i18n.t(NS + 'selectAll', lang),
        addWord: i18n.t(NS + 'addWord', lang),
        uploadStyleImg: i18n.t(NS + 'uploadStyleImg', lang),
        orderInfoTitle: i18n.t(NS + 'orderInfoTitle', lang),
        orderNoLabel: i18n.t(NS + 'orderNoLabel', lang),
        genBtn: i18n.t(NS + 'genBtn', lang),
        producerLabel: i18n.t(NS + 'producerLabel', lang),
        internalFactory: i18n.t(NS + 'internalFactory', lang),
        outsourceFactory: i18n.t(NS + 'outsourceFactory', lang),
        deptLabel: i18n.t(NS + 'deptLabel', lang),
        factoryLabel: i18n.t(NS + 'factoryLabel', lang),
        timeDelivery: i18n.t(NS + 'timeDelivery', lang),
        orderTimeLabel: i18n.t(NS + 'orderTimeLabel', lang),
        deliveryTimeLabel: i18n.t(NS + 'deliveryTimeLabel', lang),
        normalWord: i18n.t(NS + 'normalWord', lang),
        bizInfoTitle: i18n.t(NS + 'bizInfoTitle', lang),
        customerLabel: i18n.t(NS + 'customerLabel', lang),
        categoryLabel: i18n.t(NS + 'categoryLabel', lang),
        firstRepeatLabel: i18n.t(NS + 'firstRepeatLabel', lang),
        orderTypeLabel: i18n.t(NS + 'orderTypeLabel', lang),
        patternMakerLabel: i18n.t(NS + 'patternMakerLabel', lang),
        merchLabel: i18n.t(NS + 'merchLabel', lang),
        orderQtyLabel: i18n.t(NS + 'orderQtyLabel', lang),
        devColorsLabel: i18n.t(NS + 'devColorsLabel', lang),
        devSizesLabel: i18n.t(NS + 'devSizesLabel', lang),
        selectedWord: i18n.t(NS + 'selectedWord', lang),
        colorUnit: i18n.t(NS + 'colorUnit', lang),
        sizeUnit: i18n.t(NS + 'sizeUnit', lang),
        comboWord: i18n.t(NS + 'comboWord', lang),
        noColorHint: i18n.t(NS + 'noColorHint', lang),
        sizeWord: i18n.t(NS + 'sizeWord', lang),
        noSizeHint: i18n.t(NS + 'noSizeHint', lang),
        batchFill: i18n.t(NS + 'batchFill', lang),
        matrixHint: i18n.t(NS + 'matrixHint', lang),
        fillAllBtn: i18n.t(NS + 'fillAllBtn', lang),
        clearBtn: i18n.t(NS + 'clearBtn', lang),
        sizeTotalLabel: i18n.t(NS + 'sizeTotalLabel', lang),
        pickSizeFirst: i18n.t(NS + 'pickSizeFirst', lang),
        pickColorFirst: i18n.t(NS + 'pickColorFirst', lang),
        pricingLabel: i18n.t(NS + 'pricingLabel', lang),
        modeLabel: i18n.t(NS + 'modeLabel', lang),
        unitPriceLabel: i18n.t(NS + 'unitPriceLabel', lang),
        totalQtyLabel: i18n.t(NS + 'totalQtyLabel', lang),
        closeBtn: i18n.t(NS + 'closeBtn', lang),
        noSavedCombo: i18n.t(NS + 'noSavedCombo', lang),
        coverBtn: i18n.t(NS + 'coverBtn', lang),
        appendBtn: i18n.t(NS + 'appendBtn', lang),
        cancel: i18n.t('common.cancel', lang),
        submitting: i18n.t('common.submitting', lang),
        styleChar: i18n.t(NS + 'styleChar', lang),
        noStyleNo: i18n.t(NS + 'noStyleNo', lang),
        noProfileOrder: i18n.t(NS + 'noProfileOrder', lang),
        inputStyleNoPh: i18n.t(NS + 'inputStyleNoPh', lang),
        inputStyleNmPh: i18n.t(NS + 'inputStyleNmPh', lang),
        autoGenPh: i18n.t(NS + 'autoGenPh', lang),
        pickDeptPh: i18n.t(NS + 'pickDeptPh', lang),
        pickFactoryPh: i18n.t(NS + 'pickFactoryPh', lang),
        pickDatePh: i18n.t(NS + 'pickDatePh', lang),
        optionalPh: i18n.t(NS + 'optionalPh', lang),
        optionalSearch: i18n.t(NS + 'optionalSearch', lang),
        autoJudgeW: i18n.t(NS + 'autoJudgeW', lang),
        colorPastePh: i18n.t(NS + 'colorPastePh', lang),
        sizePastePh: i18n.t(NS + 'sizePastePh', lang),
        notFetched: i18n.t(NS + 'notFetched', lang),
        countUnit2: i18n.t(NS + 'countUnit2', lang),
        libWord: i18n.t(NS + 'libWord', lang),
        pieceW3: i18n.t(NS + 'pieceW3', lang),
        confirmOrderW: i18n.t(NS + 'confirmOrderBtn', lang),
        totalLabelW: i18n.t(NS + 'totalLabelW', lang),
      },
      bizTypeLabels: BIZ_TYPE_LABELS.map(function (k) { return i18n.t(NS + k, lang); }),
      pricingModeLabels: [
        i18n.t(NS + 'priceProcess', lang), i18n.t(NS + 'priceSize', lang),
        i18n.t(NS + 'priceOutWhole', lang), i18n.t(NS + 'priceQuote', lang), i18n.t(NS + 'priceManual', lang)
      ],
      plateTypeOptions: [i18n.t(NS + 'priceAuto', lang), i18n.t(NS + 'firstOrder', lang), i18n.t(NS + 'repeatOrder', lang)],
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad: function (opts) {
    this.applyLanguage(i18n.getLanguage());
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
      if (opts.length) opts.unshift({ id: '', companyName: i18n.t(NS + 'noneOption', this._lang) });
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

  /* ═══ D-517：通用可搜索选择器 ═══
     原先是原生 <picker>：没有搜索框，工厂/人员/客户一多只能一路滚，
     而且人员只加载前 200 条 —— 现在工厂/人员走**远程关键字搜索 + 分页**，部门/客户本地搜索。 */
  _PICKER_CONF: {
    orgUnit: { title: i18n.t(NS + 'pickDept', this._lang), remote: false },
    factory: { title: i18n.t(NS + 'pickFactory', this._lang), remote: true },
    customer: { title: i18n.t(NS + 'pickCustomer', this._lang), remote: false },
    patternMaker: { title: i18n.t(NS + 'pickPatternMaker', this._lang), remote: true },
    merchandiser: { title: i18n.t(NS + 'pickMerch', this._lang), remote: true },
  },
  _PICKER_SIZE: 20,

  _openPickerByKey: function (e) {
    var key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    var conf = this._PICKER_CONF[key];
    if (!conf) return;
    var value = '';
    if (key === 'orgUnit') value = this.data.orgUnitId || '';
    else if (key === 'factory') value = this.data.factoryId || '';
    else if (key === 'customer') value = this.data.customerId || '';
    else if (key === 'patternMaker') value = this._patternMakerId || '';
    else if (key === 'merchandiser') value = this._merchandiserId || '';
    this.setData({
      pickerKey: key,
      pickerTitle: conf.title,
      pickerRemote: conf.remote,
      pickerValue: value,
      pickerKeyword: '',
      pickerPage: 1,
      pickerHasMore: false,
      pickerLoading: false,
      // 本地模式直接给全量（远程模式打开时组件会以空关键字触发 search 拉第一页）
      pickerOptions: conf.remote ? [] : this._localPickerOptions(key),
      pickerVisible: true,
    });
  },

  _localPickerOptions: function (key) {
    if (key === 'orgUnit') {
      return (this.data.orgUnitList || []).map(function (d) {
        return { label: d.name || '', value: String(d.id || '') };
      }).filter(function (o) { return o.value; });
    }
    if (key === 'customer') {
      // 「（不选）」的 id 为空 → 选中即清空客户
      return (this.data.customerList || []).map(function (c) {
        return { label: c.companyName || '', value: String(c.id || '') };
      }).filter(function (o) { return o.label; });
    }
    return [];
  },

  /** 远程搜索：关键字变化（组件内已防抖），拉第 1 页 */
  onPickerSearch: function (e) {
    if (!this.data.pickerRemote) return;
    var kw = (e && e.detail && e.detail.keyword) || '';
    var self = this;
    this.setData({ pickerKeyword: kw, pickerPage: 1 });
    this._fetchPickerOptions(this.data.pickerKey, kw, 1, function (list, hasMore) {
      self.setData({ pickerOptions: list, pickerHasMore: hasMore, pickerLoading: false });
    });
  },

  /** 远程分页：滚到底追加下一页 */
  onPickerLoadMore: function () {
    if (!this.data.pickerRemote || !this.data.pickerHasMore || this.data.pickerLoading) return;
    var self = this;
    var next = (this.data.pickerPage || 1) + 1;
    this.setData({ pickerPage: next });
    this._fetchPickerOptions(this.data.pickerKey, this.data.pickerKeyword, next, function (list, hasMore) {
      self.setData({
        pickerOptions: (self.data.pickerOptions || []).concat(list),
        pickerHasMore: hasMore,
        pickerLoading: false,
      });
    });
  },

  /**
   * 远程取数：工厂走 factoryName 关键字；人员走 name 关键字（后端均为 LIKE）
   * @param {Function} cb (list, hasMore)
   */
  _fetchPickerOptions: function (key, kw, page, cb) {
    var SIZE = this._PICKER_SIZE;
    var self = this;
    this.setData({ pickerLoading: true });
    var fail = function (err) {
      console.error('[order-create] 选择器加载失败', key, err && (err.errMsg || err.message || err));
      self.setData({ pickerLoading: false });
      cb([], false);
    };
    var params = { page: page, pageSize: SIZE };
    if (kw) {
      if (key === 'factory') params.factoryName = kw;
      else params.name = kw;
    }
    var req = (key === 'factory')
      ? api.factory.list(params)
      : api.system.listUsers(params);
    req.then(function (res) {
      var records = (res && res.records) || (Array.isArray(res) ? res : []);
      var list = records.map(function (r) {
        if (key === 'factory') {
          return { label: r.factoryName || r.name || '', value: String(r.id || '') };
        }
        return { label: r.name || r.username || '', value: String(r.id || '') };
      }).filter(function (o) { return o.label && o.value; });
      self.setData({ pickerLoading: false });
      cb(list, records.length >= SIZE);
    }).catch(fail);
  },

  _onPickerSelectByKey: function (e) {
    var key = this.data.pickerKey;
    var d = (e && e.detail) || {};
    var value = d.value || '';
    var label = d.label || '';
    if (key === 'orgUnit') {
      this.setData({ orgUnitId: value, orgUnitName: label });
    } else if (key === 'factory') {
      this.setData({ factoryId: value, factoryName: label });
    } else if (key === 'customer') {
      // value 为空 = 选中「（不选）」→ 清空
      this.setData({ customerId: value, company: value ? label : '' });
    } else if (key === 'patternMaker') {
      this._patternMakerId = value;
      this.setData({ patternMaker: label });
    } else if (key === 'merchandiser') {
      this._merchandiserId = value;
      this.setData({ merchandiser: label });
    }
  },

  onStartDateChange: function (e) { this.setData({ plannedStartDate: e.detail.value }); },
  onEndDateChange: function (e) { this.setData({ plannedEndDate: e.detail.value }); },

  onUrgencyTap: function (e) { this.setData({ urgencyLevel: e.currentTarget.dataset.v }); },

  onCompanyInput: function (e) { this.setData({ company: e.detail.value }); },

  // D-517：原 onCustomerChange / onPatternMakerChange / onMerchandiserChange
  // 随原生 <picker> 一并下线（改由 onPickerSelect 统一处理），保留手输兜底可能用到的输入回调

  onMerchandiserInput: function (e) { this.setData({ merchandiser: e.detail.value }); },

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

  onPatternMakerInput: function (e) { this.setData({ patternMaker: e.detail.value }); },

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
      attrLibTitle: target === 'color' ? i18n.t(NS + 'colorComboLabel', this._lang) : i18n.t(NS + 'sizeComboLabel', this._lang),
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
          groups.push({ id: d.id, name: d.dictLabel || d.dictCode || i18n.t(NS + 'unnamedWord', this._lang), values: values });
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
      title: (mode === 'replace' ? i18n.t(NS + 'coveredFmt', { n: values.length }, this._lang) : i18n.t(NS + 'appendedFmt', { n: values.length }, this._lang)),
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
    if (q <= 0) return wx.showToast({ title: i18n.t(NS + 'needPositiveQty', this._lang), icon: 'none' });
    const lines = this.data.orderLines.map(function (l) { return { color: l.color, size: l.size, quantity: q }; });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: i18n.tf(NS + 'filledFmt', { n: lines.length }, this._lang), icon: 'none' });
  },

  /** 按行铺量：点左侧颜色格 → 该颜色所有码数填同一数量 */
  onRowFill: function (e) {
    const color = e.currentTarget.dataset.color;
    const q = this.data.quickFillQty;
    if (q <= 0) return wx.showToast({ title: i18n.t(NS + 'needPositiveQty', this._lang), icon: 'none' });
    const lines = this.data.orderLines.map(function (l) {
      return l.color === color ? { color: l.color, size: l.size, quantity: q } : l;
    });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: color + ' ' + i18n.t(NS + 'filledWord', this._lang) + ' ' + q, icon: 'none' });
  },

  /** 按列铺量：点表头码数格 → 该码数所有颜色填同一数量 */
  onColFill: function (e) {
    const size = e.currentTarget.dataset.size;
    const q = this.data.quickFillQty;
    if (q <= 0) return wx.showToast({ title: i18n.t(NS + 'needPositiveQty', this._lang), icon: 'none' });
    const lines = this.data.orderLines.map(function (l) {
      return l.size === size ? { color: l.color, size: l.size, quantity: q } : l;
    });
    this.setData({ orderLines: lines });
    this._recalcTotal();
    this._rebuildGrid();
    wx.showToast({ title: size + ' ' + i18n.t(NS + 'filledWord', this._lang) + ' ' + q, icon: 'none' });
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

    if (!(d.orderNo || '').trim()) return wx.showToast({ title: i18n.t(NS + 'inputOrderNo', this._lang), icon: 'none' });
    if (d.factoryMode === 'INTERNAL' && !d.orgUnitId) return wx.showToast({ title: i18n.t(NS + 'pickDeptReq', this._lang), icon: 'none' });
    if (d.factoryMode === 'EXTERNAL' && !d.factoryId) return wx.showToast({ title: i18n.t(NS + 'pickFactoryReq', this._lang), icon: 'none' });
    if (!d.plannedStartDate) return wx.showToast({ title: i18n.t(NS + 'pickOrderTime', this._lang), icon: 'none' });
    if (!d.plannedEndDate) return wx.showToast({ title: i18n.t(NS + 'pickDeliveryTime', this._lang), icon: 'none' });

    let hasQ = false;
    for (let i = 0; i < d.orderLines.length; i++) {
      if (d.orderLines[i].quantity > 0) { hasQ = true; break; }
    }
    if (!hasQ) return wx.showToast({ title: i18n.t(NS + 'fillOrderQty', this._lang), icon: 'none' });

    let up = parseFloat(d.computedUnitPrice) || 0;
    if (d.pricingMode === 'MANUAL') {
      const mup = parseFloat(d.manualOrderUnitPrice) || 0;
      if (mup <= 0) return wx.showToast({ title: i18n.t(NS + 'inputPrice', this._lang), icon: 'none' });
      up = mup;
    }
    if (up <= 0) return wx.showToast({ title: i18n.t(NS + 'pickPricing', this._lang), icon: 'none' });

    const self = this;
    wx.showModal({
      title: i18n.t(NS + 'confirmOrderBtn', this._lang),
      content: i18n.tf(NS + 'confirmFmt', { style: d.styleNo, qty: d.orderQuantity, price: up }, this._lang),
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
      return { color: l.color, size: l.size, quantity: l.quantity, materialPriceSource: i18n.t(NS + 'materialSysName', this._lang), materialPriceAcquiredAt: new Date().toISOString(), materialPriceVersion: 'purchase.v1' };
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
      wx.showToast({ title: i18n.t(NS + 'orderOk', this._lang), icon: 'success' });
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
      wx.showToast({ title: (err && err.message) || i18n.t(NS + 'orderFail', this._lang), icon: 'none', duration: 3000 });
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
      wx.showToast({ title: i18n.t(NS + 'coverSaveFail', this._lang), icon: 'none', duration: 3000 });
      return null;
    });
  },
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
      pickerTitle: ds.title || i18n.t(NS + 'pleaseSelectW', this._lang),
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
