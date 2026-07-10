/**
 * 样板生产操作页（从弹窗转为独立页面）
 * 数据通过 getApp().globalData.patternScanData 传入
 */
const toast = require('../../../utils/uiHelper').toast;
const api = require('../../../utils/api');
const { getAuthedImageUrl } = require('../../../utils/fileUrl');
const { triggerDataRefresh } = require('../../../utils/eventBus');
const SKUProcessor = require('../processors/SKUProcessor');
const { handlePatternScan } = require('../handlers/PatternScanProcessor');

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

const STATUS_LABELS = {
  // 通用流程
  PENDING: '待处理',
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  RELEASED: '已发放',
  RECEIVED: '已领取',
  ENABLED: '启用',
  ACTIVE: '启用',
  DISABLED: '已停用',
  INACTIVE: '已停用',
  WAREHOUSE_IN: '已入库',
  WAREHOUSE_OUT: '已出库',
  REVIEW_PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已驳回',
  CANCELLED: '已取消',
  CANCELED: '已取消',
  ARCHIVED: '已归档',
  CLOSED: '已关闭',
  DELETED: '已删除',
  CREATED: '已创建',
};
function _statusToCN(status) {
  if (!status) return '';
  const s = String(status).toUpperCase().replace(/-/g, '_');
  return STATUS_LABELS[s] || String(status);
}

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
    skuList: [],
    summary: {},
    loading: false,
    warehouseOptions: [],
    warehouseAreaId: '',
    warehouseLocationCode: '',
    locationOptions: [],
    reviewImages: [],
    maxImages: 9,
    // 视图模式：loading(加载中) | select(工序选择) | operate(操作确认)
    viewMode: 'loading',
    // 工序选择列表（显示工序名称、状态、是否可操作）
    processList: [],
  },

  onLoad(options) {
    const that = this;
    const opts = options || {};
    // 优先读 URL 参数；缺失时从 globalData.patternScanData 兜底（ConfirmModalHandler 跳转时不传 URL 参数）
    let patternId = opts.patternId || '';
    if (!patternId) {
      try {
        const gs = getApp().globalData.patternScanData || {};
        patternId = gs.patternId || (gs.patternDetail && gs.patternDetail.id) || '';
      } catch (_e) { /* ignore */ }
    }

    if (!patternId) {
      toast.error('无效的样衣编号');
      setTimeout(() => { try { wx.navigateBack({ delta: 1 }); } catch (_e) {} }, 300);
      return;
    }

    wx.showLoading({ title: '加载中', mask: true });

    const handler = {
      api: api,
      SCAN_MODE: { PATTERN: 'pattern' },
      _errorResult: function(msg) { return { success: false, message: msg }; },
    };

    // 如果从列表页点击了某个工序，构造 manualScanType 供 handlePatternScan 选择默认工序
    const manualProcessName = opts.processName ? decodeURIComponent(opts.processName) : '';
    const manualProgressStage = opts.progressStage ? decodeURIComponent(opts.progressStage) : '';
    const manualScanType = manualProcessName || manualProgressStage || '';

    // 超时保护：10秒内没有返回则提示失败（避免页面卡死导致 navigateTo 也超时）
    let timedOut = false;
    let done = false;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      try { wx.hideLoading(); } catch (_e) { /* ignore */ }
      toast.error('加载超时，请重试');
      if (!that.data || !that.data.viewMode) {
        try {
          wx.navigateTo && wx.navigateBack({ delta: 1 });
        } catch (_e) { /* ignore */ }
      }
    }, 10000);

    function finish() {
      if (done) return;
      done = true;
      if (timedOut) return;
      try { clearTimeout(timeoutTimer); } catch (_e) { /* ignore */ }
      try { wx.hideLoading(); } catch (_e) { /* ignore */ }
    }

    handlePatternScan(handler, { patternId: patternId, scanCode: patternId }, manualScanType)
      .then(function(result) {
        if (timedOut) return;
        if (!result || !result.success) {
          finish();
          toast.error(result && result.message ? result.message : '加载失败');
          setTimeout(() => { try { wx.navigateBack({ delta: 1 }); } catch (_e) {} }, 500);
          return;
        }

        const data = result.data || {};
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.patternScanData = data;
        }

        // 从 data 中提取标准化的基础信息（已经由 Processor 做了多字段兼容）
        const sizesArr = data.sizes || [];
        const sizesText = sizesArr.length ? sizesArr.join('/') : (data.size ? String(data.size) : '-');

        // 构建工序选择列表（全部开放，不上锁，过滤已完成的）
        const rawOptions = Array.isArray(data.operationOptions) ? data.operationOptions : [];
        const processList = rawOptions
          .filter(function(opt) { return !opt.completed; }) // 已完成的不显示
          .map(function(opt) {
            const numPrice = Number(opt.unitPrice != null ? opt.unitPrice : (opt.price != null ? opt.price : 0)) || 0;
            return {
              value: opt.value,
              name: opt.label || opt.processName || opt.value,
              checked: false,
              processName: opt.processName || opt.value,
              progressStage: opt.progressStage || opt.value,
              scanType: opt.scanType || 'production',
              unitPrice: numPrice,
              unitPriceText: numPrice > 0 ? numPrice.toFixed(2) : '',
            };
          });

        // 判断视图模式
        const hasDirectProcess = !!manualScanType;

        if (processList.length === 0) {
          finish();
          toast.success('所有工序已完成');
          setTimeout(() => { try { wx.navigateBack({ delta: 1 }); } catch (_e) {} }, 500);
          return;
        }

        if (hasDirectProcess) {
          finish();
          // 直接进入操作视图
          that._buildOperateView(data, manualScanType);
        } else {
          finish();
          // 显示工序选择
          that.setData({
            viewMode: 'select',
            processList: processList,
            selectedCount: 0,
            detail: {
              patternId: data.patternId,
              styleNo: data.styleNo || data.patternId,
              styleName: data.styleName || '',
              color: data.color || '',
              size: data.size || '',
              sizes: sizesArr,
              sizesText: sizesText,
              quantity: data.quantity || 0,
              coverImage: getAuthedImageUrl(data.cover || data.coverImage || (data.patternDetail && data.patternDetail.coverImage) || ''),
              deliveryTime: data.deliveryTime || (data.patternDetail && data.patternDetail.deliveryTime) || '',
            },
          });
        }
      })
      .catch(function(err) {
        if (timedOut) return;
        finish();
        console.error('[PatternPage] 加载失败:', err);
        toast.error('加载失败，请重试');
        setTimeout(() => { try { wx.navigateBack({ delta: 1 }); } catch (_e) {} }, 500);
      });
  },

  // 工序 chip 点击（多选切换）
  onProcessChipTap(e) {
    const value = e.currentTarget.dataset.value;
    if (!value) return;
    const processList = (this.data.processList || []).map(function(p) {
      if (p.value === value) p.checked = !p.checked;
      return p;
    });
    const checkedItems = processList.filter(function(p) { return p.checked; });
    const selectedCount = checkedItems.length;
    const totalAmount = checkedItems.reduce(function(sum, p) { return sum + (Number(p.unitPrice) || 0); }, 0);
    const totalAmountText = totalAmount > 0 ? totalAmount.toFixed(2) : '';
    this.setData({ processList: processList, selectedCount: selectedCount, totalAmountText: totalAmountText });
  },

  // 确认选择，进入操作页（取第一个选中的工序）
  onConfirmProcess() {
    const checked = (this.data.processList || []).filter(function(p) { return p.checked; });
    if (checked.length === 0) {
      toast.error('请至少选择一个工序');
      return;
    }

    // 从 globalData 取出之前的完整数据，重新构建操作视图
    const app = getApp();
    const data = app.globalData && app.globalData.patternScanData;
    if (!data) {
      toast.error('数据已丢失，请重试');
      wx.navigateBack();
      return;
    }

    // 单选直接进入操作页；多选暂取第一个（后续可扩展批量提交）
    this._buildOperateView(data, checked[0].processName || checked[0].value);
  },

  // 构建操作视图（原 onLoad 的核心逻辑）
  _buildOperateView(data, preferredProcess) {
    const patternDetail = data.patternDetail || {};
    const rawOptions = Array.isArray(data.operationOptions) ? data.operationOptions : [];
    const status = String(data.status || '').toUpperCase();

    // 从 data（已由 Processor 做了多字段兼容）中提取基础字段
    const colorVal = data.color || patternDetail.color || '';
    const sizeVal = data.size || patternDetail.size || '';
    const quantityVal = data.quantity || patternDetail.quantity || 0;
    const styleNoVal = data.styleNo || patternDetail.styleNo || data.patternId || '';
    const styleNameVal = data.styleName || patternDetail.styleName || '';
    const sizesArr = data.sizes || patternDetail.sizes || [];
    const coverVal = data.cover || patternDetail.coverImage || patternDetail.styleImage || '';

    // 匹配用户指定的工序，如果没匹配到 → 用第一个可操作的
    let selected = null;
    if (preferredProcess) {
      const p = preferredProcess;
      selected = rawOptions.find(function(o) {
        return o.value === p || o.processName === p || (o.label && o.label === p);
      });
    }
    if (!selected) {
      selected = rawOptions.find(function(o) { return o.canOperate; }) || rawOptions[0];
    }

    const SUBMIT_LABEL_MAP = {
      RECEIVE: '领取', COMPLETE: '完成', REWORK: '返修完成', REVIEW: '审核',
      WAREHOUSE_IN: '入库', WAREHOUSE_OUT: '出库', WAREHOUSE_RETURN: '归还',
      PROCUREMENT: '采购', CUTTING: '裁剪', SECONDARY: '二次工艺',
      SEWING: '车缝', TAIL: '尾部',
    };
    const operationType = String(selected.value || '').toUpperCase() || 'RECEIVE';
    const operationLabel = selected.label || '未知';
    const scanType = String(selected.scanType || '').toLowerCase();
    const requiresWarehouseInput = data.hasProcessSystem
      ? scanType === 'warehouse' || scanType === 'warehouse_in'
      : ['WAREHOUSE_IN', 'WAREHOUSE_OUT', 'WAREHOUSE_RETURN'].indexOf(operationType) > -1;
    const submitLabel = SUBMIT_LABEL_MAP[operationType] || operationLabel;

    // 状态颜色：与 PC 端一致的 color class 映射
    let statusColor = 'default';
    if (/PENDING|WAITING/.test(status)) statusColor = 'warning';
    else if (/IN_PROGRESS|ACTIVE/.test(status)) statusColor = 'processing';
    else if (/COMPLETED|DONE|FINISHED|CLOSED/.test(status)) statusColor = 'success';
    else if (/REJECTED|FAILED|ERROR|SCRAPPED|CANCELLED/.test(status)) statusColor = 'error';

    this.setData({
      viewMode: 'operate',
      detail: {
        patternId: data.patternId,
        styleNo: styleNoVal,
        styleName: styleNameVal,
        color: colorVal,
        size: sizeVal,
        sizes: sizesArr,
        sizesText: sizesArr.length ? sizesArr.join('/') : (sizeVal ? String(sizeVal) : ''),
        quantity: normalizePositiveInt(quantityVal, 1),
        maxQuantity: normalizePositiveInt(quantityVal, 1),
        warehouseCode: '',
        status: status,
        statusLabel: _statusToCN(status),
        statusColor: statusColor,
        operationType: operationType,
        operationLabel: operationLabel,
        operationOptions: rawOptions,
        requiresWarehouseInput: requiresWarehouseInput,
        requiresReviewBeforeInbound: operationType === 'WAREHOUSE_IN',
        designer: patternDetail.designer || '',
        patternDeveloper: patternDetail.patternDeveloper || '',
        deliveryTime: patternDetail.deliveryTime || '',
        coverImage: getAuthedImageUrl(coverVal),
        hasProcessSystem: !!data.hasProcessSystem,
        submitLabel: submitLabel,
        remark: '',
      },
    });

    // 处理颜色/码数矩阵（如果有）
    const matrix = patternDetail.sizeColorMatrix;
    if (matrix && Array.isArray(matrix.matrixRows) && matrix.matrixRows.length > 0) {
      const matrixSizes = Array.isArray(matrix.sizes) ? matrix.sizes : [];
      const matrixRowsFormatted = matrix.matrixRows.map(function(row) {
        const qtyList = Array.isArray(row.quantities) ? row.quantities : [];
        const rowTotal = qtyList.reduce(function(s, q) { return s + (Number(q) || 0); }, 0);
        return {
          color: row.color || '',
          quantities: qtyList,
          rowTotal: rowTotal,
        };
      });
      const grandTotal = matrixRowsFormatted.reduce(function(s, r) { return s + r.rowTotal; }, 0);

      this.setData({
        'detail.hasMatrix': true,
        'detail.matrixSizes': matrixSizes,
        'detail.matrixRows': matrixRowsFormatted,
        'detail.matrixTotal': grandTotal,
        'detail.maxQuantity': grandTotal > 0 ? grandTotal : this.data.detail.maxQuantity,
      });
    }

    this._loadWarehouseOptions();
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
    const maxQty = this.data.detail.maxQuantity || this.data.detail.quantity || 999999;
    const inputQty = parseInt(e.detail.value, 10) || 0;
    // 如果输入超过最大值，自动修正
    if (inputQty > maxQty) {
      toast.info('数量不能超过最大数量 ' + maxQty + ' 件');
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
    this.setData({ 'detail.warehouseCode': e.detail.value });
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
      if (list.length > 0) {
        const areaMap = {};
        const options = [];
        const sorted = list
          .filter(function(item) { return item.areaName && item.id; })
          .sort(function(a, b) { return (a.sort || 0) - (b.sort || 0); });
        for (let i = 0; i < sorted.length; i++) {
          const item = sorted[i];
          options.push(item.areaName);
          areaMap[item.areaName] = item.id;
        }
        if (options.length > 0) {
          this.setData({ warehouseOptions: options });
          this._warehouseAreaMap = areaMap;
        }
      }
    } catch (e) {
      console.warn('[PatternPage] 加载仓库选项失败', e);
    }
  },

  onWarehouseChipTap(e) {
    const value = e.currentTarget.dataset.value;
    const areaId = this._warehouseAreaMap && this._warehouseAreaMap[value];
    this.setData({
      'detail.warehouseCode': value,
      warehouseAreaId: areaId || '',
      warehouseLocationCode: '',
      locationOptions: [],
    });
    if (areaId) this._loadLocationOptions(areaId);
  },

  onWarehouseClear() {
    this.setData({
      'detail.warehouseCode': '',
      warehouseAreaId: '',
      warehouseLocationCode: '',
      locationOptions: [],
    });
  },

  async _loadLocationOptions(areaId) {
    if (!areaId) {
      this.setData({ locationOptions: [] });
      this._locationMap = {};
      return;
    }
    try {
      const res = await api.warehouse.listLocations('SAMPLE', areaId);
      const data = res?.data || res;
      const list = Array.isArray(data) ? data : [];
      if (list.length > 0) {
        const locMap = {};
        const options = [];
        for (let i = 0; i < list.length; i++) {
          const item = list[i];
          const label = item.locationCode || item.locationName || '';
          if (label) {
            options.push(label);
            locMap[label] = item.locationCode || label;
          }
        }
        this.setData({ locationOptions: options });
        this._locationMap = locMap;
      } else {
        this.setData({ locationOptions: [] });
        this._locationMap = {};
      }
    } catch (e) {
      console.warn('[PatternPage] 加载库位选项失败', e);
      this.setData({ locationOptions: [] });
      this._locationMap = {};
    }
  },

  onLocationChipTap(e) {
    const value = e.currentTarget.dataset.value;
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

  previewReviewImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.reviewImages || [];
    if (images.length === 0 || index >= images.length) return;
    wx.previewImage({
      urls: images,
      current: images[index],
    });
  },

  chooseReviewImage() {
    const images = this.data.reviewImages || [];
    const remaining = this.data.maxImages - images.length;
    if (remaining <= 0) {
      toast.info('最多只能上传' + this.data.maxImages + '张图片');
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePaths = (res.tempFiles || []).map(f => f.tempFilePath);
        if (tempFilePaths.length === 0) return;

        this._uploadImages(tempFilePaths);
      },
      fail: (err) => {
        console.error('[PatternPage] 选择图片失败:', err);
        toast.error('选择图片失败');
      },
    });
  },

  _uploadImages(filePaths) {
    const uploadPromises = filePaths.map((filePath) => {
      return new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${getApp().globalData.baseUrl}/api/common/upload/image`,
          filePath: filePath,
          name: 'file',
          success: (res) => {
            try {
              const data = JSON.parse(res.data);
              if (data && data.code === 200 && data.data) {
                resolve(data.data);
              } else {
                reject(new Error(data?.message || '上传失败'));
              }
            } catch (e) {
              reject(e);
            }
          },
          fail: (err) => {
            reject(err);
          },
        });
      });
    });

    toast.loading('上传中...');
    Promise.all(uploadPromises)
      .then((results) => {
        const newImages = results.filter((url) => url && typeof url === 'string');
        const updatedImages = [...this.data.reviewImages, ...newImages];
        this.setData({ reviewImages: updatedImages });
        toast.success('上传成功');
      })
      .catch((err) => {
        console.error('[PatternPage] 图片上传失败:', err);
        toast.error('上传失败');
      });
  },

  removeReviewImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.reviewImages || [];
    if (index >= images.length) return;
    const updatedImages = images.filter((_, i) => i !== index);
    this.setData({ reviewImages: updatedImages });
  },

  goBack() {
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
    // 优先使用工序系统（如果有），否则使用传统样衣流程
    if (d.hasProcessSystem) {
      return await this._submitProcessScan(d, operationType, qty, remark);
    }

    // 传统样衣流程：领取 → 完成 → 审核 → 入库
    if (operationType !== 'REVIEW' && operationType !== 'COMPLETE' && qty <= 0) {
      toast.error('请输入正确数量');
      return;
    }
    const maxQty = d.maxQuantity || d.quantity || 999999;
    if (operationType !== 'REVIEW' && operationType !== 'COMPLETE' && qty > maxQty) {
      toast.error('数量不能超过最大数量 ' + maxQty + ' 件');
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
        const images = this.data.reviewImages || [];
        const res = await api.production.reviewPattern(d.patternId, reviewResult, remark, images);
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
        const receiveExtra = {};
        if (d.color) receiveExtra.color = d.color;
        if (d.size) receiveExtra.size = d.size;
        if (qty > 0) receiveExtra.quantity = qty;
        const rcvRes = await api.production.receivePattern(d.patternId, remark, receiveExtra);
        result = rcvRes ? { success: true, message: '领取成功' } : { success: false, message: '领取样板失败' };

      } else {
        const scanRes = await api.production.submitPatternScan({
          patternId: d.patternId,
          operationType: operationType,
          operatorRole: 'PLATE_WORKER',
          quantity: qty,
          size: d.size,
          color: d.color,
          warehouseCode: d.warehouseCode,
          warehouseAreaId: this.data.warehouseAreaId,
          warehouseLocationCode: this.data.warehouseLocationCode,
          remark: remark,
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
    const processName = selectedOption && selectedOption.processName || operationType;
    const progressStage = selectedOption && selectedOption.progressStage || operationType;
    const scanType = selectedOption && selectedOption.scanType || 'production';

    // 检查是否有多色多码选择
    const hasSkuList = this.data.skuList && this.data.skuList.length > 0;
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
        const requests = SKUProcessor.generateScanRequests(
          validation.validList,
          d.orderNo,
          d.styleNo,
          progressStage,
          {
            scanCode: d.patternId || '',
            sourceBizType: 'SAMPLE',
            operatorRole: 'PLATE_WORKER',
            orderId: d.orderId,
            processName: processName,
            styleNo: d.styleNo || '',
            color: d.color || '',
            size: d.size || '',
            remark: remark || '',
          },
        );

        // 添加仓库信息到每个请求
        requests.forEach(function(req) {
          req.scanType = scanType;
          // 样衣没有菲号概念，使用 SAMPLE 标识，避免与大货菲号混淆
          req.bundleNo = d.bundleNo || 'SAMPLE';
          if (!req.styleNo && d.styleNo) req.styleNo = d.styleNo;
          if (!req.color && d.color) req.color = d.color;
          if (!req.size && d.size) req.size = d.size;
          if (d.warehouseCode) req.warehouse = d.warehouseCode;
          if (this.data.warehouseAreaId) req.warehouseAreaId = this.data.warehouseAreaId;
          if (this.data.warehouseLocationCode) req.warehouseLocationCode = this.data.warehouseLocationCode;
        }.bind(this));

        const tasks = requests.map(function(req) {
          return api.production.executeScan(req);
        });

        await Promise.all(tasks);
        toast.success((selectedOption && selectedOption.label) || processName + ' 完成（' + tasks.length + '条）');
        this._emitRefresh();
        wx.navigateBack();
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
          // 样衣没有菲号概念，使用 SAMPLE 标识，避免与大货菲号混淆
          bundleNo: d.bundleNo || 'SAMPLE',
          processName: processName,
          progressStage: progressStage,
          scanType: scanType,
          quantity: qty,
          scanCode: d.patternId || '',
          sourceBizType: 'SAMPLE',
          operatorRole: 'PLATE_WORKER',
          styleNo: d.styleNo || '',
          color: d.color || '',
          size: d.size || '',
          remark: remark || '',
        };

        if (d.warehouseCode) scanData.warehouse = d.warehouseCode;
        if (this.data.warehouseAreaId) scanData.warehouseAreaId = this.data.warehouseAreaId;
        if (this.data.warehouseLocationCode) scanData.warehouseLocationCode = this.data.warehouseLocationCode;

        await api.production.executeScan(scanData);
        toast.success((selectedOption && selectedOption.label) || processName + ' 完成');
        this._emitRefresh();
        wx.navigateBack();
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
