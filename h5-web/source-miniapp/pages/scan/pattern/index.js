/**
 * 样板生产操作页（从弹窗转为独立页面）
 * 数据通过 getApp().globalData.patternScanData 传入
 */
const toast = require('../../../utils/uiHelper').toast;
const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const SKUProcessor = require('../processors/SKUProcessor');
const { PATTERN_STATUS_MAP } = require('../../../shared/enumLabels');
const { displayCategory } = require('../../../utils/displayHelper');

// ---- 常量（样板操作类型定义） ----
const OPERATION_LABELS = {
  RECEIVE: '领取样板',
  PLATE: '车板扫码',
  FOLLOW_UP: '跟单确认',
  COMPLETE: '完成确认',
  REWORK: '返修完成',
  PROCUREMENT: '采购',
  CUTTING: '裁剪',
  SECONDARY: '二次工艺',
  SEWING: '车缝',
  TAIL: '尾部',
  REVIEW: '样衣审核',
  WAREHOUSE_IN: '样衣入库',
  WAREHOUSE_OUT: '样衣出库',
  WAREHOUSE_RETURN: '样衣归还',
};
const WAREHOUSE_OPERATIONS = new Set(['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN']);

// 样衣状态标签：优先使用共享映射 enumLabels.PATTERN_STATUS_MAP，本地兜底未覆盖的状态
const LOCAL_STATUS_FALLBACK = {
  RELEASED: '已发放',
};

function getPatternStatusLabel(status) {
  if (!status) return '-';
  var upper = String(status).trim().toUpperCase();
  return PATTERN_STATUS_MAP[upper] || LOCAL_STATUS_FALLBACK[upper] || status;
}

const SOURCE_LABELS = {
  SELF_DEVELOPED: '自主开发',
  OEM: '来料加工',
  CUSTOMER: '客供',
  LICENSED: '授权款',
};
function normalizePositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

Page({
  data: {
    detail: {},
    processList: [], // MES 工序列表：每道工序带状态（PENDING/CLAIMED/COMPLETED）与领取人
    processNextHint: '', // D-181：全部工序完成后的指引（审核/入库在样衣详情，对齐PC）
    selectedProcess: null, // 当前选中待报工的工序
    claimMode: false, // D-173：领取模式——点「领取」先填数量再提交，而非直接 quantity=1 提交
    skuList: [],
    summary: {},
    // D-379：领取模式多色勾选——[{ name: '红色', qty: 2, checked: true }]，每色一条独立 CLAIM
    claimColors: [],
    claimColorSummary: { colorCount: 0, totalQty: 0 }, // D-379：已选颜色数/件数（WXML 不能调方法）
    colorQtyMap: {}, // D-379：颜色 -> 该色订单总件数（领取时预填数量用）
    loading: false,
    warehouseOptions: [],
    filteredWarehouseOptions: [],
    warehouseSearchKey: '',
    warehouseLoadEmpty: false, // D-172：样衣仓加载为空时在仓库选择区域显示内联提示
    warehouseAreaId: '',
    warehouseLocationCode: '',
    locationOptions: [],
    // D-171：库位富对象（含已用/容量，选库位时可见数量避免超限）
    locationItems: [],
    filteredLocationItems: [],
    locationSearchKey: '',
  },

  onLoad() {
    const app = getApp();
    const data = app.globalData && app.globalData.patternScanData;
    if (!data) {
      toast.error('缺少样板数据');
      setTimeout(() => wx.navigateBack(), 300);
      return;
    }

    // 构建样板详情页数据
    const patternDetail = data.patternDetail || {};
    const rawOptions = Array.isArray(data.operationOptions) ? data.operationOptions : [];
    const status = String(data.status || '').toUpperCase();
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';

    const SUBMIT_LABEL_MAP = {
      RECEIVE: '领取', COMPLETE: '完成', REWORK: '返修完成', REVIEW: '审核',
      WAREHOUSE_IN: '入库', WAREHOUSE_OUT: '出库', WAREHOUSE_RETURN: '归还',
      PROCUREMENT: '采购', CUTTING: '裁剪', SECONDARY: '二次工艺',
      SEWING: '车缝', TAIL: '尾部',
    };
    const operationType = String(data.operationType || '').toUpperCase() || 'RECEIVE';
    const operationLabel = OPERATION_LABELS[operationType] || '操作';
    const requiresWarehouseInput = WAREHOUSE_OPERATIONS.has(operationType);
    const requiresReviewBeforeInbound = operationType === 'WAREHOUSE_IN' && !reviewApproved;
    const submitLabel = SUBMIT_LABEL_MAP[operationType] || operationLabel;
    const sizes = patternDetail.sizes || [];

    // MES 报工模型：hasProcessSystem 时构建工序列表
    let processList = this._buildProcessList(rawOptions);

    // D-181：入库/审核不再是工序——全部完成后指引用户回样衣详情完成（与 PC 流程一致）
    const allProcessesDone = processList.length > 0 && processList.every(p => p.status === 'COMPLETED');
    const processNextHint = allProcessesDone ? '工序已全部完成，请返回样衣详情完成样衣审核与入库' : '';

    this.setData({
      processNextHint: processNextHint,
      detail: {
        patternId: data.patternId,
        styleNo: data.styleNo,
        color: data.color || patternDetail.color || '-',
        // D-172：样衣按件统计，默认数量1件；计划数量仅作输入上限
        quantity: 1,
        maxQuantity: normalizePositiveInt(data.quantity, 1),
        warehouseCode: '',
        status: status,
        statusLabel: getPatternStatusLabel(status) || data.statusLabel || status || '-',
        statusType: status.toLowerCase().replace('_', ''),
        sizes: sizes,
        sizesText: patternDetail.size || (sizes.length ? sizes.join('、') : '-'),
        operationType: operationType,
        operationLabel: operationLabel,
        operationOptions: rawOptions,
        requiresWarehouseInput: requiresWarehouseInput,
        requiresReviewBeforeInbound: requiresReviewBeforeInbound,
        reviewApproved: reviewApproved,
        designer: data.designer || patternDetail.designer || '-',
        patternDeveloper: data.patternDeveloper || patternDetail.patternDeveloper || '-',
        deliveryTime: patternDetail.deliveryTime || '-',
        deliveryTimeShort: this._formatDeliveryShort(patternDetail.deliveryTime),
        coverImage: getAuthedImageUrl(patternDetail.coverImage || patternDetail.styleImage || ''),
        styleImage: getAuthedImageUrl(patternDetail.styleImage || patternDetail.coverImage || ''),
        styleName: patternDetail.styleName || data.styleName || '',
        category: patternDetail.category || data.category || '',
        customer: patternDetail.customer || data.customer || '',
        source: patternDetail.developmentSourceType || data.developmentSourceType || '',
        categoryLabel: displayCategory(patternDetail.category || data.category || '') || patternDetail.category || data.category || '',
        sourceLabel: SOURCE_LABELS[patternDetail.developmentSourceType || data.developmentSourceType || ''] || patternDetail.developmentSourceType || data.developmentSourceType || '',
        submitLabel: submitLabel,
        remark: '',
        reviewResult: 'PASS',
        hasProcessSystem: !!data.hasProcessSystem,
        scannedQtyMap: data.scannedQtyMap || {},
        taskQuantity: data.taskQuantity || 0,
        orderId: data.orderId || '',
        orderNo: data.orderNo || '',
        stageGroups: data.stageGroups || [],
      },
      processList: processList,
    });
    this._refreshQtyHint();

    // Process size/color matrix for table display + aggregated text (matching PC端 cardSizeQuantity.ts)
    const matrix = patternDetail.sizeColorMatrix;
    const matrixSizes = (matrix && Array.isArray(matrix.sizes) && matrix.sizes.length > 0)
      ? matrix.sizes
      : (matrix && Array.isArray(matrix.commonSizes) ? matrix.commonSizes : []);
    const matrixItems = [];
    if (matrix && Array.isArray(matrix.matrixRows)
        && matrixSizes.length > 0 && matrix.matrixRows.length > 0) {
      const matrixRows = matrix.matrixRows.map(row => {
        const quantities = Array.isArray(row.quantities) ? row.quantities : [];
        return {
          color: row.color || '',
          quantities: quantities,
          rowTotal: quantities.reduce((s, q) => s + (Number(q) || 0), 0),
        };
      });
      const grandTotal = matrixRows.reduce((s, r) => s + r.rowTotal, 0);

      // Build aggregated items (replicating PC端 buildStyleMatrixItems logic)
      matrix.matrixRows.forEach(function(row) {
        const color = row.color || '';
        const qtys = Array.isArray(row.quantities) ? row.quantities : [];
        matrixSizes.forEach(function(size, idx) {
          const qty = Number(qtys[idx]) || 0;
          if (size && qty > 0) {
            matrixItems.push({ color: color, size: size, quantity: qty });
          }
        });
      });

      const matrixUpdate = {
        'detail.hasMatrix': true,
        'detail.matrixSizes': matrixSizes,
        'detail.matrixRows': matrixRows,
        'detail.matrixTotal': grandTotal,
        'detail.maxQuantity': grandTotal > 0 ? grandTotal : (this.data.detail.maxQuantity || 1),
      };

      if (matrixItems.length > 0) {
        const uniqueColors = [];
        matrixItems.forEach(function(item) {
          if (item.color && uniqueColors.indexOf(item.color) === -1) {
            uniqueColors.push(item.color);
          }
        });
        matrixUpdate['detail.colorText'] = uniqueColors.join(' / ');
        matrixUpdate['detail.sizeText'] = matrixItems.map(function(i) { return i.size; }).join(' / ');
        matrixUpdate['detail.quantityText'] = matrixItems.map(function(i) { return String(i.quantity); }).join(' / ');
        matrixUpdate['detail.totalQuantity'] = grandTotal;
        // D-312：多色样衣可选颜色——领取/报工表单按颜色区分，单色样衣自动隐藏
        matrixUpdate['detail.colorOptions'] = uniqueColors;
        if (uniqueColors.length > 0) {
          const curColor = this.data.detail.color || '';
          if (uniqueColors.indexOf(curColor) === -1) {
            matrixUpdate['detail.color'] = uniqueColors[0];
          }
        }
      }

      this.setData(matrixUpdate);
    }

    // 构建 SKU 列表用于多色多码选择
    if (matrixItems.length > 0 || (data.orderItems && data.orderItems.length > 0)) {
      const skuItems = matrixItems.length > 0 ? matrixItems : (data.orderItems || []);
      const normalized = SKUProcessor.normalizeOrderItems(skuItems, data.orderNo, data.styleNo);
      const formItems = SKUProcessor.buildSKUInputList(normalized);
      // D-383：数量**不预设默认值**——一个版可能由多人分批生产，每人实际完成件数各不相同，
      // 预设 1 件会让记录失真（与 PC 端统一：数量一律由操作人按实际件数填写）。
      // 提交时会自动跳过未填数量的行。
      formItems.forEach(function(item) {
        item.defaultQuantity = 1;
        item.inputQuantity = '';
      });
      const summary = SKUProcessor.getSummary(formItems);
      // D-379：按颜色聚合件数，供「领取时多色勾选」预填每色数量
      const colorQtyMap = {};
      formItems.forEach(function (item) {
        const c = String(item.color || '').trim();
        if (c) {
          colorQtyMap[c] = (colorQtyMap[c] || 0) + (Number(item.totalQuantity) || 0);
        }
      });
      this.setData({ skuList: formItems, summary: summary, colorQtyMap: colorQtyMap });
    }

    this._loadWarehouseOptions();
  },

  onUnload() {
    const app = getApp();
    if (app.globalData) {
      app.globalData.patternScanData = null;
    }
  },

  /**
   * 格式化交期为短日期（MM-DD），数据来自API的deliveryTime字段
   */
  _formatDeliveryShort(dateStr) {
    if (!dateStr || dateStr === '-') return '';
    var s = String(dateStr).trim();
    // 尝试解析日期
    var d = new Date(s.replace(/-/g, '/'));
    if (isNaN(d.getTime())) {
      // 尝试只取日期部分
      var parts = s.substring(0, 10).split('-');
      if (parts.length === 3) return parts[1] + '-' + parts[2];
      return '';
    }
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  },

  // ---- 事件处理 ----

  /**
   * 工序列表构建：onLoad 与刷新共用
   */
  _buildProcessList(rawOptions) {
    const list = Array.isArray(rawOptions) ? rawOptions : [];
    return list.map(function(opt) {
      const procStatus = String(opt.status || 'PENDING').toUpperCase();
      return {
        processName: opt.processName || opt.label || opt.value,
        progressStage: opt.progressStage || '',
        scanType: opt.scanType || 'production',
        unitPrice: opt.unitPrice != null ? opt.unitPrice : (opt.price != null ? opt.price : null),
        status: procStatus,
        statusLabel: procStatus === 'COMPLETED' ? '已完成'
          : procStatus === 'CLAIMED' ? (opt.claimedByMe ? '生产中(我)' : '生产中') : '待领取',
        claimedBy: opt.claimedBy || '',
        claimedByMe: !!opt.claimedByMe,
        isWarehouse: opt.value === 'WAREHOUSE_IN',
        isReview: opt.value === 'REVIEW',
        value: opt.value,
      };
    });
  },

  /**
   * 领取/报工成功后原地刷新工序状态（不退出页面，用户立即看到状态流转与领取人）
   */
  async _refreshProcessList() {
    try {
      const res = await api.production.getPatternProcessConfig(this.data.detail.patternId);
      const config = (res && (res.data || res)) || [];
      const list = Array.isArray(config) ? config : [];
      if (list.length > 0) {
        const newList = this._buildProcessList(list);
        const allDone = newList.length > 0 && newList.every(p => p.status === 'COMPLETED');
        this.setData({
          processList: newList,
          selectedProcess: null,
          claimMode: false,
          processNextHint: allDone ? '工序已全部完成，请返回样衣详情完成样衣审核与入库' : '',
        });
      }
    } catch (e) {
      console.warn('[样板页] 刷新工序列表失败', e);
    }
  },

  onColorChipTap(e) {
    const color = e.currentTarget.dataset.color;
    if (!color) return;
    this.setData({ 'detail.color': color });
    this._refreshQtyHint();
  },

  /**
   * MES 报工模型：领取工序（行内按钮）
   * D-173：点「领取」进入领取表单（录入本次计划制作数量），填完再提交；
   * 防重复领取：前端按状态禁用（他人 CLAIMED 不可点），后端 validateProcessClaim 兜底
   */
  onClaimProcess(e) {
    const idx = e.currentTarget.dataset.index;
    const proc = this.data.processList[idx];
    if (!proc || this.data.loading) return;

    if (proc.status === 'COMPLETED') {
      toast.info('该工序已完成');
      return;
    }
    if (proc.status === 'CLAIMED' && !proc.claimedByMe) {
      // D-312：多色样衣他人已领某色，仍可进入领取表单选择其他颜色（单色时后端兜底拦截）
      const colorOpts = this.data.detail.colorOptions || [];
      if (colorOpts.length <= 1) {
        toast.warning('工序【' + proc.processName + '】已由 ' + (proc.claimedBy || '他人') + ' 领取生产中');
        return;
      }
      toast.info('该工序已有他人领取，请选择其他颜色领取');
    }
    if (proc.status === 'CLAIMED' && proc.claimedByMe) {
      // D-379：多色样衣可能只领了部分颜色，允许继续加领其他颜色
      // （重复勾选已领颜色时后端按「工序+颜色」幂等短路，直接返回既有记录，不会产生重复 CLAIM）
      const claimedColorOpts = this.data.detail.colorOptions || [];
      if (claimedColorOpts.length <= 1) {
        toast.info('你已领取该工序，请完成报工');
        return;
      }
      toast.info('你已领取部分颜色，可继续勾选其他颜色加领');
    }

    // 进入领取表单：D-379 改为按颜色勾选（每色一行：勾选 + 数量），不再只有一个总数
    const claimColors = this._buildClaimColors();
    this.setData({
      selectedProcess: proc,
      claimMode: true,
      'detail.operationType': 'CLAIM',
      'detail.processName': proc.processName,
      'detail.operationLabel': proc.processName,
      'detail.submitLabel': '领取工序',
      'detail.requiresWarehouseInput': false,
      'detail.requiresReviewBeforeInbound': false,
      'detail.quantity': 1,
      'detail.remark': '',
      claimColors: claimColors,
    });
    this._refreshClaimColorSummary();
    this._refreshQtyHint();
  },

  /**
   * D-379：构建领取用的颜色勾选列表
   * 有几个颜色就显示几行；单色样衣也给一行（方便只领部分数量）。
   * 数量默认取该色订单件数（取不到按 1 件），用户可改。
   */
  _buildClaimColors() {
    const d = this.data.detail || {};
    let colors = (d.colorOptions || []).filter(function (c) { return String(c || '').trim(); });
    if (colors.length === 0) {
      const single = String(d.color || '').trim();
      colors = single ? [single] : [];
    }
    const qtyMap = this.data.colorQtyMap || {};
    return colors.map(function (c) {
      const qty = Number(qtyMap[c]);
      return { name: c, qty: (qty > 0 ? qty : 1), checked: false };
    });
  },

  /** D-379：勾选/取消某个颜色 */
  onClaimColorToggle(e) {
    const idx = e.currentTarget.dataset.index;
    const key = 'claimColors[' + idx + '].checked';
    const cur = this.data.claimColors[idx];
    this.setData({ [key]: !cur.checked });
    this._refreshClaimColorSummary();
  },

  /** D-379：修改某个颜色的领取数量 */
  onClaimColorQtyInput(e) {
    const idx = e.currentTarget.dataset.index;
    const val = parseInt(e.detail.value, 10);
    const key = 'claimColors[' + idx + '].qty';
    this.setData({ [key]: (isNaN(val) || val < 0) ? 0 : val });
    this._refreshClaimColorSummary();
  },

  /** D-379：点数量输入框时阻止冒泡（否则会顺带切换该行勾选） */
  onClaimColorQtyTap() {},

  /** D-379：刷新「已选 N 个颜色 · 共 M 件」（WXML 不能调方法，值在 JS 算好挂 data） */
  _refreshClaimColorSummary() {
    const list = this.data.claimColors || [];
    let colorCount = 0;
    let totalQty = 0;
    list.forEach(function (c) {
      if (c.checked) {
        colorCount++;
        totalQty += Number(c.qty) || 0;
      }
    });
    this.setData({ claimColorSummary: { colorCount: colorCount, totalQty: totalQty } });
  },

  /** D-379：全选/清空颜色 */
  onClaimColorSelectAll() {
    const list = (this.data.claimColors || []).map(function (c) { return { name: c.name, qty: c.qty, checked: true }; });
    this.setData({ claimColors: list });
    this._refreshClaimColorSummary();
  },

  onClaimColorClearAll() {
    const list = (this.data.claimColors || []).map(function (c) { return { name: c.name, qty: c.qty, checked: false }; });
    this.setData({ claimColors: list });
    this._refreshClaimColorSummary();
  },

  /**
   * MES 报工模型：选中工序进行报工（本人已领取的工序 / 入库 / 审核）
   */
  onSelectProcess(e) {
    const idx = e.currentTarget.dataset.index;
    const proc = this.data.processList[idx];
    if (!proc) return;

    if (proc.status === 'COMPLETED') {
      toast.info('该工序已完成');
      return;
    }
    if (proc.status === 'CLAIMED' && !proc.claimedByMe) {
      // D-312：多色样衣他人已领某色，报工时可选择自己领取的其他颜色（后端按色绑定领取人兜底）
      const colorOpts = this.data.detail.colorOptions || [];
      if (colorOpts.length <= 1) {
        toast.warning('工序【' + proc.processName + '】已由 ' + (proc.claimedBy || '他人') + ' 领取生产中，不能报工');
        return;
      }
      toast.info('该工序已有他人领取，请选择自己领取的颜色报工');
    }
    if (proc.status === 'PENDING' && !proc.isWarehouse && !proc.isReview) {
      toast.warning('请先领取工序【' + proc.processName + '】，领取后才能报工');
      return;
    }

    // 选中后展示报工表单（数量/仓库/备注）并更新提交按钮语义
    const opType = proc.value || proc.processName;
    this.setData({
      selectedProcess: proc,
      claimMode: false, // D-173：报工模式，非领取
      'detail.operationType': opType,
      'detail.processName': proc.processName,
      'detail.operationLabel': proc.processName,
      'detail.submitLabel': proc.isWarehouse ? '入库' : (proc.isReview ? '审核' : '完成报工'),
      'detail.requiresWarehouseInput': proc.isWarehouse,
      'detail.requiresReviewBeforeInbound': false,
    });
    this._refreshQtyHint();
  },

  onOperationChange(e) {
    if (e.currentTarget.dataset.disabled) return;
    const type = e.currentTarget.dataset.type;
    if (!type) return;

    const options = this.data.detail.operationOptions || [];
    const selected = options.find(item => item.value === type);
    const patternDetail = (getApp().globalData && getApp().globalData.patternScanData
      && (getApp().globalData.patternScanData.detail || getApp().globalData.patternScanData).patternDetail) || {};
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';

    this.setData({
      'detail.operationType': type,
      'detail.operationLabel': (selected && selected.label) || OPERATION_LABELS[type] || '操作',
      'detail.submitLabel': (selected && selected.label) || OPERATION_LABELS[type] || '操作',
      'detail.requiresWarehouseInput': WAREHOUSE_OPERATIONS.has(type),
      'detail.requiresReviewBeforeInbound': type === 'WAREHOUSE_IN' && !reviewApproved,
    });
  },

  /** D-164：数量提示（已报/任务/可报） */
  _refreshQtyHint() {
    const d = this.data.detail || {};
    const taskQty = Number(d.taskQuantity) || 0;
    if (taskQty <= 0) { this.setData({ qtyHint: '' }); return; }
    // D-312：多色样衣按颜色独立报工，后端按色校验；前端无每色已报数据，不显示汇总提示避免误导
    if (d.colorOptions && d.colorOptions.length > 1) {
      this.setData({ qtyHint: '' });
      return;
    }
    const remain = this._remainingQty();
    const proc = this.data.selectedProcess;
    const procName = proc ? (proc.processName || '') : (d.processName || '');
    const key = procName || String(d.operationType || '').toUpperCase();
    const scanned = Math.min((d.scannedQtyMap || {})[key] || 0, taskQty);
    this.setData({ qtyHint: '已报 ' + scanned + ' 件 / 任务 ' + taskQty + ' 件 · 可报 ' + remain + ' 件' });
  },

  _remainingQty() {
    const d = this.data.detail || {};
    const taskQty = Number(d.taskQuantity) || 0;
    if (taskQty <= 0) return 999999;
    const proc = this.data.selectedProcess;
    const procName = proc ? (proc.processName || '') : (d.processName || '');
    // D-164：与后端护栏同钥匙——有工序名按工序名（阶段预算），无则按操作类型
    const key = procName || String(d.operationType || '').toUpperCase();
    const scanned = (d.scannedQtyMap || {})[key] || 0;
    return Math.max(0, taskQty - scanned);
  },

  onQuantityInput(e) {
    const maxQty = this._remainingQty();
    const inputQty = parseInt(e.detail.value, 10) || 0;
    // 如果输入超过剩余可报数量，自动修正
    if (inputQty > maxQty) {
      toast.warning(maxQty <= 0 ? '该工序任务数量已报满' : '数量不能超过剩余可报数量 ' + maxQty + ' 件');
      this.setData({ 'detail.quantity': maxQty });
    } else {
      this.setData({ 'detail.quantity': e.detail.value });
    }
  },

  onSkuInput(e) {
    const idx = e.currentTarget.dataset.index;
    const val = parseInt(e.detail.value, 10) || 0;
    const key = 'skuList[' + idx + '].inputQuantity';
    this.setData({ [key]: val });
    const summary = SKUProcessor.getSummary(this.data.skuList);
    this.setData({ summary: summary });
  },

  onWarehouseInput(e) {
    const value = e.detail.value;
    this.setData({ 'detail.warehouseCode': value });
    // D-172：手动输入的编号与仓库名完全匹配时，自动关联仓库区域并加载库位
    const areaId = this._warehouseAreaMap && this._warehouseAreaMap[value];
    if (areaId) {
      this.setData({
        warehouseAreaId: areaId,
        warehouseLocationCode: '',
        locationOptions: [],
        locationItems: [],
        filteredLocationItems: [],
        locationSearchKey: '',
      });
      this._loadLocationOptions(areaId);
    }
  },

  onRemarkInput(e) {
    this.setData({ 'detail.remark': e.detail.value });
  },

  /* ====== 仓库区域 + 库位选择 ====== */

  async _loadWarehouseOptions() {
    try {
      const res = await api.warehouse.listWarehouseAreas('SAMPLE');
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      const areaMap = {};
      const options = [];
      const sorted = list
        .filter(function(item) { return item.areaName && item.id; })
        .sort(function(a, b) { return (a.sort || a.sortOrder || 0) - (b.sort || b.sortOrder || 0); });
      for (let i = 0; i < sorted.length; i++) {
        const item = sorted[i];
        options.push(item.areaName);
        areaMap[item.areaName] = item.id;
      }
      if (options.length > 0) {
        this.setData({
          warehouseOptions: options,
          filteredWarehouseOptions: this._filterListByKeyword(options, this.data.warehouseSearchKey),
          warehouseLoadEmpty: false,
        });
        this._warehouseAreaMap = areaMap;
      } else {
        // D-172：记录空状态，仓库选择区域显示内联提示（避免用户困惑"选不了仓库"）
        this._warehouseAreaMap = {};
        this.setData({ warehouseLoadEmpty: true });
      }
    } catch (e) {
      console.warn('[PatternPage] 加载仓库选项失败', e);
      this._warehouseAreaMap = {};
      this.setData({ warehouseLoadEmpty: true });
    }
  },

  // D-171：仓库搜索（仓库多时快速定位）
  onWarehouseSearchInput(e) {
    this.setData({
      warehouseSearchKey: e.detail.value,
      filteredWarehouseOptions: this._filterListByKeyword(this.data.warehouseOptions, e.detail.value),
    });
  },

  _filterListByKeyword(list, keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return (list || []).slice();
    return (list || []).filter(function(name) { return String(name).indexOf(kw) !== -1; });
  },

  _filterLocationItems(items, keyword) {
    const kw = String(keyword || '').trim();
    if (!kw) return (items || []).slice();
    return (items || []).filter(function(it) { return String(it.label).indexOf(kw) !== -1; });
  },

  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    const areaId = this._warehouseAreaMap && this._warehouseAreaMap[value];
    this.setData({
      'detail.warehouseCode': value,
      warehouseAreaId: areaId || '',
      warehouseLocationCode: '',
      locationOptions: [],
      locationItems: [],
      filteredLocationItems: [],
      locationSearchKey: '',
    });
    if (areaId) this._loadLocationOptions(areaId);
  },

  onWarehouseClear() {
    this.setData({
      'detail.warehouseCode': '',
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
      locationItems: [],
      filteredLocationItems: [],
      locationSearchKey: '',
    });
  },

  async _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [], locationItems: [], filteredLocationItems: [] });
      this._locationMap = {};
      return;
    }
    try {
      const res = await api.warehouse.listLocations('SAMPLE', areaId);
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      const locMap = {};
      const options = [];
      const items = [];
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const label = item.locationCode || item.locationName || '';
        if (!label) continue;
        // D-171：保留库位已用/容量（后端 listByType 已返回 usedCapacity/capacity）
        const used = Number(item.usedCapacity || 0);
        const capacity = Number(item.capacity || 0);
        const isFull = capacity > 0 && used >= capacity;
        options.push(label);
        locMap[label] = item.locationCode || label;
        items.push({ code: item.locationCode || label, label: label, used: used, capacity: capacity, isFull: isFull });
      }
      this.setData({
        locationOptions: options,
        locationItems: items,
        filteredLocationItems: this._filterLocationItems(items, this.data.locationSearchKey),
      });
      this._locationMap = locMap;
    } catch (e) {
      console.warn('[PatternPage] 加载库位选项失败', e);
      this.setData({ locationOptions: [], locationItems: [], filteredLocationItems: [] });
      this._locationMap = {};
    }
  },

  // D-171：库位搜索（18+库位时快速定位）
  onLocationSearchInput(e) {
    this.setData({
      locationSearchKey: e.detail.value,
      filteredLocationItems: this._filterLocationItems(this.data.locationItems, e.detail.value),
    });
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
    // D-171：满库位拦截，避免超限
    const items = this.data.locationItems || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].label === value && items[i].isFull) {
        toast('库位 ' + value + ' 已满（' + items[i].used + '/' + items[i].capacity + '），请选其他库位');
        return;
      }
    }
    this.setData({ warehouseLocationCode: value });
  },

  onLocationClear() {
    this.setData({ warehouseLocationCode: '' });
  },

  onLocationCodeInput(e) {
    this.setData({ warehouseLocationCode: e.detail.value });
  },

  onReviewResultChange(e) {
    const result = e.currentTarget.dataset.result;
    this.setData({ 'detail.reviewResult': result });
  },

  previewImage() {
    const url = this.data.detail.coverImage;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  goBack() {
    wx.navigateBack();
  },

  // D-173：领取/报工表单取消——回到工序列表（不退出页面）；无表单时才返回上一页
  onCancelForm() {
    if (this.data.selectedProcess) {
      this.setData({ selectedProcess: null, claimMode: false });
      return;
    }
    wx.navigateBack();
  },

  // ---- 提交逻辑（样衣使用独立逻辑，不走菲号系统） ----

  async submitOp() {
    const d = this.data.detail;
    if (this.data.loading) return;

    if (!d.operationType) {
      toast.error('请选择操作工序');
      return;
    }
    const operationType = String(d.operationType).toUpperCase();
    const qty = normalizePositiveInt(d.quantity, 0);
    const remark = String(d.remark || '').trim();

    if (operationType === 'ALL_COMPLETED') {
      toast.info('全部工序已完成');
      return;
    }

    // 样衣有自己独立的父子关系逻辑，不走大货的菲号系统
    // 优先使用工序系统（如果有）；工序系统下的审核/入库走专用接口
    if (d.hasProcessSystem && operationType !== 'REVIEW' && operationType !== 'WAREHOUSE_IN') {
      // D-164：任务数量模式——报工数量不能超过剩余可报（领取CLAIM不受限，领取即整单认领）
      if (operationType !== 'CLAIM' && qty > 0) {
        const remain = this._remainingQty();
        if (qty > remain) {
          toast.error(remain <= 0 ? '该工序任务数量已报满' : '数量超过剩余可报数量 ' + remain + ' 件');
          return;
        }
      }
      return await this._submitProcessScan(d, operationType, qty, remark);
    }

    // 传统样衣流程：领取 → 完成 → 审核 → 入库
    if (operationType !== 'REVIEW' && operationType !== 'COMPLETE' && qty <= 0) {
      toast.error('请输入正确数量');
      return;
    }
    const maxQty = operationType === 'RECEIVE' ? this._remainingQty() : (d.maxQuantity || d.quantity || 999999);
    if (operationType !== 'REVIEW' && operationType !== 'COMPLETE' && qty > maxQty) {
      toast.error(maxQty <= 0 ? '任务数量已报满' : '数量不能超过剩余可报数量 ' + maxQty + ' 件');
      return;
    }
    if (operationType === 'REVIEW' && !remark) {
      toast.error('请填写审核备注');
      return;
    }
    if (WAREHOUSE_OPERATIONS.has(operationType)) {
      if (!String(d.warehouseCode || '').trim()) {
        toast.error('请选择入库仓库');
        return;
      }
      if (!this.data.warehouseAreaId) {
        toast.error('请选择仓库区域');
        return;
      }
      if (!this.data.warehouseLocationCode) {
        toast.error('请选择库位');
        return;
      }
    }

    this.setData({ loading: true });
    try {
      let result;

      if (operationType === 'REVIEW') {
        const reviewResult = d.reviewResult || 'PASS';
        const res = await api.production.reviewPattern(d.patternId, reviewResult, remark);
        const resultMsg = reviewResult === 'PASS' ? '审核通过' : reviewResult === 'REWORK' ? '审核返修，请扫码返修' : '审核已驳回';
        result = res ? { success: true, message: resultMsg } : { success: false, message: '审核提交失败' };

      } else if (operationType === 'COMPLETE') {
        const res = await api.production.completePatternByTask(d.patternId);
        result = res ? { success: true, message: '制作完成' } : { success: false, message: '完成操作失败' };

      } else if (operationType === 'WAREHOUSE_IN') {
        // 入库操作，不再自动审核
        const wiRes = await api.production.warehouseIn(d.patternId, d.warehouseCode || '',
          this.data.warehouseAreaId, this.data.warehouseLocationCode, remark);
        result = wiRes ? { success: true, message: '样衣入库成功' } : { success: false, message: '入库失败' };

      } else if (operationType === 'RECEIVE') {
        // 工序级扫码领取（旧的 receivePattern 端点已删除，统一走 submitPatternScan）
        // 从operationOptions查找到对应工序配置，提取单价/工序名/阶段
        const options = d.operationOptions || [];
        const selectedOpt = options.find(function(o) { return o.value === 'RECEIVE'; });
        const scanUnitPrice = selectedOpt && (selectedOpt.unitPrice != null || selectedOpt.price != null)
          ? (selectedOpt.unitPrice != null ? selectedOpt.unitPrice : selectedOpt.price) : null;
        const scanProcessName = selectedOpt && selectedOpt.processName ? selectedOpt.processName : '领取样板';
        const scanProgressStage = selectedOpt && selectedOpt.progressStage ? selectedOpt.progressStage : '领取';
        const scanRes = await api.production.submitPatternScan({
          patternId: d.patternId,
          operationType: 'RECEIVE',
          operatorRole: 'PLATE_WORKER',
          quantity: qty,
          color: d.color,
          remark: remark,
          unitPrice: scanUnitPrice,
          processName: scanProcessName,
          progressStage: scanProgressStage,
        });
        result = {
          success: true,
          message: (scanRes && scanRes.message) || '领取成功',
          data: scanRes,
        };

      } else {
        // 从operationOptions查找到当前选中工序的配置，提取单价/工序名/阶段
        const options = d.operationOptions || [];
        const selectedOpt = options.find(function(o) { return o.value === operationType; });
        const scanUnitPrice = selectedOpt && (selectedOpt.unitPrice != null || selectedOpt.price != null)
          ? (selectedOpt.unitPrice != null ? selectedOpt.unitPrice : selectedOpt.price) : null;
        const scanProcessName = selectedOpt && selectedOpt.processName
          ? selectedOpt.processName
          : (OPERATION_LABELS[operationType] || operationType);
        const scanProgressStage = selectedOpt && selectedOpt.progressStage ? selectedOpt.progressStage : operationType;
        const scanRes = await api.production.submitPatternScan({
          patternId: d.patternId,
          operationType: operationType,
          operatorRole: 'PLATE_WORKER',
          quantity: qty,
          warehouseCode: d.warehouseCode,
          warehouseAreaId: this.data.warehouseAreaId,
          warehouseLocationCode: this.data.warehouseLocationCode,
          remark: remark,
          unitPrice: scanUnitPrice,
          processName: scanProcessName,
          progressStage: scanProgressStage,
        });
        result = {
          success: true,
          message: (scanRes && scanRes.message) || `${d.operationLabel || '操作'}成功`,
          data: scanRes,
        };
      }

      if (result && result.success) {
        toast.success(result.message || '操作成功');
        this._emitRefresh();
        wx.navigateBack();
      } else {
        toast.error((result && result.message) || '操作失败');
      }
    } catch (e) {
      console.error('[样板页] 提交失败:', e);
      toast.error(e.errMsg || e.message || '提交失败');
    } finally {
      this.setData({ loading: false });
    }
  },

  async _submitProcessScan(d, operationType, qty, remark) {
    const selectedOption = (d.operationOptions || []).find(function(o) { return o.value === operationType; });
    // D-173：领取模式下 operationType=CLAIM 不在 operationOptions 里，工序名取所选工序
    const proc = this.data.selectedProcess;
    const claimMode = !!this.data.claimMode;
    const processName = (claimMode && proc && proc.processName)
      || (selectedOption && selectedOption.processName) || operationType;
    const progressStage = (claimMode && proc && (proc.progressStage || proc.processName))
      || (selectedOption && selectedOption.progressStage) || operationType;
    const scanType = selectedOption && selectedOption.scanType || 'production';

    // D-379：领取模式按颜色勾选——勾选几个颜色就提交几条 CLAIM。
    // 后端幂等钥匙是「工序 + 颜色」（findClaimByProcessAndColor / validateProcessClaim），
    // 不同颜色互不短路，所以逐色提交是安全的；同色拆多码才会被短路吞掉（那仍走报工录入）。
    if (claimMode) {
      const picked = (this.data.claimColors || []).filter(function (c) {
        return c.checked && Number(c.qty) > 0;
      });
      if (picked.length === 0) {
        toast.error('请至少勾选一个颜色并填写数量');
        return;
      }
      this.setData({ loading: true });
      try {
        // D-380：改为批量一次提交——后端在同一个事务里逐色写 CLAIM，任一色校验失败整批回滚，
        // 不会出现"领了 3 个色只成功了 2 个"这种半成品状态。
        const items = picked.map(function (c) {
          return { color: c.name, quantity: Number(c.qty) || 1 };
        });
        await api.production.submitPatternScanBatch({
          patternId: d.patternId,
          operationType: operationType,
          operatorRole: 'PLATE_WORKER',
          remark: remark || '',
          processName: processName,
          progressStage: progressStage,
          warehouseCode: d.warehouseCode,
          warehouseAreaId: this.data.warehouseAreaId,
          warehouseLocationCode: this.data.warehouseLocationCode,
          items: items,
        });
        const names = [];
        for (let j = 0; j < picked.length; j++) names.push(picked[j].name);
        toast.success('已领取【' + processName + '】' + names.join('、'));
        this.setData({ claimColors: [] });
        this._emitRefresh();
        await this._refreshProcessList();
      } catch (e) {
        console.error('[样板页] 多色领取提交失败:', e);
        toast.error((e && (e.errMsg || e.message)) || '领取失败');
      } finally {
        this.setData({ loading: false });
      }
      return;
    }

    // D-173：领取是工序级动作，强制单数量路径（CLAIM 拆多条会因幂等短路丢失色码明细）；
    // 多色多码的色码数量在报工（COMPLETE）时按 SKU 明细录入
    const hasSkuList = !claimMode && this.data.skuList && this.data.skuList.length > 0;
    if (hasSkuList) {
      const validation = SKUProcessor.validateSKUInputBatch(this.data.skuList);
      if (!validation.valid) {
        toast.error((validation.errors && validation.errors[0]) || '请检查输入');
        return;
      }
      if (validation.validList.length === 0) {
        toast.error('请至少输入一个数量');
        return;
      }

      this.setData({ loading: true });
      try {
        // D-380：批量一次提交（原实现按「颜色×码数」逐条发起——外单 20 色 × 8 码 = 160 条并发请求，
        // 小程序并发上限会让请求排队变慢，后端每条独立事务还可能出现"报了一半"的半成品数据）
        const items = validation.validList
          .filter(function (item) { return Number(item.inputQuantity) > 0; })
          .map(function (item) {
            return { color: item.color, size: item.size, quantity: Number(item.inputQuantity) };
          });
        // D-383：数量不再预设默认值，未填数量的行会被跳过；全都没填时给出明确提示
        if (items.length === 0) {
          toast.error('请至少填写一个「本次件数」');
          return;
        }
        const batchRes = await api.production.submitPatternScanBatch({
          patternId: d.patternId,
          operationType: operationType,
          operatorRole: 'PLATE_WORKER',
          remark: remark || '',
          processName: processName,
          progressStage: progressStage,
          warehouseCode: d.warehouseCode,
          warehouseAreaId: this.data.warehouseAreaId,
          warehouseLocationCode: this.data.warehouseLocationCode,
          items: items,
        });
        const savedCount = (batchRes && batchRes.savedCount) || items.length;
        toast.success(((selectedOption && selectedOption.label) || processName) + ' 完成（' + savedCount + '项）');
        this._emitRefresh();
        await this._refreshProcessList();
      } catch (e) {
        console.error('[样板页] 工序扫码提交失败:', e);
        toast.error(e.errMsg || e.message || '工序扫码失败');
      } finally {
        this.setData({ loading: false });
      }
    } else {
      if (qty <= 0) {
        toast.error('请输入正确数量');
        return;
      }
      const maxQty = d.maxQuantity || d.quantity || 999999;
      if (qty > maxQty) {
        toast.error('数量不能超过最大数量 ' + maxQty + ' 件');
        return;
      }

      this.setData({ loading: true });
      try {
        const scanData = {
          orderNo: d.orderNo || '',
          orderId: d.orderId || '',
          bundleNo: d.bundleNo || '01',
          patternId: d.patternId || '',
          operationType: operationType,
          processName: processName,
          progressStage: progressStage,
          scanType: scanType,
          quantity: qty,
          scanCode: d.patternId || '',
          sourceBizType: 'SAMPLE',
          operatorRole: 'PLATE_WORKER',
          remark: remark || '',
        };

        // 多色样衣：非SKU明细路径也要透传颜色，后端按颜色独立累计报工（D-311）
        if (d.color) scanData.color = d.color;

        if (d.warehouseCode) scanData.warehouse = d.warehouseCode;
        if (this.data.warehouseAreaId) scanData.warehouseAreaId = this.data.warehouseAreaId;
        if (this.data.warehouseLocationCode) scanData.warehouseLocationCode = this.data.warehouseLocationCode;

        await api.production.executeScan(scanData);
        toast.success(claimMode
          ? '已领取工序【' + processName + '】，完成后请及时报工'
          : ((selectedOption && selectedOption.label) || processName + ' 完成'));
        this._emitRefresh();
        await this._refreshProcessList();
      } catch (e) {
        console.error('[样板页] 工序扫码提交失败:', e);
        toast.error(e.errMsg || e.message || '工序扫码失败');
      } finally {
        this.setData({ loading: false });
      }
    }
  },

  // ---- 内部工具 ----

  _emitRefresh() {
    triggerDataRefresh('pattern');
  },
});
