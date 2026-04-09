const api = require('../../../utils/api');
const { toast } = require('../../../utils/uiHelper');
const { normalizeScanType } = require('../handlers/helpers/ScanModeResolver');

function normalizePositiveInt(value, fallback) {
  fallback = (fallback === undefined) ? 1 : fallback;
  var n = parseInt(value, 10);
  if (!isFinite(n) || n <= 0) return fallback;
  return n;
}

Page({
  data: {
    detail: {},
    processOptions: [],
    selectedNames: [],
    selectedCount: 0,
    selectedAmount: 0,
    quantity: 1,
    warehouseCode: '',
    showWarehouse: false,
    imageInsight: '',
    loading: false
  },

  onLoad() {
    const app = getApp();
    const raw = app.globalData.scanResultData;
    if (!raw) {
      toast.error('数据异常');
      wx.navigateBack();
      return;
    }
    this._scanContext = raw;

    // Build process options
    var processOptions = this._buildProcessOptions(raw);
    if (processOptions.length === 0 && raw.processName) {
      processOptions = [{
        label: raw.processName,
        value: raw.processName,
        scanType: raw.scanType || 'production',
        unitPrice: 0,
        hidePrice: true,
        checked: true
      }];
    }
    var selectedNames = processOptions.filter(function(o) { return o.checked; }).map(function(o) { return o.value; });
    if (selectedNames.length === 0 && processOptions.length > 0) {
      selectedNames = [processOptions[0].value];
      processOptions[0].checked = true;
    }
    var summary = this._buildSummary(processOptions, selectedNames);
    var isWarehouseStage = raw.progressStage === 'warehouse' || raw.progressStage === '入库';

    var coverImage = '';
    if (raw.orderDetail && raw.orderDetail.coverImage) {
      coverImage = raw.orderDetail.coverImage;
    } else if (raw.orderDetail && raw.orderDetail.styleImage) {
      coverImage = raw.orderDetail.styleImage;
    }

    // 辅助：查找多个可能的字段名并格式化为 YYYY-MM-DD
    function pickField(src, keys) {
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (src[k] != null && src[k] !== '') return src[k];
        if (src.orderDetail && src.orderDetail[k] != null && src.orderDetail[k] !== '') return src.orderDetail[k];
      }
      return null;
    }

    function formatYMD(v) {
      if (!v) return '-';
      try {
        // 如果已经是 YYYY-MM-DD 形式或 ISO 字符串，取前 10 位
        if (typeof v === 'string') {
          if (v.length >= 10) return v.substring(0, 10);
          return v;
        }
        var d = new Date(v);
        if (isNaN(d.getTime())) return '-';
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
      } catch (e) {
        return '-';
      }
    }

    var color = pickField(raw, ['color', 'styleColor', 'orderColor', 'colour']);
    var size = pickField(raw, ['size', 'sizeName', 'orderSize']);
    var cuttingDateRaw = pickField(raw, ['cuttingDate', 'cutDate', 'plannedCutDate', 'plannedStartDate', 'cut_date']);
    var deliveryDateRaw = pickField(raw, ['deliveryDate', 'expectedShipDate', 'shipDate', 'plannedShipDate', 'expected_ship_date']);
    var bedNo = pickField(raw, ['bedNo', 'bed_number', 'bed']);
    var displayQuantity = raw.quantity || (raw.orderDetail && (raw.orderDetail.orderQuantity || raw.orderDetail.quantity)) || 0;

    this.setData({
      detail: {
        coverImage: coverImage,
        styleNo: raw.styleNo || (raw.orderDetail && raw.orderDetail.styleNo) || '',
        orderNo: raw.orderNo || '',
        bundleNo: raw.bundleNo || '',
        processName: raw.processName || '',
        progressStage: raw.progressStage || '',
        timeDisplay: raw.timeDisplay || '',
        // 额外展示字段
        color: color || '',
        size: size || '',
        displayQuantity: displayQuantity,
        bedNo: bedNo != null ? String(bedNo) : '-',
        cuttingDateDisplay: formatYMD(cuttingDateRaw),
        deliveryDateDisplay: formatYMD(deliveryDateRaw)
      },
      processOptions: processOptions,
      selectedNames: selectedNames,
      selectedCount: summary.count,
      selectedAmount: summary.amount,
      quantity: normalizePositiveInt(raw.quantity, 1),
      showWarehouse: isWarehouseStage,
      warehouseCode: raw.warehouseCode || ''
    });

    // Async image insight (disabled — API endpoint not available)
    // var styleNo = raw.styleNo || (raw.orderDetail && raw.orderDetail.styleNo);
    // this._fetchImageInsight(styleNo);
  },

  onUnload() {
    getApp().globalData.scanResultData = null;
  },

  _buildProcessOptions(raw) {
    var stageResult = raw.stageResult || {};
    var allProcesses = stageResult.allBundleProcesses || [];
    var scannedArr = stageResult.scannedProcessNames || [];
    var scannedSet = {};
    scannedArr.forEach(function(n) { scannedSet[n] = true; });
    return allProcesses
      .filter(function(p) {
        var name = p.processName || p.name || '';
        return !scannedSet[name] || name === raw.processName;
      })
      .map(function(p) {
        var name = p.processName || p.name || '';
        return {
          label: name,
          value: name,
          scanType: p.scanType || 'production',
          unitPrice: p.unitPrice || 0,
          hidePrice: !p.unitPrice,
          checked: name === raw.processName
        };
      });
  },

  _buildSummary(options, selectedNames) {
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var count = 0, amount = 0;
    options.forEach(function(o) {
      if (selected[o.value]) {
        count++;
        amount += (o.unitPrice || 0);
      }
    });
    return { count: count, amount: Math.round(amount * 100) / 100 };
  },

  // _fetchImageInsight disabled — style-info/list endpoint returns 404
  // async _fetchImageInsight(styleNo) { ... },

  previewImage() {
    var img = this.data.detail.coverImage;
    if (!img) return;
    wx.previewImage({ current: img, urls: [img] });
  },

  onProcessTap(e) {
    var value = e.currentTarget.dataset.value;
    if (!value) return;
    var selectedNames = this.data.selectedNames.slice();
    var idx = selectedNames.indexOf(value);
    if (idx >= 0) {
      if (selectedNames.length <= 1) return;
      selectedNames.splice(idx, 1);
    } else {
      selectedNames.push(value);
    }
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var processOptions = this.data.processOptions.map(function(o) {
      return Object.assign({}, o, { checked: !!selected[o.value] });
    });
    var summary = this._buildSummary(processOptions, selectedNames);
    this.setData({
      selectedNames: selectedNames,
      processOptions: processOptions,
      selectedCount: summary.count,
      selectedAmount: summary.amount
    });
  },

  onWarehouseInput(e) {
    this.setData({ warehouseCode: e.detail.value || '' });
  },

  goBack() {
    wx.navigateBack();
  },

  async submitScanResult() {
    if (this.data.loading) return;
    var raw = this._scanContext;
    var selectedNames = this.data.selectedNames;
    var processOptions = this.data.processOptions;
    var quantity = this.data.quantity;
    var warehouseCode = this.data.warehouseCode;

    if (!raw || selectedNames.length === 0) {
      toast.error('请至少选择一个工序');
      return;
    }
    if (quantity <= 0) {
      toast.error('数量必须大于0');
      return;
    }
    if (this.data.showWarehouse && !warehouseCode.trim()) {
      toast.error('请输入仓库编号');
      return;
    }

    this.setData({ loading: true });
    var selected = {};
    selectedNames.forEach(function(n) { selected[n] = true; });
    var selectedOptions = processOptions.filter(function(o) { return selected[o.value]; });
    var successCount = 0;

    try {
      for (var i = 0; i < selectedOptions.length; i++) {
        var option = selectedOptions[i];
        var scanPayload = Object.assign({}, raw.scanData || {}, {
          scanType: normalizeScanType(raw.progressStage, option.scanType || 'production'),
          processName: option.value,
          quantity: quantity
        });
        if (raw.progressStage === 'quality' || raw.progressStage === '质检') {
          scanPayload.qualityStage = 'confirm';
        }
        if (warehouseCode) {
          scanPayload.warehouseCode = warehouseCode;
        }
        if (raw.isDefectiveReentry) {
          scanPayload.isDefectiveReentry = true;
        }
        var result = await api.production.executeScan(scanPayload);
        if (result && (result.recordId || result.id)) {
          successCount++;
        }
      }
      toast.success('已完成 ' + successCount + ' 个工序扫码');
      this._emitRefresh();
      wx.navigateBack();
    } catch (e) {
      this.setData({ loading: false });
      var msg = this._buildFriendlyError(e);
      wx.showModal({ title: '扫码失败', content: msg, showCancel: false, confirmText: '知道了' });
    }
  },

  _buildFriendlyError(error) {
    if (!error) return '未知错误';
    if (!error.response && !error.status) return '网络不稳定，请检查网络后重试';
    var status = error.status || (error.response && error.response.status);
    if (status === 401) return '登录已过期，请重新登录';
    if (status === 403) return '没有操作权限';
    if (status === 409) return '该记录已提交，请勿重复操作';
    return error.message || error.errMsg || (error.data && error.data.message) || '提交失败，请稍后重试';
  },

  _emitRefresh() {
    var eventBus = getApp().globalData && getApp().globalData.eventBus;
    if (eventBus && typeof eventBus.emit === 'function') {
      eventBus.emit('DATA_REFRESH');
    }
  }
});
