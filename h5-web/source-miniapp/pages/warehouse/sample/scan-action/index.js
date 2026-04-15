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
      if (res && res.code === 200) {
        const d = res.data || {};
        this.setData({
          stockInfo: d,
          actions: d.actions || [],
          loading: false,
        });
      } else {
        this.setData({ errorMsg: (res && res.message) || '查询失败', loading: false });
      }
    } catch (err) {
      console.error('[SampleScanAction] querySample error', err);
      this.setData({ errorMsg: '网络异常，请重试', loading: false });
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
    wx.showModal({
      title: '确认入库',
      content: `将 ${this.data.styleNo} ${this.data.color} ${this.data.size} 入库，确认？`,
      success: (modal) => {
        if (!modal.confirm) return;
        this._doAction('inbound', () =>
          api.sampleStock.inbound({
            styleNo: this.data.styleNo,
            color: this.data.color,
            size: this.data.size,
            quantity: 1,
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
      const res = await apiFn();
      if (res && res.code === 200) {
        wx.vibrateShort({ type: 'heavy' });
        this.setData({
          submitting: false,
          successMsg: `${labelMap[actionName] || actionName}成功`,
        });
        // 刷新状态
        setTimeout(() => {
          this.querySample(this.data.styleNo, this.data.color, this.data.size);
        }, 800);
      } else {
        this.setData({
          submitting: false,
          errorMsg: (res && res.message) || `${labelMap[actionName]}失败`,
        });
      }
    } catch (err) {
      console.error(`[SampleScanAction] ${actionName} error`, err);
      this.setData({ submitting: false, errorMsg: '网络异常，请重试' });
    }
  },

  /** 继续扫码（返回扫码页或触发扫码） */
  onScanNext() {
    wx.navigateBack();
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
