const api = require('../../../utils/api');
const { parseProductionOrderLines, SIZE_ORDER } = require('../utils/orderParser');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const blePrinter = require('../utils/blePrinter');

/**
 * 裁剪单明细页 bundle-detail
 * 入参：orderNo（订单号）
 * 功能：展示订单的下单数量、裁货数量、菲号明细，支持菲号标签打印
 */
Page({
  data: {
    loading: false,
    orderNo: '',
    orderId: '',

    /* 无参入口：订单选择列表 */
    showOrderList: false,
    orderListLoading: false,
    orderList: [],
    orderSearchKeyword: '',

    /* 订单基础信息 */
    orderInfo: null,
    coverImage: '',

    /* 模式：detailed = 详细（矩阵），simple = 简单（汇总行） */
    viewMode: 'detailed',

    /* 下单数量相关 */
    orderTotal: 0,
    /* 裁货数量相关 */
    cuttingTotal: 0,
    cuttingExcess: 0,
    maxBedNo: '-',
    operatorName: '-',
    latestBundleTime: '-',
    cuttingMatrix: { sizes: [], rows: [] },
    cuttingSimpleRows: [],
    hasBundles: false,
    _rawBundles: [],

    /* 菲号标签预览弹层 */
    showBundlePrintModal: false,

    LABEL_SIZES: {
      vertical: [
        { label: '40×60', w: 4, h: 6 },
        { label: '40×70', w: 4, h: 7 },
        { label: '40×80', w: 4, h: 8 },
        { label: '50×70', w: 5, h: 7 },
        { label: '50×100', w: 5, h: 10 },
      ],
      horizontal: [
        { label: '60×40', w: 6, h: 4 },
        { label: '70×40', w: 7, h: 4 },
        { label: '70×50', w: 7, h: 5 },
        { label: '80×40', w: 8, h: 4 },
        { label: '100×50', w: 10, h: 5 },
      ],
    },

    printConfig: {
      orientation: 'horizontal',
      paperWidth: 7,
      paperHeight: 4,
      selectedSizeLabel: '70×40',
      printMode: 'ble',
      wifiHost: '',
      wifiPort: 9100,
      previewW: 0,
      previewH: 0,
      previewQrSize: 0,
    },
    /* ── 裁剪分扎表单（无菲号时显示，与 PC 端 CuttingRatioPanel 一致）── */
    showCuttingForm: false,
    bundleSize: 20,
    excessRate: '',
    cuttingOrderLines: [],
    cuttingLinesHasData: false,
    cuttingSummary: { totalOrdered: 0, totalCutting: 0, totalBundles: 0 },
    cuttingSubmitting: false,

    /* ── Tab: detail(菲号明细) | transfer(转单) ── */
    activeTab: 'detail',

    /* ── 转单 Panel 数据 ── */
    transferTab: 'factory',
    transferMode: 'whole',
    transferModes: [{ id: 'whole', name: '整单转' }, { id: 'bundle', name: '菲号裁片转' }],
    _tfBundles: [],
    _tfBundlesLoading: false,
    selectedBundles: {},
    allSelected: false,
    selectedBundleCount: 0,
    processes: [],
    processesLoading: false,
    selectedProcessCodes: {},
    allProcessSelected: false,
    selectedProcessCount: 0,
    priceOverrides: {},
    factories: [],
    factoriesLoading: false,
    factoryKeyword: '',
    factoryPage: 1,
    factoryHasMore: false,
    selectedFactory: null,
    users: [],
    usersLoading: false,
    userKeyword: '',
    userPage: 1,
    userHasMore: false,
    selectedUser: null,
    remark: '',
    submitting: false,
  },

  onLoad(options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;

    const orderNo = decodeURIComponent(options.orderNo || '');
    const orderId = decodeURIComponent(options.orderId || '');
    this.setData({ orderNo, orderId });

    if (orderNo) {
      // 判断是否为外部「转单」入口（如 dashboard 的"转单"按钮传入 tab=transfer）
      const isTransferEntry = options.tab === 'transfer';
      this.loadAll(orderNo).then(() => {
        if (isTransferEntry) {
          // 整单转单不依赖菲号，loadCuttingBundles 可能已将 showCuttingForm 设为 true
          // 这里强制覆盖：进入转单 Tab，隐藏裁剪分扎表单
          this.setData({ activeTab: 'transfer', showCuttingForm: false });
          this._initTransferPanel();
        }
      });
    } else {
      // 从首页直接进来（无参数）→ 显示订单列表供选择
      this.setData({ showOrderList: true });
      this._loadOrderList();
    }
  },

  onPullDownRefresh() {
    const { orderNo, showOrderList } = this.data;
    if (showOrderList) {
      this._loadOrderList().finally(() => wx.stopPullDownRefresh());
    } else if (orderNo) {
      this.loadAll(orderNo).finally(() => wx.stopPullDownRefresh());
    } else {
      wx.stopPullDownRefresh();
    }
  },

  /* ------------------------------------------------------------------ */
  /*  订单选择列表（无参入口模式）                                           */
  /* ------------------------------------------------------------------ */

  /** 加载裁剪中的订单列表 */
  _loadOrderList(keyword) {
    this.setData({ orderListLoading: true });
    // 排除终态订单（completed/cancelled/scrapped/archived/closed），显示所有进行中订单
    const params = { page: 1, pageSize: 50, excludeTerminal: 'true' };
    if (keyword) params.keyword = keyword;
    return api.production.listOrders(params)
      .then(res => {
        let list = this._extractList(res);
        // 处理每个订单的款式图片 URL（后端返回相对路径，需拼完整地址+token）
        list = list.map(order => ({
          ...order,
          styleCoverUrl: getAuthedImageUrl(order.styleCover || order.styleImageUrl || order.coverImage || ''),
          // 交期兜底：PC 端下单用 plannedEndDate，统一归一到 deliveryDate 供模板显示
          deliveryDate: order.expectedShipDate || order.deliveryDate
            || (order.plannedEndDate ? order.plannedEndDate.slice(0, 10) : ''),
          expectedShipDate: order.expectedShipDate ? this._formatDeliveryDate(order.expectedShipDate) : '',
        }));
        this.setData({ orderList: list, orderListLoading: false });
      })
      .catch(() => {
        this.setData({ orderListLoading: false });
        toast.error('订单列表加载失败');
      });
  },

  /** 搜索框输入 */
  onOrderSearchInput(e) {
    this.setData({ orderSearchKeyword: e.detail.value || '' });
  },

  /** 搜索确认 */
  onOrderSearchConfirm() {
    this._loadOrderList(this.data.orderSearchKeyword.trim());
  },

  /** 选择订单，进入明细视图 */
  onSelectOrder(e) {
    const order = e.currentTarget.dataset.order || {};
    const orderNo = order.orderNo || '';
    const orderId = String(order.id || '');
    if (!orderNo) return;
    this.setData({ showOrderList: false, orderNo, orderId });
    this.loadAll(orderNo);
  },

  /** 点击订单列表中的款式图片放大预览 */
  onPreviewSelImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  /* ------------------------------------------------------------------ */
  /*  数据加载                                                             */
  /* ------------------------------------------------------------------ */

  async loadAll(orderNo) {
    this.setData({ loading: true });
    try {
      await this.loadOrderInfo(orderNo);
      await this.loadCuttingBundles(orderNo);
    } catch (e) {
      console.error('[bundle-detail] loadAll error', e);
      toast.error('数据加载失败，请下拉刷新重试');
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 加载订单信息 + 工序数 + 下单矩阵 */
  async loadOrderInfo(orderNo) {
    try {
      const orderRes = await api.production.orderDetailByOrderNo(orderNo).catch(() => null);

      const order = this._extractOrder(orderRes);

      if (!order) return;

      // 交期兜底：PC 端创建订单时"交期"字段存入 plannedEndDate (LocalDateTime，如 "2026-06-15T00:00:00")
      // 小程序模板读 expectedShipDate || deliveryDate，故此处把 plannedEndDate 的日期部分归一到 deliveryDate
      if (!order.expectedShipDate && !order.deliveryDate && order.plannedEndDate) {
        order.deliveryDate = typeof order.plannedEndDate === 'string'
          ? order.plannedEndDate.slice(0, 10)
          : '';
      }
      if (order.expectedShipDate) {
        order.expectedShipDate = this._formatDeliveryDate(order.expectedShipDate);
      }

      const coverImage = getAuthedImageUrl(order.styleImageUrl || order.coverImage || order.imgUrl || '');
      const orderLines = parseProductionOrderLines(order);
      const { sizes, matrix } = this._buildMatrixData(orderLines);
      const orderTotal = orderLines.reduce((s, l) => s + (l.quantity || 0), 0);
      const orderMatrix = this._toSkuMatrix(matrix, sizes);
      const orderSimpleRows = this._toSimpleRows(matrix);

      this._orderMatrix = orderMatrix;
      this._orderSimpleRows = orderSimpleRows;
      this.setData({
        orderInfo: order,
        coverImage,
        orderTotal,
      });
    } catch (e) {
      console.error('[bundle-detail] loadOrderInfo error', e);
    }
  },

  /** 加载裁货菲号列表，聚合裁货矩阵 */
  async loadCuttingBundles(orderNo) {
    try {
      const res = await api.production.listBundles(orderNo, 1, 500).catch(() => null);
      const bundles = this._extractList(res);

      if (!bundles.length) {
        this.setData({
          cuttingTotal: 0, cuttingExcess: 0, maxBedNo: '-',
          operatorName: '-', latestBundleTime: '-',
          hasBundles: false, _rawBundles: [],
          cuttingMatrix: { sizes: [], rows: [] },
          cuttingSimpleRows: [],
          showCuttingForm: true,
        });
        this._parseAndSetCuttingLines(this.data.orderInfo);
        return;
      }

      const cuttingTotal = bundles.reduce((s, b) => s + (b.quantity || 0), 0);

      const lines = [];
      bundles.forEach(b => {
        if (b.color && b.size) {
          lines.push({ color: b.color, size: b.size, quantity: b.quantity || 0 });
        }
      });
      const { sizes, matrix } = this._buildMatrixData(lines);
      const cuttingMatrix = this._toSkuMatrix(matrix, sizes);
      const cuttingSimpleRows = this._toSimpleRows(matrix);

      // 床次（最大 bedNo）
      const bedNos = bundles.map(b => parseInt(b.bedNo, 10) || 0).filter(n => n > 0);
      const maxBedNo = bedNos.length ? Math.max(...bedNos) : '-';

      // 操作人（使用 operatorName，后端 select 返回此字段）
      const withOp = bundles.filter(b => b.operatorName);
      const operatorName = withOp.length ? withOp[withOp.length - 1].operatorName : '-';

      // 编菲时间（最新 createTime）
      const times = bundles
        .map(b => b.createTime || b.createdTime || '')
        .filter(Boolean)
        .sort();
      const latestBundleTime = times.length
        ? this._formatDateTime(times[times.length - 1])
        : '-';

      this.setData({
        cuttingTotal,
        cuttingMatrix,
        cuttingSimpleRows,
        maxBedNo: String(maxBedNo),
        operatorName,
        latestBundleTime,
        hasBundles: bundles.length > 0,
        _rawBundles: bundles,
      });

      // 计算多裁（需先等 orderTotal 设置完毕，这里用 setData 回调保证顺序）
      const excess = cuttingTotal - (this.data.orderTotal || 0);
      this.setData({ cuttingExcess: excess });
    } catch (e) {
      console.error('[bundle-detail] loadCuttingBundles error', e);
    }
  },

  /* ------------------------------------------------------------------ */
  /*  UI 交互                                                              */
  /* ------------------------------------------------------------------ */

  onModeChange(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ viewMode: mode });
  },

  onTabSwitch(e) {
    var tab = e.currentTarget.dataset.tab;
    this.setData({ activeTab: tab });
    if (tab === 'transfer') {
      this._initTransferPanel();
    }
  },

  onTransfer() {
    this.setData({ activeTab: 'transfer' });
    this._initTransferPanel();
  },

  /* ─── 菲号标签预览 & 打印 ─── */

  onPrintBundleLabels() {
    const { orderNo, _rawBundles } = this.data;
    if (!orderNo) return toast.error('数据未加载完成');
    if (!_rawBundles.length) {
      toast.info('暂无菲号数据，请先生成菲号');
      return;
    }
    this.setData({ showBundlePrintModal: true });
    this._computePreviewSize();
    this._generateQrImages(_rawBundles);
  },

  noop() {},

  _computePreviewSize() {
    var cfg = this.data.printConfig || {};
    var pw = cfg.paperWidth || 7;
    var ph = cfg.paperHeight || 4;
    var maxW = 650;
    var maxH = 400;
    var scale = Math.min(maxW / (pw * 10), maxH / (ph * 10));
    var w = Math.round(pw * 10 * scale);
    var h = Math.round(ph * 10 * scale);
    var minDim = Math.min(w, h);
    var qrSize = Math.round(minDim * 0.45);
    this.setData({
      'printConfig.previewW': w,
      'printConfig.previewH': h,
      'printConfig.previewQrSize': qrSize,
    });
  },

  onLabelSizeSelect(e) {
    var label = e.currentTarget.dataset.label;
    var d = this.data;
    var sizes = d.LABEL_SIZES[d.printConfig.orientation] || [];
    var found = null;
    for (var i = 0; i < sizes.length; i++) {
      if (sizes[i].label === label) { found = sizes[i]; break; }
    }
    if (!found) return;
    this.setData({
      'printConfig.paperWidth': found.w,
      'printConfig.paperHeight': found.h,
      'printConfig.selectedSizeLabel': found.label,
    });
    this._computePreviewSize();
    this._generateQrImages(d._rawBundles);
  },

  onPrintModeChange(e) {
    var mode = e.currentTarget.dataset.mode;
    this.setData({ 'printConfig.printMode': mode });
  },

  onWifiHostInput(e) {
    this.setData({ 'printConfig.wifiHost': (e.detail.value || '').replace(/^\s+|\s+$/g, '') });
  },

  onWifiPortInput(e) {
    var v = parseInt(e.detail.value, 10);
    if (isNaN(v) || v < 1) v = 9100;
    if (v > 65535) v = 65535;
    this.setData({ 'printConfig.wifiPort': v });
  },


  _generateQrImages(bundles) {
    var that = this;
    var drawQrcode = require('../utils/weapp-qrcode');
    var cfg = that.data.printConfig || {};
    var paperW = cfg.paperWidth || 7;
    var paperH = cfg.paperHeight || 4;
    var minDim = Math.min(Math.round(paperW * 10), Math.round(paperH * 10));
    var qrSize = minDim <= 40 ? 72 : minDim <= 50 ? 84 : minDim <= 70 ? 100 : 120;

    var query = wx.createSelectorQuery();
    query.select('#qrCanvas').fields({ node: true, size: true }).exec(function (res) {
      if (!res || !res[0] || !res[0].node) {
        console.warn('[bundle-detail] canvas node not found');
        return;
      }
      var canvas = res[0].node;

      var idx = 0;
      function drawNext() {
        if (idx >= bundles.length) return;
        var b = bundles[idx];
        if (!b.qrCode || b._qrImg) { idx++; drawNext(); return; }

        try {
          drawQrcode({
            canvas: canvas,
            canvasId: 'qrCanvas',
            width: qrSize,
            padding: 10,
            background: '#ffffff',
            foreground: '#000000',
            text: b.qrCode,
          });
        } catch (e) {
          console.warn('[bundle-detail] QR draw error', e);
          idx++;
          drawNext();
          return;
        }

        setTimeout(function () {
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0, y: 0, width: qrSize, height: qrSize,
            destWidth: qrSize, destHeight: qrSize,
            success: function (tmpRes) {
              b._qrImg = tmpRes.tempFilePath;
              that.setData({ ['_rawBundles[' + idx + ']._qrImg']: tmpRes.tempFilePath });
              idx++;
              drawNext();
            },
            fail: function () {
              idx++;
              drawNext();
            }
          });
        }, 150);
      }
      drawNext();
    });
  },

  onCloseBundlePrint() {
    this.setData({ showBundlePrintModal: false });
  },

  onDoBundlePrint() {
    var d = this.data;
    var bundles = d._rawBundles || [];
    if (!bundles.length) return;
    var cfg = d.printConfig || {};
    var paperW = cfg.paperWidth || 7;
    var paperH = cfg.paperHeight || 4;
    var minDim = Math.min(Math.round(paperW * 10), Math.round(paperH * 10));
    var qrCellSize = 5;
    if (minDim <= 35) qrCellSize = 3;
    else if (minDim <= 50) qrCellSize = 4;
    else if (minDim <= 80) qrCellSize = 5;
    else qrCellSize = 6;

    var printOpts = {
      qrCellSize: qrCellSize,
      orientation: cfg.orientation,
      paperWidth: paperW,
      paperHeight: paperH,
    };

    var printFn;
    if (cfg.printMode === 'wifi') {
      if (!cfg.wifiHost) {
        toast.info('请输入打印机IP地址');
        return;
      }
      printOpts.wifiHost = cfg.wifiHost;
      printOpts.wifiPort = cfg.wifiPort || 9100;
      printFn = blePrinter.wifiPrint;
    } else {
      printFn = blePrinter.blePrint;
    }

    printFn(bundles, d.orderNo, d.orderInfo, printOpts).catch(function (err) {
      wx.hideLoading();
      var msg = err && err.message ? err.message : '打印失败';
      wx.showModal({
        title: cfg.printMode === 'wifi' ? 'WiFi打印失败' : '蓝牙打印失败',
        content: msg,
        showCancel: false,
      });
    });
  },

  onOrientationChange(e) {
    var orient = e.currentTarget.dataset.orient;
    var cfg = this.data.printConfig;
    if (cfg.orientation === orient) return;
    var sizes = this.data.LABEL_SIZES[orient] || [];
    var first = sizes[0] || { w: orient === 'vertical' ? 4 : 7, h: orient === 'vertical' ? 6 : 4, label: orient === 'vertical' ? '40×60' : '60×40' };
    this.setData({
      'printConfig.orientation': orient,
      'printConfig.paperWidth': first.w,
      'printConfig.paperHeight': first.h,
      'printConfig.selectedSizeLabel': first.label,
    });
    this._computePreviewSize();
    this._generateQrImages(this.data._rawBundles);
  },

  previewImage() {
    const { coverImage } = this.data;
    if (coverImage) {
      wx.previewImage({ urls: [coverImage], current: coverImage });
    }
  },

  /* ------------------------------------------------------------------ */
  /*  辅助函数                                                              */
  /* ------------------------------------------------------------------ */

  _extractOrder(res) {
    if (!res) return null;
    if (res.records && res.records.length) return res.records[0];
    if (Array.isArray(res) && res.length) return res[0];
    if (res.id) return res;
    return null;
  },

  _extractList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.records && Array.isArray(res.records)) return res.records;
    return [];
  },

  /**
   * 将 [{color, size, quantity}] 汇聚成：
   *   sizes: 排好序的尺码数组
   *   matrix: { color: { size: total } }
   */
  _buildMatrixData(lines) {
    const sizeSet = new Set();
    const matrix = {};
    lines.forEach(({ color, size, quantity }) => {
      const c = color || '未知';
      const s = size || '-';
      sizeSet.add(s);
      if (!matrix[c]) matrix[c] = {};
      matrix[c][s] = (matrix[c][s] || 0) + (quantity || 0);
    });
    const sizes = Array.from(sizeSet).sort((a, b) => this._sizeOrder(a) - this._sizeOrder(b));
    return { sizes, matrix };
  },

  /** 转成 sku-matrix 组件所需格式 */
  _toSkuMatrix(matrix, sizes) {
    const rows = Object.keys(matrix).map(color => ({
      color,
      cells: sizes.map(size => ({ size, quantity: matrix[color][size] || 0 })),
    }));
    return { sizes, rows };
  },

  /** 转成简单模式：每色一行，只展示合计 */
  _toSimpleRows(matrix) {
    return Object.keys(matrix).map(color => {
      const total = Object.values(matrix[color]).reduce((s, q) => s + q, 0);
      return { color, total };
    });
  },

  /** 尺码排序权重（S/M/L/XL/XXL... 或数字尺码 110/120/122...） */
  _sizeOrder(size) {
    const textOrder = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7, '2XL': 6, '3XL': 7, '4XL': 8, '5XL': 9 };
    if (textOrder[size] !== undefined) return textOrder[size];
    const n = parseInt(size, 10);
    return isNaN(n) ? 99 : n;
  },

  /** 格式化日期时间 */
  _formatDateTime(str) {
    if (!str) return '-';
    try {
      const d = new Date(str.replace(/-/g, '/'));
      if (isNaN(d.getTime())) return str.substring(0, 16);
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    } catch (e) {
      return str.substring(0, 16);
    }
  },

  _formatDeliveryDate(str) {
    if (!str) return '';
    try {
      const d = new Date(str.replace(/-/g, '/'));
      if (isNaN(d.getTime())) return str.substring(0, 16);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch (e) {
      return str.substring(0, 16);
    }
  },

  /* =================== 转单 Panel =================== */

  _initTransferPanel() {
    var d = this.data;
    if (d.activeTab !== 'transfer') return;
    this._tfLoadTracking();
    this._tfLoadFactories();
    this._tfLoadUsers();
  },

  onTransferModeChange(e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === 'bundle' && !this.data.hasBundles) {
      toast.info('尚未生成菲号，请先在裁剪分扎中生成菲号后再进行裁片转单');
      return;
    }
    this.setData({ transferMode: mode, selectedBundles: {}, allSelected: false, selectedBundleCount: 0 });
  },

  /* ── 跟踪记录（菲号×工序扫码状态，用于判定已完成/可转单）── */

  _tfLoadTracking() {
    var that = this;
    var d = that.data;
    var oid = d.orderId || (d.orderInfo && d.orderInfo.id) || '';
    if (!oid) {
      that._tfTracking = [];
      that._tfLoadBundles([]);
      that._tfLoadProcesses([]);
      return;
    }

    api.production.getOrderTracking(String(oid)).then(function (records) {
      var list = Array.isArray(records) ? records : (records && records.records) || [];
      that._tfTracking = list;
      that._tfLoadBundles(list);
      that._tfLoadProcesses(list);
    }).catch(function () {
      that._tfTracking = [];
      that._tfLoadBundles([]);
      that._tfLoadProcesses([]);
    });
  },

  /* 根据 tracking 记录计算菲号是否已完成（所有工序皆已扫码 → 不可转单） */
  _tfBundleScanMap(trackingRecords) {
    var map = {};
    if (!trackingRecords || !trackingRecords.length) return map;
    trackingRecords.forEach(function (t) {
      var bid = t.cuttingBundleId;
      if (!bid) return;
      if (!map[bid]) map[bid] = { total: 0, scanned: 0 };
      map[bid].total += 1;
      if (t.scanStatus === 'scanned') map[bid].scanned += 1;
    });
    return map;
  },

  /* ── 菲号选择 ── */

  _tfLoadBundles(trackingRecords) {
    var that = this;
    var d = that.data;
    that.setData({ _tfBundlesLoading: true });

    var scanMap = that._tfBundleScanMap(trackingRecords);

    api.production.listBundles(d.orderNo, 1, 500).then(function (res) {
      var bundles = that._extractList(res);
      var list = bundles.map(function (b) {
        var bid = b.id;
        var s = scanMap[bid];
        var completed = s && s.total > 0 && s.scanned === s.total;
        var partialScanned = s && s.scanned > 0 && s.scanned < s.total;
        return {
          id: bid || b.bundleNo,
          bundleLabel: b.bundleNo || b.bundleLabel || bid,
          bundleNo: b.bundleNo || bid,
          color: b.color,
          size: b.size,
          quantity: b.quantity,
          _disabled: completed,
          _partialScanned: partialScanned,
          _statusCn: completed ? '已完成' : (partialScanned ? '部分已扫' : ''),
        };
      });
      that.setData({ _tfBundles: list, _tfBundlesLoading: false });
    }).catch(function () {
      that.setData({ _tfBundlesLoading: false });
    });
  },

  onToggleAllBundles() {
    var d = this.data;
    var bundles = d._tfBundles;
    var selected = {};
    var cnt = 0;
    if (!d.allSelected) {
      bundles.forEach(function (b) {
        if (!b._disabled) { selected[b.id] = true; cnt++; }
      });
    }
    this.setData({ selectedBundles: selected, allSelected: !d.allSelected, selectedBundleCount: cnt });
  },

  onToggleBundle(e) {
    var id = e.currentTarget.dataset.id;
    var d = this.data;
    var bundle = d._tfBundles.find(function (b) { return b.id === id; });
    if (bundle && bundle._disabled) return;
    var selected = {};
    Object.keys(d.selectedBundles).forEach(function (k) { selected[k] = d.selectedBundles[k]; });
    if (selected[id]) { delete selected[id]; } else { selected[id] = true; }
    var cnt = Object.keys(selected).length;
    this.setData({
      selectedBundles: selected,
      selectedBundleCount: cnt,
      allSelected: cnt > 0 && cnt === d._tfBundles.filter(function (b) { return !b._disabled; }).length,
    });
  },

  /* ── 工序单价 ── */

  _tfLoadProcesses(trackingRecords) {
    var that = this;
    var d = that.data;
    that.setData({ processesLoading: true });

    var scanMap = {};
    if (trackingRecords && trackingRecords.length) {
      trackingRecords.forEach(function (t) {
        var code = t.processCode;
        if (!code) return;
        if (!scanMap[code]) scanMap[code] = { total: 0, scanned: 0 };
        scanMap[code].total += 1;
        if (t.scanStatus === 'scanned') scanMap[code].scanned += 1;
      });
    }

    // 从 progressWorkflowJson 构建工序列表（不依赖扫码记录，订单有没有裁剪都能显示）
    function buildFromWorkflow(wfRaw) {
      if (!wfRaw) return [];
      try {
        var wf = typeof wfRaw === 'string' ? JSON.parse(wfRaw) : wfRaw;
        var result = [];
        // 优先用 processesByNode（含子工序明细单价）
        var pbn = wf && wf.processesByNode;
        if (pbn && typeof pbn === 'object') {
          Object.keys(pbn).forEach(function (stageKey) {
            var subList = pbn[stageKey];
            if (!Array.isArray(subList)) return;
            subList.forEach(function (n) {
              var code = n.id || n.processCode || n.name || '-';
              var price = Number(n.unitPrice || n.price || 0);
              var s = scanMap[code];
              result.push({
                processCode: code,
                processName: n.name || n.processName || '-',
                unitPrice: price,
                priceText: price > 0 ? '¥' + price.toFixed(2) : '待定价',
                pricePlaceholder: price > 0 ? price.toFixed(2) : '0.00',
                progressStage: stageKey,
                _completed: !!(s && s.total > 0 && s.scanned === s.total),
                _partialScanned: !!(s && s.scanned > 0 && s.scanned < s.total),
              });
            });
          });
          if (result.length > 0) return result;
        }
        // 回退：从 nodes（父节点汇总）构建
        var nodes = (wf && wf.nodes) || [];
        return nodes.map(function (n) {
          var code = n.id || n.processCode || n.name || '-';
          var price = Number(n.unitPrice || n.price || 0);
          var s = scanMap[code];
          return {
            processCode: code,
            processName: n.name || '-',
            unitPrice: price,
            priceText: price > 0 ? '¥' + price.toFixed(2) : '待定价',
            pricePlaceholder: price > 0 ? price.toFixed(2) : '0.00',
            progressStage: n.progressStage || '-',
            _completed: !!(s && s.total > 0 && s.scanned === s.total),
            _partialScanned: !!(s && s.scanned > 0 && s.scanned < s.total),
          };
        });
      } catch (e) { return []; }
    }

    api.production.queryOrderProcesses(d.orderNo).then(function (res) {
      var list = Array.isArray(res) ? res : (res && res.records) || [];
      if (list.length > 0) {
        // API 有数据时直接用（有扫码记录/跟踪记录的订单）
        var processes = list.map(function (p) {
          var code = p.processCode || p.code || '-';
          var price = Number(p.unitPrice || p.price || 0);
          var s = scanMap[code];
          return {
            processCode: code,
            processName: p.processName || p.name || '-',
            unitPrice: price,
            priceText: price > 0 ? '¥' + price.toFixed(2) : '待定价',
            pricePlaceholder: price > 0 ? price.toFixed(2) : '0.00',
            progressStage: p.progressStage || p.stage || '-',
            _completed: !!(s && s.total > 0 && s.scanned === s.total),
            _partialScanned: !!(s && s.scanned > 0 && s.scanned < s.total),
          };
        });
        that.setData({ processes: processes, processesLoading: false });
      } else {
        // API 返回空（无扫码记录时）→ fallback 到订单的 progressWorkflowJson
        var wfProcesses = buildFromWorkflow(d.orderInfo && d.orderInfo.progressWorkflowJson);
        that.setData({ processes: wfProcesses, processesLoading: false });
      }
    }).catch(function () {
      // 请求失败 → 同样 fallback 到 progressWorkflowJson
      var wfProcesses = buildFromWorkflow(d.orderInfo && d.orderInfo.progressWorkflowJson);
      that.setData({ processes: wfProcesses, processesLoading: false });
    });
  },

  onToggleAllProcesses() {
    var d = this.data;
    var allCodes = {};
    var cnt = 0;
    if (!d.allProcessSelected) {
      d.processes.forEach(function (p) {
        if (!p._completed) { allCodes[p.processCode] = true; cnt++; }
      });
    }
    this.setData({ selectedProcessCodes: allCodes, allProcessSelected: !d.allProcessSelected, selectedProcessCount: cnt });
  },

  onToggleTransferProcess(e) {
    var code = e.currentTarget.dataset.code;
    var d = this.data;
    var proc = d.processes.find(function (p) { return p.processCode === code; });
    if (proc && proc._completed) return;
    var selected = {};
    Object.keys(d.selectedProcessCodes).forEach(function (k) { selected[k] = d.selectedProcessCodes[k]; });
    if (selected[code]) { delete selected[code]; } else { selected[code] = true; }
    var cnt = Object.keys(selected).length;
    this.setData({
      selectedProcessCodes: selected,
      selectedProcessCount: cnt,
      allProcessSelected: cnt > 0 && cnt === d.processes.filter(function (p) { return !p._completed; }).length,
    });
  },

  onPriceInput(e) {
    var code = e.currentTarget.dataset.code;
    var v = e.detail.value;
    var d = this.data;
    var overrides = {};
    Object.keys(d.priceOverrides).forEach(function (k) { overrides[k] = d.priceOverrides[k]; });
    if (v === '' || v === null || v === undefined) { delete overrides[code]; } else {
      var n = parseFloat(v);
      if (!isNaN(n) && n >= 0) overrides[code] = n;
    }
    this.setData({ priceOverrides: overrides });
  },

  /* ── 工厂/人员 Tab ── */

  onTransferTabChange(e) {
    this.setData({ transferTab: e.currentTarget.dataset.tab });
  },

  /* ── 工厂搜索 ── */

  _tfLoadFactories() {
    var that = this;
    var d = that.data;
    that.setData({ factoriesLoading: true });

    api.production.transferSearchFactories(d.factoryKeyword || '', d.factoryPage || 1, 20).then(function (res) {
      var list = (res && res.records) || (res && res.list) || (Array.isArray(res) ? res : []);
      var factories = (d.factoryPage || 1) > 1 ? d.factories.concat(list) : list;
      that.setData({
        factories: factories,
        factoriesLoading: false,
        factoryHasMore: (res && (res.hasMore || res.total > factories.length)) || list.length >= 20,
      });
    }).catch(function () {
      that.setData({ factoriesLoading: false });
    });
  },

  onFactoryKeywordInput(e) {
    this.setData({ factoryKeyword: e.detail.value, factoryPage: 1, factories: [] });
    this._tfLoadFactories();
  },

  onSelectFactory(e) {
    var factory = e.currentTarget.dataset.factory;
    this.setData({ selectedFactory: factory });
  },

  onLoadMoreFactories() {
    var d = this.data;
    if (d.factoriesLoading || !d.factoryHasMore) return;
    var nextPage = (d.factoryPage || 1) + 1;
    this.setData({ factoryPage: nextPage });
    this._tfLoadFactories();
  },

  /* ── 人员搜索 ── */

  _tfLoadUsers() {
    var that = this;
    var d = that.data;
    that.setData({ usersLoading: true });

    api.production.transferSearchUsers(d.userKeyword || '', d.userPage || 1, 20).then(function (res) {
      var list = (res && res.records) || (res && res.list) || (Array.isArray(res) ? res : []);
      var users = (d.userPage || 1) > 1 ? d.users.concat(list) : list;
      that.setData({
        users: users,
        usersLoading: false,
        userHasMore: (res && (res.hasMore || res.total > users.length)) || list.length >= 20,
      });
    }).catch(function () {
      that.setData({ usersLoading: false });
    });
  },

  onUserKeywordInput(e) {
    this.setData({ userKeyword: e.detail.value, userPage: 1, users: [] });
    this._tfLoadUsers();
  },

  onSelectUser(e) {
    var user = e.currentTarget.dataset.user;
    this.setData({ selectedUser: user });
  },

  onLoadMoreUsers() {
    var d = this.data;
    if (d.usersLoading || !d.userHasMore) return;
    var nextPage = (d.userPage || 0) + 1;
    this.setData({ userPage: nextPage });
    this._tfLoadUsers();
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  /* ── 提交转单 ── */

  onSubmitTransfer() {
    var d = this.data;
    if (d.submitting) return;

    if (d.transferTab === 'factory' && !d.selectedFactory) return toast.info('请选择目标工厂');
    if (d.transferTab === 'user' && !d.selectedUser) return toast.info('请选择目标人员');

    if (d.transferMode === 'bundle') {
      var cnt = Object.keys(d.selectedBundles).length;
      if (!cnt) return toast.info('请至少选择一个菲号');
    }

    var payload = {
      orderNo: d.orderNo,
      orderId: d.orderId || (d.orderInfo && d.orderInfo.id) || '',
      transferMode: d.transferMode,
      transferTarget: d.transferTab === 'factory' ? 'factory' : 'user',
    };

    if (d.transferTab === 'factory') {
      payload.targetFactoryId = d.selectedFactory.id;
      payload.targetFactoryName = d.selectedFactory.factoryName || d.selectedFactory.name;
    } else {
      payload.targetUserId = d.selectedUser.id;
      payload.targetUserName = d.selectedUser.name || d.selectedUser.username;
    }

    if (d.transferMode === 'bundle') {
      payload.bundleIds = Object.keys(d.selectedBundles);
    }

    payload.processes = Object.keys(d.selectedProcessCodes).map(function (code) {
      var p = { processCode: code };
      if (d.priceOverrides[code] != null) p.newPrice = d.priceOverrides[code];
      return p;
    });

    if (d.remark) payload.remark = d.remark;

    this.setData({ submitting: true });

    var that = this;
    var apiFn = d.transferTab === 'factory'
      ? api.production.transferCreateToFactory
      : api.production.transferCreate;
    apiFn(payload).then(function () {
      toast.success('转单成功');
      that.setData({
        activeTab: 'detail', submitting: false,
        selectedBundles: {}, selectedBundleCount: 0, allSelected: false,
        selectedProcessCodes: {}, selectedProcessCount: 0, allProcessSelected: false,
        priceOverrides: {}, remark: '',
      });
    }).catch(function (err) {
      that.setData({ submitting: false });
      toast.error(err.message || '转单失败');
    });
  },

  /* =================== 裁剪分扎（来自 task-detail，与 PC 端 CuttingRatioPanel 一致）=================== */

  _parseAndSetCuttingLines(order) {
    if (!order) { this.setData({ cuttingLinesHasData: false }); return; }

    var lines = parseProductionOrderLines(order);
    if (!lines || !lines.length) {
      this.setData({ cuttingLinesHasData: false });
      return;
    }

    lines.sort(function (a, b) {
      if (a.color !== b.color) return (a.color || '').localeCompare(b.color || '');
      var ai = SIZE_ORDER.indexOf(a.size);
      var bi = SIZE_ORDER.indexOf(b.size);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });

    var cuttingOrderLines = lines.map(function (line, idx) {
      return {
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
      };
    });

    this.setData({ cuttingOrderLines: cuttingOrderLines });
    this._recalculateCutting();
  },

  _recalculateCutting() {
    var bsVal = parseInt(this.data.bundleSize, 10);
    var bs = isNaN(bsVal) || bsVal < 1 ? 20 : bsVal;
    var rateVal = parseFloat(this.data.excessRate);
    var rate = isNaN(rateVal) ? 0 : rateVal;
    var lines = this.data.cuttingOrderLines;

    var totalOrdered = 0;
    var totalCutting = 0;
    var totalBundles = 0;

    var updated = lines.map(function (line) {
      var orderQty = line.orderedQty || 0;
      totalOrdered += orderQty;

      var baseCuttingQty = rate > 0
        ? Math.ceil(orderQty * (1 + rate / 100))
        : orderQty;

      var bundles = baseCuttingQty > 0 ? Math.ceil(baseCuttingQty / bs) : 0;
      var remainder = bs > 0 ? baseCuttingQty % bs : 0;
      var defaultLastQty = remainder > 0 ? remainder : (bundles > 0 ? bs : 0);
      var lastQty = line.lastBundleOverride != null
        ? line.lastBundleOverride
        : defaultLastQty;
      var cuttingQty = bundles > 1
        ? (bundles - 1) * bs + lastQty
        : bundles === 1
          ? lastQty
          : 0;

      totalCutting += cuttingQty;
      totalBundles += bundles;

      var bundleDisplay = '-';
      if (bundles === 1) {
        bundleDisplay = '1\u00D7' + lastQty + '件';
      } else if (bundles > 1) {
        bundleDisplay = (bundles - 1) + '\u00D7' + bs + ' + 1\u00D7' + lastQty;
      }

      return {
        color: line.color,
        size: line.size,
        orderedQty: orderQty,
        cuttingQty: cuttingQty,
        bundleCount: bundles,
        lastBundleQty: lastQty,
        defaultLastQty: defaultLastQty,
        bundleDisplay: bundleDisplay,
        lastBundleOverride: line.lastBundleOverride,
        key: line.key,
      };
    });

    this.setData({
      cuttingOrderLines: updated,
      cuttingSummary: { totalOrdered: totalOrdered, totalCutting: totalCutting, totalBundles: totalBundles },
      cuttingLinesHasData: updated.length > 0,
    });
  },

  onBundleSizeInput(e) {
    var val = (e.detail.value || '').trim();
    var parsed = parseInt(val, 10);
    var lines = this.data.cuttingOrderLines.map(function (l) {
      return Object.assign({}, l, { lastBundleOverride: null });
    });
    this.setData({
      bundleSize: isNaN(parsed) || parsed < 1 ? '' : parsed,
      cuttingOrderLines: lines,
    });
    this._recalculateCutting();
  },

  onExcessRateInput(e) {
    var val = (e.detail.value || '').trim();
    var parsed = parseFloat(val);
    var lines = this.data.cuttingOrderLines.map(function (l) {
      return Object.assign({}, l, { lastBundleOverride: null });
    });
    this.setData({
      excessRate: isNaN(parsed) ? '' : parsed,
      cuttingOrderLines: lines,
    });
    this._recalculateCutting();
  },

  onLastBundleQtyInput(e) {
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var val = parseInt(e.detail.value, 10);
    if (isNaN(idx) || idx < 0 || idx >= this.data.cuttingOrderLines.length) return;
    var override = isNaN(val) || val < 1 ? null : val;
    var key = 'cuttingOrderLines[' + idx + '].lastBundleOverride';
    var obj = {};
    obj[key] = override;
    this.setData(obj);
    this._recalculateCutting();
  },

  onGenerateBundles() {
    if (this.data.cuttingSubmitting) return;
    var d = this.data;
    var cuttingOrderLines = d.cuttingOrderLines;
    var bundleSize = parseInt(d.bundleSize, 10) || 20;
    var orderId = d.orderId;
    var orderNo = d.orderNo;

    if (!orderId) return toast.error('缺少订单信息');
    if (!cuttingOrderLines.length) return toast.error('无可裁剪的尺码数据');

    var items = [];
    cuttingOrderLines.forEach(function (line) {
      if (line.cuttingQty <= 0 || line.bundleCount <= 0) return;
      for (var b = 0; b < line.bundleCount - 1; b++) {
        items.push({ color: String(line.color || ''), size: String(line.size || ''), quantity: bundleSize });
      }
      items.push({ color: String(line.color || ''), size: String(line.size || ''), quantity: line.lastBundleQty || bundleSize });
    });

    if (!items.length) return toast.error('无有效裁剪数量');

    var that = this;
    this.setData({ cuttingSubmitting: true });
    api.production.generateCuttingBundles(orderId, items).then(function () {
      toast.success('菲号生成成功');
      triggerDataRefresh('cutting');
      that.setData({ cuttingSubmitting: false, showCuttingForm: false });
      that.loadAll(orderNo);
    }).catch(function (err) {
      console.error('[bundle-detail] generateBundles error', err);
      toast.error('生成失败：' + (err.message || '请稍后重试'));
      that.setData({ cuttingSubmitting: false });
    });
  },
});
