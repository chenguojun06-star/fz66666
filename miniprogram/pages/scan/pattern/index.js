/**
 * 样板生产操作页（从弹窗转为独立页面）
 * 数据通过 getApp().globalData.patternScanData 传入
 */
const toast = require('../../../utils/uiHelper').toast;
const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');

// ---- 常量（与 PatternHandler.js 保持一致） ----
const OPERATION_LABELS = {
  RECEIVE: '领取样板',
  PLATE: '车板扫码',
  FOLLOW_UP: '跟单确认',
  COMPLETE: '完成确认',
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

const STATUS_LABELS = {
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  RELEASED: '已发放',
  RECEIVED: '已领取',
};

const SOURCE_LABELS = {
  SELF_DEVELOPED: '自主开发',
  OEM: '来料加工',
  CUSTOMER: '客供',
  LICENSED: '授权款',
};
const CATEGORY_LABELS = {
  WOMAN: '女装',
  MAN: '男装',
  KIDS: '童装',
  SPORT: '运动',
  OUTDOOR: '户外',
  HOME: '家居',
};

function normalizePositiveInt(value, fallback) {
  const num = parseInt(value, 10);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

Page({
  data: {
    detail: {},
    loading: false,
  },

  onLoad() {
    const app = getApp();
    const data = app.globalData && app.globalData.patternScanData;
    if (!data) {
      toast.error('缺少样板数据');
      setTimeout(() => wx.navigateBack(), 300);
      return;
    }

    // 复用 PatternHandler.showPatternConfirmModal 的构建逻辑
    const patternDetail = data.patternDetail || {};
    const rawOptions = Array.isArray(data.operationOptions) ? data.operationOptions : [];
    // 四步扫码：领取 → 完成 → 审核 → 入库（与PC端对齐）
    const status = String(data.status || '').toUpperCase();
    const reviewStatus = String(patternDetail.reviewStatus || '').toUpperCase();
    const reviewResult = String(patternDetail.reviewResult || '').toUpperCase();
    const reviewApproved = reviewStatus === 'APPROVED' || reviewResult === 'APPROVED';

    // 直接使用 PatternScanProcessor 已正确计算好的 operationType，不再从 status 重新推导
    const SUBMIT_LABEL_MAP = {
      RECEIVE: '领取', COMPLETE: '完成', REVIEW: '审核',
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

    this.setData({
      detail: {
        patternId: data.patternId,
        styleNo: data.styleNo,
        color: data.color,
        quantity: normalizePositiveInt(data.quantity, 1),
        warehouseCode: '',
        status: status,
        statusLabel: STATUS_LABELS[status] || data.statusLabel || status || '-',
        statusType: status.toLowerCase().replace('_', ''),
        sizes: sizes,
        sizesText: sizes.length ? sizes.join('/') : '-',
        operationType: operationType,
        operationLabel: operationLabel,
        operationOptions: rawOptions,
        requiresWarehouseInput: requiresWarehouseInput,
        requiresReviewBeforeInbound: requiresReviewBeforeInbound,
        reviewApproved: reviewApproved,
        designer: data.designer || patternDetail.designer || '-',
        patternDeveloper: data.patternDeveloper || patternDetail.patternDeveloper || '-',
        deliveryTime: patternDetail.deliveryTime || '-',
        coverImage: getAuthedImageUrl(patternDetail.coverImage || patternDetail.styleImage || ''),
        styleImage: getAuthedImageUrl(patternDetail.styleImage || patternDetail.coverImage || ''),
        styleName: patternDetail.styleName || data.styleName || '',
        category: patternDetail.category || data.category || '',
        customer: patternDetail.customer || data.customer || '',
        source: patternDetail.developmentSourceType || data.developmentSourceType || '',
        categoryLabel: CATEGORY_LABELS[patternDetail.category || data.category || ''] || patternDetail.category || data.category || '',
        sourceLabel: SOURCE_LABELS[patternDetail.developmentSourceType || data.developmentSourceType || ''] || patternDetail.developmentSourceType || data.developmentSourceType || '',
        submitLabel: submitLabel,
        remark: '',
      },
    });

    // Process size/color matrix for table display + aggregated text (matching PC端 cardSizeQuantity.ts)
    const matrix = patternDetail.sizeColorMatrix;
    if (matrix && Array.isArray(matrix.commonSizes) && Array.isArray(matrix.matrixRows)
        && matrix.commonSizes.length > 0 && matrix.matrixRows.length > 0) {
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
      var items = [];
      matrix.matrixRows.forEach(function(row) {
        var color = row.color || '';
        var qtys = Array.isArray(row.quantities) ? row.quantities : [];
        matrix.commonSizes.forEach(function(size, idx) {
          var qty = Number(qtys[idx]) || 0;
          if (size && qty > 0) {
            items.push({ color: color, size: size, quantity: qty });
          }
        });
      });

      var matrixUpdate = {
        'detail.hasMatrix': true,
        'detail.matrixSizes': matrix.commonSizes,
        'detail.matrixRows': matrixRows,
        'detail.matrixTotal': grandTotal,
      };

      if (items.length > 0) {
        var uniqueColors = [];
        items.forEach(function(item) {
          if (item.color && uniqueColors.indexOf(item.color) === -1) {
            uniqueColors.push(item.color);
          }
        });
        matrixUpdate['detail.colorText'] = uniqueColors.join(' / ');
        matrixUpdate['detail.sizeText'] = items.map(function(i) { return i.size; }).join(' / ');
        matrixUpdate['detail.quantityText'] = items.map(function(i) { return String(i.quantity); }).join(' / ');
        matrixUpdate['detail.totalQuantity'] = grandTotal;
      }

      this.setData(matrixUpdate);
    }
  },

  onUnload() {
    const app = getApp();
    if (app.globalData) {
      app.globalData.patternScanData = null;
    }
  },

  // ---- 事件处理 ----

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

  onQuantityInput(e) {
    this.setData({ 'detail.quantity': e.detail.value });
  },

  onWarehouseInput(e) {
    this.setData({ 'detail.warehouseCode': e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ 'detail.remark': e.detail.value });
  },

  previewImage() {
    const url = this.data.detail.coverImage;
    if (!url) return;
    wx.previewImage({ urls: [url], current: url });
  },

  goBack() {
    wx.navigateBack();
  },

  // ---- 提交逻辑（直接调用 API，不依赖 scanHandler） ----

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

    if (operationType !== 'REVIEW' && qty <= 0) {
      toast.error('请输入正确数量');
      return;
    }
    if ((operationType === 'REVIEW'
        || (operationType === 'WAREHOUSE_IN' && d.requiresReviewBeforeInbound))
        && !remark) {
      toast.error('请填写样衣审核备注');
      return;
    }
    if (WAREHOUSE_OPERATIONS.has(operationType) && !String(d.warehouseCode || '').trim()) {
      toast.error('仓库操作请填写仓位编号');
      return;
    }

    this.setData({ loading: true });
    try {
      const result = await api.production.submitPatternScan({
        patternId: d.patternId,
        operationType: operationType,
        operatorRole: 'PLATE_WORKER',
        quantity: qty,
        warehouseCode: d.warehouseCode,
        remark: d.remark,
      });

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

  // ---- 内部工具 ----

  _emitRefresh() {
    const eventBus = getApp().globalData && getApp().globalData.eventBus;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  },
});
