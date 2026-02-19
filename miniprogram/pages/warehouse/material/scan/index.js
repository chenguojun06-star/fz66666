/**
 * 面辅料料卷扫码页
 *
 * 用途：仓管扫料卷/箱二维码（MR开头）确认发料或退回
 *
 * 进入方式：
 *  1. 从生产扫码页扫到 MR码 自动跳转（带 rollCode 参数）
 *  2. 直接进入，手动扫码
 */
const api = require('../../../../../utils/api');

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
  },

  onLoad(options) {
    const rollCode = options && options.rollCode
      ? decodeURIComponent(options.rollCode)
      : '';
    if (rollCode) {
      this.setData({ rollCode });
      this.queryRoll(rollCode);
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
          wx.showToast({ title: '不是料卷二维码', icon: 'none' });
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
      this.setData({ loading: false, errorMsg: e.message || '查询失败' });
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
    if (!rollInfo) return wx.showToast({ title: '请先扫码', icon: 'none' });
    if (rollInfo.currentStatus !== 'IN_STOCK') {
      return wx.showToast({ title: '该料卷不在库，无法发料', icon: 'none' });
    }

    wx.showModal({
      title: '确认发料',
      content: `确认将「${rollInfo.materialName}」× ${rollInfo.quantity}${rollInfo.unit} 从 ${rollInfo.warehouseLocation} 发出？`,
      confirmText: '确认发料',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true, errorMsg: '', successMsg: '' });
        try {
          const result = await scanRollApi(rollCode, 'issue', { cuttingOrderNo });
          this.setData({
            submitting: false,
            successMsg: result.message || '发料成功！',
            rollInfo: { ...rollInfo, currentStatus: 'ISSUED' },
          });
          wx.vibrateShort({ type: 'heavy' });
        } catch (e) {
          this.setData({ submitting: false, errorMsg: e.message || '发料失败' });
        }
      },
    });
  },

  // ---- 退回入库（ISSUED → IN_STOCK） ----
  async onReturnTap() {
    const { rollCode, rollInfo, submitting } = this.data;
    if (submitting || !rollCode) return;
    if (!rollInfo) return wx.showToast({ title: '请先扫码', icon: 'none' });
    if (rollInfo.currentStatus !== 'ISSUED') {
      return wx.showToast({ title: '该料卷尚未发料，无需退回', icon: 'none' });
    }

    wx.showModal({
      title: '确认退回',
      content: `将「${rollInfo.materialName}」退回仓库（${rollInfo.warehouseLocation}）？`,
      confirmText: '确认退回',
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ submitting: true, errorMsg: '', successMsg: '' });
        try {
          const result = await scanRollApi(rollCode, 'return', {});
          this.setData({
            submitting: false,
            successMsg: result.message || '退回成功！',
            rollInfo: { ...rollInfo, currentStatus: 'IN_STOCK' },
          });
          wx.vibrateShort({ type: 'heavy' });
        } catch (e) {
          this.setData({ submitting: false, errorMsg: e.message || '退回失败' });
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
