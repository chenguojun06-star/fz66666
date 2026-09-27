/**
 * StockHandler - 库存查询处理器
 * 从 scan/index.js 提取的库存查询相关逻辑
 *
 * @module StockHandler
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const i18n = require('../../../utils/i18n/index');

const NS = 'mp.scanLogic.';

/**
 * 处理库存查询
 * @param {Object} page - 页面实例
 * @param {string} codeStr - 扫码内容
 * @param {Object} qrParser - QR 解析器实例（来自 scanHandler）
 */
async function handleStockQuery(page, codeStr, qrParser) {
  try {
    let skuCode = codeStr;

    // 使用 qrParser 提取 SKU 信息
    const parseResult = qrParser.parse(codeStr);
    if (parseResult.success && parseResult.data.styleNo && parseResult.data.color && parseResult.data.size) {
      skuCode = `${parseResult.data.styleNo}-${parseResult.data.color}-${parseResult.data.size}`;
    }

    const stock = await api.style.getInventory(skuCode);

    wx.showModal({
      title: i18n.t(NS + 'stockQueryTitle'),
      content: i18n.tf(NS + 'stockQueryContentFmt', { code: skuCode, stock: stock }),
      confirmText: i18n.t(NS + 'stockAdjust'),
      cancelText: i18n.t('common.close'),
      success: (res) => {
        if (res.confirm) {
          showStockUpdateDialog(skuCode);
        }
      },
    });
  } catch (e) {
    console.error('[handleStockQuery] error:', e);
    toast.error(i18n.tf(NS + 'queryFailedFmt', { msg: e.errMsg || e.message || i18n.t(NS + 'unknownError') }));
  } finally {
    page.setData({ loading: false });
  }
}

/**
 * 显示库存更新弹窗
 * @param {string} skuCode - SKU 编码
 */
function showStockUpdateDialog(skuCode) {
  wx.showModal({
    title: i18n.t(NS + 'stockAdjust'),
    content: i18n.t(NS + 'stockAdjustContent'),
    editable: true,
    placeholderText: i18n.t(NS + 'stockAdjustPh'),
    success: async (res) => {
      if (res.confirm && res.content) {
        const qty = parseInt(res.content, 10);
        if (isNaN(qty) || qty === 0) {
          toast.error(i18n.t(NS + 'invalidQty'));
          return;
        }

        wx.showLoading({ title: i18n.t(NS + 'updating'), mask: true });
        try {
          await api.style.updateInventory({ skuCode, quantity: qty });
          wx.hideLoading();
          toast.success(i18n.t(NS + 'stockUpdateSuccess'));
        } catch (e) {
          wx.hideLoading();
          toast.error(i18n.tf(NS + 'updateFailedFmt', { msg: e.errMsg || e.message || '' }));
        }
      }
    },
  });
}

module.exports = {
  handleStockQuery,
  showStockUpdateDialog,
};
