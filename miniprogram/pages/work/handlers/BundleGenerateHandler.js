/**
 * 菲号生成弹窗处理器
 * 从 work/index.js 提取，处理生成菲号（裁剪分菲）的交互
 */
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

/**
 * 菲号弹窗初始状态
 */
const INITIAL_BUNDLE_MODAL = {
  visible: false,
  loading: false,
  orderId: '',
  orderNo: '',
  styleNo: '',
  items: [{ color: '', size: '', quantity: '' }],
};

/**
 * 打开菲号生成弹窗
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onGenerateBundle(ctx, e) {
  const order = e.currentTarget.dataset.order;
  if (!order || !order.id) {
    toast.error('订单信息错误');
    return;
  }

  ctx.setData({
    bundleModal: {
      visible: true,
      loading: false,
      orderId: order.id,
      orderNo: order.orderNo || '',
      styleNo: order.styleNo || '',
      items: [{ color: '', size: '', quantity: '' }],
    },
  });
}

/**
 * 菲号条目字段输入
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onBundleFieldInput(ctx, e) {
  const { idx, field } = e.currentTarget.dataset;
  const value = e.detail.value;
  const items = [...ctx.data.bundleModal.items];
  items[idx][field] = value;
  ctx.setData({ 'bundleModal.items': items });
}

/**
 * 新增菲号条目
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onAddBundleItem(ctx) {
  const items = [...ctx.data.bundleModal.items, { color: '', size: '', quantity: '' }];
  ctx.setData({ 'bundleModal.items': items });
}

/**
 * 删除菲号条目
 * @param {Object} ctx - Page 上下文
 * @param {Object} e - 事件对象
 * @returns {void}
 */
function onRemoveBundleItem(ctx, e) {
  const idx = e.currentTarget.dataset.idx;
  const items = ctx.data.bundleModal.items.filter((_, i) => i !== idx);
  ctx.setData({ 'bundleModal.items': items });
}

/**
 * 取消菲号生成
 * @param {Object} ctx - Page 上下文
 * @returns {void}
 */
function onCancelBundle(ctx) {
  ctx.setData({
    bundleModal: { ...INITIAL_BUNDLE_MODAL },
  });
}

/**
 * 确认生成菲号
 * @param {Object} ctx - Page 上下文
 * @returns {Promise<void>} 生成完成后刷新列表
 */
async function onConfirmBundle(ctx) {
  const modal = ctx.data.bundleModal;

  const validItems = modal.items
    .map(item => ({
      color: String(item.color || '').trim(),
      size: String(item.size || '').trim(),
      quantity: Number(item.quantity) || 0,
    }))
    .filter(item => item.quantity > 0);

  if (validItems.length === 0) {
    toast.error('请至少填写一行有效数据');
    return;
  }

  const invalid = validItems.find(item => !item.color || !item.size);
  if (invalid) {
    toast.error('颜色和尺码不能为空');
    return;
  }

  ctx.setData({ 'bundleModal.loading': true });

  try {
    const res = await api.production.generateCuttingBundles(modal.orderId, validItems);

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
  onBundleFieldInput,
  onAddBundleItem,
  onRemoveBundleItem,
  onCancelBundle,
  onConfirmBundle,
};
