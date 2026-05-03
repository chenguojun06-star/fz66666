const api = require('../../../utils/api');
const { parseProductionOrderLines } = require('../../../utils/orderParser');
const { toast } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

/**
 * 裁剪单明细页 bundle-detail
 * 入参：orderNo（订单号）
 * 功能：展示订单的下单数量、裁货数量、成品数量的颜色×尺码矩阵，支持详细/简单模式切换
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
    processCount: 0,
    processList: [],       // 工序详情列表
    showProcessList: false, // 是否展开工序列表

    /* 模式：detailed = 详细（矩阵），simple = 简单（汇总行） */
    viewMode: 'detailed',

    /* 下单数量相关 */
    orderTotal: 0,
    orderMatrix: { sizes: [], rows: [] },
    orderSimpleRows: [],   // [{color, total}]

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
  },

  onLoad(options) {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;

    const orderNo = decodeURIComponent(options.orderNo || '');
    const orderId = decodeURIComponent(options.orderId || '');
    this.setData({ orderNo, orderId });

    if (orderNo) {
      this.loadAll(orderNo);
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
      const [orderRes, processRes] = await Promise.all([
        api.production.orderDetailByOrderNo(orderNo).catch(() => null),
        api.production.getProcessConfig(orderNo).catch(() => null),
      ]);

      const order = this._extractOrder(orderRes);
      const processCount = this._extractProcessCount(processRes);
      const processList = this._extractProcessList(processRes);

      if (!order) {
        this.setData({ processCount, processList });
        return;
      }

      const coverImage = getAuthedImageUrl(order.styleImageUrl || order.coverImage || order.imgUrl || '');
      const orderLines = parseProductionOrderLines(order);
      const { sizes, matrix } = this._buildMatrixData(orderLines);
      const orderTotal = orderLines.reduce((s, l) => s + (l.quantity || 0), 0);
      const orderMatrix = this._toSkuMatrix(matrix, sizes);
      const orderSimpleRows = this._toSimpleRows(matrix);

      this.setData({
        orderInfo: order,
        coverImage,
        processCount,
        processList,
        orderTotal,
        orderMatrix,
        orderSimpleRows,
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

      if (!bundles.length) return;

      // 聚合颜色×尺码矩阵
      const lines = [];
      bundles.forEach(b => {
        if (b.color && b.size) {
          lines.push({ color: b.color, size: b.size, quantity: b.quantity || 0 });
        }
      });

      const cuttingTotal = lines.reduce((s, l) => s + l.quantity, 0);
      const { sizes, matrix } = this._buildMatrixData(lines);
      const cuttingMatrix = this._toSkuMatrix(matrix, sizes);
      const cuttingSimpleRows = this._toSimpleRows(matrix);

      // 床次（最大 bedNo）
      const bedNos = bundles.map(b => parseInt(b.bedNo, 10) || 0).filter(n => n > 0);
      const maxBedNo = bedNos.length ? Math.max(...bedNos) : '-';

      // 操作人（使用菲号创建者姓名，非最后修改人）
      const creators = bundles.filter(b => b.creatorName);
      const operatorName = creators.length ? creators[creators.length - 1].creatorName : '-';

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

  onTransfer() {
    const { orderNo, orderId } = this.data;
    if (!orderNo) return toast.error('数据未加载完成');
    wx.navigateTo({
      url: '/pages/cutting/transfer/index?orderId=' + encodeURIComponent(orderId || '') + '&orderNo=' + encodeURIComponent(orderNo),
    });
  },

  onGoProcess() {
    const { orderNo, processCount } = this.data;
    if (!orderNo) return;
    if (processCount === 0) {
      toast.info('暂无工序信息');
      return;
    }
    // 展开/折叠工序列表
    this.setData({ showProcessList: !this.data.showProcessList });
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
  },

  onCloseBundlePrint() {
    this.setData({ showBundlePrintModal: false });
  },

  onDoBundlePrint() {
    const d = this.data;
    const bundles = d._rawBundles || [];
    if (!bundles.length) return;
    var html = this._buildPrintText(bundles);
    this._bluetoothPrint(html);
  },

  _buildPrintText(bundles) {
    var lines = [];
    lines.push('══════════════════');
    lines.push('订单：' + this.data.orderNo);
    lines.push('款号：' + (this.data.orderInfo && this.data.orderInfo.styleNo || '-'));
    lines.push('══════════════════');
    lines.push('');
    bundles.forEach(function (b) {
      lines.push('【F' + (b.bundleNo != null ? b.bundleNo : '-') + '】');
      lines.push('  颜色：' + (b.color || '-'));
      lines.push('  尺码：' + (b.size || '-'));
      lines.push('  数量：' + (b.quantity || 0) + ' 件');
      lines.push('  ──────────────');
    });
    lines.push('');
    lines.push('打印时间：' + this._nowStr());
    return lines.join('\n');
  },

  _nowStr() {
    var d = new Date();
    var pad = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  },

  /* ─── 蓝牙打印 ─── */

  _bluetoothPrint(html) {
    wx.openBluetoothAdapter({
      success: function () {
        wx.startBluetoothDevicesDiscovery({
          success: function () {
            wx.showLoading({ title: '搜索打印机...' });
            setTimeout(function () {
              wx.stopBluetoothDevicesDiscovery();
              wx.getBluetoothDevices({
                success: function (res) {
                  wx.hideLoading();
                  var devices = (res.devices || []).filter(function (d) {
                    return d.name && d.name.length > 0;
                  });
                  if (!devices.length) {
                    wx.showToast({ title: '未找到蓝牙打印机', icon: 'none' });
                    return;
                  }
                  wx.showActionSheet({
                    itemList: devices.map(function (d) { return d.name; }),
                    success: function (tapRes) {
                      var device = devices[tapRes.tapIndex];
                      this._connectBtPrinter(device.deviceId, html);
                    }.bind(this)
                  });
                }.bind(this),
                fail: function () { wx.hideLoading(); }
              });
            }.bind(this), 3000);
          }.bind(this),
          fail: function () { wx.showToast({ title: '请开启蓝牙', icon: 'none' }); }
        });
      }.bind(this),
      fail: function () { wx.showToast({ title: '请开启手机蓝牙', icon: 'none' }); }
    });
  },

  _connectBtPrinter(deviceId, html) {
    wx.createBLEConnection({
      deviceId: deviceId,
      success: function () {
        wx.getBLEDeviceServices({
          deviceId: deviceId,
          success: function (res) {
            var services = res.services || [];
            if (!services.length) { wx.showToast({ title: '打印机服务不可用', icon: 'none' }); return; }
            var serviceId = services[0].uuid;
            wx.getBLEDeviceCharacteristics({
              deviceId: deviceId,
              serviceId: serviceId,
              success: function (charRes) {
                var chars = charRes.characteristics || [];
                var writeChar = chars.find(function (c) { return c.properties.write; });
                if (!writeChar) { wx.showToast({ title: '打印机不支持写入', icon: 'none' }); return; }
                var plainText = html.trim();
                var buffer = new ArrayBuffer(plainText.length);
                var view = new Uint8Array(buffer);
                for (var i = 0; i < plainText.length; i++) { view[i] = plainText.charCodeAt(i); }
                wx.writeBLECharacteristicValue({
                  deviceId: deviceId, serviceId: serviceId, characteristicId: writeChar.uuid, value: buffer,
                  success: function () {
                    wx.showToast({ title: '打印指令已发送', icon: 'success' });
                    setTimeout(function () { wx.closeBLEConnection({ deviceId: deviceId }); }, 2000);
                  },
                  fail: function () { wx.showToast({ title: '打印失败', icon: 'none' }); }
                });
              }
            });
          }
        });
      },
      fail: function () { wx.showToast({ title: '连接打印机失败', icon: 'none' }); }
    });
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

  _extractProcessCount(res) {
    if (!res) return 0;
    if (Array.isArray(res)) return res.length;
    if (res.processes && Array.isArray(res.processes)) return res.processes.length;
    if (res.total) return res.total;
    return 0;
  },

  _extractProcessList(res) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (res.processes && Array.isArray(res.processes)) return res.processes;
    return [];
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
});
