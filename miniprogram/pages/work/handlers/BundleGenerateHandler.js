/**
 * 菲号生成弹窗处理器
 * 填写每扎数量，系统按色按码自动分扎生成菲号
 * 打开时自动带出全部颜色/码数/下单数量，员工只需填写每扎数量
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

const INITIAL_BUNDLE_MODAL = {
  visible: false,
  loading: false,
  orderId: '',
  orderNo: '',
  styleNo: '',
  colorGroups: [],
  allSizes: [],
  bundleSize: '',
  excessRate: '',   // 损耗加放比例（%），例如输入4表示4%
  bundleRows: [],   // 扁平列表: {color, size, orderedQty, cuttingQty, bundleCount}
  hasData: false,
  totalBundles: 0,
  totalCuttingQty: 0,
};

/**
 * 根据颜色/码数/每扎数量/损耗加放%构建扁平行列表
 * bundleSize 为空或 0 时 bundleCount = 0（显示 --）
 * excessRate > 0 时 cuttingQty 会大于 orderedQty
 */
function buildBundleRows(colorGroups, allSizes, bundleSize, excessRate) {
  var bs = parseInt(bundleSize, 10);
  var rate = parseFloat(excessRate) || 0;
  var rows = [];
  colorGroups.forEach(function(group) {
    allSizes.forEach(function(size, si) {
      var qty = (group.sizeQtyList && group.sizeQtyList[si]) || 0;
      if (qty <= 0) return;
      var cuttingQty = rate > 0 ? Math.ceil(qty * (1 + rate / 100)) : qty;
      var bundleCount = bs > 0 ? Math.ceil(cuttingQty / bs) : 0;
      var remainder = bs > 0 && bundleCount > 0 ? cuttingQty % bs : 0;
      rows.push({
        color: group.color || '',
        size: size,
        orderedQty: qty,
        cuttingQty: cuttingQty,
        bundleCount: bundleCount,
        lastBundleQty: bundleCount > 0 ? (remainder > 0 ? remainder : bs) : 0,
      });
    });
  });
  return rows;
}

function onGenerateBundle(ctx, e) {
  const order = e.currentTarget.dataset.order;
  if (!order || !order.id) { toast.error('订单信息错误'); return; }
  const colorGroups = order.colorGroups || [];
  const allSizes = order.allSizes || [];
  const bundleRows = buildBundleRows(colorGroups, allSizes, '');
  ctx.setData({
    bundleModal: Object.assign({}, INITIAL_BUNDLE_MODAL, {
      visible: true,
      orderId: order.id,
      orderNo: order.orderNo || '',
      styleNo: order.styleNo || '',
      colorGroups: colorGroups,
      allSizes: allSizes,
      bundleRows: bundleRows,
      hasData: bundleRows.length > 0,
    }),
  });
}

function onBundleSizeInput(ctx, e) {
  var val = (e.detail.value || '').trim();
  var bs = parseInt(val, 10);
  var modal = ctx.data.bundleModal;
  var bundleRows = buildBundleRows(modal.colorGroups, modal.allSizes, val, modal.excessRate);
  var totalBundles = bs > 0 ? bundleRows.reduce(function(sum, r) { return sum + r.bundleCount; }, 0) : 0;
  var totalCuttingQty = bundleRows.reduce(function(sum, r) { return sum + r.cuttingQty; }, 0);
  ctx.setData({
    'bundleModal.bundleSize': val,
    'bundleModal.bundleRows': bundleRows,
    'bundleModal.totalBundles': totalBundles,
    'bundleModal.totalCuttingQty': totalCuttingQty,
  });
}

function onExcessRateInput(ctx, e) {
  var val = (e.detail.value || '').trim();
  var modal = ctx.data.bundleModal;
  var bundleRows = buildBundleRows(modal.colorGroups, modal.allSizes, modal.bundleSize, val);
  var bs = parseInt(modal.bundleSize, 10);
  var totalBundles = bs > 0 ? bundleRows.reduce(function(sum, r) { return sum + r.bundleCount; }, 0) : 0;
  var totalCuttingQty = bundleRows.reduce(function(sum, r) { return sum + r.cuttingQty; }, 0);
  ctx.setData({
    'bundleModal.excessRate': val,
    'bundleModal.bundleRows': bundleRows,
    'bundleModal.totalBundles': totalBundles,
    'bundleModal.totalCuttingQty': totalCuttingQty,
  });
}

function onLastBundleQtyInput(ctx, e) {
  var index = e.currentTarget.dataset.index;
  var val = parseInt(e.detail.value, 10);
  if (isNaN(val) || val < 1) val = 1;
  ctx.setData({
    ['bundleModal.bundleRows[' + index + '].lastBundleQty']: val,
  });
}

function onCancelBundle(ctx) {
  ctx.setData({ bundleModal: Object.assign({}, INITIAL_BUNDLE_MODAL) });
}

async function onConfirmBundle(ctx) {
  const modal = ctx.data.bundleModal;
  const bundleSize = parseInt(modal.bundleSize, 10);
  if (!bundleSize || bundleSize <= 0) { toast.error('请填写每扎数量'); return; }

  const items = [];
  (modal.bundleRows || []).forEach(function(row) {
    if (!row.cuttingQty || row.cuttingQty <= 0 || !row.bundleCount || row.bundleCount <= 0) return;
    for (var b = 0; b < row.bundleCount - 1; b++) {
      items.push({ color: String(row.color || ''), size: String(row.size || ''), quantity: bundleSize });
    }
    items.push({ color: String(row.color || ''), size: String(row.size || ''), quantity: row.lastBundleQty || bundleSize });
  });

  if (items.length === 0) { toast.error('订单无有效数量，无法分扎'); return; }

  ctx.setData({ 'bundleModal.loading': true });
  try {
    const res = await api.production.generateCuttingBundles(modal.orderId, items);
    if (res.code === 200) {
      toast.success('菲号生成成功');
      onCancelBundle(ctx);
      ctx.loadOrders();
    } else {
      toast.error(res.message || '生成失败', 2000);
    }
  } catch (error) {
    const errMsg = error && error.errMsg ? error.errMsg : '生成失败，请重试';
    toast.error(errMsg, 2000);
  } finally {
    ctx.setData({ 'bundleModal.loading': false });
  }
}

module.exports = {
  INITIAL_BUNDLE_MODAL,
  onGenerateBundle,
  onBundleSizeInput,
  onExcessRateInput,
  onLastBundleQtyInput,
  onCancelBundle,
  onConfirmBundle,
};
