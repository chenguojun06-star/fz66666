/**
 * 样衣仓库管理页
 * 功能：样衣库存列表、搜索、扫码、手动出入库管理
 */
const api = require('../../../../utils/api');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');
const i18n = require('../../../../utils/i18n/index');

/** 本页 i18n 命名空间前缀 */
const NS = 'mp.warehouse.sampleScanAction.';

/**
 * 样衣类型 → i18n 键后缀。
 * ⚠️ 左侧的 key（development / BODY_SAMPLE …）是**后端契约**，绝不能翻；
 *    只把展示文案换成键，运行时按当前语言取值。
 */
const SAMPLE_TYPE_KEYS = {
  'development': 'sampleTypeDevelopment',
  'pre_production': 'sampleTypePreProduction',
  'shipment': 'sampleTypeShipment',
  'sales': 'sampleTypeSales',
  'reference': 'sampleTypeReference',
  'photo': 'sampleTypePhoto',
  'confirmation': 'sampleTypeConfirmation',
  'pattern': 'sampleTypePattern',
  'fitting': 'sampleTypeFitting',
  'showroom': 'sampleTypeShowroom',
  'top': 'sampleTypeTop',
  'size_set': 'sampleTypeSizeSet',
  'seal': 'sampleTypeSeal',
  'BODY_SAMPLE': 'sampleTypeShipment',
  'FITTING_SAMPLE': 'sampleTypeFitting',
  'SALES_SAMPLE': 'sampleTypeSales',
  'REFERENCE_SAMPLE': 'sampleTypeReference',
  'DEVELOPMENT_SAMPLE': 'sampleTypeDevelopment',
  'PRODUCTION_SAMPLE': 'sampleTypeProduction',
  'PHOTO_SAMPLE': 'sampleTypePhoto',
  'SHOWROOM_SAMPLE': 'sampleTypeShowroom',
  'PATTERN_SAMPLE': 'sampleTypePatternGarment',
  'CONFIRMATION_SAMPLE': 'sampleTypeConfirmation',
  'PRE_PRODUCTION_SAMPLE': 'sampleTypePreProduction',
  'SHIPPING_SAMPLE': 'sampleTypeShipping',
  'TOP_SAMPLE': 'sampleTypeTop',
  'SIZE_SET_SAMPLE': 'sampleTypeSizeSet',
  'SEAL_SAMPLE': 'sampleTypeSeal',
};

function translateSampleType(type, lang) {
  if (!type) return '-';
  const key = SAMPLE_TYPE_KEYS[type];
  return key ? i18n.t(NS + key, lang) : type;
}

/** 库存状态筛选页签定义（label 运行时按语言展开，key 是本地筛选标识不是后端契约） */
const STATUS_TAB_DEFS = [
  { key: 'all',        labelKey: 'statusAll' },
  { key: 'in_stock',   labelKey: 'statusInStock' },
  { key: 'loaned_out', labelKey: 'statusLoanedOut' },
];

function localizeStatusTabs(lang, counts) {
  const c = counts || {};
  return STATUS_TAB_DEFS.map(function (d) {
    return { key: d.key, label: i18n.t(NS + d.labelKey, lang), pillClass: '', count: c[d.key] };
  });
}

/** 操作名 → i18n 键（用于「入库成功」这类拼接文案） */
const ACTION_LABEL_KEYS = { inbound: 'actionInbound', loan: 'actionLoan', return: 'actionReturn' };

function actionLabel(actionName, lang) {
  const key = ACTION_LABEL_KEYS[actionName];
  return key ? i18n.t(NS + key, lang) : actionName;
}

function buildImageUrl(url) {
  return getAuthedImageUrl(url || '');
}

Page({
  data: {
    // 列表模式 vs 详情模式
    viewMode: 'list',  // 'list' | 'detail'

    // 搜索相关
    searchKeyword: '',

    // 筛选器：库存状态 tabs（与 cutting/bundle-detail 等页面统一 filter-pill 风格）
    statusTabs: localizeStatusTabs(i18n.getLanguage()),
    activeStatus: 'all',

    // 列表数据
    stockList: [],
    filteredStockList: [],   // 按 activeStatus 本地过滤后的渲染列表
    stockListLoading: false,
    stockListError: '',
    hasMore: true,
    page: 1,
    pageSize: 20,
    
    // 详情数据
    currentStock: null,
    styleNo: '',
    color: '',
    size: '',
    loading: false,
    submitting: false,
    errorMsg: '',
    successMsg: '',
    stockInfo: null,
    actions: [],
    showPrivacy: false,
    warehouseOptions: [],
    filteredWarehouseOptions: [],
    warehouseSearchKey: '',
    warehouseAreaId: '',
    warehouseLocationCode: '',
    warehouse: '',
    locationOptions: [],
    // D-171：库位富对象（含已用/容量，选库位时可见数量避免超限）
    locationItems: [],
    filteredLocationItems: [],
    locationSearchKey: '',

    // === 借调目标选择 ===
    showLoanPicker: false,         // 借调弹窗显隐
    loanTargetType: 'person',      // 'person' | 'factory'
    factoryList: [],               // 外发工厂列表（全量）
    workerList: [],                // 员工列表（全量）
    filteredFactoryList: [],       // 搜索过滤后的工厂列表
    filteredWorkerList: [],        // 搜索过滤后的员工列表
    loanSearchKeyword: '',         // 搜索关键词
    loanTargetId: '',              // 选中目标ID
    loanTargetName: '',            // 选中目标名称
    loanQuantity: 1,               // 借调数量
    loanPickerLoading: false,
    // D-517：可搜索选择器（借调对象：员工/外发工厂，远程搜索 + 分页）
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerOptions: [], pickerValue: '',
    pickerRemote: false, pickerKeyword: '', pickerPage: 1, pickerHasMore: false, pickerLoading: false,

    // i18n：当前语言文案（由 applyLanguage 一次性写入，wxml 用 {{t.xxx}}）
    t: {},
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
    const styleNo = decodeURIComponent(options.styleNo || '');
    const color = decodeURIComponent(options.color || '');
    const size = decodeURIComponent(options.size || '');
    
    this._loadWarehouseOptions();
    
    if (!styleNo || !color || !size) {
      // 没有参数，显示列表
      this.setData({ viewMode: 'list' });
      this.loadStockList(true);
      return;
    }
    
    // 有参数，直接显示详情
    this.setData({ viewMode: 'detail', styleNo, color, size });
    this.querySample(styleNo, color, size);
    
    if (wx.onNeedPrivacyAuthorization) {
      this._privacyCb = (resolve) => {
        this._resolvePrivacy = resolve;
        this.setData({ showPrivacy: true });
      };
      wx.onNeedPrivacyAuthorization(this._privacyCb);
    }
  },

  onUnload() {
    if (wx.offNeedPrivacyAuthorization && this._privacyCb) {
      wx.offNeedPrivacyAuthorization(this._privacyCb);
    }
  },

  onShow() {
    this.applyLanguage(i18n.getLanguage());
    if (this.data.viewMode === 'list') {
      this.loadStockList(true);
    }
  },

  // ==================== 语言 ====================

  /**
   * 应用语言：一次性写入 t（wxml 用 {{t.xxx}}），并重算所有与语言相关的派生数据。
   * ⚠️ 导航标题只能运行时设置（app.json/页面 json 的静态值仅作首屏兜底）。
   */
  applyLanguage(language) {
    const lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;

    wx.setNavigationBarTitle({ title: i18n.t(NS + 'title', lang) });

    this.setData({
      t: {
        // ── 列表视图 ──
        listSearchPlaceholder: i18n.t(NS + 'listSearchPlaceholder', lang),
        loading: i18n.t('common.loading', lang),
        loadFailedRetry: i18n.t(NS + 'loadFailedRetry', lang),
        retry: i18n.t('common.retry', lang),
        noStock: i18n.t(NS + 'noStock', lang),
        noFilterResult: i18n.t(NS + 'noFilterResult', lang),
        loadMore: i18n.t('common.loadMore', lang),
        noMore: i18n.t('common.noMore', lang),
        styleNoLabel: i18n.t('common.styleNo', lang),
        colorLabel: i18n.t('common.color', lang),
        sizeLabel: i18n.t('common.size', lang),
        typeLabel: i18n.t('common.type', lang),
        piece: i18n.t('common.piece', lang),
        // ── 详情视图 ──
        detailTitle: i18n.t(NS + 'detailTitle', lang),
        scan: i18n.t('common.scan', lang),
        querying: i18n.t(NS + 'querying', lang),
        statusLabel: i18n.t(NS + 'statusLabel', lang),
        notInStock: i18n.t(NS + 'notInStock', lang),
        inStockTag: i18n.t(NS + 'statusInStock', lang),
        allLoanedOut: i18n.t(NS + 'allLoanedOut', lang),
        styleName: i18n.t(NS + 'styleName', lang),
        binLocation: i18n.t(NS + 'binLocation', lang),
        stockQty: i18n.t(NS + 'stockQty', lang),
        availableLabel: i18n.t('common.available', lang),
        loanedLabel: i18n.t(NS + 'loanedLabel', lang),
        totalQty: i18n.t(NS + 'totalQty', lang),
        loanedQty: i18n.t(NS + 'loanedQty', lang),
        pendingReturnQty: i18n.t(NS + 'pendingReturnQty', lang),
        scrappedQty: i18n.t(NS + 'scrappedQty', lang),
        activeLoans: i18n.t(NS + 'activeLoans', lang),
        borrower: i18n.t(NS + 'borrower', lang),
        quantityLabel: i18n.t('common.quantity', lang),
        timeLabel: i18n.t('common.time', lang),
        outboundLocationLabel: i18n.t(NS + 'outboundLocationLabel', lang),
        inboundWarehouseLabel: i18n.t(NS + 'inboundWarehouseLabel', lang),
        inboundLocationLabel: i18n.t(NS + 'inboundLocationLabel', lang),
        clear: i18n.t(NS + 'clear', lang),
        warehouseSearchPlaceholder: i18n.t(NS + 'warehouseSearchPlaceholder', lang),
        warehouseCodePlaceholder: i18n.t(NS + 'warehouseCodePlaceholder', lang),
        locationSearchPlaceholder: i18n.t(NS + 'locationSearchPlaceholder', lang),
        locationCodePlaceholder: i18n.t(NS + 'locationCodePlaceholder', lang),
        actionInbound: i18n.t(NS + 'actionInbound', lang),
        actionLoan: i18n.t(NS + 'actionLoan', lang),
        actionReturn: i18n.t(NS + 'actionReturn', lang),
        // ── 借调弹窗 ──
        loanPickerTitle: i18n.t(NS + 'loanPickerTitle', lang),
        loanToPerson: i18n.t(NS + 'loanToPerson', lang),
        loanToFactory: i18n.t(NS + 'loanToFactory', lang),
        loanQtyLabel: i18n.t(NS + 'loanQtyLabel', lang),
        loanSelectPerson: i18n.t(NS + 'loanSelectPerson', lang),
        loanSelectFactory: i18n.t(NS + 'loanSelectFactory', lang),
        cancel: i18n.t('common.cancel', lang),
        confirmLoan: i18n.t(NS + 'confirmLoan', lang),
      },
      // 派生数据（含文案）按新语言重算
      statusTabs: localizeStatusTabs(lang, this._countStatuses(this.data.stockList)),
      stockList: this._decorateStockList(this.data.stockList, lang),
      filteredStockList: this._decorateStockList(this.data.filteredStockList, lang),
      stockListError: this.data.stockListError ? i18n.t(NS + 'loadFailedRetry', lang) : '',
      stockInfo: this._decorateStockInfo(this.data.stockInfo, lang),
    });
    this._refreshDerivedTexts(lang);
  },

  onPullDownRefresh() {
    if (this.data.viewMode === 'list') {
      this.loadStockList(true).finally(() => {
        wx.stopPullDownRefresh();
      });
    } else {
      wx.stopPullDownRefresh();
    }
  },

  // ==================== 列表相关 ====================

  loadStockList(refresh = false) {
    if (this.data.stockListLoading) return Promise.resolve();
    
    const page = refresh ? 1 : this.data.page;
    
    this.setData({ 
      stockListLoading: true, 
      stockListError: refresh ? '' : this.data.stockListError,
      page: page
    });
    
    const params = {
      current: page,
      size: this.data.pageSize,
    };
    
    if (this.data.searchKeyword) {
      params.keyword = this.data.searchKeyword;
    }
    
    return api.sampleStock.list(params)
      .then((res) => {
        const data = res || {};

        const records = this._decorateStockList(data?.records || [], this._lang);
        const total = data?.total || records.length;

        const newStockList = refresh ? records : [...this.data.stockList, ...records];
        // 计算每个筛选 tab 的数量统计
        const statusTabs = this._computeStatusTabs(newStockList);
        // 按 activeStatus 过滤渲染列表
        const filteredStockList = newStockList.filter(s => this._matchesStatus(s));
        this.setData({
          stockList: newStockList,
          filteredStockList,
          statusTabs,
          hasMore: newStockList.length < total,
          page: page + 1,
          stockListLoading: false,
        });
      })
      .catch((err) => {
        console.error('[SampleStock] 加载列表失败', err);
        this.setData({
          stockListError: i18n.t(NS + 'loadFailedRetry', this._lang),
          stockListLoading: false,
        });
      });
  },

  /** 列表项装饰：图片 URL + 样衣类型文案 + 「借出 N」（语言相关，切语言时需重算） */
  _decorateStockList(list, lang) {
    return (list || []).map((item) => {
      const decorated = Object.assign({}, item);
      decorated._imageUrl = buildImageUrl(item.imageUrl || item.coverImage || '');
      decorated._sampleTypeLabel = translateSampleType(item.sampleType || '', lang);
      decorated._loanedText = item.loanedQuantity > 0
        ? i18n.tf(NS + 'loanedText', { qty: item.loanedQuantity }, lang)
        : '';
      return decorated;
    });
  },

  onSearchInput(e) {
    let keyword = (e.detail.value || '').trim();
    this.setData({ searchKeyword: keyword });
  },

  onSearchConfirm() {
    this.loadStockList(true);
  },

  onSearchClear() {
    this.setData({ searchKeyword: '' });
    this.loadStockList(true);
  },

  // 切换库存状态筛选 tab（本地过滤，不重新请求）
  onStatusTabTap(e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.activeStatus) return;
    const newFiltered = (this.data.stockList || []).filter(s => {
      const qty = s.quantity || 0;
      const loaned = s.loanedQuantity || 0;
      const available = qty - loaned;
      if (key === 'all') return true;
      if (key === 'in_stock') return available > 0;
      if (key === 'loaned_out') return available <= 0 && loaned > 0;
      return true;
    });
    this.setData({ activeStatus: key, filteredStockList: newFiltered });
  },

  // 判断单条 stock 是否匹配当前状态筛选
  _matchesStatus(stock) {
    const status = this.data.activeStatus;
    if (status === 'all') return true;
    const qty = stock.quantity || 0;
    const loaned = stock.loanedQuantity || 0;
    const available = qty - loaned;
    if (status === 'in_stock') return available > 0;
    if (status === 'loaned_out') return available <= 0 && loaned > 0;
    return true;
  },

  // 计算每个筛选 tab 的数量统计（label 按当前语言展开）
  _computeStatusTabs(list) {
    return localizeStatusTabs(this._lang, this._countStatuses(list));
  },

  /** 统计各状态条数（不产生文案，供 _computeStatusTabs / applyLanguage 共用） */
  _countStatuses(list) {
    const counts = { 'all': 0, 'in_stock': 0, 'loaned_out': 0 };
    (list || []).forEach(s => {
      counts['all']++;
      const available = (s.quantity || 0) - (s.loanedQuantity || 0);
      if (available > 0) counts['in_stock']++;
      else if ((s.loanedQuantity || 0) > 0) counts['loaned_out']++;
    });
    return counts;
  },

  onStockItemTap(e) {
    const stock = e.currentTarget.dataset.stock;
    if (!stock) return;
    
    const styleNo = stock.styleNo || '';
    const color = stock.color || '';
    const size = stock.size || '';
    
    this.setData({
      viewMode: 'detail',
      styleNo,
      color,
      size,
    });
    
    this.querySample(styleNo, color, size);
  },

  // ==================== 详情相关 ====================

  querySample(styleNo, color, size) {
    this.setData({ loading: true, errorMsg: '', successMsg: '', stockInfo: null, actions: [] });
    return api.sampleStock.scanQuery({ styleNo, color, size })
      .then((res) => {
        const d = res || {};
        // 计算统计：待归还数（未归还的借调单数） + 报废数（inventoryStatus=SCRAPPED 或 destroyTime 非空）
        const activeLoans = d.activeLoans || [];
        d.pendingReturnCount = activeLoans.length;
        // 报废数：当前后端 SampleStock 没有 scrappedQuantity 字段，按 inventoryStatus 推断
        // 如果该 SKU 已报废，整条记录视为报废，数量为 stock.quantity；否则 0
        const stock = d.stock || {};
        const isScrapped = stock.inventoryStatus === 'SCRAPPED'
          || stock.inventoryStatus === 'SCRAP'
          || !!stock.destroyTime;
        d.scrappedCount = isScrapped ? (stock.quantity || 0) : 0;
        // D-183：前端兜底——已有库存记录的样衣绝不显示「入库」（在库→借调、借出→归还），
        // 防御旧版云端后端 scanQuery 对在库样品误返回 inbound 动作
        const displayActions = d.found
          ? (d.actions || []).filter(function (a) { return a !== 'inbound'; })
          : (d.actions || []);
        this.setData({
          stockInfo: this._decorateStockInfo(d, this._lang),
          actions: displayActions,
          loading: false,
        });
        this._refreshDerivedTexts(this._lang);
      })
      .catch((err) => {
        console.error('[SampleScanAction] querySample error', err);
        this.setData({
          errorMsg: (err && (err.errMsg || err.message)) || i18n.t(NS + 'networkError', this._lang),
          loading: false,
        });
      });
  },

  /**
   * 详情装饰：图片 URL、样衣类型文案、各类「N 件」计数文案。
   * 这些字段都与语言相关，切语言时必须重算（applyLanguage 会再调一次）。
   */
  _decorateStockInfo(info, lang) {
    if (!info) return info;
    const out = Object.assign({}, info);
    if (out.stock) {
      const st = Object.assign({}, out.stock);
      st._imageUrl = buildImageUrl(st.imageUrl || st.coverImage || '');
      st._sampleTypeLabel = translateSampleType(st.sampleType || '', lang);
      st._qtyText = i18n.tf(NS + 'pcsText', { qty: st.quantity || 0 }, lang);
      st._loanedQtyText = i18n.tf(NS + 'pcsText', { qty: st.loanedQuantity || 0 }, lang);
      out.stock = st;
    }
    out._availableText = i18n.tf(NS + 'pcsText', { qty: out.availableQuantity || 0 }, lang);
    out.activeLoans = (out.activeLoans || []).map(function (ln) {
      return Object.assign({}, ln, {
        _qtyText: i18n.tf(NS + 'pcsText', { qty: ln.quantity || 0 }, lang),
      });
    });
    return out;
  },

  /** 依赖当前数据的带参文案（库存变化 / 切语言时都要刷新） */
  _refreshDerivedTexts(lang) {
    const available = (this.data.stockInfo && this.data.stockInfo.availableQuantity) || 0;
    this.setData({
      't.loanAvailableText': i18n.tf(NS + 'loanAvailableText', { qty: available }, lang),
    });
  },

  // 空操作：仅用于阻止事件冒泡（如弹窗内层 catchtap）
  noop() {},

  onRetry() {
    const { styleNo, color, size } = this.data;
    this.querySample(styleNo, color, size);
  },

  // ==================== 操作处理 ====================

  onInbound() {
    if (this.data.submitting) return;
    const { warehouseAreaId, warehouseLocationCode } = this.data;
    if (!warehouseAreaId) {
      wx.showToast({ title: i18n.t(NS + 'areaRequired', this._lang), icon: 'none' });
      return;
    }
    if (!warehouseLocationCode) {
      wx.showToast({ title: i18n.t(NS + 'locationRequired', this._lang), icon: 'none' });
      return;
    }
    wx.showModal({
      title: i18n.t(NS + 'confirmInbound', this._lang),
      content: i18n.tf(NS + 'confirmInboundText', {
        style: this.data.styleNo,
        color: this.data.color,
        size: this.data.size,
        warehouse: this.data.warehouse,
        location: warehouseLocationCode,
      }, this._lang),
      success: (modal) => {
        if (!modal.confirm) return;
        this._doAction('inbound', () =>
          api.sampleStock.inbound({
            styleNo: this.data.styleNo,
            color: this.data.color,
            size: this.data.size,
            quantity: 1,
            warehouseAreaId: warehouseAreaId,
            location: warehouseLocationCode,
          }),
        );
      },
    });
  },

  onLoan() {
    if (this.data.submitting) return;
    const stock = (this.data.stockInfo && this.data.stockInfo.stock) || {};
    const availableQty = this.data.stockInfo && this.data.stockInfo.availableQuantity
      ? this.data.stockInfo.availableQuantity : 0;
    if (availableQty <= 0) {
      wx.showToast({ title: i18n.t(NS + 'noAvailableForLoan', this._lang), icon: 'none' });
      return;
    }
    // 打开借调目标选择弹窗
    this.setData({
      showLoanPicker: true,
      loanTargetType: 'person',
      loanTargetId: '',
      loanTargetName: '',
      loanQuantity: 1,
      loanSearchKeyword: '',
      loanPickerLoading: false,
    });
    // D-517：员工/工厂改为「点选择行 → 按关键字远程搜索 + 分页」，不再一次性拉 200 条
    // （原先只能搜到前 200 条，第 201 个员工/工厂永远搜不到）
  },

  // 搜索过滤：员工/工厂
  onLoanSearchInput(e) {
    const keyword = ((e.detail.value || '') + '').trim().toLowerCase();
    this.setData({ loanSearchKeyword: keyword });
    this._filterLoanTargets(keyword);
  },

  onLoanSearchClear() {
    this.setData({ loanSearchKeyword: '' });
    this._filterLoanTargets('');
  },

  // 根据关键词过滤当前类型的列表
  _filterLoanTargets(keyword) {
    const { loanTargetType, factoryList, workerList } = this.data;
    if (!keyword) {
      this.setData({
        filteredFactoryList: factoryList,
        filteredWorkerList: workerList,
      });
      return;
    }
    if (loanTargetType === 'person') {
      const filtered = (workerList || []).filter(item => {
        const name = ((item.name || item.workerName || item.username || '') + '').toLowerCase();
        return name.includes(keyword);
      });
      this.setData({ filteredWorkerList: filtered });
    } else {
      const filtered = (factoryList || []).filter(item => {
        const name = ((item.factoryName || item.name || '') + '').toLowerCase();
        const contact = ((item.contactPerson || '') + '').toLowerCase();
        return name.includes(keyword) || contact.includes(keyword);
      });
      this.setData({ filteredFactoryList: filtered });
    }
  },

  // 切换借调目标类型
  onLoanTargetTypeChange(e) {
    const type = e.currentTarget.dataset.type;
    if (!type) return;
    this.setData({
      loanTargetType: type,
      loanTargetId: '',
      loanTargetName: '',
      loanSearchKeyword: '',
      filteredFactoryList: this.data.factoryList,
      filteredWorkerList: this.data.workerList,
    });
  },

  // 选择借调目标（旧列表直选，D-517 后改由 onPickerSelect 走可搜索选择器）
  onLoanTargetSelect(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ loanTargetId: id, loanTargetName: name });
  },

  /* ═══ D-517：借调对象可搜索选择器（远程关键字 + 分页） ═══
     员工走 /api/system/user/list 的 name，工厂走 /api/system/factory/list 的 factoryName（后端均为 LIKE） */
  _openPickerByKey(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (key !== 'loanTarget') return;
    const isPerson = this.data.loanTargetType === 'person';
    this.setData({
      pickerKey: key,
      pickerTitle: isPerson
        ? i18n.t(NS + 'selectLoanEmployee', this._lang)
        : i18n.t(NS + 'selectOutsourceFactory', this._lang),
      pickerRemote: true,
      pickerKeyword: '',
      pickerPage: 1,
      pickerHasMore: false,
      pickerLoading: false,
      pickerOptions: [],
      pickerValue: this.data.loanTargetId ? String(this.data.loanTargetId) : '',
      pickerVisible: true,
    });
  },

  onPickerSearch(e) {
    if (!this.data.pickerRemote) return;
    const kw = ((e && e.detail && e.detail.keyword) || '').trim();
    this.setData({ pickerKeyword: kw, pickerPage: 1 });
    this._fetchLoanOptions(kw, 1, (list, hasMore) => {
      this.setData({ pickerOptions: list, pickerHasMore: hasMore, pickerLoading: false });
    });
  },

  onPickerLoadMore() {
    if (!this.data.pickerRemote || !this.data.pickerHasMore || this.data.pickerLoading) return;
    const next = (this.data.pickerPage || 1) + 1;
    this.setData({ pickerPage: next });
    this._fetchLoanOptions(this.data.pickerKeyword, next, (list, hasMore) => {
      this.setData({
        pickerOptions: (this.data.pickerOptions || []).concat(list),
        pickerHasMore: hasMore,
        pickerLoading: false,
      });
    });
  },

  _fetchLoanOptions(kw, page, cb) {
    const SIZE = 20;
    const isPerson = this.data.loanTargetType === 'person';
    this.setData({ pickerLoading: true });
    const params = { page, pageSize: SIZE };
    if (kw) params[isPerson ? 'name' : 'factoryName'] = kw;
    const req = isPerson ? api.system.listUsers(params) : api.factory.list(params);
    req.then((res) => {
      const list = ((res && res.records) || (Array.isArray(res) ? res : [])).map((r) => (isPerson
        ? { label: r.name || r.workerName || r.username || '', value: String(r.id || '') }
        : { label: r.factoryName || r.name || '', value: String(r.id || '') }
      )).filter(o => o.label && o.value);
      this.setData({ pickerLoading: false });
      cb(list, ((res && res.records) || []).length >= SIZE);
    }).catch(() => {
      this.setData({ pickerLoading: false });
      cb([], false);
    });
  },

  _onPickerSelectByKey(e) {
    const d = (e && e.detail) || {};
    if (this.data.pickerKey !== 'loanTarget') return;
    this.setData({ loanTargetId: d.value || '', loanTargetName: d.label || '' });
  },

  // 借调数量输入
  onLoanQuantityInput(e) {
    let qty = parseInt(e.detail.value, 10);
    if (isNaN(qty) || qty < 1) qty = 1;
    const availableQty = this.data.stockInfo && this.data.stockInfo.availableQuantity
      ? this.data.stockInfo.availableQuantity : 1;
    if (qty > availableQty) qty = availableQty;
    this.setData({ loanQuantity: qty });
  },

  // 取消借调
  onLoanCancel() {
    this.setData({ showLoanPicker: false });
  },

  // 确认借调
  onLoanConfirm() {
    if (this.data.submitting) return;
    const { loanTargetType, loanTargetId, loanTargetName, loanQuantity } = this.data;
    if (!loanTargetId || !loanTargetName) {
      wx.showToast({ title: i18n.t(NS + 'selectLoanTargetRequired', this._lang), icon: 'none' });
      return;
    }
    const availableQty = this.data.stockInfo && this.data.stockInfo.availableQuantity
      ? this.data.stockInfo.availableQuantity : 0;
    if (loanQuantity > availableQty) {
      wx.showToast({ title: i18n.tf(NS + 'loanExceedText', { qty: availableQty }, this._lang), icon: 'none' });
      return;
    }
    const stock = (this.data.stockInfo && this.data.stockInfo.stock) || {};
    const userInfo = getApp().globalData.userInfo || {};

    // 构造借调参数（向后端 SampleLoan 实体字段对齐）
    const loanPayload = {
      sampleStockId: stock.id,
      borrower: userInfo.name || userInfo.username || '',  // 操作人（借出登记人）
      borrowerId: userInfo.id ? String(userInfo.id) : '',
      quantity: loanQuantity,
      lendToType: loanTargetType,                 // 'person' | 'factory'
      lendTo: loanTargetName,                     // 借入人姓名 或 借入工厂名
      lendToId: loanTargetId,                     // 借入人ID 或 借入工厂ID
      lendToFactoryId: loanTargetType === 'factory' ? loanTargetId : '',
    };

    wx.showModal({
      title: i18n.t(NS + 'confirmLoan', this._lang),
      content: i18n.tf(NS + 'confirmLoanText', { name: loanTargetName, qty: loanQuantity }, this._lang),
      success: (modal) => {
        if (!modal.confirm) return;
        this.setData({ showLoanPicker: false });
        this._doAction('loan', () => api.sampleStock.loan(loanPayload));
      },
    });
  },

  onReturn() {
    if (this.data.submitting) return;
    const loans = (this.data.stockInfo && this.data.stockInfo.activeLoans) || [];
    if (!loans.length) {
      wx.showToast({ title: i18n.t(NS + 'noLoanRecord', this._lang), icon: 'none' });
      return;
    }
    const loan = loans[0];
    wx.showModal({
      title: i18n.t(NS + 'confirmReturn', this._lang),
      content: i18n.tf(NS + 'confirmReturnText', {
        style: this.data.styleNo,
        color: this.data.color,
        size: this.data.size,
      }, this._lang),
      success: (modal) => {
        if (!modal.confirm) return;
        this._doAction('return', () =>
          api.sampleStock.returnSample({
            loanId: loan.id,
            quantity: loan.quantity || 1,
          }),
        );
      },
    });
  },

  _doAction(actionName, apiFn) {
    this.setData({ submitting: true, errorMsg: '', successMsg: '' });
    const lang = this._lang;
    const label = actionLabel(actionName, lang);
    const successText = i18n.tf(NS + 'actionSuccess', { action: label }, lang);
    return apiFn()
      .then(() => {
        wx.vibrateShort({ type: 'heavy' });
        wx.showToast({
          title: successText,
          icon: 'success',
          duration: 2000,
        });
        this.setData({
          submitting: false,
          successMsg: successText,
        });
        setTimeout(() => {
          this.querySample(this.data.styleNo, this.data.color, this.data.size);
        }, 800);
      })
      .catch((err) => {
        console.error(`[SampleScanAction] ${actionName} error`, err);
        this.setData({
          submitting: false,
          errorMsg: (err && (err.errMsg || err.message))
            || i18n.tf(NS + 'actionFailed', { action: label }, lang),
        });
      });
  },

  // ==================== 扫码 & 返回 ====================

  onScanCode() {
    wx.scanCode({
      success: (res) => {
        const code = res.result || '';
        this.parseAndQuery(code);
      },
      fail: (err) => {
        console.error('扫码失败', err);
      },
    });
  },

  parseAndQuery(code) {
    try {
      const data = JSON.parse(code);
      const qrType = String(data.type || '').trim().toLowerCase();
      const patternId = String(data.id || data.patternId || '').trim();
      // 情况1：仓库二维码（styleNo 必带；color/size 缺省按空处理）——D-517
      if (data.styleNo) {
        this.setData({
          viewMode: 'detail',
          styleNo: data.styleNo,
          color: data.color || '',
          size: data.size || '',
        });
        this.querySample(data.styleNo, data.color || '', data.size || '');
        return;
      }
      // 情况2：样衣生产码（历史标签只有 type+id）→ 反查款式信息再查库存出入库/借调/归还
      if (patternId && ['pattern', 'sample', 'pattern_production', 'patternproduction'].includes(qrType)) {
        this._resolvePatternAndQuery(patternId);
        return;
      }
    } catch (e) { /* 扫码解析异常，继续按空格分割逻辑 */ }
    
    const parts = code.trim().split(/\s+/);
    if (parts.length >= 3) {
      this.setData({
        viewMode: 'detail',
        styleNo: parts[0],
        color: parts[1],
        size: parts[2],
      });
      this.querySample(parts[0], parts[1], parts[2]);
      return;
    }
    
    wx.showToast({ title: i18n.t(NS + 'unrecognizedQr', this._lang), icon: 'none' });
  },

  // D-517：样衣生产码反查款式（GET /production/pattern/{id}）后按 styleNo+color+size 查库存
  _resolvePatternAndQuery(patternId) {
    this.setData({ viewMode: 'detail', loading: true, errorMsg: '', successMsg: '' });
    api.production.getPatternDetail(patternId)
      .then((detail) => {
        const styleNo = String((detail && (detail.styleNo || detail.style_no)) || '').trim();
        if (!styleNo) {
          wx.showToast({ title: i18n.t(NS + 'styleInfoNotFound', this._lang), icon: 'none' });
          this.setData({ viewMode: 'list', loading: false });
          return;
        }
        const color = String((detail && detail.color) || '').trim();
        const size = String((detail && detail.size) || '').trim();
        this.setData({ styleNo, color, size, loading: false });
        this.querySample(styleNo, color, size);
      })
      .catch(() => {
        wx.showToast({ title: i18n.t(NS + 'sampleQueryFailed', this._lang), icon: 'none' });
        this.setData({ viewMode: 'list', loading: false });
      });
  },

  onBackToList() {
    this.setData({ viewMode: 'list' });
    this.loadStockList(true);
  },

  // ==================== 仓库相关 ====================

  _loadWarehouseOptions() {
    return api.warehouse.listWarehouseAreas('SAMPLE')
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        if (list.length > 0) {
          const areaMap = {};
          const options = [];
          const sorted = list
            .filter((item) => item.areaName && item.id)
            .sort((a, b) => (a.sort || a.sortOrder || 0) - (b.sort || b.sortOrder || 0));
          for (const item of sorted) {
            options.push(item.areaName);
            areaMap[item.areaName] = item.id;
          }
          if (options.length > 0) {
            this.setData({
              warehouseOptions: options,
              filteredWarehouseOptions: this._filterListByKeyword(options, this.data.warehouseSearchKey),
            });
            this._warehouseAreaMap = areaMap;
          }
        }
      })
      .catch((e) => {
        console.warn('[SampleScanAction] 加载仓库选项失败', e);
      });
  },

  // D-171：仓库搜索（仓库多时快速定位）
  onWarehouseSearchInput(e) {
    this.setData({
      warehouseSearchKey: e.detail.value,
      filteredWarehouseOptions: this._filterListByKeyword(this.data.warehouseOptions, e.detail.value),
    });
  },

  _filterListByKeyword(list, keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return (list || []).slice();
    return (list || []).filter(function(name) { return String(name).indexOf(kw) !== -1; });
  },

  _filterLocationItems(items, keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return (items || []).slice();
    return (items || []).filter(function(it) { return String(it.label).indexOf(kw) !== -1; });
  },

  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    const areaId = this._warehouseAreaMap && this._warehouseAreaMap[value];
    this.setData({
      warehouse: value,
      warehouseAreaId: areaId || '',
      warehouseLocationCode: '',
      locationOptions: [],
      locationItems: [],
      filteredLocationItems: [],
      locationSearchKey: '',
    });
    if (areaId) this._loadLocationOptions(areaId);
  },

  onWarehouseClear() {
    this.setData({
      warehouse: '',
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
      locationItems: [],
      filteredLocationItems: [],
      locationSearchKey: '',
    });
  },

  onWarehouseCodeInput(e) {
    this.setData({
      warehouse: e.detail.value,
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
      locationItems: [],
      filteredLocationItems: [],
      locationSearchKey: '',
    });
  },

  _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [], locationItems: [], filteredLocationItems: [] });
      this._locationMap = {};
      return;
    }
    return api.warehouse.listLocations('SAMPLE', areaId)
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        const locMap = {};
        const options = [];
        const items = [];
        for (const item of list) {
          const label = item.locationCode || item.locationName || '';
          if (!label) continue;
          // D-171：保留库位已用/容量（后端 listByType 已返回 usedCapacity/capacity）
          const used = Number(item.usedCapacity || 0);
          const capacity = Number(item.capacity || 0);
          const isFull = capacity > 0 && used >= capacity;
          options.push(label);
          locMap[label] = item.locationCode || label;
          items.push({ code: item.locationCode || label, label: label, used: used, capacity: capacity, isFull: isFull });
        }
        this.setData({
          locationOptions: options,
          locationItems: items,
          filteredLocationItems: this._filterLocationItems(items, this.data.locationSearchKey),
        });
        this._locationMap = locMap;
      })
      .catch((e) => {
        console.warn('[SampleScanAction] 加载库位选项失败', e);
        this.setData({ locationOptions: [], locationItems: [], filteredLocationItems: [] });
        this._locationMap = {};
      });
  },

  // D-171：库位搜索（库位多时快速定位）
  onLocationSearchInput(e) {
    this.setData({
      locationSearchKey: e.detail.value,
      filteredLocationItems: this._filterLocationItems(this.data.locationItems, e.detail.value),
    });
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
    // D-171：满库位拦截，避免超限
    const items = this.data.locationItems || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].label === value && items[i].isFull) {
        wx.showToast({
          title: i18n.tf(NS + 'locationFull', {
            code: value,
            used: items[i].used,
            capacity: items[i].capacity,
          }, this._lang),
          icon: 'none',
        });
        return;
      }
    }
    this.setData({ warehouseLocationCode: value });
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationCodeInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value });
  },

  // ==================== 图片预览 ====================

  onPreviewImage(e) {
    const url = e.currentTarget.dataset.src;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  // ==================== 隐私协议 ====================

  onPrivacyAgree() {
    this.setData({ showPrivacy: false });
    if (this._resolvePrivacy) {
      this._resolvePrivacy({ buttonId: 'agree-btn', event: 'agree' });
    }
  },

  onPrivacyDisagree() {
    this.setData({ showPrivacy: false });
    if (this._resolvePrivacy) {
      this._resolvePrivacy({ buttonId: 'disagree-btn', event: 'disagree' });
    }
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
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang),
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
