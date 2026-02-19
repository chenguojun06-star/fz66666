/**
 * StockHandler - 库存查询处理器
 * 从 scan/index.js 提取的库存查询相关逻辑
 *
 * @module StockHandler
 */

const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

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
      title: '库存查询',
      content: `SKU: ${skuCode}\r\n当前库存: ${stock}`,
      confirmText: '调整库存',
      cancelText: '关闭',
      success: (res) => {
        if (res.confirm) {
          showStockUpdateDialog(skuCode);
        }
      }
    });
  } catch (e) {
    console.error('[handleStockQuery] error:', e);
    toast.error('查询失败: ' + (e.errMsg || e.message || '未知错误'));
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
    title: '调整库存',
    content: '请输入调整数量 (正数增加，负数减少)',
    editable: true,
    placeholderText: '例如: 10 或 -5',
    success: async (res) => {
      if (res.confirm && res.content) {
        const qty = parseInt(res.content);
        if (isNaN(qty) || qty === 0) {
          toast.error('无效数量');
          return;
        }

        wx.showLoading({ title: '更新中...', mask: true });
        try {
          await api.style.updateInventory({ skuCode, quantity: qty });
          wx.hideLoading();
          toast.success('库存更新成功');
        } catch (e) {
          wx.hideLoading();
          toast.error('更新失败: ' + (e.errMsg || e.message));
        }
      }
    }
  });
}

module.exports = {
  handleStockQuery,
  showStockUpdateDialog,
};
