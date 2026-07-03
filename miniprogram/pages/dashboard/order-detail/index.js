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
const api = require('../../../utils/api');
const production = require('../../../utils/api-modules/production');
const { toast, safeNavigate } = require('../../../utils/uiHelper');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { parseProductionOrderLines, sortSizeNames } = require('../../../utils/orderParser');
const { getUserInfo } = require('../../../utils/storage');

/* ========== 工具函数 ========== */
function fmt(val, fallback) { return (val != null && val !== '') ? val : (fallback || '-'); }
function fmtNum(v, fallback) { return (v != null && !isNaN(v)) ? Number(v) : (fallback || 0); }
function fmtTime(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length === 10) return s; // 纯日期
  if (s.length > 16) return s.substring(0, 16); // 去掉秒
  return s;
}
function fmtDate(val) {
  if (!val) return '';
  const s = String(val);
  if (s.length > 10) return s.substring(0, 10);
  return s;
}

/* 平台来源代码 → 中文名（与销售/订单列表页保持一致） */
const PLATFORM_NAMES = {
  TB: '淘宝',
  TM: '天猫',
  JD: '京东',
  PDD: '拼多多',
  DY: '抖音',
  XHS: '小红书',
  WC: '微信小店',
  SFY: 'Shopify',
  SY: '希音',
  JST: '聚水潭',
};
function getPlatformName(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  if (PLATFORM_NAMES[c]) return PLATFORM_NAMES[c];
  return c;
}

/* 状态文本 + tag 类名 */
function getStatusInfo(raw) {
  const s = String(raw || '').toLowerCase();
  if (s === 'completed' || s === 'closed' || s === 'archived') {
    return { text: '已完成', cls: 'tag-success' };
  }
  if (s === 'cancelled' || s === 'canceled' || s === 'scrapped') {
    return { text: '已作废', cls: 'tag-default' };
  }
  if (s === 'production' || s === 'in_progress' || s === 'active') {
    return { text: '生产中', cls: 'tag-processing' };
  }
  if (s === 'pending' || s === 'pending_start') {
    return { text: '待开始', cls: 'tag-warning' };
  }
  return { text: fmt(raw, '未知'), cls: 'tag-default' };
}

/* 工序阶段状态 */
function getStageStatus(row) {
  const st = String(row && row.status || '').toLowerCase();
  if (st === 'completed') return { text: '已完成', cls: 'stage-done' };
  if (st === 'in_progress' || st === 'processing') return { text: '进行中', cls: 'stage-doing' };
  if (st === 'not_started') return { text: '未开始', cls: 'stage-pending' };
  return { text: '未开始', cls: 'stage-pending' };
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
  if (!order) return { sizes: [], rows: [], total: 0, hasData: false, flatList: [], colorGroups: [], allSizes: [], colors: [], sizeSummary: [] };

  // 1. 复用 parseProductionOrderLines 解析 SKU 明细（与列表页保持一致）
  var lines = parseProductionOrderLines(order);
  if (!lines || !lines.length) {
    return { sizes: [], rows: [], total: 0, hasData: false, flatList: [], colorGroups: [], allSizes: [], colors: [], sizeSummary: [] };
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
  var colorGroups = [];
  for (var p = 0; p < colorOrder.length; p++) {
    var color = colorOrder[p];
    var quantities = allSizes.map(function (sz) { return colorRowMap[color][sz] || 0; });
    var rowTotal = quantities.reduce(function (s, v) { return s + v; }, 0);
    rows.push({ label: color, quantities: quantities, rowTotal: rowTotal });

    // colorGroups：供 WXML 用 cg.sizeMap[sz] 直接访问
    colorGroups.push({ color: color, sizeMap: colorRowMap[color], total: rowTotal });
  }

  // 6. 尺码汇总（每尺码合计）
  var sizeSummary = allSizes.map(function (sz) { return { size: sz, qty: sizeTotals[sz] || 0 }; });

  // 7. 平铺列表
  var flatList = lines.map(function (line) {
    return line.color + ' / ' + line.size + ' × ' + line.quantity;
  });

  return {
    sizes: allSizes,
    rows: rows,
    total: total,
    hasData: true,
    flatList: flatList,
    colorGroups: colorGroups,
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
    styleCoverUrl: '',
    statusInfo: { text: '', cls: '' },
    deliveryDateStr: '',
    remainDaysText: '',
    remainDaysClass: '',
    totalQuantity: 0,
    completedQuantity: 0,
    remainQuantity: 0,
    progressPct: 0,
    specSummary: { colorText: '', sizeText: '', qtyText: '', hasSpec: false },
    ecPlatformName: '',

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
    matrixModel: { sizes: [], rows: [], total: 0, hasData: false, flatList: [] },
  },

  onLoad: function (options) {
    const opts = options || {};
    const orderId = opts.orderId ? decodeURIComponent(opts.orderId) : '';
    const orderNo = opts.orderNo ? decodeURIComponent(opts.orderNo) : '';
    this.setData({ orderId, orderNo });
    this._loadFlow();
  },

  onShow: function () {
    const app = getApp();
    if (app && typeof app.requireAuth === 'function' && !app.requireAuth()) return;
    if (this.data.orderId) {
      // 从子页面返回时刷新
      this._loadFlow();
    }
  },

  onPullDownRefresh: function () {
    const that = this;
    // 直接调用 _loadFlow；当接口返回后停止下拉刷新
    this._loadFlow();
    // 兜底：3 秒内无论成功/失败都停止（_loadFlow 内部也有关闭 loading 的逻辑）
    setTimeout(function () {
      try { wx.stopPullDownRefresh(); } catch (e) {}
    }, 3500);
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

      // 交期信息
      const rawDelivery = order.plannedEndDate || order.expectedShipDate || order.deliveryDate || '';
      const deliveryDateStr = fmtDate(rawDelivery);
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

      // 状态（getStatusInfo 已经统一识别中英文各种状态）
      const statusInfo = getStatusInfo(order.status);

      // 是否可操作：只要 statusInfo 识别为"已完成"或"已作废"，就不可操作
      // 双重保险：同时检查原始 status 枚举值
      const statusText = statusInfo.text;
      const isTerminal = statusText === '已完成' || statusText === '已作废';
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
          startTime: fmtTime(s.startTime),
          completeTime: fmtTime(s.completeTime),
          startOperator: fmt(s.startOperatorName || s.startOperator, '-'),
          completeOperator: fmt(s.completeOperatorName || s.completeOperator, '-'),
        };
      });

      // 扫码记录（最近 10 条）
      const rawRecords = Array.isArray(ctx.records) ? ctx.records : (ctx.records && Array.isArray(ctx.records.records)) ? ctx.records.records : [];
      const records = rawRecords.slice(0, 10).map(function (r) {
        return {
          scanTime: fmtTime(r.scanTime || r.createTime),
          operatorName: fmt(r.operatorName || r.operator, '-'),
          processName: fmt(r.processName || r.progressStage, '-'),
          scanType: getScanTypeText(r),
          scanTypeClass: getScanTypeClass(r),
          bundleNo: fmt(r.bundleNo, '-'),
          quantity: fmtNum(r.quantity),
          scanResult: fmt(r.scanResult, '-'),
        };
      });

      // 物料采购（防御非数组返回）+ 领取状态
      const rawMaterials = Array.isArray(ctx.materialPurchases) ? ctx.materialPurchases : (ctx.materialPurchases && Array.isArray(ctx.materialPurchases.records)) ? ctx.materialPurchases.records : [];
      const materialPurchases = rawMaterials.map(function (mp) {
        const statusMap = {
          'pending': { text: '待领取', cls: 'tag-warning' },
          'received': { text: '已领取', cls: 'tag-processing' },
          'arrived': { text: '已到货', cls: 'tag-success' },
          'partially_arrived': { text: '部分到货', cls: 'tag-processing' },
          'completed': { text: '已完成', cls: 'tag-default' },
        };
        const rawStatus = String(mp.status || '').toLowerCase();
        const st = statusMap[rawStatus] || { text: fmt(mp.status, '未知'), cls: 'tag-default' };
        const isClaimable = (rawStatus === 'pending' || rawStatus === '');
        return {
          id: mp.id || mp.purchaseId || mp.materialPurchaseId,
          materialName: fmt(mp.materialName || mp.materialCode, '-'),
          materialCode: fmt(mp.materialCode, '-'),
          quantity: fmtNum(mp.quantity),
          arrivedQuantity: fmtNum(mp.arrivedQuantity),
          unit: fmt(mp.unit, '件'),
          status: st.text,
          statusCls: st.cls,
          expectedArrivalDate: fmtDate(mp.expectedArrivalDate || mp.planDate),
          receiverName: fmt(mp.receiverName || mp.purchaserName, ''),
          isClaimable: isClaimable,
          orderNo: fmt(mp.orderNo || order.orderNo, ''),
          styleNo: fmt(mp.styleNo || order.styleNo, ''),
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
      if (cuttingBundles.length > 0) {
        const totalBundles = cuttingBundles.length;
        const totalQty2 = cuttingBundles.reduce(function (s, b) { return s + fmtNum(b.quantity); }, 0);
        bundleSummary = { totalBundles: totalBundles, totalQty: totalQty2 };
        cuttingBundleList = cuttingBundles.slice(0, 10).map(function (b) {
          const rawStatus = String(b.status || '').toLowerCase();
          const isClaimable = (rawStatus === 'pending' || rawStatus === 'not_started' || rawStatus === '');
          const statusMap = {
            'pending': { text: '待领取', cls: 'tag-warning' },
            'not_started': { text: '待领取', cls: 'tag-warning' },
            'received': { text: '已领取', cls: 'tag-processing' },
            'in_progress': { text: '裁剪中', cls: 'tag-processing' },
            'completed': { text: '已完成', cls: 'tag-success' },
            'done': { text: '已完成', cls: 'tag-success' },
          };
          const st = statusMap[rawStatus] || { text: fmt(b.status, '待领取'), cls: 'tag-default' };
          return {
            id: b.id,
            taskId: b.taskId || b.id,
            bundleNo: b.bundleNo || b.bundleLabel || b.bundle_no || '-',
            color: fmt(b.color, ''),
            size: fmt(b.size, ''),
            quantity: fmtNum(b.quantity),
            status: st.text,
            statusCls: st.cls,
            receiverName: fmt(b.receiverName || b.operatorName, ''),
            isClaimable: isClaimable,
            orderNo: fmt(b.orderNo || order.orderNo, ''),
          };
        });
      }

      // 下单矩阵（与列表页用相同解析逻辑，兼容 orderDetails JSON 各种格式）
      const matrixModel = buildMatrixModel(order);

      // 顶部信息卡需要的颜色/尺码汇总（用户要求：详情页也要有颜色数量信息）
      const specSummary = (function () {
        if (!matrixModel.hasData) {
          return { colorText: '', sizeText: '', qtyText: '', hasSpec: false };
        }
        var colorText = matrixModel.colors.length ? matrixModel.colors.join(' / ') : '';
        var sizeText = matrixModel.allSizes.length ? matrixModel.allSizes.join(' / ') : '';
        var qtyText = matrixModel.total + '件';
        return { colorText: colorText, sizeText: sizeText, qtyText: qtyText, hasSpec: true };
      })();

      // 平台来源（电商订单 ecPlatform → 中文名）
      const ecPlatformName = getPlatformName(order.ecPlatform || order.platform || order.platformCode);

      that.setData({
        order: order,
        isEditable: isEditable,
        isTerminal: isTerminal,
        styleCoverUrl: coverUrl,
        statusInfo: statusInfo,
        deliveryDateStr: deliveryDateStr,
        remainDaysText: remainDaysText,
        remainDaysClass: remainDaysClass,
        totalQuantity: totalQty,
        completedQuantity: completedQty,
        remainQuantity: remainQty,
        progressPct: progressPct,
        specSummary: specSummary,
        ecPlatformName: ecPlatformName,
        stages: stages,
        records: records,
        materialPurchases: materialPurchases,
        hasMaterialPurchases: materialPurchases.length > 0,
        bomList: bomList,
        hasBomList: bomList.length > 0,
        cuttingBundleList: cuttingBundleList,
        bundleSummary: bundleSummary,
        matrixModel: matrixModel,
        quotation: ctx.styleQuotation || ctx.quotation || null,
        loading: false,
      });

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

    const flowPromise = orderId
      ? production.getOrderFlow(orderId).then(function (res) {
          const data = (res && res.data) || {};
          const order = resolveOrderFromFlow(data);
          if (!order) throw new Error('flow-no-order');
          render(order, data);
        })
      : Promise.reject(new Error('no-orderId'));

    flowPromise.then(function () {
      clearTimeout(timeoutTimer);
    }).catch(function (flowErr) {
      clearTimeout(timeoutTimer);
      if (flowErr && flowErr.message && flowErr.message !== 'flow-no-order' && flowErr.message !== 'no-orderId') {
        console.warn('[order-detail] flow 接口异常:', flowErr.message);
      }
      // 如果用户已经在 timeout 分支关闭了 loading，这里就不再弹 toast
      if (!that.data.loading) return;
      // fallback：调用 orderDetail
      const key = orderId || orderNo;
      if (!key) {
        toast.error('加载失败，请重试');
        that.setData({ loading: false });
        return;
      }
      return production.orderDetail(key).then(function (res) {
        let order = null;
        const payload = (res && res.data) || res || {};
        if (Array.isArray(payload)) {
          order = payload[0] || null;
        } else if (Array.isArray(payload.records)) {
          order = payload.records[0] || null;
        } else if (payload.id) {
          order = payload;
        } else if (payload.order && payload.order.id) {
          order = payload.order;
        }
        if (!order || !order.id) {
          throw new Error('detail-no-order');
        }
        render(order, {});
      }).catch(function (detailErr) {
        console.warn('[order-detail] 加载失败:', detailErr && detailErr.message);
        if (that.data.loading) {
          toast.error('加载失败，请重试');
          that.setData({ loading: false });
        }
      });
    });
  },

  /* ======== 封面预览 ======== */
  onPreviewCover: function () {
    const url = this.data.styleCoverUrl;
    if (!url) return;
    wx.previewImage({ current: url, urls: [url] });
  },

  /* ======== 复制订单号 ======== */
  onCopyOrderNo: function () {
    const no = this.data.orderNo || (this.data.order && this.data.order.orderNo);
    if (!no) return;
    wx.setClipboardData({ data: no, success: function () { toast.success('已复制'); } });
  },

  /* ======== 操作：扫码 ======== */
  onActionScan: function () {
    wx.switchTab({ url: '/pages/scan/index', fail: function () {
      safeNavigate({ url: '/pages/scan/index' });
    }});
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
