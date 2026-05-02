const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

function showTip(msg) { toast.info(msg); }

Page({
  data: {
    activeTab: 0,

    /* ---- Tab0 拆菲号 ---- */
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
    processes: [],
    processIdx: -1,

    /* ---- Tab1 单价调整 ---- */
    priceOrderNo: '',
    priceSearchInput: '',
    priceProcesses: [],
    priceLoading: false,
    selectedProcessIdx: -1,
    adjustPrice: '',
    adjustReason: '',
    adjustSubmitting: false,
    adjustHistory: [],
    isAdmin: false,

    unreadNoticeCount: 0,
  },

  onShow() {
    var app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    this._loadUnreadCount();
    this._checkAdmin();
  },

  onLoad(options) {
    const orderNo = decodeURIComponent(options.orderNo || '');
    this.loadSplitRecords();
    this._checkAdmin();
    if (!orderNo) {
      this.setData({ needSearch: true });
      this.loadWorkers();
      return;
    }
    this.setData({ orderNo, needSearch: false });
    this.fetchBundles();
    this.loadWorkers();
  },

  /* ========== Tab 切换 ========== */
  switchTab(e) {
    const tab = Number(e.currentTarget.dataset.tab);
    this.setData({ activeTab: tab });
  },

  /* ========== Tab0 拆菲号 ========== */

  onSearchInput(e) {
    this.setData({ searchOrderNo: e.detail.value || '' });
  },

  doSearch() {
    const orderNo = (this.data.searchOrderNo || '').trim();
    if (!orderNo) return showTip('请输入订单号');
    this.setData({ orderNo, needSearch: false });
    this.fetchBundles();
    this.fetchProcesses(orderNo);
  },

  scanOrderQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip('未识别到内容');
        this.setData({ orderNo: code, needSearch: false, searchOrderNo: code });
        this.fetchBundles();
        this.fetchProcesses(code);
      },
      fail: () => showTip('扫码取消'),
    });
  },

  scanBundleQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip('未识别到内容');
        this._handleBundleScan(code);
      },
      fail: () => showTip('扫码取消'),
    });
  },

  async _handleBundleScan(qrCode) {
    this.setData({ loading: true, bundles: [], selectedIdx: -1 });
    try {
      const bundle = await api.production.getBundleByCode(qrCode);
      const data = (bundle && bundle.data) || bundle || {};
      if (!data || !data.id) {
        showTip('未找到该菲号，请确认二维码正确');
        this.setData({ loading: false });
        return;
      }
      const orderNo = data.productionOrderNo || data.orderNo || '';
      this.setData({
        orderNo: orderNo,
        needSearch: false,
        searchOrderNo: orderNo,
        bundles: [data],
        loading: false,
      });
      this.loadWorkers();
      this.fetchProcesses(orderNo);
      if (!data.bundleNo && !data.bundleLabel) {
        showTip('该码可能不是菲号');
      }
    } catch (e) {
      console.error('[bundle-split] scanBundle fail', e);
      showTip('扫码识别失败');
      this.setData({ loading: false });
    }
  },

  changeOrder() {
    this.setData({
      needSearch: true, orderNo: '',
      bundles: [], selectedIdx: -1,
      processes: [], processIdx: -1,
    });
  },

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

  async fetchProcesses(orderNo) {
    if (!orderNo) return;
    try {
      const res = await api.production.queryOrderProcesses(orderNo);
      const list = (res && res.data) || res || [];
      this.setData({
        processes: Array.isArray(list) ? list.map(p => ({
          processName: p.processName,
          progressStage: p.progressStage,
          unitPrice: p.unitPrice,
        })) : [],
      });
    } catch (e) {
      console.warn('[bundle-split] fetchProcesses fail', e);
    }
  },

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

  selectBundle(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    this.setData({
      selectedIdx: this.data.selectedIdx === idx ? -1 : idx,
      splitQty: '',
      workerIdx: -1,
      processIdx: -1,
    });
  },

  onQtyInput(e) {
    this.setData({ splitQty: e.detail.value || '' });
  },

  onWorkerChange(e) {
    this.setData({ workerIdx: Number(e.detail.value) });
  },

  onProcessChange(e) {
    this.setData({ processIdx: Number(e.detail.value) });
  },

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

  async submitSplit() {
    const { bundles, selectedIdx, splitQty, workers, workerIdx, processes, processIdx } = this.data;
    const bundle = bundles[selectedIdx];
    if (!bundle) return showTip('请先选择菲号');

    const qty = parseInt(splitQty, 10);
    if (!qty || qty <= 0) return showTip('请输入转出数量');
    if (qty >= (bundle.quantity || 0)) return showTip('转出数量需小于总数');

    const worker = workers[workerIdx];
    if (!worker) return showTip('请选择接手工人');

    const process = processes[processIdx];
    if (!process) return showTip('请选择当前工序');

    this.setData({ submitting: true });
    try {
      const body = {
        bundleId: bundle.id,
        qrCode: bundle.qrCode || '',
        orderNo: bundle.productionOrderNo || this.data.orderNo,
        bundleNo: bundle.bundleNo,
        currentProcessName: process.processName,
        completedQuantity: (bundle.quantity || 0) - qty,
        transferQuantity: qty,
        toWorkerId: worker.id,
        toWorkerName: worker.workerName,
        reason: '',
      };
      await api.production.splitTransfer(body);
      showTip('拆分成功，已通知双方');
      this.saveSplitRecord(body.orderNo, bundle.bundleNo || bundle.bundleLabel, qty, worker.workerName);
      this.setData({ submitting: false, selectedIdx: -1, splitQty: '', workerIdx: -1, processIdx: -1 });
      this.fetchBundles();
    } catch (e) {
      console.error('[bundle-split] split fail', e);
      showTip('拆分失败');
      this.setData({ submitting: false });
    }
  },

  /* ========== Tab1 工序单价调整 ========== */

  _checkAdmin() {
    const app = getApp();
    const role = (app.globalData && app.globalData.role) || '';
    const isTenantOwner = !!(app.globalData && app.globalData.isTenantOwner);
    const isAdmin = isTenantOwner || /admin|管理员/i.test(role);
    this.setData({ isAdmin });
  },

  onPriceSearchInput(e) {
    this.setData({ priceSearchInput: e.detail.value || '' });
  },

  doPriceSearch() {
    const orderNo = (this.data.priceSearchInput || '').trim();
    if (!orderNo) return showTip('请输入订单号');
    this.setData({ priceOrderNo: orderNo, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
    this.fetchPriceProcesses();
    this.fetchAdjustHistory();
  },

  scanPriceOrderQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip('未识别到内容');
        this.setData({ priceOrderNo: code, priceSearchInput: code, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
        this.fetchPriceProcesses();
        this.fetchAdjustHistory();
      },
      fail: () => showTip('扫码取消'),
    });
  },

  async fetchPriceProcesses() {
    const orderNo = this.data.priceOrderNo;
    if (!orderNo) return;
    this.setData({ priceLoading: true, priceProcesses: [] });
    try {
      const res = await api.production.queryOrderProcesses(orderNo);
      const list = (res && res.data) || res || [];
      this.setData({ priceProcesses: Array.isArray(list) ? list : [], priceLoading: false });
      if (!list.length) showTip('该订单暂无工序数据');
    } catch (e) {
      console.error('[price-adjust] fetchPriceProcesses fail', e);
      showTip('加载工序失败');
      this.setData({ priceLoading: false });
    }
  },

  async fetchAdjustHistory() {
    const orderNo = this.data.priceOrderNo;
    if (!orderNo) return;
    try {
      const res = await api.production.priceAdjustHistory(orderNo);
      const list = (res && res.data) || res || [];
      this.setData({ adjustHistory: Array.isArray(list) ? list.slice(0, 20) : [] });
    } catch (e) {
      console.warn('[price-adjust] fetchHistory fail', e);
    }
  },

  selectPriceProcess(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const isSame = this.data.selectedProcessIdx === idx;
    this.setData({
      selectedProcessIdx: isSame ? -1 : idx,
      adjustPrice: isSame ? '' : String(this.data.priceProcesses[idx].unitPrice || ''),
      adjustReason: '',
    });
  },

  onAdjustPriceInput(e) {
    this.setData({ adjustPrice: e.detail.value || '' });
  },

  onAdjustReasonInput(e) {
    this.setData({ adjustReason: e.detail.value || '' });
  },

  async submitAdjust() {
    if (!this.data.isAdmin) return showTip('仅管理员可调整单价');

    const { priceProcesses, selectedProcessIdx, adjustPrice, adjustReason, priceOrderNo } = this.data;
    const proc = priceProcesses[selectedProcessIdx];
    if (!proc) return showTip('请先选择工序');

    const price = parseFloat(adjustPrice);
    if (isNaN(price) || price < 0) return showTip('请输入有效单价');
    if (!adjustReason || !adjustReason.trim()) return showTip('请填写调整原因');

    this.setData({ adjustSubmitting: true });
    try {
      await api.production.adjustProcessPrice({
        orderNo: priceOrderNo,
        processName: proc.processName,
        newPrice: price,
        reason: adjustReason.trim(),
      });
      showTip('调整成功');
      this.setData({ adjustSubmitting: false, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
      this.fetchPriceProcesses();
      this.fetchAdjustHistory();
    } catch (e) {
      console.error('[price-adjust] submit fail', e);
      const msg = (e && e.message) || '调整失败';
      showTip(msg);
      this.setData({ adjustSubmitting: false });
    }
  },

  _loadUnreadCount() {
    api.notice.unreadCount()
      .then(res => {
        const count = (res && res.data != null) ? Number(res.data) : (Number(res) || 0);
        this.setData({ unreadNoticeCount: count });
      })
      .catch(e => { console.warn('[bundle-split] _loadUnreadCount fail:', e.message || e); });
  },
});
