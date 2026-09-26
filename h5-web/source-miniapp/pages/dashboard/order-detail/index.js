/**
 * 生产订单详情页（PC 端 ProgressDetail 风格）
 *
 * 调用 /api/production/order/flow/{id} 获取完整数据：
 *   - order        订单基本信息
 *   - stages       工序阶段列表（含开始/完成时间、操作人）
 *   - records      扫码记录
 *   - materialPurchases  物料采购
 *   - cuttingBundles     裁剪分扎
 *   - bomList      BOM 列表
 *   - styleQuotation     款式报价
 *
 * URL 参数：
 *   orderId  - 订单 ID（UUID，优先使用）
 *   orderNo  - 订单号（备用）
 */
const i18n = require('../../../utils/i18n/index');
const NS = 'mp.orderDetail.';
const production = require('../../../utils/api-modules/production');
// D-303：尺寸表 listSizes / fallbackToDetail 走全局 api（此前 _loadSizeSpec/fallbackToDetail 引用 api 但未导入，点击尺寸表即抛 api is not defined）
const api = require('../../../utils/api.js');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { parseProductionOrderLines, sortSizeNames } = require('../../../utils/orderParser');
// D-304：尺寸表透视/码数排序统一走共享工具（数字码从小到大 + 度量方式列）
const { buildSizeSpec } = require('../../../utils/sizeTableHelper.js');
const { getUserInfo } = require('../../../utils/storage');
const { eventBus, Events } = require('../../../utils/eventBus');
// 订单生命周期操作（scrap/complete/close）仅主管以上可见，与后端 ProductionOrderOperationController @PreAuthorize 一致
const permission = require('../../../utils/permission');

/* ========== 业务类型 / 物料类型 / 计价方式 中文化 ========== */
var BIZ_TYPE_LABELS = { FOB: 'fobLabel', ODM: 'odmLabel', OEM: 'oemLabel', CMT: 'cmtLabel' };
var MATERIAL_TYPE_LABELS = { fabricA: 'matMainA', fabricB: 'matMainB', liningA: 'matLiningA', liningB: 'matLiningB', liningC: 'matLiningC', accessoryA: 'matAccA', accessoryB: 'matAccB', accessoryC: 'matAccC' };
var PRICING_MODE_LABELS = { PROCESS: 'priceProcess', SIZE: 'priceSize', COST: 'priceOutWhole', QUOTE: 'priceQuote', MANUAL: 'priceManual' };

/* ========== 工具函数 ========== */
function fmt(val, fallback) { return (val != null && val !== '') ? val : (fallback || '-'); }
function fmtNum(v, fallback) { return (v != null && !isNaN(v)) ? Number(v) : (fallback || 0); }
/* 平台来源代码 → 中文名（统一使用共享模块，与销售/订单列表页保持一致） */
const { getPlatformName } = require('../../../utils/platformNames');
const {
  formatDate,
  formatDateTime,
  displayStatus,
  displayPurchaseStatus,
  STATUS_COLOR_DEFAULT,
  STATUS_COLOR_SUCCESS,
  STATUS_COLOR_PROCESSING,
  STATUS_COLOR_WARNING,
  STATUS_COLOR_ERROR,
  STATUS_COLOR_BLUE,
  STATUS_COLOR_CYAN,
} = require('../../../utils/displayHelper');

/* displayHelper 返回 {text, color}（color 为 CSS 变量），本页历史渲染用 {text, cls}（tag-* 类名）。
 * 统一用 colorToCls 把 color 转回 cls，保持模板兼容。 */
function colorToCls(color) {
  if (color === STATUS_COLOR_SUCCESS) return 'tag-success';
  if (color === STATUS_COLOR_WARNING) return 'tag-warning';
  if (color === STATUS_COLOR_PROCESSING) return 'tag-processing';
  if (color === STATUS_COLOR_ERROR) return 'tag-error';
  if (color === STATUS_COLOR_BLUE) return 'tag-processing';
  if (color === STATUS_COLOR_CYAN) return 'tag-processing';
  return 'tag-default';
}

/* 状态文本 + tag 类名（统一走 displayHelper.displayStatus，与 PC 端 / 列表页语义一致） */
function getStatusInfo(raw) {
  const result = displayStatus(raw);
  return { text: result.text, cls: colorToCls(result.color) };
}

/* 工序阶段状态（统一走 displayHelper.displayStatus） */
function getStageStatus(row) {
  const result = displayStatus(row && row.status);
  return { text: result.text, cls: colorToCls(result.color) };
}

/* 扫码记录类型文本 */
function getScanTypeText(r, lang) {
  const t = String(r && r.scanType || '');
  if (t === 'cutting') return i18n.t(NS + 'scanTypeCutting', lang);
  if (t === 'quality' || t === 'quality_check') return i18n.t(NS + 'scanTypeQuality', lang);
  if (t === 'warehousing') return i18n.t(NS + 'scanTypeWh', lang);
  if (t === 'secondary_process') return i18n.t(NS + 'scanTypeSecond', lang);
  if (t === 'car_sewing' || t === 'sewing') return i18n.t(NS + 'scanTypeSewing', lang);
  return t || i18n.t(NS + 'scanTypeScan', lang);
}
function getScanTypeClass(r) {
  const t = String(r && r.scanType || '');
  if (t === 'cutting') return 'scan-cutting';
  if (t === 'quality' || t === 'quality_check') return 'scan-quality';
  if (t === 'warehousing') return 'scan-warehouse';
  if (t === 'secondary_process') return 'scan-secondary';
  if (t === 'car_sewing' || t === 'sewing') return 'scan-sewing';
  return 'scan-default';
}

/* 从订单数据构建矩阵模型（与订单列表页 parseProductionOrderLines 保持一致的解析逻辑）
 * 返回：{ sizes: [尺码排序], rows: [{label, quantities, rowTotal}], total, hasData,
 *         colorGroups: [{color, sizeMap, total}], allSizes, colors: [颜色], sizeSummary: [{size, qty}] }
 */
function buildMatrixModel(order) {
  if (!order) return { rows: [], total: 0, hasData: false, allSizes: [], colors: [], sizeSummary: [] };

  // 1. 复用 parseProductionOrderLines 解析 SKU 明细（与列表页保持一致）
  var lines = parseProductionOrderLines(order);
  if (!lines || !lines.length) {
    return { rows: [], total: 0, hasData: false, allSizes: [], colors: [], sizeSummary: [] };
  }

  // 2. 收集所有尺码、颜色
  var sizeMap = {};
  var colorMap = {};
  var sizesRaw = [];
  var colorsRaw = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i];
    if (!sizeMap[ln.size]) { sizeMap[ln.size] = true; sizesRaw.push(ln.size); }
    if (!colorMap[ln.color]) { colorMap[ln.color] = true; colorsRaw.push(ln.color); }
  }

  // 3. 尺码排序
  var allSizes = sortSizeNames(sizesRaw);

  // 4. 按颜色聚合 sizeMap 对象 + 小计
  var colorRowMap = {};
  var colorOrder = [];
  var total = 0;
  var sizeTotals = {};
  for (var j = 0; j < lines.length; j++) {
    var line = lines[j];
    var c = line.color, s = line.size, q = line.quantity;
    if (!colorRowMap[c]) { colorRowMap[c] = {}; colorOrder.push(c); }
    colorRowMap[c][s] = (colorRowMap[c][s] || 0) + q;
    sizeTotals[s] = (sizeTotals[s] || 0) + q;
    total += q;
  }

  // 5. 构造矩阵行（颜色 × 尺码）
  var rows = [];
  for (var p = 0; p < colorOrder.length; p++) {
    var color = colorOrder[p];
    var quantities = allSizes.map(function (sz) { return colorRowMap[color][sz] || 0; });
    var rowTotal = quantities.reduce(function (s, v) { return s + v; }, 0);
    rows.push({ label: color, quantities: quantities, rowTotal: rowTotal });
  }

  // 6. 尺码汇总（每尺码合计）
  var sizeSummary = allSizes.map(function (sz) { return { size: sz, qty: sizeTotals[sz] || 0 }; });

  return {
    rows: rows,
    total: total,
    hasData: true,
    allSizes: allSizes,
    colors: colorsRaw,
    sizeSummary: sizeSummary,
  };
}

/* ========== 页面逻辑 ========== */
Page({
  data: {
    loading: true,
    orderId: '',
    orderNo: '',

    // 订单基本信息
    order: null,
    isEditable: false,
    // 主管以上才显示订单生命周期操作按钮（报废/完成/关闭），与后端 isSupervisorOrAbove 校验对齐
    isSupervisor: false,

    // 自定义确认弹窗（替代 wx.showModal editable，规避基础库 3.17.0 灰度版 bug）
    actionModal: {
      visible: false,
      type: '',        // complete | close | scrap
      title: '',
      desc: '',
      confirmText: '',
      confirmColor: '',
      placeholder: '',
      inputVal: '',
      inputRequired: false,
    },
    statusInfo: { text: '', cls: '' },
    deliveryDateStr: '',
    remainDaysText: '',
    remainDaysClass: '',
    totalQuantity: 0,
    completedQuantity: 0,
    remainQuantity: 0,
    progressPct: 0,
    specSummary: { colorText: '', sizeText: '', sizeList: [], qtyText: '', hasSpec: false },

    // 尺寸表（只读查看，D-252）：{sizeCols, rows}；D-303 加 sizeSpecHint 三态提示（无款式/未录数据/加载失败）
    sizeSpec: null,
    sizeSpecHint: '',

    // 工序阶段
    stages: [],

    // 扫码记录
    records: [],

    // 物料采购
    materialPurchases: [],
    hasMaterialPurchases: false,

    // BOM 列表
    bomList: [],
    hasBomList: false,

    // 裁剪分扎
    cuttingBundleList: [],
    bundleSummary: null,

    // 款式报价
    quotation: null,

    // 下单矩阵（颜色×尺码×数量）
    matrixModel: { rows: [], total: 0, hasData: false },

    // 图片列表（封面图 + 款式附件 + 订单备注图）
    imageList: [],
    currentImageIndex: 0,

    // 加载失败提示
    loadError: '',
  },

  /** 静态文案按语言写入（wxml 用 {{t.xxx}}） */
  applyLanguage: function (language) {
    var lang = i18n.locales[language] ? language : i18n.DEFAULT_LANG;
    this._lang = lang;
    this.setData({
      t: {
        loading: i18n.t('common.loading', lang),
        navTitle: i18n.t(NS + 'navTitle', lang),
        coverLabel: i18n.t(NS + 'coverLabel', lang),
        styleWord: i18n.t(NS + 'styleWord', lang),
        colorLabel: i18n.t('common.color', lang),
        sizeLabel: i18n.t('common.size', lang),
        qtyLabel: i18n.t('common.quantity', lang),
        firstOrder: i18n.t(NS + 'firstOrder', lang),
        repeatOrder: i18n.t(NS + 'repeatOrder', lang),
        urgentTag: i18n.t(NS + 'urgentTag', lang),
        styleNoLabel: i18n.t('mp.scanResult.styleNoLabel', lang),
        salesmanLabel: i18n.t(NS + 'salesmanLabel', lang),
        customerLabel: i18n.t('mp.pattern.customerLabel', lang),
        factoryLabel: i18n.t('mp.scanConfirm.factoryPrefix', lang).replace(':', ''),
        orderQtyLabel: i18n.t(NS + 'orderQtyLabel', lang),
        deliveryLabel: i18n.t('mp.scanResult.deliveryLabel', lang),
        totalQtyLabel: i18n.t('mp.scanConfirm.totalQtyLabel', lang),
        remainingLabel: i18n.t(NS + 'remainingLabel', lang),
        progressLabel: i18n.t(NS + 'progressLabel', lang),
        purchaseLabel: i18n.t('mp.pattern.opProcurement', lang),
        cuttingLabel: i18n.t(NS + 'scanTypeCutting', lang),
        processWord: i18n.t('mp.pattern.processWord', lang),
        transferLabel: i18n.t(NS + 'transferLabel', lang),
        remarkLabel: i18n.t('common.remark', lang),
        completeProdBtn: i18n.t(NS + 'completeProdBtn', lang),
        closeOrderBtn: i18n.t(NS + 'closeOrderBtn', lang),
        scrapOrderBtn: i18n.t(NS + 'scrapOrderBtn', lang),
        processProgress: i18n.t('mp.sampleDetail.processProgress', lang),
        orderDetailTitle: i18n.t('mp.scanConfirm.orderDetailTitle', lang),
        subtotalLabel: i18n.t(NS + 'subtotalLabel', lang),
        totalLabel: i18n.t('common.total', lang),
        partHeader: i18n.t('mp.sampleDetail.partHeader', lang),
        measureMethod: i18n.t('mp.scanResult.measureMethod', lang),
        cuttingDetailTitle: i18n.t(NS + 'scanTypeCutting', lang),
        layersLabel: i18n.t(NS + 'layersLabel', lang),
        matPurchaseTitle: i18n.t('mp.stageDetail.matPurchaseW', lang),
        purchaseQtyLabel: i18n.t(NS + 'purchaseQtyLabel', lang),
        arrivedLabel: i18n.t(NS + 'arrivedLabel', lang),
        expectArrival: i18n.t(NS + 'expectArrival', lang),
        tabBom: i18n.t('mp.sampleDetail.tabBom', lang),
        quoteTitle: i18n.t(NS + 'quoteTitle', lang),
        totalPriceLabel: i18n.t('mp.stageDetail.totalPriceLabel', lang),
        unitPriceLabel: i18n.t('mp.sampleDetail.unitPrice', lang),
        priceMethodLabel: i18n.t(NS + 'priceMethodLabel', lang),
        opRecordsTitle: i18n.t(NS + 'opRecordsTitle', lang),
        tapRetry: i18n.t(NS + 'tapRetry', lang),
        cancel: i18n.t('common.cancel', lang),
        pieceUnit: i18n.t('common.piece', lang),
        daysUnit: i18n.t(NS + 'daysUnitW', lang),
        pass: i18n.t('common.pass', lang),
        fail: i18n.t('common.fail', lang),
        pendingClaimW: i18n.t(NS + 'pendingClaimW', lang),
        noImageW: i18n.t(NS + 'noImageW', lang),
        countUnitW: i18n.t(NS + 'countUnitW', lang),
        recordUnitW: i18n.t(NS + 'recordUnitW', lang),
        processCountW: i18n.t(NS + 'processCountW', lang),
        sizeUnitW: i18n.t(NS + 'sizeUnitW', lang),
        colorUnitW: i18n.t(NS + 'colorUnitW', lang),
        partsUnitW: i18n.t(NS + 'partsUnitW', lang),
        bundleUnitW: i18n.t(NS + 'bundleUnitW', lang),
        claimBtn: i18n.t(NS + 'claimBtn', lang),
        cutByPrefix: i18n.t(NS + 'cutByPrefix', lang),
        buyByPrefix: i18n.t(NS + 'buyByPrefix', lang),
        orderLoadFailedW: i18n.t(NS + 'orderLoadFailed', lang),
        viewAllW: i18n.t(NS + 'viewAllW', lang),
        cuttingWord: i18n.t(NS + 'cuttingWord', lang),
        statusDoing: i18n.t('mp.scanConfirm.statusDoing', lang),
        statusNotStarted: i18n.t('mp.stageDetail.statusNotStarted', lang),
        completedLabel: i18n.t('common.completed', lang),
        noSizeNoStyle: i18n.t(NS + 'noSizeNoStyle', lang),
        noSizeDataHint: i18n.t(NS + 'noSizeDataHint', lang),
        sizeLoadFailed: i18n.t(NS + 'sizeLoadFailed', lang),
        noSizeLinked: i18n.t(NS + 'noSizeLinked', lang),
      },
    });
    // 兜底标题（_loadFlow 拿到订单号后会覆盖为「订单详情 + 单号」）
    if (!this.data.orderNo) {
      wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) });
    }
  },

  onLoad: function (options) {
    this.applyLanguage(i18n.getLanguage());
    const opts = options || {};
    const orderId = opts.orderId ? decodeURIComponent(opts.orderId) : '';
    const orderNo = opts.orderNo ? decodeURIComponent(opts.orderNo) : '';
    this.setData({ orderId, orderNo, loadError: '' });
    this._loadFlow();
    // 订阅扫码/进度变更事件，实时刷新订单详情（历史bug：扫码后进度不更新）
    this._dataChangedHandler = () => {
      if (this.data.orderId) this._loadFlow();
    };
    eventBus.on(Events.DATA_CHANGED, this._dataChangedHandler);
    eventBus.on(Events.REFRESH_ALL, this._dataChangedHandler);
    eventBus.on(Events.ORDER_PROGRESS_CHANGED, this._dataChangedHandler);
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (this.data.orderId && !this.data.order) {
      // 首次加载或数据为空时才请求，避免从子页面返回时重复请求
      this._loadFlow();
    }
  },

  onUnload: function () {
    // 取消事件订阅，避免内存泄漏
    if (this._dataChangedHandler) {
      eventBus.off(Events.DATA_CHANGED, this._dataChangedHandler);
      eventBus.off(Events.REFRESH_ALL, this._dataChangedHandler);
      eventBus.off(Events.ORDER_PROGRESS_CHANGED, this._dataChangedHandler);
      this._dataChangedHandler = null;
    }
  },

  /* ═══ D-252：尺寸表（只读查看，生产管理/外发管理详情共用） ═══ */

  /**
   * 加载款式尺寸表。
   * render 会被多次触发（onShow / 扫码事件刷新），同一 styleId 只拉一次接口。
   * D-303：三态显示——有数据渲染表格；订单未关联款式或款式未录尺寸表时给提示行，
   * 不再静默隐藏（用户曾以为详情页没做尺寸表）。
   */
  _loadSizeSpec: function (order) {
    if (!order) return;
    const styleId = order.styleId || order.style_id;
    if (!styleId) {
      // 无资料下单：订单未关联款式档案
      this.setData({ sizeSpec: null, sizeSpecHint: i18n.t(NS + 'noSizeNoStyle', lang) });
      return;
    }
    if (this._sizeSpecLoadedFor === styleId && (this.data.sizeSpec || this.data.sizeSpecHint)) return;
    this._sizeSpecLoadedFor = styleId;
    const self = this;
      api.style.listSizes({ styleId: styleId }).then(function (res) {
        const list = (res && res.data) || res || [];
        const spec = buildSizeSpec(Array.isArray(list) ? list : (list.records || []));
        self.setData({
          sizeSpec: spec,
          sizeSpecHint: spec ? '' : i18n.t(NS + 'noSizeDataHint', lang),
        });
      }).catch(function (err) {
      console.warn('[order-detail] 加载尺寸表失败:', err);
      self.setData({ sizeSpec: null, sizeSpecHint: i18n.t(NS + 'sizeLoadFailed', lang) });
    });
  },

  /* 尺寸表透视已抽至 utils/sizeTableHelper.js（D-304，扫码页/共享组件同源） */

  /** D-303：快捷按钮「尺寸表」——滚动锚定到尺寸表区块；无款式资料时直接提示 */
  onJumpSizeSpec: function () {
    const order = this.data.order || {};
    const styleId = order.styleId || order.style_id;
    if (!styleId) {
      wx.showToast({ title: i18n.t(NS + 'noSizeLinked', this._lang), icon: 'none' });
      return;
    }
    if (!this.data.sizeSpec && !this.data.sizeSpecHint) {
      // 数据还没加载完（首次进入快速点击），补拉一次
      this._loadSizeSpec(order);
    }
    const self = this;
    wx.nextTick(function () {
      wx.pageScrollTo({
        selector: '#sizeSpecSection',
        duration: 300,
        fail: function () { /* 区块尚未渲染时忽略 */ },
      });
    });
  },

  onPullDownRefresh: function () {
    // 用 .finally 在接口返回后立即停止下拉刷新动画（避免 3.5s 卡顿）
    this._loadFlow().finally(function () {
      try { wx.stopPullDownRefresh(); } catch (_e) { /* 停止刷新失败忽略 */ }
    });
    // 兜底：8 秒内若 Promise 未结束（极端情况），强制停止
    setTimeout(function () {
      try { wx.stopPullDownRefresh(); } catch (_e) { /* 停止刷新失败忽略 */ }
    }, 8000);
  },

  onRetryLoad: function () {
    this.setData({ loading: true, loadError: '' });
    this._loadFlow();
  },

  /* ======== 加载完整流程数据 ======== */
  _loadFlow: function () {
    var lang = this._lang || i18n.getLanguage();
    const that = this;
    this.setData({ loading: true });

    const orderId = this.data.orderId;
    const orderNo = this.data.orderNo;

    // 兼容性：没有 orderId 但有 orderNo，也可以继续
    if (!orderId && !orderNo) {
      toast.error(i18n.t(NS + 'orderMissingParams', this._lang));
      this.setData({ loading: false });
      return;
    }

    // 从响应数据中解析出有效订单对象（多层兼容）
    function resolveOrderFromFlow(data) {
      if (!data) return null;
      if (data.order && data.order.id) return data.order;
      if (data.id) return data;
      if (data.productionOrder && data.productionOrder.id) return data.productionOrder;
      return null;
    }

    // 把解析后的订单 + 原始流程数据（stages/records/...）统一渲染
    function render(order, ctx) {
      ctx = ctx || {};

      // 字段兼容（orderQuantity/total_quantity 等）
      const totalQty = fmtNum(order.orderQuantity || order.total_quantity || order.totalQuantity);
      const completedQty = fmtNum(order.completedQuantity || order.completed_quantity);
      const remainQty = Math.max(0, totalQty - completedQty);
      const progressPct = totalQty > 0 ? Math.min(100, Math.round(completedQty / totalQty * 100)) : 0;

      // 封面图
      let coverUrl = order.styleCover || order.coverImage || order.styleImage || '';
      if (coverUrl) coverUrl = getAuthedImageUrl(coverUrl);

      // 构建图片列表（封面图 + 款式附件图 + 订单备注图）
      const imageList = [];
      if (coverUrl) {
        imageList.push({ url: coverUrl, type: 'cover', label: i18n.t(NS + 'coverLabel', lang) });
      }
      // 款式附件图（从 styleImages 或 attachments 解析）
      const styleAttachments = order.styleImages || order.styleAttachmentList || order.attachments || [];
      if (Array.isArray(styleAttachments)) {
        styleAttachments.forEach(function (att) {
          const url = att.fileUrl || att.imageUrl || att.url || att;
          if (url && typeof url === 'string') {
            const fullUrl = url.startsWith('http') ? url : getAuthedImageUrl(url);
            imageList.push({ url: fullUrl, type: 'style', label: i18n.t(NS + 'styleWord', lang) });
          }
        });
      }
      // 订单备注图
      const orderImages = order.orderImages || order.remarkImages || [];
      if (Array.isArray(orderImages)) {
        orderImages.forEach(function (img) {
          const url = img.imageUrl || img.fileUrl || img.url || img;
          if (url && typeof url === 'string') {
            const fullUrl = url.startsWith('http') ? url : getAuthedImageUrl(url);
            imageList.push({ url: fullUrl, type: 'order', label: i18n.t('common.remark', lang), id: img.id });
          }
        });
      }

      // 交期信息
      const rawDelivery = order.plannedEndDate || order.expectedShipDate || order.deliveryDate || '';
      const deliveryDateStr = formatDate(rawDelivery);
      let remainDaysText = '';
      let remainDaysClass = '';
      const orderStatus = String(order.status || '').toLowerCase();
      if (deliveryDateStr && orderStatus !== 'completed' && orderStatus !== 'closed' && orderStatus !== 'archived') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(deliveryDateStr.replace(/-/g, '/'));
        const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);
        if (diff < 0) {
          remainDaysText = i18n.t(NS + 'overdueChar', this._lang) + Math.abs(diff) + i18n.t(NS + 'daysUnitW', this._lang);
          remainDaysClass = 'days-overdue';
        } else if (diff === 0) {
          remainDaysText = i18n.t(NS + 'todayWord', this._lang);
          remainDaysClass = 'days-urgent';
        } else {
          remainDaysText = diff + i18n.t(NS + 'daysUnitW', lang);
          remainDaysClass = diff <= 3 ? 'days-urgent' : (diff <= 7 ? 'days-warn' : 'days-safe');
        }
      }

      // 状态（getStatusInfo 走 displayHelper.displayStatus，cancelled/scrapped 保留语义区分）
      const statusInfo = getStatusInfo(order.status);

      // 是否可操作：用原始 status 枚举判断终态（displayHelper 把 cancelled→"已取消"、scrapped→"已报废"、
      // closed→"已关单"、archived→"已归档"，旧的 statusText 文本判断已失效，改为按 raw status 判断）
      const rawOrderStatus = String(order.status || '').toLowerCase();
      const isTerminal = ['completed', 'closed', 'archived', 'cancelled', 'canceled', 'scrapped'].indexOf(rawOrderStatus) !== -1;
      const isEditable = !isTerminal;

      // 工序阶段（防御非数组返回）
      const rawStages = Array.isArray(ctx.stages) ? ctx.stages : (ctx.stages && Array.isArray(ctx.stages.records)) ? ctx.stages.records : [];
      const stages = rawStages.map(function (s) {
        const st = getStageStatus(s);
        return {
          name: fmt(s.processName || s.name, i18n.t(NS + 'unknownProcess', lang)),
          status: st.text,
          statusCls: st.cls,
          totalQty: fmtNum(s.totalQuantity),
          scannedQty: fmtNum(s.scannedQuantity),
          progress: fmtNum(s.progress, s.totalQuantity ? Math.round((s.scannedQuantity || 0) / s.totalQuantity * 100) : 0),
          startTime: formatDateTime(s.startTime),
          completeTime: formatDateTime(s.completeTime),
          startOperator: fmt(s.startOperatorName || s.startOperator, '-'),
        };
      });

      // 扫码记录（最近 10 条）
      const rawRecords = Array.isArray(ctx.records) ? ctx.records : (ctx.records && Array.isArray(ctx.records.records)) ? ctx.records.records : [];
      const records = rawRecords.slice(0, 10).map(function (r) {
        return {
          scanTime: formatDateTime(r.scanTime || r.createTime),
          operatorName: fmt(r.operatorName || r.operator, '-'),
          processName: fmt(r.processName || r.progressStage, '-'),
          scanType: getScanTypeText(r, lang),
          scanTypeClass: getScanTypeClass(r),
          quantity: fmtNum(r.quantity),
        };
      });

      // 物料采购（防御非数组返回）+ 领取状态
      const rawMaterials = Array.isArray(ctx.materialPurchases) ? ctx.materialPurchases : (ctx.materialPurchases && Array.isArray(ctx.materialPurchases.records)) ? ctx.materialPurchases.records : [];
      const materialPurchases = rawMaterials.map(function (mp) {
        const rawStatus = String(mp.status || '').toLowerCase();
        // 统一走 displayHelper.displayPurchaseStatus；'arrived' 不在采购映射表，保留本地兜底
        let st = displayPurchaseStatus(rawStatus);
        if (rawStatus === 'arrived') {
          st = { text: i18n.t(NS + 'arrivedLabel', lang), color: STATUS_COLOR_SUCCESS };
        }
        const stCls = colorToCls(st.color);
        const isClaimable = (rawStatus === 'pending' || rawStatus === '');
        return {
          id: mp.id || mp.purchaseId || mp.materialPurchaseId,
          materialName: fmt(mp.materialName || mp.materialCode, '-'),
          materialCode: fmt(mp.materialCode, '-'),
          quantity: fmtNum(mp.quantity),
          arrivedQuantity: fmtNum(mp.arrivedQuantity),
          unit: fmt(mp.unit, i18n.t('common.piece', lang)),
          status: st.text,
          statusCls: stCls,
          expectedArrivalDate: formatDate(mp.expectedArrivalDate || mp.planDate),
          receiverName: fmt(mp.receiverName || mp.purchaserName, ''),
          isClaimable: isClaimable,
        };
      });

      // BOM 列表（防御非数组返回）
      const rawBom = Array.isArray(ctx.bomList) ? ctx.bomList : (ctx.bomList && Array.isArray(ctx.bomList.records)) ? ctx.bomList.records : [];
      const bomList = rawBom.map(function (b) {
        return {
          groupName: fmt(b.groupName, i18n.t(NS + 'ungroupedWord', lang)),
          materialType: fmt(b.materialType, '-'),
          materialName: fmt(b.materialName, '-'),
          materialCode: fmt(b.materialCode, '-'),
          color: fmt(b.color, '-'),
          size: fmt(b.size, '-'),
          unit: fmt(b.unit, '-'),
          quantity: fmtNum(b.quantity),
          unitPrice: fmtNum(b.unitPrice),
        };
      });

      // 裁剪分扎（兼容数组、records、list、data、items 多种返回结构）
      const cbRaw = ctx.cuttingBundles;
      let cuttingBundles = [];
      if (Array.isArray(cbRaw)) {
        cuttingBundles = cbRaw;
      } else if (cbRaw && typeof cbRaw === 'object') {
        if (Array.isArray(cbRaw.records)) cuttingBundles = cbRaw.records;
        else if (Array.isArray(cbRaw.list)) cuttingBundles = cbRaw.list;
        else if (Array.isArray(cbRaw.data)) cuttingBundles = cbRaw.data;
        else if (Array.isArray(cbRaw.items)) cuttingBundles = cbRaw.items;
      }
      let bundleSummary = null;
      let cuttingBundleList = [];
      let cuttingAllDone = false;
      if (cuttingBundles.length > 0) {
        const totalBundles = cuttingBundles.length;
        const totalQty2 = cuttingBundles.reduce(function (s, b) { return s + fmtNum(b.quantity); }, 0);
        bundleSummary = { totalBundles: totalBundles, totalQty: totalQty2 };
        cuttingBundleList = cuttingBundles.slice(0, 10).map(function (b) {
          const rawStatus = String(b.status || '').toLowerCase();
          const isClaimable = (rawStatus === 'pending' || rawStatus === 'not_started' || rawStatus === '');
          // 统一走 displayHelper.displayPurchaseStatus；not_started/done/in_progress 是裁剪特有，
          // displayHelper 没有这俩/仨 key，保留本地兜底
          let st = displayPurchaseStatus(rawStatus);
          if (rawStatus === 'not_started') {
            st = { text: i18n.t(NS + 'pendingClaimW', lang), color: STATUS_COLOR_WARNING };
          } else if (rawStatus === 'done') {
            st = { text: i18n.t('common.completed', lang), color: STATUS_COLOR_SUCCESS };
          } else if (rawStatus === 'in_progress') {
            st = { text: i18n.t(NS + 'cuttingWord', lang), color: STATUS_COLOR_PROCESSING };
          }
          const stCls = colorToCls(st.color);
          var rawBundleNo = b.bundleNo || b.bundleLabel || b.bundle_no || '-';
          // 菲号显示：订单号+菲号（与 PC 端 orderNo-bundleNo 对齐）
          var orderNo = self.data.order && self.data.order.orderNo ? self.data.order.orderNo : '';
          var bundleDisplay = rawBundleNo;
          if (orderNo && rawBundleNo && rawBundleNo !== '-' && String(rawBundleNo).indexOf(orderNo) !== 0) {
            bundleDisplay = orderNo + '-' + rawBundleNo;
          }
          return {
            id: b.id,
            taskId: b.taskId || b.id,
            bundleNo: bundleDisplay,
            color: fmt(b.color, ''),
            size: fmt(b.size, ''),
            layerCount: b.layerCount,
            quantity: fmtNum(b.quantity),
            status: st.text,
            statusCls: stCls,
            // 裁剪人只认任务表回填的 receiverName；operatorName 是"最后操作人"（管理员编辑即覆盖），禁止当领取人展示
            receiverName: fmt(b.receiverName, ''),
            isClaimable: isClaimable,
          };
        });
        // 整体裁剪完成判定
        cuttingAllDone = cuttingBundles.every(function (b) {
          const s = String(b.status || '').toLowerCase();
          return s === 'completed' || s === 'done';
        });
      }

      // 整体采购完成判定
      const procurementAllDone = rawMaterials.length > 0 && rawMaterials.every(function (mp) {
        const s = String(mp.status || '').toLowerCase();
        return s === 'completed' || s === 'arrived';
      });

      // 下单矩阵（与列表页用相同解析逻辑，兼容 orderDetails JSON 各种格式）
      const matrixModel = buildMatrixModel(order);

      // 顶部信息卡需要的颜色/尺码汇总（用户要求：详情页也要有颜色数量信息）
      const specSummary = (function () {
        if (!matrixModel.hasData) {
          return { colorText: '', sizeText: '', sizeList: [], qtyText: '', hasSpec: false };
        }
        var colorText = matrixModel.colors.length ? matrixModel.colors.join(' / ') : '';
        var sizeText = matrixModel.allSizes.length ? matrixModel.allSizes.join(' / ') : '';
        var qtyText = matrixModel.total + i18n.t('common.piece', lang);
        // D-198：尺码拆数组供横向滑动标签渲染，长码数不再挤成换行长串
        return { colorText: colorText, sizeText: sizeText, sizeList: matrixModel.allSizes.slice(), qtyText: qtyText, hasSpec: true };
      })();

      // BOM 物料类型中文化
      bomList.forEach(function (b) {
        var mk = MATERIAL_TYPE_LABELS[b.materialType];
        b.materialTypeText = b.materialType && b.materialType !== '-' ? (mk ? i18n.t(NS + mk, lang) : b.materialType) : '-';
      });

      // 款式报价计价方式中文化
      const rawQuotation = ctx.styleQuotation || ctx.quotation || null;
      let quotation = null;
      if (rawQuotation) {
        quotation = Object.assign({}, rawQuotation);
        if (quotation.pricingMode) {
          var pk = PRICING_MODE_LABELS[quotation.pricingMode];
          quotation.pricingModeText = pk ? i18n.t(NS + pk, lang) : i18n.t('mp.stageDetail.unknownWord', lang);
        }
      }

      // D-184：采购/裁剪/整体完成状态徽章——与完成率联动，让用户一眼看清各阶段是否已完成
      const stageBadge = function (rate) {
        const r = Number(rate) || 0;
        if (r >= 100) return { text: i18n.t('common.completed', lang), cls: 'done' };
        if (r > 0) return { text: i18n.t('mp.scanConfirm.statusDoing', lang), cls: 'doing' };
        return { text: i18n.t('mp.stageDetail.statusNotStarted', lang), cls: 'todo' };
      };

      that.setData({
        order: order,
        isEditable: isEditable,
        procurementBadge: stageBadge(order.procurementCompletionRate),
        cuttingBadge: stageBadge(order.cuttingCompletionRate),
        overallBadge: stageBadge(progressPct),
        // 主管以上才显示订单生命周期操作按钮（报废/完成/关闭）
        isSupervisor: permission.isAdminOrSupervisor(),
        statusInfo: statusInfo,
        deliveryDateStr: deliveryDateStr,
        remainDaysText: remainDaysText,
        remainDaysClass: remainDaysClass,
        totalQuantity: totalQty,
        completedQuantity: completedQty,
        remainQuantity: remainQty,
        progressPct: progressPct,
        specSummary: specSummary,
        stages: stages,
        records: records,
        materialPurchases: materialPurchases,
        hasMaterialPurchases: materialPurchases.length > 0,
        bomList: bomList,
        hasBomList: bomList.length > 0,
        cuttingBundleList: cuttingBundleList,
        bundleSummary: bundleSummary,
        cuttingAllDone: cuttingAllDone,
        procurementAllDone: procurementAllDone,
        matrixModel: matrixModel,
        quotation: quotation,
        imageList: imageList,
        currentImageIndex: 0,
        loading: false,
      });

      // 尺寸表（只读查看）：生产管理/外发管理详情共用，有款式才加载
      that._loadSizeSpec(order);

      // 标题
      const realOrderNo = order.orderNo || order.order_no;
      if (realOrderNo) {
        if (!that.data.orderNo) that.setData({ orderNo: realOrderNo });
        wx.setNavigationBarTitle({ title: i18n.t(NS + 'navTitle', lang) + ' ' + realOrderNo });
      }
    }

    // ================== 主流程：先尝试 flow 接口，失败再用 detail 接口 ==================
    // 超时保护：10 秒强制关闭 loading，避免后端不可用时页面卡死
    const timeoutTimer = setTimeout(function () {
      console.warn('[order-detail] 请求超时，关闭 loading');
      if (that.data.loading) {
        toast.error(i18n.t(NS + 'loadTimeout', this._lang));
        that.setData({ loading: false });
      }
    }, 10000);

    // 内联 fallback 函数：用 orderDetail 接口获取订单
    function fallbackToDetail(key) {
      if (!key) {
        console.warn('[order-detail] fallback 缺少 key');
        that.setData({ loading: false, loadError: i18n.t(NS + 'orderMissingParams', that._lang) });
        return Promise.resolve();
      }
      console.log('[order-detail] 启动 fallback orderDetail, key:', key);
      return production.orderDetail(key).then(function (res) {
        // ok() 已解包，res 就是 data；失败已 throw 由 catch 兜底
        console.log('[order-detail] detail fallback res:', JSON.stringify(res).substring(0, 500));
        let order = null;
        const payload = res || {};
        if (Array.isArray(payload)) {
          order = payload[0] || null;
        } else if (Array.isArray(payload.records)) {
          order = payload.records[0] || null;
        } else if (payload && payload.id) {
          order = payload;
        } else if (payload && payload.order && payload.order.id) {
          order = payload.order;
        }
        if (!order || !order.id) {
          console.warn('[order-detail] detail fallback 也无法解析 order:', JSON.stringify(payload).substring(0, 300));
          throw new Error(i18n.t(NS + 'orderMissing', lang));
        }
        render(order, {});
      }).catch(function (detailErr) {
        const detailMsg = (detailErr && detailErr.message) || String(detailErr || '');
        console.warn('[order-detail] detail fallback 失败:', detailMsg);
        that.setData({ loading: false, loadError: detailMsg || i18n.t(NS + 'orderLoadFailed', that._lang) });
      });
    }

    const key = orderId || orderNo;
    const flowPromise = orderId
      ? production.getOrderFlow(orderId).then(function (res) {
          clearTimeout(timeoutTimer);
          // ok() 已解包，res 就是完整 flow 数据；失败已 throw 由 catch 兜底
          const data = res || {};
          const order = resolveOrderFromFlow(data);
          if (!order) {
            console.warn('[order-detail] flow 数据无法解析 order → 启动 fallback');
            return fallbackToDetail(key);
          }
          render(order, data);
        }).catch(function (flowErr) {
          clearTimeout(timeoutTimer);
          const errMsg = (flowErr && flowErr.message) || String(flowErr || '');
          console.warn('[order-detail] flow 接口异常:', errMsg, '→ 启动 fallback');
          if (!that.data.loading) return Promise.resolve();
          return fallbackToDetail(key);
        })
      : orderNo
        ? fallbackToDetail(orderNo)
        : Promise.resolve();

    // 返回 Promise，供 onPullDownRefresh 用 .finally 停止下拉动画
    return flowPromise;
  },

  /* ======== 图片轮播控制 ======== */
  onImageChange: function (e) {
    const idx = e && e.detail && typeof e.detail.current === 'number' ? e.detail.current : 0;
    this.setData({ currentImageIndex: idx });
  },
  onPreviewImage: function () {
    const list = this.data.imageList;
    const idx = this.data.currentImageIndex;
    if (!list || !list.length) return;
    const urls = list.map(function (item) { return item.url; });
    wx.previewImage({ current: urls[idx], urls: urls });
  },
  /* ======== 复制订单号 ======== */
  onCopyOrderNo: function () {
    const no = this.data.orderNo || (this.data.order && this.data.order.orderNo);
    if (!no) return;
    wx.setClipboardData({ data: no, success: function () { toast.success(i18n.t(NS + 'copied', this._lang)); } });
  },

  /* ======== 操作：裁剪分扎 ======== */
  onActionCutting: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const order = this.data.order;
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?' + params.join('&') }).catch(function () {});
  },

  /* ======== 操作：采购任务 ======== */
  onActionProcurement: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const order = this.data.order;
    if (!order) return;
    safeNavigate({
      url: '/pages/procurement/task-detail/index?orderNo=' + encodeURIComponent(order.orderNo || '')
        + '&styleNo=' + encodeURIComponent(order.styleNo || '')
    }).catch(function () {});
  },

  /* ======== 操作：工序编辑 ======== */
  onActionProcessEdit: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const order = this.data.order;
    if (!order) return;
    const status = String(order.status || '').toLowerCase();
    if (status !== 'production' && status !== 'in_progress' && status !== 'active') {
      wx.showToast({ title: i18n.t(NS + 'onlyProdEdit', this._lang), icon: 'none' });
      return;
    }
    safeNavigate({
      url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(order.id || '')
        + '&orderNo=' + encodeURIComponent(order.orderNo || '')
    }).catch(function () {});
  },

  /* ======== 操作：转单 ======== */
  onActionTransfer: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const order = this.data.order;
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    // D-203：转单入口必须带 tab=transfer，落地页直开转单面板（与生产管理卡转单按钮同参），否则无菲号订单会落在裁剪分扎表单
    params.push('tab=transfer');
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?' + params.join('&') }).catch(function () {});
  },

  /* ======== 操作：备注 ======== */
  onActionRemark: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const order = this.data.order;
    if (!order || !order.orderNo) return;
    safeNavigate({
      url: '/pages/order/remark/index?targetType=order&targetNo=' + encodeURIComponent(order.orderNo)
    }).catch(function () {});
  },

  /* ======== 订单生命周期操作（仅主管以上可见，与后端 ProductionOrderOperationController 对齐） ======== */
  /**
   * 报废订单：POST /api/production/order/scrap  body: { id, remark }
   */
  onActionScrap: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error(i18n.t(NS + 'onlySupScrap', this._lang)); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error(i18n.t(NS + 'orderDataMissing', this._lang)); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'scrap',
        title: i18n.t(NS + 'scrapOrderBtn', this._lang),
        desc: i18n.tf(NS + 'scrapConfirmFmt', { no: order.orderNo || '' }, this._lang),
        confirmText: i18n.t(NS + 'scrapConfirmBtn', this._lang),
        confirmColor: 'var(--color-danger, #dc2626)',
        placeholder: i18n.t(NS + 'scrapReasonPh', this._lang),
        inputVal: '',
        inputRequired: true,
      },
    });
  },

  /**
   * 完成生产：POST /api/production/order/complete  body: { id, tolerancePercent? }
   */
  onActionComplete: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error(i18n.t(NS + 'onlySupComplete', this._lang)); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error(i18n.t(NS + 'orderDataMissing', this._lang)); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'complete',
        title: i18n.t(NS + 'completeProdBtn', this._lang),
        desc: i18n.tf(NS + 'completeConfirmFmt', { no: order.orderNo || '' }, this._lang),
        confirmText: i18n.t(NS + 'confirmCompleteW', this._lang),
        confirmColor: 'var(--color-success, #38b000)',
        placeholder: '',
        inputVal: '',
        inputRequired: false,
      },
    });
  },

  /**
   * 关闭订单：POST /api/production/order/close  body: { id, sourceModule, remark?, specialClose? }
   * sourceModule 固定为 'miniprogram_order_detail'，便于后端审计
   */
  onActionClose: function () {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error(i18n.t(NS + 'onlySupClose', this._lang)); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error(i18n.t(NS + 'orderDataMissing', this._lang)); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'close',
        title: i18n.t(NS + 'closeOrderBtn', this._lang),
        desc: i18n.tf(NS + 'closeConfirmFmt', { no: order.orderNo || '' }, this._lang),
        confirmText: i18n.t(NS + 'confirmClose', this._lang),
        confirmColor: 'var(--color-danger, #dc2626)',
        placeholder: i18n.t(NS + 'closeReasonPh', this._lang),
        inputVal: '',
        inputRequired: false,
      },
    });
  },

  // ===== 自定义确认弹窗交互 =====
  onActionModalInput: function (e) {
    this.setData({ 'actionModal.inputVal': e.detail.value });
  },
  onActionModalCancel: function () {
    this.setData({ 'actionModal.visible': false });
  },
  onActionModalConfirm: function () {
    const that = this;
    const m = this.data.actionModal;
    if (!m || !m.visible) return;
    const order = this.data.order;
    if (!order || !order.id) { this.setData({ 'actionModal.visible': false }); return; }
    const remark = String(m.inputVal || '').trim();
    if (m.inputRequired && !remark) { toast.error((m.placeholder || '').replace(/（.*$/, '').replace(/\(.*$/, '')); return; }

    this.setData({ 'actionModal.visible': false });

    if (m.type === 'scrap') {
      wx.showLoading({ title: i18n.t(NS + 'scrapingTxt', this._lang), mask: true });
      production.scrapOrder({ id: order.id, remark: remark }).then(function () {
        wx.hideLoading();
        toast.success(i18n.t(NS + 'scrapOk', this._lang));
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || i18n.t(NS + 'scrapFail', this._lang));
      });
    } else if (m.type === 'complete') {
      wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
      production.completeOrder({ id: order.id }).then(function () {
        wx.hideLoading();
        toast.success(i18n.t(NS + 'prodCompleted', this._lang));
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || i18n.t(NS + 'completeFail', this._lang));
      });
    } else if (m.type === 'close') {
      wx.showLoading({ title: i18n.t(NS + 'handlingTxt', this._lang), mask: true });
      production.closeOrder({
        id: order.id,
        sourceModule: 'myOrders',
        remark: remark,
      }).then(function () {
        wx.hideLoading();
        toast.success(i18n.t(NS + 'orderClosed', this._lang));
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || i18n.t(NS + 'closeFail', this._lang));
      });
    }
  },

  /* ======== 查看全部裁剪扎 ======== */
  onSeeAllBundles: function () {
    const order = this.data.order;
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?' + params.join('&') }).catch(function () {});
  },

  /* ======== 领取采购物料 ======== */
  onClaimMaterial: function (e) {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const item = e.currentTarget.dataset.item;
    if (!item || !item.id) { toast.error(i18n.t(NS + 'materialMissing', this._lang)); return; }
    const userInfo = getUserInfo();
    const receiverId = String(userInfo && (userInfo.id || userInfo.userId) || '').trim();
    const receiverName = String(userInfo && (userInfo.name || userInfo.username || userInfo.nickName) || '').trim();
    if (!receiverId && !receiverName) {
      toast.error(i18n.t(NS + 'loginFirst', this._lang));
      return;
    }
    wx.showLoading({ title: i18n.t(NS + 'claimingTxt', this._lang), mask: true });
    production.receivePurchase({
      purchaseId: item.id,
      receiverId: receiverId,
      receiverName: receiverName,
    }).then(function () {
      wx.hideLoading();
      toast.success(i18n.t(NS + 'claimOk', this._lang));
      this._loadFlow();
    }.bind(this)).catch(function (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || i18n.t(NS + 'claimFail', this._lang));
    });
  },

  /* ======== 领取裁剪任务 ======== */
  onClaimCutting: function (e) {
    if (!this.data.isEditable) { toast.error(i18n.t(NS + 'doneOrderNoOp', this._lang)); return; }
    const bundle = e.currentTarget.dataset.bundle;
    if (!bundle || !bundle.taskId) { toast.error(i18n.t(NS + 'cuttingMissing', this._lang)); return; }
    const userInfo = getUserInfo();
    const receiverId = String(userInfo && (userInfo.id || userInfo.userId) || '').trim();
    const receiverName = String(userInfo && (userInfo.name || userInfo.username || userInfo.nickName) || '').trim();
    if (!receiverId && !receiverName) {
      toast.error(i18n.t(NS + 'loginFirst', this._lang));
      return;
    }
    wx.showLoading({ title: i18n.t(NS + 'claimingTxt', this._lang), mask: true });
    production.receiveCuttingTaskById(bundle.taskId, receiverId, receiverName).then(function () {
      wx.hideLoading();
      toast.success(i18n.t(NS + 'claimOk', this._lang));
      this._loadFlow();
    }.bind(this)).catch(function (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || i18n.t(NS + 'claimFail', this._lang));
    });
  },
});
