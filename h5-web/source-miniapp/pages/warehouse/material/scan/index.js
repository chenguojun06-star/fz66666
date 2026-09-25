/**
 * 面辅料料卷扫码页
 *
 * 用途：仓管扫料卷/箱二维码（MR开头）确认发料或退回
 *
 * 进入方式：
 *  1. 从生产扫码页扫到 MR码 自动跳转（带 rollCode 参数）
 *  2. 直接进入，手动扫码
 */
const api = require('../../../../utils/api');
const { eventBus, Events } = require('../../../../utils/eventBus');
const i18n = require('../../../../utils/i18n/index');

/**
 * 调用料卷扫码接口（封装，使用统一 api.js）
 * @param {string} rollCode - 料卷码
 * @param {string} action - 操作类型（如 issue/return）
 * @param {object} extra - 附加参数（如 cuttingOrderNo）
 * @returns {Promise} 接口请求 Promise
 */
function scanRollApi(rollCode, action, extra) {
  const userInfo = getApp().globalData && getApp().globalData.userInfo;
  return api.materialRoll.scan(rollCode, action, {
    cuttingOrderNo: extra && extra.cuttingOrderNo,
    operatorId: userInfo && userInfo.id,
    operatorName: userInfo && (userInfo.name || userInfo.username),
  });
}

Page({
  data: {
    rollCode: '',          // 当前料卷码
    rollInfo: null,        // 从后端查询到的料卷信息
    loading: false,        // 查询中
    submitting: false,     // 操作提交中
    cuttingOrderNo: '',    // 关联裁剪单号（可选）
    errorMsg: '',          // 错误信息
    successMsg: '',        // 成功信息

    /** i18n 文案表（applyLanguage 里填充，wxml 用 {{t.xxx}}） */
    t: {},
  },

  onLoad(options) {
    const rollCode = options && options.rollCode
      ? decodeURIComponent(options.rollCode)
      : '';
    if (rollCode) {
      this.setData({ rollCode });
      this.queryRoll(rollCode);
    }
    // 订阅隐私授权弹窗事件（微信审核必须）
    if (eventBus && typeof eventBus.on === 'function') {
      this._unsubPrivacy = eventBus.on('showPrivacyDialog', resolve => {
        try {
          const dialog = this.selectComponent('#privacyDialog');
          if (dialog && typeof dialog.showDialog === 'function') {
            dialog.showDialog(resolve);
          }
        } catch (_) { /* 静默忽略 */ }
      });
    }
  },

  onShow() {
    // 每次回到页面都按当前语言重刷文案（用户可能在「我的」里切了语言）
    this.applyLanguage(i18n.getLanguage());
  },

  /**
   * 刷新本页全部文案（wxml 静态文案 + 状态标签）。
   *
   * ⚠️ 本页 json 的 navigationBarTitleText 是**空字符串**（页面自带大标题
   *    「面辅料料卷发料/退回」），所以这里**故意不**调 wx.setNavigationBarTitle，
   *    保持原有视觉不变。
   */
  applyLanguage(language) {
    var lang = language || i18n.getLanguage();
    this._lang = lang;
    this.setData({
      t: {
        headerTitle: i18n.t('mp.warehouse.materialScan.headerTitle', lang),
        headerSub: i18n.t('mp.warehouse.materialScan.headerSub', lang),
        scanTap: i18n.t('mp.warehouse.materialScan.scanTap', lang),
        scanHint: i18n.t('mp.warehouse.materialScan.scanHint', lang),
        rollCodeLabel: i18n.t('mp.warehouse.materialScan.rollCodeLabel', lang),
        rescan: i18n.t('common.rescan', lang),
        querying: i18n.t('mp.warehouse.materialScan.querying', lang),
        materialLabel: i18n.t('mp.warehouse.materialScan.materialLabel', lang),
        codeLabel: i18n.t('mp.warehouse.materialScan.codeLabel', lang),
        color: i18n.t('common.color', lang),
        quantity: i18n.t('common.quantity', lang),
        location: i18n.t('common.location', lang),
        inboundNoLabel: i18n.t('mp.warehouse.materialScan.inboundNoLabel', lang),
        currentStatusLabel: i18n.t('mp.warehouse.materialScan.currentStatusLabel', lang),
        statusInStock: i18n.t('mp.warehouse.materialScan.statusInStock', lang),
        statusIssued: i18n.t('mp.warehouse.materialScan.statusIssued', lang),
        cuttingOrderLabel: i18n.t('mp.warehouse.materialScan.cuttingOrderLabel', lang),
        cuttingOrderPlaceholder: i18n.t('mp.warehouse.materialScan.cuttingOrderPlaceholder', lang),
        processing: i18n.t('mp.warehouse.materialScan.processing', lang),
        confirmIssue: i18n.t('mp.warehouse.materialScan.confirmIssue', lang),
        confirmReturnAction: i18n.t('mp.warehouse.materialScan.confirmReturnAction', lang),
        scanNext: i18n.t('mp.warehouse.materialScan.scanNext', lang),
      },
    });
  },

  onUnload() {
    if (this._unsubPrivacy) {
      this._unsubPrivacy();
      this._unsubPrivacy = null;
    }
  },

  // ---- 手动扫码（用户主动扫） ----
  onScanTap() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = String(res.result || '').trim();
        if (/^MR\d{13}$/.test(code)) {
          this.setData({ rollCode: code, rollInfo: null, errorMsg: '', successMsg: '' });
          this.queryRoll(code);
        } else {
          wx.showToast({ title: i18n.t('mp.warehouse.materialScan.notRollQr', this._lang), icon: 'none' });
        }
      },
    });
  },

  // ---- 查询料卷信息 ----
  async queryRoll(rollCode) {
    this.setData({ loading: true, errorMsg: '', successMsg: '', rollInfo: null });
    try {
      const info = await scanRollApi(rollCode, 'query', {});
      this.setData({ rollInfo: info, loading: false });
    } catch (e) {
      this.setData({ loading: false, errorMsg: e.message || i18n.t('mp.warehouse.materialScan.queryFailed', this._lang) });
    }
  },

  // ---- 输入裁剪单号 ----
  onCuttingOrderInput(e) {
    this.setData({ cuttingOrderNo: e.detail.value });
  },

  // ---- 确认发料（IN_STOCK → ISSUED） ----
  async onIssueTap() {
    const { rollCode, rollInfo, cuttingOrderNo, submitting } = this.data;
    if (submitting || !rollCode) return;
    if (!rollInfo) return wx.showToast({ title: i18n.t('mp.warehouse.materialScan.scanFirst', this._lang), icon: 'none' });
    if (rollInfo.currentStatus !== 'IN_STOCK') {
      return wx.showToast({ title: i18n.t('mp.warehouse.materialScan.notInStock', this._lang), icon: 'none' });
    }

    wx.showModal({
      title: i18n.t('mp.warehouse.materialScan.confirmIssueTitle', this._lang),
      content: i18n.tf('mp.warehouse.materialScan.issueConfirmText', {
        name: rollInfo.materialName,
        qty: rollInfo.quantity,
        unit: rollInfo.unit,
        loc: rollInfo.warehouseLocation,
      }, this._lang),
      confirmText: i18n.t('mp.warehouse.materialScan.confirmIssueTitle', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true, errorMsg: '', successMsg: '' });
        try {
          const result = await scanRollApi(rollCode, 'issue', { cuttingOrderNo });
          this.setData({
            submitting: false,
            successMsg: result.message || i18n.t('mp.warehouse.materialScan.issueSuccess', this._lang),
            rollInfo: { ...rollInfo, currentStatus: 'ISSUED' },
          });
          eventBus.emit(Events.DATA_CHANGED, { type: 'materialStock' });
          wx.vibrateShort({ type: 'heavy' });
        } catch (e) {
          this.setData({ submitting: false, errorMsg: e.message || i18n.t('mp.warehouse.materialScan.issueFailed', this._lang) });
        }
      },
    });
  },

  // ---- 退回入库（ISSUED → IN_STOCK） ----
  async onReturnTap() {
    const { rollCode, rollInfo, submitting } = this.data;
    if (submitting || !rollCode) return;
    if (!rollInfo) return wx.showToast({ title: i18n.t('mp.warehouse.materialScan.scanFirst', this._lang), icon: 'none' });
    if (rollInfo.currentStatus !== 'ISSUED') {
      return wx.showToast({ title: i18n.t('mp.warehouse.materialScan.notIssued', this._lang), icon: 'none' });
    }

    wx.showModal({
      title: i18n.t('mp.warehouse.materialScan.confirmReturnTitle', this._lang),
      content: i18n.tf('mp.warehouse.materialScan.returnConfirmText', {
        name: rollInfo.materialName,
        loc: rollInfo.warehouseLocation,
      }, this._lang),
      confirmText: i18n.t('mp.warehouse.materialScan.confirmReturnTitle', this._lang),
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true, errorMsg: '', successMsg: '' });
        try {
          const result = await scanRollApi(rollCode, 'return', {});
          this.setData({
            submitting: false,
            successMsg: result.message || i18n.t('mp.warehouse.materialScan.returnSuccess', this._lang),
            rollInfo: { ...rollInfo, currentStatus: 'IN_STOCK' },
          });
          eventBus.emit(Events.DATA_CHANGED, { type: 'materialStock' });
          wx.vibrateShort({ type: 'heavy' });
        } catch (e) {
          this.setData({ submitting: false, errorMsg: e.message || i18n.t('mp.warehouse.materialScan.returnFailed', this._lang) });
        }
      },
    });
  },

  // ---- 扫另一个码 ----
  onScanNextTap() {
    this.setData({ rollCode: '', rollInfo: null, errorMsg: '', successMsg: '', cuttingOrderNo: '' });
  },

  // ---- 返回 ----
  onBackTap() {
    wx.navigateBack();
  },
});
