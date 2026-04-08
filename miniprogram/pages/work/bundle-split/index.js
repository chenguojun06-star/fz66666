const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

/**
 * 简易 toast 函数包装
 * @param {string} msg 提示文字
 */
function showTip(msg) { toast.info(msg); }

Page({
  data: {
    orderNo: '',
    bundles: [],
    selectedIdx: -1,
    splitQty: '',
    workers: [],
    workerIdx: -1,
    loading: false,
    submitting: false,
    needSearch: false,
    searchOrderNo: '',
    splitRecords: [],
  },

  onLoad(options) {
    const orderNo = decodeURIComponent(options.orderNo || '');
    this.loadSplitRecords();
    if (!orderNo) {
      this.setData({ needSearch: true });
      this.loadWorkers();
      return;
    }
    this.setData({ orderNo, needSearch: false });
    this.fetchBundles();
    this.loadWorkers();
  },

  /* ---------- 手动输入订单号后查询 ---------- */
  onSearchInput(e) {
    this.setData({ searchOrderNo: e.detail.value || '' });
  },

  doSearch() {
    const orderNo = (this.data.searchOrderNo || '').trim();
    if (!orderNo) return showTip('请输入订单号');
    this.setData({ orderNo, needSearch: false });
    this.fetchBundles();
  },

  /* ---------- 扫描订单二维码 ---------- */
  scanOrderQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip('未识别到内容');
        this.setData({ orderNo: code, needSearch: false, searchOrderNo: code });
        this.fetchBundles();
      },
      fail: () => showTip('扫码取消'),
    });
  },

  /* ---------- 返回搜索界面重新选择订单 ---------- */
  changeOrder() {
    this.setData({ needSearch: true, orderNo: '', bundles: [], selectedIdx: -1 });
  },

  /* ---------- 查询该订单所有菲号 ---------- */
  async fetchBundles() {
    this.setData({ loading: true, bundles: [], selectedIdx: -1 });
    try {
      const res = await api.production.listBundles(this.data.orderNo);
      const raw = (res && res.data && res.data.records) || (res && res.data) || res || [];
      const list = Array.isArray(raw) ? raw : [];
      this.setData({ bundles: list, loading: false });
      if (!list.length) showTip('该订单暂无菲号');
    } catch (e) {
      console.error('[bundle-split] fetch fail', e);
      showTip('加载失败');
      this.setData({ loading: false });
    }
  },

  /* ---------- 加载工人列表 ---------- */
  async loadWorkers() {
    try {
      const app = getApp();
      const factoryId = (app.globalData && app.globalData.factoryId) || '';
      if (!factoryId) return;
      const res = await api.factoryWorker.list(factoryId);
      const list = Array.isArray(res) ? res : (res && res.data ? res.data : []);
      this.setData({ workers: list });
    } catch (e) {
      console.warn('[bundle-split] loadWorkers fail', e);
    }
  },

  /* ---------- 选择菲号 ---------- */
  selectBundle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({
      selectedIdx: this.data.selectedIdx === idx ? -1 : idx,
      splitQty: '',
      workerIdx: -1,
    });
  },

  /* ---------- 表单事件 ---------- */
  onQtyInput(e) {
    this.setData({ splitQty: e.detail.value || '' });
  },

  onWorkerChange(e) {
    this.setData({ workerIdx: Number(e.detail.value) });
  },

  /* ---------- 拆分记录本地存储 ---------- */
  loadSplitRecords() {
    try {
      const list = wx.getStorageSync('bundle_split_records') || [];
      this.setData({ splitRecords: list.slice(0, 50) });
    } catch (e) { /* ignore */ }
  },

  saveSplitRecord(orderNo, bundleNo, qty, workerName) {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const timeLabel = `${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const record = { orderNo, bundleNo, qty, workerName, time: now.getTime(), timeLabel };
    const list = [record, ...(this.data.splitRecords || [])].slice(0, 50);
    this.setData({ splitRecords: list });
    try { wx.setStorageSync('bundle_split_records', list); } catch (e) { /* ignore */ }
  },

  clearRecords() {
    wx.showModal({
      title: '确认清空',
      content: '清空所有拆分记录？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ splitRecords: [] });
        try { wx.removeStorageSync('bundle_split_records'); } catch (e) { /* ignore */ }
      },
    });
  },

  /* ---------- 提交拆分 ---------- */
  async submitSplit() {
    const { bundles, selectedIdx, splitQty, workers, workerIdx } = this.data;
    const bundle = bundles[selectedIdx];
    if (!bundle) return showTip('请先选择菲号');

    const qty = parseInt(splitQty, 10);
    if (!qty || qty <= 0) return showTip('请输入转出数量');
    if (qty >= (bundle.quantity || 0)) return showTip('转出数量需小于总数');

    const worker = workers[workerIdx];
    if (!worker) return showTip('请选择接手工人');

    this.setData({ submitting: true });
    try {
      const body = {
        bundleId: bundle.id,
        qrCode: bundle.qrCode || '',
        orderNo: bundle.productionOrderNo || this.data.orderNo,
        bundleNo: bundle.bundleNo,
        completedQuantity: (bundle.quantity || 0) - qty,
        transferQuantity: qty,
        toWorkerId: worker.id,
        toWorkerName: worker.workerName,
        reason: '',
      };
      await api.production.splitTransfer(body);
      showTip('拆分成功');
      this.saveSplitRecord(body.orderNo, bundle.bundleNo || bundle.bundleLabel, qty, worker.workerName);
      this.setData({ submitting: false, selectedIdx: -1, splitQty: '', workerIdx: -1 });
      this.fetchBundles();
    } catch (e) {
      console.error('[bundle-split] split fail', e);
      showTip('拆分失败');
      this.setData({ submitting: false });
    }
  },
});
