const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { parseProductionOrderLines } = require('../../../utils/orderParser');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

/**
 * 裁剪分扎页 — 与 PC 端 CuttingRatioPanel 对齐
 * 自动从订单 orderDetails 解析颜色×尺码×数量，按损耗/每扎件数自动计算分扎
 */
Page({
  data: {
    loading: false,
    submitting: false,
    taskId: '',
    orderNo: '',
    orderId: '',
    coverImage: '',
    taskInfo: {},
    /* 自动填充的裁剪行 [{color, size, orderedQty, cuttingQty, bundleCount,
       lastBundleQty, defaultLastQty, bundleDisplay, lastBundleOverride, key}] */
    orderLines: [],
    bundleSize: 20,
    excessRate: '',
    summary: { totalOrdered: 0, totalCutting: 0, totalBundles: 0 },
    hasData: false,
  },

  onLoad(options) {
    const taskId = options.taskId || '';
    const orderNo = decodeURIComponent(options.orderNo || '');
    const orderId = decodeURIComponent(options.orderId || '');
    this.setData({ taskId, orderNo, orderId });
    this._loadDetail();
  },

  /* ---- 加载任务详情 ---- */
  async _loadDetail() {
    this.setData({ loading: true });
    try {
      const { orderNo } = this.data;
      if (!orderNo) { this.setData({ loading: false }); return; }

      const orderRes = await api.production.orderDetailByOrderNo(orderNo);
      const order = this._extractFirst(orderRes);

      const taskRes = await api.production.getCuttingTaskByOrderId(orderNo);
      const task = this._extractFirst(taskRes);

      const taskInfo = {
        ...(task || {}),
        styleNo: order?.styleNo || task?.styleNo || '',
        color: task?.color || order?.color || '',
        orderQuantity: task?.orderQuantity || order?.orderQuantity || 0,
        orderId: order?.id || this.data.orderId,
      };

      const coverImage = getAuthedImageUrl(order?.coverImage || order?.styleImage || '');
      this.setData({
        taskInfo,
        coverImage,
        orderId: taskInfo.orderId || this.data.orderId,
        loading: false,
      });

      // 自动解析订单明细 → 填充颜色/尺码/数量
      this._parseAndSetOrderLines(order);
    } catch (e) {
      console.error('[CuttingDetail] load error', e);
      this.setData({ loading: false });
      toast.error('加载任务失败');
    }
  },

  _extractFirst(res) {
    if (Array.isArray(res) && res.length) return res[0];
    if (res?.records?.length) return res.records[0];
    if (res?.data?.length) return res.data[0];
    return res || null;
  },

  /** 点击封面图预览大图 */
  previewImage() {
    const url = this.data.coverImage;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

  /**
   * 解析 order.orderDetails JSON → 扁平 [{color, size, quantity}]
   * 与 PC 端 CuttingRatioPanel 的 entryOrderLines 数据对齐
   */
  _parseAndSetOrderLines(order) {
    if (!order) { this.setData({ hasData: false }); return; }

    const lines = parseProductionOrderLines(order);
    if (!lines || !lines.length) {
      this.setData({ hasData: false });
      return;
    }

    // 排序：先按颜色，再按标准服装尺码顺序
    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', '2XL', 'XXL', '3XL', 'XXXL', '4XL', '5XL'];
    lines.sort((a, b) => {
      if (a.color !== b.color) return (a.color || '').localeCompare(b.color || '');
      const ai = sizeOrder.indexOf(a.size);
      const bi = sizeOrder.indexOf(b.size);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    const orderLines = lines.map((line, idx) => ({
      color: line.color || '',
      size: line.size || '',
      orderedQty: line.quantity || 0,
      cuttingQty: 0,
      bundleCount: 0,
      lastBundleQty: 0,
      defaultLastQty: 0,
      bundleDisplay: '-',
      lastBundleOverride: null,
      key: (line.color || '') + '_' + (line.size || '') + '_' + idx,
    }));

    this.setData({ orderLines });
    this._recalculate();
  },

  /* ---- 核心计算：与 PC 端 CuttingRatioPanel 完全对齐 ---- */
  _recalculate() {
    const bs = parseInt(this.data.bundleSize, 10) || 20;
    const rate = parseFloat(this.data.excessRate) || 0;
    const lines = this.data.orderLines;

    let totalOrdered = 0;
    let totalCutting = 0;
    let totalBundles = 0;

    const updated = lines.map(line => {
      const orderQty = line.orderedQty || 0;
      totalOrdered += orderQty;

      // PC 端 CuttingRatioPanel.tsx 完全一致的公式
      const baseCuttingQty = rate > 0
        ? Math.ceil(orderQty * (1 + rate / 100))
        : orderQty;

      const bundles = baseCuttingQty > 0 ? Math.ceil(baseCuttingQty / bs) : 0;
      const remainder = bs > 0 ? baseCuttingQty % bs : 0;
      const defaultLastQty = remainder > 0 ? remainder : (bundles > 0 ? bs : 0);
      const lastQty = line.lastBundleOverride != null
        ? line.lastBundleOverride
        : defaultLastQty;
      const cuttingQty = bundles > 1
        ? (bundles - 1) * bs + lastQty
        : bundles === 1
          ? lastQty
          : 0;

      totalCutting += cuttingQty;
      totalBundles += bundles;

      // 分扎描述
      let bundleDisplay = '-';
      if (bundles === 1) {
        bundleDisplay = '1\u00D7' + lastQty + '件';
      } else if (bundles > 1) {
        bundleDisplay = (bundles - 1) + '\u00D7' + bs + ' + 1\u00D7' + lastQty;
      }

      return {
        ...line,
        cuttingQty,
        bundleCount: bundles,
        lastBundleQty: lastQty,
        defaultLastQty,
        bundleDisplay,
      };
    });

    this.setData({
      orderLines: updated,
      summary: { totalOrdered, totalCutting, totalBundles },
      hasData: updated.length > 0,
    });
  },

  /* ==== 输入事件 ==== */
  onBundleSizeInput(e) {
    const val = (e.detail.value || '').trim();
    const parsed = parseInt(val, 10);
    // 重置末扎覆盖值（与 PC 端 useEffect 行为一致）
    const lines = this.data.orderLines.map(l => ({ ...l, lastBundleOverride: null }));
    this.setData({
      bundleSize: isNaN(parsed) || parsed < 1 ? '' : parsed,
      orderLines: lines,
    });
    this._recalculate();
  },

  onExcessRateInput(e) {
    const val = (e.detail.value || '').trim();
    const parsed = parseFloat(val);
    // 重置末扎覆盖值
    const lines = this.data.orderLines.map(l => ({ ...l, lastBundleOverride: null }));
    this.setData({
      excessRate: isNaN(parsed) ? '' : parsed,
      orderLines: lines,
    });
    this._recalculate();
  },

  onLastBundleQtyInput(e) {
    const idx = parseInt(e.currentTarget.dataset.idx, 10);
    const val = parseInt(e.detail.value, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.data.orderLines.length) return;
    const override = isNaN(val) || val < 1 ? null : val;
    this.setData({ ['orderLines[' + idx + '].lastBundleOverride']: override });
    this._recalculate();
  },

  /* ==== 提交生成菲号 ==== */
  async onSubmit() {
    if (this.data.submitting) return;
    const { orderLines, orderId, bundleSize } = this.data;
    const bs = parseInt(bundleSize, 10) || 20;

    if (!orderId) return toast.error('缺少订单信息');
    if (!orderLines.length) return toast.error('无可裁剪的尺码数据');

    // 与 PC 端 CuttingRatioPanel.handleConfirm 一致的分扎逻辑
    const items = [];
    orderLines.forEach(line => {
      if (line.cuttingQty <= 0 || line.bundleCount <= 0) return;
      for (let b = 0; b < line.bundleCount - 1; b++) {
        items.push({
          color: String(line.color || ''),
          size: String(line.size || ''),
          quantity: bs,
        });
      }
      items.push({
        color: String(line.color || ''),
        size: String(line.size || ''),
        quantity: line.lastBundleQty || bs,
      });
    });

    if (!items.length) return toast.error('无有效裁剪数量');

    this.setData({ submitting: true });
    try {
      await api.production.generateCuttingBundles(orderId, items);
      toast.success('菲号生成成功');

      const eventBus = getApp()?.globalData?.eventBus;
      if (eventBus) {
        eventBus.emit('DATA_REFRESH', { type: 'cutting' });
        eventBus.emit('taskStatusChanged');
        eventBus.emit('refreshBellTasks');
      }

      setTimeout(() => wx.navigateBack(), 500);
    } catch (err) {
      console.error('[CuttingDetail] submit error', err);
      toast.error('生成失败：' + (err.message || '请稍后重试'));
    } finally {
      this.setData({ submitting: false });
    }
  },
});
