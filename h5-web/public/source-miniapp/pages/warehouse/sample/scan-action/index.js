/**
 * 样衣仓库管理页
 * 功能：样衣库存列表、搜索、扫码、手动出入库管理
 */
const api = require('../../../../utils/api');
const { getAuthedImageUrl } = require('../../../../utils/fileUrl');
const { ok } = require('../../../../utils/api-modules/helpers');

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
    
    // 列表数据
    stockList: [],
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
    _showInbound: false,
    _showLoan: false,
    _showReturn: false,
    showPrivacy: false,
    warehouseOptions: [],
    warehouseAreaId: '',
    warehouseLocationCode: '',
    warehouse: '',
    locationOptions: [],

    // 借调表单
    showLoanForm: false,
    loanLendToType: 'person',  // 'person' | 'factory'
    loanLendTo: '',
    loanLendToId: '',
    loanLendToFactoryId: '',
    loanLendToFactoryName: '',
    loanBorrower: '',
    loanQuantity: 1,
    loanRemark: '',
    // 人员和工厂搜索
    loanUserList: [],
    loanFactoryList: [],
    loanUserSearch: '',
    loanFactorySearch: '',
    _filteredLoanUsers: [],
    _filteredLoanFactories: [],

    // 归还选择
    showReturnPicker: false,
    selectedLoanId: '',

    // 转借表单
    showTransferForm: false,
    transferLoanId: '',
    transferLendTo: '',
    transferLendToFactoryName: '',
    transferQuantity: 1,
    transferRemark: '',
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
        let data = res;
        if (res && res.data) data = res.data;
        if (res && res.records) data = res;
        
        const records = (data?.records || data?.data || []).map(item => ({
          ...item,
          _imageUrl: buildImageUrl(item.imageUrl || item.coverImage || ''),
          _sampleTypeLabel: translateSampleType(item.sampleType || ''),
        }));
        const total = data?.total || records.length;
        
        this.setData({
          stockList: refresh ? records : [...this.data.stockList, ...records],
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
    if (e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.clear) keyword = '';
    this.setData({ searchKeyword: keyword });
  },

  onSearchConfirm() {
    this.loadStockList(true);
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
        const actionsArr = d.actions || [];
        this.setData({
          stockInfo: d,
          actions: actionsArr,
          _showInbound: actionsArr.indexOf('inbound') !== -1,
          _showLoan: actionsArr.indexOf('loan') !== -1,
          _showReturn: actionsArr.indexOf('return') !== -1,
          loading: false,
        });
      })
      .catch((err) => {
        console.error('[SampleScanAction] querySample error', err);
        this.setData({ errorMsg: (err && (err.errMsg || err.message)) || '网络异常，请重试', loading: false });
      });
  },

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
    // 切换内联表单显示
    if (this.data.showLoanForm) {
      this.setData({ showLoanForm: false });
      return;
    }
    const userInfo = getApp().globalData.userInfo || {};
    this.setData({
      showLoanForm: true,
      loanLendToType: 'person',
      loanLendTo: '',
      loanLendToId: '',
      loanLendToFactoryId: '',
      loanLendToFactoryName: '',
      loanBorrower: userInfo.name || userInfo.username || '',
      loanQuantity: 1,
      loanRemark: '',
      loanUserSearch: '',
      loanFactorySearch: '',
    });
    // 加载租户人员列表和外发工厂列表
    this._loadLoanOptions();
  },

  _loadLoanOptions() {
    // 加载租户人员
    ok('/api/system/user/list', 'GET', { pageSize: 200 }).then(records => {
      const list = Array.isArray(records) ? records : (records?.records || []);
      this.setData({ loanUserList: list });
    }).catch(() => {
      this.setData({ loanUserList: [] });
    });
    // 加载外发工厂
    api.factory.list({ pageSize: 200, status: 'active' }).then(records => {
      const list = Array.isArray(records) ? records : (records?.records || []);
      this.setData({ loanFactoryList: list });
    }).catch(() => {
      this.setData({ loanFactoryList: [] });
    });
  },

  onLoanUserSearch(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase();
    this.setData({ loanUserSearch: keyword });
    const filtered = keyword
      ? this.data.loanUserList.filter(u => (u.name || u.username || '').toLowerCase().includes(keyword))
      : this.data.loanUserList;
    this.setData({ _filteredLoanUsers: filtered.slice(0, 20) });
  },

  onLoanFactorySearch(e) {
    const keyword = (e.detail.value || '').trim().toLowerCase();
    this.setData({ loanFactorySearch: keyword });
    const filtered = keyword
      ? this.data.loanFactoryList.filter(f => (f.factoryName || f.name || '').toLowerCase().includes(keyword))
      : this.data.loanFactoryList;
    this.setData({ _filteredLoanFactories: filtered.slice(0, 20) });
  },

  onLoanUserSelect(e) {
    const idx = e.currentTarget.dataset.idx;
    const user = this.data._filteredLoanUsers[idx];
    if (!user) return;
    this.setData({
      loanLendTo: user.name || user.username || '',
      loanLendToId: String(user.id || ''),
      loanUserSearch: '',
    });
  },

  onLoanFactorySelect(e) {
    const idx = e.currentTarget.dataset.idx;
    const factory = this.data._filteredLoanFactories[idx];
    if (!factory) return;
    this.setData({
      loanLendToFactoryId: String(factory.id || ''),
      loanLendToFactoryName: factory.factoryName || factory.name || '',
      loanFactorySearch: '',
    });
  },

  onLoanLendToTypeChange(e) {
    this.setData({ loanLendToType: e.detail.value });
  },

  onLoanLendToInput(e) {
    this.setData({ loanLendTo: e.detail.value });
  },

  onLoanFactoryInput(e) {
    this.setData({ loanLendToFactoryName: e.detail.value });
  },

  onLoanBorrowerInput(e) {
    this.setData({ loanBorrower: e.detail.value });
  },

  onLoanRemarkInput(e) {
    this.setData({ loanRemark: e.detail.value });
  },

  onLoanFormCancel() {
    this.setData({ showLoanForm: false });
  },

  onLoanFormConfirm() {
    const { loanLendTo, loanLendToId, loanLendToFactoryId, loanLendToFactoryName, loanLendToType, loanBorrower, loanQuantity, loanRemark } = this.data;
    if (!loanLendTo && !loanLendToFactoryName) {
      wx.showToast({ title: '请选择借入人或工厂', icon: 'none' });
      return;
    }
    const stock = (this.data.stockInfo && this.data.stockInfo.stock) || {};
    const userInfo = getApp().globalData.userInfo || {};
    this.setData({ showLoanForm: false });
    this._doAction('loan', () =>
      api.sampleStock.loan({
        sampleStockId: stock.id,
        borrower: loanBorrower || userInfo.name || userInfo.username || '',
        borrowerId: userInfo.id ? String(userInfo.id) : '',
        lendTo: loanLendToType === 'factory' ? '' : loanLendTo,
        lendToId: loanLendToType === 'factory' ? '' : (loanLendToId || ''),
        lendToType: loanLendToType,
        lendToFactoryId: loanLendToType === 'factory' ? (loanLendToFactoryId || '') : '',
        lendToFactoryName: loanLendToType === 'factory' ? loanLendToFactoryName : '',
        quantity: loanQuantity || 1,
        remark: loanRemark,
      }),
    );
  },

  onReturn() {
    if (this.data.submitting) return;
    const loans = (this.data.stockInfo && this.data.stockInfo.activeLoans) || [];
    if (!loans.length) {
      wx.showToast({ title: '无借调记录', icon: 'none' });
      return;
    }
    // 只有一条记录直接归还
    if (loans.length === 1) {
      this._doReturnLoan(loans[0]);
      return;
    }
    // 多条记录，显示选择
    this.setData({ showReturnPicker: true, selectedLoanId: loans[0].id });
  },

  onReturnLoanSelect(e) {
    this.setData({ selectedLoanId: e.currentTarget.dataset.id });
  },

  onReturnPickerConfirm() {
    const loans = (this.data.stockInfo && this.data.stockInfo.activeLoans) || [];
    const loan = loans.find(l => l.id === this.data.selectedLoanId);
    if (!loan) {
      wx.showToast({ title: '请选择归还记录', icon: 'none' });
      return;
    }
    this.setData({ showReturnPicker: false });
    this._doReturnLoan(loan);
  },

  onReturnPickerCancel() {
    this.setData({ showReturnPicker: false });
  },

  _doReturnLoan(loan) {
    wx.showModal({
      title: '确认归还',
      content: `归还 ${this.data.styleNo} ${this.data.color} ${this.data.size}，借入人: ${loan.lendTo || loan.lendToFactoryName || loan.borrower || '未知'}，剩余 ${loan.remainingQuantity || loan.quantity || 1} 件`,
      success: (modal) => {
        if (!modal.confirm) return;
        this._doAction('return', () =>
          api.sampleStock.returnSample({
            loanId: loan.id,
            returnQuantity: loan.remainingQuantity || loan.quantity || 1,
          }),
        );
      },
    });
  },

  onTransfer(e) {
    const loanId = e.currentTarget.dataset.id;
    const loans = (this.data.stockInfo && this.data.stockInfo.activeLoans) || [];
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;
    this.setData({
      showTransferForm: true,
      transferLoanId: loanId,
      transferLendTo: '',
      transferLendToFactoryName: '',
      transferQuantity: loan.remainingQuantity || loan.quantity || 1,
      transferRemark: '',
    });
  },

  onTransferLendToInput(e) {
    this.setData({ transferLendTo: e.detail.value });
  },

  onTransferFactoryInput(e) {
    this.setData({ transferLendToFactoryName: e.detail.value });
  },

  onTransferRemarkInput(e) {
    this.setData({ transferRemark: e.detail.value });
  },

  onTransferFormCancel() {
    this.setData({ showTransferForm: false });
  },

  onTransferFormConfirm() {
    const { transferLoanId, transferLendTo, transferLendToFactoryName, transferQuantity, transferRemark } = this.data;
    if (!transferLendTo && !transferLendToFactoryName) {
      wx.showToast({ title: '请填写转借入人或工厂', icon: 'none' });
      return;
    }
    this.setData({ showTransferForm: false });
    this._doAction('转借', () =>
      api.sampleStock.transfer({
        sourceLoanId: transferLoanId,
        lendTo: transferLendTo,
        lendToFactoryName: transferLendToFactoryName,
        quantity: transferQuantity,
        remark: transferRemark,
      }),
    );
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
    } catch (e) {}
    
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
        const data = res?.data || res;
        const list = Array.isArray(data) ? data : [];
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
        const data = res?.data || res;
        const list = Array.isArray(data) ? data : [];
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
