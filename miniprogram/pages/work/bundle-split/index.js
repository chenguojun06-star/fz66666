const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');

function showTip(msg) { toast.info(msg); }

Page({
  onCoverPreview: function (e) {
    var url = e.currentTarget.dataset.url;
    if (url) wx.previewImage({ current: url, urls: [url] });
  },

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
    orderStyleCover: '',
    submitting: false,
    needSearch: false,
    searchOrderNo: '',
    splitRecords: [],
    processes: [],
    processIdx: -1,

    /* ---- Tab1 待确认 ---- */
    pendingSplits: [],
    pendingLoading: false,
    confirmingId: '',

    /* ---- Tab2 单价调整 ---- */
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
    this.loadPendingSplits();
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
    this.fetchOrderCover(orderNo);
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
    this.fetchOrderCover(orderNo);
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
        this.fetchOrderCover(code);
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
      const data = bundle || {};
      if (!data || !data.id) {
        showTip('未找到该菲号，请确认扫的是菲号二维码');
        this.setData({ loading: false });
        return;
      }
      const orderNo = data.productionOrderNo || data.orderNo || '';
      // 扫码后自动展开表单（selectedIdx:0），用户无需再点击
      this.setData({
        orderNo: orderNo,
        needSearch: false,
        searchOrderNo: orderNo,
        bundles: [data],
        selectedIdx: 0,
        loading: false,
        splitQty: '',
        processIdx: -1,
        workerIdx: -1,
      });
      this.loadWorkers();
      this.fetchOrderCover(orderNo);
      // 传入 bundle 的 splitProcessName 作为工序自动识别提示
      this.fetchProcesses(orderNo, data.splitProcessName || data.currentProcess || '');
    } catch (e) {
      console.error('[bundle-split] scanBundle fail', e);
      var msg = '扫码识别失败，请重试';
      if (e && e.message) {
        if (e.message.indexOf('不存在') >= 0) msg = '未找到该菲号，请确认二维码正确';
        else if (e.message.indexOf('400') >= 0 || e.message.indexOf('参数') >= 0) msg = '二维码格式不正确，请确认扫的是菲号';
        else if (e.message.indexOf('网络') >= 0 || e.message.indexOf('timeout') >= 0) msg = '网络连接失败，请检查网络后重试';
        else msg = e.message.length > 30 ? '扫码识别失败' : e.message;
      }
      showTip(msg);
      this.setData({ loading: false });
    }
  },

  changeOrder() {
    this.setData({
      needSearch: true, orderNo: '',
      bundles: [], selectedIdx: -1,
      processes: [], processIdx: -1,
      orderStyleCover: '',
    });
  },

  async fetchOrderCover(orderNo) {
    if (!orderNo) return;
    try {
      const res = await api.production.orderDetail(orderNo);
      const records = (res && res.records) || (Array.isArray(res) ? res : []);
      const cover = records.length > 0 ? (records[0].styleCover || '') : '';
      this.setData({ orderStyleCover: cover });
    } catch (e) {
      // 封面图获取失败不影响主功能
      this.setData({ orderStyleCover: '' });
    }
  },

  async fetchBundles() {
    this.setData({ loading: true, bundles: [], selectedIdx: -1 });
    try {
      const res = await api.production.listBundles(this.data.orderNo);
      const raw = Array.isArray(res) ? res : (res && res.records) || [];
      const list = Array.isArray(raw) ? raw : [];
      // 仅一条菲号时自动选中，直接展示表单
      const autoIdx = list.length === 1 ? 0 : -1;
      this.setData({ bundles: list, selectedIdx: autoIdx, loading: false });
      if (!list.length) showTip('该订单暂无菲号');
    } catch (e) {
      console.error('[bundle-split] fetch fail', e);
      var msg = '加载菲号列表失败';
      if (e && e.message) msg = e.message.length > 20 ? msg : e.message;
      showTip(msg);
      this.setData({ loading: false });
    }
  },

  // 裁剪/采购/质检入库是顶层阶段名，不适合作为拆菲工序选项，默认过滤
  _HIDDEN_STAGES: ['裁剪', '采购', '质检入库', '质检', '入库'],

  async fetchProcesses(orderNo, hintProcessName) {
    if (!orderNo) return;
    try {
      const res = await api.production.queryOrderProcesses(orderNo);
      const raw = Array.isArray(res) ? res : (res || []);
      const hiddenStages = this._HIDDEN_STAGES;
      // 过滤顶层阶段名（裁剪/采购/质检入库等）
      const list = (Array.isArray(raw) ? raw : []).filter(p => {
        const name = (p.processName || '').trim();
        return !hiddenStages.includes(name);
      });
      // 自动识别当前工序：优先用 hintProcessName 精确匹配，再模糊匹配
      let autoIdx = -1;
      const hint = (hintProcessName || '').trim();
      if (hint) {
        autoIdx = list.findIndex(p => p.processName === hint);
        if (autoIdx < 0) {
          autoIdx = list.findIndex(p =>
            (p.processName || '').includes(hint) || hint.includes(p.processName || ''));
        }
      }
      this.setData({
        processes: list.map(p => ({
          processName: p.processName,
          progressStage: p.progressStage,
          unitPrice: p.unitPrice,
        })),
        processIdx: autoIdx,
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
      const list = Array.isArray(res) ? res : [];
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
      const res = await api.production.requestSplit(body);
      const data = res || {};
      showTip(data.message || '已发送拆菲请求，等待 ' + worker.workerName + ' 确认');
      this.saveSplitRecord(body.orderNo, bundle.bundleNo || bundle.bundleLabel, qty, worker.workerName);
      this.setData({ submitting: false, selectedIdx: -1, splitQty: '', workerIdx: -1, processIdx: -1 });
      this.fetchBundles();
    } catch (e) {
      console.error('[bundle-split] request fail', e);
      var msg = '拆菲请求失败';
      if (e && e.message) {
        if (e.message.indexOf('关单') >= 0 || e.message.indexOf('关闭') >= 0) msg = e.message;
        else if (e.message.indexOf('已完成') >= 0 || e.message.indexOf('取消') >= 0) msg = e.message;
        else if (e.message.indexOf('生产') >= 0) msg = e.message;
        else if (e.message.indexOf('工资') >= 0 || e.message.indexOf('结算') >= 0) msg = e.message;
        else if (e.message.length <= 30) msg = e.message;
      }
      showTip(msg);
      this.setData({ submitting: false });
    }
  },


  /* ========== Tab1 工序单价调整 ========== */

  async loadPendingSplits() {
    this.setData({ pendingLoading: true });
    try {
      const res = await api.production.listPendingSplits();
      const list = Array.isArray(res) ? res : (res || []);
      this.setData({ pendingSplits: Array.isArray(list) ? list : [], pendingLoading: false });
    } catch (e) {
      console.warn('[bundle-split] loadPendingSplits fail', e);
      this.setData({ pendingLoading: false });
    }
  },

  async confirmPendingSplit(e) {
    const splitLogId = e.currentTarget.dataset.id;
    if (!splitLogId) return showTip('请求记录无效');
    this.setData({ confirmingId: splitLogId });
    try {
      const res = await api.production.confirmSplit(splitLogId);
      const data = res || {};
      showTip(data.message || '已确认接收，菲号已转到你的名下');
      this.loadPendingSplits();
    } catch (err) {
      console.error('[bundle-split] confirmPendingSplit fail', err);
      var msg = '确认失败，请重试';
      if (err && err.message) msg = err.message.length > 30 ? msg : err.message;
      showTip(msg);
    } finally {
      this.setData({ confirmingId: '' });
    }
  },

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
      const list = Array.isArray(res) ? res : (res || []);
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
      const list = Array.isArray(res) ? res : (res || []);
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
        const count = Number(res) || 0;
        this.setData({ unreadNoticeCount: count });
      })
      .catch(e => { console.warn('[bundle-split] _loadUnreadCount fail:', e.message || e); });
  },
});
