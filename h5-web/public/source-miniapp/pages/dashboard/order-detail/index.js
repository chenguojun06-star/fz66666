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
const production = require('../../../utils/api-modules/production');
// D-303：尺寸表 listSizes / fallbackToDetail 走全局 api（此前 _loadSizeSpec/fallbackToDetail 引用 api 但未导入，点击尺寸表即抛 api is not defined）
const api = require('../../../utils/api.js');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { parseProductionOrderLines, sortSizeNames } = require('../../../utils/orderParser');
const { getUserInfo } = require('../../../utils/storage');
const { eventBus, Events } = require('../../../utils/eventBus');
// 订单生命周期操作（scrap/complete/close）仅主管以上可见，与后端 ProductionOrderOperationController @PreAuthorize 一致
const permission = require('../../../utils/permission');

/* ========== 业务类型 / 物料类型 / 计价方式 中文化 ========== */
var BIZ_TYPE_LABELS = { FOB: 'FOB 离岸价', ODM: 'ODM 原厂设计', OEM: 'OEM 代工生产', CMT: 'CMT 来料加工' };
var MATERIAL_TYPE_LABELS = { fabricA: '主面料', fabricB: '副面料', liningA: '里料A', liningB: '里料B', liningC: '里料C', accessoryA: '辅料A', accessoryB: '辅料B', accessoryC: '辅料C' };
var PRICING_MODE_LABELS = { PROCESS: '工序单价', SIZE: '尺码单价', COST: '外发整件单价', QUOTE: '报价单价', MANUAL: '手动单价' };

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
function getScanTypeText(r) {
  const t = String(r && r.scanType || '');
  if (t === 'cutting') return '裁剪';
  if (t === 'quality' || t === 'quality_check') return '质检';
  if (t === 'warehousing') return '入库';
  if (t === 'secondary_process') return '二次工艺';
  if (t === 'car_sewing' || t === 'sewing') return '车缝';
  return t || '扫码';
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

  onLoad: function (options) {
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
      this.setData({ sizeSpec: null, sizeSpecHint: '该订单未关联款式资料（无资料下单），无尺寸表' });
      return;
    }
    if (this._sizeSpecLoadedFor === styleId && (this.data.sizeSpec || this.data.sizeSpecHint)) return;
    this._sizeSpecLoadedFor = styleId;
    const self = this;
    api.style.listSizes({ styleId: styleId }).then(function (res) {
      const list = (res && res.data) || res || [];
      const spec = self._buildSizeSpec(Array.isArray(list) ? list : (list.records || []));
      self.setData({
        sizeSpec: spec,
        sizeSpecHint: spec ? '' : '该款式档案尚未录入尺寸表数据，可在 PC 端款式详情「尺寸表」中维护',
      });
    }).catch(function (err) {
      console.warn('[order-detail] 加载尺寸表失败:', err);
      self.setData({ sizeSpec: null, sizeSpecHint: '尺寸表加载失败，下拉刷新重试' });
    });
  },

  /**
   * 尺寸表透视（与 scan-result D-185 同款算法）：
   * 行=部位、列=尺码，尺码按标准码序（XXS→5XL→F）排序。
   * 订单详情是多彩多码，无"当前码数"概念，不做列高亮。
   */
  _buildSizeSpec: function (rawList) {
    if (!Array.isArray(rawList) || rawList.length === 0) return null;
    const sizeSeen = {};
    const sizeCols = [];
    rawList.forEach(function (it) {
      const sz = (it && (it.sizeName || it.baseSize)) || '';
      if (sz && !sizeSeen[sz]) { sizeSeen[sz] = true; sizeCols.push(sz); }
    });
    if (sizeCols.length === 0) return null;
    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL', '5XL', 'F', 'OS'];
    sizeCols.sort(function (a, b) {
      const ia = sizeOrder.indexOf(String(a).toUpperCase());
      const ib = sizeOrder.indexOf(String(b).toUpperCase());
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ib >= 0) return 1;
      return String(a).localeCompare(String(b));
    });
    const partSeen = {};
    const parts = [];
    rawList.forEach(function (it) {
      const p = (it && (it.partName || it.part)) || '';
      if (p && !partSeen[p]) { partSeen[p] = true; parts.push(p); }
    });
    const valueMap = {};
    rawList.forEach(function (it) {
      const p = (it && (it.partName || it.part)) || '';
      const sz = (it && (it.sizeName || it.baseSize)) || '';
      if (p && sz) {
        valueMap[p + '|' + sz] = it.standardValue != null ? it.standardValue : (it.value != null ? it.value : '-');
      }
    });
    const rows = parts.map(function (p) {
      return {
        part: p,
        values: sizeCols.map(function (sz) { return valueMap[p + '|' + sz] || '-'; }),
      };
    });
    return { sizeCols: sizeCols, rows: rows };
  },

  /** D-303：快捷按钮「尺寸表」——滚动锚定到尺寸表区块；无款式资料时直接提示 */
  onJumpSizeSpec: function () {
    const order = this.data.order || {};
    const styleId = order.styleId || order.style_id;
    if (!styleId) {
      wx.showToast({ title: '该订单未关联款式资料，无尺寸表', icon: 'none' });
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
    const that = this;
    this.setData({ loading: true });

    const orderId = this.data.orderId;
    const orderNo = this.data.orderNo;

    // 兼容性：没有 orderId 但有 orderNo，也可以继续
    if (!orderId && !orderNo) {
      toast.error('缺少订单参数');
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
        imageList.push({ url: coverUrl, type: 'cover', label: '封面' });
      }
      // 款式附件图（从 styleImages 或 attachments 解析）
      const styleAttachments = order.styleImages || order.styleAttachmentList || order.attachments || [];
      if (Array.isArray(styleAttachments)) {
        styleAttachments.forEach(function (att) {
          const url = att.fileUrl || att.imageUrl || att.url || att;
          if (url && typeof url === 'string') {
            const fullUrl = url.startsWith('http') ? url : getAuthedImageUrl(url);
            imageList.push({ url: fullUrl, type: 'style', label: '款式' });
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
            imageList.push({ url: fullUrl, type: 'order', label: '备注', id: img.id });
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
          remainDaysText = '逾' + Math.abs(diff) + '天';
          remainDaysClass = 'days-overdue';
        } else if (diff === 0) {
          remainDaysText = '今天';
          remainDaysClass = 'days-urgent';
        } else {
          remainDaysText = diff + '天';
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
          name: fmt(s.processName || s.name, '未知工序'),
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
          scanType: getScanTypeText(r),
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
          st = { text: '已到货', color: STATUS_COLOR_SUCCESS };
        }
        const stCls = colorToCls(st.color);
        const isClaimable = (rawStatus === 'pending' || rawStatus === '');
        return {
          id: mp.id || mp.purchaseId || mp.materialPurchaseId,
          materialName: fmt(mp.materialName || mp.materialCode, '-'),
          materialCode: fmt(mp.materialCode, '-'),
          quantity: fmtNum(mp.quantity),
          arrivedQuantity: fmtNum(mp.arrivedQuantity),
          unit: fmt(mp.unit, '件'),
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
          groupName: fmt(b.groupName, '未分组'),
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
            st = { text: '待领取', color: STATUS_COLOR_WARNING };
          } else if (rawStatus === 'done') {
            st = { text: '已完成', color: STATUS_COLOR_SUCCESS };
          } else if (rawStatus === 'in_progress') {
            st = { text: '裁剪中', color: STATUS_COLOR_PROCESSING };
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
        var qtyText = matrixModel.total + '件';
        // D-198：尺码拆数组供横向滑动标签渲染，长码数不再挤成换行长串
        return { colorText: colorText, sizeText: sizeText, sizeList: matrixModel.allSizes.slice(), qtyText: qtyText, hasSpec: true };
      })();

      // BOM 物料类型中文化
      bomList.forEach(function (b) {
        b.materialTypeText = b.materialType && b.materialType !== '-' ? (MATERIAL_TYPE_LABELS[b.materialType] || '其他') : '-';
      });

      // 款式报价计价方式中文化
      const rawQuotation = ctx.styleQuotation || ctx.quotation || null;
      let quotation = null;
      if (rawQuotation) {
        quotation = Object.assign({}, rawQuotation);
        if (quotation.pricingMode) {
          quotation.pricingModeText = PRICING_MODE_LABELS[quotation.pricingMode] || '未知';
        }
      }

      // D-184：采购/裁剪/整体完成状态徽章——与完成率联动，让用户一眼看清各阶段是否已完成
      const stageBadge = function (rate) {
        const r = Number(rate) || 0;
        if (r >= 100) return { text: '已完成', cls: 'done' };
        if (r > 0) return { text: '进行中', cls: 'doing' };
        return { text: '未开始', cls: 'todo' };
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
        wx.setNavigationBarTitle({ title: '订单详情 ' + realOrderNo });
      }
    }

    // ================== 主流程：先尝试 flow 接口，失败再用 detail 接口 ==================
    // 超时保护：10 秒强制关闭 loading，避免后端不可用时页面卡死
    const timeoutTimer = setTimeout(function () {
      console.warn('[order-detail] 请求超时，关闭 loading');
      if (that.data.loading) {
        toast.error('加载超时，请重试');
        that.setData({ loading: false });
      }
    }, 10000);

    // 内联 fallback 函数：用 orderDetail 接口获取订单
    function fallbackToDetail(key) {
      if (!key) {
        console.warn('[order-detail] fallback 缺少 key');
        that.setData({ loading: false, loadError: '缺少订单参数' });
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
          throw new Error('订单数据不存在');
        }
        render(order, {});
      }).catch(function (detailErr) {
        const detailMsg = (detailErr && detailErr.message) || String(detailErr || '');
        console.warn('[order-detail] detail fallback 失败:', detailMsg);
        that.setData({ loading: false, loadError: detailMsg || '订单数据加载失败' });
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
    wx.setClipboardData({ data: no, success: function () { toast.success('已复制'); } });
  },

  /* ======== 操作：裁剪分扎 ======== */
  onActionCutting: function () {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    const order = this.data.order;
    if (!order) return;
    const params = [];
    if (order.id) params.push('orderId=' + encodeURIComponent(order.id));
    if (order.orderNo) params.push('orderNo=' + encodeURIComponent(order.orderNo));
    safeNavigate({ url: '/pages/cutting/bundle-detail/index?' + params.join('&') }).catch(function () {});
  },

  /* ======== 操作：采购任务 ======== */
  onActionProcurement: function () {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    const order = this.data.order;
    if (!order) return;
    safeNavigate({
      url: '/pages/procurement/task-detail/index?orderNo=' + encodeURIComponent(order.orderNo || '')
        + '&styleNo=' + encodeURIComponent(order.styleNo || '')
    }).catch(function () {});
  },

  /* ======== 操作：工序编辑 ======== */
  onActionProcessEdit: function () {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    const order = this.data.order;
    if (!order) return;
    const status = String(order.status || '').toLowerCase();
    if (status !== 'production' && status !== 'in_progress' && status !== 'active') {
      wx.showToast({ title: '仅生产中的订单可编辑工序', icon: 'none' });
      return;
    }
    safeNavigate({
      url: '/pages/dashboard/process-edit/index?orderId=' + encodeURIComponent(order.id || '')
        + '&orderNo=' + encodeURIComponent(order.orderNo || '')
    }).catch(function () {});
  },

  /* ======== 操作：转单 ======== */
  onActionTransfer: function () {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
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
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
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
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error('仅主管以上可报废订单'); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error('订单数据缺失'); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'scrap',
        title: '报废订单',
        desc: '确认报废订单 ' + (order.orderNo || '') + '？此操作不可恢复',
        confirmText: '确认报废',
        confirmColor: 'var(--color-danger, #dc2626)',
        placeholder: '请输入报废原因（必填）',
        inputVal: '',
        inputRequired: true,
      },
    });
  },

  /**
   * 完成生产：POST /api/production/order/complete  body: { id, tolerancePercent? }
   */
  onActionComplete: function () {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error('仅主管以上可完成生产'); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error('订单数据缺失'); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'complete',
        title: '完成生产',
        desc: '确认完成订单 ' + (order.orderNo || '') + ' 的生产？将触发后续入库流程',
        confirmText: '确认完成',
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
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    if (!permission.isAdminOrSupervisor()) { toast.error('仅主管以上可关闭订单'); return; }
    const order = this.data.order;
    if (!order || !order.id) { toast.error('订单数据缺失'); return; }
    this.setData({
      actionModal: {
        visible: true,
        type: 'close',
        title: '关闭订单',
        desc: '确认关闭订单 ' + (order.orderNo || '') + '？关闭后将无法继续操作',
        confirmText: '确认关闭',
        confirmColor: 'var(--color-danger, #dc2626)',
        placeholder: '可输入关闭原因（选填）',
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
    if (m.inputRequired && !remark) { toast.error('请输入' + (m.placeholder || '').replace(/（.*$/, '')); return; }

    this.setData({ 'actionModal.visible': false });

    if (m.type === 'scrap') {
      wx.showLoading({ title: '报废中...', mask: true });
      production.scrapOrder({ id: order.id, remark: remark }).then(function () {
        wx.hideLoading();
        toast.success('报废成功');
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || '报废失败');
      });
    } else if (m.type === 'complete') {
      wx.showLoading({ title: '处理中...', mask: true });
      production.completeOrder({ id: order.id }).then(function () {
        wx.hideLoading();
        toast.success('已完成生产');
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || '完成失败');
      });
    } else if (m.type === 'close') {
      wx.showLoading({ title: '处理中...', mask: true });
      production.closeOrder({
        id: order.id,
        sourceModule: 'myOrders',
        remark: remark,
      }).then(function () {
        wx.hideLoading();
        toast.success('已关闭订单');
        that._loadFlow();
      }).catch(function (err) {
        wx.hideLoading();
        toast.error(err.errMsg || err.message || '关闭失败');
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
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    const item = e.currentTarget.dataset.item;
    if (!item || !item.id) { toast.error('物料数据缺失'); return; }
    const userInfo = getUserInfo();
    const receiverId = String(userInfo && (userInfo.id || userInfo.userId) || '').trim();
    const receiverName = String(userInfo && (userInfo.name || userInfo.username || userInfo.nickName) || '').trim();
    if (!receiverId && !receiverName) {
      toast.error('请先登录');
      return;
    }
    wx.showLoading({ title: '领取中...', mask: true });
    production.receivePurchase({
      purchaseId: item.id,
      receiverId: receiverId,
      receiverName: receiverName,
    }).then(function () {
      wx.hideLoading();
      toast.success('领取成功');
      this._loadFlow();
    }.bind(this)).catch(function (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '领取失败');
    });
  },

  /* ======== 领取裁剪任务 ======== */
  onClaimCutting: function (e) {
    if (!this.data.isEditable) { toast.error('已完成的订单不可操作'); return; }
    const bundle = e.currentTarget.dataset.bundle;
    if (!bundle || !bundle.taskId) { toast.error('裁剪数据缺失'); return; }
    const userInfo = getUserInfo();
    const receiverId = String(userInfo && (userInfo.id || userInfo.userId) || '').trim();
    const receiverName = String(userInfo && (userInfo.name || userInfo.username || userInfo.nickName) || '').trim();
    if (!receiverId && !receiverName) {
      toast.error('请先登录');
      return;
    }
    wx.showLoading({ title: '领取中...', mask: true });
    production.receiveCuttingTaskById(bundle.taskId, receiverId, receiverName).then(function () {
      wx.hideLoading();
      toast.success('领取成功');
      this._loadFlow();
    }.bind(this)).catch(function (err) {
      wx.hideLoading();
      toast.error(err.errMsg || err.message || '领取失败');
    });
  },
});
