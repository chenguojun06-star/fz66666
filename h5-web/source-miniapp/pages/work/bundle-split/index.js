const i18n = require('../../../utils/i18n/index');
const NS = 'mp.bundleSplit.';
const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { displaySplitStatus } = require('../../../utils/displayHelper');

function showTip(msg) { toast.info(msg); }

Page({
  onCoverPreview: function (e) {
    const url = e.currentTarget.dataset.url;
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
    // D-517：可搜索选择器
    pickerVisible: false, pickerKey: '', pickerTitle: '', pickerOptions: [], pickerValue: '',
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
    const app = getApp();
    if (app.requireAuth && !app.requireAuth()) return;
    this._loadUnreadCount();
    this._checkAdmin();
    this.loadPendingSplits();
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        statusPendingCfm: i18n.t(NS + 'statusPendingCfm', lang),
        priceAdjustTitle: i18n.t(NS + 'priceAdjustTitle', lang),
        scanDirectTab: i18n.t(NS + 'scanDirectTab', lang),
        scanBundleTab: i18n.t(NS + 'scanBundleTab', lang),
        switchOrderTab: i18n.t(NS + 'switchOrderTab', lang),
        loadingBundles: i18n.t(NS + 'loadingBundles', lang),
        holdingLabel: i18n.t(NS + 'holdingLabel', lang),
        transferQtyLabel: i18n.t(NS + 'transferQtyLabel', lang),
        currentProcess: i18n.t(NS + 'currentProcess', lang),
        nextWorkerLabel: i18n.t(NS + 'nextWorkerLabel', lang),
        noBundlesOrder: i18n.t(NS + 'noBundlesOrder', lang),
        checkOrderHint: i18n.t(NS + 'checkOrderHint', lang),
        splitRecordsTab: i18n.t(NS + 'splitRecordsTab', lang),
        clearBtn: i18n.t('common.clear', lang),
        splitRequestTab: i18n.t(NS + 'splitRequestTab', lang),
        fromLabel: i18n.t(NS + 'fromLabel', lang),
        noPendingSplits: i18n.t(NS + 'noPendingSplits', lang),
        splitHintEmpty: i18n.t(NS + 'splitHintEmpty', lang),
        loadingProcess: i18n.t(NS + 'loadingProcess', lang),
        adminOnlyPrice: i18n.t(NS + 'adminOnlyPrice', lang),
        newPriceYuan: i18n.t(NS + 'newPriceYuan', lang),
        adjustReasonReq: i18n.t(NS + 'adjustReasonReq', lang),
        noProcessData: i18n.t(NS + 'noProcessData', lang),
        checkOrderStages: i18n.t(NS + 'checkOrderStages', lang),
        adjustRecordsTab: i18n.t(NS + 'adjustRecordsTab', lang),
        inputOrderNo: i18n.t(NS + 'inputOrderNo', lang),
        queryBtn: i18n.t(NS + 'queryBtn', lang),
        bundleWord: i18n.t('mp.scanResult.bundleWord', lang),
        processWord: i18n.t('mp.pattern.processWord', lang),
        qtyLabel: i18n.t('common.quantity', lang),
        cancel: i18n.t('common.cancel', lang),
        submitWord: i18n.t('common.submitting', lang),
        searchOrderPhW: i18n.t(NS + 'searchOrderPhW', lang),
        inputQtyPh: i18n.t(NS + 'inputQtyPh', lang),
        pickProcessPh: i18n.t(NS + 'pickProcessPh', lang),
        pickWorkerPh: i18n.t(NS + 'pickWorkerPh', lang),
        remainFmt: i18n.t(NS + 'remainFmt', lang),
        keepUnit: i18n.t(NS + 'keepUnit', lang),
        transferTo: i18n.t(NS + 'transferTo', lang),
        confirmSplit: i18n.t(NS + 'confirmSplit', lang),
        confirmingW: i18n.t(NS + 'confirmingW', lang),
        receiveConfirm: i18n.t(NS + 'receiveConfirm', lang),
        orderNoLabel: i18n.t(NS + 'orderNoLabel', lang),
        searchProcessPh: i18n.t(NS + 'searchProcessPh', lang),
        bundleCountW: i18n.t(NS + 'bundleCountW', lang),
        newPricePh: i18n.t(NS + 'newPricePh', lang),
        adjustReasonPh: i18n.t(NS + 'adjustReasonPh', lang),
        confirmAdjustBtn: i18n.t(NS + 'confirmAdjustBtn', lang),
        reasonPrefix: i18n.t(NS + 'reasonPrefix', lang),
      },
    });
    wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
  },

  onLoad(options) {
    this.applyLanguage(i18n.getLanguage());
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
    if (!orderNo) return showTip(i18n.t(NS + 'inputOrderNo', this._lang));
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
        if (!code) return showTip(i18n.t(NS + 'unrecognized', this._lang));
        this.setData({ orderNo: code, needSearch: false, searchOrderNo: code });
        this.fetchBundles();
        this.fetchProcesses(code);
        this.fetchOrderCover(code);
      },
      fail: () => showTip(i18n.t(NS + 'scanCancelled', this._lang)),
    });
  },

  scanBundleQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip(i18n.t(NS + 'unrecognized', this._lang));
        this._handleBundleScan(code);
      },
      fail: () => showTip(i18n.t(NS + 'scanCancelled', this._lang)),
    });
  },

  async _handleBundleScan(qrCode) {
    this.setData({ loading: true, bundles: [], selectedIdx: -1 });
    try {
      const bundle = await api.production.getBundleByCode(qrCode);
      const data = bundle || {};
      if (!data || !data.id) {
        showTip(i18n.t(NS + 'notBundleQr', this._lang));
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
      let msg = i18n.t(NS + 'scanFailRetry', this._lang);
      if (e && e.message) {
        // ⚠️ indexOf 匹配的是后端中文错误消息，关键词保持中文原文
        if (e.message.indexOf('不存在') >= 0) msg = i18n.t(NS + 'bundleNotFound', this._lang);
        else if (e.message.indexOf('400') >= 0 || e.message.indexOf('参数') >= 0) msg = i18n.t(NS + 'qrFormatWrong', this._lang);
        else if (e.message.indexOf('网络') >= 0 || e.message.indexOf('timeout') >= 0) msg = i18n.t(NS + 'networkFail', this._lang);
        else msg = e.message.length > 30 ? i18n.t(NS + 'scanFailW', this._lang) : e.message;
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
      if (!list.length) showTip(i18n.t(NS + 'noBundleInOrder', this._lang));
    } catch (e) {
      console.error('[bundle-split] fetch fail', e);
      let msg = i18n.t(NS + 'loadBundlesFail', this._lang);
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

  /* ═══ D-517：工序 / 工人改可搜索选择器 ═══
     value 用数组下标（与原有 workerIdx / processIdx 语义一致，下游逻辑不用改） */
  _openPickerByKey(e) {
    const key = (e.currentTarget.dataset && e.currentTarget.dataset.key) || '';
    if (key === 'worker') {
      this.setData({
        pickerKey: key,
        pickerTitle: i18n.t(NS + 'pickWorkerTitle', this._lang),
        pickerValue: this.data.workerIdx >= 0 ? String(this.data.workerIdx) : '',
        pickerOptions: (this.data.workers || []).map(function (w, i) {
          return { label: w.workerName || w.name || '', value: String(i) };
        }).filter(function (o) { return o.label; }),
        pickerVisible: true,
      });
      return;
    }
    if (key === 'process') {
      this.setData({
        pickerKey: key,
        pickerTitle: i18n.t(NS + 'pickProcessTitle', this._lang),
        pickerValue: this.data.processIdx >= 0 ? String(this.data.processIdx) : '',
        pickerOptions: (this.data.processes || []).map(function (p, i) {
          return { label: p.processName || p.name || '', value: String(i) };
        }).filter(function (o) { return o.label; }),
        pickerVisible: true,
      });
    }
  },

  _onPickerSelectByKey(e) {
    const key = this.data.pickerKey;
    const idx = Number((e && e.detail && e.detail.value) || -1);
    if (idx < 0) return;
    if (key === 'worker') this.setData({ workerIdx: idx });
    else if (key === 'process') this.setData({ processIdx: idx });
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
      title: i18n.t(NS + 'confirmClear', this._lang),
      content: i18n.t(NS + 'clearAllRecords', this._lang),
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
    if (!bundle) return showTip(i18n.t(NS + 'pickBundleFirst', this._lang));

    const qty = parseInt(splitQty, 10);
    if (!qty || qty <= 0) return showTip(i18n.t(NS + 'inputTransferQty', this._lang));
    if (qty >= (bundle.quantity || 0)) return showTip(i18n.t(NS + 'qtyLessThanTotal', this._lang));

    const worker = workers[workerIdx];
    if (!worker) return showTip(i18n.t(NS + 'pickNextWorker', this._lang));

    const process = processes[processIdx];
    if (!process) return showTip(i18n.t(NS + 'pickCurProcess', this._lang));

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
      showTip(data.message || i18n.tf(NS + 'splitSentFmt', { name: worker.workerName }, this._lang));
      this.saveSplitRecord(body.orderNo, bundle.bundleNo || bundle.bundleLabel, qty, worker.workerName);
      this.setData({ submitting: false, selectedIdx: -1, splitQty: '', workerIdx: -1, processIdx: -1 });
      this.fetchBundles();
    } catch (e) {
      console.error('[bundle-split] request fail', e);
      let msg = i18n.t(NS + 'splitFail', this._lang);
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
      const rawList = Array.isArray(res) ? res : (res || []);
      const list = (rawList || []).map(function (item) {
        const st = displaySplitStatus(item.splitStatus);
        return Object.assign({}, item, {
          splitStatusText: st.text,
          splitStatusColorKey: String(item.splitStatus || '').trim().toLowerCase(),
        });
      });
      this.setData({ pendingSplits: list, pendingLoading: false });
    } catch (e) {
      console.warn('[bundle-split] loadPendingSplits fail', e);
      this.setData({ pendingLoading: false });
    }
  },

  async confirmPendingSplit(e) {
    const splitLogId = e.currentTarget.dataset.id;
    if (!splitLogId) return showTip(i18n.t(NS + 'recordInvalidW', this._lang));
    this.setData({ confirmingId: splitLogId });
    try {
      const res = await api.production.confirmSplit(splitLogId);
      const data = res || {};
      showTip(data.message || i18n.t(NS + 'receiveOk', this._lang));
      this.loadPendingSplits();
    } catch (err) {
      console.error('[bundle-split] confirmPendingSplit fail', err);
      let msg = i18n.t(NS + 'receiveFail', this._lang);
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
    if (!orderNo) return showTip(i18n.t(NS + 'inputOrderNo', this._lang));
    this.setData({ priceOrderNo: orderNo, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
    this.fetchPriceProcesses();
    this.fetchAdjustHistory();
  },

  scanPriceOrderQr() {
    wx.scanCode({
      onlyFromCamera: false,
      success: (res) => {
        const code = (res.result || '').trim();
        if (!code) return showTip(i18n.t(NS + 'unrecognized', this._lang));
        this.setData({ priceOrderNo: code, priceSearchInput: code, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
        this.fetchPriceProcesses();
        this.fetchAdjustHistory();
      },
      fail: () => showTip(i18n.t(NS + 'scanCancelled', this._lang)),
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
      if (!list.length) showTip(i18n.t(NS + 'noProcessData', this._lang));
    } catch (e) {
      console.error('[price-adjust] fetchPriceProcesses fail', e);
      showTip(i18n.t(NS + 'loadingProcess', this._lang));
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
    if (!this.data.isAdmin) return showTip(i18n.t(NS + 'adminOnlyPrice', this._lang));

    const { priceProcesses, selectedProcessIdx, adjustPrice, adjustReason, priceOrderNo } = this.data;
    const proc = priceProcesses[selectedProcessIdx];
    if (!proc) return showTip(i18n.t(NS + 'pickProcessFirst', this._lang));

    const price = parseFloat(adjustPrice);
    if (isNaN(price) || price < 0) return showTip(i18n.t(NS + 'inputValidPrice', this._lang));
    if (!adjustReason || !adjustReason.trim()) return showTip(i18n.t(NS + 'adjustReasonReq', this._lang));

    this.setData({ adjustSubmitting: true });
    try {
      await api.production.adjustProcessPrice({
        orderNo: priceOrderNo,
        processName: proc.processName,
        newPrice: price,
        reason: adjustReason.trim(),
      });
      showTip(i18n.t(NS + 'adjustOk', this._lang));
      this.setData({ adjustSubmitting: false, selectedProcessIdx: -1, adjustPrice: '', adjustReason: '' });
      this.fetchPriceProcesses();
      this.fetchAdjustHistory();
    } catch (e) {
      console.error('[price-adjust] submit fail', e);
      const msg = (e && e.message) || i18n.t(NS + 'adjustFail', this._lang);
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
  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */

  /* ── D-533：可搜索选择器的**统一入口** ─────────────────────────────────
     全仓只有这一个 openPicker / onPickerSelect，不再"东一个西一个"。
     两条分支（UI 与交互完全一致，都是同一个 search-picker 弹层）：
       · 行上带 data-handler → 通用式：选项数组名/range-key 由 data-* 传入
       · 行上只有 data-key  → 委托给本页原有的 _openPickerByKey，行为一字不变 */
  openPicker: function (e) {
    var ds = e.currentTarget.dataset || {};
    if (!ds.handler && typeof this._openPickerByKey === 'function') {
      return this._openPickerByKey(e);
    }
    var arr = this.data[ds.names] || [];
    var rangeKey = ds.rangeKey || '';
    var opts = [];
    for (var i = 0; i < arr.length; i++) {
      var it = arr[i];
      var label;
      if (rangeKey) {
        label = it ? it[rangeKey] : '';
      } else if (it && typeof it === 'object') {
        label = it.label != null ? it.label : (it.name != null ? it.name : '');
      } else {
        label = it;
      }
      label = String(label == null ? '' : label);
      if (!label) continue;
      opts.push({ label: label, value: String(i) });
    }
    this._pickerHandler = ds.handler || '';
    this.setData({
      pickerTitle: ds.title || i18n.t('common.pleaseSelect', this._lang),
      pickerOptions: opts,
      pickerValue: '',
      pickerVisible: true,
    });
  },

  onPickerSelect: function (e) {
    var handler = this._pickerHandler;
    if (handler && typeof this[handler] === 'function') {
      this[handler]({ detail: { value: Number(e.detail.value) } });
      return;
    }
    if (typeof this._onPickerSelectByKey === 'function') {
      return this._onPickerSelectByKey(e);
    }
  },

  onPickerClose: function () {
    this.setData({ pickerVisible: false });
  },

});
