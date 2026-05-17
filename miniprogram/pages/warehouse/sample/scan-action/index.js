/**
 * 样衣扫码动作页
 * 通过 URL 参数接收 styleNo / color / size（由扫码入口解析 QR 后跳转）
 * 调用 /api/stock/sample/scan-query 获取库存状态，展示入库/借调/归还按钮
 */
const api = require('../../../../../utils/api');

Page({
  data: {
    styleNo: '',
    color: '',
    size: '',
    loading: false,
    submitting: false,
    errorMsg: '',
    successMsg: '',
    stockInfo: null,   // scanQuery 返回的完整数据
    actions: [],       // ['inbound'] | ['loan'] | ['return'] | ['loan','return']
    showPrivacy: false,
    warehouseOptions: [],      // 仓库区域名称列表
    warehouseAreaId: '',       // 当前选中的仓库区域ID
    warehouseLocationCode: '', // 当前选中的库位编号
    locationOptions: [],       // 库位选项列表
  },

  onLoad(options) {
    const styleNo = decodeURIComponent(options.styleNo || '');
    const color = decodeURIComponent(options.color || '');
    const size = decodeURIComponent(options.size || '');

    if (!styleNo || !color || !size) {
      this.setData({ errorMsg: '缺少必要参数（款号/颜色/尺码）' });
      return;
    }

    this.setData({ styleNo, color, size });
    this.querySample(styleNo, color, size);
    this._loadWarehouseOptions();

    // 隐私协议订阅
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

  /** 查询样衣库存状态 */
  async querySample(styleNo, color, size) {
    this.setData({ loading: true, errorMsg: '', successMsg: '', stockInfo: null, actions: [] });
    try {
      const res = await api.sampleStock.scanQuery({ styleNo, color, size });
      const d = res || {};
      this.setData({
        stockInfo: d,
        actions: d.actions || [],
        loading: false,
      });
    } catch (err) {
      console.error('[SampleScanAction] querySample error', err);
      this.setData({ errorMsg: (err && (err.errMsg || err.message)) || '网络异常，请重试', loading: false });
    }
  },

  /** 重新查询 */
  onRetry() {
    const { styleNo, color, size } = this.data;
    this.querySample(styleNo, color, size);
  },

  /* ====== 操作处理（入库 / 借调 / 归还）====== */

  /** 入库 */
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
          })
        );
      },
    });
  },

  /** 借调 */
  onLoan() {
    if (this.data.submitting) return;
    const userInfo = getApp().globalData.userInfo || {};
    wx.showModal({
      title: '确认借调',
      content: `借调 ${this.data.styleNo} ${this.data.color} ${this.data.size}，确认？`,
      success: (modal) => {
        if (!modal.confirm) return;
        const stock = (this.data.stockInfo && this.data.stockInfo.stock) || {};
        this._doAction('loan', () =>
          api.sampleStock.loan({
            sampleStockId: stock.id,
            borrower: userInfo.name || userInfo.username || '',
            borrowerId: userInfo.id ? String(userInfo.id) : '',
            quantity: 1,
          })
        );
      },
    });
  },

  /** 归还 */
  onReturn() {
    if (this.data.submitting) return;
    const loans = (this.data.stockInfo && this.data.stockInfo.activeLoans) || [];
    if (!loans.length) {
      wx.showToast({ title: '无借调记录', icon: 'none' });
      return;
    }
    // 取最早的一条借调记录归还
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
          })
        );
      },
    });
  },

  /** 统一执行操作 */
  async _doAction(actionName, apiFn) {
    this.setData({ submitting: true, errorMsg: '', successMsg: '' });
    const labelMap = { inbound: '入库', loan: '借调', return: '归还' };
    try {
      await apiFn();
      wx.vibrateShort({ type: 'heavy' });
      // 显示明显的成功提示（原来只有底部小文字，用户无感知）
      wx.showToast({
        title: `${labelMap[actionName] || actionName}成功`,
        icon: 'success',
        duration: 2000,
      });
      this.setData({
        submitting: false,
        successMsg: `${labelMap[actionName] || actionName}成功`,
      });
      // 刷新状态
      setTimeout(() => {
        this.querySample(this.data.styleNo, this.data.color, this.data.size);
      }, 800);
    } catch (err) {
      console.error(`[SampleScanAction] ${actionName} error`, err);
      this.setData({
        submitting: false,
        errorMsg: (err && (err.errMsg || err.message)) || `${labelMap[actionName] || actionName}失败`,
      });
    }
  },

  /** 继续扫码（返回扫码页或触发扫码） */
  onScanNext() {
    wx.navigateBack();
  },

  /* ====== 仓库区域 + 库位选择 ====== */

  async _loadWarehouseOptions() {
    try {
      const res = await api.warehouse.listWarehouseAreas('SAMPLE');
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        var areaMap = {};
        var options = [];
        var sorted = list
          .filter(function(item) { return item.areaName && item.id; })
          .sort(function(a, b) { return (a.sort || 0) - (b.sort || 0); });
        for (var i = 0; i < sorted.length; i++) {
          var item = sorted[i];
          options.push(item.areaName);
          areaMap[item.areaName] = item.id;
        }
        if (options.length > 0) {
          this.setData({ warehouseOptions: options });
          this._warehouseAreaMap = areaMap;
        }
      }
    } catch (e) {
      console.warn('[SampleScanAction] 加载仓库选项失败', e);
    }
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

  async _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [] });
      this._locationMap = {};
      return;
    }
    try {
      var res = await api.warehouse.listLocations('SAMPLE', areaId);
      var data = res?.data || res;
      var list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        var locMap = {};
        var options = [];
        for (var i = 0; i < list.length; i++) {
          var item = list[i];
          var label = item.locationCode || item.locationName || '';
          if (label) {
            options.push(label);
            locMap[label] = item.locationCode || label;
          }
        }
        this.setData({ locationOptions: options });
        this._locationMap = locMap;
      } else {
        this.setData({ locationOptions: [] });
        this._locationMap = {};
      }
    } catch (e) {
      console.warn('[SampleScanAction] 加载库位选项失败', e);
      this.setData({ locationOptions: [] });
      this._locationMap = {};
    }
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
    this.setData({ warehouseLocationCode: value });
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationCodeInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value });
  },

  /* ====== 隐私协议 ====== */
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
