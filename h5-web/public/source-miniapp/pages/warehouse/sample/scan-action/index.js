/**
 * 样衣仓库管理页
 * 功能：样衣库存列表、搜索、扫码、手动出入库管理
 */
const api = require('../../../../utils/api');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');

const SAMPLE_TYPE_MAP = {
  'development': '开发样',
  'pre_production': '产前样',
  'shipment': '大货样',
  'sales': '销售样',
  'reference': '参考样',
  'photo': '拍照样',
  'confirmation': '确认样',
  'pattern': '纸样',
  'fitting': '试穿样',
  'showroom': '展厅样',
  'top': '齐色样',
  'size_set': '套码样',
  'seal': '封样',
  'BODY_SAMPLE': '大货样',
  'FITTING_SAMPLE': '试穿样',
  'SALES_SAMPLE': '销售样',
  'REFERENCE_SAMPLE': '参考样',
  'DEVELOPMENT_SAMPLE': '开发样',
  'PRODUCTION_SAMPLE': '生产样',
  'PHOTO_SAMPLE': '拍照样',
  'SHOWROOM_SAMPLE': '展厅样',
  'PATTERN_SAMPLE': '纸样样衣',
  'CONFIRMATION_SAMPLE': '确认样',
  'PRE_PRODUCTION_SAMPLE': '产前样',
  'SHIPPING_SAMPLE': '船样',
  'TOP_SAMPLE': '齐色样',
  'SIZE_SET_SAMPLE': '套码样',
  'SEAL_SAMPLE': '封样',
};

function translateSampleType(type) {
  if (!type) return '-';
  return SAMPLE_TYPE_MAP[type] || type;
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
    statusTabs: [
      { key: 'all',        label: '全部',   pillClass: '' },
      { key: 'in_stock',   label: '在库',   pillClass: '' },
      { key: 'loaned_out', label: '全部借出', pillClass: '' },
    ],
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
    warehouseAreaId: '',
    warehouseLocationCode: '',
    warehouse: '',
    locationOptions: [],

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
  },

  onLoad(options) {
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
    if (this.data.viewMode === 'list') {
      this.loadStockList(true);
    }
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

        const records = (data?.records || []).map(item => ({
          ...item,
          _imageUrl: buildImageUrl(item.imageUrl || item.coverImage || ''),
          _sampleTypeLabel: translateSampleType(item.sampleType || ''),
        }));
        const total = data?.total || records.length;

        const newStockList = refresh ? records : [...this.data.stockList, ...records];
        const filteredStockList = newStockList.filter(s => this._matchesStatus(s));
        this.setData({
          stockList: newStockList,
          filteredStockList,
          hasMore: this.data.stockList.length < total,
          page: page + 1,
          stockListLoading: false,
        });
      })
      .catch((err) => {
        console.error('[SampleStock] 加载列表失败', err);
        this.setData({
          stockListError: '加载失败，请重试',
          stockListLoading: false,
        });
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
        if (d.stock && d.stock.sampleType) {
          d.stock._sampleTypeLabel = translateSampleType(d.stock.sampleType);
        }
        if (d.stock) {
          d.stock._imageUrl = buildImageUrl(d.stock.imageUrl || d.stock.coverImage || '');
        }
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
        this.setData({
          stockInfo: d,
          actions: d.actions || [],
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[SampleScanAction] querySample error', err);
        this.setData({ errorMsg: (err && (err.errMsg || err.message)) || '网络异常，请重试', loading: false });
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
      wx.showToast({ title: '请先选择仓库区域', icon: 'none' });
      return;
    }
    if (!warehouseLocationCode) {
      wx.showToast({ title: '请先选择库位', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '确认入库',
      content: `将 ${this.data.styleNo} ${this.data.color} ${this.data.size} 入库到 ${this.data.warehouse} / ${warehouseLocationCode}，确认？`,
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
      wx.showToast({ title: '可用库存为0，无法借调', icon: 'none' });
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
      loanPickerLoading: true,
    });
    // 并行加载外发工厂列表和内部员工列表
    // 注意：api.factory 和 api.system.listUsers 直接挂在 api 顶层（非 api.system.factory）
    // - api.factory.list 返回 IPage<Factory>，取 records
    // - api.system.listUsers 返回 Page<User>，取 records
    Promise.all([
      api.factory.list({ page: 1, pageSize: 200 }).catch(() => ({ records: [] })),
      api.system.listUsers({ page: 1, pageSize: 200 }).catch(() => ({ records: [] })),
    ]).then(([factoryRes, workerRes]) => {
      const factoryList = (factoryRes && factoryRes.records) || [];
      const workerList = (workerRes && workerRes.records) || [];
      this.setData({
        factoryList,
        workerList,
        filteredFactoryList: factoryList,
        filteredWorkerList: workerList,
        loanPickerLoading: false,
      });
    }).catch(() => {
      this.setData({ loanPickerLoading: false });
    });
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

  // 选择借调目标
  onLoanTargetSelect(e) {
    const { id, name } = e.currentTarget.dataset;
    if (!id) return;
    this.setData({ loanTargetId: id, loanTargetName: name });
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
      wx.showToast({ title: '请选择借调对象', icon: 'none' });
      return;
    }
    const availableQty = this.data.stockInfo && this.data.stockInfo.availableQuantity
      ? this.data.stockInfo.availableQuantity : 0;
    if (loanQuantity > availableQty) {
      wx.showToast({ title: `借调数量不能超过可用库存(${availableQty})`, icon: 'none' });
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
      title: '确认借调',
      content: `借调给「${loanTargetName}」，数量 ${loanQuantity} 件，确认？`,
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
      wx.showToast({ title: '无借调记录', icon: 'none' });
      return;
    }
    const loan = loans[0];
    wx.showModal({
      title: '确认归还',
      content: `归还 ${this.data.styleNo} ${this.data.color} ${this.data.size}，确认？`,
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
    const labelMap = { inbound: '入库', loan: '借调', return: '归还' };
    return apiFn()
      .then(() => {
        wx.vibrateShort({ type: 'heavy' });
        wx.showToast({
          title: `${labelMap[actionName] || actionName}成功`,
          icon: 'success',
          duration: 2000,
        });
        this.setData({
          submitting: false,
          successMsg: `${labelMap[actionName] || actionName}成功`,
        });
        setTimeout(() => {
          this.querySample(this.data.styleNo, this.data.color, this.data.size);
        }, 800);
      })
      .catch((err) => {
        console.error(`[SampleScanAction] ${actionName} error`, err);
        this.setData({
          submitting: false,
          errorMsg: (err && (err.errMsg || err.message)) || `${labelMap[actionName] || actionName}失败`,
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
      if (data.styleNo && data.color && data.size) {
        this.setData({
          viewMode: 'detail',
          styleNo: data.styleNo,
          color: data.color,
          size: data.size,
        });
        this.querySample(data.styleNo, data.color, data.size);
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
    
    wx.showToast({ title: '无法识别的二维码', icon: 'none' });
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
            .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          for (const item of sorted) {
            options.push(item.areaName);
            areaMap[item.areaName] = item.id;
          }
          if (options.length > 0) {
            this.setData({ warehouseOptions: options });
            this._warehouseAreaMap = areaMap;
          }
        }
      })
      .catch((e) => {
        console.warn('[SampleScanAction] 加载仓库选项失败', e);
      });
  },

  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    const areaId = this._warehouseAreaMap && this._warehouseAreaMap[value];
    this.setData({
      warehouse: value,
      warehouseAreaId: areaId || '',
      warehouseLocationCode: '',
      locationOptions: [],
    });
    if (areaId) this._loadLocationOptions(areaId);
  },

  onWarehouseClear() {
    this.setData({
      warehouse: '',
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
    });
  },

  onWarehouseCodeInput(e) {
    this.setData({
      warehouse: e.detail.value,
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
    });
  },

  _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [], _locationMap: {} });
      return;
    }
    return api.warehouse.listLocations('SAMPLE', areaId)
      .then((res) => {
        const list = Array.isArray(res) ? res : [];
        if (list.length > 0) {
          const locMap = {};
          const options = [];
          for (const item of list) {
            const label = item.locationCode || item.locationName || '';
            if (label) {
              options.push(label);
              locMap[label] = item.locationCode || label;
            }
          }
          this.setData({ locationOptions: options });
          this._locationMap = locMap;
        } else {
          this.setData({ locationOptions: [], _locationMap: {} });
        }
      })
      .catch((e) => {
        console.warn('[SampleScanAction] 加载库位选项失败', e);
        this.setData({ locationOptions: [], _locationMap: {} });
      });
  },

  onLocationChipTap(e) {
    this.setData({ warehouseLocationCode: e.currentTarget.dataset.value });
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
});
